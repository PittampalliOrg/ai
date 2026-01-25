"use client";

import { JsonPanel } from "./json-panel";

interface InputOutputSectionProps {
  input: unknown;
  output: unknown;
}

export function InputOutputSection({ input, output }: InputOutputSectionProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <JsonPanel title="Input" data={input} maxHeight="250px" />
      <JsonPanel title="Output" data={output} maxHeight="250px" />
    </div>
  );
}
