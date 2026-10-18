# Krayon — Implementation Materials

Living notes. We add to this as the product gets clearer. Decisions that are still open stay in **Open questions** until we lock them.

## Product

Krayon turns study material — notes, PDFs, and photos — into a **video-first** learning experience.

A lesson looks like a video you can pause. Underneath it is a timeline of Remotion scenes: layout JSON drawn by shared templates, played live in the browser. Because each stretch is its own segment, a learner can stop on the part they did not follow and regenerate only that stretch. The rest of the lesson stays as it is.

NotebookLM is the nearest reference for “source material in, grounded study artifacts out.” The difference is the lesson itself: Krayon leads with a playable lesson, and the learner works inside that lesson (doubt, highlight, note) instead of only chatting beside a document.

## Pipeline

Course → chapter → lesson → segment. Stages live in `packages/pipeline`. Later stages consume what the earlier stage stored, so a restart resumes.

### 1. Structure

Ingest the source (PDF pages, photos) and split it into chapters with printed TOC pages and file pages (`packages/pipeline/src/chapters.ts` structure call, `packages/pipeline/src/pageRanges.ts`). Front and back matter are skipped.

### 2. Chapters

For each chapter: `chapterText` (sliced pages), `lessonOutline`, one `lessonScript` per lesson, and a **study doc** per lesson. A long subject is many short lessons, not one long file.

### 3. Lesson render

Only chapter 1 lesson 1 starts on its own; others start on `POST /api/lessons/:id/render`.

`beats` splits the script → when TTS is on, Chirp 3 HD synthesizes one WAV per segment (`packages/pipeline/src/tts.ts`) → `retime` sets duration from audio → per segment: scene JSON → validate/repair → keyframes → review/fix. `MAX_REVIEW_ROUNDS` defaults to 2; `REVIEW_PASS_SCORE` defaults to 8.

The model writes scene JSON. Shared templates in `packages/shared/src/remotion/templates/` draw it (`titleCard`, `bullets`, `flow`, `compare`, `hubSpoke`, `chart`, `timeline`, `callout`). The player is `@remotion/player`. Nothing is baked into an mp4.

### Regenerating one section

A lesson is 10 minutes. The learner does not understand a 1 minute stretch.

1. They pause on that stretch.
2. They ask for a deeper explanation.
3. Krayon regenerates **only that stretch**.
4. The replacement is a 3 minute explanation.
5. The lesson is now 12 minutes.

Neighboring segments keep their own scenes and start later in the timeline to make room.

### Marks that live on the lesson

Anchored to a moment in the timeline (and, when the learner draws, to a place on the frame):

- **Prompt / doubt** at a timestamp. Can trigger a local regeneration.
- **Drawing / highlight** on the frame.
- **Pin** for something to keep.
- **Note** added or dropped inside the lesson.

How those marks remap after a nearby segment is regenerated is still open.

## What this is not

- It is not an mp4 (or any baked video) pipeline.
- It is not “chat with your PDF” as the primary surface. The lesson plays first; doubts and notes happen on the lesson.

## Frontend

The app lives in `frontend/`. React 19, Vite, Tailwind CSS 4, Remotion 4 with `@remotion/player`. Run it from the repo root with `npm run dev`. See `README.md`.

## Open questions

- Quiz generation (today the quiz tool is a checklist of doubt prompts).
- Mock exam.
- How pins, notes, and drawings remap after a segment regenerate.

## Backends

GCP layout and deploy order: `backend/architecture.md`. Local mock endpoints and storage: `local-backend/README.md`.
