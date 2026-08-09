import { MainStage } from "@/components/layout/MainStage";
import { Sidebar } from "@/components/layout/Sidebar";

export default function App() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground selection:bg-primary/30">
      <Sidebar />
      <MainStage />
    </div>
  );
}
