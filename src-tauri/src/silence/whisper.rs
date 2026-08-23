use std::path::{Path, PathBuf};
use std::sync::Arc;

use regex::Regex;
use serde_json::Value;

use crate::ffmpeg::{
    resolve_ffmpeg, resolve_whisper_cli, resolve_whisper_model, run_command_with_progress,
    ProgressCallback,
};
use crate::silence::segments::{build_segments_from_words, WordTiming, SourceSegment};

fn parse_timestamp(value: &str) -> f64 {
    let re = Regex::new(r"(\d+):(\d+):(\d+)[,.](\d+)").unwrap();
    let Some(caps) = re.captures(value.trim()) else {
        return 0.0;
    };
    let hours: f64 = caps.get(1).unwrap().as_str().parse().unwrap_or(0.0);
    let minutes: f64 = caps.get(2).unwrap().as_str().parse().unwrap_or(0.0);
    let seconds: f64 = caps.get(3).unwrap().as_str().parse().unwrap_or(0.0);
    let millis: f64 = caps.get(4).unwrap().as_str().parse().unwrap_or(0.0);
    hours * 3600.0 + minutes * 60.0 + seconds + millis / 1000.0
}

fn offset_to_seconds(offset: Option<&Value>) -> (f64, f64) {
    let Some(offset) = offset else {
        return (0.0, 0.0);
    };
    let start_ms = offset.get("from").and_then(Value::as_f64).unwrap_or(0.0);
    let end_ms = offset.get("to").and_then(Value::as_f64).unwrap_or(0.0);
    (start_ms / 1000.0, end_ms / 1000.0)
}

pub fn load_words(json_path: &Path) -> Result<Vec<WordTiming>, String> {
    let payload: Value = serde_json::from_str(
        &std::fs::read_to_string(json_path)
            .map_err(|err| format!("Failed to read whisper JSON: {err}"))?,
    )
    .map_err(|err| format!("Invalid whisper JSON: {err}"))?;

    let transcription = payload
        .get("transcription")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut words = Vec::new();
    for entry in &transcription {
        let text = entry
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        if text.is_empty() {
            continue;
        }

        let (start, end) = if entry.get("offsets").is_some() {
            offset_to_seconds(entry.get("offsets"))
        } else {
            let timestamps = entry.get("timestamps");
            let from = timestamps
                .and_then(|value| value.get("from"))
                .and_then(Value::as_str)
                .unwrap_or("00:00:00,000");
            let to = timestamps
                .and_then(|value| value.get("to"))
                .and_then(Value::as_str)
                .unwrap_or("00:00:00,000");
            (parse_timestamp(from), parse_timestamp(to))
        };

        if end <= start {
            continue;
        }
        words.push(WordTiming { text, start, end });
    }

    if words.is_empty() {
        for entry in &transcription {
            let Some(tokens) = entry.get("tokens").and_then(Value::as_array) else {
                continue;
            };
            for token in tokens {
                let text = token
                    .get("text")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if text.is_empty() || text.starts_with('[') {
                    continue;
                }
                let (start, end) = offset_to_seconds(token.get("offsets"));
                if end <= start {
                    continue;
                }
                words.push(WordTiming { text, start, end });
            }
        }
    }

    words.sort_by(|a, b| {
        a.start
            .partial_cmp(&b.start)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.end.partial_cmp(&b.end).unwrap_or(std::cmp::Ordering::Equal))
    });

    Ok(words)
}

pub fn extract_audio(
    input_path: &Path,
    wav_path: &Path,
    on_progress: Option<&ProgressCallback>,
) -> Result<(), String> {
    let ffmpeg = resolve_ffmpeg()?;
    let args = vec![
        "-y",
        "-hide_banner",
        "-nostats",
        "-progress",
        "pipe:1",
        "-i",
        input_path.to_str().unwrap_or(""),
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        wav_path.to_str().unwrap_or(""),
    ];
    run_command_with_progress(&ffmpeg, &args, None, on_progress)
}

pub fn transcribe(
    wav_path: &Path,
    output_stem: &Path,
    threads: u32,
    language: Option<&str>,
    on_progress: Option<&ProgressCallback>,
) -> Result<PathBuf, String> {
    let whisper_cli = resolve_whisper_cli()
        .ok_or_else(|| "whisper-cli not found — set KRAYON_WHISPER_CLI".to_string())?;
    let whisper_model = resolve_whisper_model()
        .ok_or_else(|| "whisper model not found — set KRAYON_WHISPER_MODEL".to_string())?;

    let threads_arg = threads.to_string();
    let mut args = vec![
        "-m",
        whisper_model.to_str().unwrap_or(""),
        "-f",
        wav_path.to_str().unwrap_or(""),
        "-ml",
        "1",
        "-sow",
        "-oj",
        "-ojf",
        "-wt",
        "0.01",
        "-t",
        &threads_arg,
        "-of",
        output_stem.to_str().unwrap_or(""),
        "-np",
    ];

    let language_arg;
    if let Some(language) = language {
        language_arg = language.to_string();
        args.push("-l");
        args.push(&language_arg);
    }

    run_command_with_progress(&whisper_cli, &args, None, on_progress)?;

    let json_path = output_stem.with_extension("json");
    if !json_path.is_file() {
        return Err(format!(
            "Expected whisper JSON at {}",
            json_path.display()
        ));
    }
    Ok(json_path)
}

pub fn run_whisper_detection(
    input_path: &Path,
    cache_dir: &Path,
    source_duration: f64,
    silence_threshold: f64,
    pad: f64,
    threads: u32,
    language: Option<&str>,
    on_progress: Option<Arc<dyn Fn(f64, &str) + Send + Sync>>,
) -> Result<(Vec<SourceSegment>, Vec<WordTiming>), String> {
    std::fs::create_dir_all(cache_dir)
        .map_err(|err| format!("Failed to create cache dir: {err}"))?;

    let stem = input_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("input");
    let wav_path = cache_dir.join(format!("{stem}.wav"));
    let output_stem = cache_dir.join(stem);

    extract_audio(input_path, &wav_path, on_progress.as_ref())?;
    let json_path = transcribe(
        &wav_path,
        &output_stem,
        threads,
        language,
        on_progress.as_ref(),
    )?;
    let words = load_words(&json_path)?;
    let segments = build_segments_from_words(&words, silence_threshold, pad, source_duration);

    let _ = std::fs::remove_file(&wav_path);
    let _ = std::fs::remove_file(&json_path);

    Ok((segments, words))
}
