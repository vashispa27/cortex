use super::AxNode;
use regex::Regex;
use serde::Serialize;
use std::sync::OnceLock;

pub const VERSION: i64 = 3;
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

pub fn chunks(body: &str) -> Vec<(usize, usize, String)> {
    chunks_with(body, CHUNK_TARGET_BYTES)
}

/// `target` is the byte size at which a chunk closes (see tests for the exact bound).
pub fn chunks_with(body: &str, target: usize) -> Vec<(usize, usize, String)> {
    if body.trim().is_empty() { return Vec::new(); }
    let mut chunks = Vec::new();
    let mut start = 0_usize;
    let mut units = Vec::<(usize,usize)>::new();
    let mut cursor = 0;
    for line in body.split_inclusive('\n') {
        let line_end = cursor + line.len();
        if line.len() <= target {
            units.push((cursor,line_end));
        } else {
            let mut unit_start = cursor;
            let mut last_boundary = cursor;
            for (offset, character) in line.char_indices() {
                let absolute = cursor + offset + character.len_utf8();
                if matches!(character, '.' | '?' | '!')
                    && line[offset + character.len_utf8()..].starts_with(char::is_whitespace) {
                    last_boundary = absolute;
                }
                if absolute - unit_start > target && last_boundary > unit_start {
                    units.push((unit_start,last_boundary));
                    unit_start = last_boundary;
                }
            }
            if unit_start < line_end { units.push((unit_start,line_end)); }
        }
        cursor = line_end;
    }
    for (unit_start, next) in units {
        let speaker = matches!(body[unit_start..next].trim_end(), "You said:" | "ChatGPT said:")
            || body[unit_start..next].trim_end().ends_with(" sent the following message:");
        if unit_start > start && (speaker || next - start > target) {
            let text = body[start..unit_start].trim().to_owned();
            if !text.is_empty() { chunks.push((start, unit_start, text)); }
            start = unit_start;
        }
    }
    if start < body.len() {
        let text = body[start..].trim().to_owned();
        if !text.is_empty() { chunks.push((start, body.len(), text)); }
    }
    chunks
}
