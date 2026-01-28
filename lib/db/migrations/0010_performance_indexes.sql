-- Performance Optimization Migration
-- Adds indexes for frequently queried columns to improve query performance

-- Chat table indexes
CREATE INDEX IF NOT EXISTS "idx_chat_userId" ON "Chat"("userId");
CREATE INDEX IF NOT EXISTS "idx_chat_createdAt" ON "Chat"("createdAt" DESC);
-- Composite index for optimized pagination queries (userId + createdAt)
CREATE INDEX IF NOT EXISTS "idx_chat_userId_createdAt" ON "Chat"("userId", "createdAt" DESC);

-- Message table indexes
CREATE INDEX IF NOT EXISTS "idx_message_chatId" ON "Message_v2"("chatId");
CREATE INDEX IF NOT EXISTS "idx_message_createdAt" ON "Message_v2"("createdAt" ASC);
-- Composite index for chat messages ordered by time
CREATE INDEX IF NOT EXISTS "idx_message_chatId_createdAt" ON "Message_v2"("chatId", "createdAt" ASC);
-- Index for message role filtering (user messages for rate limiting)
CREATE INDEX IF NOT EXISTS "idx_message_role" ON "Message_v2"("role");

-- Vote table indexes
CREATE INDEX IF NOT EXISTS "idx_vote_chatId" ON "Vote_v2"("chatId");
CREATE INDEX IF NOT EXISTS "idx_vote_messageId" ON "Vote_v2"("messageId");

-- Stream table indexes
CREATE INDEX IF NOT EXISTS "idx_stream_chatId" ON "Stream"("chatId");
CREATE INDEX IF NOT EXISTS "idx_stream_createdAt" ON "Stream"("createdAt" ASC);

-- Document table indexes
CREATE INDEX IF NOT EXISTS "idx_document_userId" ON "Document"("userId");
CREATE INDEX IF NOT EXISTS "idx_document_id_createdAt" ON "Document"("id", "createdAt" DESC);

-- Suggestion table indexes
CREATE INDEX IF NOT EXISTS "idx_suggestion_documentId" ON "Suggestion"("documentId");
CREATE INDEX IF NOT EXISTS "idx_suggestion_userId" ON "Suggestion"("userId");
CREATE INDEX IF NOT EXISTS "idx_suggestion_isResolved" ON "Suggestion"("isResolved");

-- Agent table indexes
CREATE INDEX IF NOT EXISTS "idx_agentSession_userId" ON "AgentSession"("userId");
CREATE INDEX IF NOT EXISTS "idx_agentSession_createdAt" ON "AgentSession"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_agentSession_userId_createdAt" ON "AgentSession"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_agentSession_workflowId" ON "AgentSession"("workflowId");
CREATE INDEX IF NOT EXISTS "idx_agentSession_workflowStatus" ON "AgentSession"("workflowStatus");
CREATE INDEX IF NOT EXISTS "idx_agentSession_sandboxStatus" ON "AgentSession"("sandboxStatus");

CREATE INDEX IF NOT EXISTS "idx_agentMessage_sessionId" ON "AgentMessage"("sessionId");
CREATE INDEX IF NOT EXISTS "idx_agentMessage_createdAt" ON "AgentMessage"("createdAt" ASC);
CREATE INDEX IF NOT EXISTS "idx_agentMessage_sessionId_createdAt" ON "AgentMessage"("sessionId", "createdAt" ASC);

CREATE INDEX IF NOT EXISTS "idx_targetRepository_owner_repo_branch" ON "TargetRepository"("owner", "repo", "branch");

CREATE INDEX IF NOT EXISTS "idx_githubInstallation_userId" ON "GitHubInstallation"("userId");
