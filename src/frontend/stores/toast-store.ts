import { create } from "zustand";

interface ToastItem {
  id: number;
  message: string;
}

interface ToastStore {
  toasts: ToastItem[];
  show: (message: string) => void;
}

let nextId = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  show: (message) => {
    const id = ++nextId;
    set((state) => ({ toasts: [...state.toasts, { id, message }] }));
    window.setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 2500);
  },
}));

export function toast(message: string) {
  useToastStore.getState().show(message);
}
