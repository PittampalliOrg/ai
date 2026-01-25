import {
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
  streamText,
  stepCountIs,
  type UIMessage,
} from "ai";
import { auth } from "@/app/(auth)/auth";
import { getLanguageModel } from "@/lib/ai/providers";
import {
  createShellTool,
  createGrepTool,
  createTextEditorTool,
} from "@/lib/ai/tools/agent";
import {
  saveAgentMessages,
  updateAgentSessionStatus,
  updateAgentSessionSandbox,
  getAgentSession,
} from "@/lib/db/agent-queries";
import { verifyUserExists } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";
import { getRepoAccessToken } from "@/lib/github/app-auth";
import { existsSync } from "fs";
import { join } from "path";
import {
  getSandboxConfig,
  createSandboxContext,
  provisionSandbox,
  releaseSandbox,
  cloneRepositoryInSandbox,
  isRepoClonedInSandbox,
  getSandboxLogs,
  type SandboxContext,
} from "@/lib/sandbox";

export const maxDuration = 300; // 5 minutes for long-running agent tasks

const AGENT_SYSTEM_PROMPT = `You are Open SWE, an autonomous software engineering assistant. You help users with coding tasks by executing shell commands, searching code, and editing files.

## Capabilities
- Execute shell commands (git, npm, build tools, etc.)
- Search code using grep/ripgrep patterns
- View, create, and edit files
- Analyze and fix code issues
- Run tests and debug failures

## Guidelines
1. Always explore the codebase first to understand the structure
2. Make minimal, focused changes
3. Test your changes when possible
4. Explain what you're doing and why
5. If you encounter errors, analyze them and adjust your approach

## Available Tools
- shell: Run shell commands in the repository
- grep: Search for patterns in the codebase
- str_replace_based_edit_tool: View, create, and edit files

Be thorough, methodical, and explain your reasoning as you work.`;

interface AgentRequestBody {
  id: string;
  message?: UIMessage;
  messages?: UIMessage[];
  targetRepository?: {
    owner: string;
    repo: string;
    branch: string;
  };
  repoPath?: string;
  config?: {
    model?: string;
  };
}

