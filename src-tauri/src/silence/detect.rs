use std::path::Path;
use std::sync::Arc;

use regex::Regex;

use crate::ffmpeg::{resolve_ffmpeg, run_command_capture_stderr, ProgressCallback};
use crate::silence::segments::{build_segments_from_spans, invert_silences, SourceSegment};

pub fn detect_silences_fast(
    input_path: &Path,
    source_duration: f64,
    silence_threshold: f64,
    noise_floor_db: f64,
    on_progress: Option<&ProgressCallback>,
) -> Result<Vec<(f64, f64)>, String> {
    let ffmpeg = resolve_ffmpeg()?;
    let filter = format!(
        "silencedetect=noise={noise_floor_db}dB:d={silence_threshold}"
    );
    let input = input_path.to_string_lossy().to_string();

    let args = [
        "-hide_banner",
        "-nostats",
        "-progress",
        "pipe:1",
        "-i",
        &input,
        "-map",
        "0:a:0",
        "-af",
        &filter,
        "-f",
        "null",
        "-",
    ];

    let stderr_lines =
        run_command_capture_stderr(&ffmpeg, &args, Some(source_duration), on_progress)?;

    let start_re = Regex::new(r"silence_start:\s*([0-9.]+)").unwrap();
    let end_re = Regex::new(r"silence_end:\s*([0-9.]+)").unwrap();

    let mut silences: Vec<(f64, f64)> = Vec::new();
    let mut pending_start: Option<f64> = None;

    for line in &stderr_lines {
        if let Some(caps) = start_re.captures(line) {
            pending_start = caps
                .get(1)
                .and_then(|m| m.as_str().parse::<f64>().ok());
        }
        if let Some(caps) = end_re.captures(line) {
            if let (Some(start), Some(end)) = (
                pending_start,
                caps.get(1).and_then(|m| m.as_str().parse::<f64>().ok()),
            ) {
                silences.push((start, end));
                pending_start = None;
            }
        }
    }

    if let Some(start) = pending_start {
        silences.push((start, source_duration));
    }

    let speech = invert_silences(&silences, source_duration);
    Ok(speech)
}

pub fn run_fast_detection(
    input_path: &Path,
    source_duration: f64,
    silence_threshold: f64,
    noise_floor_db: f64,
    pad: f64,
    on_progress: Option<Arc<dyn Fn(f64, &str) + Send + Sync>>,
) -> Result<Vec<SourceSegment>, String> {
    let speech = detect_silences_fast(
        input_path,
        source_duration,
        silence_threshold,
        noise_floor_db,
        on_progress.as_ref(),
    )?;
    Ok(build_segments_from_spans(
        &speech,
        silence_threshold,
        pad,
        source_duration,
    ))
}
