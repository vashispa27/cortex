//! When should `ask` say "no matching evidence" instead of listing eight weak results?
//!
//! Three cheap, deterministic signals are computed for every query (see `Retrieval`):
//!  * `score_norm`: the best result's fused score divided by the largest score a result can get
//!    (rank 1 in every retriever). RRF scores are rank based, so they are comparable across queries
//!    only after this normalisation; 1.0 means every retriever put the same chunk first.
//!  * `dense_sim`: cosine similarity between the question and the best three results' retrieved
//!    text (title plus chunks), using the same embedder as the index. Unlike the fused score it
//!    keeps the absolute similarity, which is what separates "close to something" from "about it".
//!  * `support`: the share of the question's content terms found (5-character prefix match) in the
//!    title or retrieved chunks of the best three results. It is the lexical check the dense score
//!    cannot make: a page can be close to the question in embedding space without containing the
//!    thing that was asked.
//! The rule and its thresholds are chosen on the dev split (`evals/tools/abstention_curve.py`).

use super::*;
use std::sync::OnceLock;

/// Words that appear in most questions and say nothing about the page that answers them.
const GENERIC: &[&str] = &[
    "what", "which", "when", "where", "about", "said", "does", "have", "with", "from", "that",
    "this", "there", "were", "would", "could", "should", "tell", "asked", "asking", "time", "much",
    "many", "long", "need", "know", "give", "show", "wrote", "write", "read", "look", "looked",
    "their", "they", "them", "your", "mine", "into", "than", "then", "some", "also", "right", "last",
    "week", "today", "yesterday", "month", "morning", "days", "ago",
    // Words that name the kind of source rather than its content ("the gym email", "that chat").
    "email", "emails", "mail", "text", "message", "messages", "chat", "page", "pages", "note", "notes",
    "article", "thread", "document", "file", "site", "website", "post",
];

pub fn support_terms(question: &str) -> Vec<String> {
    let mut terms: Vec<String> = question
        .split(|c: char| !c.is_alphanumeric())
        .map(str::to_lowercase)
        .filter(|t| t.len() > 3 && !GENERIC.contains(&t.as_str()))
        .collect();
    terms.sort();
    terms.dedup();
    terms
}

fn prefix(term: &str) -> String {
    term.chars().take(5).collect()
}

/// Share of `terms` present in `text` (lower-cased), matching on a 5-character prefix so that
/// "invoices" finds "invoice" and "belaying" finds "belayer".
pub fn coverage(terms: &[String], text: &str) -> f64 {
    if terms.is_empty() {
        return 1.0;
    }
    let lower = text.to_lowercase();
    terms.iter().filter(|t| lower.contains(&prefix(t))).count() as f64 / terms.len() as f64
}

/// Best coverage among the first three results (title plus retrieved chunks).
pub fn support(hits: &[Hit], question: &str) -> f64 {
    let terms = support_terms(question);
    hits.iter()
        .take(3)
        .map(|h| coverage(&terms, &format!("{}\n{}", h.source.title, evidence_text(h))))
        .fold(0.0, f64::max)
}

/// Best score divided by the best score any result can reach: rank 1 (reciprocal rank 1/k, ranks
/// counted from 0 by Qdrant's fusion) in every retriever.
pub fn score_norm(top: f64, params: &Params) -> f64 {
    let lists = if params.mode == Mode::Hybrid { 2.0 } else { 1.0 };
    top / (lists / params.rrf_k as f64)
}

pub fn cosine(a: &[f32], b: &[f32]) -> f64 {
    let dot: f64 = a.iter().zip(b).map(|(x, y)| (*x as f64) * (*y as f64)).sum();
    let na: f64 = a.iter().map(|x| (*x as f64).powi(2)).sum::<f64>().sqrt();
    let nb: f64 = b.iter().map(|x| (*x as f64).powi(2)).sum::<f64>().sqrt();
    if na == 0.0 || nb == 0.0 { 0.0 } else { dot / (na * nb) }
}

