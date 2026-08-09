import { mediaKind } from "@/types/media";
import type { MediaFile } from "@/types/media";

const DEV_MEDIA_DIR = "/dev-media";

/**
 * Browser-only stand-in for the native folder picker, so the editor can be
 * exercised with `pnpm dev` without building the Tauri shell.
 *
 * Drop files into `public/dev-media/` and list their names in
 * `public/dev-media/manifest.json`.
 */
export async function listDevMedia(): Promise<{
  folder: string;
  files: MediaFile[];
}> {
  const response = await fetch(`${DEV_MEDIA_DIR}/manifest.json`);
  if (!response.ok) {
    throw new Error(
      "No public/dev-media/manifest.json found — add sample media to run the editor in a browser",
    );
  }

  const names: unknown = await response.json();
  if (!Array.isArray(names)) {
    throw new Error("dev-media manifest must be an array of file names");
  }

  const files = names
    .filter((name): name is string => typeof name === "string")
    .flatMap((name) => {
      const kind = mediaKind(name);
      return kind ? [{ name, path: `${DEV_MEDIA_DIR}/${name}`, kind }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { folder: DEV_MEDIA_DIR, files };
}
