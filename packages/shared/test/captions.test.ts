import { describe, expect, it } from 'vitest';
import { captionAtFrame, packCaptionChunks } from '../src/captions.js';

const first = 'An acyclic graph does not contain any cycles.';
const second = 'Directed edges are one-way streets.';
const third = 'You never follow a path that starts and ends at the same vertex.';
const long = `${first} ${second} ${third}`;

describe('packCaptionChunks', () => {
  it('keeps a short caption as one chunk', () => {
    expect(packCaptionChunks(first)).toEqual([first]);
  });

  it('packs sentences without splitting a sentence, and strips markdown', () => {
    const chunks = packCaptionChunks(`**${first}** ${second} ${third}`);
    expect(chunks.join(' ')).toBe(long);
    expect(chunks.every((chunk) => !chunk.includes('*'))).toBe(true);
    expect(chunks[0]).toContain('cycles');
    expect(chunks.some((chunk) => chunk.includes('one-way'))).toBe(true);
    expect(chunks.at(-1)).toContain('same vertex');
  });
});

describe('captionAtFrame', () => {
  it('returns empty text when there is no narration', () => {
    expect(captionAtFrame('   ', 0, 180)).toBe('');
  });

  it('keeps a short narration on screen for the whole segment', () => {
    expect(captionAtFrame(first, 0, 180)).toBe(first);
    expect(captionAtFrame(first, 90, 180)).toBe(first);
    expect(captionAtFrame(first, 179, 180)).toBe(first);
  });

  it('shows the first chunk at frame 0, a later sentence mid-segment, and the last chunk through the pause', () => {
    expect(captionAtFrame(long, 0, 300)).toContain('cycles');
    expect(captionAtFrame(long, 0, 300)).not.toContain('same vertex');
    expect(captionAtFrame(long, 150, 300)).not.toBe(captionAtFrame(long, 0, 300));
    expect(captionAtFrame(long, 299, 300)).toContain('same vertex');
    expect(captionAtFrame(long, 299, 300)).not.toContain('cycles');
  });
});
