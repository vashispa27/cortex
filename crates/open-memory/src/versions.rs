//! Versions of the same page.
//!
//! A chat that is edited, an email that is revised, a window seen again after scrolling: each state is
//! a snapshot, and a question about the page matches several of them. Two things happen here, both
//! after ranking and before the result list is cut:
//!  * Near-identical results are collapsed. Two results are mergeable only when they differ in nothing
//!    that carries meaning: the same numbers, capitalised words (names, months, weekdays) and negations,
//!    and a word-set Jaccard overlap above `dedup_jaccard`. A changed amount, date, name or "not"
//!    keeps both versions, because a revised quote or a reversed decision is exactly what a user asks
//!    about. The representative is the one that matches the question better, then the newer; the other
//!    is kept as a pointer (`Hit::versions`).
//!  * Versions that remain (same app, title and URL) are ordered by what the question asks for:
//!    newest first by default and for "now/current/latest/revised", oldest first for
//!    "original/before/previous/first". Only the positions the group already occupies are permuted.

use super::*;
use std::collections::BTreeSet;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Recency {
    Newest,
    Oldest,
}

pub fn intent(question: &str) -> Recency {
    let q = question.to_lowercase();
    let words: BTreeSet<&str> = q.split(|c: char| !c.is_alphanumeric() && c != '\'').collect();
    let newest = ["now", "current", "currently", "latest", "newest", "revised", "updated"];
    let oldest = ["original", "originally", "old", "older", "previous", "previously", "before", "earlier", "first", "initial", "initially"];
    let wants_old = oldest.iter().any(|w| words.contains(w)) || q.contains("used to");
    let wants_new = newest.iter().any(|w| words.contains(w)) || q.contains("most recent");
    if wants_old && !wants_new { Recency::Oldest } else { Recency::Newest }
}

/// Tokens whose change changes the meaning: anything with a digit, capitalised words, negations.
pub fn critical_tokens(body: &str) -> BTreeSet<String> {
    let negations = ["not", "no", "never", "cannot", "without", "none", "neither", "nor"];
    body.split(|c: char| !(c.is_alphanumeric() || c == '\'' || c == '$' || c == '€' || c == '.' || c == ','))
        .map(|t| t.trim_matches(|c: char| c == '.' || c == ','))
        .filter(|t| !t.is_empty())
        .filter(|t| {
            t.chars().any(|c| c.is_ascii_digit())
                || t.chars().next().is_some_and(char::is_uppercase)
                || negations.contains(&t.to_lowercase().as_str())
                || t.to_lowercase().ends_with("n't")
        })
        .map(str::to_lowercase)
        .collect()
}

fn jaccard(a: &str, b: &str) -> f64 {
    let (a, b) = (word_set(a), word_set(b));
    if a.is_empty() && b.is_empty() {
        return 1.0;
    }
    a.intersection(&b).count() as f64 / a.union(&b).count() as f64
}

fn word_set(s: &str) -> BTreeSet<String> {
    s.to_lowercase().split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()).map(str::to_owned).collect()
}

/// May two bodies be treated as one result?
pub fn mergeable(a: &str, b: &str, threshold: f64) -> bool {
    threshold > 0.0 && critical_tokens(a) == critical_tokens(b) && jaccard(a, b) >= threshold
}

type Entry = (f32, (Source, Option<i64>, Vec<EvidenceChunk>, Vec<i64>));

fn matches(question: &str, body: &str) -> usize {
    let lower = body.to_lowercase();
    content_terms(question).iter().filter(|t| lower.contains(t.as_str())).count()
}

