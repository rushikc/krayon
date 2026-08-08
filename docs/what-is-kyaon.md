Krayon: Architecture & Application Overview

1. Core Purpose and Vision
Krayon is a highly specialized, performance-oriented video editing application designed to streamline the rapid creation of engaging 60 to 120-second reels. Built specifically to eliminate the friction of producing technical edutainment content—such as system design breakdowns, cloud architecture explanations, and DevOps tutorials—Krayon automates the most tedious aspects of the audio-visual editing workflow.

By focusing on script-driven talking-head formats, Krayon empowers creators to record multiple takes without worrying about post-production lag, ensuring strong hooks and seamless delivery.

Key Capabilities:
* Multi-Take Selection: Automatically tracks and helps isolate the best delivery of a specific sentence out of N retries.
* Silence Removal & Auto-Ducking: Programmatically detects dead air and bad takes, stripping them out while ducking background audio to maintain crisp vocal clarity.
* High-Fidelity Export: Fully supports 2K resolution at up to 60fps, ensuring crisp playback on modern mobile screens.
⸻
2. Architectural Foundation: Tauri + React

To achieve desktop-grade processing power without sacrificing a modern, fluid user interface, Krayon utilizes a Hybrid Native Architecture powered by Tauri and React.

The Frontend: React + GSAP
* UI/UX Layer: Built with React, providing a highly modular and component-driven interface for timeline management, media bins, and real-time previews.
* Animation Engine: GSAP (GreenSock Animation Platform) drives the timeline interactions and visual UI animations, ensuring 60fps smoothness when scrubbing through video tracks.
* Memory Footprint: By running in the OS-native webview (WebKit on macOS, WebView2 on Windows/Linux), the frontend remains incredibly lightweight.

The Backend: Rust (Tauri Core)
* System Access: Rust acts as the high-performance bridge between the web UI and the local operating system, offering raw hardware access while maintaining strict memory safety.
* Resource Efficiency: Unlike Electron, which bundles a heavy Chromium instance and Node.js runtime, Tauri apps idle at a fraction of the RAM (typically 30-50MB). This ensures that heavy rendering tasks are not starved of memory.
* Inter-Process Communication (IPC): Tauri’s ultra-fast IPC securely passes large datasets—such as audio waveform peaks for silence detection—between the Rust backend and the React frontend with near-zero latency.
⸻
3. Video Processing Engine: FFmpeg Sidecar

At the heart of Krayon's processing power is FFmpeg, bundled directly into the application as a Tauri sidecar.

Why Native FFmpeg Matters:
* Unthrottled Performance: Bypassing WebAssembly (ffmpeg.wasm) limitations, the native FFmpeg binary leverages maximum CPU and GPU throughput.
* Hardware Acceleration: It interacts directly with the silicon of the host machine. Whether running on a 24GB unified memory M4 architecture or a dedicated Ubuntu desktop rig, it utilizes native hardware encoders (like Apple VideoToolbox or NVENC) to rapidly chew through 2K 60fps exports.
* Resource Isolation: Because Tauri’s Rust backend consumes so little memory, FFmpeg operates without resource contention. This guarantees that the system won't thermally throttle prematurely and that the React UI remains fully responsive even when rendering is maxing out the processor.
⸻
4. Summary of Trade-offs & Advantages
Aspect	Krayon Architecture (Tauri + React)	Traditional Web / Electron Alternative
Export Speed (2K 60fps)	Maximum native speed with hardware acceleration.	Web is highly constrained; Electron competes for system RAM.
UI Responsiveness	UI runs independently of backend heavy-lifting.	Node.js single-thread limits can cause UI stuttering during heavy I/O.
App Size	Extremely lean (<15MB typically).	Massive overhead (150MB+ due to bundled Chromium/Node).
Development Complexity	Moderate to High (requires bridging JS with Rust).	Low (pure JavaScript/Node.js environment).

Krayon represents the optimal balance for modern video tooling: the developer experience and visual fluidity of the web, backed by the uncompromising raw power of native systems programming.