---
name: Krayon Tauri v2 Bootstrap
overview: Scaffold the Krayon desktop app as a Tauri v2 + React + TypeScript project (pnpm), wire up shadcn/ui + Tailwind v4 with a frameless macOS-style shell, register the shell/dialog/fs plugins with v2 capabilities, build a working folder-picker → video-list mock UI, and document everything (including a fresh `install.md`) — updating the docs in `docs/` wherever the implementation improves on the original write-ups.
todos:
  - id: scaffold
    content: Run pnpm create tauri-app scaffold (React+TS) in place, pnpm install
    status: in_progress
  - id: tailwind-shadcn
    content: Add Tailwind v4 + shadcn/ui, macOS dark theme tokens, dark-by-default html
    status: pending
  - id: window-config
    content: Configure tauri.conf.json window (frameless, transparent, macOSPrivateApi)
    status: pending
  - id: layout
    content: Build TitleBar/Sidebar/MainStage layout components with drag regions
    status: pending
  - id: plugins
    content: Add shell/dialog/fs Tauri v2 plugins (Cargo + pnpm) and register in lib.rs
    status: pending
  - id: capabilities
    content: Write capabilities/default.json with fs scope and shell:allow-execute
    status: pending
  - id: media-store
    content: Create Zustand media-store for folder path + discovered video files
    status: pending
  - id: media-bin-ui
    content: "Build MediaBinPanel: folder picker -> fs.readDir -> filtered mp4/mov list"
    status: pending
  - id: docs-update
    content: Update docs/ui-design.md and docs/ffmpeg-backend.md for architecture changes
    status: pending
  - id: install-md
    content: Write install.md with exact macOS M4 bootstrap + run commands
    status: pending
  - id: verify
    content: Run pnpm tauri dev to confirm it builds and the bridge works
    status: pending
isProject: false
---

# Krayon Initial Project Setup

## Context from docs
- [docs/what-is-kyaon.md](docs/what-is-kyaon.md) mandates a "Hybrid Native Architecture": React + GSAP frontend, Rust/Tauri core, FFmpeg sidecar for processing.
- [docs/ui-design.md](docs/ui-design.md) specifies shadcn/ui + Tailwind, macOS dark vibrancy theme, `decorations:false` + `data-tauri-drag-region` custom title bar.
- [docs/ffmpeg-backend.md](docs/ffmpeg-backend.md) / [docs/backend-design.md](docs/backend-design.md) specify the sidecar bundling approach (`externalBin`, `shell:allow-execute`).
- The repo currently only has `README.md`, `LICENSE`, and `docs/` — no code yet. `pnpm` and `rustup`/`cargo` are **not installed** on this machine yet, so `install.md` must cover that too.

## Architectural decisions (judgment calls beyond the docs)

1. **State management: Zustand.** The docs don't specify one. Redux/Context would add boilerplate and re-render overhead that fights against a GSAP-driven, 60fps timeline. Zustand stores can be read/written outside React's render cycle (`getState()`/`setState()`), which matters once GSAP needs to mutate playhead/selection state imperatively. Used here for a `media-store` (selected folder + discovered clips).
2. **Tailwind v4, not v3.** The `ui-design.md` snippet used a `tailwind.config.js` + HSL-var pattern (Tailwind v3 idiom). Current `shadcn/ui` + Vite tooling defaults to **Tailwind v4** (CSS-first, `@tailwindcss/vite` plugin, no `tailwind.config.js`, `@theme` blocks in CSS). I'll update `docs/ui-design.md` to reflect this since it changes where the color tokens live.
3. **Defer `externalBin` sidecar wiring.** Tauri validates the sidecar binary's existence when it's actually invoked (and some versions during dev-resource copy); since we don't have a real `ffmpeg-aarch64-apple-darwin` binary yet, wiring `externalBin` now risks breaking `pnpm tauri dev`. I'll register `tauri-plugin-shell` and the `shell:allow-execute` capability (so the permission surface is ready), but leave `externalBin` + the actual binary drop-in to when FFmpeg is integrated, per [docs/ffmpeg-backend.md](docs/ffmpeg-backend.md) (already documents that step well — no change needed there beyond a short note).
4. **Broad `fs` scope for user-picked folders.** Krayon must browse arbitrary folders the user picks via the native dialog (could be anywhere on disk / an external volume), not just `$HOME` or `$APPDATA`. Tauri v2's `fs` scope is glob-based, so I'll grant `{"path": "**"}` on `fs:allow-read-dir` / `fs:allow-read-text-file` / `fs:allow-exists`. This is intentionally broad for a creative tool (same posture as VS Code/Photoshop); I'll flag it as a spot to tighten before shipping.
5. **Feature-oriented `src/` layout** instead of one flat `components/` folder — keeps room to grow into timeline/media-bin/export features without a restructure later.

