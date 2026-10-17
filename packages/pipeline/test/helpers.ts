export { memoryBlobs, memoryDocs } from '../src/memory.js';

export const quietLog = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined };

/** Sentences of `words` words each, numbered so every one is distinct. */
export const sentences = (count: number, words: number) =>
  Array.from({ length: count }, (_, index) => `Sentence ${index + 1} ${Array.from({ length: Math.max(0, words - 3) }, () => 'word').join(' ')} end.`);

export const script = (count: number, words: number) => sentences(count, words).join(' ');
