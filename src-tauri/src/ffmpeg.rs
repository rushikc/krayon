use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub ffmpeg: Option<String>,
    pub ffprobe: Option<String>,
    pub whisper_cli: Option<String>,
    pub whisper_model: Option<String>,
    pub whisper_ready: bool,
}

pub type ProgressCallback = Arc<dyn Fn(f64, &str) + Send + Sync>;

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn resolve_binary(name: &str, env_key: &str, extra_candidates: &[PathBuf]) -> Option<PathBuf> {
    if let Ok(path) = std::env::var(env_key) {
        let candidate = PathBuf::from(&path);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    if let Ok(path) = which::which(name) {
        return Some(path);
    }

    for prefix in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"] {
        let candidate = PathBuf::from(prefix).join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    for candidate in extra_candidates {
        if candidate.is_file() {
            return Some(candidate.clone());
        }
    }

    None
}

pub fn resolve_ffmpeg() -> Result<PathBuf, String> {
    resolve_binary("ffmpeg", "KRAYON_FFMPEG", &[])
        .ok_or_else(|| "ffmpeg not found on PATH".to_string())
}

pub fn resolve_ffprobe() -> Result<PathBuf, String> {
    resolve_binary("ffprobe", "KRAYON_FFPROBE", &[])
        .ok_or_else(|| "ffprobe not found on PATH".to_string())
}

pub fn resolve_whisper_cli() -> Option<PathBuf> {
    let home = home_dir().unwrap_or_default();
    let default = home
        .join("Desktop/Projects/whisper.cpp/build/bin/whisper-cli");
    resolve_binary("whisper-cli", "KRAYON_WHISPER_CLI", &[default])
}

pub fn resolve_whisper_model() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("KRAYON_WHISPER_MODEL") {
        let candidate = PathBuf::from(path);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    home_dir()
        .map(|home| {
            home.join("Desktop/Projects/whisper.cpp/models/ggml-large-v3-turbo.bin")
        })
        .filter(|path| path.is_file())
}

pub fn check_media_tools() -> ToolStatus {
    let ffmpeg = resolve_ffmpeg().ok().map(|p| p.display().to_string());
    let ffprobe = resolve_ffprobe().ok().map(|p| p.display().to_string());
    let whisper_cli = resolve_whisper_cli().map(|p| p.display().to_string());
    let whisper_model = resolve_whisper_model().map(|p| p.display().to_string());
    let whisper_ready = whisper_cli.is_some() && whisper_model.is_some();

    ToolStatus {
        ffmpeg,
        ffprobe,
        whisper_cli,
        whisper_model,
        whisper_ready,
    }
}

pub fn probe_duration(input_path: &Path) -> Result<f64, String> {
    let ffprobe = resolve_ffprobe()?;
    let output = Command::new(ffprobe)
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
        ])
        .arg(input_path)
        .output()
        .map_err(|err| format!("Failed to run ffprobe: {err}"))?;

    if !output.status.success() {
        return Err(format!(
            "ffprobe failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let text = String::from_utf8_lossy(&output.stdout);
    text.split(|ch| ch == '\n' || ch == '\r')
        .find(|line| !line.is_empty())
        .ok_or_else(|| "ffprobe returned no duration".to_string())?
        .parse::<f64>()
        .map_err(|err| format!("Invalid duration from ffprobe: {err}"))
}

pub fn probe_fps(input_path: &Path) -> Result<f64, String> {
    let ffprobe = resolve_ffprobe()?;
    let output = Command::new(ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=r_frame_rate",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
        ])
        .arg(input_path)
        .output()
        .map_err(|err| format!("Failed to run ffprobe: {err}"))?;

    if !output.status.success() {
        return Ok(30.0);
    }

    let rate = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if rate.is_empty() || rate == "0/0" {
        return Ok(30.0);
    }

    let parts: Vec<&str> = rate.split('/').collect();
    if parts.len() != 2 {
        return Ok(30.0);
    }

    let num: f64 = parts[0].parse().unwrap_or(30.0);
    let den: f64 = parts[1].parse().unwrap_or(1.0);
    if den == 0.0 {
        Ok(30.0)
    } else {
        Ok(num / den)
    }
}

pub fn run_command_with_progress(
    program: &Path,
    args: &[&str],
    duration_seconds: Option<f64>,
    on_progress: Option<&ProgressCallback>,
) -> Result<(), String> {
    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("Failed to spawn {}: {err}", program.display()))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Missing stdout handle".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Missing stderr handle".to_string())?;

    let progress_cb = on_progress.cloned();
    let stdout_handle = std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            if let Some(cb) = &progress_cb {
                if let Some(rest) = line.strip_prefix("out_time_ms=") {
                    if let Ok(out_time_us) = rest.parse::<f64>() {
                        if let Some(duration) = duration_seconds {
                            if duration > 0.0 {
                                let progress =
                                    ((out_time_us / 1_000_000.0) / duration).clamp(0.0, 1.0);
                                cb(progress, "processing");
                            }
                        }
                    }
                }
            }
        }
    });

    let stderr_handle = std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        let mut lines = Vec::new();
        for line in reader.lines().map_while(Result::ok) {
            lines.push(line);
        }
        lines
    });

    let status = child
        .wait()
        .map_err(|err| format!("Failed waiting on {}: {err}", program.display()))?;

    stdout_handle.join().ok();
    let stderr_lines = stderr_handle.join().unwrap_or_default();

    if !status.success() {
        let tail = stderr_lines
            .iter()
            .rev()
            .take(8)
            .cloned()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("\n");
        return Err(format!(
            "{} failed (exit {}):\n{}",
            program.display(),
            status.code().unwrap_or(-1),
            tail
        ));
    }

    Ok(())
}

pub fn run_command_capture_stderr(
    program: &Path,
    args: &[&str],
    duration_seconds: Option<f64>,
    on_progress: Option<&ProgressCallback>,
) -> Result<Vec<String>, String> {
    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("Failed to spawn {}: {err}", program.display()))?;

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Missing stderr handle".to_string())?;

    let progress_cb = on_progress.cloned();
    let stderr_handle = std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        let mut lines = Vec::new();
        for line in reader.lines().map_while(Result::ok) {
            if let Some(cb) = &progress_cb {
                if let Some(rest) = line.strip_prefix("out_time_ms=") {
                    if let Ok(out_time_us) = rest.parse::<f64>() {
                        if let Some(duration) = duration_seconds {
                            if duration > 0.0 {
                                let progress =
                                    ((out_time_us / 1_000_000.0) / duration).clamp(0.0, 1.0);
                                cb(progress, "processing");
                            }
                        }
                    }
                }
            }
            lines.push(line);
        }
        lines
    });

    let status = child
        .wait()
        .map_err(|err| format!("Failed waiting on {}: {err}", program.display()))?;

    let stderr_lines = stderr_handle.join().unwrap_or_default();

    if !status.success() {
        let tail = stderr_lines
            .iter()
            .rev()
            .take(8)
            .cloned()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("\n");
        return Err(format!(
            "{} failed (exit {}):\n{}",
            program.display(),
            status.code().unwrap_or(-1),
            tail
        ));
    }

    Ok(stderr_lines)
}
