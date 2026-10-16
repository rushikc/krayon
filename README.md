# Krayon

Krayon turns notes, PDFs, and photos into a video-first study experience.

A lesson looks like a video you can pause. Underneath, it is a timeline of [Remotion](https://www.remotion.dev/) components: React code that draws each stretch and plays live in the browser. Nothing is baked into an mp4. Because each stretch is its own component, a learner can stop on the part they did not follow and regenerate only that stretch into a longer explanation. The rest of the lesson stays as it is.

The nearest reference is NotebookLM: source material in, grounded study artifacts out. Krayon leads with the playable lesson. Doubts, highlights, notes, and quizzes happen on the lesson itself.

## How a lesson is built

1. **Roadmap.** The source is split into smaller topics. Every lesson, study doc, pin, and quiz hangs off one of those topics.
2. **Lesson and study doc. Each topic gets a short Remotion lesson and a written study doc. A long subject is many short lessons, not one long file.**
3. **Work inside the lesson.** Pause and ask a doubt, redraw one section, highlight by drawing on the frame, pin what matters, drop or remove a note, then generate a quiz or a mock exam.

A lesson is a list of segments. Each segment has a duration and a Remotion component. `<Series>` plays them in order. Replacing one component and its duration lengthens or shortens only that part. A 1 minute stretch can become a 3 minute explanation, and a 10 minute lesson becomes 12 minutes, without rewriting the other 9 minutes.

The stand-in lesson is “Slope of a line”: three segments you can play and seek between.

## Test materials and input assumptions

Krayon expects two kinds of input:

- **Lecturer PDFs**: handouts and study material that are mostly text, with a few diagrams, tables and practice questions.
- **Student photos (JPG)**: phone photos of textbook pages, handwritten notes on ruled or graph paper, and filled-in paper worksheets. Expect slight rotation, perspective, shadows and uneven lighting.

Sample inputs for testing live on the Desktop (all mocks). For now the topics favour explanations built from boxes, diagrams and text rather than math and physics:

- `~/Desktop/Business-Porters-Five-Forces/`: one lecturer handout PDF
- `~/Desktop/Economics-Supply-and-Demand/`: four student photos (handwritten notes, a graph-paper diagram, a textbook page, a worksheet)
- `~/Desktop/Software-Client-Server-and-REST-APIs/`: one lecturer handout PDF and three student photos

## Stack

- React, Vite, and Tailwind in `frontend/`
- Remotion, played in the app with `@remotion/player`
- Firebase project `krayon-ai` (Analytics today, Hosting for the deployed app)



## Run locally

```bash
cd frontend
npm install
npm run dev
```

Copy `frontend/.env.example` to `frontend/.env` and fill in the Firebase web config. The real `.env` stays out of git.

## Deploy

Hosting is the `krayon-ai` site. From the repo root, after a production build:

```bash
cd frontend && npm run build
cd .. && firebase deploy --only hosting
```

Live app: [https://krayon-ai.web.app](https://krayon-ai.web.app)
## Local backend

All API traffic now goes through `local-backend/`, a Python (FastAPI) server that mimics Google Cloud locally. It makes real Gemini calls server-side, and mocks Firestore (SQLite), Cloud Storage (local files), Auth (stub user) and background jobs. Start it with `local-backend/run.sh` (Vertex AI on `krayon-ai` via gcloud Application Default Credentials), then run `npm run dev` in `frontend/`. Vite proxies `/api` to it. See `local-backend/README.md`.
