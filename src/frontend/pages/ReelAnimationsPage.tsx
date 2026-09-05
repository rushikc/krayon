import { Canvas } from "@/components/canvas/Canvas";
import { SchemaInspector } from "@/components/canvas/SchemaInspector";
import { AppShell } from "@/components/layout/AppShell";

export function ReelAnimationsPage() {
  return (
    <AppShell
      showBack
      backTo="/"
      backLabel="Back to home"
      subtitle="reel animations"
    >
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-4 [container-type:size]">
        <Canvas />
      </div>
      <SchemaInspector />
    </AppShell>
  );
}
