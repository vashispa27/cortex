use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const REDACTION_VERSION: u32 = 1;
pub const MAX_NODES: usize = 5_000;
pub const MAX_DEPTH: usize = 40;
pub const MAX_BODY_BYTES: usize = 128 * 1024;
const MAX_METADATA_CHARS: usize = 4_096;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CapturePolicy {
    pub consent: bool,
    pub paused: bool,
    pub excluded_apps: Vec<String>,
    pub excluded_domains: Vec<String>,
    pub excluded_window_terms: Vec<String>,
}

impl Default for CapturePolicy {
    fn default() -> Self {
        Self {
            consent: false,
            paused: false,
            excluded_apps: Vec::new(),
            excluded_domains: Vec::new(),
            excluded_window_terms: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    Active,
    Locked,
    Asleep,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum BrowserContext {
    NotBrowser,
    Public { domain: String, url: Option<String> },
    Private,
    Unknown,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RawNode {
    pub role: String,
    pub name: Option<String>,
    pub value: Option<String>,
    pub visible: bool,
    pub protected: bool,
    pub excluded: bool,
    pub children: Vec<RawNode>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RawWindow {
    pub app_id: String,
    pub window_session_id: String,
    pub title: String,
    pub browser: BrowserContext,
    pub session: SessionState,
    pub observed_ms: i64,
    pub timezone: String,
    pub source_event: String,
    pub focus_role: Option<String>,
    pub focus_name: Option<String>,
    pub focus_path: Option<String>,
    pub roots: Vec<RawNode>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SanitizedSnapshot {
    pub app_id: String,
    pub window_session_id: String,
    pub title: String,
    pub url: Option<String>,
    pub body: String,
    pub content_hash: String,
    pub observed_ms: i64,
    pub timezone: String,
    pub source_event: String,
    pub focus_role: Option<String>,
    pub focus_name: Option<String>,
    pub focus_path: Option<String>,
    pub extraction_quality: String,
    pub truncated: bool,
    pub redaction_version: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SkipReason {
    NoConsent,
    Paused,
    SessionInactive,
    ExcludedApp,
    ExcludedDomain,
    ExcludedWindow,
    PrivateBrowsing,
    AmbiguousBrowserContext,
}

// Keep recognizable conversation and post paths, but never persist query strings,
// fragments, user info, or arbitrary paths that might contain access tokens.
fn safe_browser_url(raw: &str, domain: &str) -> Option<String> {
    let mut parsed = url::Url::parse(raw).ok()?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str()? != domain { return None; }
    parsed.set_username("").ok()?;
    parsed.set_password(None).ok()?;
    parsed.set_query(None);
    parsed.set_fragment(None);
    let path = parsed.path().to_owned();
    let segments: Vec<_> = path.split('/').filter(|s| !s.is_empty()).collect();
    let valid = |s: &str| !s.is_empty() && s.len() <= 128 && s.bytes().all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c));
    let allowed = match (domain, segments.as_slice()) {
        ("x.com" | "twitter.com", ["messages", id]) => valid(id),
        ("x.com" | "twitter.com", ["i", "chat", id]) => valid(id),
        ("x.com" | "twitter.com", [user, "status", id]) => valid(user) && id.bytes().all(|c| c.is_ascii_digit()),
        ("chatgpt.com" | "chat.openai.com", ["c", id]) => valid(id),
        ("www.linkedin.com" | "linkedin.com", ["feed", "update", id]) => id.starts_with("urn:li:activity:") && id[16..].bytes().all(|c| c.is_ascii_digit()),
        _ => false,
    };
    if !allowed { parsed.set_path("/"); }
    Some(parsed.to_string())
}

impl CapturePolicy {
    pub fn sanitize(&self, window: &RawWindow) -> Result<SanitizedSnapshot, SkipReason> {
        // Gate metadata before walking any accessibility text.
        if !self.consent { return Err(SkipReason::NoConsent); }
        if self.paused { return Err(SkipReason::Paused); }
        if window.session != SessionState::Active { return Err(SkipReason::SessionInactive); }
        if self.excluded_apps.iter().any(|x| x.eq_ignore_ascii_case(&window.app_id)) {
            return Err(SkipReason::ExcludedApp);
        }
        if self.excluded_window_terms.iter().any(|x| !x.is_empty() && window.title.to_lowercase().contains(&x.to_lowercase())) {
            return Err(SkipReason::ExcludedWindow);
        }
        let url = match &window.browser {
            BrowserContext::NotBrowser => None,
            BrowserContext::Private => return Err(SkipReason::PrivateBrowsing),
            BrowserContext::Unknown => return Err(SkipReason::AmbiguousBrowserContext),
            BrowserContext::Public { domain, url } => {
                let d = domain.trim_end_matches('.').to_ascii_lowercase();
                if d.is_empty() || d.len() > 253 || !d.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-') {
                    return Err(SkipReason::AmbiguousBrowserContext);
                }
                if self.excluded_domains.iter().any(|x| domain_matches(&d, x)) {
                    return Err(SkipReason::ExcludedDomain);
                }
                url.as_deref().and_then(|u| safe_browser_url(u, &d))
            }
        };

        let mut parts = Vec::new();
        let mut visited = 0usize;
        let mut collected_bytes = 0usize;
        let mut truncated = false;
        for root in &window.roots {
            collect(root, 0, &mut visited, &mut collected_bytes, &mut truncated, &mut parts);
            if visited >= MAX_NODES { break; }
        }
        let joined = normalize(&parts.join("\n"));
        let mut body = redact(&joined);
        if body.len() > MAX_BODY_BYTES {
            let mut end = MAX_BODY_BYTES;
            while !body.is_char_boundary(end) { end -= 1; }
            body.truncate(end);
            truncated = true;
        }
        let title = redact(&normalize(&take_chars(&window.title,MAX_METADATA_CHARS)));
        let focus_name = window.focus_name.as_ref().map(|x| redact(&normalize(&take_chars(x,512))));
        let focus_path = window.focus_path.as_ref().map(|x| redact(&normalize(&take_chars(x,512))));
        let mut digest = Sha256::new();
        for field in [&title[..], url.as_deref().unwrap_or(""), &body[..]] {
            digest.update((field.len() as u64).to_le_bytes());
            digest.update(field.as_bytes());
        }
        Ok(SanitizedSnapshot {
            app_id: safe_app_id(&window.app_id),
            window_session_id: format!("window_{}",hex::encode(Sha256::digest(window.window_session_id.as_bytes()))),
            title,
            url,
            body,
            content_hash: hex::encode(digest.finalize()),
            observed_ms: window.observed_ms,
            timezone: safe_timezone(&window.timezone),
            source_event: safe_event(&window.source_event).into(),
            focus_role: window.focus_role.as_ref().map(|x| redact(&take_chars(x,128))),
            focus_name,
            focus_path,
            extraction_quality: if truncated { "partial" } else { "visible_accessibility_text" }.into(),
            truncated,
            redaction_version: REDACTION_VERSION,
        })
    }
}

fn domain_matches(domain: &str, exclusion: &str) -> bool {
    let x = exclusion.trim_start_matches('.').trim_end_matches('.').to_ascii_lowercase();
    !x.is_empty() && (domain == x || domain.ends_with(&format!(".{x}")))
}

fn collect(node: &RawNode, depth: usize, visited: &mut usize, collected_bytes: &mut usize, truncated: &mut bool, parts: &mut Vec<String>) {
    if *visited >= MAX_NODES || depth > MAX_DEPTH {
        *truncated = true;
        return;
    }
    *visited += 1;
    if node.protected || node.excluded || !node.visible { return; }
    // A role/name alone may be useful, but avoid duplicating a text node's name and value.
    if let Some(value) = node.value.as_deref().filter(|s| !s.trim().is_empty()).or_else(|| node.name.as_deref().filter(|s| !s.trim().is_empty())) {
        let remaining = MAX_BODY_BYTES.saturating_sub(*collected_bytes);
        if remaining == 0 { *truncated = true; return; }
        let max = remaining.min(8*1024);
        let mut end = value.len().min(max);
        while !value.is_char_boundary(end) { end -= 1; }
        if end < value.len() { *truncated = true; }
        parts.push(value[..end].to_owned());
        *collected_bytes += end + 1;
    }
    for child in &node.children {
        collect(child, depth + 1, visited, collected_bytes, truncated, parts);
        if *visited >= MAX_NODES { *truncated = true; break; }
    }
}

fn take_chars(value: &str, max: usize) -> String { value.chars().take(max).collect() }

fn safe_app_id(value: &str) -> String {
    if !value.is_empty() && value.len() <= 200 && value.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'_' || b == b'-') { value.to_owned() }
    else { format!("app_{}",hex::encode(Sha256::digest(value.as_bytes()))) }
}

fn safe_timezone(value: &str) -> String {
    if !value.is_empty() && value.len() <= 80 && value.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'/' || b == b'_' || b == b'-' || b == b'+') { value.to_owned() }
    else { "UTC".into() }
}

fn safe_event(value: &str) -> &'static str {
    match value { "focus" => "focus", "window_change" => "window_change", "poll" => "poll", "synthetic_fixture" => "synthetic_fixture", _ => "other" }
}

fn normalize(input: &str) -> String {
    let input = input.replace("\r\n", "\n").replace('\r', "\n");
    let mut out = Vec::new();
    let mut last = "";
    for line in input.lines().map(str::trim).filter(|s| !s.is_empty()) {
        if line != last { out.push(line); }
        last = line;
    }
    out.join("\n")
}

static PRIVATE_KEY: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?s)-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----.*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----").unwrap());
static TOKEN: Lazy<Regex> = Lazy::new(|| Regex::new(r"\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{16,}|AKIA[0-9A-Z]{16})\b").unwrap());
static BEARER: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)\b(?:authorization\s*[:=]\s*)?bearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}").unwrap());
static CREDENTIAL_URL: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)([a-z][a-z0-9+.-]*://)[^/@\s:]+:[^/@\s]+@").unwrap());
static KEY_VALUE: Lazy<Regex> = Lazy::new(|| Regex::new(r#"(?i)\b((?:api[_-]?key|client[_-]?secret|access[_-]?token|password|passwd|pwd)\s*[:=]\s*)["']?[^\s"'&,;]{8,}"#).unwrap());
static CARD_CANDIDATE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\b(?:\d[ -]?){13,19}\b").unwrap());

pub fn redact(input: &str) -> String {
    let mut s = PRIVATE_KEY.replace_all(input, "[REDACTED_PRIVATE_KEY]").into_owned();
    s = CREDENTIAL_URL.replace_all(&s, "${1}[REDACTED_CREDENTIALS]@").into_owned();
    s = TOKEN.replace_all(&s, "[REDACTED_TOKEN]").into_owned();
    s = BEARER.replace_all(&s, "[REDACTED_BEARER]").into_owned();
    s = KEY_VALUE.replace_all(&s, "${1}[REDACTED_SECRET]").into_owned();
    CARD_CANDIDATE.replace_all(&s, |caps: &regex::Captures| {
        if luhn(&caps[0]) { "[REDACTED_PAYMENT_CARD]".to_owned() } else { caps[0].to_owned() }
    }).into_owned()
}

fn luhn(candidate: &str) -> bool {
    let digits: Vec<u32> = candidate.chars().filter_map(|c| c.to_digit(10)).collect();
    if !(13..=19).contains(&digits.len()) { return false; }
    let sum: u32 = digits.iter().rev().enumerate().map(|(i, d)| {
        if i % 2 == 1 { let doubled = d * 2; if doubled > 9 { doubled - 9 } else { doubled } } else { *d }
    }).sum();
    sum % 10 == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(value: &str) -> RawNode {
        RawNode { role: "text".into(), name: None, value: Some(value.into()), visible: true, protected: false, excluded: false, children: vec![] }
    }
    fn sample() -> RawWindow {
        RawWindow { app_id: "com.example.mail".into(), window_session_id: "window-1".into(), title: "Review".into(), browser: BrowserContext::NotBrowser, session: SessionState::Active, observed_ms: 1_000, timezone: "UTC".into(), source_event: "focus".into(), focus_role: None, focus_name: None, focus_path: None, roots: vec![node("hello")] }
    }
    #[test]
    fn consent_defaults_off_and_protected_subtrees_do_not_leak() {
        let mut w = sample();
        assert_eq!(CapturePolicy::default().sanitize(&w).unwrap_err(), SkipReason::NoConsent);
        w.roots.push(RawNode { role: "password".into(), name: Some("secret".into()), value: Some("do-not-store".into()), visible: true, protected: true, excluded: false, children: vec![node("child-secret")] });
        let s = CapturePolicy { consent: true, ..Default::default() }.sanitize(&w).unwrap();
        assert_eq!(s.body, "hello");
    }
    #[test]
    fn private_and_unknown_browser_contexts_are_skipped() {
        let mut w = sample();
        let p = CapturePolicy { consent: true, ..Default::default() };
        w.browser = BrowserContext::Private;
        assert_eq!(p.sanitize(&w).unwrap_err(), SkipReason::PrivateBrowsing);
        w.browser = BrowserContext::Unknown;
        assert_eq!(p.sanitize(&w).unwrap_err(), SkipReason::AmbiguousBrowserContext);
    }
    #[test]
    fn conversation_links_keep_safe_paths_without_secrets() {
        assert_eq!(safe_browser_url("https://alice:secret@x.com/messages/123-456?token=secret#part", "x.com").as_deref(), Some("https://x.com/messages/123-456"));
        assert_eq!(safe_browser_url("https://chatgpt.com/c/abc-123?token=secret", "chatgpt.com").as_deref(), Some("https://chatgpt.com/c/abc-123"));
        assert_eq!(safe_browser_url("https://x.com/i/chat/123-456?token=secret", "x.com").as_deref(), Some("https://x.com/i/chat/123-456"));
        assert_eq!(safe_browser_url("https://example.com/reset/secret?token=secret", "example.com").as_deref(), Some("https://example.com/"));
        assert!(safe_browser_url("https://evil.com/messages/123", "x.com").is_none());
    }
    #[test]
    fn exclusion_matches_subdomains_but_not_similar_domains() {
        let mut w = sample();
        let p = CapturePolicy { consent: true, excluded_domains: vec!["example.com".into()], ..Default::default() };
        w.browser = BrowserContext::Public { domain: "mail.example.com".into(), url: None };
        assert_eq!(p.sanitize(&w).unwrap_err(), SkipReason::ExcludedDomain);
        w.browser = BrowserContext::Public { domain: "notexample.com".into(), url: None };
        assert!(p.sanitize(&w).is_ok());
    }
    #[test]
    fn redacts_before_hash_and_metadata_persistence() {
        let mut w = sample();
        w.title = "password=verysecretvalue".into();
        w.roots = vec![node("sk-abcdefghijklmnopqrstu 4111 1111 1111 1111")];
        w.browser = BrowserContext::Public { domain: "example.test".into(), url: Some("https://alice:password@example.test".into()) };
        let s = CapturePolicy { consent: true, ..Default::default() }.sanitize(&w).unwrap();
        let serialized = serde_json::to_string(&s).unwrap();
        for secret in ["verysecretvalue", "abcdefghijklmnopqrstu", "4111 1111 1111 1111", "alice:password"] { assert!(!serialized.contains(secret)); }
        assert!(s.body.contains("[REDACTED_TOKEN]"));
        assert!(s.body.contains("[REDACTED_PAYMENT_CARD]"));
    }
}
