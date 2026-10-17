import { CloudTasksClient } from '@google-cloud/tasks';
import type { TaskDispatcher, TaskRequest } from '@krayon/shared';

const ALREADY_EXISTS = 6;

/**
 * Named tasks use the dedupe key. Cloud Tasks treats ALREADY_EXISTS as a duplicate,
 * which is how a redelivered dispatch is dropped. There is no render queue.
 */
export const createCloudTasksDispatcher = (): TaskDispatcher => {
  const client = new CloudTasksClient();
  const project = process.env.GOOGLE_CLOUD_PROJECT || 'krayon-ai';
  const location = process.env.REGION || 'asia-south1';
  const workerUrl = (process.env.WORKER_URL || '').replace(/\/$/, '');
  const invoker = process.env.TASKS_INVOKER_EMAIL || '';
  return {
    async dispatch(task: TaskRequest) {
      const parent = client.queuePath(project, location, task.queue);
      const name = task.dedupeKey ? client.taskPath(project, location, task.queue, task.dedupeKey.replace(/[^A-Za-z0-9_-]/g, '_')) : undefined;
      try {
        const [created] = await client.createTask({
          parent,
          task: {
            name,
            dispatchDeadline: { seconds: 1800 },
            scheduleTime: task.delaySeconds ? { seconds: Math.floor(Date.now() / 1000) + task.delaySeconds } : undefined,
            httpRequest: {
              httpMethod: 'POST',
              url: `${workerUrl}/tasks/${task.kind}`,
              headers: { 'Content-Type': 'application/json' },
              body: Buffer.from(JSON.stringify(task.payload)).toString('base64'),
              oidcToken: { serviceAccountEmail: invoker, audience: workerUrl },
            },
          },
        });
        return { taskId: created.name || task.dedupeKey || task.kind, deduped: false };
      } catch (error) {
        const code = (error as { code?: number }).code;
        if (code === ALREADY_EXISTS) return { taskId: name || task.kind, deduped: true };
        throw error;
      }
    },
  };
};
