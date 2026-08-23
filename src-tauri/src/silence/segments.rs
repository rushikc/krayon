use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceSegment {
    pub source_start: f64,
    pub source_end: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WordTiming {
    pub text: String,
    pub start: f64,
    pub end: f64,
}

const MIN_SEGMENT_DURATION: f64 = 0.05;

pub fn build_segments_from_spans(
    spans: &[(f64, f64)],
    silence_threshold: f64,
    pad: f64,
    source_duration: f64,
) -> Vec<SourceSegment> {
    if spans.is_empty() {
        return Vec::new();
    }

    let mut padded: Vec<(f64, f64)> = Vec::new();
    for &(start, end) in spans {
        let padded_start = start.max(0.0) - pad;
        let padded_end = (end + pad).min(source_duration);
        let start = padded_start.max(0.0);
        let end = padded_end.max(start);

        if padded.is_empty() || start > padded.last().unwrap().1 + silence_threshold {
            padded.push((start, end));
        } else {
            let (_, prev_end) = padded.last_mut().unwrap();
            *prev_end = prev_end.max(end);
        }
    }

    padded
        .into_iter()
        .filter(|(start, end)| end - start >= MIN_SEGMENT_DURATION)
        .map(|(source_start, source_end)| SourceSegment {
            source_start,
            source_end,
        })
        .collect()
}

pub fn build_segments_from_words(
    words: &[WordTiming],
    silence_threshold: f64,
    pad: f64,
    source_duration: f64,
) -> Vec<SourceSegment> {
    let spans: Vec<(f64, f64)> = words
        .iter()
        .map(|word| (word.start, word.end))
        .collect();
    build_segments_from_spans(&spans, silence_threshold, pad, source_duration)
}

pub fn invert_silences(
    silences: &[(f64, f64)],
    source_duration: f64,
) -> Vec<(f64, f64)> {
    if silences.is_empty() {
        return vec![(0.0, source_duration)];
    }

    let mut sorted = silences.to_vec();
    sorted.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    let mut speech = Vec::new();
    let mut cursor = 0.0;

    for (silence_start, silence_end) in sorted {
        let silence_start = silence_start.max(0.0);
        let silence_end = silence_end.min(source_duration);
        if silence_end <= silence_start {
            continue;
        }
        if silence_start > cursor + 1e-6 {
            speech.push((cursor, silence_start));
        }
        cursor = silence_end.max(cursor);
    }

    if cursor < source_duration - 1e-6 {
        speech.push((cursor, source_duration));
    }

    speech
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_words_separated_by_short_gap() {
        let words = vec![
            WordTiming {
                text: "hello".into(),
                start: 0.0,
                end: 0.4,
            },
            WordTiming {
                text: "world".into(),
                start: 0.6,
                end: 1.0,
            },
        ];
        let segments = build_segments_from_words(&words, 0.4, 0.05, 2.0);
        assert_eq!(segments.len(), 1);
        assert!(segments[0].source_end - segments[0].source_start > 1.0);
    }

    #[test]
    fn splits_words_separated_by_long_gap() {
        let words = vec![
            WordTiming {
                text: "hello".into(),
                start: 0.0,
                end: 0.4,
            },
            WordTiming {
                text: "world".into(),
                start: 1.5,
                end: 1.9,
            },
        ];
        let segments = build_segments_from_words(&words, 0.4, 0.05, 3.0);
        assert_eq!(segments.len(), 2);
    }

    #[test]
    fn inverts_silence_ranges() {
        let speech = invert_silences(&[(1.0, 2.0), (4.0, 5.0)], 6.0);
        assert_eq!(speech, vec![(0.0, 1.0), (2.0, 4.0), (5.0, 6.0)]);
    }
}
