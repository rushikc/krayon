const bytesToString = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return binary;
};

const stringToBytes = (binary: string) => Uint8Array.from(binary, (char) => char.charCodeAt(0));

/** URL-safe id for a storage key. Matches `[A-Za-z0-9_-]+`. */
export const mediaId = (key: string) => {
  const binary = bytesToString(new TextEncoder().encode(key));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

/** Inverse of mediaId. Returns null when the id is not a key we encoded. */
export const mediaKey = (id: string): string | null => {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  try {
    const padded = id.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (id.length % 4)) % 4);
    const bytes = stringToBytes(atob(padded));
    const key = new TextDecoder().decode(bytes);
    if (!key.startsWith('users/') || key.includes('..') || key.includes('\\')) return null;
    return key;
  } catch {
    return null;
  }
};
