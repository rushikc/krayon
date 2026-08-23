import { create } from "zustand";

interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  autoPlayToken: number;
  lastAutoPlayToken: number;
  setPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  requestAutoPlay: () => void;
  consumeAutoPlay: () => boolean;
  reset: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  autoPlayToken: 0,
  lastAutoPlayToken: 0,

  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),

  requestAutoPlay: () => set((state) => ({ autoPlayToken: state.autoPlayToken + 1 })),

  consumeAutoPlay: () => {
    const { autoPlayToken, lastAutoPlayToken } = get();
    if (autoPlayToken > lastAutoPlayToken) {
      set({ lastAutoPlayToken: autoPlayToken });
      return true;
    }
    return false;
  },

  reset: () => set({ isPlaying: false, currentTime: 0, duration: 0 }),
}));
