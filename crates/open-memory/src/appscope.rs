//! When does a question scope itself to one app?
//!
//! A bare app word is not a scope: "edge case", "terminal velocity", "chrome plating", "slack in
//! the rope" and "my notes about hiring" are ordinary English. A scope is a phrase that names the
//! app as a place to look ("in Slack", "on Safari", "from my Notes app", "my Slack messages", "the
//! Notes app"). The regex crate has no look-ahead, so the words that follow a match are checked
//! separately against a short list of ordinary continuations.

use regex::Regex;
use std::sync::OnceLock;

struct App {
    names: &'static str,
    ids: &'static [&'static str],
    /// A distinctive product name (Slack, Chrome...) may be scoped with "my" and no noun suffix;
    /// a common word (notes, messages, terminal, edge) needs "app"/"browser"/"window".
    proper: bool,
    /// "in the notes" is too common to count; "in Notes" and "in the Notes app" do.
    allow_the: bool,
    /// Words that, right after the app name, mean the ordinary noun ("terminal velocity").
    ordinary_next: &'static [&'static str],
}

const APPS: &[App] = &[
    App { names: "google chrome|chrome", ids: &["com.google.Chrome"], proper: true, allow_the: true,
          ordinary_next: &["plating", "plated", "trim", "finish", "bumper", "polish"] },
    App { names: "safari", ids: &["com.apple.Safari"], proper: true, allow_the: true,
          ordinary_next: &["park", "trip", "holiday", "tour", "lodge", "animals"] },
    App { names: "firefox", ids: &["org.mozilla.firefox"], proper: true, allow_the: true, ordinary_next: &[] },
    App { names: "slack", ids: &["com.tinyspeck.slackmacgap"], proper: true, allow_the: true,
          ordinary_next: &["rope", "line", "off", "time"] },
    App { names: "terminal", ids: &["com.apple.Terminal"], proper: false, allow_the: true,
          ordinary_next: &["velocity", "illness", "cancer", "building", "gate", "station", "value", "node", "condition", "2", "1"] },
    App { names: "notes", ids: &["com.apple.Notes"], proper: false, allow_the: false, ordinary_next: &[] },
    // com.apple.MobileSMS is the Messages app; com.apple.iChat is the legacy id the code used before.
    App { names: "imessage|messages", ids: &["com.apple.MobileSMS", "com.apple.iChat"], proper: false, allow_the: false,
          ordinary_next: &[] },
    App { names: "microsoft edge|edge", ids: &["com.microsoft.edgemac"], proper: false, allow_the: true,
          ordinary_next: &["case", "cases", "detection", "computing", "of", "device", "devices"] },
];

const PREP: &str = r"(?:in|on|from|within|inside|using|via|through|into)";
const SUFFIX: &str = r"(?:app|browser|window|tab|tabs)";

fn patterns() -> &'static Vec<(Vec<Regex>, &'static App)> {
    static PATTERNS: OnceLock<Vec<(Vec<Regex>, &'static App)>> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        APPS.iter()
            .map(|app| {
                let n = app.names;
                let the = if app.allow_the { r"(?:the\s+)?" } else { "" };
                let mut list = vec![
                    // "in Slack", "on Safari", "in the terminal", "from the Notes app"
                    format!(r"(?i)\b{PREP}\s+{the}(?:{n})(?:\s+{SUFFIX})?\b"),
                    // "from my Notes app", "in my Chrome browser"
                    format!(r"(?i)\b{PREP}\s+(?:my|your|this)\s+(?:{n})\s+{SUFFIX}\b"),
                    // "the Notes app", "Slack app"
                    format!(r"(?i)\b(?:{n})\s+app\b"),
                ];
                if app.proper {
                    list.push(format!(r"(?i)\b{PREP}\s+(?:my|your|this)\s+(?:{n})\b"));
                    list.push(format!(
                        r"(?i)\bmy\s+(?:{n})\s+(?:messages?|chats?|channels?|threads?|history|tabs?|windows?|conversations?|dms?|pages?)\b"
                    ));
                }
                (list.iter().map(|p| Regex::new(p).unwrap()).collect(), app)
            })
            .collect()
    })
}

/// Bundle ids to restrict the search to, or `None` when no app is named as a scope.
pub fn app_scope(question: &str) -> Option<&'static [&'static str]> {
    let mut best: Option<(usize, &'static [&'static str])> = None;
    for (regexes, app) in patterns() {
        for re in regexes {
            for m in re.find_iter(question) {
                let next = question[m.end()..]
                    .trim_start()
                    .split(|c: char| !c.is_alphanumeric())
                    .next()
                    .unwrap_or("")
                    .to_lowercase();
                if app.ordinary_next.contains(&next.as_str()) {
                    continue;
                }
                if best.map_or(true, |(at, _)| m.start() < at) {
                    best = Some((m.start(), app.ids));
                }
            }
        }
    }
    best.map(|(_, ids)| ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn id(q: &str) -> Option<&'static str> {
        app_scope(q).map(|ids| ids[0])
    }

    #[test]
    fn true_scopes_filter() {
        for (q, want) in [
            ("In Slack, when is the standup?", "com.tinyspeck.slackmacgap"),
            ("what did I read on Safari yesterday", "com.apple.Safari"),
            ("from my Notes app, what is on the list", "com.apple.Notes"),
            ("in my Notes app what are my Q4 goals", "com.apple.Notes"),
            ("my Slack messages about the standup time", "com.tinyspeck.slackmacgap"),
            ("in Chrome, how much protein did ChatGPT say", "com.google.Chrome"),
            ("in the terminal which error mentions a moved value", "com.apple.Terminal"),
            ("in the Terminal app, which tests failed", "com.apple.Terminal"),
            ("in Notes what are my Q4 goals", "com.apple.Notes"),
            ("in Safari what hydration did the loaf use", "com.apple.Safari"),
            ("what is in the Messages app about the deposit", "com.apple.MobileSMS"),
            ("using Firefox, what was that page", "org.mozilla.firefox"),
            ("on Microsoft Edge, which tab had the invoice", "com.microsoft.edgemac"),
            ("my Chrome history about recipes", "com.google.Chrome"),
        ] {
            assert_eq!(id(q), Some(want), "{q}");
        }
        assert_eq!(app_scope("in the Messages app").unwrap(), &["com.apple.MobileSMS", "com.apple.iChat"]);
    }

    #[test]
    fn ordinary_words_do_not_filter() {
        for q in [
            "what is an edge case in this test plan",
            "what is the terminal velocity of a skydiver",
            "what did I write in my notes about hiring",
            "what did the messages from the landlord say about the deposit",
            "what do the notes in the recipe say about the baking temperature",
            "how much slack should I leave in the rope when belaying",
            "what is the chrome plating process nickel layer",
            "when is the best time for a safari in Kenya",
            "which airport terminal does Meridian Air use",
            "how long should speaker notes be for a slide",
            "how long should error messages be",
            "any messages about the deposit",
            "the slack of the rope",
            "chrome plating process",
            "what is in the notes",
            "at the edge of the roof",
            "what did I see on the edge of the page",
            "what is the terminal velocity in the physics article",
            "what did I read about the edge",
        ] {
            assert_eq!(id(q), None, "{q}");
        }
    }

    #[test]
    fn earliest_scope_wins_and_traps_inside_scopes_are_skipped() {
        assert_eq!(id("in Slack and also in Chrome, which"), Some("com.tinyspeck.slackmacgap"));
        assert_eq!(id("in the terminal velocity article"), None);
    }
}
