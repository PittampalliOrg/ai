"use client";

/**
 * EventDetailsPanel Component
 *
 * Side panel for displaying selected event details.
 * Shows event type, name, timestamp, output, and metadata.
 */

import { X, Clock, Tag, Hash, Info, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { DaprExecutionEvent } from "@/lib/types/workflow-ui";
import { getEventTypeColor } from "@/lib/types/workflow-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface EventDetailsPanelProps {
  event: DaprExecutionEvent;
  onClose: () => void;
}

// ============================================================================
// Helper Components
// ============================================================================

interface CollapsibleJsonProps {
  title: string;
  data: unknown;
  defaultOpen?: boolean;
}

function CollapsibleJson({ title, data, defaultOpen = false }: CollapsibleJsonProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (data === undefined || data === null) {
    return null;
  }

  return (
    <div className="border rounded-md overflow-hidden">
      <button
        type="button"
        className="flex items-center justify-between w-full px-3 py-2 bg-muted/50 hover:bg-muted transition-colors text-sm font-medium text-left"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{title}</span>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <div className="p-3 bg-muted/20">
          <pre className="text-xs font-mono whitespace-pre-wrap break-all overflow-auto max-h-60">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

interface DetailRowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

function DetailRow({ icon, label, value }: DetailRowProps) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground break-all">{value}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function EventDetailsPanel({ event, onClose }: EventDetailsPanelProps) {
  const eventTypeColor = getEventTypeColor(event.eventType);

  const formattedTimestamp = (() => {
    try {
      return new Date(event.timestamp).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "medium",
      });
    } catch {
      return event.timestamp;
    }
  })();

  return (
    <div className="h-full flex flex-col bg-card border-l">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-foreground">Event Details</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Event Type Badge */}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("font-mono", eventTypeColor)}>
            {event.eventType}
          </Badge>
        </div>

        {/* Basic Info */}
        <div className="space-y-1 divide-y">
          {event.name && (
            <DetailRow
              icon={<Tag className="h-4 w-4" />}
              label="Name"
              value={event.name}
            />
          )}

          {event.eventId !== null && (
            <DetailRow
              icon={<Hash className="h-4 w-4" />}
              label="Event ID"
              value={event.eventId}
            />
          )}

          <DetailRow
            icon={<Clock className="h-4 w-4" />}
            label="Timestamp"
            value={formattedTimestamp}
          />

          {event.metadata?.taskId && (
            <DetailRow
              icon={<Info className="h-4 w-4" />}
              label="Task ID"
              value={event.metadata.taskId}
            />
          )}

          {event.metadata?.elapsed && (
            <DetailRow
              icon={<Clock className="h-4 w-4" />}
              label="Elapsed"
              value={event.metadata.elapsed}
            />
          )}

          {event.metadata?.executionDuration && (
            <DetailRow
              icon={<Clock className="h-4 w-4" />}
              label="Duration"
              value={event.metadata.executionDuration}
            />
          )}

          {event.metadata?.status && (
            <DetailRow
              icon={<Info className="h-4 w-4" />}
              label="Status"
              value={event.metadata.status}
            />
          )}
        </div>

        {/* Collapsible sections */}
        <div className="space-y-3">
          <CollapsibleJson title="Input" data={event.input} />
          <CollapsibleJson title="Output" data={event.output} defaultOpen />
          <CollapsibleJson title="Metadata" data={event.metadata} />
        </div>
      </div>
    </div>
  );
}
