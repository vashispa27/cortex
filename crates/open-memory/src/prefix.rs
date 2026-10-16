//! The text that is embedded and BM25-indexed for a chunk: a short deterministic context prefix plus
//! the chunk body. Nothing is sent anywhere and no model writes it. The stored chunk body, its
//! spans, the snippets and the evidence shown to the user stay the raw chunk text.
//!
//! Why: a chunk such as `Protein 137 g | Fat 35 g | Carbs 185 g` says nothing about macros, a bare
//! reply says nothing about who sent it, and a note says nothing about which app it came from. The
//! page title, app, domain, capture date and (for a chunk cut mid-message) the speaker are all known
//! at index time.

use super::*;
use std::sync::OnceLock;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Prefix {
    /// Embed the chunk body alone (the original behaviour).
    None,
    /// `title` line only.
    Title,
    /// `title | app | domain | date` line, plus the speaker for chunks cut mid-message.
    Context,
}

impl Prefix {
    pub const DEFAULT: Prefix = Prefix::None;

    /// Bumped whenever the prefix format changes, so a stale index demands `--rebuild-index`.
    fn tag(self) -> Option<&'static str> {
        match self {
            Prefix::None => None,
            Prefix::Title => Some("prefix-title-v1"),
            Prefix::Context => Some("prefix-context-v1"),
        }
    }
}

/// Model version plus the prefix format: stored in `index_meta` and every point payload.
pub fn index_version(prefix: Prefix) -> String {
    match prefix.tag() {
        None => MODEL_VERSION.to_owned(),
        Some(tag) => format!("{MODEL_VERSION}:{tag}"),
    }
}

pub fn app_label(app_id: &str) -> String {
    match app_id {
        "com.apple.Safari" => "Safari".into(),
        "com.google.Chrome" => "Chrome".into(),
        "org.mozilla.firefox" => "Firefox".into(),
        "com.microsoft.edgemac" => "Edge".into(),
        "com.tinyspeck.slackmacgap" => "Slack".into(),
        "com.apple.Terminal" => "Terminal".into(),
        "com.apple.Notes" => "Notes".into(),
        "com.apple.mail" => "Mail".into(),
        "com.apple.MobileSMS" | "com.apple.iChat" => "Messages".into(),
        other => other.rsplit('.').next().unwrap_or(other).to_owned(),
    }
}

/// The last speaker marker in `body` before byte `start`, unless the chunk itself opens with one.
fn speaker_before(body: &str, start: usize, chunk: &str) -> Option<String> {
    static MARKER: OnceLock<Regex> = OnceLock::new();
    let marker = MARKER.get_or_init(|| {
        Regex::new(r"^(?:.+ \(\d{1,2}:\d{2}\s*[AP]M\)|You said|ChatGPT said|.+ sent the following message):$").unwrap()
    });
    if marker.is_match(chunk.lines().next().unwrap_or("").trim()) {
        return None;
    }
    let start = start.min(body.len());
    let start = (0..=start).rev().find(|i| body.is_char_boundary(*i)).unwrap_or(0);
    body[..start]
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| marker.is_match(line))
        .map(|line| line.trim_end_matches(':').to_owned())
}

pub struct ChunkContext<'a> {
    pub title: &'a str,
    pub app_id: &'a str,
    pub domain: Option<&'a str>,
    pub first_seen_ms: i64,
    pub snapshot_body: &'a str,
    pub start_byte: usize,
}

/// `prefix + chunk body` for the embedder and BM25.
pub fn embed_text(prefix: Prefix, ctx: &ChunkContext, chunk: &str) -> String {
    if prefix == Prefix::None {
        return chunk.to_owned();
    }
    let title: String = ctx.title.trim().chars().take(120).collect();
    if prefix == Prefix::Title {
        return if title.is_empty() { chunk.to_owned() } else { format!("{title}\n{chunk}") };
    }
    let date = DateTime::<Utc>::from_timestamp_millis(ctx.first_seen_ms)
        .map(|t| t.format("%Y-%m-%d").to_string())
        .unwrap_or_default();
    let line = [title, app_label(ctx.app_id), ctx.domain.unwrap_or("").to_owned(), date]
        .into_iter()
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join(" | ");
    let mut out = line;
    if let Some(speaker) = speaker_before(ctx.snapshot_body, ctx.start_byte, chunk) {
        out.push_str(&format!("\nSpeaker: {speaker}"));
    }
    format!("{out}\n{chunk}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx<'a>(body: &'a str, start: usize) -> ChunkContext<'a> {
        ChunkContext { title: "Daily macros plan - ChatGPT", app_id: "com.google.Chrome", domain: Some("chatgpt.com"),
            first_seen_ms: 1_792_144_200_000, snapshot_body: body, start_byte: start }
    }

    #[test]
    fn none_is_the_raw_chunk() {
        assert_eq!(embed_text(Prefix::None, &ctx("", 0), "Protein 137 g"), "Protein 137 g");
    }

    #[test]
    fn title_and_context_prefixes() {
        let c = ctx("", 0);
        assert_eq!(embed_text(Prefix::Title, &c, "Protein 137 g"), "Daily macros plan - ChatGPT\nProtein 137 g");
        assert_eq!(embed_text(Prefix::Context, &c, "Protein 137 g"),
            "Daily macros plan - ChatGPT | Chrome | chatgpt.com | 2026-10-16\nProtein 137 g");
    }

    #[test]
    fn speaker_is_added_only_mid_message() {
        let body = "Lokesh (10:42 AM):\nBeta goes out Thursday.\nA second line that continues the message.";
        let mid = body.find("A second").unwrap();
        let text = embed_text(Prefix::Context, &ctx(body, mid), "A second line that continues the message.");
        assert!(text.contains("\nSpeaker: Lokesh (10:42 AM)\n"), "{text}");
        let opening = embed_text(Prefix::Context, &ctx(body, 0), "Lokesh (10:42 AM):\nBeta goes out Thursday.");
        assert!(!opening.contains("Speaker:"), "a chunk that opens with the marker already names the speaker");
        let none = embed_text(Prefix::Context, &ctx("no markers here\nplain text", 16), "plain text");
        assert!(!none.contains("Speaker:"));
    }

    #[test]
    fn the_index_version_names_the_format() {
        assert_eq!(index_version(Prefix::None), MODEL_VERSION);
        assert!(index_version(Prefix::Context).ends_with(":prefix-context-v1"));
        assert_ne!(index_version(Prefix::Title), index_version(Prefix::Context));
    }
}
