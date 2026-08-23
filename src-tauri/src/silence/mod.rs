mod detect;
mod segments;
mod whisper;

use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

pub use segments::{SourceSegment, WordTiming};

use crate::ffmpeg::{check_media_tools, probe_duration, probe_fps, ToolStatus};

use detect::run_fast_detection;
use whisper::run_whisper_detection;

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SilenceMethod {
    Fast,
    Accurate,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SilenceOptions {
    pub method: SilenceMethod,
    #[serde(default = "default_silence_threshold")]
    pub silence_threshold: f64,
    #[serde(default = "default_pad")]
    pub pad: f64,
    #[serde(default = "default_noise_floor")]
    pub noise_floor_db: f64,
    #[serde(default = "default_threads")]
    pub threads: u32,
    pub language: Option<String>,
}

fn default_silence_threshold() -> f64 {
    0.4
}

fn default_pad() -> f64 {
    0.05
}

fn default_noise_floor() -> f64 {
    -35.0
}

fn default_threads() -> u32 {
    4
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SilenceAnalysis {
    pub method: SilenceMethod,
    pub source_duration: f64,
    pub fps: f64,
    pub segments: Vec<SourceSegment>,
    pub removed_seconds: f64,
    pub words: Vec<WordTiming>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SilenceProgress {
    pub job_id: String,
    pub phase: String,
    pub progress: f64,
    pub message: String,
}

fn emit_progress(app: &AppHandle, job_id: &str, phase: &str, progress: f64, message: &str) {
    let _ = app.emit(
        "silence://progress",
        SilenceProgress {
            job_id: job_id.to_string(),
            phase: phase.to_string(),
            progress: progress.clamp(0.0, 1.0),
            message: message.to_string(),
        },
    );
}

fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map(|dir| dir.join("silence"))
        .map_err(|err| format!("Failed to resolve cache dir: {err}"))
}

fn removed_seconds(source_duration: f64, segments: &[SourceSegment]) -> f64 {
    let kept: f64 = segments
        .iter()
        .map(|segment| segment.source_end - segment.source_start)
        .sum();
    (source_duration - kept).max(0.0)
}

fn analyze_blocking(
    app: AppHandle,
    job_id: String,
    input_path: PathBuf,
    options: SilenceOptions,
) -> Result<SilenceAnalysis, String> {
    emit_progress(&app, &job_id, "probing", 0.05, "Probing media…");

    let source_duration = probe_duration(&input_path)?;
    let fps = probe_fps(&input_path)?;

    let progress_app = app.clone();
    let progress_job = job_id.clone();
    let on_progress = Arc::new(move |progress: f64, message: &str| {
        emit_progress(
            &progress_app,
            &progress_job,
            "processing",
            0.1 + progress * 0.75,
            message,
        );
    });

    let (segments, words) = match options.method {
        SilenceMethod::Fast => {
            emit_progress(&app, &job_id, "detecting", 0.1, "Detecting silences…");
            let segments = run_fast_detection(
                &input_path,
                source_duration,
                options.silence_threshold,
                options.noise_floor_db,
                options.pad,
                Some(on_progress),
            )?;
            (segments, Vec::new())
        }
        SilenceMethod::Accurate => {
            emit_progress(&app, &job_id, "extracting", 0.1, "Extracting audio…");
            let cache = cache_dir(&app)?;
            let (segments, words) = run_whisper_detection(
                &input_path,
                &cache,
                source_duration,
                options.silence_threshold,
                options.pad,
                options.threads,
                options.language.as_deref(),
                Some(on_progress),
            )?;
            (segments, words)
        }
    };

    emit_progress(&app, &job_id, "segmenting", 0.95, "Building segments…");

    let removed = removed_seconds(source_duration, &segments);
    emit_progress(&app, &job_id, "done", 1.0, "Analysis complete");

    Ok(SilenceAnalysis {
        method: options.method,
        source_duration,
        fps,
        removed_seconds: removed,
        segments,
        words,
    })
}

#[tauri::command]
pub async fn analyze_silence(
    app: AppHandle,
    job_id: String,
    path: String,
    options: SilenceOptions,
) -> Result<SilenceAnalysis, String> {
    let input_path = PathBuf::from(path);
    if !input_path.is_file() {
        return Err(format!("Input file not found: {}", input_path.display()));
    }

    if matches!(options.method, SilenceMethod::Accurate) {
        let tools = check_media_tools();
        if !tools.whisper_ready {
            return Err(
                "Accurate mode requires whisper-cli and a model. Set KRAYON_WHISPER_CLI / KRAYON_WHISPER_MODEL.".into(),
            );
        }
    }

    let app_for_task = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        analyze_blocking(app_for_task, job_id, input_path, options)
    })
    .await
    .map_err(|err| format!("Analysis task failed: {err}"))?
}

#[tauri::command]
pub fn check_media_tools_command() -> ToolStatus {
    check_media_tools()
}