export async function POST(request: Request) {
  let requestBody: AgentRequestBody;

  try {
    requestBody = await request.json();
  } catch (_) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  try {
    const { id, message, messages, targetRepository, repoPath, config } =
      requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    // Verify user exists in database before proceeding
    const userExists = await verifyUserExists(session.user.id);
    if (!userExists) {
      console.error(
        `[POST /api/agent] User ${session.user.id} not found in database`
      );
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    // Verify the session exists and belongs to the user
    const agentSession = await getAgentSession({ id });
    if (agentSession && agentSession.userId !== session.user.id) {
      return new ChatSDKError("forbidden:chat").toResponse();
    }

    // Check if this is a tool approval flow (all messages sent)
    const isToolApprovalFlow = Boolean(messages);
    const uiMessages: UIMessage[] = isToolApprovalFlow
      ? messages!
      : message
        ? [message]
        : [];

    // Get sandbox configuration
    const sandboxConfig = getSandboxConfig();
    let sandboxContext: SandboxContext | undefined;

    // Determine the repo path
    let workingRepoPath = repoPath || agentSession?.repoPath;

    // If no repo path, use a default local path based on the target repository
    if (!workingRepoPath && targetRepository) {
      workingRepoPath = join(
        process.env.AGENT_REPOS_PATH || "/tmp/agent-repos",
        targetRepository.owner,
        targetRepository.repo
      );
    }

    // Fallback to current directory if no repo path
    if (!workingRepoPath) {
      workingRepoPath = process.cwd();
    }

    // Provision sandbox if K8s mode is enabled
    if (sandboxConfig.mode === "k8s") {
      try {
        // Update session status to show sandbox provisioning
        await updateAgentSessionSandbox({
          id,
          sandboxStatus: "pending",
        });

        // Provision or get existing sandbox
        const sandboxInfo = await provisionSandbox({ sessionId: id });

        // Update session with sandbox details
        await updateAgentSessionSandbox({
          id,
          sandboxClaimName: sandboxInfo.claimName,
          sandboxPodName: sandboxInfo.podName,
          sandboxNamespace: sandboxInfo.namespace,
          sandboxStatus: "ready",
        });

        // Create sandbox context for tools
        sandboxContext = {
          mode: "k8s",
          sandbox: sandboxInfo,
          repoPath: sandboxInfo.workdir,
        };

        // Clone the repository into the sandbox if targetRepository is provided
        if (targetRepository) {
          const repoDir = `${sandboxInfo.workdir}/${targetRepository.repo}`;

          // Check if repo is already cloned
          const isCloned = await isRepoClonedInSandbox(repoDir, sandboxContext);

          if (!isCloned) {
            console.log(
              `Cloning ${targetRepository.owner}/${targetRepository.repo} into sandbox...`
            );

            // Get the best available token (GitHub App installation token or OAuth)
            let accessToken: string | undefined;
            try {
              const tokenResult = await getRepoAccessToken(
                targetRepository.owner,
                session.accessToken
              );
              accessToken = tokenResult.token;
              console.log(`[Clone] Using ${tokenResult.source} token for ${targetRepository.owner}`);
            } catch (tokenError) {
              console.error("[Clone] Failed to get access token:", tokenError);
            }

            const cloneResult = await cloneRepositoryInSandbox(
              {
                owner: targetRepository.owner,
                repo: targetRepository.repo,
                branch: targetRepository.branch,
                accessToken,
                targetPath: repoDir,
                shallow: true,
              },
              sandboxContext
            );

            if (!cloneResult.success) {
              console.error("Failed to clone repository:", cloneResult.error);
              return Response.json(
                {
                  error: `Failed to clone repository: ${cloneResult.error}`,
                },
                { status: 500 }
              );
            }

            console.log(`Repository cloned to ${cloneResult.path}`);
          }

          // Use the repo directory as the working path
          workingRepoPath = repoDir;
          sandboxContext.repoPath = repoDir;
        } else {
          // Use sandbox workdir as the effective path
          workingRepoPath = sandboxInfo.workdir;
        }
      } catch (error) {
        console.error("Failed to provision sandbox:", error);
        // Update session to show sandbox failure
        await updateAgentSessionSandbox({
          id,
          sandboxStatus: "failed",
        });
        // Continue with local execution as fallback
        sandboxContext = {
          mode: "local",
          repoPath: workingRepoPath,
        };
      }
    } else {
      // Local mode - verify the path exists
      if (!existsSync(workingRepoPath)) {
        return Response.json(
          {
            error: `Repository path not found: ${workingRepoPath}. Please clone the repository first or specify a valid path.`,
          },
          { status: 400 }
        );
      }
      sandboxContext = {
        mode: "local",
        repoPath: workingRepoPath,
      };
    }

    // Create tools with repo and sandbox context
    const shellTool = createShellTool({ repoPath: workingRepoPath, sandboxContext });
    const grepTool = createGrepTool({ repoPath: workingRepoPath, sandboxContext });
    const textEditorTool = createTextEditorTool({ repoPath: workingRepoPath, sandboxContext });

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer }) => {
        // Update session status
        await updateAgentSessionStatus({ id, status: "running" });
        writer.write({ type: "data-status", data: "running" });

        // Send setup logs for sandbox provisioning
        if (sandboxContext?.mode === "k8s" && sandboxContext.sandbox) {
          writer.write({
            type: "data-setup",
            data: {
              phase: "provisioning",
              status: "success",
              message: `Sandbox provisioned: ${sandboxContext.sandbox.podName}`,
              namespace: sandboxContext.sandbox.namespace,
            },
          });

          // Fetch and stream pod initialization logs
          try {
            const podLogs = await getSandboxLogs(
              sandboxContext.sandbox.podName,
              sandboxContext.sandbox.namespace,
              { tailLines: 200 } // Get last 200 lines of init logs
            );

            if (podLogs) {
              // Stream the initialization logs
              writer.write({
                type: "data-setup",
                data: {
                  phase: "init",
                  status: "success",
                  message: "Pod initialization logs",
                  logs: podLogs,
                },
              });
            }
          } catch (logError) {
            console.warn("Could not fetch pod logs:", logError);
            // Non-fatal - continue without logs
          }

          if (targetRepository) {
            writer.write({
              type: "data-setup",
              data: {
                phase: "cloning",
                status: "success",
                message: `Repository cloned: ${targetRepository.owner}/${targetRepository.repo}`,
                branch: targetRepository.branch,
              },
            });
          }

          writer.write({
            type: "data-setup",
            data: {
              phase: "ready",
              status: "success",
              message: `Working directory: ${workingRepoPath}`,
            },
          });

          // Send divider to separate setup from execution
          writer.write({ type: "data-setup-complete", data: {} });
        }

        const modelId =
          config?.model || "anthropic/claude-sonnet-4-5-20250929";

        const systemPrompt =
          AGENT_SYSTEM_PROMPT +
          (targetRepository
            ? `\n\nRepository: ${targetRepository.owner}/${targetRepository.repo}`
            : "") +
          `\nWorking directory: ${workingRepoPath}`;

        const result = streamText({
          model: getLanguageModel(modelId),
          system: systemPrompt,
          messages: await convertToModelMessages(uiMessages),
          tools: {
            shell: shellTool,
            grep: grepTool,
            str_replace_based_edit_tool: textEditorTool,
          },
          stopWhen: stepCountIs(50),
          experimental_telemetry: {
            isEnabled: true,
            functionId: "agent-loop",
            metadata: {
              sessionId: id,
              modelId,
              hasRepository: String(Boolean(targetRepository)),
              ...(targetRepository && {
                repository: `${targetRepository.owner}/${targetRepository.repo}`,
              }),
            },
          },
        });

        result.consumeStream();

        writer.merge(
          result.toUIMessageStream({
            sendReasoning: true,
          })
        );
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        // Debug: Log message parts to see what's being generated
        console.log("[Agent] onFinish - messages:", finishedMessages.map(m => ({
          role: m.role,
          parts: m.parts?.map((p: { type: string; text?: string }) => ({
            type: p.type,
            hasText: !!p.text,
            textPreview: p.text?.substring(0, 100)
          }))
        })));

        // Save messages to database
        if (finishedMessages.length > 0) {
          await saveAgentMessages({
            sessionId: id,
            messages: finishedMessages.map((m) => ({
              id: m.id,
              role: m.role,
              parts: m.parts,
            })),
          });
        }
        await updateAgentSessionStatus({ id, status: "completed" });

        // Release sandbox if in K8s mode
        // Note: We keep the sandbox alive for potential follow-up messages
        // The sandbox will be released when the session is explicitly ended
        // or cleaned up by a background job
      },
      onError: () => {
        // Handle error asynchronously without blocking
        (async () => {
          await updateAgentSessionStatus({ id, status: "error" });

          // Release sandbox on error if in K8s mode
          if (sandboxContext?.mode === "k8s") {
            try {
              await releaseSandbox({ sessionId: id });
              await updateAgentSessionSandbox({
                id,
                sandboxStatus: "released",
              });
            } catch (releaseError) {
              console.error("Failed to release sandbox on error:", releaseError);
            }
          }
        })();

        return "An error occurred while processing your request.";
      },
    });

    return new Response(stream.pipeThrough(new JsonToSseTransformStream()), {
      headers: { "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Agent API error:", error);

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    return new ChatSDKError("offline:chat").toResponse();
  }
}
