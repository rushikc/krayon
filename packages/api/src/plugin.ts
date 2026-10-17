import type { FastifyInstance } from 'fastify';
import type { ApiDeps } from './deps.js';
import { aiGenerate, postUpload } from './services/ai.js';
import { createCourse, getChapters, getCourse, listCourses, registerCourseJobs, retryChapter, retryCourse } from './services/courses.js';
import { deleteDoc, getDoc, putDoc } from './services/docs.js';
import { getHealth, getMe } from './services/health.js';
import { getJob, postJob } from './services/jobs.js';
import { askLesson, getLesson, putProgress, regenerateSegment, registerLessonJobs, renderLesson, rerenderLesson } from './services/lessons.js';
import { serveAudio, serveRender } from './services/media.js';

/** Every `/api/*` route except `/api/admin/*`. */
export const registerKrayonApi = (app: FastifyInstance, deps: ApiDeps) => {
  registerCourseJobs(deps);
  registerLessonJobs(deps);
  app.get('/api/health', getHealth(deps));
  app.get('/api/me', getMe(deps));
  app.post('/api/uploads', postUpload(deps));
  app.post('/api/ai/generate', aiGenerate(deps));
  app.post('/api/courses', createCourse(deps));
  app.get('/api/courses', listCourses(deps));
  app.get('/api/courses/:id', getCourse(deps));
  app.get('/api/courses/:id/chapters', getChapters(deps));
  app.post('/api/courses/:id/retry', retryCourse(deps));
  app.post('/api/chapters/:id/retry', retryChapter(deps));
  app.get('/api/lessons/:id', getLesson(deps));
  app.post('/api/lessons/:id/render', renderLesson(deps));
  app.post('/api/lessons/:id/retry', renderLesson(deps));
  app.post('/api/lessons/:id/rerender', rerenderLesson(deps));
  app.post('/api/lessons/:id/segments/:segmentId/regenerate', regenerateSegment(deps));
  app.put('/api/lessons/:id/progress', putProgress(deps));
  app.post('/api/lessons/:id/ask', askLesson(deps));
  app.get('/api/audio/:blobId', serveAudio(deps));
  app.get('/api/renders/:blobId', serveRender(deps));
  app.get('/api/docs/*', getDoc(deps));
  app.put('/api/docs/*', putDoc(deps));
  app.delete('/api/docs/*', deleteDoc(deps));
  app.post('/api/jobs', postJob(deps));
  app.get('/api/jobs/:id', getJob(deps));
};
