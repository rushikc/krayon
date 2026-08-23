import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type {
  SilenceAnalysis,
  SilenceOptions,
  SilenceProgress,
  ToolStatus,
} from "@/types/silence";

export async function checkMediaTools(): Promise<ToolStatus> {
  return invoke<ToolStatus>("check_media_tools_command");
}

export async function analyzeSilence(
  jobId: string,
  path: string,
  options: SilenceOptions,
): Promise<SilenceAnalysis> {
  return invoke<SilenceAnalysis>("analyze_silence", {
    jobId,
    path,
    options: {
      ...options,
      method: options.method,
    },
  });
}

export function listenSilenceProgress(
  handler: (progress: SilenceProgress) => void,
): Promise<UnlistenFn> {
  return listen<SilenceProgress>("silence://progress", (event) => {
    handler(event.payload);
  });
}

export function createJobId(): string {
  return `silence-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatRemovedDuration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  if (minutes === 0) return `${remainder}s`;
  return `${minutes}m ${remainder}s`;
}
