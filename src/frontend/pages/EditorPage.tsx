import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { ClipsSidebar } from "@/components/layout/ClipsSidebar";
import { ControlsPanel } from "@/components/layout/ControlsPanel";
import { PipelineStepper } from "@/components/player/PipelineStepper";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { useMediaStore } from "@/stores/media-store";
import { useSilenceStore } from "@/stores/silence-store";

export function EditorPage() {
  const { mediaId } = useParams<{ mediaId: string }>();
  const navigate = useNavigate();

  const { files, setSelected, clearSelection, loadEditorState } = useMediaStore();
  const { phase } = useSilenceStore();
  const selectedFile = files.find((f) => f.id === mediaId) ?? null;
  const showStepper = phase === "running";

  useEffect(() => {
    if (!mediaId) return;
    if (files.length === 0) return;
    if (!selectedFile) {
      navigate("/", { replace: true });
      return;
    }
    setSelected(mediaId);
    clearSelection();
    void loadEditorState(mediaId);
  }, [mediaId, files.length, selectedFile, setSelected, clearSelection, loadEditorState, navigate]);

  return (
    <AppShell showBack subtitle={selectedFile?.name ?? "editor"}>
      <ClipsSidebar />
      {showStepper ? <PipelineStepper /> : <VideoPlayer />}
      <ControlsPanel />
    </AppShell>
  );
}
