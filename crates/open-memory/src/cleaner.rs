use super::AxNode;
use regex::Regex;
use serde::Serialize;
use std::sync::OnceLock;

pub const VERSION: i64 = 3;
/// Target chunk size: 1,600 bytes in the legacy chunker, 1,600 characters in the default one.
pub const CHUNK_TARGET_BYTES: usize = 1_600;

#[derive(Clone, Debug, Serialize)]
pub struct Decision {
    pub node: usize,
    pub region: &'static str,
    pub class: &'static str,
    pub reason: &'static str,
}

pub struct Cleaned {
    pub body: String,
    pub quality: &'static str,
    pub coverage: f64,
    pub decisions: Vec<Decision>,
}

#[derive(Clone)]
struct Part {
    text: String,
    role: String,
}

fn context(node: &AxNode) -> String {
    let mut path = String::new();
    if let Some(ancestors) = node.extra.get("ancestor_path").and_then(|v| v.as_array()) {
        for ancestor in ancestors {
            if let Some(role) = ancestor.get("role").and_then(|v| v.as_str()) {
                path.push_str(role);
                path.push(' ');
            }
            if let Some(name) = ancestor.get("name").and_then(|v| v.as_str()) {
                path.push_str(name);
                path.push(' ');
            }
        }
    }
    // Older captures only carried a flattened ancestor name in `name`.
    if path.is_empty() {
        path.push_str(node.name.as_deref().unwrap_or(""));
    }
    path.to_lowercase()
}

fn contains_any(value: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| value.contains(needle))
}

fn speaker_time(node: &AxNode) -> Option<(String, String)> {
    static SPEAKER_TIME: OnceLock<Regex> = OnceLock::new();
    let re = SPEAKER_TIME.get_or_init(|| Regex::new(r"(?i)^(.+?)\s+(\d{1,2}:\d{2}\s*[AP]M)$").unwrap());
    for label in node.name.as_deref()?.rsplit(" / ") {
        if let Some(captures) = re.captures(label.trim()) {
            return Some((captures[1].trim().to_owned(), captures[2].trim().to_owned()));
        }
    }
    None
}

fn region(node: &AxNode, chatgpt: bool, x_chat: bool, new_tab: bool) -> &'static str {
    let path = context(node);
    let role = node.role.to_lowercase();
    if new_tab || contains_any(&path, &["chat history", "sidebar", "tab strip", "browser toolbar", "axtoolbar", "axnavigation", "axmenubar", "axmenu bar", "bookmarks bar", "address and search bar", "search field", "set default browser banner", "list of chats"]) {
        return "navigation";
    }
    if x_chat && (path.starts_with("primary /") || path.starts_with("conversations")
        || path.starts_with("home timeline") || path.starts_with("x /")) {
        return "navigation";
    }
    if x_chat && (speaker_time(node).is_some() || path.starts_with("messages")) {
        return "main";
    }
    if contains_any(&path, &["composer", "ask chatgpt", "message input", "prompt input", "reply box"]) {
        return "composer";
    }
    if chatgpt {
        if path.split(['/', ' ']).any(|word| word == "conversation") || path.contains("axarticle") {
            return "main";
        }
        return "navigation";
    }
    if contains_any(&path, &["conversation", "axmain", "main content", "axarticle", "document", "message list", "web content", "axwebarea"]) {
        return "main";
    }
    if role == "axbutton" || role == "axradiobutton" || role == "axtab" || role == "axmenuitem" {
        return "toolbar";
    }
    "unknown"
}

fn is_action(value: &str) -> bool {
    let lower = value.trim().to_lowercase();
    matches!(lower.as_str(),
        "copy" | "copy message" | "rate response" | "share" | "share prompt" |
        "edit message" | "dictate" | "send" | "start voice" | "read aloud" |
        "scroll to bottom" | "add files and more" | "hide sidebar" | "show sidebar" |
        "new chat" | "reload" | "back" | "forward" | "close" | "new tab" |
        "skip to content" | "ask chatgpt" | "latest response" | "search"
    ) || lower.starts_with("rate ") || lower.starts_with("copy ")
        || lower.starts_with("pin chat") || lower.starts_with("unpin chat")
        || lower.starts_with("bookmark this tab")
}

