import { Storage } from '@google-cloud/storage';
import type { BlobStat, BlobStorage } from '@krayon/shared';

const contentTypeOf = (key: string) => {
  if (key.endsWith('.wav')) return 'audio/wav';
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.pdf')) return 'application/pdf';
  if (key.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
};

/** Objects live at the same keys as local files. The default bucket is the Firebase one. */
export const createGcsBlobStorage = (bucketName = process.env.BUCKET || 'krayon-ai.firebasestorage.app'): BlobStorage => {
  const bucket = new Storage().bucket(bucketName);
  const statOf = async (key: string): Promise<BlobStat | null> => {
    const file = bucket.file(key);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [meta] = await file.getMetadata();
    return {
      key,
      size: Number(meta.size ?? 0),
      contentType: meta.contentType || contentTypeOf(key),
      updatedAt: Date.parse(meta.updated || '') / 1000 || 0,
    };
  };
  return {
    async put(key, data, opts) {
      await bucket.file(key).save(Buffer.from(data), { contentType: opts.contentType, resumable: false });
      return (await statOf(key))!;
    },
    async get(key) {
      const stat = await statOf(key);
      if (!stat) return null;
      const [data] = await bucket.file(key).download();
      return { data: new Uint8Array(data), stat };
    },
    stat: statOf,
    async stream(key, range) {
      const stat = await statOf(key);
      if (!stat) return null;
      return bucket.file(key).createReadStream(range ? { start: range.start, end: range.end } : undefined);
    },
    async delete(key) {
      const file = bucket.file(key);
      const [exists] = await file.exists();
      if (!exists) return false;
      await file.delete();
      return true;
    },
    async deletePrefix(prefix) {
      const [files] = await bucket.getFiles({ prefix });
      let n = 0;
      for (const file of files) {
        await file.delete({ ignoreNotFound: true });
        n += 1;
      }
      return n;
    },
  };
};
