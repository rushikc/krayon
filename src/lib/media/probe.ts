import type { TrackKind } from "@/types/timeline";

export interface ProbeResult {
  duration: number;
  width?: number;
  height?: number;
}

const PROBE_TIMEOUT_MS = 20_000;

/**
 * Reads duration and dimensions straight from the WebView's media pipeline.
 *
 * This intentionally avoids ffprobe: the sidecar isn't bundled yet, and the
 * element has to load the file for playback anyway. Per-file frame rate is not
 * exposed here, so the project fps setting is used for frame stepping.
 */
export function probeMedia(url: string, kind: TrackKind): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const element =
      kind === "video"
        ? document.createElement("video")
        : document.createElement("audio");
    element.preload = "metadata";
    element.muted = true;

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      element.removeAttribute("src");
      element.load();
      fn();
    };

    const timer = window.setTimeout(
      () => finish(() => reject(new Error("Timed out reading media metadata"))),
      PROBE_TIMEOUT_MS,
    );

    element.addEventListener("loadedmetadata", () => {
      const duration = element.duration;
      const width = element instanceof HTMLVideoElement ? element.videoWidth : undefined;
      const height = element instanceof HTMLVideoElement ? element.videoHeight : undefined;
      if (!Number.isFinite(duration) || duration <= 0) {
        finish(() => reject(new Error("Media has no readable duration")));
        return;
      }
      finish(() => resolve({ duration, width, height }));
    });

    element.addEventListener("error", () => {
      finish(() =>
        reject(
          new Error(
            element.error?.message ?? "The WebView could not decode this file",
          ),
        ),
      );
    });

    element.src = url;
  });
}
