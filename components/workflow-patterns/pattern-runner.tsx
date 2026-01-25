"use client";

/**
 * Pattern Runner Component
 *
 * Input form and run button for executing a workflow pattern.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkflowPatternId } from "@/lib/workflow-patterns/types";

interface PatternRunnerProps {
  patternId: WorkflowPatternId;
  onStart?: (instanceId: string) => void;
}

// Form field configurations for each pattern
const PATTERN_FORMS: Record<
  WorkflowPatternId,
  Array<{
    name: string;
    label: string;
    type: "text" | "textarea" | "number" | "select";
    placeholder: string;
    required: boolean;
    options?: Array<{ value: string; label: string }>;
    defaultValue?: string | number;
  }>
> = {
  sequential: [
    {
      name: "repository.owner",
      label: "Repository Owner",
      type: "text",
      placeholder: "e.g., PittampalliOrg",
      required: true,
      defaultValue: "PittampalliOrg",
    },
    {
      name: "repository.repo",
      label: "Repository Name",
      type: "text",
      placeholder: "e.g., backstage-app",
      required: true,
      defaultValue: "backstage-app",
    },
    {
      name: "repository.branch",
      label: "Branch",
      type: "text",
      placeholder: "main",
      required: false,
      defaultValue: "main",
    },
    {
      name: "prompt",
      label: "Feature Request",
      type: "textarea",
      placeholder: "Describe the feature you want to implement...",
      required: true,
    },
  ],
  parallel: [
    {
      name: "code",
      label: "Code to Review",
      type: "textarea",
      placeholder: "Paste your code here for multi-perspective review...",
      required: true,
    },
    {
      name: "language",
      label: "Programming Language",
      type: "select",
      placeholder: "Select language",
      required: false,
      options: [
        { value: "typescript", label: "TypeScript" },
        { value: "javascript", label: "JavaScript" },
        { value: "python", label: "Python" },
        { value: "java", label: "Java" },
        { value: "go", label: "Go" },
        { value: "rust", label: "Rust" },
        { value: "c++", label: "C++" },
        { value: "c#", label: "C#" },
      ],
      defaultValue: "typescript",
    },
  ],
  routing: [
    {
      name: "query",
      label: "Customer Query",
      type: "textarea",
      placeholder: "Enter a customer support query to classify and route...",
      required: true,
    },
    {
      name: "customerId",
      label: "Customer ID (Optional)",
      type: "text",
      placeholder: "e.g., CUST-12345",
      required: false,
    },
  ],
  orchestrator: [
    {
      name: "featureRequest",
      label: "Feature Request",
      type: "textarea",
      placeholder: "Describe the feature you want to implement...",
      required: true,
    },
    {
      name: "codebaseContext",
      label: "Codebase Context (Optional)",
      type: "textarea",
      placeholder: "Provide context about your codebase structure, technologies used, etc.",
      required: false,
    },
  ],
  evaluator: [
    {
      name: "text",
      label: "Text to Translate",
      type: "textarea",
      placeholder: "Enter text to translate with iterative improvement...",
      required: true,
    },
    {
      name: "targetLanguage",
      label: "Target Language",
      type: "select",
      placeholder: "Select target language",
      required: true,
      options: [
        { value: "es", label: "Spanish" },
        { value: "fr", label: "French" },
        { value: "de", label: "German" },
        { value: "ja", label: "Japanese" },
        { value: "zh", label: "Chinese" },
        { value: "ko", label: "Korean" },
        { value: "pt", label: "Portuguese" },
        { value: "it", label: "Italian" },
        { value: "ru", label: "Russian" },
        { value: "ar", label: "Arabic" },
      ],
    },
    {
      name: "maxIterations",
      label: "Max Iterations",
      type: "number",
      placeholder: "3",
      required: false,
      defaultValue: 3,
    },
  ],
};

export function PatternRunner({ patternId, onStart }: PatternRunnerProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [formData, setFormData] = useState<Record<string, string | number>>({});

  const fields = PATTERN_FORMS[patternId];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRunning(true);

    try {
      // Build input object with defaults, supporting nested keys (e.g., "repository.owner")
      const input: Record<string, unknown> = {};

      // Helper to set nested property
      const setNestedValue = (obj: Record<string, unknown>, path: string, value: unknown) => {
        const parts = path.split(".");
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
          const key = parts[i];
          if (!(key in current)) {
            current[key] = {};
          }
          current = current[key] as Record<string, unknown>;
        }
        current[parts[parts.length - 1]] = value;
      };

      for (const field of fields) {
        const value = formData[field.name] !== undefined && formData[field.name] !== ""
          ? (field.type === "number" ? Number(formData[field.name]) : formData[field.name])
          : field.defaultValue;

        if (value !== undefined) {
          setNestedValue(input, field.name, value);
        }
      }

      const response = await fetch("/api/workflow-patterns/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patternId,
          input,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to start workflow");
      }

      toast.success("Workflow started successfully");

      if (onStart) {
        onStart(data.instanceId);
      }
    } catch (error) {
      console.error("Failed to start workflow:", error);
      toast.error(error instanceof Error ? error.message : "Failed to start workflow");
    } finally {
      setIsRunning(false);
    }
  };

  const handleChange = (name: string, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((field) => (
        <div key={field.name} className="space-y-2">
          <Label htmlFor={field.name}>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {field.type === "textarea" ? (
            <Textarea
              id={field.name}
              placeholder={field.placeholder}
              value={(formData[field.name] as string) || ""}
              onChange={(e) => handleChange(field.name, e.target.value)}
              required={field.required}
              rows={5}
              className="font-mono text-sm"
            />
          ) : field.type === "select" ? (
            <Select
              value={(formData[field.name] as string) || (field.defaultValue as string) || ""}
              onValueChange={(value) => handleChange(field.name, value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={field.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : field.type === "number" ? (
            <Input
              id={field.name}
              type="number"
              placeholder={field.placeholder}
              value={formData[field.name] ?? field.defaultValue ?? ""}
              onChange={(e) => handleChange(field.name, e.target.value)}
              required={field.required}
              min={1}
              max={5}
            />
          ) : (
            <Input
              id={field.name}
              type="text"
              placeholder={field.placeholder}
              value={(formData[field.name] as string) || ""}
              onChange={(e) => handleChange(field.name, e.target.value)}
              required={field.required}
            />
          )}
        </div>
      ))}

      <Button type="submit" disabled={isRunning} className="w-full">
        {isRunning ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Running...
          </>
        ) : (
          <>
            <Play className="mr-2 h-4 w-4" />
            Run Workflow
          </>
        )}
      </Button>
    </form>
  );
}
