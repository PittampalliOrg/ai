import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  title: text("title").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
}, (table) => ({
  userIdIdx: index("idx_chat_userId").on(table.userId),
  createdAtIdx: index("idx_chat_createdAt").on(table.createdAt.desc()),
  userIdCreatedAtIdx: index("idx_chat_userId_createdAt").on(table.userId, table.createdAt.desc()),
}));

export type Chat = InferSelectModel<typeof chat>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const messageDeprecated = pgTable("Message", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  content: json("content").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type MessageDeprecated = InferSelectModel<typeof messageDeprecated>;

export const message = pgTable("Message_v2", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
}, (table) => ({
  chatIdIdx: index("idx_message_chatId").on(table.chatId),
  createdAtIdx: index("idx_message_createdAt").on(table.createdAt.asc()),
  chatIdCreatedAtIdx: index("idx_message_chatId_createdAt").on(table.chatId, table.createdAt.asc()),
  roleIdx: index("idx_message_role").on(table.role),
}));

export type DBMessage = InferSelectModel<typeof message>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const voteDeprecated = pgTable(
  "Vote",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => messageDeprecated.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type VoteDeprecated = InferSelectModel<typeof voteDeprecated>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
      chatIdIdx: index("idx_vote_chatId").on(table.chatId),
      messageIdIdx: index("idx_vote_messageId").on(table.messageId),
    };
  }
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
      userIdIdx: index("idx_document_userId").on(table.userId),
      idCreatedAtIdx: index("idx_document_id_createdAt").on(table.id, table.createdAt.desc()),
    };
  }
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    id: uuid("id").notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
    documentIdIdx: index("idx_suggestion_documentId").on(table.documentId),
    userIdIdx: index("idx_suggestion_userId").on(table.userId),
    isResolvedIdx: index("idx_suggestion_isResolved").on(table.isResolved),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
    chatIdIdx: index("idx_stream_chatId").on(table.chatId),
    createdAtIdx: index("idx_stream_createdAt").on(table.createdAt.asc()),
  })
);

export type Stream = InferSelectModel<typeof stream>;

// ============================================================================
// Agent Tables (for async coding agent functionality)
// ============================================================================

// Target repository for agent sessions
export const targetRepository = pgTable("TargetRepository", {
  id: uuid("id").primaryKey().defaultRandom(),
  owner: varchar("owner", { length: 256 }).notNull(),
  repo: varchar("repo", { length: 256 }).notNull(),
  branch: varchar("branch", { length: 256 }).notNull(),
  installationId: text("installationId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  ownerRepoBranchIdx: index("idx_targetRepository_owner_repo_branch").on(table.owner, table.repo, table.branch),
}));

export type TargetRepository = InferSelectModel<typeof targetRepository>;

// Agent session state (extends Chat concept for coding agent)
export const agentSession = pgTable("AgentSession", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  targetRepositoryId: uuid("targetRepositoryId").references(
    () => targetRepository.id
  ),
  title: text("title").notNull(),
  status: varchar("status", {
    enum: ["idle", "running", "completed", "error"],
  }).default("idle"),
  taskPlan: json("taskPlan"),
  branchName: varchar("branchName", { length: 256 }),
  repoPath: varchar("repoPath", { length: 1024 }),
  // Kubernetes sandbox columns
  sandboxClaimName: varchar("sandboxClaimName", { length: 256 }),
  sandboxPodName: varchar("sandboxPodName", { length: 256 }),
  sandboxNamespace: varchar("sandboxNamespace", { length: 64 }).default("agent-sandbox"),
  sandboxStatus: varchar("sandboxStatus", {
    enum: ["pending", "bound", "ready", "failed", "released"],
  }),
  // Dapr Workflow columns (for Ralph Loop)
  workflowId: varchar("workflowId", { length: 256 }),
  workflowStatus: varchar("workflowStatus", {
    enum: ["none", "pending", "running", "suspended", "completed", "failed", "terminated"],
  }).default("none"),
  // Workflow status cache (synced via Dapr pub/sub events)
  workflowPhase: varchar("workflowPhase", { length: 50 }),  // clone|exploration|planning|awaiting_approval|executing|completed|failed
  workflowProgress: integer("workflowProgress"),            // 0-100
  workflowCurrentTask: text("workflowCurrentTask"),         // Current task title
  workflowMessage: text("workflowMessage"),                 // Status message
  workflowUpdatedAt: timestamp("workflowUpdatedAt"),        // Last status update time
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("idx_agentSession_userId").on(table.userId),
  createdAtIdx: index("idx_agentSession_createdAt").on(table.createdAt.desc()),
  userIdCreatedAtIdx: index("idx_agentSession_userId_createdAt").on(table.userId, table.createdAt.desc()),
  workflowIdIdx: index("idx_agentSession_workflowId").on(table.workflowId),
  workflowStatusIdx: index("idx_agentSession_workflowStatus").on(table.workflowStatus),
  sandboxStatusIdx: index("idx_agentSession_sandboxStatus").on(table.sandboxStatus),
}));

export type AgentSession = InferSelectModel<typeof agentSession>;

// Agent messages (uses same structure as Message_v2)
export const agentMessage = pgTable("AgentMessage", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("sessionId")
    .notNull()
    .references(() => agentSession.id),
  role: varchar("role", { length: 32 }).notNull(),
  parts: json("parts").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  sessionIdIdx: index("idx_agentMessage_sessionId").on(table.sessionId),
  createdAtIdx: index("idx_agentMessage_createdAt").on(table.createdAt.asc()),
  sessionIdCreatedAtIdx: index("idx_agentMessage_sessionId_createdAt").on(table.sessionId, table.createdAt.asc()),
}));

export type AgentMessage = InferSelectModel<typeof agentMessage>;

// GitHub installations for multi-org support
export const githubInstallation = pgTable("GitHubInstallation", {
  id: text("id").primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  accountLogin: varchar("accountLogin", { length: 256 }).notNull(),
  accountType: varchar("accountType", {
    enum: ["User", "Organization"],
  }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("idx_githubInstallation_userId").on(table.userId),
}));

export type GitHubInstallation = InferSelectModel<typeof githubInstallation>;