/// `entries` must be sorted best first. Returns them merged and ordered, same type, still best first.
pub fn apply(mut entries: Vec<Entry>, question: &str, params: &Params) -> Vec<Entry> {
    // 1. Merge near-identical results.
    if params.dedup_jaccard > 0.0 {
        let mut kept: Vec<Entry> = Vec::new();
        'next: for entry in entries {
            for k in kept.iter_mut() {
                if mergeable(&k.1 .0.body, &entry.1 .0.body, params.dedup_jaccard) {
                    let better_than_kept = (matches(question, &entry.1 .0.body), entry.1 .0.last_seen_ms)
                        > (matches(question, &k.1 .0.body), k.1 .0.last_seen_ms);
                    let mut other = entry;
                    if better_than_kept {
                        std::mem::swap(k, &mut other);
                        // Position of the better-ranked entry is kept; its score stays.
                        k.0 = other.0.max(k.0);
                    }
                    k.1 .3.push(other.1 .0.id);
                    k.1 .3.extend(other.1 .3);
                    continue 'next;
                }
            }
            kept.push(entry);
        }
        entries = kept;
    }
    // 2. Order the remaining versions of the same page.
    if params.version_order {
        let want = intent(question);
        let mut groups: std::collections::BTreeMap<(String, String, String), Vec<usize>> = std::collections::BTreeMap::new();
        for (i, e) in entries.iter().enumerate() {
            let s = &e.1 .0;
            groups.entry((s.app_id.clone(), s.title.clone(), s.url.clone().unwrap_or_default())).or_default().push(i);
        }
        for slots in groups.values().filter(|s| s.len() > 1) {
            let mut members: Vec<Entry> = slots.iter().map(|&i| entries[i].clone()).collect();
            members.sort_by(|a, b| match want {
                Recency::Newest => b.1 .0.last_seen_ms.cmp(&a.1 .0.last_seen_ms),
                Recency::Oldest => a.1 .0.last_seen_ms.cmp(&b.1 .0.last_seen_ms),
            });
            let ids: Vec<i64> = members.iter().map(|m| m.1 .0.id).collect();
            // Only reorder when the versions are about equally relevant: the best member's normalised
            // score is within `version_margin` of every other member's.
            let top = members.iter().map(|m| m.0).fold(f32::MIN, f32::max) as f64;
            let low = members.iter().map(|m| m.0).fold(f32::MAX, f32::min) as f64;
            let scale = params.rrf_max_score();
            if (top - low) / scale > params.version_margin {
                continue;
            }
            for (slot, mut member) in slots.iter().zip(members) {
                // Hand each slot the score the slot had, so the list stays sorted.
                member.0 = entries[*slot].0;
                member.1 .3 = ids.iter().copied().filter(|id| *id != member.1 .0.id).collect();
                entries[*slot] = member;
            }
        }
    }
    entries
}

/// A page is a URL within an app, or a window title when no valid URL is available.
/// Keep paths and query parameters: different pages on one site can supply different evidence.
fn page_key(source: &Source) -> (String, String) {
    let page = source.url.as_deref().and_then(|s| url::Url::parse(s.trim()).ok()).map(|mut url| {
        url.set_fragment(None);
        let path = url.path().trim_end_matches('/').to_owned();
        url.set_path(&path);
        format!("url:{url}")
    }).unwrap_or_else(|| format!("title:{}", source.title.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()));
    (source.app_id.clone(), page)
}

