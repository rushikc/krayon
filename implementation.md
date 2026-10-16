# Krayon — Implementation Materials

Living notes. We add to this as the product gets clearer. Decisions that are still open stay in **Open questions** until we lock them.

## Product

Krayon turns study material — notes, PDFs, and photos — into a **video-first** learning experience.

A lesson looks like a video you can pause. Underneath it is a timeline of Remotion components: React code that draws each stretch, played live in the browser. Because each stretch is its own component, a learner can stop on the part they did not follow and regenerate only that stretch into a longer explanation. The rest of the lesson stays as it is.

NotebookLM is the nearest reference for “source material in, grounded study artifacts out.” The difference is the lesson itself: Krayon leads with a playable lesson, and the learner works inside that lesson (doubt, highlight, note, quiz) instead of only chatting beside a document.

## Pipeline

Three stages, in order. Later stages consume what the earlier stage produced.

### 1. Roadmaps of smaller topics

Ingest the source (notes, PDF pages, photos) and break it into a roadmap of smaller topics.

The roadmap is the spine. Every lesson, study doc, pin, and quiz hangs off a topic on this map, so a learner can see the whole subject as small pieces and enter any piece.

### 2. Lessons and study docs

For each smaller topic, generate:

- A short **lesson** — a playable Remotion timeline. The model writes the Remotion components for that topic.
- A **study doc** for the same topic, so the learner has a readable artifact next to the lesson.

Lessons stay small because they map to small topics. A long subject is many short lessons on the roadmap, not one long file.

### 3. Work inside the lesson

On a playing lesson, the learner can:

- Pause and ask a doubt at that moment.
- Prompt a section to be regenerated as a longer explanation.
- Highlight a section by drawing on the frame.
- Pin what matters.
- Drop a note into the lesson, or remove one.
- Generate a quiz.
- Generate a mock examination.

## Lesson model

This is the core object. Everything interactive hangs off it.

A lesson is a **timeline of segments**. Each segment is:

- A stretch of time (`durationInFrames` at 30 fps).
- A Remotion component: React code that draws that stretch with `useCurrentFrame`, SVG, and DOM. This is the code the model writes.
- Whatever else that stretch needs in order to play (narration is still open; Remotion can host `<Audio>` inside the same component later).

The player runs the segments in order through `<Series>`. To the learner it feels like a video: play, pause, scrub. Nothing is baked into a video file. `@remotion/player` renders the components live.

### Regenerating one section

Example the product has to support:

A lesson is 10 minutes. The learner does not understand a 1 minute stretch.

1. They pause on that stretch.
2. They ask for a deeper explanation (a prompt at that point in the lesson).
3. Krayon regenerates **only that stretch**.
4. The replacement is a 3 minute explanation.
5. The lesson is now 12 minutes.

The other 9 minutes of components are untouched. Only the component for the expanded stretch is rewritten, and its `durationInFrames` changes. Neighboring segments keep their own code and start later in the timeline to make room.

So a “section” is a spliceable unit. Regeneration never means re-rendering the whole lesson.

### Marks that live on the lesson

These are anchored to a moment in the timeline (and, when the learner draws, to a place on the frame):

- **Prompt / doubt** at a timestamp. Can trigger a local regeneration.
- **Drawing / highlight** on the frame, used to point at the part they mean.
- **Pin** for something to keep.
- **Note** added or dropped inside the lesson itself, not in a separate notebook only.

Pins, notes, and drawings have to survive a regeneration of a nearby section, or be remapped onto the new stretch. How they remap is still open.

## What this is not

- It is not an mp4 (or any baked video) pipeline. Generating a lesson means generating a Remotion component per segment.
- It is not “chat with your PDF” as the primary surface. The lesson plays first; doubts, notes, and quizzes happen on the lesson.

## Frontend

The app lives in `frontend/`.

- React 19, Vite, Tailwind CSS 4
- Remotion 4, played in-app with `@remotion/player`

A lesson module exports an ordered list of segments and a composition that plays them with `<Series>`. The stand-in lesson is `frontend/src/remotion/catalog.ts` plus `frontend/src/remotion/sampleLesson.tsx` (“Slope of a line”), with one component per part in `frontend/src/remotion/segments/`. That file layout is the contract for generated lessons: the model replaces one segment component and that segment’s duration. The shell lists those parts and can seek to any of them.

Run it from `frontend/` with `npm run dev`.

## Open questions

### Narration

Graphics are Remotion components. Still unsettled: does a segment also include spoken narration (script + `<Audio>`), or is the lesson visual until we add voice?

### Roadmap shape

- Is the roadmap a prerequisite graph, a linear syllabus, or a tree of topics?
- How small is a “smaller topic” — one idea, one heading from the source, or something the model chooses?

### Study docs

- Are study docs a written companion generated from the same topic brief as the lesson, or a transcript-plus-notes of the lesson after it exists?

### Inputs

- Photos: treat as images of notes/boards and extract text, or also keep the picture as a figure inside the lesson?
- Multiple files: one roadmap per upload, or one roadmap per subject the learner keeps adding to?

### Quizzes and mock exams

- A quiz belongs to one topic lesson. A mock exam spans the roadmap (several topics). Confirm before designing either.

## Backend (local-backend)

- Generation moved off the client. `frontend/src/lib/ai.ts` keeps the prompts, zod validation and repair loop, but uploads the source file once (`/api/uploads`) and calls `/api/ai/generate`, which calls Vertex AI (krayon-ai, global, gemini-2.5-flash) with gcloud ADC. Firebase AI Logic is no longer used for generation.
- Study progress, sources and marks (doubts, pins, notes, highlights) are mirrored to the mock Firestore doc `users/local-user/state/study`. localStorage is still the source of truth; the backend only seeds an empty browser.
- Next: move the prompts and validation into Python, run ingestion as a job (`/api/jobs`), replace the stub auth with Firebase ID tokens, and add Firestore/GCS implementations for deploying to Cloud Run.
