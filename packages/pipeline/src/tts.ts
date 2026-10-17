import { createHash } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import { GenerationError, mediaId } from '@krayon/shared';
import type { BlobStorage, GenerationErrorCode, SegmentAudio } from '@krayon/shared';
import { audioKey } from './keys.js';
import { backoffMs } from './gemini.js';
import type { PipelineLogger } from './gemini.js';
import { createPriorityQueue } from './queue.js';
import type { Priority } from './queue.js';

export const TTS_SYNTHESIZE_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
export const TTS_VOICES_URL = 'https://texttospeech.googleapis.com/v1/voices';

const TTS_ATTEMPTS = 5;
const TTS_TIMEOUT_MS = 30_000;

export type TtsConfig = {
  enabled: boolean;
  voice: string;
  rate: number;
  concurrency: number;
  quotaProject: string;
};

export type TtsClient = {
  voice: (uid: string, narration: string, priority: Priority) => Promise<SegmentAudio>;
  health: () => Promise<{ ok: boolean; error?: string }>;
  clear: () => void;
};

export const ttsHash = (voice: string, rate: number, narration: string) =>
  createHash('sha256').update(`${voice}|${rate}|wav|${narration}`).digest('hex');

const tag = (data: Uint8Array, offset: number) =>
  String.fromCharCode(data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0, data[offset + 3] ?? 0);

