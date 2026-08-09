import { useMemo } from "react";
import { Clapperboard } from "lucide-react";

import { VideoLayer } from "@/features/editor/preview/VideoLayer";
import { useTimelineStore } from "@/stores/timeline-store";
import { VIDEO_TRACK_ID } from "@/types/timeline";

/**
 * The 9:16 reel frame. Sources of any shape letterbox inside it, so what you
 * see matches the export format.
 */
export function PreviewPlayer() {
  const clips = useTimelineStore((state) => state.clips);
  const assets = useTimelineStore((state) => state.assets);

  const videoAssets = useMemo(() => {
    const ids = new Set(
      clips
        .filter((clip) => clip.trackId === VIDEO_TRACK_ID)
        .map((clip) => clip.assetId),
    );
    return [...ids].flatMap((id) => (assets[id] ? [assets[id]] : []));
  }, [clips, assets]);

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black p-4">
      <div className="relative aspect-[9/16] h-full max-h-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl">
        {videoAssets.map((asset) => (
          <VideoLayer key={asset.id} asset={asset} />
        ))}

        {videoAssets.length === 0 && (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-zinc-600">
            <Clapperboard className="size-8" />
            <p className="text-xs">Click a clip in the library to load it</p>
          </div>
        )}
      </div>
    </div>
  );
}
