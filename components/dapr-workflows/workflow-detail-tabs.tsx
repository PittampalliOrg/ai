"use client";

/**
 * WorkflowDetailTabs Component
 *
 * Tabs for the workflow detail page:
 * - Graph tab: React Flow visualization of execution events
 * - History tab: Execution history table
 * - Relationships tab: (placeholder for future implementation)
 */

import { useState } from "react";
import { GitBranch, History, Network } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ExecutionHistoryTable } from "./execution-history-table";
import { ExecutionFlow } from "./execution-flow";
import { EventDetailsPanel } from "./event-details-panel";
import type { DaprExecutionEvent } from "@/lib/types/workflow-ui";

// ============================================================================
// Types
// ============================================================================

interface WorkflowDetailTabsProps {
  events: DaprExecutionEvent[];
  defaultTab?: "graph" | "history" | "relationships";
}

// ============================================================================
// Placeholder Components
// ============================================================================

function RelationshipsPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Network className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium">Relationships</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md">
        View workflow dependencies and related executions in a future update.
      </p>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function WorkflowDetailTabs({
  events,
  defaultTab = "graph",
}: WorkflowDetailTabsProps) {
  const [selectedEvent, setSelectedEvent] = useState<DaprExecutionEvent | null>(
    null
  );

  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="grid w-full grid-cols-3 max-w-md">
        <TabsTrigger value="graph" className="gap-2">
          <GitBranch className="h-4 w-4" />
          Graph
        </TabsTrigger>
        <TabsTrigger value="history" className="gap-2">
          <History className="h-4 w-4" />
          History
        </TabsTrigger>
        <TabsTrigger value="relationships" className="gap-2">
          <Network className="h-4 w-4" />
          Relationships
        </TabsTrigger>
      </TabsList>

      <TabsContent value="graph" className="mt-6">
        <ResizablePanelGroup direction="horizontal" className="min-h-[500px]">
          <ResizablePanel defaultSize={selectedEvent ? 65 : 100} minSize={40}>
            <ExecutionFlow
              events={events}
              onEventSelect={setSelectedEvent}
              selectedEventId={selectedEvent?.eventId}
              className="h-full"
            />
          </ResizablePanel>
          {selectedEvent && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
                <EventDetailsPanel
                  event={selectedEvent}
                  onClose={() => setSelectedEvent(null)}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </TabsContent>

      <TabsContent value="history" className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-muted-foreground">
            {events.length} events
          </span>
        </div>
        <ExecutionHistoryTable events={events} />
      </TabsContent>

      <TabsContent value="relationships" className="mt-6">
        <RelationshipsPlaceholder />
      </TabsContent>
    </Tabs>
  );
}