## 1. Project scaffold (pnpm + Tauri v2 + React + TS)

Since `docs/`, `README.md`, `LICENSE` already exist, scaffold in place using `.` as the project name:

```bash
pnpm create tauri-app@latest . --manager pnpm --template react-ts
pnpm install
```

Resulting structure (after plugin/UI setup below):

```
krayon/
├── docs/
├── install.md                     (new)
├── index.html
├── vite.config.ts
├── components.json                 (shadcn)
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css                   (Tailwind v4 theme, macOS tokens)
│   ├── components/
│   │   ├── ui/                     (shadcn: button, scroll-area, separator…)
│   │   └── layout/
│   │       ├── TitleBar.tsx
│   │       ├── Sidebar.tsx
│   │       └── MainStage.tsx        (preview + timeline placeholder)
│   ├── features/
│   │   └── media-bin/
│   │       └── MediaBinPanel.tsx    (folder picker + file list)
│   ├── stores/
│   │   └── media-store.ts           (zustand)
│   ├── types/
│   │   └── media.ts
│   └── lib/
│       └── utils.ts                 (shadcn `cn` helper)
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/
    │   └── default.json
    ├── binaries/                     (empty, .gitkeep — sidecar drop-in later)
    └── src/
        ├── main.rs
        └── lib.rs
```

## 2. macOS styling + shadcn/ui

- `pnpm add tailwindcss @tailwindcss/vite` + register the Vite plugin in `vite.config.ts`, add the `@` path alias.
- `pnpm dlx shadcn@latest init --base-color zinc --yes` (detects the existing Vite + Tailwind v4 setup, writes `components.json` + `src/index.css`).
- `pnpm dlx shadcn@latest add button scroll-area separator`
- `pnpm add zustand gsap lucide-react`

`src/index.css` gets macOS dark-mode tokens (Tailwind v4 CSS-first form) plus vibrancy/font/no-select rules:

```css
@import "tailwindcss";
@custom-variant dark (&:is(.dark *));

:root {
  --background: hsl(0 0% 100%);
  --foreground: hsl(240 10% 3.9%);
  --primary: hsl(211 100% 50%); /* Apple Blue */
  --border: hsl(240 5.9% 90%);
  --radius: 0.5rem;
  /* …remaining shadcn tokens… */
}

.dark {
  --background: hsl(240 5% 15%);
  --foreground: hsl(0 0% 98%);
  --card: hsl(240 5% 18%);
  --secondary: hsl(240 3.7% 25%);
  --muted-foreground: hsl(240 5% 64.9%);
  --border: hsl(240 3.7% 25%);
  /* …matches docs/ui-design.md dark palette… */
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-border: var(--border);
  --radius-md: var(--radius);
}

@layer base {
  * { @apply border-border; }
  body {
    @apply bg-background text-foreground;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif;
    user-select: none; /* desktop app feel */
  }
}
```

`index.html` sets `<html class="dark">` so Krayon opens in dark mode by default (video-editor default per the docs).

