let context: AudioContext | null = null;
let master: GainNode | null = null;

type AudioContextCtor = typeof AudioContext;

function resolveCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor })
      .webkitAudioContext ??
    null
  );
}

/** The context is created lazily so nothing is allocated before playback. */
export function getAudioContext(): AudioContext | null {
  if (context) return context;
  const Ctor = resolveCtor();
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

/** Non-allocating peek, used by the transport clock. */
export function peekAudioContext(): AudioContext | null {
  return context;
}

/** Bus every clip's gain node connects to. */
export function getMasterGain(): GainNode | null {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (!master) {
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  return master;
}

export async function resumeAudioContext(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      // Autoplay policy can reject before a user gesture; the transport falls
      // back to the wall clock until a later gesture succeeds.
    }
  }
}