/** Seconds of audio from a LINEAR16 WAV: data bytes ÷ (sample rate × 2). */
export const wavSeconds = (data: Uint8Array): number => {
  if (data.length < 44 || tag(data, 0) !== 'RIFF' || tag(data, 8) !== 'WAVE') throw new Error('Not a WAV file');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let sampleRate = 0;
  let offset = 12;
  while (offset + 8 <= data.length) {
    const id = tag(data, offset);
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ' && offset + 16 <= data.length) sampleRate = view.getUint32(offset + 12, true);
    if (id === 'data') {
      if (sampleRate <= 0) throw new Error('WAV sample rate missing');
      return size / (sampleRate * 2);
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('WAV data chunk missing');
};

export const classifyTtsFailure = (status: number, text: string): GenerationErrorCode => {
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(text)) return 'QUOTA';
  if (status === 401 || status === 403 || /UNAUTHENTICATED|PERMISSION_DENIED/i.test(text)) return 'AUTH';
  if (status === 400 || /INVALID_ARGUMENT/i.test(text)) return 'INVALID';
  if (status === 408 || /timeout|aborted|DEADLINE/i.test(text)) return 'TIMEOUT';
  return 'UPSTREAM';
};

const retryable = (code: GenerationErrorCode) => code === 'QUOTA' || code === 'UPSTREAM' || code === 'TIMEOUT';

const readToken = async () => {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const headers = await client.getRequestHeaders();
  const value = headers.Authorization ?? headers.authorization;
  if (!value) throw new Error('Application Default Credentials did not return a token.');
  return value.replace(/^Bearer\s+/i, '');
};

export const createTts = (
  config: TtsConfig,
  log: PipelineLogger,
  deps: {
    blobs: BlobStorage;
    fetch?: typeof fetch;
    token?: () => Promise<string>;
    sleep?: (ms: number) => Promise<void>;
  },
): TtsClient => {
  const queue = createPriorityQueue({ limit: () => Math.max(1, config.concurrency) });
  const fetchImpl = deps.fetch ?? fetch;
  const token = deps.token ?? readToken;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const memory = new Map<string, SegmentAudio>();

  const headers = async () => ({
    Authorization: `Bearer ${await token()}`,
    'x-goog-user-project': config.quotaProject,
  });

  const synthesize = async (text: string): Promise<{ data: Uint8Array; seconds: number }> => {
    let last = new GenerationError('UPSTREAM', [{ path: 'audio', message: 'TTS failed.' }], 1);
    for (let attempt = 0; attempt < TTS_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
      try {
        const response = await fetchImpl(TTS_SYNTHESIZE_URL, {
          method: 'POST',
          signal: controller.signal,
          headers: { ...(await headers()), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text },
            voice: { languageCode: 'en-US', name: config.voice },
            audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000, speakingRate: config.rate },
          }),
        });
        if (!response.ok) {
          const body = await response.text();
          const code = classifyTtsFailure(response.status, body);
          last = new GenerationError(code, [{ path: 'audio', message: `TTS ${response.status}` }], attempt + 1);
          if (!retryable(code) || attempt === TTS_ATTEMPTS - 1) throw last;
          await sleep(backoffMs(attempt));
          continue;
        }
        const parsed = (await response.json()) as { audioContent?: string };
        if (!parsed.audioContent) {
          throw new GenerationError('UPSTREAM', [{ path: 'audio', message: 'TTS returned no audio.' }], attempt + 1);
        }
        const data = Uint8Array.from(Buffer.from(parsed.audioContent, 'base64'));
        return { data, seconds: wavSeconds(data) };
      } catch (error) {
        if (error instanceof GenerationError) {
          if (!retryable(error.code) || attempt === TTS_ATTEMPTS - 1) throw error;
          last = error;
          await sleep(backoffMs(attempt));
          continue;
        }
        const aborted = error instanceof Error && (error.name === 'AbortError' || /aborted|timeout/i.test(error.message));
        const code: GenerationErrorCode = aborted ? 'TIMEOUT' : 'UPSTREAM';
        last = new GenerationError(code, [{ path: 'audio', message: error instanceof Error ? error.message : 'TTS failed' }], attempt + 1);
        if (!retryable(code) || attempt === TTS_ATTEMPTS - 1) throw last;
        await sleep(backoffMs(attempt));
      } finally {
        clearTimeout(timer);
      }
    }
    throw last;
  };

  const remember = (uid: string, hash: string, audio: SegmentAudio) => {
    memory.set(`${uid}/${hash}`, audio);
    return audio;
  };

  const cached = async (uid: string, hash: string): Promise<SegmentAudio | null> => {
    const known = memory.get(`${uid}/${hash}`);
    if (known && (await deps.blobs.stat(audioKey(uid, hash)))) return known;
    memory.delete(`${uid}/${hash}`);
    const found = await deps.blobs.get(audioKey(uid, hash));
    if (!found) return null;
    const audio: SegmentAudio = {
      blobId: mediaId(audioKey(uid, hash)),
      hash,
      seconds: wavSeconds(found.data),
      voice: config.voice,
      rate: config.rate,
      format: 'wav',
    };
    memory.set(`${uid}/${hash}`, audio);
    return audio;
  };

  const voice = async (uid: string, narration: string, priority: Priority): Promise<SegmentAudio> => {
    const hash = ttsHash(config.voice, config.rate, narration);
    const started = Date.now();
    let queueWait = 0;
    const existing = await cached(uid, hash);
    if (existing) {
      log.info('TTS cache hit', {
        event: 'tts',
        call_type: 'tts',
        chars: narration.length,
        ms: Date.now() - started,
        seconds: existing.seconds,
        cache_hit: true,
        queue_wait_ms: 0,
      });
      return existing;
    }
    const made = await queue.run(
      priority,
      async () => {
        const again = await cached(uid, hash);
        if (again) return { hit: true as const, audio: again };
        const fresh = await synthesize(narration);
        return { hit: false as const, ...fresh };
      },
      (wait) => {
        queueWait = wait;
      },
    );
    if (made.hit) {
      log.info('TTS cache hit', {
        event: 'tts',
        call_type: 'tts',
        chars: narration.length,
        ms: Date.now() - started,
        seconds: made.audio.seconds,
        cache_hit: true,
        queue_wait_ms: queueWait,
      });
      return made.audio;
    }
    const { data, seconds } = made;
    const key = audioKey(uid, hash);
    await deps.blobs.put(key, data, { contentType: 'audio/wav' });
    const audio: SegmentAudio = { blobId: mediaId(key), hash, seconds, voice: config.voice, rate: config.rate, format: 'wav' };
    log.info('TTS synthesized', {
      event: 'tts',
      call_type: 'tts',
      chars: narration.length,
      ms: Date.now() - started,
      seconds,
      cache_hit: false,
      queue_wait_ms: queueWait,
    });
    return remember(uid, hash, audio);
  };

  const health = async () => {
    try {
      const response = await fetchImpl(`${TTS_VOICES_URL}?languageCode=en-US`, { headers: await headers() });
      if (!response.ok) {
        const body = await response.text();
        return { ok: false, error: `TTS ${response.status}: ${body.slice(0, 180)}` };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'TTS health check failed' };
    }
  };

  return {
    voice,
    health,
    clear: () => {
      memory.clear();
      queue.clear();
    },
  };
};
