/**
 * Agent Workflow Definition
 *
 * 5-node workflow: Clone -> Plan -> Approve -> Execute
 *
 * Sent to the workflow-orchestrator's /api/v2/workflows endpoint.
 * The orchestrator interprets this definition dynamically using
 * planner/* action types which invoke planner-dapr-agent via Dapr.
 *
 * Trigger data expected: { owner, repo, branch, token, task }
 */

export const AGENT_WORKFLOW_DEFINITION = {
  id: "agent-workflow",
  name: "Agent Workflow",
  version: "1.0.0",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
  metadata: {
    description:
      "Clone repository, plan changes with AI, get approval, then execute",
    tags: ["agent", "planner"],
  },
  nodes: [
    {
      id: "trigger-1",
      type: "trigger",
      label: "Start",
      enabled: true,
      position: { x: 0, y: 0 },
      config: {},
    },
    {
      id: "clone-1",
      type: "action",
      label: "Clone Repo",
      description: "Clone the target repository to workspace",
      enabled: true,
      position: { x: 200, y: 0 },
      config: {
        actionType: "planner/clone",
        repositoryOwner: "{{trigger.owner}}",
        repositoryRepo: "{{trigger.repo}}",
        repositoryBranch: "{{trigger.branch}}",
        repositoryToken: "{{trigger.token}}",
      },
    },
    {
      id: "plan-1",
      type: "action",
      label: "Plan",
      description: "AI-powered planning for the requested task",
      enabled: true,
      position: { x: 400, y: 0 },
      config: {
        actionType: "planner/plan",
        featureRequest: "{{trigger.task}}",
        cwd: "{{Clone_Repo.clonePath}}",
      },
    },
    {
      id: "approve-1",
      type: "approval-gate",
      label: "Approve Plan",
      description: "Wait for human approval of the generated plan",
      enabled: true,
      position: { x: 600, y: 0 },
      config: {
        eventName: "plan-approval",
        timeoutSeconds: 86400,
      },
    },
    {
      id: "execute-1",
      type: "action",
      label: "Execute",
      description: "Execute the approved plan",
      enabled: true,
      position: { x: 800, y: 0 },
      config: {
        actionType: "planner/execute",
        plannerWorkflowId: "{{Plan.workflow_id}}",
        cwd: "{{Clone_Repo.clonePath}}",
      },
    },
  ],
  edges: [
    { id: "e-trigger-clone", source: "trigger-1", target: "clone-1" },
    { id: "e-clone-plan", source: "clone-1", target: "plan-1" },
    { id: "e-plan-approve", source: "plan-1", target: "approve-1" },
    { id: "e-approve-execute", source: "approve-1", target: "execute-1" },
  ],
  executionOrder: ["clone-1", "plan-1", "approve-1", "execute-1"],
} as const;
