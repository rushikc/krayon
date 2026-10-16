// All backend traffic goes through here. In dev, Vite proxies /api to local-backend.
// Set VITE_API_BASE_URL to point at a deployed backend (e.g. Cloud Run) instead.
const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ApiError('Could not reach the Krayon backend. Is local-backend running?', 0);
  }
  if (!response.ok) {
    let message = `Backend error ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === 'string') message = body.detail;
    } catch {
      /* not JSON */
    }
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
};

export const apiJson = <T>(path: string, method: string, body: unknown) =>
  apiFetch<T>(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

type UploadResult = { id: string; name: string; content_type: string; size: number; path: string };

const uploads = new WeakMap<File, Promise<UploadResult>>();

/** Uploads a file once per File object and reuses the stored id. */
export const uploadFile = (file: File) => {
  let pending = uploads.get(file);
  if (!pending) {
    const form = new FormData();
    form.append('file', file, file.name);
    pending = apiFetch<UploadResult>('/api/uploads', { method: 'POST', body: form });
    pending.catch(() => uploads.delete(file));
    uploads.set(file, pending);
  }
  return pending;
};
