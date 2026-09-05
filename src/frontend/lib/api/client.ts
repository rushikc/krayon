import type {
  ClipGroup,
  ClipItem,
  ClipsGenerateResponse,
  EditorStateResponse,
  FolderScanResponse,
  JobProgress,
  PickFolderResponse,
  SilenceAnalysis,
  SilenceOptions,
  ToolStatus,
} from "@/types/api";

const API_BASE = "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export function mediaStreamUrl(id: string): string {
  return `${API_BASE}/api/media/stream/${id}`;
}

export function clipAudioUrl(mediaId: string, clipId: string): string {
  return `${API_BASE}/api/media/clip/${mediaId}/${clipId}`;
}

export async function getEditorState(mediaId: string): Promise<EditorStateResponse | null> {
  const res = await fetch(`${API_BASE}/api/editor/state/${mediaId}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  const data = (await res.json()) as EditorStateResponse | null;
  return data;
}

export async function setActiveEditorVersion(
  mediaId: string,
  versionId: string,
): Promise<EditorStateResponse> {
  return request<EditorStateResponse>(`/api/editor/state/${mediaId}/active`, {
    method: "PUT",
    body: JSON.stringify({ versionId }),
  });
}

export async function getToolsStatus(): Promise<ToolStatus> {
  return request<ToolStatus>("/api/tools/status");
}

export async function pickFolder(): Promise<PickFolderResponse> {
  return request<PickFolderResponse>("/api/fs/pick-folder", { method: "POST" });
}

export async function scanFolder(path: string): Promise<FolderScanResponse> {
  return request<FolderScanResponse>("/api/folder/scan", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export async function analyzeSilence(
  path: string,
  options: SilenceOptions,
): Promise<SilenceAnalysis> {
  return request<SilenceAnalysis>("/api/silence/analyze", {
    method: "POST",
    body: JSON.stringify({ path, options }),
  });
}

export async function startClipsJob(
  path: string,
  options: SilenceOptions,
  similarityThreshold = 0.5,
): Promise<{ jobId: string }> {
  return request<{ jobId: string }>("/api/clips/generate/async", {
    method: "POST",
    body: JSON.stringify({ path, options, similarityThreshold }),
  });
}

export async function generateClips(
  path: string,
  options: SilenceOptions,
  similarityThreshold = 0.5,
): Promise<ClipsGenerateResponse> {
  return request<ClipsGenerateResponse>("/api/clips/generate", {
    method: "POST",
    body: JSON.stringify({ path, options, similarityThreshold }),
  });
}

export function listenJobProgress(
  endpoint: string,
  jobId: string,
  onProgress: (progress: JobProgress) => void,
  onComplete: (payload?: string) => void,
  onError: (message: string) => void,
): () => void {
  const source = new EventSource(`${API_BASE}${endpoint}/${jobId}`);
  let finished = false;

  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as JobProgress & { done?: boolean; error?: string };
      if (data.error) {
        if (!finished) {
          finished = true;
          onError(data.error);
        }
        source.close();
        return;
      }
      if (data.done) {
        if (!finished) {
          finished = true;
          onComplete();
        }
        source.close();
        return;
      }
      if (data.jobId) {
        onProgress(data);
        if (data.phase === "complete" && !finished) {
          finished = true;
          onComplete(data.message);
        }
        if (data.phase === "error" && !finished) {
          finished = true;
          onError(data.message);
          source.close();
        }
      }
    } catch {
      // ignore malformed events
    }
  };

  source.onerror = () => {
    if (!finished) {
      finished = true;
      onError("Lost connection to job progress stream");
    }
    source.close();
  };

  return () => source.close();
}

export type { ClipGroup, ClipItem, ClipsGenerateResponse, SilenceAnalysis };