fn is_boilerplate(value: &str, chatgpt: bool, x_chat: bool) -> bool {
    (chatgpt && matches!(value.trim(),
        "ChatGPT can make mistakes. Check important info." |
        "Latest response" | "Ask ChatGPT" | "Loading older messages…" |
        "Loading older messages..."
    )) || (x_chat && (value.starts_with("To view keyboard shortcuts, press question mark")
        || value.trim() == "View keyboard shortcuts"))
}

pub fn clean(nodes: &[AxNode], app: &str, url: Option<&str>, _title: &str) -> Cleaned {
    let chatgpt = url.is_some_and(|u| u.contains("chatgpt.com") || u.contains("chat.openai.com"))
        || app.to_lowercase().contains("chatgpt");
    let x_chat = url.is_some_and(|u| u.contains("x.com/i/chat"));
    let new_tab = _title.to_lowercase().starts_with("new tab - ");
    let mut decisions = Vec::with_capacity(nodes.len());
    let mut parts: Vec<Part> = Vec::new();
    let mut candidate_count = 0_usize;
    let mut retained_count = 0_usize;
    let mut confident_main = false;
    let mut last_speaker_time: Option<(String, String)> = None;
    for (index, node) in nodes.iter().enumerate() {
        let value = node.value.as_deref().or(node.name.as_deref()).unwrap_or("");
        let value = value.replace("\r\n", "\n").replace('\r', "\n");
        let trimmed = value.trim();
        let node_region = region(node, chatgpt, x_chat, new_tab);
        let role = node.role.as_str();
        let text_role = matches!(role, "AXStaticText" | "AXHeading" | "AXTextArea" | "AXTextView" | "AXTextField");
        if !trimmed.is_empty() && text_role { candidate_count += 1; }
        let (class, reason) = if trimmed.is_empty() {
            ("drop", "empty")
        } else if node_region == "navigation" || node_region == "toolbar" {
            ("drop", "navigation_or_toolbar")
        } else if node_region == "composer" {
            ("drop", "composer")
        } else if is_boilerplate(trimmed, chatgpt, x_chat) {
            ("drop", "app_boilerplate_v1")
        } else if x_chat && speaker_time(node).is_some_and(|(_, time)| trimmed == time) {
            ("drop", "displayed_time_attached")
        } else if is_action(trimmed) {
            ("drop", "action_control")
        } else if matches!(role, "AXButton" | "AXRadioButton" | "AXMenuItem" | "AXTab") {
            ("drop", "action_control")
        } else if !text_role && !matches!(role, "AXLink" | "AXCheckBox") {
            ("drop", "non_text_role")
        } else if chatgpt && node_region != "main" {
            ("drop", "outside_conversation")
        } else if parts.last().is_some_and(|last| last.text.trim() == trimmed) {
            ("drop", "adjacent_duplicate")
        } else {
            ("keep", "content")
        };
        decisions.push(Decision { node: index, region: node_region, class, reason });
        if class == "keep" {
            if node_region == "main" { confident_main = true; }
            retained_count += 1;
            let label = if x_chat { speaker_time(node) } else { None };
            if let Some((speaker, time)) = &label {
                if last_speaker_time.as_ref() != label.as_ref() {
                    parts.push(Part { text: format!("{speaker} ({time}):"), role: "AXHeading".to_owned() });
                }
            }
            parts.push(Part { text: value, role: role.to_owned() });
            last_speaker_time = label;
        }
    }
    let mut body = normalize_parts(&parts);
    if !confident_main && !body.chars().any(char::is_alphanumeric) {
        body.clear();
    }
    let coverage = if candidate_count == 0 { 0.0 } else { retained_count as f64 / candidate_count as f64 };
    let quality = if body.is_empty() { "navigation_only" }
        else if confident_main { "main_content" }
        else { "uncertain" };
    Cleaned { body, quality, coverage, decisions }
}

