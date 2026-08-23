import { WindowChrome } from "@/components/layout/WindowChrome";
import { MainStage } from "@/components/layout/MainStage";
import { Sidebar } from "@/components/layout/Sidebar";

export default function App() {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground selection:bg-primary/30">
      <WindowChrome />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <MainStage />
      </div>
    </div>
  );
}
