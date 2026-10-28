//! Explicit personal facts in the shared workspace database; never inferred from capture.
use crate::{workspace::WorkspaceStore, MemoryError};
use rusqlite::{params, TransactionBehavior};
use serde_json::{json, Value};
fn bad(s: &'static str) -> MemoryError {
    MemoryError::InvalidRequest(s)
}
fn field(v: &Value, key: &str, max: usize) -> Result<String, MemoryError> {
    let s = v[key]
        .as_str()
        .ok_or_else(|| bad("required fact field missing"))?
        .trim();
    if s.is_empty() || s.len() > max {
        return Err(bad("fact field empty or too long"));
    }
    Ok(s.to_owned())
}
fn canonical(s: &str) -> String {
    s.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}
impl WorkspaceStore {
    pub fn fact_request(&self, op: &str, input: &Value, now: i64) -> Result<Value, MemoryError> {
        let mut db = self.0.lock().map_err(|_| MemoryError::LockPoisoned)?;
        // Serialize cross-process read/modify/write, as well as writers in this process.
        let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let mut stmt =
            tx.prepare("SELECT body FROM workspace_records WHERE kind='personal_fact'")?;
        let all = stmt
            .query_map([], |r| r.get::<_, String>(0))?
            .map(|r| serde_json::from_str::<Value>(&r?).map_err(|_| bad("invalid stored fact")))
            .collect::<Result<Vec<_>, MemoryError>>()?;
        drop(stmt);
        let result = match op {
            "facts" | "recall_facts" => {
                let query = input["query"].as_str().unwrap_or("");
                if query.len() > 500 {
                    return Err(bad("query too long"));
                }
                let terms: Vec<_> = query
                    .split(|c: char| !c.is_alphanumeric())
                    .map(canonical)
                    .filter(|s| {
                        !s.is_empty()
                            && ![
                                "what", "is", "the", "that", "remember", "number", "a", "of", "s",
                            ]
                            .contains(&s.as_str())
                    })
                    .collect();
                let mut ranked: Vec<_> = all
                    .into_iter()
                    .filter_map(|fact| {
                        let hay = canonical(&format!(
                            "{} {} {}",
                            fact["subject"].as_str().unwrap_or(""),
                            fact["attribute"].as_str().unwrap_or(""),
                            fact["value"].as_str().unwrap_or("")
                        ));
                        let score = terms.iter().filter(|t| hay.contains(t.as_str())).count();
                        (query.trim().is_empty() || score > 0).then_some((score, fact))
                    })
                    .collect();
                ranked.sort_by(|a, b| {
                    b.0.cmp(&a.0)
                        .then_with(|| b.1["updated_ms"].as_i64().cmp(&a.1["updated_ms"].as_i64()))
                        .then_with(|| a.1["id"].as_str().cmp(&b.1["id"].as_str()))
                });
                let offset = input["offset"].as_u64().unwrap_or(0).min(100_000) as usize;
                let limit = input["limit"].as_u64().unwrap_or(50).clamp(1, 100) as usize;
                let total = ranked.len();
                let mut items = Vec::new();
                let mut bytes = 0;
                for (_, fact) in ranked.into_iter().skip(offset).take(limit) {
                    bytes += fact.to_string().len();
                    if bytes > 160_000 && !items.is_empty() {
                        break;
                    }
                    items.push(fact);
                }
                json!({"items":items,"total":total,"next_offset":if offset+items.len()<total {Some(offset+items.len())}else{None},"kind":"personal_fact"})
            }
            "remember_fact" | "update_fact" => {
                let subject = field(input, "subject", 300)?;
                let attribute = field(input, "attribute", 300)?;
                let value = field(input, "value", 8000)?;
                let source = field(input, "source", 2000)?;
                let channel = field(input, "channel", 30)?;
                if !["desktop", "mcp", "chat", "import"].contains(&channel.as_str()) {
                    return Err(bad("invalid fact channel"));
                }
                let key = json!([canonical(&subject), canonical(&attribute)]).to_string();
                let old = if op == "update_fact" {
                    let id = field(input, "fact_id", 100)?;
                    let old = all
                        .iter()
                        .find(|v| v["id"] == id)
                        .ok_or_else(|| bad("fact not found"))?;
                    if input["expected_revision"].as_i64() != old["revision"].as_i64() {
                        return Err(bad(
                            "revision conflict: recall latest fact before correcting",
                        ));
                    }
                    Some(old)
                } else {
                    None
                };
                let duplicate = all
                    .iter()
                    .find(|v| v["key"] == key && old.is_none_or(|o| o["id"] != v["id"]));
                if let Some(existing) = duplicate {
                    if op == "remember_fact" && existing["value"].as_str() == Some(value.as_str()) {
                        return Ok(existing.clone());
                    }
                    return Err(bad("fact conflict: recall existing subject/attribute and explicitly update with its id and revision"));
                }
                let id = match old {
                    Some(v) => v["id"].as_str().unwrap().to_owned(),
                    None => tx.query_row("SELECT lower(hex(randomblob(16)))", [], |r| {
                        r.get::<_, String>(0)
                    })?,
                };
                let fact = json!({"id":id,"kind":"personal_fact","key":key,"subject":subject,"attribute":attribute,"value":value,"source":source,"channel":channel,"revision":old.and_then(|v|v["revision"].as_i64()).unwrap_or(0)+1,"created_ms":old.map(|v|v["created_ms"].clone()).unwrap_or(json!(now)),"updated_ms":now});
                tx.execute("INSERT INTO workspace_records(kind,id,body) VALUES('personal_fact',?1,?2) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body",params![id,fact.to_string()])?;
                fact
            }
            "delete_fact" => {
                let id = field(input, "fact_id", 100)?;
                let old = all
                    .iter()
                    .find(|v| v["id"] == id)
                    .ok_or_else(|| bad("fact not found"))?;
                if input["expected_revision"].as_i64() != old["revision"].as_i64() {
                    return Err(bad("revision conflict: recall latest fact before deleting"));
                }
                tx.execute(
                    "DELETE FROM workspace_records WHERE kind='personal_fact' AND id=?1",
                    [&id],
                )?;
                json!({"id":id,"deleted":true,"deleted_ms":now})
            }
            _ => return Err(bad("unknown fact operation")),
        };
        tx.commit()?;
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn concurrent_conflicting_saves_cannot_create_two_answers() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("workspace.sqlite3");
        let first = WorkspaceStore::open(&path).unwrap();
        let second = WorkspaceStore::open(&path).unwrap();
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let handles: Vec<_> = [first, second].into_iter().enumerate().map(|(i, store)| {
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                store.request("remember_fact", &json!({"subject":"Invented Mira", "attribute":"phone", "value":format!("000{i}"), "source":"invented race", "channel":"mcp"}), 1)
            })
        }).collect();
        let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
        assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
        assert_eq!(
            WorkspaceStore::open(&path)
                .unwrap()
                .request("facts", &json!({}), 2)
                .unwrap()["total"],
            1
        );
    }
    #[test]
    fn durable_shared_facts_correct_conflicts_and_delete() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("workspace.sqlite3");
        let a = WorkspaceStore::open(&path).unwrap();
        let input = json!({"subject":"Invented Mira","attribute":"phone","value":"000111","source":"invented test request","channel":"mcp"});
        let fact = a.request("remember_fact", &input, 10).unwrap();
        assert_eq!(a.request("remember_fact", &input, 20).unwrap(), fact);
        let b = WorkspaceStore::open(&path).unwrap();
        assert_eq!(
            b.request(
                "recall_facts",
                &json!({"query":"What is Mira's phone number?"}),
                21
            )
            .unwrap()["items"][0],
            fact
        );
        let mut corrected = input.clone();
        corrected["value"] = json!("000222");
        assert!(b.request("remember_fact", &corrected, 22).is_err());
        corrected["fact_id"] = fact["id"].clone();
        corrected["expected_revision"] = json!(1);
        let next = b.request("update_fact", &corrected, 30).unwrap();
        assert_eq!(next["created_ms"], 10);
        assert_eq!(next["updated_ms"], 30);
        assert_eq!(next["revision"], 2);
        assert!(a.request("update_fact", &corrected, 31).is_err());
        let other = a.request("remember_fact", &json!({"subject":"self","attribute":"email","value":"invented@example.invalid","source":"test","channel":"desktop"}),32).unwrap();
        let mut collision = corrected.clone();
        collision["subject"] = json!("SELF");
        collision["attribute"] = json!(" email ");
        collision["expected_revision"] = json!(2);
        assert!(a.request("update_fact", &collision, 33).is_err());
        a.request("remember", &json!({"content":"Mira handoff note"}), 34)
            .unwrap();
        assert_eq!(a.request("facts", &json!({}), 35).unwrap()["total"], 2);
        drop(a);
        drop(b);
        let c = WorkspaceStore::open(&path).unwrap();
        let recalled = c
            .request("recall_facts", &json!({"query":"Mira"}), 40)
            .unwrap();
        assert_eq!(recalled["items"].as_array().unwrap().len(), 1);
        assert_eq!(recalled["items"][0]["value"], "000222");
        assert!(c
            .request(
                "delete_fact",
                &json!({"fact_id":fact["id"],"expected_revision":1}),
                41
            )
            .is_err());
        c.request(
            "delete_fact",
            &json!({"fact_id":fact["id"],"expected_revision":2}),
            42,
        )
        .unwrap();
        drop(c);
        let d = WorkspaceStore::open(&path).unwrap();
        assert_eq!(
            d.request("recall_facts", &json!({"query":"Mira"}), 43)
                .unwrap()["total"],
            0
        );
        assert_eq!(
            d.request("facts", &json!({}), 44).unwrap()["items"][0],
            other
        );
    }
}