/// Run after version ordering so the intended old/new version keeps its slot. Overflow remains
/// discoverable through the first retained member's version pointers, even beyond the final cut.
pub fn cap_pages(entries: Vec<Entry>, cap: usize) -> Vec<Entry> {
    if cap == 0 { return entries; }
    let mut groups = std::collections::HashMap::<(String, String), (usize, usize)>::new();
    let mut kept: Vec<Entry> = Vec::new();
    for entry in entries {
        let group = groups.entry(page_key(&entry.1 .0)).or_insert((kept.len(), 0));
        if group.1 < cap {
            group.1 += 1;
            kept.push(entry);
        } else {
            let representative = &mut kept[group.0].1;
            for id in std::iter::once(entry.1 .0.id).chain(entry.1 .3) {
                if id != representative.0.id && !representative.3.contains(&id) {
                    representative.3.push(id);
                }
            }
        }
    }
    kept
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn intent_words() {
        assert_eq!(intent("what is my current rent budget"), Recency::Newest);
        assert_eq!(intent("when is the standup now"), Recency::Newest);
        assert_eq!(intent("what was my original rent cap before I changed it"), Recency::Oldest);
        assert_eq!(intent("what did the first quote say"), Recency::Oldest);
        assert_eq!(intent("what did I decide about the apartment"), Recency::Newest, "default is newest");
        assert_eq!(intent("what was the original and what is it now"), Recency::Newest, "both: newest");
    }

    #[test]
    fn changed_amounts_dates_names_and_negations_are_never_merged() {
        let a = "Rent budget is capped at $1,850 per month. We will renew the lease. Decision recorded by Maple Street.";
        assert!(mergeable(a, a, 0.9));
        assert!(mergeable(a, &a.replace("We will", "We shall"), 0.7), "wording only");
        assert!(!mergeable(a, &a.replace("$1,850", "$2,050"), 0.7), "amount");
        assert!(!mergeable(a, &a.replace("Maple Street", "Corvina Street"), 0.7), "name");
        assert!(!mergeable(a, &a.replace("renew", "renew by 4 December, do not renew"), 0.7), "date and negation");
        assert!(!mergeable("The meeting is on Monday at ten.", "The meeting is on Tuesday at ten.", 0.5), "weekday");
        assert!(!mergeable("We will go.", "We will not go.", 0.5), "negation");
        assert!(!mergeable("We will go.", "We won't go.", 0.3), "contraction");
        assert!(!mergeable(a, "completely different text about something else entirely", 0.5));
        assert!(!mergeable(a, a, 0.0), "threshold 0 disables merging");
    }

    fn entry(id: i64, title: &str, body: &str, last_seen: i64, score: f32) -> Entry {
        let source = Source {
            id, app_id: "app".into(), title: title.into(), url: Some("https://x.example/p".into()), domain: None,
            source_type: "browser".into(), body: body.into(), first_seen_ms: last_seen, last_seen_ms: last_seen,
            sightings: 1, limitations: "[]".into(), cleaner_quality: "main_content".into(), hit_text: None, score,
        };
        (score, (source, None, vec![], vec![]))
    }

    fn ids(entries: &[Entry]) -> Vec<i64> {
        entries.iter().map(|e| e.1 .0.id).collect()
    }

    #[test]
    fn versions_of_one_page_are_ordered_by_what_is_asked() {
        let p = Params::default();
        let base = |b: &str| format!("Rent budget. Decision recorded. {b}");
        let old = entry(1, "Budget", &base("Cap is $1,850 per month."), 100, 0.0328);
        let new = entry(2, "Budget", &base("Cap is $2,050 per month."), 200, 0.0320);
        let other = entry(3, "Garden", "Tomatoes 60 cm apart.", 150, 0.0300);
        let newest_first = apply(vec![old.clone(), other.clone(), new.clone()], "what is my current rent cap", &p);
        assert_eq!(ids(&newest_first), vec![2, 3, 1], "the group's slots (1st and 3rd) are permuted; the other result stays");
        assert_eq!(newest_first[0].1 .3, vec![1], "pointer to the other version");
        let oldest_first = apply(vec![new.clone(), other.clone(), old.clone()], "what was the original rent cap", &p);
        assert_eq!(ids(&oldest_first), vec![1, 3, 2]);
        // Versions that are not about equally relevant keep the retriever's order.
        let far = (0.0100, new.1.clone());
        assert_eq!(ids(&apply(vec![old.clone(), far], "current rent cap", &p)), vec![1, 2]);
        // Different pages are never reordered.
        let other_page = entry(4, "Other page", &base("Cap is $2,050 per month."), 900, 0.0327);
        assert_eq!(ids(&apply(vec![old.clone(), other_page], "current rent cap", &p)), vec![1, 4]);
        assert_eq!(ids(&apply(vec![old, new], "x", &Params { version_order: false, ..p })), vec![1, 2]);
    }

    #[test]
    fn identical_results_collapse_but_changed_amounts_do_not() {
        let p = Params::default();
        let a = entry(1, "Quote", "Quote 2209. Total: 4,800 euros. Valid until 31 October. Accept by phone.", 100, 0.0320);
        let a2 = entry(2, "Quote copy", "Quote 2209. Total: 4,800 euros. Valid until 31 October. Accept by phone.", 200, 0.0310);
        let merged = apply(vec![a.clone(), a2.clone()], "quote total", &p);
        assert_eq!(ids(&merged), vec![2], "newer copy represents both");
        assert_eq!(merged[0].1 .3, vec![1]);
        let changed = entry(3, "Quote copy", "Quote 2209. Total: 5,350 euros. Valid until 15 November. Accept by phone.", 300, 0.0300);
        assert_eq!(ids(&apply(vec![a, changed], "quote total", &p)).len(), 2, "a revised amount and date stay distinct");
    }
    #[test]
    fn page_cap_preserves_version_intent_and_overflow_pointers() {
        let old = entry(1, "Budget", "Rent is $1,800.", 100, 0.032);
        let new = entry(2, "Budget", "Rent is $2,000.", 200, 0.031);
        let mut other = entry(3, "Other", "Different evidence.", 300, 0.030);
        other.1 .0.url = Some("https://x.example/other".into());
        for (question, expected) in [("current rent", 2), ("original rent", 1)] {
            let ordered = apply(vec![old.clone(), new.clone(), other.clone()], question, &Params::default());
            let capped = cap_pages(ordered, 1);
            assert_eq!(ids(&capped), vec![expected, 3]);
            assert!(capped[0].1 .3.contains(&(3 - expected)));
        }
        let entries = vec![old, new, other];
        assert_eq!(ids(&cap_pages(entries.clone(), 0)), vec![1, 2, 3]);
        assert_eq!(ids(&cap_pages(entries, 2)), vec![1, 2, 3]);
    }

    #[test]
    fn page_identity_normalises_urls_and_titles_without_grouping_a_whole_site() {
        let mut a = entry(1, "Title", "a", 0, 1.0);
        let mut b = a.clone();
        a.1 .0.url = Some("https://X.example:443/p/#first".into());
        b.1 .0.url = Some("https://x.example/p#second".into());
        assert_eq!(page_key(&a.1 .0), page_key(&b.1 .0));
        b.1 .0.url = Some("https://x.example/p?q=other".into());
        assert_ne!(page_key(&a.1 .0), page_key(&b.1 .0));
        b.1 .0.url = Some("https://x.example/another".into());
        assert_ne!(page_key(&a.1 .0), page_key(&b.1 .0));
        a.1 .0.url = None;
        b.1 .0.url = None;
        a.1 .0.title = "  Window   TITLE ".into();
        b.1 .0.title = "window title".into();
        assert_eq!(page_key(&a.1 .0), page_key(&b.1 .0));
        b.1 .0.app_id = "another.app".into();
        assert_ne!(page_key(&a.1 .0), page_key(&b.1 .0));
    }

}
