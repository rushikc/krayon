type ZoomKeyEvent = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey">;

function isZoomInCode(key: string) {
  return key === "+" || key === "=" || key === "Add";
}

function isZoomOutCode(key: string) {
  return key === "-" || key === "_" || key === "Subtract";
}

/** Zoom-in: `+`, `=`, or numpad Add (bare or with Ctrl/Cmd). */
export function isZoomInKey(event: ZoomKeyEvent): boolean {
  return isZoomInCode(event.key);
}

/** Zoom-out: `-`, `_`, or numpad Subtract (bare or with Ctrl/Cmd). */
export function isZoomOutKey(event: ZoomKeyEvent): boolean {
  return isZoomOutCode(event.key);
}

/** True when the event is a zoom-in/out keystroke we should handle. */
export function isZoomKey(event: ZoomKeyEvent): boolean {
  return isZoomInKey(event) || isZoomOutKey(event);
}
