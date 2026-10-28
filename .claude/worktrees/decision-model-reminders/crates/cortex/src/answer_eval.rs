//! Isolated answer pipeline evaluation. Live mode is deliberately limited to frozen invented inputs.
use super::*;
use crate::{answer_checks as checks, answer_pipeline as pipeline, fixtures};
use std::collections::{BTreeMap, BTreeSet};
use std::time::Instant;

#[derive(Deserialize)]
struct Rel {
    fixture: String,
    answer_text: String,
}
#[derive(Deserialize)]
struct Gold {
    id: String,
    #[serde(rename = "type")]
    qtype: String,
    query: String,
    #[serde(default)]
    split: String,
    #[serde(default)]
    relevant: Vec<Rel>,
    #[serde(default)]
    expect_abstain: bool,
    #[serde(default)]
    wrong_text: Vec<String>,
    #[serde(default)]
    time_right: Vec<String>,
    #[serde(default)]
    time_wrong: Vec<String>,
}
fn exact(text: &str, fact: &str) -> bool {
    !fact.trim().is_empty()
        && norm_space(&text.to_lowercase()).contains(&norm_space(&fact.to_lowercase()))
}
fn millis(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1000.0
}
struct Temp(PathBuf);
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

pub fn run(args: &[String]) -> Result<()> {
    let mut corpus = PathBuf::from("evals/corpus");
    let mut gold = PathBuf::from("evals/gold/gold.jsonl");
    let mut out = None;
    let mut live = false;
    let mut split = "all".to_owned();
    let mut it = args.iter();
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--corpus" => corpus = PathBuf::from(it.next().context("--corpus needs a path")?),
            "--gold" => gold = PathBuf::from(it.next().context("--gold needs a path")?),
            "--out" => out = Some(PathBuf::from(it.next().context("--out needs a path")?)),
            "--split" => split = it.next().context("--split needs a value")?.clone(),
            "--live" => live = true,
            "--mock" => {}
            _ => bail!("unknown eval-answers option {arg}"),
        }
    }
    if !["all", "dev", "test"].contains(&split.as_str()) {
        bail!("--split must be all, dev or test");
    }
    let out = out.context("--out is required")?;
    if live {
        // Verify both path and frozen content, so a private or modified fixture cannot be sent accidentally.
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        if fs::canonicalize(&corpus)? != fs::canonicalize(root.join("evals/corpus"))?
            || fs::canonicalize(&gold)? != fs::canonicalize(root.join("evals/gold/gold.jsonl"))?
        {
            bail!("live evaluation accepts only the frozen invented corpus and gold");
        }
        let status = Command::new("python3")
            .arg(root.join("evals/freeze.py"))
            .arg("verify")
            .arg("invented")
            .current_dir(&root)
            .status()
            .context("cannot verify frozen fixtures")?;
        if !status.success() {
            bail!("frozen fixture verification failed");
        }
        env::var("CORTEX_LLM_URL").context("CORTEX_LLM_URL is required for --live")?;
        env::var("CORTEX_LLM_MODEL")
            .context("CORTEX_LLM_MODEL is required for --live")?;
    }
    env::set_var("TZ", "UTC");
    let now = Utc
        .with_ymd_and_hms(2026, 10, 17, 12, 0, 0)
        .single()
        .context("clock")?
        .timestamp_millis();
    let loaded = fixtures::load_corpus(&corpus)?;
    if loaded.is_empty() {
        bail!("empty corpus");
    }
    let mut golds = Vec::new();
    let mut seen = BTreeSet::new();
    for (i, line) in fs::read_to_string(&gold)?.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        let g: Gold = serde_json::from_str(line).with_context(|| format!("gold line {}", i + 1))?;
        if !seen.insert(g.id.clone()) || g.expect_abstain != g.relevant.is_empty() {
            bail!("invalid or duplicate gold {}", g.id);
        }
        golds.push(g);
    }
    if env::var_os("CORTEX_MODEL_DIR").is_none() {
        env::set_var("CORTEX_MODEL_DIR", eval::resolve_model_dir()?);
    }
    let tmp = Temp(env::temp_dir().join(format!(
        "cortex-answer-eval-{}-{}",
        std::process::id(),
        SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos()
    )));
    fs::create_dir(&tmp.0)?;
    fs::set_permissions(&tmp.0, fs::Permissions::from_mode(0o700))?;
    let mut runtime = open_runtime(&tmp.0, false)?;
    let ingested = fixtures::ingest(&mut runtime, &tmp.0, &loaded, &cleaner::DEFAULT_CFG)?;
    for g in &golds {
        for rel in &g.relevant {
            if !ingested
                .iter()
                .any(|i| i.fixture == rel.fixture && exact(&i.body, &rel.answer_text))
            {
                bail!("gold {} has missing fixture or fact", g.id);
            }
        }
    }
    let params = Params {
        now_ms: Some(now),
        ..Params::default()
    };
    let mut records = Vec::new();
    for g in golds.iter().filter(|g| split == "all" || g.split == split) {
        let total = Instant::now();
        let t = Instant::now();
        let retrieval = retrieve(&mut runtime, &g.query, &params)?;
        let retrieval_ms = millis(t);
        let ids: Vec<i64> = retrieval.hits.iter().map(|h| h.source.id).collect();
        let t = Instant::now();
        // Production always asks the model; weak or empty retrieval is flagged in the request.
        let clock = DateTime::<Utc>::from_timestamp_millis(now)
            .context("invalid eval clock")?
            .with_timezone(&Local)
            .fixed_offset();
        let prepared = Some(pipeline::prepare(&pipeline::Request {
            now: clock,
            timezone: "eval",
            ..pipeline::Request::new(&g.query, &retrieval.hits, params.chunks_per_result, retrieval.abstained)
        })?);
        let prep_ms = millis(t);
        let groups: Vec<checks::FactGroup> = g
            .relevant
            .iter()
            .map(|r| vec![r.answer_text.clone()])
            .collect();
        let fact_state: Vec<Value> = g.relevant.iter().map(|r| {
            let fixture_ids: Vec<i64> = ingested.iter().filter(|i| i.fixture == r.fixture).map(|i| i.snapshot_id).collect();
            let retrieved = retrieval.hits.iter().any(|h| fixture_ids.contains(&h.source.id) && exact(&format!("{}\n{}", evidence_snippet(h, &g.query, params.chunks_per_result), evidence_text(h)), &r.answer_text));
            let selected = prepared.as_ref().map_or(false, |_| retrieval.hits.iter().take(pipeline::SOURCE_LIMIT).any(|h| fixture_ids.contains(&h.source.id) && exact(&format!("{}\n{}", evidence_snippet(h, &g.query, params.chunks_per_result), evidence_text(h)), &r.answer_text)));
            let sent = prepared.as_ref().map_or(false, |p| p.sources.iter().any(|s| fixture_ids.contains(&s.id) && exact(&s.text, &r.answer_text)));
            json!({"fixture":r.fixture,"fact":r.answer_text,"retrieved":retrieved,"selected_before_redaction":selected,"sent_after_redaction":sent,"lost_to_redaction":selected && !sent})
        }).collect();
        let sufficient =
            !g.relevant.is_empty() && fact_state.iter().all(|f| f["sent_after_redaction"] == true);
        let t = Instant::now();
        let response = match &prepared {
            None => unreachable!("answers are always prepared"),
            Some(p) if live => pipeline::call_provider(&p.messages),
            Some(p) => {
                // A gold-aware scripted provider verifies plumbing; never a model quality measurement.
                if sufficient {
                    let parts: Vec<String> = g
                        .relevant
                        .iter()
                        .filter_map(|r| {
                            let fixture_ids: Vec<i64> = ingested
                                .iter()
                                .filter(|i| i.fixture == r.fixture)
                                .map(|i| i.snapshot_id)
                                .collect();
                            p.sources
                                .iter()
                                .find(|s| {
                                    fixture_ids.contains(&s.id) && exact(&s.text, &r.answer_text)
                                })
                                .map(|s| format!("{} [{}]", r.answer_text, s.id))
                        })
                        .collect();
                    Ok(pipeline::ModelResponse {
                        content: format!("SOURCE: memory\n{}", parts.join(" ")),
                        usage: None,
                    })
                } else {
                    Ok(pipeline::ModelResponse {
                        content: "SOURCE: none\nThe evidence is insufficient to answer.".into(),
                        usage: None,
                    })
                }
            }
        };
        let model_ms = if prepared.is_some() { millis(t) } else { 0.0 };
        let (answer, usage, error) = match response {
            Ok(r) => (Some(r.content), r.usage, None),
            Err(e) => (None, None, Some(format!("{e:#}"))),
        };
        let validation = answer.as_ref().and_then(|a| {
            prepared
                .as_ref()
                .and_then(|p| pipeline::validate(a, p).err().map(|e| e.to_string()))
        });
        // Scoring looks at the answer text; the `SOURCE:` line is recorded separately.
        let raw_answer = answer;
        let answer = raw_answer.as_deref().map(|a| pipeline::parse_source(a).1.to_owned());
        let source = raw_answer.as_deref().and_then(|a| pipeline::parse_source(a).0);
        let citations = answer.as_ref().map(|a| {
            checks::extract_citations(
                a,
                &prepared
                    .as_ref()
                    .map_or_else(Vec::new, |p| p.sources.iter().map(|s| s.id).collect()),
            )
        });
        let abstained = answer
            .as_ref()
            .map_or(false, |a| !checks::abstention_phrases(a).is_empty());
        let scores = answer.as_ref().map(|a| {
            let coverage = checks::contains_answer(a, &groups);
            let without_citations = Regex::new(r"\[[^\[\]\n]{1,80}\]").unwrap().replace_all(a, " ");
            let gold_texts: Vec<&str> = g.relevant.iter().map(|r| r.answer_text.as_str()).collect();
            let cited = citations.as_ref().unwrap();
            let cited_facts: Vec<bool> = g.relevant.iter().map(|r| {
                let fixture_ids: Vec<i64> = ingested.iter().filter(|i| i.fixture == r.fixture).map(|i| i.snapshot_id).collect();
                prepared.as_ref().map_or(false, |p| p.sources.iter().any(|s| cited.distinct.contains(&s.id) && fixture_ids.contains(&s.id) && exact(&s.text, &r.answer_text)))
            }).collect();
            let supporting = prepared.as_ref().map(|p| checks::citation_support(&cited.distinct, &groups, a, |id| p.sources.iter().find(|s| s.id == id).map(|s| s.text.clone())));
            json!({"coverage":coverage,"correct_abstention":g.expect_abstain && pipeline::is_pure_abstention(a).unwrap_or(false) && validation.is_none(),
                "wrong_abstention":sufficient && abstained, "numeric":checks::numeric_check(&without_citations, &gold_texts),
                "version":if g.wrong_text.is_empty(){None}else{Some(checks::version_check(&without_citations,&gold_texts,&groups,&g.wrong_text))},
                "time":if g.time_right.is_empty() || g.time_wrong.is_empty(){None}else{Some(checks::time_check(&without_citations,&g.time_right,&g.time_wrong))},
                "citation_lexical_support":supporting,"each_gold_fact_in_its_cited_source":cited_facts})
        });
        records.push(json!({"id":g.id,"type":g.qtype,"split":g.split,"retrieved_ids":ids,"retrieval_abstained":retrieval.abstained,
            "fact_state":fact_state,"sufficient_evidence":sufficient,"sensitive_placeholders":prepared.as_ref().map_or(0, |p| p.messages.iter().map(|m| { let text = m["content"].as_str().unwrap_or(""); ["[SECRET]", "[FINANCIAL_ID]", "[FINANCIAL_AMOUNT]", "[PAYMENT_CARD]"].iter().map(|label| text.matches(label).count()).sum::<usize>() }).sum::<usize>()),"prepared":prepared,"prompt_version":pipeline::PROMPT_VERSION,
            "model":if live {env::var("CORTEX_LLM_MODEL").unwrap_or_default()} else {"gold-aware-scripted-mock".into()},
            "raw_answer":raw_answer,"source":source,"citations":citations,"validation_error":validation,"provider_error":error,"usage":usage,"scores":scores,
            "latency_ms":{"retrieval":retrieval_ms,"preparation":prep_ms,"model":model_ms,"total":millis(total)}}));
    }
    let mut by_type: BTreeMap<String, usize> = BTreeMap::new();
    for r in &records {
        *by_type
            .entry(r["type"].as_str().unwrap_or("").into())
            .or_default() += 1;
    }
    let answerable: Vec<&Value> = records
        .iter()
        .filter(|r| !r["fact_state"].as_array().unwrap().is_empty())
        .collect();
    let summary = json!({"questions":records.len(), "answerable":answerable.len(),
        "all_facts_retrieved":answerable.iter().filter(|r| r["fact_state"].as_array().unwrap().iter().all(|f| f["retrieved"] == true)).count(),
        "all_facts_sent":answerable.iter().filter(|r| r["sufficient_evidence"] == true).count(),
        "any_fact_lost_to_redaction":answerable.iter().filter(|r| r["fact_state"].as_array().unwrap().iter().any(|f| f["lost_to_redaction"] == true)).count(),
        "retrieval_abstentions":records.iter().filter(|r| r["retrieval_abstained"] == true).count(),
        "provider_errors":records.iter().filter(|r| !r["provider_error"].is_null()).count(),
        "invalid_answers":records.iter().filter(|r| !r["validation_error"].is_null()).count()});
    if let Some(parent) = out.parent().filter(|p| !p.as_os_str().is_empty()) {
        fs::create_dir_all(parent)?;
    }
    let report = json!({"mode":if live {"live"} else {"mock_pipeline_verification_not_model_quality"},"source_limit":pipeline::SOURCE_LIMIT,"summary":summary,"records":records,"by_type":by_type});
    fs::write(&out, serde_json::to_vec_pretty(&report)?)?;
    println!(
        "Wrote {} questions to {} ({})",
        report["records"].as_array().unwrap().len(),
        out.display(),
        report["mode"].as_str().unwrap()
    );
    Ok(())
}
