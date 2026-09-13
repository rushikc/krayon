import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBackdrop,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress, ProgressValue } from "@/components/ui/progress";
import { formatExportEta } from "@/lib/export-reel";

export function ExportProgressDialog({
  open,
  progress,
  startedAt,
  onCancel,
}: {
  open: boolean;
  progress: number;
  startedAt: number | null;
  onCancel: () => void;
}) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }
    const id = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 250);
    return () => window.clearInterval(id);
  }, [open]);

  const elapsedMs = startedAt === null ? 0 : Date.now() - startedAt;
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);

  return (
    <Dialog
      open={open}
      disablePointerDismissal
      onOpenChange={() => {
        /* Stay open until export finishes or Cancel. */
      }}
    >
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup>
          <DialogTitle>Exporting Video</DialogTitle>
          <div className="mt-4 space-y-3">
            <Progress value={percent} className="w-full">
              <ProgressValue>{() => `${percent}%`}</ProgressValue>
            </Progress>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatExportEta(elapsedMs, progress)}
            </p>
            <DialogDescription>
              Please do not leave this tab until the export is complete.
            </DialogDescription>
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