/// Identifier-like tokens in the question (contain a digit, at least three characters; dates and
/// plain years excluded), e.g. "4472", "QK7M2P", "CART-204".
pub fn identifiers(question: &str) -> Vec<String> {
    static DATE: OnceLock<Regex> = OnceLock::new();
    let date = DATE.get_or_init(|| Regex::new(r"^\d{4}-\d{2}-\d{2}$").unwrap());
    question
        .split(|c: char| !(c.is_alphanumeric() || c == '-'))
        .map(|t| t.trim_matches('-').to_lowercase())
        .filter(|t| t.chars().count() >= 3 && t.chars().any(|c| c.is_ascii_digit()) && !date.is_match(t))
        .filter(|t| !(t.len() == 4 && t.parse::<u32>().is_ok_and(|y| (1990..=2100).contains(&y))))
        .collect()
}

/// Share of the question's identifier tokens found in the title or retrieved text of the first three
/// results (1.0 when the question has none). "invoice 4472" against pages that only mention 4471 gives 0.
pub fn identifier_support(hits: &[Hit], question: &str) -> f64 {
    let ids = identifiers(question);
    if ids.is_empty() {
        return 1.0;
    }
    let text: String = hits.iter().take(3).map(|h| format!("{}\n{}", h.source.title, evidence_text(h))).collect::<Vec<_>>().join("\n").to_lowercase();
    ids.iter().filter(|t| text.contains(t.as_str())).count() as f64 / ids.len() as f64
}

/// Share of the question's content terms that occur in no stored chunk at all (5-character prefix
/// match). A question about something never captured ("Tokyo", "carrots", "invoice 4472") scores high;
/// a paraphrase also scores high, so this is only useful together with a similarity signal.
pub fn unseen_fraction(db: &Connection, question: &str) -> Result<f64> {
    let terms = support_terms(question);
    if terms.is_empty() {
        return Ok(0.0);
    }
    let mut unseen = 0;
    for t in &terms {
        let seen: bool = db.query_row(
            "SELECT EXISTS(SELECT 1 FROM chunks WHERE instr(lower(body), ?1) > 0)",
            [prefix(t)],
            |r| r.get(0),
        )?;
        if !seen {
            unseen += 1;
        }
    }
    Ok(unseen as f64 / terms.len() as f64)
}

/// Highest cosine between the question and any of the five best-ranked chunks (no title).
pub fn chunk_sim(runtime: &Runtime, ranked: &[RankedPoint], question: &str) -> Result<f64> {
    let q = runtime.vector(question)?;
    let mut best = 0.0_f64;
    for p in ranked.iter().filter(|p| p.kind == "chunk").take(5) {
        best = best.max(cosine(&q, &runtime.vector(&p.text)?));
    }
    Ok(best)
}

/// Share of content terms found in the five best-ranked chunks taken together.
pub fn chunk_support(ranked: &[RankedPoint], question: &str) -> f64 {
    let text = ranked.iter().filter(|p| p.kind == "chunk").take(5).map(|p| p.text.as_str()).collect::<Vec<_>>().join("\n");
    coverage(&support_terms(question), &text)
}

/// Highest cosine between the question and the title plus retrieved text of the first three results.
pub fn dense_sim(runtime: &Runtime, hits: &[Hit], question: &str) -> Result<f64> {
    let q = runtime.vector(question)?;
    let mut best = 0.0_f64;
    for h in hits.iter().take(3) {
        let text = format!("{}\n{}", h.source.title, evidence_text(h));
        best = best.max(cosine(&q, &runtime.vector(&text)?));
    }
    Ok(best)
}

