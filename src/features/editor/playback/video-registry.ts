/**
 * Bridges React-rendered `<video>` elements to the imperative playback engine,
 * so syncing picture to the clock never triggers a re-render.
 */
const elements = new Map<string, HTMLVideoElement>();

export function registerVideoElement(
  assetId: string,
  element: HTMLVideoElement,
): () => void {
  elements.set(assetId, element);
  return () => {
    if (elements.get(assetId) === element) elements.delete(assetId);
  };
}

export function getVideoElement(assetId: string): HTMLVideoElement | undefined {
  return elements.get(assetId);
}

export function videoElements(): [string, HTMLVideoElement][] {
  return [...elements.entries()];
}
