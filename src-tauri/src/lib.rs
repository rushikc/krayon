mod ffmpeg;
mod silence;

use silence::{analyze_silence, check_media_tools_command};

// Krayon — Hybrid Native Architecture (Tauri v2 + React)
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            analyze_silence,
            check_media_tools_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
