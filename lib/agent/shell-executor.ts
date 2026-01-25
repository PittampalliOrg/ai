import { spawn, type ChildProcess } from "child_process";

export interface ExecuteResponse {
  exitCode: number;
  result: string;
  stdout: string;
  stderr: string;
}

export interface ExecuteCommandOptions {
  command: string | string[];
  workdir?: string;
  env?: Record<string, string>;
  timeout?: number;
}

const DEFAULT_TIMEOUT = 120; // 2 minutes
const DEFAULT_ENV: Record<string, string> = {
  // Prevents corepack from showing a y/n download prompt which causes the command to hang
  COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
};

/**
 * Execute a shell command locally and return the result
 */
export async function executeCommand(
  options: ExecuteCommandOptions
): Promise<ExecuteResponse> {
  const {
    command,
    workdir = process.cwd(),
    env = {},
    timeout = DEFAULT_TIMEOUT,
  } = options;

  const commandString = Array.isArray(command) ? command.join(" ") : command;

  return new Promise((resolve, reject) => {
    const shellPaths = ["/bin/bash", "/usr/bin/bash", "/bin/sh", "/usr/bin/sh"];
    let lastError: Error | null = null;

    const tryShell = (shellPath: string) => {
      const child: ChildProcess = spawn(shellPath, ["-c", commandString], {
        cwd: workdir,
        env: { ...process.env, ...DEFAULT_ENV, ...env },
        timeout: timeout * 1000,
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("close", (code: number | null) => {
        resolve({
          exitCode: code ?? 0,
          result: stdout || stderr,
          stdout,
          stderr,
        });
      });

      child.on("error", (error: Error) => {
        lastError = error;
        const nextIndex = shellPaths.indexOf(shellPath) + 1;
        if (nextIndex < shellPaths.length) {
          tryShell(shellPaths[nextIndex]);
        } else {
          reject(lastError);
        }
      });
    };

    tryShell(shellPaths[0]);
  });
}

/**
 * Execute a command and throw if it fails
 */
export async function executeCommandOrThrow(
  options: ExecuteCommandOptions
): Promise<ExecuteResponse> {
  const result = await executeCommand(options);
  if (result.exitCode !== 0) {
    throw new Error(
      `Command failed with exit code ${result.exitCode}: ${result.stderr || result.stdout}`
    );
  }
  return result;
}
