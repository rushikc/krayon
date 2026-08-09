import { convertFileSrc, isTauri } from "@tauri-apps/api/core";

export { isTauri };

/**
 * Turns an absolute filesystem path into something the WebView will load.
 *
 * Requires `app.security.assetProtocol` to be enabled with a scope covering the
 * path in `tauri.conf.json`, otherwise the WebView refuses the request.
 *
 * Outside Tauri (`pnpm dev` in a plain browser) media is served by Vite from
 * `public/dev-media`, so paths are already usable URLs.
 */
export function toAssetUrl(path: string): string {
  if (!isTauri()) return path;
  return convertFileSrc(path);
}
