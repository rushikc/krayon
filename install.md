# Krayon — macOS Apple Silicon (M4) Install Guide

Step-by-step commands to bootstrap the Krayon development environment on a fresh macOS Apple Silicon machine.

## Prerequisites

### 1. Xcode Command Line Tools

```bash
xcode-select --install
```

Accept the license if prompted:

```bash
sudo xcodebuild -license accept
```

### 2. Rust (via rustup)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustup default stable
rustc --version
cargo --version
```

### 3. Node.js + pnpm

Install Node.js 20+ (via [nvm](https://github.com/nvm-sh/nvm), Homebrew, or the official installer), then enable pnpm:

```bash
node -v   # should be v20+
corepack enable
corepack prepare pnpm@latest --activate
pnpm -v
```

## Clone & Scaffold

```bash
git clone <your-repo-url> krayon
cd krayon
```

If starting from an empty repo (docs + LICENSE only), scaffold Tauri v2 in place:

```bash
pnpm create tauri-app@latest . --manager pnpm --template react-ts --yes --force --identifier com.krayon.dev
pnpm install
```

## Frontend Dependencies

```bash
# Tailwind v4 + UI stack
pnpm add tailwindcss @tailwindcss/vite zustand gsap lucide-react

# Tauri v2 plugins (JS)
pnpm add @tauri-apps/plugin-shell @tauri-apps/plugin-dialog @tauri-apps/plugin-fs

# Dev tooling
pnpm add -D @types/node
```

Configure Vite path alias and Tailwind plugin in `vite.config.ts`, then initialize shadcn/ui:

```bash
pnpm dlx shadcn@latest init --defaults --force -y
pnpm dlx shadcn@latest add button scroll-area separator -y
```

## Rust / Tauri Backend

```bash
cd src-tauri
cargo add tauri-plugin-shell tauri-plugin-dialog tauri-plugin-fs
cd ..
```

Register the plugins in `src-tauri/src/lib.rs` and configure capabilities in `src-tauri/capabilities/default.json` (see project files for the current state).

## Run the Dev Server

From the project root:

```bash
source "$HOME/.cargo/env"   # if not already in your shell profile
pnpm tauri dev
```

This starts the Vite dev server on `http://localhost:1420` and opens the Krayon window.

> **First run:** The initial `cargo build` downloads and compiles Rust dependencies — expect several minutes. Subsequent runs are much faster.

> **esbuild warning:** If pnpm reports ignored build scripts, add `allowBuilds: { esbuild: true }` to `pnpm-workspace.yaml` (already included in this repo), then re-run `pnpm install`.

## Verify the Mock UI

1. Click **Select Folder** in the sidebar.
2. Choose a directory containing `.mp4` or `.mov` files.
3. Confirm the video list appears in the sidebar — this validates the Tauri dialog → fs → React bridge.

## Optional: FFmpeg Sidecar

When ready to integrate video processing, follow [docs/ffmpeg-backend.md](docs/ffmpeg-backend.md):

1. Download a static FFmpeg build for `aarch64-apple-darwin`.
2. Place it at `src-tauri/binaries/ffmpeg-aarch64-apple-darwin`.
3. Add `"externalBin": ["binaries/ffmpeg"]` to `src-tauri/tauri.conf.json` under `bundle`.

The shell plugin and `shell:allow-execute` capability are already configured.

## Build a Release Bundle

```bash
pnpm tauri build -- --bundles app
```

Output: `src-tauri/target/release/bundle/macos/Krayon.app`
