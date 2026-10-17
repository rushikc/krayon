import { FPS, SEGMENT_WORDS, framesFor, wordCount } from '@krayon/shared';
import type { GenerationIssue } from '@krayon/shared';

/** Splits prose into sentences, keeping the text verbatim. */
export const splitSentences = (text: string): string[] =>
  text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?]["'”’)]?)\s+(?=["'“‘(]?[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

/** One idea with one visual. `sentences` are verbatim script sentences; `pages` are 0-based PDF pages. */
export type Beat = {
  title: string;
  visual: string;
  pages: number[];
  sentences: string[];
};

export type TimedBeat = Beat & {
  narration: string;
  words: number;
  durationInFrames: number;
  startFrame: number;
};

export type BeatRange = { firstSentence: number; lastSentence: number; title: string; visual: string; pages: number[] };

/** Issues when the model's sentence ranges do not cover sentences 1..count exactly once, in order. */
export const beatCoverageIssues = (ranges: BeatRange[], count: number): GenerationIssue[] => {
  const issues: GenerationIssue[] = [];
  let expected = 1;
  ranges.forEach((range, index) => {
    if (range.firstSentence !== expected) {
      issues.push({ path: `beats[${index}].firstSentence`, message: `Must be ${expected} so beats cover every sentence in order.` });
    }
    if (range.lastSentence < range.firstSentence) {
      issues.push({ path: `beats[${index}].lastSentence`, message: 'Must not be before firstSentence.' });
    }
    expected = Math.max(expected, range.lastSentence + 1);
  });
  if (expected !== count + 1) issues.push({ path: 'beats', message: `Beats must end at sentence ${count}.` });
  return issues;
};

/**
 * Beats from the model's ranges. Ranges are clamped and repaired so every sentence is used once, in order,
 * which keeps the narration verbatim even when the model miscounts. `toPdfPage` maps a file page to a PDF index.
 */
export const beatsFromRanges = (sentences: string[], ranges: BeatRange[], toPdfPage: (page: number) => number): Beat[] => {
  const beats: Beat[] = [];
  let next = 0;
  for (const range of ranges) {
    if (next >= sentences.length) break;
    const last = Math.min(sentences.length - 1, Math.max(next, range.lastSentence - 1));
    beats.push({
      title: range.title,
      visual: range.visual,
      pages: [...new Set(range.pages.map(toPdfPage))],
      sentences: sentences.slice(next, last + 1),
    });
    next = last + 1;
  }
  if (next < sentences.length) {
    const tail = beats[beats.length - 1];
    if (tail) tail.sentences.push(...sentences.slice(next));
    else beats.push({ title: 'Overview', visual: 'bullets of the key points', pages: [], sentences: sentences.slice(next) });
  }
  return beats;
};

const beatWords = (beat: Beat) => wordCount(beat.sentences.join(' '));

const tooLong = (beat: Beat) => beatWords(beat) > SEGMENT_WORDS.max;

/** Splits text at the clause boundary (or word) nearest its middle. */
const splitText = (text: string): [string, string] => {
  const words = text.split(' ');
  const middle = Math.floor(words.length / 2);
  let best = -1;
  for (let index = 1; index < words.length; index += 1) {
    if (!/[,;:—–-]$/.test(words[index - 1] ?? '')) continue;
    if (best < 0 || Math.abs(index - middle) < Math.abs(best - middle)) best = index;
  }
  const cut = best > 0 && Math.abs(best - middle) <= words.length / 4 ? best : middle;
  return [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
};

const splitBeat = (beat: Beat): [Beat, Beat] => {
  if (beat.sentences.length > 1) {
    const total = beatWords(beat);
    let running = 0;
    let cut = 1;
    let bestGap = Number.POSITIVE_INFINITY;
    beat.sentences.forEach((sentence, index) => {
      running += wordCount(sentence);
      const gap = Math.abs(total / 2 - running);
      if (index < beat.sentences.length - 1 && gap < bestGap) {
        bestGap = gap;
        cut = index + 1;
      }
    });
    return [
      { ...beat, sentences: beat.sentences.slice(0, cut) },
      { ...beat, sentences: beat.sentences.slice(cut) },
    ];
  }
  const [first, second] = splitText(beat.sentences[0] ?? '');
  return [
    { ...beat, sentences: [first] },
    { ...beat, sentences: [second] },
  ];
};

const mergeBeats = (a: Beat, b: Beat): Beat => ({
  title: a.title,
  visual: a.visual,
  pages: [...new Set([...a.pages, ...b.pages])],
  sentences: [...a.sentences, ...b.sentences],
});

export const lessonSeconds = (beats: Beat[]) => beats.reduce((total, beat) => total + framesFor(beatWords(beat)), 0) / FPS;

/**
 * Keeps each TTS request small: splits a beat over SEGMENT_WORDS.max (at a sentence, else a clause) and
 * merges a beat under SEGMENT_WORDS.min into a neighbour when the pair still fits. Narration stays verbatim.
 * Duration is the pre-TTS estimate from framesFor (6–15 s). startFrame is cumulative.
 */
export const normalizeBeats = (input: Beat[]): TimedBeat[] => {
  let beats = input.filter((beat) => beat.sentences.join(' ').trim());

  for (let guard = 0; guard < 500; guard += 1) {
    const index = beats.findIndex(tooLong);
    if (index < 0) break;
    const [first, second] = splitBeat(beats[index]!);
    beats = [...beats.slice(0, index), first, second, ...beats.slice(index + 1)];
  }

  const pairWords = (at: number) => beatWords(beats[at]!) + beatWords(beats[at + 1]!);
  const fits = (count: number) => count <= SEGMENT_WORDS.max;
  for (let changed = true; changed; ) {
    changed = false;
    for (let index = 0; index < beats.length; index += 1) {
      if (beatWords(beats[index]!) >= SEGMENT_WORDS.min) continue;
      const options = [index - 1, index].filter((at) => at >= 0 && at + 1 < beats.length && fits(pairWords(at)));
      if (options.length === 0) continue;
      const at = options.sort((a, b) => pairWords(a) - pairWords(b))[0]!;
      beats = [...beats.slice(0, at), mergeBeats(beats[at]!, beats[at + 1]!), ...beats.slice(at + 2)];
      changed = true;
      break;
    }
  }

  let startFrame = 0;
  return beats.map((beat) => {
    const narration = beat.sentences.join(' ');
    const words = wordCount(narration);
    const durationInFrames = framesFor(words);
    const timed: TimedBeat = { ...beat, narration, words, durationInFrames, startFrame };
    startFrame += durationInFrames;
    return timed;
  });
};

/** Splits a script into beats of roughly equal sentences when the model's beats cannot be used. */
export const fallbackBeats = (sentences: string[]): Beat[] =>
  sentences.map((sentence, index) => ({
    title: index === 0 ? 'Introduction' : `Point ${index + 1}`,
    visual: index === 0 ? 'titleCard' : 'callout keyPoint with the main idea',
    pages: [],
    sentences: [sentence],
  }));
