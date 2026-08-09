Integrating FFmpeg with a Tauri + Rust backend involves embedding FFmpeg as an external binary, or "sidecar," ensuring your application has the necessary tools to process video without requiring the user to install them separately. Here is a detailed breakdown of how to make FFmpeg work with Tauri and Rust.

> **Initial setup status:** The Krayon scaffold already registers `tauri-plugin-shell` in [`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs) and grants `shell:allow-execute` for `binaries/ffmpeg` in [`src-tauri/capabilities/default.json`](../src-tauri/capabilities/default.json). The `src-tauri/binaries/` directory is ready for the sidecar binary. Remaining work: add `externalBin` to `tauri.conf.json` and drop in the platform-specific FFmpeg executable (see below).


### The Sidecar Concept in Tauri

In Tauri, a sidecar is an external binary bundled with your application to add functionality or prevent users from needing to install additional dependencies. Binaries can be written in any language, and in this case, the binary is the FFmpeg executable.

### 1. Bundling the FFmpeg Binary

To bundle FFmpeg, you need to configure your `tauri.conf.json` file. You use the `externalBin` property within the `bundle` object to specify the path to the binary.

```json
{
  "bundle": {
    "externalBin": [
      "binaries/ffmpeg"
    ]
  }
}

```

The path can be absolute or relative. A relative path is relative to the `tauri.conf.json` file in the `src-tauri` directory.

**Crucial Step for Cross-Platform Support:** To ensure the binary works across different operating systems, you must include the target triple suffix in the binary's filename on disk.

For example, if you specified `"binaries/ffmpeg"` in the configuration, you need files named like this:

* `src-tauri/binaries/ffmpeg-aarch64-apple-darwin` for macOS with Apple Silicon.
* `src-tauri/binaries/ffmpeg-x86_64-unknown-linux-gnu` for Linux.

### 2. Configuring Permissions

Tauri requires explicit permission to execute the sidecar process. This is configured in the `src-tauri/capabilities/default.json` file. You must grant the `shell:allow-execute` or `shell:allow-spawn` permission and specify the allowed arguments.

```json
{
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

### 3. Running the Sidecar from Rust

To interact with the sidecar from your Rust backend, you use the `tauri_plugin_shell` crate. This allows you to spawn the FFmpeg process, pass arguments, and read its output.

Here is an example of how to execute the sidecar in Rust:

```rust
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

#[tauri::command]
async fn process_video(app: tauri::AppHandle) {
    // The name here matches the name defined in the capabilities configuration
    let sidecar_command = app.shell().sidecar("ffmpeg").unwrap();

    let (mut rx, mut child) = sidecar_command
        .args(["-i", "input.mp4", "output.mp4"])
        .spawn()
        .expect("Failed to spawn sidecar");

    // Read events such as stdout
    while let Some(event) = rx.recv().await {
        if let CommandEvent::Stdout(line_bytes) = event {
            let line = String::from_utf8_lossy(&line_bytes);
            // You can emit this output back to the frontend
             app.emit("message", Some(format!("'{}'", line))).expect("failed to emit event");
        }
    }
}

```

**Important Note:** When calling `app.shell().sidecar(name)`, the `name` should be the base name you defined in the configuration (e.g., `"ffmpeg"`), not the full path like `"binaries/ffmpeg"`.

### Using Crates to Simplify the Process

Instead of manually building FFmpeg commands and parsing the raw output, you can use community crates.

* **`ffmpeg-sidecar`**: This crate wraps the FFmpeg CLI, providing a builder interface similar to `std::process::Command`. It handles complex tasks like rich semantic information recovery from the logs (progress updates, warnings, errors) and allows you to interact with video as raw RGB frames.
* **`tauri-plugin-ffmpeg`**: This is a dedicated Tauri plugin for media transcoding. It provides features like real-time transcoding progress updates and automatically detects and uses hardware encoders (e.g., `h264_videotoolbox` on macOS).