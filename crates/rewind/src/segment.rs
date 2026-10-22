//! Structure-aware segmentation (v1) of LinkedIn and X captures, before any cleaning.
//!
//! The capture helper emits a flat list of text nodes, each with an `ancestor_path` of container roles and
//! labels. For pages on linkedin.com and x.com this module splits those nodes into typed items (message,
//! preview, post, profile, other) and drops page furniture (navigation, ads, toasts, the browser's own UI).
//! There are no model calls: everything is a rule, and the per-site container labels the rules rely on
//! are listed in one table (`NOISE`) and in the site functions. Pages on other sites, and supported pages
//! where no item is recognised, return `None` so the caller keeps today's cleaner and page chunking.
//!
//! `items.rs` stores the items, deduplicates them across captures and writes their chunks.
//! Observed labels and the rules built on them are in docs/structure-aware-chunking.md.

use super::*;
use serde::Serialize;
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

/// Added to the index version of an index whose chunks are item chunks, so a mixed index demands a rebuild.
pub const TAG: &str = "segments-v1";

static ACTIVE: AtomicBool = AtomicBool::new(false);

/// `REWIND_SEGMENTS=1` turns the feature on. An index that already holds items keeps it on without the flag.
pub fn active() -> bool {
    #[cfg(test)]
    if FORCED.with(|f| f.get()) {
        return true;
    }
    static ENV: OnceLock<bool> = OnceLock::new();
    *ENV.get_or_init(|| env::var("REWIND_SEGMENTS").is_ok_and(|v| v == "1")) || ACTIVE.load(Ordering::Relaxed)
}

