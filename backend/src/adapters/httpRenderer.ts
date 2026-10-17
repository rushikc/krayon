import { GoogleAuth } from 'google-auth-library';
import { mediaId } from '@krayon/shared';
import type { BlobStorage, KeyframeRenderer } from '@krayon/shared';

/** The worker calls krayon-renderer with an ID token. Stills are not a Cloud Task. */
export const createHttpRenderer = (blobs?: BlobStorage): KeyframeRenderer => {
  const auth = new GoogleAuth();
  const url = (process.env.RENDERER_URL || '').replace(/\/$/, '');
  return {
    async renderStills(input) {
      const client = await auth.getIdTokenClient(url);
      const response = await client.request<{ frames: number[]; keys: string[]; pngs?: string[] }>({
        url: `${url}/render`,
        method: 'POST',
        data: input,
      });
      const pngs = response.data.pngs ?? [];
      for (const [index, key] of response.data.keys.entries()) {
        const png = pngs[index];
        if (blobs && png) await blobs.put(key, Buffer.from(png, 'base64'), { contentType: 'image/png' });
      }
      return { frames: response.data.frames, keys: response.data.keys.map((key) => mediaId(key)) };
    },
    async health() {
      try {
        const client = await auth.getIdTokenClient(url);
        await client.request({ url: `${url}/health` });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Renderer unavailable' };
      }
    },
  };
};
