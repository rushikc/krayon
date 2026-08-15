import { useSyncExternalStore } from "react";

import { peekAudioContext, resumeAudioContext } from "@/lib/media/audio-context";

export type TransportEventType = "play" | "pause" | "seek" | "duration";

export interface TransportEvent {
  type: TransportEventType;
  time: number;
}

type TimeListener = (time: number) => void;
type EventListener = (event: TransportEvent) => void;

type ClockBase = "audio" | "wall";

/**
 * The editor's master clock.
 *
 * It runs off `AudioContext.currentTime` whenever the audio graph is running,
 * so picture follows the audio device rather than the other way around — a
 * `<video>` element's own `currentTime` is useless as a clock once clips are
 * cut and rearranged. Before the first user gesture the context may be
 * suspended, in which case the wall clock takes over and the anchor is rebuilt
 * as soon as audio starts running.
 */
class Transport {
  private time = 0;
  private playing = false;
  private duration = 0;
  private anchorClock = 0;
  private anchorTime = 0;
  private anchorBase: ClockBase = "wall";
  private frame: number | null = null;
  private scrubbing = false;
  private timeListeners = new Set<TimeListener>();
  private eventListeners = new Set<EventListener>();

  private baseKind(): ClockBase {
    const ctx = peekAudioContext();
    return ctx && ctx.state === "running" ? "audio" : "wall";
  }

  private baseNow(kind: ClockBase = this.baseKind()): number {
    if (kind === "audio") return peekAudioContext()!.currentTime;
    return performance.now() / 1000;
  }

  private anchor(time: number): void {
    this.anchorBase = this.baseKind();
    this.anchorClock = this.baseNow(this.anchorBase);
    this.anchorTime = time;
  }

  getTime(): number {
    if (!this.playing) return this.time;
    const kind = this.baseKind();
    if (kind !== this.anchorBase) {
      this.anchor(this.time);
      return this.time;
    }
    const elapsed = this.baseNow(kind) - this.anchorClock;
    return Math.max(0, this.anchorTime + elapsed);
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getDuration(): number {
    return this.duration;
  }

  setDuration(duration: number): void {
    if (Math.abs(duration - this.duration) < 1e-6) return;
    this.duration = duration;
    // Deleting or undoing can shorten the sequence out from under the playhead.
    if (this.time > duration) {
      this.time = duration;
      if (this.playing) this.anchor(this.time);
      this.notifyTime(this.time);
    }
    this.emit({ type: "duration", time: this.time });
  }

  play(): void {
    if (this.playing) return;
    if (this.duration <= 0) return;
    if (this.time >= this.duration - 1e-3) this.time = 0;

    this.playing = true;
    this.anchor(this.time);
    const baseAtStart = this.anchorBase;
    void resumeAudioContext().then(() => {
      // Re-anchor once the context is actually running so the audio clock and
      // the timeline agree, and let listeners reschedule against it.
      if (!this.playing) return;
      if (this.baseKind() === baseAtStart) return;
      this.anchor(this.getTime());
      this.emit({ type: "play", time: this.anchorTime });
    });
    this.emit({ type: "play", time: this.time });
    this.tick();
  }

  /**
   * Audio-clock time at which a given timeline position occurs, or `null` when
   * playback isn't currently driven by the audio clock. Lets the audio engine
   * schedule sources that line up exactly with the master clock.
   */
  clockTimeFor(timelineTime: number): number | null {
    if (!this.playing || this.anchorBase !== "audio") return null;
    return this.anchorClock + (timelineTime - this.anchorTime);
  }

  pause(): void {
    if (!this.playing) return;
    this.time = Math.min(this.getTime(), this.duration);
    this.playing = false;
    this.stopFrame();
    this.emit({ type: "pause", time: this.time });
    this.notifyTime(this.time);
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(time: number): void {
    const clamped = Math.min(Math.max(time, 0), Math.max(this.duration, 0));
    this.time = clamped;
    if (this.playing) this.anchor(clamped);
    this.emit({ type: "seek", time: clamped });
    this.notifyTime(clamped);
  }

  nudge(delta: number): void {
    this.seek(this.getTime() + delta);
  }

  /** Lets picture sync trade accuracy for responsiveness while dragging. */
  setScrubbing(scrubbing: boolean): void {
    this.scrubbing = scrubbing;
  }

  isScrubbing(): boolean {
    return this.scrubbing;
  }

  stop(): void {
    this.pause();
    this.seek(0);
  }

  subscribeTime(listener: TimeListener): () => void {
    this.timeListeners.add(listener);
    listener(this.getTime());
    return () => this.timeListeners.delete(listener);
  }

  subscribe(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private emit(event: TransportEvent): void {
    for (const listener of this.eventListeners) listener(event);
  }

  private notifyTime(time: number): void {
    for (const listener of this.timeListeners) listener(time);
  }

  private stopFrame(): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }

  private tick = (): void => {
    if (!this.playing) return;
    const time = this.getTime();
    if (this.duration > 0 && time >= this.duration) {
      this.time = this.duration;
      this.playing = false;
      this.stopFrame();
      this.emit({ type: "pause", time: this.time });
      this.notifyTime(this.time);
      return;
    }
    this.notifyTime(time);
    this.frame = requestAnimationFrame(this.tick);
  };
}

export const transport = new Transport();

export function useTransportPlaying(): boolean {
  return useSyncExternalStore(
    (onChange) => transport.subscribe(onChange),
    () => transport.isPlaying(),
  );
}

export function useTransportDuration(): number {
  return useSyncExternalStore(
    (onChange) => transport.subscribe(onChange),
    () => transport.getDuration(),
  );
}