#[cfg(test)]
thread_local! {
    static FORCED: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

/// Turns the feature on for the current test thread.
#[cfg(test)]
pub fn force(on: bool) {
    FORCED.with(|f| f.set(on));
}

#[cfg(test)]
thread_local! {
    static ADS: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

/// Keep promoted posts as typed items (`REWIND_SEGMENTS_ADS=1`). By default they are page furniture and dropped.
fn keep_ads() -> bool {
    #[cfg(test)]
    if ADS.with(|f| f.get()) {
        return true;
    }
    static ENV: OnceLock<bool> = OnceLock::new();
    *ENV.get_or_init(|| env::var("REWIND_SEGMENTS_ADS").is_ok_and(|v| v == "1"))
}

#[cfg(test)]
pub fn force_ads(on: bool) {
    ADS.with(|f| f.set(on));
}

pub fn activate() {
    ACTIVE.store(true, Ordering::Relaxed);
}

macro_rules! re {
    ($pattern:expr) => {{
        static RE: OnceLock<Regex> = OnceLock::new();
        RE.get_or_init(|| Regex::new($pattern).unwrap())
    }};
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Site {
    LinkedIn,
    X,
}

impl Site {
    pub fn name(self) -> &'static str {
        match self {
            Site::LinkedIn => "linkedin",
            Site::X => "x",
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            Site::LinkedIn => "LinkedIn",
            Site::X => "X",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Noise,
    Message,
    Preview,
    Post,
    Profile,
    Other,
}

impl Kind {
    pub fn name(self) -> &'static str {
        match self {
            Kind::Noise => "noise",
            Kind::Message => "message",
            Kind::Preview => "preview",
            Kind::Post => "post",
            Kind::Profile => "profile",
            Kind::Other => "other",
        }
    }
}

/// One piece of content with the fields copied verbatim from the page.
#[derive(Clone, Debug, PartialEq)]
pub struct Item {
    pub kind: Kind,
    pub author: Option<String>,
    pub handle: Option<String>,
    /// The time as displayed ("3:11 PM", "22 hours ago", "Oct 17", "FRIDAY 10:08 PM").
    pub time: Option<String>,
    /// The thread for messages, the site section for posts.
    pub container: String,
    /// Another verbatim field worth showing in the header: a LinkedIn headline, "<name> reposted".
    pub byline: Option<String>,
    /// The other party of a chat, for the chunk header.
    pub scope: Option<String>,
    /// A promoted post, kept only with `REWIND_SEGMENTS_ADS=1`.
    pub ad: bool,
    pub lines: Vec<String>,
}

impl Item {
    fn new(kind: Kind, container: &str) -> Self {
        Item { kind, author: None, handle: None, time: None, container: container.to_owned(), byline: None, scope: None, ad: false, lines: Vec::new() }
    }
    pub fn text(&self) -> String {
        self.lines.join("\n")
    }
}

#[derive(Clone, Debug, Default)]
pub struct Stats {
    /// Characters of text nodes by class: `noise`, `unclaimed` (live text no rule claimed), or an item kind.
    pub chars: BTreeMap<&'static str, usize>,
    /// The first live lines no rule claimed, for the report.
    pub unclaimed: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct Segmentation {
    pub site: Site,
    /// Everything that is not noise, in page order.
    pub items: Vec<Item>,
    pub stats: Stats,
}

/// How a container label is matched.
enum Name {
    Any,
    Is(&'static str),
    Starts(&'static str),
}

/// A container whose whole subtree is page furniture. `site: None` applies everywhere.
struct Rule {
    site: Option<Site>,
    role: Option<&'static str>,
    name: Name,
}

const fn rule(site: Option<Site>, role: Option<&'static str>, name: Name) -> Rule {
    Rule { site, role, name }
}

const LI: Option<Site> = Some(Site::LinkedIn);
const XS: Option<Site> = Some(Site::X);

/// Labels are lowercased. Only whole-label and prefix matches are used: group names on X start with the
/// post text, so a substring match would drop posts that mention "footer".
const NOISE: &[Rule] = &[
    rule(None, Some("AXToolbar"), Name::Any),
    rule(None, Some("AXTabGroup"), Name::Any),
    rule(None, Some("AXMenuBar"), Name::Any),
    rule(None, Some("AXMenu"), Name::Any),
    rule(None, Some("AXLandmarkNavigation"), Name::Any),
    rule(None, Some("AXLandmarkBanner"), Name::Any),
    rule(None, None, Name::Is("advertisement")),
    rule(None, None, Name::Is("toast message")),
    rule(None, None, Name::Is("footer")),
    rule(LI, None, Name::Is("global navigation")),
    rule(LI, None, Name::Is("primary navigation")),
    rule(LI, None, Name::Is("skip navigation menu")),
    rule(LI, None, Name::Is("sidebar")),
    rule(LI, None, Name::Starts("linkedin footer")),
    rule(XS, None, Name::Is("primary")),
    rule(XS, None, Name::Is("who to follow")),
    rule(XS, None, Name::Is("relevant people")),
];

impl Rule {
    fn hit(&self, site: Site, role: &str, name: &str) -> bool {
        self.site.map_or(true, |s| s == site)
            && self.role.map_or(true, |r| r == role)
            && match self.name {
                Name::Any => true,
                Name::Is(s) => name == s,
                Name::Starts(s) => name.starts_with(s),
            }
    }
}

struct View<'a> {
    role: &'a str,
    text: String,
    /// Container roles and lowercased labels from below the window down to the node.
    path: Vec<(&'a str, String)>,
    /// The same labels as the page spells them.
    raw: Vec<&'a str>,
    live: bool,
}

impl View<'_> {
    fn under(&self, label: &str) -> bool {
        self.path.iter().any(|(_, name)| name == label)
    }
    fn is_text(&self) -> bool {
        matches!(self.role, "AXStaticText" | "AXHeading")
    }
    /// The text of the closest link ancestor, if any (the label of the link as the page exposes it).
    fn link(&self) -> Option<&str> {
        self.path.iter().rev().find(|(role, _)| *role == "AXLink").map(|(_, name)| name.as_str())
    }
    fn in_control(&self) -> bool {
        self.path.iter().any(|(role, _)| matches!(*role, "AXButton" | "AXPopUpButton" | "AXMenuItem" | "AXCheckBox" | "AXRadioButton"))
    }
}

fn node_text(node: &AxNode) -> String {
    node.value.as_deref().or(node.name.as_deref()).unwrap_or("").replace("\r\n", "\n").replace('\u{a0}', " ").trim().to_owned()
}

fn flag(node: &AxNode, key: &str) -> bool {
    node.extra.get(key).and_then(Value::as_bool) == Some(true)
}

fn views(nodes: &[AxNode], site: Site) -> Vec<View<'_>> {
    let mut out = Vec::with_capacity(nodes.len());
    for node in nodes {
        // Protected and excluded nodes are dropped without reading their text.
        if flag(node, "protected") || flag(node, "excluded") {
            continue;
        }
        let ancestors: Vec<&Value> = node.extra.get("ancestor_path").and_then(Value::as_array).map(|a| a.iter().skip(1).collect()).unwrap_or_default();
        let path: Vec<(&str, String)> = ancestors
            .iter()
            .map(|e| (e.get("role").and_then(Value::as_str).unwrap_or(""), e.get("name").and_then(Value::as_str).unwrap_or("").trim().to_lowercase()))
            .collect();
        let raw: Vec<&str> = ancestors.iter().map(|e| e.get("name").and_then(Value::as_str).unwrap_or("").trim()).collect();
        // Anything outside a web area is the browser's own UI (tab strip, window controls).
        let in_web = path.iter().any(|(role, _)| *role == "AXWebArea");
        let noisy = path.iter().any(|(role, name)| NOISE.iter().any(|r| r.hit(site, role, name)));
        let live = in_web && !noisy;
        out.push(View { role: node.role.as_str(), text: node_text(node), path, raw, live });
    }
    out
}

// ---------------------------------------------------------------------------------------------------------
// Shared text rules

fn is_clock(t: &str) -> bool {
    re!(r"(?i)^\d{1,2}:\d{2}\s*[AP]M$").is_match(t)
}

/// "22 hours ago", "21h", "3w", "just now": a time that changes as the page ages.
fn is_relative(t: &str) -> bool {
    re!(r"(?i)^(\d+\s*(s|m|h|d|w|mo|y|yr)|\d+\s+(second|minute|hour|day|week|month|year)s?\s+ago|just now)$").is_match(t.trim())
}

fn is_day_header(t: &str) -> bool {
    re!(r"(?i)^(today|yesterday|(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?|[a-z]{3,9}\.? \d{1,2}(, \d{4})?)$").is_match(t.trim())
}

fn looks_like_time(t: &str) -> bool {
    let t = t.trim();
    is_clock(t)
        || is_relative(t)
        || is_day_header(t)
        || re!(r"(?i)^([a-z]{3,9},? )?[a-z]{3,9}\.? \d{1,2}(, \d{4})?( at \d{1,2}:\d{2}\s*[AP]M)?$").is_match(t)
        || re!(r"(?i)^(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)? \d{1,2}:\d{2}\s*[AP]M$").is_match(t)
        || re!(r"(?i)^\d{1,2}:\d{2}\s*[AP]M · [a-z]{3,9}\.? \d{1,2}, \d{4}$").is_match(t)
}

/// Text that is the page talking about itself, never content.
fn page_text(t: &str) -> bool {
    re!(r"(?i)(screen reader|keyboard shortcut|no new messages loaded|you have reached the end|^skip to |^status is |^navigating to |^\. (press return|active conversation)|^\d+ (new )?notifications?( total)?$|^loading|^load more|^sponsored$|^promoted( by)?$|^show (more|less)$|^see (more|less)$|^follow$|^connect$|^quote$|^[•·]$|^(about|accessibility|help center|privacy( & terms)?|ad choices|advertising|business services|get the linkedin app|more|terms|cookies|ads info|linkedin corporation © \d{4}|© \d{4} x corp\.)$)").is_match(t.trim())
}

fn words(t: &str) -> usize {
    t.split_whitespace().count()
}

/// Everything the builders produce, plus the per-node classes the statistics are made from.
struct Cx {
    site: Site,
    /// URL path, lowercased.
    path: String,
    classes: Vec<Class>,
    items: Vec<(usize, Item)>,
}

#[derive(Clone, Copy, PartialEq)]
enum Class {
    Noise,
    Unclaimed,
    Kept(Kind),
}

impl Cx {
    fn claim(&mut self, index: usize, kind: Kind) {
        self.classes[index] = Class::Kept(kind);
    }
    /// Text inside a recognised region that repeats or decorates the item (a name echo, "Press return...").
    fn drop(&mut self, index: usize) {
        self.classes[index] = Class::Noise;
    }
    fn push(&mut self, order: usize, item: Item) {
        self.items.push((order, item));
    }
    /// The last non-empty path segment: the thread id of `/messaging/thread/<id>/` or `/i/chat/<id>`.
    fn last_segment(&self) -> String {
        self.path.trim_end_matches('/').rsplit('/').next().unwrap_or("").to_owned()
    }
    /// The site section a post was seen in: the first path segment (`home`, `explore`, a username).
    fn section(&self) -> String {
        let first = self.path.trim_start_matches('/').split('/').next().unwrap_or("");
        if first.is_empty() { "home".to_owned() } else { first.to_owned() }
    }
}

pub fn site_of(url: Option<&str>) -> Option<(Site, String)> {
    let parsed = url::Url::parse(url?.trim()).ok()?;
    let host = parsed.host_str()?.to_lowercase();
    let on = |d: &str| host == d || host.ends_with(&format!(".{d}"));
    let site = if on("linkedin.com") {
        Site::LinkedIn
    } else if on("x.com") || on("twitter.com") {
        Site::X
    } else {
        return None;
    };
    Some((site, parsed.path().to_lowercase()))
}

pub fn segment(nodes: &[AxNode], url: Option<&str>) -> Option<Segmentation> {
    let (site, path) = site_of(url)?;
    let vs = views(nodes, site);
    let mut cx = Cx {
        site,
        path,
        classes: vs.iter().map(|v| if v.live { Class::Unclaimed } else { Class::Noise }).collect(),
        items: Vec::new(),
    };
    match site {
        Site::LinkedIn => {
            linkedin(&vs, &mut cx);
            cards(&vs, &mut cx, "aside");
        }
        Site::X => {
            x(&vs, &mut cx);
            cards(&vs, &mut cx, "trending");
        }
    }
    residual(&vs, &mut cx);
    let recognised = cx.items.iter().any(|(_, i)| i.kind != Kind::Other);
    if !recognised {
        return None;
    }
    let mut stats = Stats::default();
    for (v, class) in vs.iter().zip(&cx.classes) {
        if v.is_text() && !v.text.is_empty() {
            let key = match class {
                Class::Noise => "noise",
                Class::Unclaimed => "unclaimed",
                Class::Kept(kind) => kind.name(),
            };
            *stats.chars.entry(key).or_default() += v.text.chars().count();
            if *class == Class::Unclaimed && stats.unclaimed.len() < 40 {
                stats.unclaimed.push(v.text.chars().take(80).collect());
            }
        }
    }
    cx.items.sort_by_key(|(order, _)| *order);
    Some(Segmentation { site, items: cx.items.into_iter().map(|(_, i)| i).collect(), stats })
}

/// The side column's news and trend cards (LinkedIn "Aside", X "Trending"): each card is a link whose text
/// children are a headline and a line of counts. They are content the user saw, so they are kept as `other`
/// items; promoted cards follow the ads switch.
fn cards(vs: &[View], cx: &mut Cx, label: &str) {
    let mut card: Option<(usize, Vec<String>, bool)> = None;
    fn flush(cx: &mut Cx, card: &mut Option<(usize, Vec<String>, bool)>, label: &str) {
        if let Some((first, lines, ad)) = card.take() {
            if lines.is_empty() || (ad && !keep_ads()) {
                return;
            }
            let mut item = Item::new(Kind::Other, label);
            item.ad = ad;
            item.lines = lines;
            cx.push(first, item);
        }
    }
    for (i, v) in vs.iter().enumerate() {
        if !v.live || v.text.is_empty() || !v.under(label) || cx.classes[i] != Class::Unclaimed {
            continue;
        }
        if v.role == "AXLink" && v.link().is_none() {
            flush(cx, &mut card, label);
            if v.text.to_lowercase() != "show more" {
                card = Some((i, Vec::new(), false));
            }
            cx.drop(i);
        } else if let Some((_, lines, ad)) = card.as_mut() {
            if v.role == "AXStaticText" {
                let t = v.text.as_str();
                if t.to_lowercase().starts_with("promoted") {
                    *ad = true;
                    cx.drop(i);
                } else if page_text(t) {
                    cx.drop(i);
                } else if lines.last().map(String::as_str) != Some(t) {
                    cx.claim(i, Kind::Other);
                    lines.push(t.to_owned());
                }
            }
        }
    }
    flush(cx, &mut card, label);
}

/// Live text no builder claimed: real content on pages the site functions do not know (a job listing, an
/// article), grouped by container. Short fragments are page chrome and stay out.
fn residual(vs: &[View], cx: &mut Cx) {
    let mut group: Vec<usize> = Vec::new();
    let mut label = String::new();
    let flush = |cx: &mut Cx, group: &mut Vec<usize>, label: &str| {
        let lines: Vec<String> = group.iter().map(|&i| vs[i].text.clone()).collect();
        let chars: usize = lines.iter().map(|l| l.chars().count()).sum();
        if chars >= 60 && lines.iter().any(|l| words(l) >= 5) {
            for &i in group.iter() {
                cx.claim(i, Kind::Other);
            }
            let mut item = Item::new(Kind::Other, label);
            item.lines = lines;
            let order = group[0];
            cx.push(order, item);
        }
        group.clear();
    };
    for (i, v) in vs.iter().enumerate() {
        if v.live && cx.classes[i] == Class::Unclaimed && v.is_text() && page_text(&v.text) {
            cx.drop(i);
            continue;
        }
        let candidate = v.live
            && cx.classes[i] == Class::Unclaimed
            && v.is_text()
            && !v.text.is_empty()
            && !v.in_control()
            && v.link().is_none()
            && words(&v.text) >= 3
            && !page_text(&v.text);
        if !candidate {
            continue;
        }
        let here = v.path.iter().rev().find(|(_, name)| !name.is_empty()).map(|(_, name)| name.clone()).unwrap_or_default();
        if !group.is_empty() && here != label {
            flush(cx, &mut group, &label);
        }
        label = here;
        group.push(i);
    }
    flush(cx, &mut group, &label);
}

// ---------------------------------------------------------------------------------------------------------
// LinkedIn

struct Msg {
    author: String,
    time: String,
    lines: Vec<String>,
    first: usize,
}

struct Preview {
    name: String,
    date: Option<String>,
    lines: Vec<String>,
    sponsored: bool,
    first: usize,
}

#[derive(Default)]
struct LiPost {
    /// The containers the "Feed post" heading sits in: a node belongs to the post only below the same ones.
    root: Vec<(String, String)>,
    first: usize,
    author: Option<String>,
    headline: Option<String>,
    time: Option<String>,
    lines: Vec<String>,
    body: bool,
    ad: bool,
    done: bool,
}

fn linkedin(vs: &[View], cx: &mut Cx) {
    let thread = cx.last_segment();
    let section = cx.section();
    let messaging = cx.path.starts_with("/messaging");
    let mut day: Option<String> = None;
    let mut msg: Option<Msg> = None;
    let mut preview: Option<Preview> = None;
    let mut post: Option<LiPost> = None;
    let mut partner: Option<String> = None;
    // A heading seen before the first message is the person at the other end: the profile card.
    let mut card: Option<(String, usize, Vec<String>)> = None;
    let mut seen_message = false;
    let mut card_done = false;

    fn flush_msg(cx: &mut Cx, msg: &mut Option<Msg>, day: &Option<String>, partner: &Option<String>, thread: &str) {
        if let Some(m) = msg.take() {
            if m.lines.is_empty() {
                return;
            }
            let mut item = Item::new(Kind::Message, thread);
            item.time = Some(match day {
                Some(d) => format!("{d} {}", m.time),
                None => m.time,
            });
            item.author = Some(m.author);
            item.scope = partner.clone();
            item.lines = m.lines;
            cx.push(m.first, item);
        }
    }
    fn flush_preview(cx: &mut Cx, preview: &mut Option<Preview>) {
        if let Some(p) = preview.take() {
            if p.sponsored || p.lines.is_empty() {
                return;
            }
            let mut item = Item::new(Kind::Preview, "conversation list");
            item.author = Some(p.name);
            item.time = p.date;
            item.lines = p.lines;
            cx.push(p.first, item);
        }
    }
    fn flush_card(cx: &mut Cx, card: &mut Option<(String, usize, Vec<String>)>, thread: &str) {
        if let Some((name, first, lines)) = card.take() {
            let mut item = Item::new(Kind::Profile, thread);
            item.author = Some(name);
            item.lines = lines;
            cx.push(first, item);
        }
    }
    fn flush_post(cx: &mut Cx, post: &mut Option<LiPost>, section: &str) {
        if let Some(p) = post.take() {
            if (p.ad && !keep_ads()) || p.lines.is_empty() {
                return;
            }
            let mut item = Item::new(Kind::Post, section);
            item.ad = p.ad;
            item.author = p.author;
            item.time = p.time;
            item.byline = p.headline;
            item.lines = p.lines;
            cx.push(p.first, item);
        }
    }

    for (i, v) in vs.iter().enumerate() {
        if !v.live || v.text.is_empty() {
            continue;
        }
        let in_list = v.under("conversation list") && v.path.iter().any(|(r, n)| *r == "AXList" && n == "conversation list");
        let t = v.text.as_str();

        if in_list {
            flush_msg(cx, &mut msg, &day, &partner, &thread);
            if v.role == "AXCheckBox" && t.starts_with("Select conversation with ") {
                flush_preview(cx, &mut preview);
                cx.claim(i, Kind::Preview);
                preview = Some(Preview { name: t["Select conversation with ".len()..].trim().to_owned(), date: None, lines: Vec::new(), sponsored: false, first: i });
            } else if let Some(p) = preview.as_mut() {
                if v.role == "AXButton" {
                    cx.claim(i, Kind::Preview);
                    if t.starts_with("Load more") || t.starts_with("Open the options list") {
                        flush_preview(cx, &mut preview);
                    }
                } else if v.is_text() {
                    cx.claim(i, Kind::Preview);
                    if t.eq_ignore_ascii_case("sponsored") {
                        p.sponsored = true;
                    } else if t == p.name || page_text(t) || t.starts_with("Received ") {
                        // The name repeats its heading; the rest is page chrome.
                        cx.drop(i);
                    } else if looks_like_time(t) && words(t) <= 4 && p.lines.is_empty() {
                        if p.date.is_none() {
                            p.date = Some(t.to_owned());
                        }
                    } else if p.lines.last().map(String::as_str) != Some(t) {
                        p.lines.push(t.to_owned());
                    }
                }
            }
            continue;
        }
        flush_preview(cx, &mut preview);

        // Feed posts begin at a "Feed post" heading.
        if v.role == "AXHeading" && t.to_lowercase().starts_with("feed post") {
            flush_post(cx, &mut post, &section);
            cx.claim(i, Kind::Post);
            post = Some(LiPost { first: i, root: v.path.iter().filter(|(_, n)| !n.is_empty()).map(|(r, n)| ((*r).to_owned(), n.clone())).collect(), ..LiPost::default() });
            continue;
        }
        if let Some(p) = post.as_mut() {
            // Compared by labelled containers only: the unlabelled wrappers differ from post to post.
            let labelled: Vec<&(&str, String)> = v.path.iter().filter(|(_, n)| !n.is_empty()).collect();
            let inside = labelled.len() >= p.root.len() && labelled.iter().zip(&p.root).all(|((r, n), (rr, rn))| r == rr && n == rn);
            if inside {
                cx.claim(i, Kind::Post);
                let lower = t.to_lowercase();
                if v.role == "AXLink" && lower == "switch to different account" || v.role == "AXButton" && (lower.starts_with("reaction button") || lower == "open reactions menu") {
                    p.done = true;
                }
                if p.done || v.role != "AXStaticText" {
                    if v.role == "AXButton" && lower.starts_with("open control menu") {
                        p.body = true;
                    }
                    continue;
                }
                let link = v.link().map(str::to_owned);
                if let Some(link) = &link {
                    if link.contains("profile") {
                        if p.author.is_none() && !t.starts_with('•') {
                            p.author = Some(t.to_owned());
                        }
                        continue;
                    }
                    if !link.starts_with("view company") {
                        continue;
                    }
                }
                if v.in_control() {
                    continue;
                }
                if t.eq_ignore_ascii_case("promoted") || lower.starts_with("promoted by") || t.eq_ignore_ascii_case("sponsored") {
                    p.ad = true;
                } else if !p.body {
                    if is_relative(t) {
                        p.time.get_or_insert_with(|| t.to_owned());
                    } else if p.headline.is_none() && p.author.is_some() && link.is_none() && !page_text(t) {
                        p.headline = Some(t.to_owned());
                    }
                } else if !page_text(t) {
                    p.lines.push(t.to_owned());
                }
                continue;
            }
        }

        // Messaging thread and profile card.
        if v.role == "AXHeading" && !seen_message && !card_done && (messaging || cx.path.starts_with("/in/") || cx.path.starts_with("/company/")) {
            let lower = t.to_lowercase();
            // On a thread the card is a link named "<name> <headline>" around the heading; on a profile page the first heading.
            let named_link = v.path.iter().any(|(r, n)| *r == "AXLink" && n.len() > lower.len() && n.starts_with(&lower));
            if (named_link || !messaging) && !matches!(lower.as_str(), "messaging" | "conversation list" | "notifications") {
                if let Some((name, _, _)) = &card {
                    if *name == t {
                        cx.claim(i, Kind::Profile);
                    }
                    continue;
                }
                card = Some((t.to_owned(), i, Vec::new()));
                partner = Some(t.to_owned());
                cx.claim(i, Kind::Profile);
                continue;
            }
        }
        if let Some((name, _, lines)) = card.as_mut() {
            if v.role == "AXStaticText" && !card_done {
                if t == name {
                    cx.claim(i, Kind::Profile);
                    continue;
                }
                if lines.len() < 2 && !is_day_header(t) && !re!(r"(?i) sent the following messages? at ").is_match(t) && !page_text(t) {
                    lines.push(t.to_owned());
                    cx.claim(i, Kind::Profile);
                    if lines.len() == 2 || messaging {
                        card_done = true;
                    }
                    continue;
                }
            }
        }
        if v.role == "AXStaticText" {
            if is_day_header(t) && words(t) <= 3 && messaging {
                flush_msg(cx, &mut msg, &day, &partner, &thread);
                day = Some(t.to_owned());
                cx.claim(i, Kind::Message);
                continue;
            }
            if let Some(c) = re!(r"^(.+?) sent the following messages? at (\d{1,2}:\d{2}\s*[AP]M)$").captures(t) {
                flush_msg(cx, &mut msg, &day, &partner, &thread);
                flush_card(cx, &mut card, &thread);
                seen_message = true;
                cx.claim(i, Kind::Message);
                msg = Some(Msg { author: c[1].trim().to_owned(), time: c[2].trim().to_owned(), lines: Vec::new(), first: i });
                continue;
            }
        }
        if let Some(m) = msg.as_mut() {
            cx.claim(i, Kind::Message);
            match v.role {
                "AXStaticText" => {
                    let boilerplate = t == "•"
                        || t == m.author
                        || t == m.time
                        || re!(r"^View .+ profile$").is_match(t);
                    if !boilerplate && !page_text(t) {
                        m.lines.push(t.to_owned());
                    } else {
                        cx.drop(i);
                    }
                }
                "AXLink" | "AXHeading" => {}
                _ => {
                    // The compose controls after the last message end it.
                    if !m.lines.is_empty() {
                        flush_msg(cx, &mut msg, &day, &partner, &thread);
                    }
                }
            }
        }
    }
    flush_msg(cx, &mut msg, &day, &partner, &thread);
    flush_preview(cx, &mut preview);
    flush_card(cx, &mut card, &thread);
    flush_post(cx, &mut post, &section);
}

// ---------------------------------------------------------------------------------------------------------
// X

#[derive(Default)]
struct XPost {
    first: usize,
    author: Option<String>,
    pending_author: Option<String>,
    handle: Option<String>,
    time: Option<String>,
    context: Option<String>,
    lines: Vec<String>,
    ad: bool,
}

#[derive(Default)]
struct XChat {
    key: Vec<String>,
    first: usize,
    author: String,
    time: Option<String>,
    lines: Vec<String>,
}

/// The labelled containers of `path` down to index `upto`, as comparable keys.
fn labelled_key(path: &[(&str, String)], upto: usize) -> Vec<String> {
    path[..=upto].iter().filter(|(_, n)| !n.is_empty()).map(|(r, n)| format!("{r}\0{n}")).collect()
}

fn strip_verified(name: &str) -> String {
    name.trim().trim_end_matches("Verified account").trim().to_owned()
}

fn x(vs: &[View], cx: &mut Cx) {
    if cx.path.starts_with("/i/chat") || cx.path.starts_with("/messages") {
        x_chat(vs, cx);
    } else {
        x_posts(vs, cx);
    }
}

fn x_posts(vs: &[View], cx: &mut Cx) {
    let section = cx.section();
    // The key of the post group a node sits in: the labelled containers down to the first labelled group below
    // the timeline. The page nests unlabelled wrappers at a different depth for different nodes of one post, so
    // only labelled containers can identify it.
    let key_of = |v: &View| -> Option<(Vec<String>, Option<Vec<String>>)> {
        let t = v.path.iter().position(|(_, name)| name.starts_with("timeline:") && !name.starts_with("timeline: trending"))?;
        let post = (t + 1..v.path.len()).find(|&k| !v.path[k].1.is_empty())?;
        let key = labelled_key(&v.path, post);
        // The deepest quote the node sits in: a quote of a quote has its own author.
        let quote = (post + 1..v.path.len()).rfind(|&k| v.path[k].1.starts_with("quote ")).map(|q| labelled_key(&v.path, q));
        Some((key, quote))
    };
    let mut current: Option<(Vec<String>, XPost)> = None;
    // The quotes inside the current post, in page order; a quote may sit inside another quote.
    let mut quotes: Vec<(Vec<String>, XPost)> = Vec::new();
    // Quotes inside quotes: the start of their link label, and where they are in `quotes`.
    let mut nested: Vec<(String, usize)> = Vec::new();
    let mut label_seen = false;

    /// The lines of quote `index` and of the quotes inside it, each introduced by who wrote it.
    fn render_quote(quotes: &[(Vec<String>, XPost)], index: usize, out: &mut Vec<String>) {
        let q = &quotes[index].1;
        let who = match (&q.author, &q.handle) {
            (Some(a), Some(h)) => format!("{a} ({h})"),
            (Some(a), None) => a.clone(),
            (None, Some(h)) => h.clone(),
            _ => "an unknown author".to_owned(),
        };
        out.push(format!("Quoted post by {who}{}:", q.time.as_ref().map(|t| format!(", {t}")).unwrap_or_default()));
        out.extend(q.lines.iter().cloned());
        for (j, (key, _)) in quotes.iter().enumerate() {
            if j != index && parent_quote(quotes, j) == Some(index) && key.len() > quotes[index].0.len() {
                render_quote(quotes, j, out);
            }
        }
    }
    /// The quote that contains quote `index`: the longest other key that starts it.
    fn parent_quote(quotes: &[(Vec<String>, XPost)], index: usize) -> Option<usize> {
        let key = &quotes[index].0;
        (0..quotes.len())
            .filter(|&j| j != index && quotes[j].0.len() < key.len() && key.starts_with(&quotes[j].0))
            .max_by_key(|&j| quotes[j].0.len())
    }
    /// A quoting post keeps the text of what it quotes, labelled with the quoted author, so one chunk holds both.
    fn finish(cx: &mut Cx, mut post: XPost, quotes: &mut Vec<(Vec<String>, XPost)>, section: &str) {
        for j in 0..quotes.len() {
            if parent_quote(quotes, j).is_none() {
                render_quote(quotes, j, &mut post.lines);
            }
        }
        quotes.clear();
        emit(cx, post, section);
    }

    fn emit(cx: &mut Cx, post: XPost, section: &str) {
        // A post whose author could not be read is still content: it keeps its text, and its header says less.
        if (post.ad && !keep_ads()) || post.lines.is_empty() {
            return;
        }
        let mut item = Item::new(Kind::Post, section);
        item.ad = post.ad;
        item.author = post.author;
        item.handle = post.handle;
        item.time = post.time;
        item.byline = post.context;
        item.lines = post.lines;
        cx.push(post.first, item);
    }
    let metrics = |name: &str| re!(r"^\d[\d.,]*[kmb]? (repl|repost|like|bookmark|view)").is_match(name);

    for (i, v) in vs.iter().enumerate() {
        if !v.live || v.text.is_empty() {
            continue;
        }
        let Some((key, quote_key)) = key_of(v) else { continue };
        cx.claim(i, Kind::Post);
        if current.as_ref().map_or(true, |(k, _)| *k != key) {
            if let Some((_, p)) = current.take() {
                finish(cx, p, &mut quotes, &section);
            }
            nested.clear();
            label_seen = false;
            current = Some((key, XPost { first: i, ..XPost::default() }));
        }
        let t = v.text.as_str();
        if let Some(qk) = quote_key {
            let index = match quotes.iter().position(|(k, _)| *k == qk) {
                Some(index) => index,
                None => {
                    quotes.push((qk, XPost { first: i, ..XPost::default() }));
                    quotes.len() - 1
                }
            };
            // A quote inside a quote has no group of its own: a "Quote" label, then a link with the author, handle and
            // time, whose children carry the text. Its words belong to its author, not to the quote around it.
            let nested_at = nested.iter().rev().find(|(pre, _)| v.path.iter().any(|(r, n)| *r == "AXLink" && n.starts_with(pre.as_str()))).map(|(_, at)| *at);
            let target = nested_at.unwrap_or(index);
            let author_re = re!(r"(?s)^(.+?)(?: Verified account)? (@\w+) (\d+ \w+ ago|\d+[smhdw]|[A-Z][a-z]{2} \d{1,2}(?:, \d{4})?)\b(.*)$");
            if v.role == "AXStaticText" && t == "Quote" {
                label_seen = true;
            } else if v.role == "AXLink" {
                if let Some(c) = author_re.captures(t) {
                    let who = c[1].trim().trim_start_matches("Square profile picture ").trim_start_matches("Profile picture ").to_owned();
                    if label_seen && quotes[target].1.author.is_some() {
                        let pre: String = t.to_lowercase().chars().take(40).collect();
                        let mut key = quotes[target].0.clone();
                        key.push(format!("nested\0{pre}"));
                        quotes.push((key, XPost { first: i, author: Some(who), handle: Some(c[2].to_owned()), time: Some(c[3].to_owned()), ..XPost::default() }));
                        nested.push((pre, quotes.len() - 1));
                    } else if quotes[target].1.author.is_none() {
                        let q = &mut quotes[target].1;
                        q.author = Some(who);
                        q.handle = Some(c[2].to_owned());
                        q.time = Some(c[3].to_owned());
                    }
                    label_seen = false;
                }
            } else if v.role == "AXStaticText" && !page_text(t) && !v.in_control() {
                let q = &mut quotes[target].1;
                if q.lines.last().map(String::as_str) != Some(t) {
                    q.lines.push(t.to_owned());
                }
            }
            continue;
        }
        let p = &mut current.as_mut().unwrap().1;
        match v.role {
            "AXLink" => {
                if t.ends_with(" reposted") || t.ends_with(" pinned") {
                    p.context = Some(t.to_owned());
                } else if re!(r"^@\w+$").is_match(t) {
                    if p.handle.is_none() {
                        p.handle = Some(t.to_owned());
                        p.author = p.pending_author.take();
                    }
                } else if p.handle.is_some() && p.time.is_none() && looks_like_time(t) {
                    p.time = Some(t.to_owned());
                } else if p.handle.is_none() && !t.is_empty() && words(t) <= 8 {
                    p.pending_author = Some(strip_verified(t));
                }
            }
            "AXStaticText" => {
                if t == "Ad" {
                    p.ad = true;
                    continue;
                }
                if page_text(t) || v.in_control() || v.path.iter().any(|(_, n)| metrics(n)) {
                    continue;
                }
                if let Some(link) = v.link() {
                    // Mentions, hashtags and URLs are part of the sentence; names, handles and ages repeat the header.
                    if !re!(r"^(@|#|https?://|www\.)").is_match(link) || re!(r"^@\w+$").is_match(t) && Some(t) == p.handle.as_deref() {
                        continue;
                    }
                }
                if p.lines.last().map(String::as_str) != Some(t) {
                    p.lines.push(t.to_owned());
                }
            }
            _ => {}
        }
    }
    if let Some((_, p)) = current.take() {
        finish(cx, p, &mut quotes, &section);
    }
}

fn x_chat(vs: &[View], cx: &mut Cx) {
    let thread = cx.last_segment();
    let mut day: Option<String> = None;
    let mut partner: Option<String> = None;
    let mut cur: Option<XChat> = None;
    // Lines of attachments that come before the timed message of the same sender.
    let mut pending: Option<(String, usize, Vec<String>)> = None;
    let mut preview: Option<(usize, String, Option<String>, String, Vec<String>)> = None;
    // The link's own label also carries what sits between the name and the age (a company next to a name).
    let mut extra: Option<String> = None;

    fn emit(cx: &mut Cx, cur: &mut Option<XChat>, pending: &mut Option<(String, usize, Vec<String>)>, day: &Option<String>, partner: &Option<String>, thread: &str) {
        let Some(mut c) = cur.take() else { return };
        if c.time.is_none() {
            // An attachment or untimed bubble waits for the timed message that follows from the same sender.
            match pending {
                Some((author, _, lines)) if *author == c.author => lines.extend(c.lines),
                _ => *pending = Some((c.author, c.first, c.lines)),
            }
            return;
        }
        if let Some((author, first, mut lines)) = pending.take() {
            if author == c.author {
                lines.extend(std::mem::take(&mut c.lines));
                c.lines = lines;
                c.first = first;
            } else {
                let mut item = Item::new(Kind::Message, thread);
                item.author = Some(author);
                item.scope = partner.clone();
                item.lines = lines;
                cx.push(first, item);
            }
        }
        if c.lines.is_empty() {
            return;
        }
        let mut item = Item::new(Kind::Message, thread);
        let time = c.time.unwrap_or_default();
        item.time = Some(match day {
            Some(d) => format!("{d} {time}"),
            None => time,
        });
        item.author = Some(c.author);
        item.scope = partner.clone();
        item.lines = c.lines;
        cx.push(c.first, item);
    }
    fn emit_preview(cx: &mut Cx, p: &mut Option<(usize, String, Option<String>, String, Vec<String>)>, extra: &mut Option<String>) {
        if let Some((first, name, time, prefix, lines)) = p.take() {
            let _ = prefix;
            let extra = extra.take();
            if lines.is_empty() {
                return;
            }
            let mut item = Item::new(Kind::Preview, "conversations");
            item.byline = extra;
            item.author = Some(name);
            item.time = time;
            item.lines = lines;
            cx.push(first, item);
        }
    }

    for (i, v) in vs.iter().enumerate() {
        if !v.live || v.text.is_empty() {
            continue;
        }
        let t = v.text.as_str();
        if v.path.iter().any(|(r, n)| *r == "AXList" && n == "conversations") {
            emit(cx, &mut cur, &mut pending, &day, &partner, &thread);
            if v.role == "AXLink" && t.starts_with("user avatar ") {
                emit_preview(cx, &mut preview, &mut extra);
                cx.claim(i, Kind::Preview);
                extra = re!(r"(?s)^user avatar .+? Verified account (.+?) \d+[smhdwy]\b").captures(t).map(|c| c[1].trim().to_owned()).filter(|e| !e.is_empty());
                preview = Some((i, String::new(), None, String::new(), Vec::new()));
            } else if let Some(p) = preview.as_mut() {
                if v.role == "AXStaticText" {
                    cx.claim(i, Kind::Preview);
                    if p.1.is_empty() {
                        p.1 = t.to_owned();
                    } else if p.2.is_none() && is_relative(t) {
                        p.2 = Some(t.to_owned());
                    } else if t == "You:" {
                        p.3 = "You: ".to_owned();
                    } else if !page_text(t) {
                        let line = format!("{}{t}", std::mem::take(&mut p.3));
                        p.4.push(line);
                    }
                }
            }
            continue;
        }
        emit_preview(cx, &mut preview, &mut extra);
        // The other party: the avatar link that heads the open conversation.
        if v.role == "AXStaticText" && partner.is_none() && v.link().is_some_and(|l| l.starts_with("user avatar ")) {
            partner = Some(t.to_owned());
            cx.claim(i, Kind::Message);
            continue;
        }
        let Some(m) = v.path.iter().position(|(r, n)| *r == "AXGroup" && n == "messages") else { continue };
        // A bubble is the first labelled group below the message list ("You 1:35 PM", "Attachment Boardy").
        let Some(j) = (m + 1..v.path.len()).find(|&k| !v.path[k].1.is_empty()) else {
            // Nothing labelled below the message list: a day header.
            if v.role == "AXStaticText" && looks_like_time(t) {
                emit(cx, &mut cur, &mut pending, &day, &partner, &thread);
                day = Some(re!(r"(?i)(\s+at)?\s+\d{1,2}:\d{2}\s*[AP]M$").replace(t, "").into_owned());
                cx.claim(i, Kind::Message);
            }
            continue;
        };
        cx.claim(i, Kind::Message);
        let key = labelled_key(&v.path, j);
        if cur.as_ref().map_or(true, |c| c.key != key) {
            emit(cx, &mut cur, &mut pending, &day, &partner, &thread);
            let name = v.raw[j];
            let (author, time) = match re!(r"(?i)^(.+?) (\d{1,2}:\d{2}\s*[AP]M)$").captures(name) {
                Some(c) => (c[1].trim().to_owned(), Some(c[2].trim().to_owned())),
                None => (name.strip_prefix("Attachment ").unwrap_or(name).trim().to_owned(), None),
            };
            cur = Some(XChat { key, first: i, author, time, lines: Vec::new() });
        }
        let c = cur.as_mut().unwrap();
        if v.role == "AXStaticText" && !is_clock(t) && !page_text(t) && c.lines.last().map(String::as_str) != Some(t) {
            c.lines.push(t.to_owned());
        }
    }
    emit(cx, &mut cur, &mut pending, &day, &partner, &thread);
    emit_preview(cx, &mut preview, &mut extra);
}

// ---------------------------------------------------------------------------------------------------------
// Chunks

/// One chunk to store: the items it holds (indexes into the list given to `plan`), a deterministic header
/// and the text that follows it.
#[derive(Clone, Debug, PartialEq)]
pub struct Planned {
    pub kind: Kind,
    pub author: Option<String>,
    pub time: Option<String>,
    pub container: String,
    pub header: String,
    pub body: String,
    pub items: Vec<usize>,
}

fn join_header(parts: Vec<Option<String>>) -> String {
    parts.into_iter().flatten().filter(|p| !p.trim().is_empty()).collect::<Vec<_>>().join(" · ")
}

fn header_of(site: Site, items: &[&Item]) -> String {
    let first = items[0];
    let last = items[items.len() - 1];
    let site_label = site.label();
    match first.kind {
        Kind::Post => {
            let author = match (&first.author, &first.handle) {
                (Some(a), Some(h)) => Some(format!("{a} ({h})")),
                (Some(a), None) => Some(a.clone()),
                (None, Some(h)) => Some(h.clone()),
                _ => None,
            };
            join_header(vec![Some(format!("{site_label} {}", if first.ad { "ad" } else { "post" })), author, first.time.clone(), first.byline.clone()])
        }
        Kind::Message => {
            let chat = match &first.scope {
                Some(s) => format!("{site_label} chat with {s}"),
                None => format!("{site_label} chat"),
            };
            if items.len() == 1 {
                let who = match (&first.author, &first.time) {
                    (Some(a), Some(t)) => Some(format!("{a}, {t}")),
                    (Some(a), None) => Some(a.clone()),
                    (None, Some(t)) => Some(t.clone()),
                    _ => None,
                };
                join_header(vec![Some(chat), who])
            } else {
                let range = match (&first.time, &last.time) {
                    (Some(a), Some(b)) if a != b => Some(format!("{a} to {b}")),
                    (Some(a), _) => Some(a.clone()),
                    _ => None,
                };
                join_header(vec![Some(chat), range])
            }
        }
        Kind::Preview => format!("{site_label} conversation list"),
        Kind::Profile => join_header(vec![Some(format!("{site_label} profile")), first.author.clone()]),
        _ => join_header(vec![Some(format!("{site_label} page")), Some(first.container.clone())]),
    }
}

fn body_of(items: &[&Item]) -> String {
    items
        .iter()
        .map(|i| match i.kind {
            Kind::Message => {
                let who = match (&i.author, &i.time) {
                    (Some(a), Some(t)) => format!("{a} ({t}):"),
                    (Some(a), None) => format!("{a}:"),
                    _ => String::new(),
                };
                if who.is_empty() { i.text() } else { format!("{who}\n{}", i.text()) }
            }
            Kind::Preview => {
                let who = match (&i.author, &i.byline) {
                    (Some(a), Some(b)) => Some(format!("{a} ({b})")),
                    (a, _) => a.clone(),
                };
                // One line per row, so a preview's own line breaks cannot read as the next row.
                let text = i.lines.iter().map(|l| l.trim()).filter(|l| !l.is_empty()).collect::<Vec<_>>().join(" ");
                [who, i.time.clone(), Some(text)].into_iter().flatten().collect::<Vec<_>>().join(" · ")
            }
            Kind::Profile => [i.author.clone(), Some(i.text())].into_iter().flatten().filter(|s| !s.is_empty()).collect::<Vec<_>>().join("\n"),
            _ => i.text(),
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Cuts the given items (new, in page order) into chunks. A post is one chunk, split only past `target`
/// characters with the header repeated; other kinds are grouped in order up to `target`, never across
/// kinds or containers, and never separating a message from its sender line.
pub fn plan(site: Site, items: &[&Item], target: usize) -> Vec<Planned> {
    let mut out: Vec<Planned> = Vec::new();
    let mut group: Vec<usize> = Vec::new();
    let mut size = 0_usize;
    let finish = |group: &mut Vec<usize>, out: &mut Vec<Planned>| {
        if group.is_empty() {
            return;
        }
        let list: Vec<&Item> = group.iter().map(|&i| items[i]).collect();
        let header = header_of(site, &list);
        let body = body_of(&list);
        let first = list[0];
        let same_author = list.iter().all(|i| i.author == first.author);
        let planned = |body: String| Planned {
            kind: first.kind,
            author: if same_author { first.author.clone() } else { None },
            time: first.time.clone(),
            container: first.container.clone(),
            header: header.clone(),
            body,
            items: group.clone(),
        };
        if first.kind == Kind::Post && body.chars().count() > target {
            let cfg = cleaner::ChunkCfg { target, ..cleaner::DEFAULT_CFG };
            for (_, _, part) in cleaner::chunks_cfg(&body, &cfg) {
                out.push(planned(part));
            }
        } else if !body.trim().is_empty() {
            out.push(planned(body));
        }
        group.clear();
    };
    for (i, item) in items.iter().enumerate() {
        let cost = body_of(&[*item]).chars().count() + 1;
        let joins = group.last().is_some_and(|&p| {
            let prev = items[p];
            prev.kind == item.kind && prev.container == item.container && item.kind != Kind::Post && size + cost <= target
        });
        if !joins {
            finish(&mut group, &mut out);
            size = 0;
        }
        group.push(i);
        size += cost;
    }
    finish(&mut group, &mut out);
    out
}

/// Identity of an item across captures: app, site, kind, container, author, displayed time, text. A
/// relative age ("3 hours ago") changes while the item stays the same, so it is left out of the identity.
pub fn identity(app: &str, site: Site, item: &Item) -> String {
    let time = item.time.as_deref().filter(|t| !is_relative(t)).unwrap_or("");
    let norm = item.text().to_lowercase().split_whitespace().collect::<Vec<_>>().join(" ");
    digest(&format!(
        "{app}\0{}\0{}{}\0{}\0{}{}\0{time}\0{norm}",
        site.name(),
        item.kind.name(),
        if item.ad { "+ad" } else { "" },
        item.container,
        item.author.as_deref().unwrap_or(""),
        item.handle.as_deref().map(|h| format!("\0{h}")).unwrap_or_default(),
    ))
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use serde_json::json;

    pub const BASE: &str = "W";

    /// A node with the ancestor path `[window, window group, scroll area] + path`.
    pub fn n(role: &str, text: &str, path: &[(&str, &str)]) -> AxNode {
        let mut ancestors = vec![json!({"role":"AXWindow","name":BASE}), json!({"role":"AXGroup","name":BASE}), json!({"role":"AXScrollArea","name":""})];
        for (r, name) in path {
            ancestors.push(json!({"role": r, "name": name}));
        }
        let mut extra = serde_json::Map::new();
        extra.insert("ancestor_path".into(), Value::Array(ancestors));
        extra.insert("protected".into(), json!(false));
        extra.insert("excluded".into(), json!(false));
        AxNode { role: role.into(), name: Some(text.into()), value: Some(text.into()), extra }
    }

    fn li(title: &'static str) -> Vec<(&'static str, &'static str)> {
        vec![("AXWebArea", title)]
    }
    fn at<'a>(base: &[(&'a str, &'a str)], more: &[(&'a str, &'a str)]) -> Vec<(&'a str, &'a str)> {
        base.iter().chain(more.iter()).copied().collect()
    }

    const THREAD_URL: &str = "https://www.linkedin.com/messaging/thread/2-abc/";

    /// A LinkedIn messaging page: furniture, a conversation list, the open thread, an ad and the footer.
    pub fn linkedin_thread(list_extra: &[(&str, &str, &str)], messages: &[(&str, &str, &[&str])]) -> Vec<AxNode> {
        let web = li("Messaging | LinkedIn");
        let mut v = vec![
            // The browser's own UI has no web area above it.
            n("AXButton", "Back", &[]),
            n("AXButton", "Bookmarks bar item", &[("AXToolbar", "Bookmarks")]),
            n("AXLink", "Home", &at(&web, &[("AXGroup", "Global Navigation"), ("AXGroup", "Primary Navigation")])),
            n("AXStaticText", "My Network", &at(&web, &[("AXGroup", "Global Navigation"), ("AXGroup", "Primary Navigation")])),
            n("AXHeading", "Messaging", &at(&web, &[])),
            n("AXStaticText", "Attention screen reader users, messaging items continuously update. Please use the tab and arrow keys", &at(&web, &[])),
        ];
        let list = at(&web, &[("AXList", "Conversation List")]);
        let mut previews = vec![("Robin Vale", "3:23 PM", "You: See you at the standup"), ("Pat Quill", "Oct 17", "Pat: Sending the deck tonight")];
        previews.extend(list_extra.iter().map(|(a, b, c)| (*a, *b, *c)));
        for (name, date, text) in previews {
            v.push(n("AXCheckBox", &format!("Select conversation with {name}"), &list));
            v.push(n("AXHeading", name, &list));
            v.push(n("AXStaticText", date, &list));
            v.push(n("AXStaticText", date, &list));
            v.push(n("AXStaticText", text, &list));
            v.push(n("AXStaticText", ". Press return to go to conversation details", &list));
            v.push(n("AXButton", &format!("Open the options list in your conversation with {name} and Sam Test"), &list));
            v.push(n("AXStaticText", "Status is online", &list));
        }
        // The open thread: the person's card, a day header, then messages.
        let card = at(&web, &[("AXLink", "Pat Quill Staff engineer | Acme")]);
        v.push(n("AXHeading", "Pat Quill", &card));
        v.push(n("AXStaticText", "Pat Quill", &card));
        v.push(n("AXStaticText", "Staff engineer | Acme", &card));
        v.push(n("AXStaticText", "FRIDAY", &at(&web, &[])));
        for (who, time, lines) in messages {
            v.push(n("AXStaticText", &format!("{who} sent the following message at {time}"), &at(&web, &[])));
            v.push(n("AXLink", &format!("View {who}’s profile {who}"), &at(&web, &[])));
            v.push(n("AXStaticText", &format!("View {who}’s profile"), &at(&web, &[])));
            v.push(n("AXStaticText", who, &at(&web, &[])));
            v.push(n("AXStaticText", "•", &at(&web, &[])));
            v.push(n("AXStaticText", time, &at(&web, &[])));
            for line in *lines {
                v.push(n("AXStaticText", line, &at(&web, &[])));
            }
        }
        v.push(n("AXButton", "Reply to conversation with “Yeah”", &at(&web, &[])));
        v.push(n("AXButton", "Send", &at(&web, &[])));
        v.push(n("AXStaticText", "Page inboxes", &at(&web, &[])));
        v.push(n("AXStaticText", "Acme Careers", &at(&web, &[("AXGroup", "advertisement")])));
        v.push(n("AXStaticText", "Promoted", &at(&web, &[("AXGroup", "advertisement")])));
        v.push(n("AXLink", "About", &at(&web, &[("AXGroup", "LinkedIn Footer Content")])));
        v
    }

    fn by_kind(seg: &Segmentation, kind: Kind) -> Vec<&Item> {
        seg.items.iter().filter(|i| i.kind == kind).collect()
    }

    #[test]
    fn linkedin_messaging_splits_previews_card_and_messages_and_drops_furniture() {
        let nodes = linkedin_thread(
            &[],
            &[
                ("Pat Quill", "10:08 PM", &["Hey, saw your profile", "Are you free to talk?"][..]),
                ("Sam Test", "10:12 PM", &["Sure, tomorrow at 1pm"][..]),
                ("Pat Quill", "10:14 PM", &["Great, my number is 98765 43210"][..]),
            ],
        );
        let seg = segment(&nodes, Some(THREAD_URL)).expect("recognised");
        let previews = by_kind(&seg, Kind::Preview);
        assert_eq!(previews.len(), 2);
        assert_eq!(previews[0].author.as_deref(), Some("Robin Vale"));
        assert_eq!(previews[0].time.as_deref(), Some("3:23 PM"));
        assert_eq!(previews[0].lines, vec!["You: See you at the standup"]);
        let card = by_kind(&seg, Kind::Profile);
        assert_eq!((card.len(), card[0].author.as_deref()), (1, Some("Pat Quill")));
        assert_eq!(card[0].lines, vec!["Staff engineer | Acme"]);
        let messages = by_kind(&seg, Kind::Message);
        assert_eq!(messages.len(), 3);
        assert_eq!(messages[0].author.as_deref(), Some("Pat Quill"));
        assert_eq!(messages[0].time.as_deref(), Some("FRIDAY 10:08 PM"));
        assert_eq!(messages[0].lines, vec!["Hey, saw your profile", "Are you free to talk?"]);
        assert_eq!(messages[1].author.as_deref(), Some("Sam Test"));
        assert_eq!(messages[2].lines, vec!["Great, my number is 98765 43210"]);
        assert!(messages.iter().all(|m| m.container == "2-abc" && m.scope.as_deref() == Some("Pat Quill")));
        // Nothing of the furniture survives in any item.
        let all: String = seg.items.iter().map(Item::text).collect::<Vec<_>>().join("\n");
        for junk in ["My Network", "Press return", "Status is online", "screen reader", "Acme Careers", "Promoted", "Page inboxes", "About", "•"] {
            assert!(!all.contains(junk), "{junk} leaked: {all}");
        }
        assert!(seg.stats.chars["noise"] > 0);
    }

    #[test]
    fn a_message_never_loses_its_sender() {
        let nodes = linkedin_thread(&[], &[("Sam Test", "9:00 AM", &["one"][..]), ("Pat Quill", "9:01 AM", &["two"][..])]);
        let seg = segment(&nodes, Some(THREAD_URL)).unwrap();
        let refs: Vec<&Item> = by_kind(&seg, Kind::Message);
        let planned = plan(seg.site, &refs, 1_600);
        assert_eq!(planned.len(), 1);
        assert_eq!(planned[0].body, "Sam Test (FRIDAY 9:00 AM):\none\nPat Quill (FRIDAY 9:01 AM):\ntwo");
        assert_eq!(planned[0].header, "LinkedIn chat with Pat Quill · FRIDAY 9:00 AM to FRIDAY 9:01 AM");
    }

    pub fn feed_post(ordinal: usize, author: &str, headline: &str, age: &str, text: &[&str], promoted: bool) -> Vec<AxNode> {
        let web = li("Feed | LinkedIn");
        let main = at(&web, &[("AXGroup", "Primary content")]);
        let profile = format!("{author} Premium Profile 1st");
        let mut v = vec![
            n("AXHeading", &format!("Feed post number {ordinal}"), &main),
            n("AXLink", &profile, &main),
            n("AXStaticText", author, &at(&main, &[("AXLink", &profile)])),
            n("AXStaticText", "• 1st", &at(&main, &[("AXLink", &profile)])),
            n("AXStaticText", headline, &main),
        ];
        if promoted {
            v.push(n("AXStaticText", "Promoted by", &main));
        }
        v.push(n("AXStaticText", age, &main));
        v.push(n("AXButton", &format!("Open control menu for post by {author}"), &main));
        for line in text {
            v.push(n("AXStaticText", line, &main));
        }
        v.push(n("AXLink", "Switch to different account", &main));
        v.push(n("AXButton", "Reaction button state: no reaction", &main));
        v.push(n("AXStaticText", "Reaction noise", &main));
        v
    }

    #[test]
    fn linkedin_feed_keeps_posts_with_author_and_drops_ads_and_sidebar() {
        let web = li("Feed | LinkedIn");
        let mut nodes = vec![
            n("AXStaticText", "Profile viewers 12", &at(&web, &[("AXGroup", "Sidebar")])),
            n("AXStaticText", "Today’s top news for you and your friends", &at(&web, &[("AXGroup", "Aside")])),
        ];
        nodes.extend(feed_post(1, "Lena Hart", "Investor at Northwind", "1m", &["Two roles are open in Bengaluru.", "DM me."], false));
        nodes.extend(feed_post(2, "Brand Co", "Marketing", "2h", &["Buy our thing today."], true));
        nodes.extend(feed_post(3, "Omar Reyes", "Founder at Lumen", "21h", &["Shipped the search API."], false));
        let seg = segment(&nodes, Some("https://www.linkedin.com/feed/")).unwrap();
        let posts = by_kind(&seg, Kind::Post);
        assert_eq!(posts.len(), 2, "the promoted post is dropped");
        assert_eq!(posts[0].author.as_deref(), Some("Lena Hart"));
        assert_eq!(posts[0].time.as_deref(), Some("1m"));
        assert_eq!(posts[0].byline.as_deref(), Some("Investor at Northwind"));
        assert_eq!(posts[0].lines, vec!["Two roles are open in Bengaluru.", "DM me."]);
        assert_eq!(posts[1].author.as_deref(), Some("Omar Reyes"));
        assert_eq!(posts[1].container, "feed");
        let all: String = seg.items.iter().map(Item::text).collect();
        assert!(!all.contains("Profile viewers") && !all.contains("top news") && !all.contains("Reaction noise") && !all.contains("Buy our thing"));
        let header = plan(seg.site, &[posts[0]], 1_600)[0].header.clone();
        assert_eq!(header, "LinkedIn post · Lena Hart · 1m · Investor at Northwind");
    }

    #[test]
    fn linkedin_profile_page_yields_a_profile_card() {
        let web = li("Dana Fox | LinkedIn");
        let nodes = vec![
            n("AXHeading", "Dana Fox", &at(&web, &[])),
            n("AXStaticText", "Product designer at Orchard", &at(&web, &[])),
            n("AXStaticText", "Pune, Maharashtra, India", &at(&web, &[])),
        ];
        let seg = segment(&nodes, Some("https://www.linkedin.com/in/dana-fox/")).unwrap();
        let card = by_kind(&seg, Kind::Profile);
        assert_eq!(card.len(), 1);
        assert_eq!(card[0].author.as_deref(), Some("Dana Fox"));
        assert_eq!(card[0].lines, vec!["Product designer at Orchard", "Pune, Maharashtra, India"]);
    }

    const HOME: &str = "https://x.com/home";

    fn post_group(author: &str, verified: bool, handle: &str, age: &str, text: &[&str]) -> Vec<AxNode> {
        let web = vec![("AXWebArea", "Home / X")];
        let name = format!("{author}{} {handle} {age} {}", if verified { " Verified account" } else { "" }, text.join(" "));
        let timeline = at(&web, &[("AXGroup", "Home timeline"), ("AXGroup", "Your Home Timeline"), ("AXGroup", "Timeline: Your Home Timeline")]);
        let post = at(&timeline, &[("AXGroup", &name)]);
        let author_link = format!("{author}{}", if verified { " Verified account" } else { "" });
        let mut v = vec![
            n("AXLink", &author_link, &post),
            n("AXLink", handle, &post),
            n("AXLink", age, &post),
            n("AXButton", "Grok actions", &post),
        ];
        for line in text {
            v.push(n("AXStaticText", line, &post));
        }
        v.push(n("AXButton", "Show more", &post));
        let metrics = at(&post, &[("AXGroup", "4 replies, 31 reposts, 212 likes, 9853 views")]);
        v.push(n("AXStaticText", "4", &metrics));
        v.push(n("AXStaticText", "212", &metrics));
        v
    }

    #[test]
    fn x_home_timeline_keeps_each_author_with_their_post() {
        let web = vec![("AXWebArea", "Home / X")];
        let mut nodes = vec![
            n("AXLink", "Home", &at(&web, &[("AXGroup", "Primary")])),
            n("AXStaticText", "Trending now", &at(&web, &[("AXGroup", "Trending"), ("AXGroup", "Trending now")])),
            n("AXStaticText", "Terms", &at(&web, &[("AXGroup", "Trending"), ("AXGroup", "Footer")])),
        ];
        nodes.extend(post_group("Ivy Marsh", true, "@ivymarsh", "22 hours ago", &["Deep tech needs patient capital.", "Agree?"]));
        nodes.extend(post_group("prtm", false, "@nowitspk", "1 hour ago", &["Terrible start of the day."]));
        let mut ad = post_group("Brand", true, "@brand", "3 hours ago", &["Ad copy here"]);
        ad.push(n("AXStaticText", "Ad", &at(&web, &[("AXGroup", "Home timeline"), ("AXGroup", "Your Home Timeline"), ("AXGroup", "Timeline: Your Home Timeline"), ("AXGroup", "Brand Verified account @brand 3 hours ago Ad copy here")])));
        nodes.extend(ad);
        let seg = segment(&nodes, Some(HOME)).unwrap();
        let posts = by_kind(&seg, Kind::Post);
        assert_eq!(posts.len(), 2);
        assert_eq!((posts[0].author.as_deref(), posts[0].handle.as_deref(), posts[0].time.as_deref()), (Some("Ivy Marsh"), Some("@ivymarsh"), Some("22 hours ago")));
        assert_eq!(posts[0].lines, vec!["Deep tech needs patient capital.", "Agree?"]);
        assert_eq!(posts[1].author.as_deref(), Some("prtm"));
        assert_eq!(posts[1].lines, vec!["Terrible start of the day."]);
        assert!(posts.iter().all(|p| p.container == "home"));
        let all: String = seg.items.iter().map(Item::text).collect();
        assert!(!all.contains("Trending") && !all.contains("Terms") && !all.contains("Ad copy"));
        assert_eq!(plan(seg.site, &[posts[0]], 1_600)[0].header, "X post · Ivy Marsh (@ivymarsh) · 22 hours ago");
    }

    #[test]
    fn promoted_posts_are_dropped_unless_the_switch_keeps_them_and_trend_cards_are_content() {
        let web = vec![("AXWebArea", "Home / X")];
        let trending = at(&web, &[("AXGroup", "Trending"), ("AXGroup", "Trending now")]);
        let news = "Anthropic Commits 5% of Shares to Public Benefit Fund Trending now · News · 4,942 posts";
        let mut nodes = vec![
            n("AXLink", news, &trending),
            n("AXStaticText", "Anthropic Commits 5% of Shares to Public Benefit Fund", &at(&trending, &[("AXLink", news)])),
            n("AXStaticText", "Trending now · News · 4,942 posts", &at(&trending, &[("AXLink", news)])),
            n("AXLink", "Unlock 7 percent Promoted by IDFC", &trending),
            n("AXStaticText", "Unlock 7 percent", &at(&trending, &[("AXLink", "Unlock 7 percent Promoted by IDFC")])),
            n("AXStaticText", "Promoted by IDFC FIRST Bank", &at(&trending, &[("AXLink", "Unlock 7 percent Promoted by IDFC")])),
        ];
        let mut ad = post_group("Brand", true, "@brand", "3 hours ago", &["Buy the thing"]);
        ad.push(n("AXStaticText", "Ad", &at(&web, &[("AXGroup", "Home timeline"), ("AXGroup", "Your Home Timeline"), ("AXGroup", "Timeline: Your Home Timeline"), ("AXGroup", "Brand Verified account @brand 3 hours ago Buy the thing")])));
        nodes.extend(ad);
        nodes.extend(post_group("Ivy Marsh", true, "@ivymarsh", "1 hour ago", &["A real post."]));
        let seg = segment(&nodes, Some(HOME)).unwrap();
        assert_eq!(by_kind(&seg, Kind::Post).len(), 1);
        let other = by_kind(&seg, Kind::Other);
        assert_eq!(other.len(), 1, "the news card is kept, the promoted card is not");
        assert_eq!(other[0].lines, vec!["Anthropic Commits 5% of Shares to Public Benefit Fund", "Trending now · News · 4,942 posts"]);
        assert_eq!(other[0].container, "trending");
        force_ads(true);
        let seg = segment(&nodes, Some(HOME)).unwrap();
        force_ads(false);
        let posts = by_kind(&seg, Kind::Post);
        assert_eq!(posts.len(), 2);
        assert!(posts[0].ad && !posts[1].ad);
        assert_eq!(plan(seg.site, &[posts[0]], 1_600)[0].header, "X ad · Brand (@brand) · 3 hours ago");
        assert_eq!(by_kind(&seg, Kind::Other).len(), 2);
    }

    #[test]
    fn x_repost_and_quote_stay_in_one_post_with_the_quoted_author_named() {
        let web = vec![("AXWebArea", "Home / X")];
        let timeline = at(&web, &[("AXGroup", "Home timeline"), ("AXGroup", "Timeline: Your Home Timeline")]);
        let post = at(&timeline, &[("AXGroup", "Kai Lund reposted Noor Aziz Verified account @nooraziz 22 hours ago Absolutely")]);
        let quote = at(&post, &[("AXGroup", "Quote Ivy Marsh Verified account")]);
        let nodes = vec![
            n("AXLink", "Kai Lund reposted", &post),
            n("AXStaticText", "Kai Lund", &at(&post, &[("AXLink", "Kai Lund reposted")])),
            n("AXLink", "Noor Aziz Verified account", &post),
            n("AXLink", "@nooraziz", &post),
            n("AXLink", "22 hours ago", &post),
            n("AXStaticText", "Absolutely correct.", &post),
            n("AXStaticText", "Quote", &quote),
            n("AXLink", "Ivy Marsh Verified account @ivymarsh Oct 17 Deep tech's risk capital", &quote),
            n("AXStaticText", "Deep tech's risk capital came from internet founders.", &at(&quote, &[("AXLink", "Ivy Marsh Verified account @ivymarsh Oct 17 Deep tech's risk capital")])),
        ];
        let seg = segment(&nodes, Some(HOME)).unwrap();
        let posts = by_kind(&seg, Kind::Post);
        assert_eq!(posts.len(), 1);
        assert_eq!(posts[0].author.as_deref(), Some("Noor Aziz"));
        assert_eq!(posts[0].byline.as_deref(), Some("Kai Lund reposted"));
        assert_eq!(
            posts[0].lines,
            vec!["Absolutely correct.", "Quoted post by Ivy Marsh (@ivymarsh), Oct 17:", "Deep tech's risk capital came from internet founders."]
        );
    }

    #[test]
    fn a_quote_link_with_a_relative_age_and_an_avatar_prefix_is_read() {
        let web = vec![("AXWebArea", "Home / X")];
        let post = at(&web, &[("AXGroup", "Home timeline"), ("AXGroup", "Timeline: Your Home Timeline"), ("AXGroup", "Ryan Orhan Verified account @rynorhn 12 hours ago holy")]);
        let quote = at(&post, &[("AXGroup", ""), ("AXGroup", ""), ("AXGroup", "Quote Square profile picture Anthropic Verified account @AnthropicAI 15 hours ago We’re")]);
        let label = "Square profile picture Anthropic Verified account @AnthropicAI 15 hours ago We’re committing a portion of shares";
        let nodes = vec![
            n("AXLink", "Ryan Orhan Verified account", &post),
            n("AXLink", "@rynorhn", &post),
            n("AXLink", "12 hours ago", &post),
            n("AXStaticText", "holy shit", &post),
            n("AXStaticText", "Quote", &quote),
            n("AXLink", label, &at(&quote, &[("AXGroup", "")])),
            n("AXStaticText", "We’re committing a portion of shares", &at(&quote, &[("AXLink", label)])),
        ];
        let seg = segment(&nodes, Some(HOME)).unwrap();
        let posts = by_kind(&seg, Kind::Post);
        assert_eq!(posts.len(), 1, "a quote stays inside the post that quotes it");
        assert_eq!(posts[0].lines, vec!["holy shit", "Quoted post by Anthropic (@AnthropicAI), 15 hours ago:", "We’re committing a portion of shares"]);
    }

    #[test]
    fn a_quote_nested_inside_the_quoting_link_is_read_as_its_own_author() {
        // The page's own shape: no group for the inner quote, only a "Quote" label and a link inside the outer link.
        let web = vec![("AXWebArea", "Home / X")];
        let post = at(&web, &[("AXGroup", "Home timeline"), ("AXGroup", "Timeline: Your Home Timeline"), ("AXGroup", "Aaron Slodov Verified account @aphysicist 17 hours ago Fix it")]);
        let outer = at(&post, &[("AXGroup", "Quote Mark Cuban Verified account @mcuban 19 hours ago Made")]);
        let (ol, il) = ("Mark Cuban Verified account @mcuban 19 hours ago Made in USA matters", "Palmer Luckey Verified account @PalmerLuckey Oct 17 Stories about iPhones are psy-ops");
        let in_outer_link = at(&outer, &[("AXLink", ol)]);
        let in_inner_link = at(&in_outer_link, &[("AXLink", il)]);
        let nodes = vec![
            n("AXLink", "Aaron Slodov Verified account", &post),
            n("AXLink", "@aphysicist", &post),
            n("AXLink", "17 hours ago", &post),
            n("AXStaticText", "Fix it", &post),
            n("AXStaticText", "Quote", &outer),
            n("AXLink", ol, &outer),
            n("AXStaticText", "Made in USA matters.", &in_outer_link),
            n("AXStaticText", "Quote", &in_outer_link),
            n("AXLink", il, &in_outer_link),
            n("AXStaticText", "Stories about iPhones are psy-ops.", &in_inner_link),
        ];
        let seg = segment(&nodes, Some(HOME)).unwrap();
        let posts = by_kind(&seg, Kind::Post);
        assert_eq!(posts.len(), 1);
        assert_eq!(
            posts[0].lines,
            vec![
                "Fix it",
                "Quoted post by Mark Cuban (@mcuban), 19 hours ago:",
                "Made in USA matters.",
                "Quoted post by Palmer Luckey (@PalmerLuckey), Oct 17:",
                "Stories about iPhones are psy-ops."
            ]
        );
    }

    #[test]
    fn a_quote_of_a_quote_keeps_each_author() {
        let web = vec![("AXWebArea", "Home / X")];
        let post = at(&web, &[("AXGroup", "Home timeline"), ("AXGroup", "Timeline: Your Home Timeline"), ("AXGroup", "Aaron Slodov Verified account @aphysicist 17 hours ago Fix it")]);
        let outer = at(&post, &[("AXGroup", "Quote Mark Cuban Verified account @mcuban 19 hours ago Made in")]);
        let inner = at(&outer, &[("AXGroup", "Quote Palmer Luckey Verified account @PalmerLuckey Oct 17 Stories")]);
        let (ol, il) = ("Mark Cuban Verified account @mcuban 19 hours ago Made in USA", "Palmer Luckey Verified account @PalmerLuckey Oct 17 Stories about iPhones");
        let nodes = vec![
            n("AXLink", "Aaron Slodov Verified account", &post),
            n("AXLink", "@aphysicist", &post),
            n("AXLink", "17 hours ago", &post),
            n("AXStaticText", "Fix it", &post),
            n("AXStaticText", "Quote", &outer),
            n("AXLink", ol, &outer),
            n("AXStaticText", "Made in USA matters.", &at(&outer, &[("AXLink", ol)])),
            n("AXStaticText", "Quote", &inner),
            n("AXLink", il, &inner),
            n("AXStaticText", "Stories about iPhones are psy-ops.", &at(&inner, &[("AXLink", il)])),
        ];
        let seg = segment(&nodes, Some(HOME)).unwrap();
        let posts = by_kind(&seg, Kind::Post);
        assert_eq!(posts.len(), 1);
        assert_eq!(posts[0].author.as_deref(), Some("Aaron Slodov"));
        assert_eq!(
            posts[0].lines,
            vec![
                "Fix it",
                "Quoted post by Mark Cuban (@mcuban), 19 hours ago:",
                "Made in USA matters.",
                "Quoted post by Palmer Luckey (@PalmerLuckey), Oct 17:",
                "Stories about iPhones are psy-ops."
            ]
        );
    }

    #[test]
    fn x_single_post_page_and_replies() {
        let web = vec![("AXWebArea", "Jo Park on X")];
        let conversation = at(&web, &[("AXGroup", "Home timeline"), ("AXGroup", "Conversation"), ("AXGroup", "Timeline: Conversation")]);
        let first = at(&conversation, &[("AXGroup", "Jo Park Verified account @jopark Suffering is very good for you")]);
        let reply = at(&conversation, &[("AXGroup", "Lee Ng @leeng 2 hours ago Not sure about that")]);
        let nodes = vec![
            n("AXLink", "Jo Park Verified account", &first),
            n("AXLink", "@jopark", &first),
            n("AXLink", "Oct 17", &first),
            n("AXStaticText", "Suffering is very good for you.", &first),
            n("AXLink", "Lee Ng", &reply),
            n("AXLink", "@leeng", &reply),
            n("AXLink", "2 hours ago", &reply),
            n("AXStaticText", "Not sure about that.", &reply),
        ];
        let seg = segment(&nodes, Some("https://x.com/jopark/status/123")).unwrap();
        let posts = by_kind(&seg, Kind::Post);
        assert_eq!(posts.iter().map(|p| p.author.clone().unwrap()).collect::<Vec<_>>(), vec!["Jo Park", "Lee Ng"]);
        assert!(posts.iter().all(|p| p.container == "jopark"));
    }

    #[test]
    fn x_chat_has_previews_and_timed_messages_with_day_headers() {
        let web = vec![("AXWebArea", "X")];
        let list = at(&web, &[("AXGroup", "Home timeline"), ("AXList", "Conversations")]);
        let link = "user avatar Pip Ward Verified account 14w You: https://example.test/x";
        let messages = at(&web, &[("AXGroup", "Home timeline"), ("AXGroup", "Messages")]);
        let bubble = |name: &'static str| at(&messages, &[("AXGroup", name)]);
        let nodes = vec![
            n("AXLink", link, &list),
            n("AXStaticText", "Pip Ward", &at(&list, &[("AXLink", link)])),
            n("AXStaticText", "14w", &at(&list, &[("AXLink", link)])),
            n("AXStaticText", "You: ", &at(&list, &[("AXLink", link)])),
            n("AXStaticText", "https://example.test/x", &at(&list, &[("AXLink", link)])),
            n("AXStaticText", "Boardy", &at(&web, &[("AXGroup", "Home timeline"), ("AXLink", "user avatar Boardy Verified account")])),
            n("AXStaticText", "hello there", &bubble("You 1:35 PM")),
            n("AXStaticText", "1:35 PM", &bubble("You 1:35 PM")),
            n("AXStaticText", "Sat, Oct 10 at 2:40 AM", &messages),
            n("AXLink", "Meet Vasu files.test", &bubble("Attachment Boardy")),
            n("AXStaticText", "Meet Vasu", &at(&bubble("Attachment Boardy"), &[("AXLink", "Meet Vasu files.test")])),
            n("AXStaticText", "Found someone for that build.", &bubble("Boardy 2:40 AM")),
            n("AXStaticText", "2:40 AM", &bubble("Boardy 2:40 AM")),
            n("AXButton", "Reply", &bubble("Boardy 2:40 AM")),
        ];
        let seg = segment(&nodes, Some("https://x.com/i/chat/123-456")).unwrap();
        let previews = by_kind(&seg, Kind::Preview);
        assert_eq!(previews.len(), 1);
        assert_eq!((previews[0].author.as_deref(), previews[0].time.as_deref()), (Some("Pip Ward"), Some("14w")));
        assert_eq!(previews[0].lines, vec!["You: https://example.test/x"]);
        let msgs = by_kind(&seg, Kind::Message);
        assert_eq!(msgs.len(), 2);
        assert_eq!((msgs[0].author.as_deref(), msgs[0].time.as_deref()), (Some("You"), Some("1:35 PM")));
        assert_eq!(msgs[0].lines, vec!["hello there"]);
        assert_eq!((msgs[1].author.as_deref(), msgs[1].time.as_deref()), (Some("Boardy"), Some("Sat, Oct 10 2:40 AM")));
        assert_eq!(msgs[1].lines, vec!["Meet Vasu", "Found someone for that build."], "the attachment stays with the message that follows it");
        assert!(msgs.iter().all(|m| m.container == "123-456" && m.scope.as_deref() == Some("Boardy")));
    }

    #[test]
    fn unsupported_sites_and_unrecognised_pages_fall_back() {
        let nodes = linkedin_thread(&[], &[("Sam Test", "9:00 AM", &["one"][..])]);
        assert!(segment(&nodes, Some("https://example.com/messaging/thread/1/")).is_none());
        assert!(segment(&nodes, None).is_none());
        // A supported site whose page has no region the rules know.
        let web = li("Something | LinkedIn");
        let blank = vec![n("AXStaticText", "Short", &at(&web, &[])), n("AXButton", "Go", &at(&web, &[]))];
        assert!(segment(&blank, Some("https://www.linkedin.com/jobs/")).is_none());
        // Only furniture.
        let nav = vec![n("AXLink", "Home", &at(&web, &[("AXGroup", "Global Navigation")]))];
        assert!(segment(&nav, Some("https://www.linkedin.com/feed/")).is_none());
    }

    #[test]
    fn protected_and_excluded_nodes_are_never_read() {
        let mut nodes = linkedin_thread(&[], &[("Sam Test", "9:00 AM", &["visible line", "secret line"][..])]);
        let secret = nodes.iter_mut().find(|node| node.value.as_deref() == Some("secret line")).unwrap();
        secret.extra.insert("protected".into(), json!(true));
        let seg = segment(&nodes, Some(THREAD_URL)).unwrap();
        let all: String = seg.items.iter().map(Item::text).collect();
        assert!(all.contains("visible line") && !all.contains("secret line"));
    }

    #[test]
    fn identity_ignores_relative_ages_but_not_text_author_or_container() {
        let mut a = Item::new(Kind::Post, "home");
        a.author = Some("Ivy Marsh".into());
        a.handle = Some("@ivymarsh".into());
        a.time = Some("3 hours ago".into());
        a.lines = vec!["Deep tech  needs patient capital".into()];
        let mut b = a.clone();
        b.time = Some("4 hours ago".into());
        b.lines = vec!["deep tech needs patient capital".into()];
        let key = |i: &Item| identity("com.google.Chrome", Site::X, i);
        assert_eq!(key(&a), key(&b));
        b.lines = vec!["something else".into()];
        assert_ne!(key(&a), key(&b));
        let mut c = a.clone();
        c.author = Some("Someone Else".into());
        assert_ne!(key(&a), key(&c));
        let mut d = a.clone();
        d.container = "explore".into();
        assert_ne!(key(&a), key(&d));
        // An absolute time is part of the identity.
        let (mut e, mut f) = (a.clone(), a.clone());
        e.time = Some("Oct 17".into());
        f.time = Some("Oct 18".into());
        assert_ne!(key(&e), key(&f));
    }

    #[test]
    fn plan_keeps_a_post_whole_splits_a_long_one_with_its_header_and_never_mixes_threads() {
        let mut post = Item::new(Kind::Post, "home");
        post.author = Some("Ivy Marsh".into());
        post.handle = Some("@ivymarsh".into());
        post.time = Some("Oct 17".into());
        post.lines = vec!["Short post text.".into()];
        let mut long = post.clone();
        long.lines = (0..40).map(|i| format!("Sentence number {i} of a very long post that keeps going and going.")).collect();
        let planned = plan(Site::X, &[&post, &long], 1_600);
        assert_eq!(planned[0].items, vec![0]);
        assert_eq!(planned[0].body, "Short post text.");
        assert!(planned.len() > 2, "the long post is split");
        assert!(planned[1..].iter().all(|p| p.header == "X post · Ivy Marsh (@ivymarsh) · Oct 17" && p.items == vec![1]));
        assert!(planned[1..].iter().all(|p| p.body.chars().count() <= 1_700));

        let message = |thread: &str, who: &str, text: &str| {
            let mut m = Item::new(Kind::Message, thread);
            m.author = Some(who.into());
            m.time = Some("9:00 AM".into());
            m.scope = Some("Pat".into());
            m.lines = vec![text.into()];
            m
        };
        let (a1, a2, b1) = (message("t1", "Pat", "one"), message("t1", "Me", "two"), message("t2", "Pat", "three"));
        let planned = plan(Site::LinkedIn, &[&a1, &a2, &b1], 1_600);
        assert_eq!(planned.iter().map(|p| p.items.clone()).collect::<Vec<_>>(), vec![vec![0, 1], vec![2]]);
        assert_eq!(planned[1].header, "LinkedIn chat with Pat · Pat, 9:00 AM");
        assert_eq!(planned[1].container, "t2");
    }
}

