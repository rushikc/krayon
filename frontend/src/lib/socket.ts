import type { CourseState, PipelineEvent, ServerMessage } from '@krayon/shared';

const socketUrl = (courseId: string) => {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
  if (base) return `${base.replace(/^http/, 'ws')}/ws?courseId=${encodeURIComponent(courseId)}&uid=local-user`;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws?courseId=${encodeURIComponent(courseId)}&uid=local-user`;
};

export type CourseSocket = {
  close: () => void;
};

/** Follows one course: a snapshot on connect, then events. Reconnects with backoff. */
export const connectCourse = (
  courseId: string,
  handlers: {
    onSnapshot: (course: CourseState) => void;
    onEvent: (event: PipelineEvent) => void;
    onReconnect?: () => void;
  },
): CourseSocket => {
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;

  const open = () => {
    if (closed) return;
    socket = new WebSocket(socketUrl(courseId));
    socket.addEventListener('open', () => {
      const reconnected = attempt > 0;
      attempt = 0;
      if (reconnected) handlers.onReconnect?.();
      socket?.send(JSON.stringify({ type: 'subscribe', courseId }));
    });
    socket.addEventListener('message', (message) => {
      let parsed: ServerMessage;
      try {
        parsed = JSON.parse(String(message.data)) as ServerMessage;
      } catch {
        return;
      }
      if (parsed.type === 'snapshot') handlers.onSnapshot(parsed.course);
      if (parsed.type === 'event') handlers.onEvent(parsed.event);
    });
    socket.addEventListener('close', () => {
      if (closed) return;
      attempt += 1;
      window.setTimeout(open, Math.min(8000, 400 * attempt));
    });
  };

  open();

  return {
    close: () => {
      closed = true;
      socket?.close();
    },
  };
};
