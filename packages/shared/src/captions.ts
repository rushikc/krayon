import { FPS, SEGMENT_PAUSE_SECONDS, wordCount } from './limits.js';

/** Pack consecutive sentences until this many words so a caption stays 1–2 lines. */
export const CAPTION_WORDS = 18;

const pauseFrames = () => Math.round(SEGMENT_PAUSE_SECONDS * FPS);

/** Splits prose into sentences, keeping the text verbatim. */
export const splitSentences = (text: string): string[] =>
  text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?]["'”’)]?)\s+(?=["'“‘(]?[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const displayText = (text: string) =>
  text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

/** Groups sentences into short captions without cutting a sentence in half. */
export const packCaptionChunks = (narration: string): string[] => {
  const sentences = splitSentences(displayText(narration));
  if (sentences.length === 0) return [];
  const chunks: string[] = [];
  let current: string[] = [];
  let words = 0;
  for (const sentence of sentences) {
    const next = wordCount(sentence);
    if (current.length > 0 && words + next > CAPTION_WORDS) {
      chunks.push(current.join(' '));
      current = [];
      words = 0;
    }
    current.push(sentence);
    words += next;
  }
  if (current.length > 0) chunks.push(current.join(' '));
  return chunks;
};

/**
 * Caption to show at `frame` inside a segment. Chunks share the spoken frames by word count;
 * the last chunk stays on screen through the trailing pause.
 */
export const captionAtFrame = (narration: string, frame: number, durationInFrames: number): string => {
  const chunks = packCaptionChunks(narration);
  if (chunks.length === 0) return '';
  if (chunks.length === 1 || durationInFrames <= 1) return chunks[0] ?? '';

  const spoken = Math.max(chunks.length, durationInFrames - pauseFrames());
  const weights = chunks.map((chunk) => Math.max(1, wordCount(chunk)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const at = Math.max(0, Math.min(frame, Math.max(0, durationInFrames - 1)));
  if (at >= spoken) return chunks[chunks.length - 1] ?? '';

  let start = 0;
  let seen = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    seen += weights[index] ?? 0;
    const end = index === chunks.length - 1 ? spoken : Math.max(start + 1, Math.round((seen / total) * spoken));
    if (at < end) return chunks[index] ?? '';
    start = end;
  }
  return chunks[chunks.length - 1] ?? '';
};
