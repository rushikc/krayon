import type { CourseState, LessonDetail, LessonProgress, LessonSummary } from '@krayon/shared';

// All backend traffic goes through here. In dev, Vite proxies /api to local-backend.
// Set VITE_API_BASE_URL to call an API other than the Vite proxy.
const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/** Absolute URL for a backend path, including the optional API base. Never appends a token. */
export const mediaUrl = (path: string) => `${BASE}${path}`;

let renderToken = '';

/** Called when the Firebase ID token refreshes. Only keyframe img URLs use it. */
export const setRenderToken = (token: string) => {
  renderToken = token;
};

const authHeaders = async (): Promise<Record<string, string>> => {
  if (import.meta.env.VITE_BACKEND !== 'gcp') return {};
  const { appCheckToken, idToken } = await import('./firebase.ts');
  const headers: Record<string, string> = {};
  const token = await idToken();
  const check = await appCheckToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (check) headers['X-Firebase-AppCheck'] = check;
  return headers;
};

/** Largest PDF or photo the backend accepts. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const headers = { ...(await authHeaders()), ...(init?.headers as Record<string, string> | undefined) };
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('Could not reach the Krayon backend. Is local-backend running?', 0);
  }
  if (!response.ok) {
    let message = `Backend error ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: unknown; reason?: unknown; message?: unknown; code?: unknown };
      if (body.code === 'demo_limit' && typeof body.message === 'string') message = body.message;
      else if (typeof body.detail === 'string') message = body.detail;
      else if (typeof body.message === 'string') message = body.message;
      else if (typeof body.reason === 'string') message = body.reason;
    } catch {
      /* not JSON */
    }
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
};

export const apiJson = <T>(path: string, method: string, body: unknown, init?: RequestInit) =>
  apiFetch<T>(path, { ...init, method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const createCourse = (files: File[]) => {
  const form = new FormData();
  for (const file of files) form.append('file', file, file.name);
  return apiFetch<{ courseId: string; jobId: string }>('/api/courses', { method: 'POST', body: form });
};

export const listCourses = () => apiFetch<{ courses: CourseState[] }>('/api/courses');

export const getCourse = (courseId: string) => apiFetch<CourseState>(`/api/courses/${courseId}`);

export const deleteCourse = (courseId: string) => apiFetch<{ ok: true }>(`/api/courses/${courseId}`, { method: 'DELETE' });

/** Runs a failed structure pass again, or puts failed chapters back on the list. */
export const retryCourse = (courseId: string) => apiJson<{ jobId: string }>(`/api/courses/${courseId}/retry`, 'POST', {});

/** Continues a failed chapter from its last stored step. */
export const retryChapter = (chapterId: string) => apiJson<{ jobId: string }>(`/api/chapters/${chapterId}/retry`, 'POST', {});

export const getLesson = (lessonId: string) => apiFetch<LessonDetail>(`/api/lessons/${lessonId}`);

/** Starts the video for a lesson. A ready or rendering lesson is left as it is. */
export const renderLesson = (lessonId: string) =>
  apiJson<{ jobId: string | null; lesson: LessonSummary | null }>(`/api/lessons/${lessonId}/render`, 'POST', {});

/** Re-runs only the failed segments of a lesson. */
export const retryLesson = (lessonId: string) =>
  apiJson<{ jobId: string | null; lesson: LessonSummary | null }>(`/api/lessons/${lessonId}/retry`, 'POST', {});

export const regenerateSegment = (lessonId: string, segmentId: string, prompt?: string) =>
  apiJson<{ jobId: string }>(`/api/lessons/${lessonId}/segments/${segmentId}/regenerate`, 'POST', { prompt });

/** Makes a ready lesson's video again. Optional instructions go into the new cut. */
export const rerenderLesson = (lessonId: string, prompt?: string) =>
  apiJson<{ jobId: string }>(`/api/lessons/${lessonId}/rerender`, 'POST', { prompt });

/** `keepalive` lets the last save finish while the page unloads. */
export const saveLessonProgress = (lessonId: string, patch: Partial<Omit<LessonProgress, 'updatedAt'>>, keepalive = false) =>
  apiJson<LessonProgress>(`/api/lessons/${lessonId}/progress`, 'PUT', patch, { keepalive });

export const askLesson = (lessonId: string, question: string, frame: number) =>
  apiJson<{ answer: string; segmentId: string | null }>(`/api/lessons/${lessonId}/ask`, 'POST', { question, frame });

/** Keyframe images cannot send a header, so this is the only URL that carries `?token=`. */
export const renderUrl = (blobId: string) => {
  const url = `${BASE}/api/renders/${blobId}`;
  return renderToken ? `${url}?token=${encodeURIComponent(renderToken)}` : url;
};

/** Fetches audio with Authorization and returns a blob URL the player can use. */
export const fetchAudioBlobUrl = async (path: string) => {
  const response = await fetch(mediaUrl(path), { headers: await authHeaders() });
  if (!response.ok) throw new Error(`Audio failed (${response.status})`);
  return URL.createObjectURL(await response.blob());
};
