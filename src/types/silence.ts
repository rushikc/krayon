export type SilenceMethod = "fast" | "accurate";

export type SilencePhase =
  | "idle"
  | "probing"
  | "extracting"
  | "transcribing"
  | "detecting"
  | "segmenting"
  | "processing"
  | "done"
  | "error";

export interface SilenceOptions {
  method: SilenceMethod;
  silenceThreshold: number;
  pad: number;
  noiseFloorDb: number;
  threads: number;
  language?: string;
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

export interface SilenceAnalysis {
  method: SilenceMethod;
  sourceDuration: number;
  fps: number;
  segments: SourceSegment[];
  removedSeconds: number;
  words: WordTiming[];
}

export interface SilenceProgress {
  jobId: string;
  phase: string;
  progress: number;
  message: string;
}

export interface ToolStatus {
  ffmpeg: string | null;
  ffprobe: string | null;
  whisperCli: string | null;
  whisperModel: string | null;
  whisperReady: boolean;
}

export const DEFAULT_SILENCE_OPTIONS: SilenceOptions = {
  method: "fast",
  silenceThreshold: 0.4,
  pad: 0.05,
  noiseFloorDb: -35,
  threads: 4,
};