fn normalize_parts(parts: &[Part]) -> String {
    let mut lines: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut previous_role = "";
    for part in parts {
        let text = part.text.as_str();
        let trimmed = text.trim();
        if trimmed.is_empty() { continue; }
        if part.role == "AXHeading" && lines.last().is_some_and(|line| line == trimmed) {
            continue;
        }
        if previous_role == "AXHeading" && current.trim() == trimmed {
            previous_role = &part.role;
            continue;
        }
        let joins = !current.is_empty() && previous_role != "AXHeading" && part.role != "AXHeading"
            && (current.ends_with(char::is_whitespace)
                || text.starts_with(char::is_whitespace)
                || text.starts_with(['.', ',', ';', ':', ')', '!', '?', '—']));
        if joins {
            current.push_str(text);
        } else {
            if !current.trim().is_empty() { lines.push(current.trim().to_owned()); }
            current = text.to_owned();
        }
        previous_role = &part.role;
    }
    if !current.trim().is_empty() { lines.push(current.trim().to_owned()); }
    let mut output: Vec<String> = Vec::new();
    for line in lines {
        if output.last() != Some(&line) { output.push(line); }
    }
    output.join("\n")
}

/// How the body is cut into chunks.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct ChunkCfg {
    /// Size at which a chunk closes, in characters when `chars`, else in bytes.
    pub target: usize,
    pub chars: bool,
    /// Percent of `target` repeated at the start of the next chunk after a size split (never across
    /// a speaker marker).
    pub overlap_pct: usize,
    /// Keep a heading, "label:" line or "Q:" line with what follows it, and treat the Devanagari
    /// danda and CJK full stops as sentence ends.
    pub boundaries: bool,
}

/// The chunker as it was before Fix 4: bytes, no overlap, plain cuts.
pub const LEGACY: ChunkCfg = ChunkCfg { target: CHUNK_TARGET_BYTES, chars: false, overlap_pct: 0, boundaries: false };
/// Chosen by eval (reports/fixes/04-chunking.md): characters, label-aware boundaries, no overlap.
pub const DEFAULT_CFG: ChunkCfg = ChunkCfg { target: CHUNK_TARGET_BYTES, chars: true, overlap_pct: 0, boundaries: true };

pub fn chunks(body: &str) -> Vec<(usize, usize, String)> {
    chunks_cfg(body, &DEFAULT_CFG)
}

/// `target` is the size (bytes, legacy rules) at which a chunk closes (see tests for the exact bound).
#[cfg(test)]
pub fn chunks_with(body: &str, target: usize) -> Vec<(usize, usize, String)> {
    chunks_cfg(body, &ChunkCfg { target, ..LEGACY })
}

fn is_speaker_marker(text: &str) -> bool {
    let t = text.trim_end();
    matches!(t, "You said:" | "ChatGPT said:") || t.ends_with(" sent the following message:")
}

/// A line that introduces the next one and should not end a chunk: it ends with ':', is a "Q:"
/// question followed by its "A:", or is a short heading-like line followed by a much longer one.
fn leads_next(text: &str, next: &str, chars: bool) -> bool {
    let (t, n) = (text.trim(), next.trim());
    if t.is_empty() || n.is_empty() {
        return false;
    }
    let size = |s: &str| if chars { s.chars().count() } else { s.len() };
    t.ends_with(':')
        || (t.starts_with("Q:") && n.starts_with("A:"))
        || (size(t) <= 60 && !t.ends_with(['.', '!', '?', '।', '。']) && size(n) >= 2 * size(t) && size(n) > 60)
}

