import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { ClientMessage } from '@krayon/shared';
import { assembleCourse } from '@krayon/pipeline';
import { events, store } from '../context.js';

export const registerWebsocket = async (app: FastifyInstance) => {
  await app.register(websocket);

  app.get('/ws', { websocket: true }, (socket, request) => {
    const query = request.query as { courseId?: string; uid?: string };
    let courseId = query.courseId ?? '';
    const uid = query.uid || 'local-user';
    let unsubscribe = () => {};

    const sendSnapshot = () => {
      if (!courseId) return;
      const course = assembleCourse(store, uid, courseId);
      if (!course) {
        socket.send(JSON.stringify({ type: 'error', detail: 'Not found' }));
        return;
      }
      socket.send(JSON.stringify({ type: 'snapshot', course }));
    };

    const listen = (id: string) => {
      unsubscribe();
      courseId = id;
      // The most recent subscribe is the course on screen; its work goes first in the queues.
      events.setViewedCourse(id);
      sendSnapshot();
      unsubscribe = events.subscribe(id, (event) => {
        socket.send(JSON.stringify({ type: 'event', event }));
      });
    };

    if (courseId) listen(courseId);

    socket.on('message', (raw: unknown) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        return;
      }
      if (message.type === 'subscribe') {
        listen(message.courseId);
        return;
      }
      if (message.type === 'cancel') {
        events.requestCancel(courseId, message.lessonId, message.segmentId);
      }
    });

    socket.on('close', () => {
      unsubscribe();
      if (events.viewedCourse() === courseId) events.setViewedCourse(null);
    });
  });
};
