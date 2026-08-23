export interface MediaFileInfo {
  id: string;
  path: string;
  name: string;
  size: number;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  fps?: number | null;
  needsProxy: boolean;
  proxyReady: boolean;
}

export interface PickFolderResponse {
  path?: string | null;
  cancelled: boolean;
}

export interface FolderScanResponse {
  path: string;
  files: MediaFileInfo[];
}

export interface ToolStatus {
  ffmpeg: boolean;
  ffprobe: boolean;
  whisperReady: boolean;
  whisperModel: string;
}

export interface SourceSegment {
  sourceStart: number;
  sourceEnd: number;
}

export interface WordTiming {
  text: string;
  start: number;
  end: number;
}

export interface SilenceOptions {
  silenceThreshold: number;
  pad: number;
  language?: string;
  threads: number;
}

export interface SilenceAnalysis {
  sourceDuration: number;
  fps: number;
  segments: SourceSegment[];
  removedSeconds: number;
  words: WordTiming[];
}

export interface ClipItem {
  id: string;
  index: number;
  path: string;
  sourceStart: number;
  sourceEnd: number;
  duration: number;
  text: string;
  groupId: string;
}

export interface ClipGroup {
  id: string;
  label: string;
  clipIds: string[];
}

export interface ClipsGenerateResponse {
  sourcePath: string;
  groups: ClipGroup[];
  clips: ClipItem[];
  versionId?: string;
}

export interface EditorVersionSummary {
  versionId: string;
  createdAt: string;
  label: string;
  clipCount: number;
  removedSeconds: number;
  options: SilenceOptions;
}

export interface EditorStateIndex {
  mediaId: string;
  sourcePath: string;
  activeVersionId: string;
  versions: EditorVersionSummary[];
}

export interface EditorStateManifest {
  versionId: string;
  createdAt: string;
  mediaId: string;
  sourcePath: string;
  options: SilenceOptions;
  similarityThreshold: number;
  analysis: SilenceAnalysis;
  clips: ClipItem[];
  groups: ClipGroup[];
  clipCount: number;
  removedSeconds: number;
  clipsDir: string;
}

export interface EditorStateResponse {
  exists: boolean;
  index: EditorStateIndex;
  activeVersion: EditorStateManifest;
}

export interface JobProgress {
  jobId: string;
  phase: string;
  progress: number;
  stepProgress: number;
  message: string;
}

export const DEFAULT_SILENCE_OPTIONS: SilenceOptions = {
  silenceThreshold: 0.4,
  pad: 0.05,
  language: "en",
  threads: 4,
};

export const LAST_FOLDER_KEY = "krayon:lastFolder";