pub fn chunks_cfg(body: &str, cfg: &ChunkCfg) -> Vec<(usize, usize, String)> {
    if body.trim().is_empty() { return Vec::new(); }
    let target = cfg.target;
    let measure = |s: &str| if cfg.chars { s.chars().count() } else { s.len() };
    let unit_size = |c: char| if cfg.chars { 1 } else { c.len_utf8() };
    // Units: lines, with lines longer than the target cut at sentence ends.
    let mut units = Vec::<(usize, usize)>::new();
    let mut cursor = 0;
    for line in body.split_inclusive('\n') {
        let line_end = cursor + line.len();
        if measure(line) <= target {
            units.push((cursor, line_end));
        } else {
            let mut unit_start = cursor;
            let mut last_boundary = cursor;
            let mut size = 0_usize;
            for (offset, character) in line.char_indices() {
                let absolute = cursor + offset + character.len_utf8();
                size += unit_size(character);
                let ends_sentence = match character {
                    '.' | '?' | '!' => line[offset + character.len_utf8()..].starts_with(char::is_whitespace),
                    '।' | '。' | '？' | '！' => cfg.boundaries,
                    _ => false,
                };
                if ends_sentence {
                    last_boundary = absolute;
                }
                if size > target && last_boundary > unit_start {
                    units.push((unit_start, last_boundary));
                    unit_start = last_boundary;
                    size = measure(&body[last_boundary..absolute]);
                }
            }
            if unit_start < line_end { units.push((unit_start, line_end)); }
        }
        cursor = line_end;
    }
    let sizes: Vec<usize> = units.iter().map(|&(a, b)| measure(&body[a..b])).collect();
    let speaker: Vec<bool> = units.iter().map(|&(a, b)| is_speaker_marker(&body[a..b])).collect();
    // Safety cap in characters mode: a chunk never exceeds four bytes per target character.
    let byte_cap = if cfg.chars { target * 4 } else { usize::MAX };
    let mut chunks = Vec::new();
    let mut first = 0_usize;
    while first < units.len() {
        let mut last = first;
        let mut total = sizes[first];
        let mut size_split = false;
        while last + 1 < units.len() {
            if speaker[last + 1] {
                break;
            }
            if total + sizes[last + 1] > target || units[last + 1].1 - units[first].0 > byte_cap {
                size_split = true;
                break;
            }
            total += sizes[last + 1];
            last += 1;
        }
        if size_split && cfg.boundaries {
            while last > first && leads_next(&body[units[last].0..units[last].1], &body[units[last + 1].0..units[last + 1].1], cfg.chars) {
                last -= 1;
            }
        }
        let (start, end) = (units[first].0, units[last].1);
        let text = body[start..end].trim().to_owned();
        if !text.is_empty() { chunks.push((start, end, text)); }
        let chunk_first = first;
        first = last + 1;
        if size_split && cfg.overlap_pct > 0 && first < units.len() {
            // Repeat the tail of this chunk at the start of the next, but always leave room for
            // the next unit so the next chunk makes progress.
            let budget = (target * cfg.overlap_pct / 100).min(target.saturating_sub(sizes[first]));
            let mut k = first;
            let mut kept = 0;
            while k > chunk_first + 1 {
                let candidate = k - 1;
                if kept + sizes[candidate] > budget || units[first].1 - units[candidate].0 > byte_cap / 2 {
                    break;
                }
                kept += sizes[candidate];
                k = candidate;
            }
            first = k;
        }
    }
    chunks
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn ax(role: &str, name: &str, value: &str, path: &[(&str, &str)]) -> AxNode {
        serde_json::from_value(json!({
            "role": role, "name": name, "value": value,
            "ancestor_path": path.iter().map(|(r, n)| json!({"role": r, "name": n})).collect::<Vec<_>>(),
        }))
        .unwrap()
    }

    const BROWSER: [(&str, &str); 2] = [("AXWindow", "Page"), ("AXWebArea", "Page")];

    /// Spans are char-aligned, in order, non-overlapping, and only whitespace-only stretches
    /// (dropped empty chunks) may lie between them; every other character is covered once.
    fn assert_well_formed(body: &str, target: usize) -> Vec<(usize, usize, String)> {
        let chunks = chunks_with(body, target);
        let mut previous_end = 0;
        for (start, end, text) in &chunks {
            assert!(body.is_char_boundary(*start) && body.is_char_boundary(*end), "span {start}..{end} splits a character");
            assert!(start < end, "empty span");
            assert!(*start >= previous_end, "spans must be ordered and non-overlapping");
            assert!(body[previous_end..*start].trim().is_empty(), "text between spans must be whitespace only");
            assert_eq!(text, body[*start..*end].trim(), "text must be the trimmed span");
            previous_end = *end;
        }
        assert!(body[previous_end..].trim().is_empty(), "the tail after the last span must be whitespace only");
        let joined: String = chunks.iter().flat_map(|(_, _, t)| t.chars()).filter(|c| !c.is_whitespace()).collect();
        let original: String = body.chars().filter(|c| !c.is_whitespace()).collect();
        assert_eq!(joined, original, "every non-whitespace character must be covered exactly once");
        chunks
    }

    fn sample_body() -> String {
        let mut body = String::new();
        for i in 0..40 {
            body.push_str(&format!("Line {i}: the quick brown fox jumps over the lazy dog. Another sentence follows here!\n"));
        }
        body.push_str(&"A very long single line that keeps going. ".repeat(80));
        body.push('\n');
        body.push_str("You said:\nwhat now?\nChatGPT said:\nNothing much.\n");
        body
    }

    #[test]
    fn chunk_spans_are_valid_ordered_and_cover_content() {
        for target in [1_600, 400, 97] {
            assert_well_formed(&sample_body(), target);
        }
        assert!(chunks("").is_empty());
        assert!(chunks("  \n\t ").is_empty());
        let single = assert_well_formed("one short line", 1_600);
        assert_eq!(single.len(), 1);
    }

    /// Bound, as the code stands: a chunk closes before a unit would pass the target, and a unit
    /// is a line (<= target) or a sentence-aligned piece of a longer line (<= target + 1 byte
    /// when a sentence end is in reach). So chunks are <= target + 1 byte, except that one
    /// unbroken sentence longer than the target becomes a single chunk of that sentence's length.
    #[test]
    fn chunk_size_exceeds_target_by_at_most_one_sentence() {
        let target = 1_600;
        for chunk in assert_well_formed(&sample_body(), target) {
            assert!(chunk.1 - chunk.0 <= target + 1, "chunk of {} bytes", chunk.1 - chunk.0);
        }
        let long_sentence = format!("{} end.", "word ".repeat(700));
        let body = format!("intro line\n{long_sentence}\ntrailer line");
        let chunks = assert_well_formed(&body, target);
        let longest = chunks.iter().map(|c| c.1 - c.0).max().unwrap();
        assert!(longest <= long_sentence.len() + 2, "{longest} > one sentence");
        assert!(longest > target, "an unbroken sentence is kept whole");
    }

    #[test]
    fn speaker_markers_start_a_new_chunk_and_stay_with_their_message() {
        let body = "You said:\nhello there\nChatGPT said:\nhi, how can I help?\nYou said:\nplan my day\nLokesh sent the following message:\nBeta ships Thursday.";
        let chunks = assert_well_formed(body, 1_600);
        let texts: Vec<&str> = chunks.iter().map(|c| c.2.as_str()).collect();
        assert_eq!(texts, vec![
            "You said:\nhello there",
            "ChatGPT said:\nhi, how can I help?",
            "You said:\nplan my day",
            "Lokesh sent the following message:\nBeta ships Thursday.",
        ]);
    }

    #[test]
    fn multibyte_text_never_panics_or_splits_a_character() {
        let devanagari = "दाल को 25 मिनट तक उबालें। फिर घी में जीरा डालें! क्या यह ठीक है? ".repeat(60);
        let emoji = "Ship it 🚀. Tests passed ✅! Party time 🎉🎉🎉? ".repeat(80);
        let mixed = format!("{devanagari}\n{emoji}\nप्रश्न: कितना घी?\nउत्तर: 2 चम्मच घी\n");
        for target in [1, 2, 3, 5, 7, 50, 333, 1_600] {
            assert_well_formed(&mixed, target);
        }
        let no_terminator = "दाल".repeat(900);
        assert_well_formed(&no_terminator, 1_600);
    }

    #[test]
    fn navigation_only_input_yields_no_body() {
        let nodes = vec![
            ax("AXButton", "Back", "Back", &[("AXWindow", "New Tab"), ("AXToolbar", "")]),
            ax("AXTextField", "Address and search bar", "chrome://newtab/", &[("AXWindow", "New Tab"), ("AXToolbar", "")]),
            ax("AXRadioButton", "Tab Strip", "New Tab", &[("AXWindow", "New Tab"), ("AXTabGroup", "Tab Strip")]),
            ax("AXLink", "Chat history / Weekly meal prep", "Weekly meal prep", &[("AXWindow", "ChatGPT"), ("AXGroup", "Sidebar"), ("AXGroup", "Chat history")]),
            ax("AXLink", "Gmail", "Gmail", &[("AXWindow", "New Tab - Google Chrome"), ("AXWebArea", "New Tab")]),
        ];
        let cleaned = clean(&nodes, "com.google.Chrome", Some("chrome://newtab/"), "New Tab - Google Chrome");
        assert_eq!(cleaned.body, "");
        assert_eq!(cleaned.quality, "navigation_only");
        assert!(cleaned.decisions.iter().all(|d| d.class == "drop"));
        assert!(chunks(&cleaned.body).is_empty());
    }

    #[test]
    fn chatgpt_conversation_keeps_messages_and_drops_chrome() {
        let convo: Vec<(&str, &str)> = vec![("AXWindow", "Chat"), ("AXWebArea", "Chat"), ("AXGroup", "Conversation")];
        let nodes = vec![
            ax("AXLink", "Chat history / Old chat", "Old chat", &[("AXWindow", "Chat"), ("AXWebArea", "Chat"), ("AXGroup", "Sidebar"), ("AXGroup", "Chat history")]),
            ax("AXHeading", "Conversation", "You said:", &convo),
            ax("AXStaticText", "Conversation", "How much oil?", &convo),
            ax("AXButton", "Conversation / Copy", "Copy", &convo),
            ax("AXHeading", "Conversation", "ChatGPT said:", &convo),
            ax("AXStaticText", "Conversation", "Add 10 ml olive oil.", &convo),
            ax("AXButton", "Conversation / Rate response", "Rate response", &convo),
            ax("AXTextArea", "Composer / Ask ChatGPT", "half typed draft", &[("AXWindow", "Chat"), ("AXWebArea", "Chat"), ("AXGroup", "Composer")]),
            ax("AXStaticText", "", "ChatGPT can make mistakes. Check important info.", &[("AXWindow", "Chat"), ("AXWebArea", "Chat")]),
        ];
        let cleaned = clean(&nodes, "com.google.Chrome", Some("https://chatgpt.com/c/abc"), "Chat");
        assert_eq!(cleaned.body, "You said:\nHow much oil?\nChatGPT said:\nAdd 10 ml olive oil.");
        assert_eq!(cleaned.quality, "main_content");
    }

    #[test]
    fn plain_web_text_survives_with_adjacent_duplicates_collapsed() {
        let nodes = vec![
            ax("AXHeading", "", "Title", &BROWSER),
            ax("AXStaticText", "", "Body paragraph.", &BROWSER),
            ax("AXStaticText", "", "Body paragraph.", &BROWSER),
        ];
        let cleaned = clean(&nodes, "com.apple.Safari", Some("https://example.org/"), "Title");
        assert_eq!(cleaned.body, "Title\nBody paragraph.");
    }

    // ---- Known weaknesses. These fail today; remove `ignore` when the weakness is fixed.

    #[test]
    fn fact_with_number_and_unit_stays_in_one_chunk() {
        let filler: Vec<String> = (0..64).map(|i| format!("{i:0>49}")).collect();
        let header = "Maximum permitted load on the rear axle is:";
        let value = "450 kg per axle";
        let mut body = String::new();
        for line in &filler {
            if body.len() + line.len() + 1 + header.len() + 1 > 1_596 {
                break;
            }
            body.push_str(line);
            body.push('\n');
        }
        body.push_str(header);
        body.push('\n');
        assert!(body.len() <= 1_600 && body.len() + value.len() + 1 > 1_600, "setup puts the boundary between label and value");
        body.push_str(value);
        let chunks = chunks(&body);
        assert!(chunks.iter().any(|c| c.2.contains(header) && c.2.contains("450 kg")),
            "label and value are in different chunks: {:?}", chunks.iter().map(|c| c.2.len()).collect::<Vec<_>>());
    }

    // ---- Fix 4: boundaries, characters, overlap

    fn overlap_cfg(pct: usize) -> ChunkCfg {
        ChunkCfg { overlap_pct: pct, ..DEFAULT_CFG }
    }

    /// With overlap spans may share text; they must still be char-aligned, start in order, make
    /// progress, and together cover every non-whitespace character.
    fn assert_covering(body: &str, cfg: &ChunkCfg) -> Vec<(usize, usize, String)> {
        let chunks = chunks_cfg(body, cfg);
        let mut covered = vec![false; body.len()];
        let mut previous_start = None;
        for (start, end, text) in &chunks {
            assert!(body.is_char_boundary(*start) && body.is_char_boundary(*end));
            assert!(start < end);
            assert!(previous_start.map_or(true, |p| p < *start), "starts must strictly increase");
            previous_start = Some(*start);
            assert_eq!(text, body[*start..*end].trim());
            covered[*start..*end].iter_mut().for_each(|c| *c = true);
        }
        for (i, c) in body.char_indices() {
            assert!(c.is_whitespace() || covered[i], "character at byte {i} is in no chunk");
        }
        chunks
    }

    fn filler_lines(n: usize) -> String {
        (0..n).map(|i| format!("{i:0>49}\n")).collect()
    }

    #[test]
    fn a_label_stays_with_its_value_across_a_size_split() {
        // 30 lines of 50 bytes (1,500), then a label that still fits, then a value that does not.
        let mut body = filler_lines(30);
        let label = "Rear axle nut torque specification for this wheel:";
        body.push_str(label);
        body.push('\n');
        assert!(body.len() <= 1_600, "setup: the label fits in the first 1,600 bytes");
        body.push_str("85 Nm (63 lb-ft) measured with a calibrated wrench\n");
        assert!(body.len() > 1_600, "setup: label plus value does not");
        let legacy = chunks_cfg(&body, &LEGACY);
        assert!(!legacy.iter().any(|c| c.2.contains("wheel:\n85 Nm")), "the legacy cut separates label and value");
        let fixed = chunks_cfg(&body, &DEFAULT_CFG);
        assert!(fixed.iter().any(|c| c.2.contains("wheel:\n85 Nm (63 lb-ft)")), "{:?}", fixed.iter().map(|c| c.2.len()).collect::<Vec<_>>());
    }

    #[test]
    fn question_stays_with_answer_and_heading_with_paragraph() {
        let mut body = filler_lines(30);
        body.push_str("Q: How long should the sealant cure before riding?\nA: Wait 24 hours before riding.\n");
        let chunks = chunks_cfg(&body, &DEFAULT_CFG);
        assert!(chunks.iter().any(|c| c.2.contains("riding?\nA: Wait 24 hours")));
        let mut body = filler_lines(30);
        body.push_str("Baking\nBake in a preheated Dutch oven at 245 C for 20 minutes lid on, then 22 minutes lid off. Let it cool.\n");
        let chunks = chunks_cfg(&body, &DEFAULT_CFG);
        assert!(chunks.iter().any(|c| c.2.contains("Baking\nBake in a preheated")));
    }

    #[test]
    fn short_list_items_are_not_treated_as_headings() {
        // Equal-length bullet lines: nothing leads into anything, so the cut stays where it was.
        let body = filler_lines(40);
        assert_eq!(chunks_cfg(&body, &DEFAULT_CFG), chunks_cfg(&body, &ChunkCfg { boundaries: false, ..DEFAULT_CFG }));
    }

    #[test]
    fn characters_not_bytes_set_the_size_of_non_english_chunks() {
        let hindi = "दाल को 25 मिनट तक उबालें और फिर घी में जीरा डालकर अच्छी तरह भूनें ताकि खुशबू आए\n".repeat(120);
        let by_bytes = chunks_cfg(&hindi, &LEGACY);
        let by_chars = chunks_cfg(&hindi, &DEFAULT_CFG);
        let chars = |c: &(usize, usize, String)| c.2.chars().count();
        assert!(by_bytes.iter().map(chars).max().unwrap() < 700, "bytes: about a third of the characters ({:?})", by_bytes.iter().map(chars).max());
        assert!(by_chars.iter().map(chars).max().unwrap() > 1_000, "characters: comparable to English");
        assert!(by_chars.iter().all(|c| c.1 - c.0 <= 4 * 1_600), "the byte cap holds");
        assert!(by_chars.len() < by_bytes.len());
        assert_well_formed_cfg(&hindi, &DEFAULT_CFG);
    }

    fn assert_well_formed_cfg(body: &str, cfg: &ChunkCfg) {
        let chunks = chunks_cfg(body, cfg);
        let mut end = 0;
        for (s, e, _) in &chunks {
            assert!(body.is_char_boundary(*s) && body.is_char_boundary(*e) && *s >= end);
            end = *e;
        }
    }

    #[test]
    fn danda_ends_a_sentence_only_in_boundary_mode() {
        let line = format!("{}\n", "यह एक वाक्य है।".repeat(300));
        let with = chunks_cfg(&line, &ChunkCfg { chars: true, ..DEFAULT_CFG });
        let without = chunks_cfg(&line, &ChunkCfg { boundaries: false, chars: true, ..DEFAULT_CFG });
        assert!(with.len() > 1, "split at the danda");
        assert_eq!(without.len(), 1, "no whitespace after the danda: one unbroken sentence");
        for c in &with {
            assert!(c.2.ends_with('।'));
        }
    }

    #[test]
    fn overlap_repeats_the_tail_but_never_across_speakers() {
        let mut body = String::from("You said:\n");
        body.push_str(&filler_lines(60));
        body.push_str("ChatGPT said:\nanswer text\n");
        for pct in [0, 10, 20] {
            assert_covering(&body, &overlap_cfg(pct));
        }
        let plain = chunks_cfg(&body, &overlap_cfg(0));
        let overlapped = chunks_cfg(&body, &overlap_cfg(20));
        assert!(overlapped.len() >= plain.len(), "repeating text can only add chunks");
        assert!(overlapped[1].0 < plain[1].1 && overlapped[1].0 >= plain[0].0, "the second chunk starts inside the first");
        assert_eq!(overlapped.last().unwrap().2, "ChatGPT said:\nanswer text", "a speaker chunk starts clean");
        // A 100% overlap must still progress.
        assert_covering(&body, &overlap_cfg(100));
    }

    #[test]
    fn default_chunks_are_well_formed_on_the_old_fixtures_too() {
        assert_covering(&sample_body(), &DEFAULT_CFG);
        for cfg in [DEFAULT_CFG, overlap_cfg(10), ChunkCfg { target: 7, ..DEFAULT_CFG }, ChunkCfg { target: 1, chars: false, ..DEFAULT_CFG }] {
            assert_covering("दाल 😀 Ship it. Done!\nline two\nQ: why?\nA: because.\n", &cfg);
        }
    }
}
