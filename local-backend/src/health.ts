import { settings } from './config.js';
import { getLogger } from './logging.js';

const log = getLogger('krayon.health');

export const ADC_FIX = 'run: gcloud auth application-default login';

type Check = { ok: boolean; error?: string };

let adc: Check = { ok: false, error: 'Checking Application Default Credentials.' };
let tts: Check & { enabled: boolean } = { ok: true, enabled: false };
let rendererHealth: () => Check = () => ({ ok: false, error: 'Starting the renderer.' });
let adcCheck: Promise<void> = Promise.resolve();

export const setRendererHealth = (read: () => Check) => {
  rendererHealth = read;
};

export const healthSnapshot = () => {
  const renderer = rendererHealth();
  return {
    ok: adc.ok && renderer.ok,
    adc,
    renderer,
    tts,
    model: settings.geminiModel,
    project: settings.googleCloudProject,
    location: settings.googleCloudLocation,
  };
};

export const adcReady = () => adc.ok;

/** Resolves once the startup ADC check finishes. Null when credentials are usable. */
export const adcFailure = async () => {
  await adcCheck;
  return adc.ok ? null : (adc.error ?? ADC_FIX);
};

export const noteTts = (result: Check & { enabled: boolean }) => {
  tts = result;
};

/** A free voices.list call. Skipped when TTS is off, so a silent video does not need the API. */
export const startTtsCheck = (check: () => Promise<Check>) => {
  tts = { ok: false, enabled: true, error: 'Checking Text-to-Speech.' };
  void check()
    .then((result) => {
      tts = { ...result, enabled: true };
      if (!result.ok) log.error(`TTS check failed. ${result.error ?? ''}`, { event: 'health.tts', error: result.error });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      tts = { ok: false, enabled: true, error: message };
      log.error(`TTS check failed. ${message}`, { event: 'health.tts', error: message });
    });
};

export const startAdcCheck = () => {
  adcCheck = (async () => {
    try {
      const mod = (await import('google-auth-library')) as {
        GoogleAuth: new (options?: { scopes?: string[] }) => { getAccessToken: () => Promise<string | null | undefined> };
      };
      const auth = new mod.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      const token = await auth.getAccessToken();
      if (!token) throw new Error('Application Default Credentials did not return a token.');
      adc = { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      adc = { ok: false, error: `${message} ${ADC_FIX}` };
      log.error(`ADC check failed. ${ADC_FIX}`, { event: 'health.adc', error: message });
    }
  })();
};