`src-tauri/tauri.conf.json` window config (per `docs/ui-design.md`):

```json
{
  "productName": "Krayon",
  "identifier": "com.krayon.dev",
  "app": {
    "windows": [
      {
        "title": "Krayon",
        "width": 1280,
        "height": 800,
        "decorations": false,
        "transparent": true,
        "macOSPrivateApi": true
      }
    ]
  },
  "bundle": {
    "macOS": { "minimumSystemVersion": "12.0" }
  }
}
```

`App.tsx` composes `TitleBar` (drag region) + `Sidebar` (translucent, `backdrop-blur-2xl`, hosts `MediaBinPanel`) + `MainStage` (video preview / timeline placeholder), matching the layout in `docs/ui-design.md` but componentized.

## 3. Tauri v2 plugins

Rust side (`cd src-tauri`):

```bash
cargo add tauri-plugin-shell
cargo add tauri-plugin-dialog
cargo add tauri-plugin-fs
```

JS side:

```bash
pnpm add @tauri-apps/plugin-shell @tauri-apps/plugin-dialog @tauri-apps/plugin-fs
```

`src-tauri/src/lib.rs`:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

`src-tauri/capabilities/default.json`:

```json
{
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:default",
    "fs:default",
    { "identifier": "fs:allow-read-dir", "allow": [{ "path": "**" }] },
    { "identifier": "fs:allow-read-text-file", "allow": [{ "path": "**" }] },
    { "identifier": "fs:allow-exists", "allow": [{ "path": "**" }] },
    {
      "identifier": "shell:allow-execute",
      "allow": [
        { "name": "binaries/ffmpeg", "sidecar": true, "args": [{ "validator": "\\S+" }] }
      ]
    }
  ]
}
```

## 4. Mock UI: folder → video list

`src/stores/media-store.ts` (Zustand):

```typescript
interface MediaFile { name: string; path: string }
interface MediaBinState {
  folderPath: string | null;
  files: MediaFile[];
  isLoading: boolean;
  error: string | null;
  setFolder: (path: string, files: MediaFile[]) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
}
```

`src/features/media-bin/MediaBinPanel.tsx`:
- "Select Folder" button → `open({ directory: true })` from `@tauri-apps/plugin-dialog`.
- On selection → `readDir(selected)` from `@tauri-apps/plugin-fs`, filter entries where `entry.isFile` and extension is `mp4`/`mov` (case-insensitive), `join()` full paths via `@tauri-apps/api/path`.
- Renders results as a list in the sidebar (icon + filename), with loading/empty states.

This proves the full IPC bridge: React → Tauri dialog plugin → Tauri fs plugin → back to React state.

## 5. `install.md`

New file at repo root with exact, sequential macOS Apple Silicon (M4) bootstrap commands:
1. Xcode Command Line Tools (`xcode-select --install`).
2. Rust via `rustup` (`curl ... | sh`, then `source $HOME/.cargo/env`).
3. Node.js (assume present, e.g. via `nvm`/Homebrew) + enable pnpm via Corepack (`corepack enable`, `corepack prepare pnpm@latest --activate`).
4. Clone/enter repo, run the scaffold command from Section 1.
5. Install Tailwind/shadcn/plugins (Sections 2–3 commands, in order).
6. `pnpm tauri dev` to launch the dev app, with a note on first-run Xcode license/simulator prompts.
7. Optional: pointer to `docs/ffmpeg-backend.md` for dropping in the real FFmpeg sidecar binary later.

## Docs updates

- `docs/ui-design.md`: add a short note/section that the project uses **Tailwind v4** (CSS-first `@theme`, no `tailwind.config.js`) instead of the v3-style config shown, and that state is managed via **Zustand** (`src/stores/media-store.ts`).
- `docs/ffmpeg-backend.md`: add a one-line note that `shell:allow-execute` + plugin registration are already in place from initial setup; only `externalBin` + the actual binary remain to be added when FFmpeg integration begins.

## Todos
