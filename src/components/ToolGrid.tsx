import type { ToolDefinition } from "@/types/tool";
import { ToolCard } from "./ToolCard";

export function ToolGrid({ tools }: { tools: ToolDefinition[] }) {
  if (tools.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => (
        <ToolCard key={tool.id} tool={tool} />
      ))}
    </div>
  );
}
