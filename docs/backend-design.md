Here is a comprehensive guide to setting up a Tauri v2 backend with a bundled FFmpeg sidecar, specifically optimized for your macOS Apple Silicon (M4) environment.

### 1. Prerequisites

Ensure you have the necessary Rust and macOS development tools installed.

1. **Install Xcode Command Line Tools:** `xcode-select --install`
2. **Install Rust:** `curl --proto '=https' --tlsv1.2 -sSf [https://sh.rustup.rs](https://sh.rustup.rs) | sh`
3. **Install Node.js/pnpm:** Ensure you have your preferred JavaScript package manager installed.

### 2. Procuring the FFmpeg Binary

Tauri needs a standalone executable to bundle. Do not use the FFmpeg installed via Homebrew, as it relies on external dynamic libraries that won't exist on your users' machines.

1. Download a static build of FFmpeg for macOS Apple Silicon (`aarch64-apple-darwin`). You can find these on the official FFmpeg site or repositories like `evermeet.cx`.
2. Create a folder in your project: `src-tauri/binaries/`
3. Place the executable there.
4. **Crucial Step:** Tauri requires the binary to be named with the specific Rust target triple of the OS it will run on. Rename the file to:
`src-tauri/binaries/ffmpeg-aarch64-apple-darwin`

### 3. Tauri Configuration (`tauri.conf.json`)

You must explicitly tell Tauri to bundle this binary and grant the frontend permission to execute it.

Update your `src-tauri/tauri.conf.json`:

```json
{
  "bundle": {
    "identifier": "com.krayon.dev",
    "macOS": {
      "minimumSystemVersion": "12.0"
    },
    "externalBin": [
      "binaries/ffmpeg" 
    ]
  }
}

```

*Note: You omit the target triple (`-aarch64-apple-darwin`) in the JSON configuration; Tauri appends it automatically during the build process.*

### 4. Permissions Configuration (`capabilities/default.json`)

In Tauri v2, you must grant explicit permission for the app to execute the sidecar and define exactly what arguments it is allowed to pass. This prevents malicious command injection.

Update your `src-tauri/capabilities/default.json`:

```json
{
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    {
      "identifier": "shell:allow-execute",
      "allow": [
        {
          "name": "binaries/ffmpeg",
          "sidecar": true,
          "args": [
            { "validator": "\\S+" } 
          ]
        }
      ]
    }
  ]
}

```

*(The `\\S+` validator is a regex allowing any non-whitespace argument. For a production release, you should restrict this strictly to the FFmpeg flags you intend to use).*

### 5. Executing the Sidecar from Rust (Recommended)

While you can execute sidecars from the frontend, handling heavy operations like 2K 60fps video processing is best managed in Rust to keep the UI thread entirely free.

Add the `tauri-plugin-shell` to your `Cargo.toml`:

```bash
cd src-tauri && cargo add tauri-plugin-shell

```

In your `src-tauri/src/main.rs`:

```rust
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tauri::Emitter;

#[tauri::command]
async fn process_video(app: tauri::AppHandle, input_path: String, output_path: String) -> Result<(), String> {
    
    // The name here MUST match the name in externalBin
    let sidecar_command = app.shell().sidecar("ffmpeg").unwrap();

    // Example args for hardware-accelerated 2K 60fps encoding on Mac
    let (mut rx, mut child) = sidecar_command
        .args([
            "-y", 
            "-i", &input_path,
            "-c:v", "h264_videotoolbox", // Use Apple Silicon hardware encoder
            "-b:v", "15M",
            "-r", "60",
            "-s", "1440x2560",
            &output_path
        ])
        .spawn()
        .map_err(|e| e.to_string())?;

    // Stream the output back to the React UI for a progress bar
    while let Some(event) = rx.recv().await {
        if let CommandEvent::Stdout(line_bytes) = event {
            let line = String::from_utf8_lossy(&line_bytes);
            app.emit("ffmpeg-progress", Some(line.to_string())).unwrap();
        }
    }

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![process_video])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

```

### 6. The Build Process

When you are ready to package the application as a standalone `.app` bundle for macOS:

Run the build command via your package manager:

```bash
npm run tauri build -- --bundles app

```

*(Or use `yarn`, `pnpm`, or `bun` depending on your setup).*

Tauri will compile your Rust backend, build your React frontend, bundle the `ffmpeg-aarch64-apple-darwin` executable, and wrap it all into a native macOS Application Bundle located in `src-tauri/target/release/bundle/macos/Krayon.app`.

This video walks through hooking up an external binary in a Tauri application and streaming its response back.
[Tauri With External Binary (Sidecar)](https://www.youtube.com/watch?v=dMJKXUFxD0Y)