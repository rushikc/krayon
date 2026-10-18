# Krayon on GCP

The public site has no login screen. On load the browser signs in anonymously. If that fails it shows "Couldn't connect, retry". Courses are shared: any visitor can list, open, play, render, retry, and regenerate. Progress and study notes stay on the visitor (`users/{visitorUid}/progress` and `users/{visitorUid}/state`). Blobs stay under the uploader (`users/{ownerUid}/...`).

Three Cloud Run services in `asia-south1`. Vertex stays `global`. The browser calls `krayon-api` directly. Firebase Hosting does not rewrite `/api`.

```text
anonymous browser --> krayon-api (public)
                        | Cloud Tasks, OIDC as krayon-tasks
                        v
                     krayon-worker --> krayon-renderer (private)
                        |
                        +--> Firestore, GCS, Vertex Gemini, Cloud TTS
```

`local-backend/` runs the same pipeline. Caps default to 0 there, so local use stays unlimited.

## Indexes

`courseIndex/{courseId}`, `chapterIndex/{chapterId}`, and `lessonIndex/{lessonId}` are the lookup. Each stores `ownerUid`. The API resolves the owner, then reads and writes course docs under that uid. `GET /api/courses/:id` writes `courseViews/{courseId}.lastViewedAt`. A course viewed in the last two minutes uses the `ai-user` queue. Startup recovery copies existing course, chapter, and lesson docs (and leftover per-user indexes) into these indexes.

## Caps

`usage/{YYYY-MM-DD}` (Asia/Kolkata) is one transaction. Defaults are 0 (off). The demo env is uploads 2 per visitor, courses 10, lesson renders 40, regenerates 40, asks 300. Over the cap the API returns `429 { code: 'demo_limit', message: 'Demo limit reached for today, try again tomorrow.' }`. A render that is already ready, queued, or rendering does not count and does not dispatch again.

## Tasks

Task ids are `[A-Za-z0-9_-]{1,500}` and include the owner, the course or lesson or segment, the stage, and the generation. Longer ids are hashed. `courseGen`, `chapterGen`, and `renderGen` live on the entity. A retry bumps the gen inside the claim. A claim treats `failed` as finished only when the task gen is not newer. Retry resets failed and voice-failed segments to pending and leaves ready ones. Rerender passes `force` and replans.

Queues: `ai-user`, `ai-auto`, `ai-background`, `tts`. Deadline is 1800s on the task. `maxAttempts` 3. The worker timeout is 1800s. On the last attempt the worker marks the segment, lesson, or chapter failed, runs fan-in, and returns 2xx. A failed enqueue is HTTP 503.

The sweeper (`POST /tasks/sweep`, every 5 minutes) redispatches chapters, lessons, and segments whose lease expired or whose `updatedAt` is older than `STALE_MINUTES` (15), with a new gen. A lesson that is rendering renews its lease while it plans.

## IAM and deploy order

Scripts in `backend/scripts/` only print commands.

1. Enable APIs (`00-enable-apis.sh`).
2. Firestore in `asia-south1`. Enable Anonymous auth (console: Authentication → Sign-in method → Anonymous) and create a reCAPTCHA Enterprise key for App Check (`05-firestore-and-auth.sh`).
3. Queues (`10-queues.sh`). No `--max-dispatch-deadline`.
4. Service accounts (`20-service-accounts.sh`). API: datastore, cloudtasks.enqueuer, objectViewer on the bucket, `serviceAccountUser` on `krayon-tasks`. Worker: datastore, objectAdmin on the bucket, aiplatform, serviceusage consumer, cloudtasks.enqueuer, `serviceAccountUser` on `krayon-tasks`, `run.invoker` on the renderer. Renderer: no extra roles. `krayon-tasks`: `run.invoker` on the worker.
5. Build with `backend/cloudbuild.*.yaml` (no `--source .`). Deploy the API with `--allow-unauthenticated`, the worker and renderer with `--no-allow-unauthenticated` (`30-deploy-run.sh`). Read the URLs, then redeploy with `WORKER_URL`, `RENDERER_URL`, and `CORS_ORIGINS`.
6. Scheduler audience is `WORKER_URL` (`40-scheduler.sh`).
7. Deploy Hosting. Set `VITE_BACKEND=gcp`, `VITE_API_BASE_URL`, and `VITE_RECAPTCHA_SITE_KEY`. `APP_CHECK_ENFORCE` defaults to false.
