import { toAssetUrl } from "@/lib/media/asset-url";
import { probeMedia } from "@/lib/media/probe";
import { createId } from "@/lib/timeline/ops";
import type { MediaFile } from "@/types/media";
import type { MediaAsset } from "@/types/timeline";

/** Probes a bin entry and turns it into a project asset. */
export async function createAsset(file: MediaFile): Promise<MediaAsset> {
  const url = toAssetUrl(file.path);
  const probe = await probeMedia(url, file.kind);

  return {
    id: createId("asset"),
    path: file.path,
    name: file.name,
    url,
    kind: file.kind,
    duration: probe.duration,
    width: probe.width,
    height: probe.height,
    status: "ready",
    waveform: "idle",
  };
}
