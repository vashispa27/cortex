//! Persistent scheduling shared by the daemon and desktop engine.
use crate::{workspace::WorkspaceStore, MemoryError};
use chrono::{DateTime, Datelike, Days, LocalResult, NaiveDate, NaiveDateTime, NaiveTime, TimeZone};
use chrono_tz::Tz;
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const MIN_INTERVAL_MINUTES: u32 = 15;
const MAX_INTERVAL_MINUTES: u32 = 525_600;
fn last_day_of_month(year: i32, month: u32) -> u32 {
    let (y, m) = if month == 12 { (year + 1, 1) } else { (year, month + 1) };
    NaiveDate::from_ymd_opt(y, m, 1)
        .and_then(|d| d.pred_opt())
        .map_or(28, |d| d.day())
}
fn invalid(s: &'static str) -> MemoryError {
    MemoryError::InvalidRequest(s)
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum Timing {
    Once {
        local_at: String,
    },
    Daily {
        time: String,
        #[serde(default)]
        weekdays: Vec<u32>,
    },
    AfterWake {
        time: String,
        window_end: String,
        #[serde(default)]
        weekdays: Vec<u32>,
    },
    /// `day` is 1..=31, or -1 for the last day. Days a short month lacks clamp to its last day.
    Monthly {
        day: i32,
        time: String,
    },
    /// Fires every `every_minutes` (>= 15) counted from `start_local`. Optional daily
    /// `[window_start, window_end]` and weekday filters; a window may not cross midnight.
    Interval {
        every_minutes: u32,
        start_local: String,
        #[serde(default)]
        window_start: Option<String>,
        #[serde(default)]
        window_end: Option<String>,
        #[serde(default)]
        weekdays: Vec<u32>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum Action {
    Reminder {
        message: String,
    },
    Task {
        prompt: String,
        #[serde(default)]
        requires_live_sources: bool,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ScheduleInput {
    pub title: String,
    pub timezone: String,
    pub timing: Timing,
    pub action: Action,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Schedule {
    pub id: String,
    pub revision: i64,
    pub status: String,
    #[serde(flatten)]
    pub spec: ScheduleInput,
    pub next_due_ms: Option<i64>,
    pub created_ms: i64,
    pub updated_ms: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Run {
    pub id: String,
    pub schedule_id: String,
    pub due_ms: i64,
    pub started_ms: i64,
    pub finished_ms: Option<i64>,
    pub status: String,
    pub output: String,
    pub delivery_status: String,
    pub error: Option<String>,
    pub schedule: Schedule,
}
fn parse_time(s: &str) -> Result<NaiveTime, MemoryError> {
    if s.len() != 5 {
        return Err(invalid("time must be HH:MM"));
    }
    NaiveTime::parse_from_str(s, "%H:%M").map_err(|_| invalid("time must be HH:MM"))
}
fn zone(spec: &ScheduleInput) -> Result<Tz, MemoryError> {
    spec.timezone
        .parse()
        .map_err(|_| invalid("timezone must be an IANA name"))
}
// Fold: first occurrence. Gap: skip that day. A one-time ambiguous/gap input is rejected.
fn local_ms(tz: Tz, dt: NaiveDateTime) -> Option<i64> {
    tz.from_local_datetime(&dt)
        .earliest()
        .map(|d| d.timestamp_millis())
}
impl ScheduleInput {
    fn validate(&self) -> Result<(), MemoryError> {
        if self.title.trim().is_empty() || self.title.len() > 300 {
            return Err(invalid("title must contain 1..300 bytes"));
        }
        let tz = zone(self)?;
        let content = match &self.action {
            Action::Reminder { message } => message,
            Action::Task { prompt, .. } => prompt,
        };
        if content.trim().is_empty() || content.len() > 12000 {
            return Err(invalid("action text must contain 1..12000 bytes"));
        }
        match &self.timing {
            Timing::Once { local_at } => {
                let dt = NaiveDateTime::parse_from_str(local_at, "%Y-%m-%dT%H:%M")
                    .map_err(|_| invalid("local_at must be YYYY-MM-DDTHH:MM"))?;
                if local_at.len() != 16
                    || !matches!(tz.from_local_datetime(&dt), LocalResult::Single(_))
                {
                    return Err(invalid("one-time local time is ambiguous or nonexistent; choose an unambiguous minute"));
                }
            }
            Timing::Daily { time, weekdays } | Timing::AfterWake { time, weekdays, .. } => {
                parse_time(time)?;
                if weekdays.len() > 7 || weekdays.iter().any(|d| !(1..=7).contains(d)) {
                    return Err(invalid(
                        "weekdays must be ISO Monday=1..Sunday=7, at most seven entries",
                    ));
                }
                if let Timing::AfterWake { window_end, .. } = &self.timing {
                    if parse_time(window_end)? <= parse_time(time)? {
                        return Err(invalid(
                            "wake window_end must be later than time on the same day",
                        ));
                    }
                }
            }
            Timing::Monthly { day, time } => {
                parse_time(time)?;
                if *day != -1 && !(1..=31).contains(day) {
                    return Err(invalid("monthly day must be 1..31, or -1 for the last day"));
                }
            }
            Timing::Interval {
                every_minutes,
                start_local,
                window_start,
                window_end,
                weekdays,
            } => {
                if !(MIN_INTERVAL_MINUTES..=MAX_INTERVAL_MINUTES).contains(every_minutes) {
                    return Err(invalid("interval every_minutes must be 15..525600"));
                }
                if start_local.len() != 16
                    || NaiveDateTime::parse_from_str(start_local, "%Y-%m-%dT%H:%M").is_err()
                {
                    return Err(invalid("start_local must be YYYY-MM-DDTHH:MM"));
                }
                match (window_start, window_end) {
                    (None, None) => {}
                    (Some(a), Some(b)) => {
                        if parse_time(b)? <= parse_time(a)? {
                            return Err(invalid(
                                "interval window_end must be later than window_start; windows cannot cross midnight",
                            ));
                        }
                    }
                    _ => {
                        return Err(invalid(
                            "interval window_start and window_end must be given together",
                        ))
                    }
                }
                if weekdays.len() > 7 || weekdays.iter().any(|d| !(1..=7).contains(d)) {
                    return Err(invalid(
                        "weekdays must be ISO Monday=1..Sunday=7, at most seven entries",
                    ));
                }
            }
        }
        Ok(())
    }
    pub fn next_after(&self, after: i64) -> Result<Option<i64>, MemoryError> {
        self.validate()?;
        let tz = zone(self)?;
        if let Timing::Once { local_at } = &self.timing {
            let dt = NaiveDateTime::parse_from_str(local_at, "%Y-%m-%dT%H:%M").unwrap();
            return Ok(local_ms(tz, dt).filter(|ms| *ms > after));
        }
        match &self.timing {
            Timing::Monthly { day, time } => return self.next_monthly(tz, *day, time, after),
            Timing::Interval { .. } => return self.next_interval(tz, after),
            _ => {}
        }
        let (time, weekdays) = match &self.timing {
            Timing::Daily { time, weekdays } | Timing::AfterWake { time, weekdays, .. } => {
                (time, weekdays)
            }
            _ => unreachable!(),
        };
        let date = DateTime::from_timestamp_millis(after)
            .ok_or_else(|| invalid("timestamp out of range"))?
            .with_timezone(&tz)
            .date_naive();
        for days in 0..370 {
            let date = date
                .checked_add_days(Days::new(days))
                .ok_or_else(|| invalid("date out of range"))?;
            if !weekdays.is_empty() && !weekdays.contains(&date.weekday().number_from_monday()) {
                continue;
            }
            if let Some(ms) = local_ms(tz, date.and_time(parse_time(time)?)) {
                if ms > after {
                    return Ok(Some(ms));
                }
            }
        }
        Err(invalid("no next occurrence in supported date range"))
    }
    /// Clamp to the month's last day; a month whose local time falls in a DST gap is skipped.
    fn next_monthly(
        &self,
        tz: Tz,
        day: i32,
        time: &str,
        after: i64,
    ) -> Result<Option<i64>, MemoryError> {
        let time = parse_time(time)?;
        let start = DateTime::from_timestamp_millis(after)
            .ok_or_else(|| invalid("timestamp out of range"))?
            .with_timezone(&tz)
            .date_naive();
        let (mut year, mut month) = (start.year(), start.month());
        for _ in 0..30 {
            let last = last_day_of_month(year, month);
            let wanted = if day == -1 { last } else { (day as u32).min(last) };
            if let Some(date) = NaiveDate::from_ymd_opt(year, month, wanted) {
                if let Some(ms) = local_ms(tz, date.and_time(time)) {
                    if ms > after {
                        return Ok(Some(ms));
                    }
                }
            }
            if month == 12 {
                year += 1;
                month = 1;
            } else {
                month += 1;
            }
        }
        Err(invalid("no next occurrence in supported date range"))
    }
    /// Occurrences are `start_local + k * every_minutes` in absolute time, filtered by local
    /// weekday and window. Filtered-out slots are skipped, never queued up.
    fn next_interval(&self, tz: Tz, after: i64) -> Result<Option<i64>, MemoryError> {
        let Timing::Interval {
            every_minutes,
            start_local,
            window_start,
            window_end,
            weekdays,
        } = &self.timing
        else {
            return Ok(None);
        };
        let anchor = local_ms(
            tz,
            NaiveDateTime::parse_from_str(start_local, "%Y-%m-%dT%H:%M")
                .map_err(|_| invalid("start_local must be YYYY-MM-DDTHH:MM"))?,
        )
        .ok_or_else(|| invalid("interval start_local falls in a nonexistent local time"))?;
        let window = match (window_start, window_end) {
            (Some(a), Some(b)) => Some((parse_time(a)?, parse_time(b)?)),
            _ => None,
        };
        let step = *every_minutes as i64 * 60_000;
        let mut candidate = if after < anchor {
            anchor
        } else {
            anchor + ((after - anchor) / step + 1) * step
        };
        for _ in 0..200_000 {
            let local = DateTime::from_timestamp_millis(candidate)
                .ok_or_else(|| invalid("timestamp out of range"))?
                .with_timezone(&tz);
            let day_ok = weekdays.is_empty()
                || weekdays.contains(&local.weekday().number_from_monday());
            let time_ok = window.is_none_or(|(a, b)| local.time() >= a && local.time() <= b);
            if day_ok && time_ok {
                return Ok(Some(candidate));
            }
            candidate += step;
        }
        Err(invalid("no next occurrence in supported date range"))
    }
    fn wake_due(&self, now: i64) -> Result<Option<i64>, MemoryError> {
        let Timing::AfterWake {
            time,
            window_end,
            weekdays,
        } = &self.timing
        else {
            return Ok(None);
        };
        let tz = zone(self)?;
        let dt = DateTime::from_timestamp_millis(now)
            .ok_or_else(|| invalid("timestamp out of range"))?
            .with_timezone(&tz);
        if !weekdays.is_empty() && !weekdays.contains(&dt.weekday().number_from_monday()) {
            return Ok(None);
        }
        let start = local_ms(tz, dt.date_naive().and_time(parse_time(time)?));
        let end = local_ms(tz, dt.date_naive().and_time(parse_time(window_end)?));
        Ok(start.filter(|s| *s <= now && end.is_some_and(|e| now < e)))
    }
}
/// API view of a schedule: the stored fields plus `next_due_local` (YYYY-MM-DDTHH:MM in the
/// schedule's own timezone), so a caller can confirm the time back to the user without zone math.
/// Computed on the way out; never stored.
fn present(s: &Schedule) -> Value {
    let mut value = json!(s);
    let local = s.next_due_ms.and_then(|ms| {
        let tz: Tz = s.spec.timezone.parse().ok()?;
        Some(
            DateTime::from_timestamp_millis(ms)?
                .with_timezone(&tz)
                .format("%Y-%m-%dT%H:%M")
                .to_string(),
        )
    });
    value["next_due_local"] = json!(local);
    value
}
fn decode<T: serde::de::DeserializeOwned>(s: String) -> Result<T, MemoryError> {
    serde_json::from_str(&s).map_err(|_| invalid("invalid stored schedule"))
}
fn save(db: &rusqlite::Connection, s: &Schedule) -> Result<(), MemoryError> {
    db.execute("INSERT INTO schedules(id,body) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET body=excluded.body",params![s.id,serde_json::to_string(s).unwrap()])?;
    Ok(())
}
fn get(db: &rusqlite::Connection, id: &str) -> Result<Schedule, MemoryError> {
    decode(
        db.query_row("SELECT body FROM schedules WHERE id=?1", [id], |r| r.get(0))
            .optional()?
            .ok_or_else(|| invalid("schedule not found"))?,
    )
}
fn records(db: &rusqlite::Connection) -> Result<Vec<Schedule>, MemoryError> {
    let mut stmt =
        db.prepare("SELECT body FROM schedules ORDER BY json_extract(body,'$.next_due_ms'),id")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    rows.map(|r| decode(r?)).collect()
}
fn id(input: &Value) -> Result<&str, MemoryError> {
    input["schedule_id"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 100)
        .ok_or_else(|| invalid("schedule_id required"))
}
fn random_id(db: &rusqlite::Connection) -> Result<String, MemoryError> {
    Ok(db.query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))?)
}
impl WorkspaceStore {
    pub fn schedule_request(
        &self,
        op: &str,
        input: &Value,
        now: i64,
    ) -> Result<Value, MemoryError> {
        if input.to_string().len() > 20000 {
            return Err(invalid("schedule request too large"));
        }
        let mut db = self.0.lock().map_err(|_| MemoryError::LockPoisoned)?;
        let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let result = match op {
            "create" => {
                #[derive(Deserialize)]
                #[serde(deny_unknown_fields)]
                struct Create {
                    id: String,
                    schedule: ScheduleInput,
                }
                let c: Create = serde_json::from_value(input.clone()).map_err(|_| {
                    invalid("expected {id, schedule:{title,timezone,timing,action}}")
                })?;
                if c.id.is_empty() || c.id.len() > 100 {
                    return Err(invalid("id must contain 1..100 bytes"));
                }
                c.schedule.validate()?;
                let existing = tx
                    .query_row("SELECT body FROM schedules WHERE id=?1", [&c.id], |r| {
                        r.get::<_, String>(0)
                    })
                    .optional()?;
                if let Some(raw) = existing {
                    let s: Schedule = decode(raw)?;
                    if s.spec != c.schedule {
                        return Err(invalid("id already used with different schedule"));
                    }
                    present(&s)
                } else {
                    let next = c.schedule.next_after(now)?;
                    if next.is_none() {
                        return Err(invalid("one-time reminder must be in the future"));
                    }
                    let s = Schedule {
                        id: c.id,
                        revision: 1,
                        status: "active".into(),
                        spec: c.schedule,
                        next_due_ms: next,
                        created_ms: now,
                        updated_ms: now,
                    };
                    save(&tx, &s)?;
                    present(&s)
                }
            }
            "get" => present(&get(&tx, id(input)?)?),
            "list" => {
                let mut all = records(&tx)?;
                if let Some(status) = input["status"].as_str() {
                    if !matches!(status, "active" | "paused" | "cancelled" | "completed") {
                        return Err(invalid("invalid status"));
                    }
                    all.retain(|s| s.status == status);
                }
                let total = all.len();
                let offset = input["offset"].as_u64().unwrap_or(0).min(1000000) as usize;
                let limit = input["limit"].as_u64().unwrap_or(50).clamp(1, 100) as usize;
                let mut items = Vec::new();
                let mut bytes = 0;
                for item in all.into_iter().skip(offset).take(limit) {
                    bytes += serde_json::to_string(&item).unwrap().len();
                    if bytes > 180_000 && !items.is_empty() {
                        break;
                    }
                    items.push(present(&item));
                }
                let end = offset + items.len();
                json!({"items":items,"total":total,"next_offset":if end<total{Some(end)}else{None}})
            }
            "history" => {
                let limit = input["limit"].as_u64().unwrap_or(50).clamp(1, 100);
                let offset = input["offset"].as_u64().unwrap_or(0).min(1000000);
                let sid = input["schedule_id"].as_str();
                let total: i64 = tx.query_row(
                    "SELECT count(*) FROM schedule_runs WHERE (?1 IS NULL OR schedule_id=?1)",
                    [sid],
                    |r| r.get(0),
                )?;
                let mut stmt=tx.prepare("SELECT body FROM schedule_runs WHERE (?1 IS NULL OR schedule_id=?1) ORDER BY started_ms DESC,id DESC LIMIT ?2 OFFSET ?3")?;
                let rows =
                    stmt.query_map(params![sid, limit, offset], |r| r.get::<_, String>(0))?;
                let mut items = Vec::new();
                let mut bytes = 0;
                for row in rows {
                    let raw = row?;
                    bytes += raw.len();
                    if bytes > 180_000 && !items.is_empty() {
                        break;
                    }
                    items.push(decode::<Run>(raw)?);
                }
                let end = offset + items.len() as u64;
                json!({"items":items,"total":total,"next_offset":if end<(total as u64){Some(end)}else{None}})
            }
            "snooze" => {
                // Delay the next fire by `minutes` from now without touching the specification.
                // A completed one-time reminder re-arms; a recurring one may not be pushed past
                // its own next occurrence, because the claim loop would then skip that occurrence.
                let mut s = get(&tx, id(input)?)?;
                if input["expected_revision"].as_i64() != Some(s.revision) {
                    return Err(invalid("revision conflict; fetch schedule and retry"));
                }
                let minutes = input["minutes"]
                    .as_i64()
                    .filter(|m| (1..=1440).contains(m))
                    .ok_or_else(|| invalid("minutes must be 1..1440"))?;
                if !matches!(s.status.as_str(), "active" | "completed") {
                    return Err(invalid("only active or completed schedules can snooze"));
                }
                if matches!(s.spec.timing, Timing::AfterWake { .. }) {
                    return Err(invalid("after-wake schedules cannot snooze"));
                }
                let until = now + minutes * 60_000;
                if !matches!(s.spec.timing, Timing::Once { .. }) {
                    if let Some(regular) = s.spec.next_after(now)? {
                        if until >= regular {
                            return Err(invalid(
                                "snooze would pass the next scheduled occurrence; choose fewer minutes",
                            ));
                        }
                    }
                }
                s.next_due_ms = Some(until);
                s.status = "active".into();
                s.revision += 1;
                s.updated_ms = now;
                save(&tx, &s)?;
                present(&s)
            }
            "update" | "pause" | "resume" | "cancel" => {
                let mut s = get(&tx, id(input)?)?;
                if input["expected_revision"].as_i64() != Some(s.revision) {
                    return Err(invalid("revision conflict; fetch schedule and retry"));
                }
                if s.status == "cancelled" {
                    return Err(invalid("cancelled schedules are terminal; create a new id"));
                }
                if op == "update" {
                    let spec: ScheduleInput = serde_json::from_value(input["schedule"].clone())
                        .map_err(|_| {
                            invalid("update requires a complete schedule specification")
                        })?;
                    spec.validate()?;
                    s.next_due_ms = spec.next_after(now)?;
                    if s.next_due_ms.is_none() {
                        return Err(invalid("updated one-time schedule must be in the future"));
                    }
                    s.spec = spec;
                    if s.status == "completed" {
                        s.status = "active".into();
                    }
                } else if op == "resume" {
                    if s.status != "paused" {
                        return Err(invalid("only paused schedules can resume"));
                    }
                    // Paused occurrences are skipped. An elapsed one-time reminder catches up on resume.
                    if !matches!(s.spec.timing, Timing::Once { .. }) {
                        s.next_due_ms = s.spec.next_after(now)?;
                    }
                    s.status = "active".into();
                } else if op == "pause" {
                    if s.status != "active" {
                        return Err(invalid("only active schedules can pause"));
                    }
                    s.status = "paused".into();
                } else {
                    s.status = "cancelled".into();
                    s.next_due_ms = None;
                }
                s.revision += 1;
                s.updated_ms = now;
                save(&tx, &s)?;
                present(&s)
            }
            _ => return Err(invalid("unknown schedule operation")),
        };
        tx.commit()?;
        Ok(result)
    }
    /// Atomic across processes: reserve occurrence and advance schedule in the same transaction.
    /// Missed daily occurrences coalesce to one catch-up run; after-wake never catches up without activity.
    pub fn claim_schedules(&self, now: i64, wake: bool) -> Result<Vec<Run>, MemoryError> {
        let mut db = self.0.lock().map_err(|_| MemoryError::LockPoisoned)?;
        let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
        // No replay after an uncertain crash. Side effects cannot be atomically committed with SQLite.
        let stale = {
            let mut stmt = tx.prepare(
                "SELECT body FROM schedule_runs WHERE status='running' AND started_ms<?1",
            )?;
            let rows = stmt.query_map([now - 120000], |r| r.get::<_, String>(0))?;
            rows.map(|r| decode::<Run>(r?))
                .collect::<Result<Vec<_>, _>>()?
        };
        for mut r in stale {
            r.status = "interrupted".into();
            r.finished_ms = Some(now);
            r.error=Some("Runner stopped before completion; delivery may be uncertain. Occurrence will not replay.".into());
            update_run(&tx, &r)?;
        }
        let mut runs = Vec::new();
        for mut s in records(&tx)? {
            if s.status != "active" {
                continue;
            }
            let due = if matches!(s.spec.timing, Timing::AfterWake { .. }) {
                if wake {
                    s.spec.wake_due(now)?
                } else {
                    None
                }
            } else {
                s.next_due_ms.filter(|d| *d <= now)
            };
            if let Some(due) = due {
                let r = Run {
                    id: random_id(&tx)?,
                    schedule_id: s.id.clone(),
                    due_ms: due,
                    started_ms: now,
                    finished_ms: None,
                    status: "queued".into(),
                    output: String::new(),
                    delivery_status: "pending".into(),
                    error: None,
                    schedule: s.clone(),
                };
                let inserted=tx.execute("INSERT OR IGNORE INTO schedule_runs(id,schedule_id,due_ms,started_ms,status,body) VALUES(?1,?2,?3,?4,'queued',?5)",params![r.id,r.schedule_id,r.due_ms,now,serde_json::to_string(&r).unwrap()])?;
                if inserted == 1 {
                    runs.push(r);
                }
                s.next_due_ms = s.spec.next_after(now)?;
                if s.next_due_ms.is_none() {
                    s.status = "completed".into();
                }
                s.revision += 1;
                s.updated_ms = now;
                save(&tx, &s)?;
            } else if matches!(s.spec.timing, Timing::AfterWake { .. })
                && s.next_due_ms.is_some_and(|d| d <= now)
            {
                s.next_due_ms = s.spec.next_after(now)?;
                save(&tx, &s)?;
            }
        }
        tx.commit()?;
        Ok(runs)
    }
    /// Recover queued work across restarts and atomically assign it to a bounded worker slot.
    pub fn take_schedule_runs(&self, now: i64, limit: usize) -> Result<Vec<Run>, MemoryError> {
        let mut db = self.0.lock().map_err(|_| MemoryError::LockPoisoned)?;
        let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let mut runs = {
            let mut stmt = tx.prepare("SELECT body FROM schedule_runs WHERE status='queued' ORDER BY started_ms,id LIMIT ?1")?;
            let rows = stmt.query_map([limit.min(16) as i64], |r| r.get::<_, String>(0))?;
            rows.map(|r| decode::<Run>(r?))
                .collect::<Result<Vec<_>, _>>()?
        };
        for run in &mut runs {
            run.status = "running".into();
            run.started_ms = now;
            update_run(&tx, run)?;
        }
        tx.commit()?;
        Ok(runs)
    }
    pub fn finish_schedule_run(&self, run: &Run) -> Result<(), MemoryError> {
        let db = self.0.lock().map_err(|_| MemoryError::LockPoisoned)?;
        update_run(&db, run)
    }
    /// Recheck cancellation/editing just before an external side effect starts.
    pub fn schedule_run_current(&self, run: &Run) -> Result<bool, MemoryError> {
        let db = self.0.lock().map_err(|_| MemoryError::LockPoisoned)?;
        let s = get(&db, &run.schedule_id)?;
        Ok(s.status != "cancelled" && s.status != "paused" && s.spec == run.schedule.spec)
    }
}
fn update_run(db: &rusqlite::Connection, r: &Run) -> Result<(), MemoryError> {
    db.execute(
        "UPDATE schedule_runs SET status=?2,body=?3,started_ms=?4 WHERE id=?1",
        params![
            r.id,
            r.status,
            serde_json::to_string(r).unwrap(),
            r.started_ms
        ],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn ms(s: &str) -> i64 {
        DateTime::parse_from_rfc3339(s).unwrap().timestamp_millis()
    }
    fn store() -> (tempfile::TempDir, WorkspaceStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = WorkspaceStore::open(&dir.path().join("workspace.sqlite3")).unwrap();
        (dir, store)
    }
    fn spec(tz: &str, timing: Value) -> Value {
        json!({"title":"Resume","timezone":tz,"timing":timing,"action":{"type":"reminder","message":"Send resume"}})
    }
    fn create(store: &WorkspaceStore, id: &str, schedule: Value, now: i64) -> Value {
        store
            .schedule_request("create", &json!({"id":id,"schedule":schedule}), now)
            .unwrap()
    }
    #[test]
    fn timezone_conversion_and_input_validation() {
        let (_, s) = store();
        let now = ms("2026-10-25T00:00:00Z");
        let input = spec(
            "Asia/Kolkata",
            json!({"type":"once","local_at":"2026-10-26T14:00"}),
        );
        let r = create(&s, "resume", input.clone(), now);
        assert_eq!(r["next_due_ms"], ms("2026-10-26T08:30:00Z"));
        assert_eq!(r["next_due_local"], "2026-10-26T14:00");
        assert_eq!(r, create(&s, "resume", input, now + 100));
        for bad in [
            spec("Mars/Base", json!({"type":"daily","time":"08:00"})),
            spec("UTC", json!({"type":"daily","time":"25:00"})),
            spec("UTC", json!({"type":"daily","time":"08:00","weekdays":[0]})),
            spec("UTC", json!({"type":"once","local_at":"2026-02-30T10:00"})),
        ] {
            assert!(s
                .schedule_request("create", &json!({"id":"bad","schedule":bad}), now)
                .is_err());
        }
        assert!(s.schedule_request("create",&json!({"id":"past","schedule":spec("UTC",json!({"type":"once","local_at":"2020-01-01T00:00"}))}),now).is_err());
    }
    #[test]
    fn dst_gaps_folds_and_local_calendar_recurrence() {
        let (_, s) = store();
        let before = ms("2026-03-07T00:00:00Z");
        for at in ["2026-03-08T02:30", "2026-11-01T01:30"] {
            assert!(s.schedule_request("create",&json!({"id":at,"schedule":spec("America/New_York",json!({"type":"once","local_at":at}))}),before).is_err());
        }
        let daily: ScheduleInput = serde_json::from_value(spec(
            "America/New_York",
            json!({"type":"daily","time":"02:30"}),
        ))
        .unwrap();
        assert_eq!(
            daily.next_after(ms("2026-03-07T07:30:00Z")).unwrap(),
            Some(ms("2026-03-09T06:30:00Z"))
        );
        let folded: ScheduleInput = serde_json::from_value(spec(
            "America/New_York",
            json!({"type":"daily","time":"01:30"}),
        ))
        .unwrap();
        assert_eq!(
            folded.next_after(ms("2026-11-01T00:00:00Z")).unwrap(),
            Some(ms("2026-11-01T05:30:00Z"))
        );
        assert_eq!(
            folded.next_after(ms("2026-11-01T05:30:00Z")).unwrap(),
            Some(ms("2026-11-02T06:30:00Z"))
        );
        let weekdays: ScheduleInput = serde_json::from_value(spec(
            "UTC",
            json!({"type":"daily","time":"08:00","weekdays":[1,2,3,4,5]}),
        ))
        .unwrap();
        assert_eq!(
            weekdays.next_after(ms("2026-10-23T09:00:00Z")).unwrap(),
            Some(ms("2026-10-26T08:00:00Z"))
        );
    }
    fn parsed(tz: &str, timing: Value) -> ScheduleInput {
        serde_json::from_value(spec(tz, timing)).unwrap()
    }
    #[test]
    fn monthly_clamps_short_months_and_supports_last_day() {
        let on_31 = parsed("UTC", json!({"type":"monthly","day":31,"time":"09:00"}));
        // Feb 2027 has 28 days; the 31st clamps rather than skipping the month.
        assert_eq!(
            on_31.next_after(ms("2027-02-01T00:00:00Z")).unwrap(),
            Some(ms("2027-02-28T09:00:00Z"))
        );
        assert_eq!(
            on_31.next_after(ms("2027-02-28T09:00:00Z")).unwrap(),
            Some(ms("2027-03-31T09:00:00Z"))
        );
        // Leap year.
        assert_eq!(
            on_31.next_after(ms("2028-02-01T00:00:00Z")).unwrap(),
            Some(ms("2028-02-29T09:00:00Z"))
        );
        let last = parsed("UTC", json!({"type":"monthly","day":-1,"time":"23:30"}));
        assert_eq!(
            last.next_after(ms("2026-04-15T00:00:00Z")).unwrap(),
            Some(ms("2026-04-30T23:30:00Z"))
        );
        assert_eq!(
            last.next_after(ms("2026-12-31T23:30:00Z")).unwrap(),
            Some(ms("2027-01-31T23:30:00Z"))
        );
        let first = parsed("UTC", json!({"type":"monthly","day":1,"time":"08:00"}));
        assert_eq!(
            first.next_after(ms("2026-12-15T00:00:00Z")).unwrap(),
            Some(ms("2027-01-01T08:00:00Z"))
        );
        for bad in [0, 32, -2] {
            assert!(parsed("UTC", json!({"type":"monthly","day":bad,"time":"08:00"}))
                .next_after(0)
                .is_err());
        }
    }
    #[test]
    fn monthly_uses_local_time_across_dst() {
        let first = parsed(
            "America/New_York",
            json!({"type":"monthly","day":8,"time":"09:00"}),
        );
        // Mar 8 2026 is the spring-forward day: 09:00 EDT is 13:00Z.
        assert_eq!(
            first.next_after(ms("2026-03-01T00:00:00Z")).unwrap(),
            Some(ms("2026-03-08T13:00:00Z"))
        );
        // A time inside the gap skips that month instead of firing at a shifted time.
        let gap = parsed(
            "America/New_York",
            json!({"type":"monthly","day":8,"time":"02:30"}),
        );
        assert_eq!(
            gap.next_after(ms("2026-03-01T00:00:00Z")).unwrap(),
            Some(ms("2026-04-08T06:30:00Z"))
        );
    }
    #[test]
    fn interval_steps_windows_and_weekdays() {
        let plain = parsed(
            "UTC",
            json!({"type":"interval","every_minutes":120,"start_local":"2026-10-26T09:00"}),
        );
        assert_eq!(
            plain.next_after(ms("2026-10-25T00:00:00Z")).unwrap(),
            Some(ms("2026-10-26T09:00:00Z"))
        );
        assert_eq!(
            plain.next_after(ms("2026-10-26T09:00:00Z")).unwrap(),
            Some(ms("2026-10-26T11:00:00Z"))
        );
        assert_eq!(
            plain.next_after(ms("2026-10-26T10:59:59Z")).unwrap(),
            Some(ms("2026-10-26T11:00:00Z"))
        );
        let windowed = parsed(
            "UTC",
            json!({"type":"interval","every_minutes":120,"start_local":"2026-10-26T09:00","window_start":"09:00","window_end":"21:00"}),
        );
        assert_eq!(
            windowed.next_after(ms("2026-10-26T19:00:00Z")).unwrap(),
            Some(ms("2026-10-26T21:00:00Z"))
        );
        // 21:00 is the last slot; the next day's first slot is 09:00 (slots stay on the 2h grid).
        assert_eq!(
            windowed.next_after(ms("2026-10-26T21:00:00Z")).unwrap(),
            Some(ms("2026-10-27T09:00:00Z"))
        );
        let weekdays = parsed(
            "UTC",
            json!({"type":"interval","every_minutes":60,"start_local":"2026-10-23T09:00","window_start":"09:00","window_end":"10:00","weekdays":[1,2,3,4,5]}),
        );
        // Friday 10:00 is the last slot of the week; Saturday and Sunday are skipped.
        assert_eq!(
            weekdays.next_after(ms("2026-10-23T10:00:00Z")).unwrap(),
            Some(ms("2026-10-26T09:00:00Z"))
        );
    }
    #[test]
    fn interval_validation_rejects_short_cross_midnight_and_partial_windows() {
        for bad in [
            json!({"type":"interval","every_minutes":14,"start_local":"2026-10-26T09:00"}),
            json!({"type":"interval","every_minutes":0,"start_local":"2026-10-26T09:00"}),
            json!({"type":"interval","every_minutes":60,"start_local":"2026-10-26 09:00"}),
            json!({"type":"interval","every_minutes":60,"start_local":"2026-10-26T09:00","window_start":"22:00","window_end":"06:00"}),
            json!({"type":"interval","every_minutes":60,"start_local":"2026-10-26T09:00","window_start":"09:00"}),
            json!({"type":"interval","every_minutes":60,"start_local":"2026-10-26T09:00","weekdays":[8]}),
        ] {
            assert!(parsed("UTC", bad).next_after(0).is_err());
        }
        assert!(parsed(
            "UTC",
            json!({"type":"interval","every_minutes":15,"start_local":"2026-10-26T09:00"})
        )
        .next_after(0)
        .is_ok());
    }
    #[test]
    fn interval_ignores_dst_in_steps_but_windows_follow_local_time() {
        // Hourly across the New York spring-forward: slots stay 60 absolute minutes apart.
        let hourly = parsed(
            "America/New_York",
            json!({"type":"interval","every_minutes":60,"start_local":"2026-03-08T00:00"}),
        );
        assert_eq!(
            hourly.next_after(ms("2026-03-08T06:30:00Z")).unwrap(),
            Some(ms("2026-03-08T07:00:00Z"))
        );
        assert_eq!(
            hourly.next_after(ms("2026-03-08T07:00:00Z")).unwrap(),
            Some(ms("2026-03-08T08:00:00Z"))
        );
    }
    #[test]
    fn interval_and_monthly_catch_up_once_after_sleep() {
        let (_, s) = store();
        let start = ms("2026-10-25T00:00:00Z");
        create(
            &s,
            "water",
            spec(
                "UTC",
                json!({"type":"interval","every_minutes":60,"start_local":"2026-10-25T01:00"}),
            ),
            start,
        );
        create(
            &s,
            "rent",
            spec("UTC", json!({"type":"monthly","day":1,"time":"09:00"})),
            start,
        );
        // The machine slept for 40 hours: exactly one run per schedule, then back on the grid.
        let woke = ms("2026-10-26T16:20:00Z");
        let runs = s.claim_schedules(woke, false).unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].schedule_id, "water");
        assert!(s.claim_schedules(woke, false).unwrap().is_empty());
        let water = s
            .schedule_request("get", &json!({"schedule_id":"water"}), woke)
            .unwrap();
        assert_eq!(water["next_due_ms"], ms("2026-10-26T17:00:00Z"));
        let later = ms("2026-11-01T09:00:00Z");
        let runs = s.claim_schedules(later, false).unwrap();
        assert!(runs.iter().any(|r| r.schedule_id == "rent"));
        let rent = s
            .schedule_request("get", &json!({"schedule_id":"rent"}), later)
            .unwrap();
        assert_eq!(rent["next_due_ms"], ms("2026-12-01T09:00:00Z"));
    }
    #[test]
    fn snooze_delays_once_and_guards_recurring() {
        let (_, s) = store();
        let now = ms("2026-10-25T08:00:00Z");
        create(
            &s,
            "once",
            spec("UTC", json!({"type":"once","local_at":"2026-10-25T08:30"})),
            now,
        );
        create(
            &s,
            "daily",
            spec("UTC", json!({"type":"daily","time":"09:00"})),
            now,
        );
        let at = ms("2026-10-25T08:30:00Z");
        assert_eq!(s.claim_schedules(at, false).unwrap().len(), 1);
        // The completed one-time reminder re-arms for the snooze.
        let snoozed = s
            .schedule_request(
                "snooze",
                &json!({"schedule_id":"once","expected_revision":2,"minutes":10}),
                at,
            )
            .unwrap();
        assert_eq!(snoozed["status"], "active");
        assert_eq!(snoozed["next_due_ms"], at + 600_000);
        assert!(s.claim_schedules(at + 599_000, false).unwrap().is_empty());
        assert_eq!(s.claim_schedules(at + 600_000, false).unwrap().len(), 1);
        // A stale revision, zero minutes and a daily push past its next occurrence all fail.
        assert!(s
            .schedule_request(
                "snooze",
                &json!({"schedule_id":"once","expected_revision":1,"minutes":5}),
                at
            )
            .is_err());
        assert!(s
            .schedule_request(
                "snooze",
                &json!({"schedule_id":"daily","expected_revision":1,"minutes":0}),
                at
            )
            .is_err());
        assert!(s
            .schedule_request(
                "snooze",
                &json!({"schedule_id":"daily","expected_revision":1,"minutes":45}),
                at
            )
            .is_err());
        let ok = s
            .schedule_request(
                "snooze",
                &json!({"schedule_id":"daily","expected_revision":1,"minutes":15}),
                at,
            )
            .unwrap();
        assert_eq!(ok["next_due_ms"], at + 900_000);
        // The daily schedule keeps its specification and resumes its normal cadence afterwards.
        assert_eq!(s.claim_schedules(at + 900_000, false).unwrap().len(), 1);
        let after = s
            .schedule_request("get", &json!({"schedule_id":"daily"}), at + 900_000)
            .unwrap();
        assert_eq!(after["next_due_ms"], ms("2026-10-25T09:00:00Z"));
    }
    #[test]
    fn restart_recovers_due_and_coalesces_missed_days() {
        let (dir, s) = store();
        let before = ms("2026-10-20T00:00:00Z");
        create(
            &s,
            "once",
            spec("UTC", json!({"type":"once","local_at":"2026-10-21T14:00"})),
            before,
        );
        create(
            &s,
            "daily",
            spec("UTC", json!({"type":"daily","time":"08:00"})),
            before,
        );
        drop(s);
        let s = WorkspaceStore::open(&dir.path().join("workspace.sqlite3")).unwrap();
        let now = ms("2026-10-25T15:00:00Z");
        let runs = s.claim_schedules(now, false).unwrap();
        assert_eq!(runs.len(), 2);
        assert!(s.claim_schedules(now, false).unwrap().is_empty());
        assert_eq!(
            s.schedule_request("get", &json!({"schedule_id":"once"}), now)
                .unwrap()["status"],
            "completed"
        );
        assert_eq!(
            s.schedule_request("get", &json!({"schedule_id":"daily"}), now)
                .unwrap()["next_due_ms"],
            ms("2026-10-26T08:00:00Z")
        );
        drop(s);
        let s = WorkspaceStore::open(&dir.path().join("workspace.sqlite3")).unwrap();
        assert!(s.claim_schedules(now + 120001, false).unwrap().is_empty());
        assert_eq!(s.take_schedule_runs(now + 120001, 10).unwrap().len(), 2);
        assert!(s.take_schedule_runs(now + 120001, 10).unwrap().is_empty());
        assert!(s.claim_schedules(now + 240002, false).unwrap().is_empty());
        let history = s
            .schedule_request("history", &json!({}), now + 240002)
            .unwrap();
        assert_eq!(history["total"], 2);
        assert!(history["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|r| r["status"] == "interrupted"));
    }
    #[test]
    fn wake_window_duplicate_events_weekdays_and_restart() {
        let (dir, s) = store();
        let start = ms("2026-10-25T00:00:00Z");
        create(
            &s,
            "wake",
            spec(
                "Asia/Kolkata",
                json!({"type":"after_wake","time":"06:00","window_end":"12:00"}),
            ),
            start,
        );
        assert!(s
            .claim_schedules(ms("2026-10-25T00:15:00Z"), true)
            .unwrap()
            .is_empty());
        create(
            &s,
            "weekday",
            spec(
                "Asia/Kolkata",
                json!({"type":"after_wake","time":"06:00","window_end":"12:00","weekdays":[1]}),
            ),
            start,
        );
        let morning = ms("2026-10-25T03:00:00Z");
        assert!(s.claim_schedules(morning, false).unwrap().is_empty());
        assert_eq!(s.claim_schedules(morning, true).unwrap().len(), 1);
        assert!(s.claim_schedules(morning + 1000, true).unwrap().is_empty());
        drop(s);
        let s = WorkspaceStore::open(&dir.path().join("workspace.sqlite3")).unwrap();
        assert!(s.claim_schedules(morning + 10000, true).unwrap().is_empty());
        assert_eq!(
            s.claim_schedules(ms("2026-10-26T01:00:00Z"), true)
                .unwrap()
                .len(),
            2
        );
        assert!(s
            .claim_schedules(ms("2026-10-26T06:30:00Z"), true)
            .unwrap()
            .is_empty());
        assert_eq!(
            s.claim_schedules(ms("2026-10-27T01:00:00Z"), true)
                .unwrap()
                .len(),
            1
        );
    }
    #[test]
    fn long_answers_paginate_without_exceeding_bridge_limit() {
        let (_, s) = store();
        let now = ms("2026-10-25T00:00:00Z");
        for n in 0..20 {
            let mut input = spec("UTC", json!({"type":"daily","time":"08:00"}));
            input["action"]["message"] = json!("x".repeat(12000));
            create(&s, &format!("schedule-{n}"), input, now);
        }
        let mut count = 0;
        let mut offset = 0;
        loop {
            let page = s
                .schedule_request("list", &json!({"offset":offset,"limit":100}), now)
                .unwrap();
            assert!(page.to_string().len() < 190_000);
            count += page["items"].as_array().unwrap().len();
            match page["next_offset"].as_u64() {
                Some(next) => offset = next,
                None => break,
            }
        }
        assert_eq!(count, 20);
        s.claim_schedules(now + 9 * 3600000, false).unwrap();
        // The production worker takes at most 16 at once.
        let mut selected = s.take_schedule_runs(now + 9 * 3600000, 16).unwrap();
        selected.extend(s.take_schedule_runs(now + 9 * 3600000, 16).unwrap());
        for mut run in selected {
            run.output = "y".repeat(32000);
            run.status = "succeeded".into();
            s.finish_schedule_run(&run).unwrap();
        }
        count = 0;
        offset = 0;
        loop {
            let page = s
                .schedule_request("history", &json!({"offset":offset,"limit":100}), now)
                .unwrap();
            assert!(page.to_string().len() < 190_000);
            count += page["items"].as_array().unwrap().len();
            match page["next_offset"].as_u64() {
                Some(next) => offset = next,
                None => break,
            }
        }
        assert_eq!(count, 20);
    }
    #[test]
    fn separate_connections_race_for_one_occurrence() {
        let (dir, s) = store();
        let before = ms("2026-10-25T00:00:00Z");
        create(
            &s,
            "one",
            spec("UTC", json!({"type":"daily","time":"08:00"})),
            before,
        );
        let a = WorkspaceStore::open(&dir.path().join("workspace.sqlite3")).unwrap();
        let b = WorkspaceStore::open(&dir.path().join("workspace.sqlite3")).unwrap();
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let gate = barrier.clone();
        let now = ms("2026-10-25T08:00:00Z");
        let t = std::thread::spawn(move || {
            gate.wait();
            a.claim_schedules(now, true).unwrap().len()
        });
        barrier.wait();
        let count = b.claim_schedules(now, true).unwrap().len();
        assert_eq!(t.join().unwrap() + count, 1);
        let gate = std::sync::Arc::new(std::sync::Barrier::new(2));
        let peer = gate.clone();
        let worker = std::thread::spawn(move || {
            peer.wait();
            b.take_schedule_runs(now, 1).unwrap().len()
        });
        gate.wait();
        let taken = s.take_schedule_runs(now, 1).unwrap().len();
        assert_eq!(worker.join().unwrap() + taken, 1);
        assert_eq!(
            s.schedule_request("history", &json!({}), now).unwrap()["total"],
            1
        );
    }
    #[test]
    fn pause_resume_edit_cancel_and_revision_conflicts() {
        let (_, s) = store();
        let now = ms("2026-10-25T00:00:00Z");
        create(
            &s,
            "one",
            spec("UTC", json!({"type":"once","local_at":"2026-10-25T08:00"})),
            now,
        );
        let pause = json!({"schedule_id":"one","expected_revision":1});
        s.schedule_request("pause", &pause, now).unwrap();
        assert!(s.schedule_request("cancel", &pause, now).is_err());
        let later = ms("2026-10-25T09:00:00Z");
        assert!(s.claim_schedules(later, false).unwrap().is_empty());
        s.schedule_request(
            "resume",
            &json!({"schedule_id":"one","expected_revision":2}),
            later,
        )
        .unwrap();
        assert_eq!(s.claim_schedules(later, false).unwrap().len(), 1);
        let r = s
            .schedule_request("get", &json!({"schedule_id":"one"}), later)
            .unwrap();
        let updated=s.schedule_request("update",&json!({"schedule_id":"one","expected_revision":r["revision"],"schedule":spec("UTC",json!({"type":"daily","time":"10:00"}))}),later).unwrap();
        assert_eq!(updated["status"], "active");
        s.schedule_request(
            "cancel",
            &json!({"schedule_id":"one","expected_revision":updated["revision"]}),
            later,
        )
        .unwrap();
        assert!(s
            .claim_schedules(later + 86400000, true)
            .unwrap()
            .is_empty());
        assert!(s.schedule_request("resume",&json!({"schedule_id":"one","expected_revision":updated["revision"].as_i64().unwrap()+1}),later).is_err());
    }
}