/// Abstain when no results, or when any enabled signal is below its threshold, or when a large share
/// of the question's terms was never captured while the best chunk is also dissimilar (a paraphrase
/// has unseen words but a similar chunk; a question about something absent has neither). A threshold
/// of 0 disables that signal, so the default (all 0) never abstains on weak results.
pub fn decide(r: &Retrieval, params: &Params) -> bool {
    r.hits.is_empty()
        || r.score_norm < params.abstain_score
        || r.support < params.abstain_support
        || r.dense_sim < params.abstain_dense
        || r.chunk_sim < params.abstain_chunk
        || r.ident < params.abstain_ident
        || (r.time.is_some() && r.support < params.abstain_time_support)
        || (params.abstain_unseen > 0.0 && r.unseen >= params.abstain_unseen && r.chunk_sim < params.abstain_unseen_sim)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terms_drop_generic_words_and_keep_numbers() {
        assert_eq!(support_terms("what is the total on invoice 4472"), vec!["4472", "invoice", "total"]);
        assert_eq!(support_terms("what did the gym email say"), Vec::<String>::new(), "email names the source kind");
        assert!(support_terms("what did I read last week").is_empty());
    }

    #[test]
    fn identifiers_must_appear_in_the_evidence() {
        assert_eq!(identifiers("what is the total on invoice 4472"), vec!["4472"]);
        assert_eq!(identifiers("booking reference QK7M2P and error CART-204"), vec!["qk7m2p", "cart-204"]);
        assert!(identifiers("what did I do on 2026-10-01 or in 2026").is_empty());
        assert!(identifiers("10 ml and 9 g").is_empty(), "short numbers are not identifiers");
    }

    #[test]
    fn coverage_uses_a_prefix_match() {
        let terms = support_terms("how long are the invoices overdue");
        assert_eq!(coverage(&terms, "Invoice 4471 is overdue by 12 days."), 1.0);
        assert_eq!(coverage(&support_terms("invoice 4472"), "Invoice 4471 is overdue"), 0.5);
        assert_eq!(coverage(&[], "anything"), 1.0);
    }

    #[test]
    fn score_is_normalised_by_the_best_possible() {
        let p = Params::default();
        assert!((score_norm(2.0 / 60.0, &p) - 1.0).abs() < 1e-9);
        let dense = Params { mode: Mode::DenseOnly, ..Params::default() };
        assert!((score_norm(1.0 / 60.0, &dense) - 1.0).abs() < 1e-9);
    }

    #[test]
    fn decide_combines_the_enabled_signals() {
        let blank = || Retrieval {
            score_norm: 1.0, support: 1.0, dense_sim: 0.5, chunk_sim: 0.5, chunk_support: 1.0, unseen: 0.0, ident: 1.0,
            abstained: false, app_fallback: false, filter: vec![], time: None, ranked: vec![], collapsed: 1,
            observation_dropped: 0, hits: vec![],
        };
        let off = Params { abstain_unseen: 0.0, abstain_ident: 0.0, abstain_time_support: 0.0, ..Params::default() };
        let mut r = blank();
        assert!(decide(&r, &off), "no hits always abstains");
        r.hits.push(Hit { source: Source { id: 1, app_id: "a".into(), title: "t".into(), url: None, domain: None, source_type: "app".into(), body: "b".into(), first_seen_ms: 0, last_seen_ms: 0, sightings: 1, limitations: "[]".into(), cleaner_quality: "main_content".into(), hit_text: None, score: 0.0 }, best_chunk_id: None, chunks: vec![], versions: vec![] });
        assert!(!decide(&r, &off));
        let p = Params { abstain_ident: 1.0, ..off.clone() };
        r.ident = 0.5;
        assert!(decide(&r, &p), "a named identifier missing from the evidence");
        r.ident = 1.0;
        let p = Params { abstain_unseen: 0.33, abstain_unseen_sim: 0.23, ..off.clone() };
        r.unseen = 0.5; r.chunk_sim = 0.4;
        assert!(!decide(&r, &p), "unseen terms with a similar chunk is a paraphrase");
        r.chunk_sim = 0.1;
        assert!(decide(&r, &p));
        let p = Params { abstain_time_support: 0.25, ..off };
        r.unseen = 0.0; r.chunk_sim = 0.5; r.support = 0.0;
        assert!(!decide(&r, &p), "no date window, no time rule");
        r.time = Some((0, 1));
        assert!(decide(&r, &p));
    }

    #[test]
    fn cosine_is_scale_free() {
        assert!((cosine(&[1.0, 0.0], &[2.0, 0.0]) - 1.0).abs() < 1e-9);
        assert!(cosine(&[1.0, 0.0], &[0.0, 3.0]).abs() < 1e-9);
        assert_eq!(cosine(&[0.0, 0.0], &[1.0, 1.0]), 0.0);
    }
}
