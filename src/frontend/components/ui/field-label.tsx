import { humanizeCamelCase } from "@/lib/humanize-camel-case";
import { cn } from "@/lib/utils";

interface FieldLabelProps {
  label: string;
  help?: string;
  className?: string;
}

export function FieldLabel({ label, className }: FieldLabelProps) {
  return (
    <span className={cn("text-muted-foreground", className)}>
      {humanizeCamelCase(label)}
    </span>
  );
}
