# Krayon on GCP

Three Cloud Run services in `asia-south1`. Vertex stays `global`. The browser calls `krayon-api` directly (`VITE_API_BASE_URL`). Firebase Hosting does not rewrite `/api`.

```text
frontend  -->  krayon-api (Fastify, no Chrome)
                 |  Cloud Tasks (OIDC)
                 v
              krayon-worker  --HTTP + ID token-->  krayon-renderer (Chrome, 2 vCPU, 4 GiB)
                 |
                 +--> Firestore, GCS, Vertex Gemini, Cloud TTS
```

`local-backend/` is the same pipeline on a laptop. It is never deployed.

## Media

Each narration is one WAV at `users/{uid}/audio/{sha256}.wav`. That object is the TTS cache. Keyframe PNGs live at `users/{uid}/keyframes/{lessonId}/{segmentId}/a{attempt}-r{round}-{frame}.png`. Page text, slices and source PDFs use the keys in `packages/pipeline/src/keys.ts`.

REST ids are `base64url(key)`. `GET /api/audio/:id` requires `Authorization`. `GET /api/renders/:id` accepts `?token=` because an `<img>` cannot send a header. App Check is skipped only on that route. Cloud Run request logs will contain the token. Our own logs redact it.

## Tasks

Queues: `ai-user` (6), `ai-auto` (4), `ai-background` (2), `tts` (4). No render queue. `dispatchDeadline` 1800s, `maxAttempts` 3. The worker timeout is at least 1800s.

`course.structure` opens the first `CHAPTER_CONCURRENCY` (3) `chapter.write` tasks. Each settled chapter claims the next pending chapter. Only chapter 1 lesson 1 auto-renders (`lesson.plan` on `ai-auto`). Then `segment.voice` (tts), `lesson.retime`, `segment.build` (stills inline), `lesson.finalize`. `segment.narrate` regenerates one segment and does not join fan-in.

A handler claims a lease of about 15 minutes and skips work whose output is already stored. Fan-in recounts `segmentsSettled`, `segmentsReady` and `segmentsVoiced` inside a transaction. A `GenerationError` marks the entity failed and the worker returns 2xx. Infrastructure errors return 5xx. The last retry returns 2xx. `POST /tasks/sweep` every 5 minutes requeues leases that have expired.

## Concurrency

Gemini 5, chapters 3, render 2, TTS 4. Queue caps are the other limit. Backoff handles Vertex 429s.

## Firestore

Clients may read their own `users/{uid}/**` and write only `users/{uid}/state/viewing`. Study notes and progress stay on the API. Storage rules deny all client access; the API streams bytes. The GCP UI listens to Firestore. Locally it uses `/ws`.
