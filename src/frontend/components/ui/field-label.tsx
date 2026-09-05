import { HelpCircle } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface FieldLabelProps {
  label: string;
  help: string;
  className?: string;
}

export function FieldLabel({ label, help, className }: FieldLabelProps) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-muted-foreground", className)}>
      {label}
      <Tooltip>
        <TooltipTrigger
          type="button"
          className="inline-flex text-muted-foreground/70 hover:text-muted-foreground"
          aria-label={`Help: ${label}`}
        >
          <HelpCircle className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          {help}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}
