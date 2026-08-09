import { useEffect, useRef } from "react";

import { registerVideoElement } from "@/features/editor/playback/video-registry";
import type { MediaAsset } from "@/types/timeline";

interface VideoLayerProps {
  asset: MediaAsset;
}

/**
 * One element per asset used on the video track, stacked and faded in by the
 * playback engine. Keeping them mounted means switching between takes doesn't
 * pay for a fresh load.
 */
export function VideoLayer({ asset }: VideoLayerProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return registerVideoElement(asset.id, element);
  }, [asset.id]);

  return (
    <video
      ref={ref}
      src={asset.url}
      muted
      playsInline
      preload="auto"
      className="pointer-events-none absolute inset-0 size-full object-contain opacity-0"
    />
  );
}
