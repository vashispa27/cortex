//! Date phrases in a question -> a local-time window `[start, end)`.
//!
//! Rules (all in the user's local timezone, weeks start on Monday):
//!   today, yesterday, the day before yesterday, N days ago     -> that calendar day
//!   YYYY-MM-DD, on <Month> <d> / on <d> <Month> [year]          -> that day (never a future date)
//!   this/last week, N weeks ago                                 -> Monday..Sunday of that week;
//!                                                                  "this week" ends with today
//!   this/last month, in <Month> [year]                          -> that calendar month; "this month"
//!                                                                  ends with today; future months are ignored
//!   last <weekday>                                              -> the most recent such day strictly before today
//!   this morning / afternoon / evening, tonight                 -> 00-12 / 12-18 / 18-24 today
//! A phrase this module does not understand yields no window, never a wrong one: a month-day without
//! "on", a bare weekday, "last night" and "recently" are left alone because they often name content
//! ("due on Thursday") rather than when something was seen.

use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime, Weekday};
use regex::Regex;
use std::sync::OnceLock;

type Window = (NaiveDateTime, NaiveDateTime);

fn midnight(d: NaiveDate) -> NaiveDateTime {
    d.and_hms_opt(0, 0, 0).unwrap()
}

fn day(d: NaiveDate) -> Window {
    (midnight(d), midnight(d + Duration::days(1)))
}

fn monday_of(d: NaiveDate) -> NaiveDate {
    d - Duration::days(d.weekday().num_days_from_monday() as i64)
}

fn month_start(year: i32, month: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(year, month, 1).unwrap()
}

fn next_month(d: NaiveDate) -> NaiveDate {
    if d.month() == 12 { month_start(d.year() + 1, 1) } else { month_start(d.year(), d.month() + 1) }
}

fn prev_month(d: NaiveDate) -> NaiveDate {
    if d.month() == 1 { month_start(d.year() - 1, 12) } else { month_start(d.year(), d.month() - 1) }
}

fn number(word: &str) -> Option<i64> {
    match word {
        "a" | "an" | "one" => Some(1),
        "two" => Some(2),
        "three" => Some(3),
        "four" => Some(4),
        "five" => Some(5),
        "six" => Some(6),
        "seven" => Some(7),
        other => other.parse().ok(),
    }
}

const MONTHS: [(&str, u32); 12] = [
    ("january|jan", 1), ("february|feb", 2), ("march|mar", 3), ("april|apr", 4), ("may", 5), ("june|jun", 6),
    ("july|jul", 7), ("august|aug", 8), ("september|sept|sep", 9), ("october|oct", 10), ("november|nov", 11), ("december|dec", 12),
];

fn month_of(word: &str) -> Option<u32> {
    MONTHS.iter().find(|(names, _)| names.split('|').any(|n| n == word)).map(|(_, m)| *m)
}

fn regexes() -> &'static Vec<(&'static str, Regex)> {
    static RE: OnceLock<Vec<(&'static str, Regex)>> = OnceLock::new();
    RE.get_or_init(|| {
        let month = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec";
        let n = r"\d+|a|an|one|two|three|four|five|six|seven";
        let list: Vec<(&'static str, String)> = vec![
            ("iso", r"\b(\d{4})-(\d{2})-(\d{2})\b".into()),
            ("days_ago", format!(r"\b({n}) days? ago\b")),
            ("weeks_ago", format!(r"\b({n}) weeks? ago\b")),
            ("last_weekday", r"\blast (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b".into()),
            ("month_day", format!(r"\bon (?:the )?(\d{{1,2}})(?:st|nd|rd|th)?(?: of)? ({month})(?:,? (\d{{4}}))?\b")),
            ("day_month", format!(r"\bon ({month})\.? (\d{{1,2}})(?:st|nd|rd|th)?(?:,? (\d{{4}}))?\b")),
            ("in_month", format!(r"\bin ({month})(?: (\d{{4}}))?\b")),
        ];
        list.into_iter().map(|(k, p)| (k, Regex::new(&p).unwrap())).collect()
    })
}

fn weekday_of(word: &str) -> Option<Weekday> {
    match word {
        "monday" => Some(Weekday::Mon),
        "tuesday" => Some(Weekday::Tue),
        "wednesday" => Some(Weekday::Wed),
        "thursday" => Some(Weekday::Thu),
        "friday" => Some(Weekday::Fri),
        "saturday" => Some(Weekday::Sat),
        "sunday" => Some(Weekday::Sun),
        _ => None,
    }
}

/// The window the question asks about, relative to local calendar day `today`.
pub fn bounds(question: &str, today: NaiveDate) -> Option<Window> {
    let q = question.to_lowercase();
    // Whole-word match: "last week" must not fire on "last weekend", "today" not on "todays".
    let has = |p: &str| {
        q.match_indices(p).any(|(i, m)| {
            let before = q[..i].chars().next_back().map_or(true, |c| !c.is_alphanumeric());
            let after = q[i + m.len()..].chars().next().map_or(true, |c| !c.is_alphanumeric());
            before && after
        })
    };
    // Phrases handled before the regex family keep their original precedence (yesterday, then today).
    if has("day before yesterday") {
        return Some(day(today - Duration::days(2)));
    }
    if has("yesterday") {
        return Some(day(today - Duration::days(1)));
    }
    if has("today") {
        return Some(day(today));
    }
    if has("this morning") {
        return Some((midnight(today), midnight(today) + Duration::hours(12)));
    }
    if has("this afternoon") {
        return Some((midnight(today) + Duration::hours(12), midnight(today) + Duration::hours(18)));
    }
    if has("this evening") || has("tonight") {
        return Some((midnight(today) + Duration::hours(18), midnight(today + Duration::days(1))));
    }
    if has("last week") {
        let m = monday_of(today);
        return Some((midnight(m - Duration::days(7)), midnight(m)));
    }
    if has("this week") {
        return Some((midnight(monday_of(today)), midnight(today + Duration::days(1))));
    }
    if has("last month") {
        return Some((midnight(prev_month(today)), midnight(month_start(today.year(), today.month()))));
    }
    if has("this month") {
        return Some((midnight(month_start(today.year(), today.month())), midnight(today + Duration::days(1))));
    }
    for (kind, re) in regexes() {
        let Some(c) = re.captures(&q) else { continue };
        match *kind {
            "iso" => {
                let date = NaiveDate::from_ymd_opt(c[1].parse().ok()?, c[2].parse().ok()?, c[3].parse().ok()?);
                if let Some(d) = date {
                    return Some(day(d));
                }
            }
            "days_ago" => {
                let n = number(&c[1])?;
                if (1..=60).contains(&n) {
                    return Some(day(today - Duration::days(n)));
                }
            }
            "weeks_ago" => {
                let n = number(&c[1])?;
                if (1..=12).contains(&n) {
                    let m = monday_of(today) - Duration::days(7 * n);
                    return Some((midnight(m), midnight(m + Duration::days(7))));
                }
            }
            "last_weekday" => {
                let wanted = weekday_of(&c[1])?;
                let mut d = today - Duration::days(1);
                while d.weekday() != wanted {
                    d -= Duration::days(1);
                }
                return Some(day(d));
            }
            "month_day" | "day_month" => {
                let (d, m, y) = if *kind == "month_day" { (&c[1], &c[2], c.get(3)) } else { (&c[2], &c[1], c.get(3)) };
                let year = y.map_or(Some(today.year()), |y| y.as_str().parse().ok())?;
                let date = NaiveDate::from_ymd_opt(year, month_of(m)?, d.parse().ok()?)?;
                // Something not yet seen cannot be asked about by date; treat as content, not a window.
                if date <= today {
                    return Some(day(date));
                }
            }
            "in_month" => {
                let month = month_of(&c[1])?;
                // "in may" is usually the verb; the month needs a year.
                if month == 5 && c.get(2).is_none() {
                    continue;
                }
                let year = c.get(2).map_or(Some(today.year()), |y| y.as_str().parse().ok())?;
                let start = month_start(year, month);
                if start <= today {
                    return Some((midnight(start), midnight(next_month(start))));
                }
            }
            _ => {}
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(y: i32, m: u32, day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, day).unwrap()
    }
    fn at(y: i32, m: u32, day: u32, h: u32) -> NaiveDateTime {
        d(y, m, day).and_hms_opt(h, 0, 0).unwrap()
    }
    // Saturday 2026-10-17.
    const SAT: (i32, u32, u32) = (2026, 10, 17);
    fn win(q: &str) -> Option<Window> {
        bounds(q, d(SAT.0, SAT.1, SAT.2))
    }

    #[test]
    fn single_days() {
        assert_eq!(win("what did I do today"), Some((at(2026, 10, 17, 0), at(2026, 10, 18, 0))));
        assert_eq!(win("what did I do yesterday"), Some((at(2026, 10, 16, 0), at(2026, 10, 17, 0))));
        assert_eq!(win("the day before yesterday"), Some((at(2026, 10, 15, 0), at(2026, 10, 16, 0))));
        assert_eq!(win("two days ago"), Some((at(2026, 10, 15, 0), at(2026, 10, 16, 0))));
        assert_eq!(win("what was it 3 days ago"), Some((at(2026, 10, 14, 0), at(2026, 10, 15, 0))));
        assert_eq!(win("a day ago"), Some((at(2026, 10, 16, 0), at(2026, 10, 17, 0))));
        assert_eq!(win("on 2026-10-14 I read"), Some((at(2026, 10, 14, 0), at(2026, 10, 15, 0))));
        assert_eq!(win("what flight did I book on October 14"), Some((at(2026, 10, 14, 0), at(2026, 10, 15, 0))));
        assert_eq!(win("on 14 October"), win("on october 14th"));
        assert_eq!(win("on the 14th of October"), win("on Oct 14"));
        assert_eq!(win("on October 14, 2025"), Some((at(2025, 10, 14, 0), at(2025, 10, 15, 0))));
    }

    #[test]
    fn weekdays_are_always_in_the_past() {
        assert_eq!(win("which test failed last Friday"), Some((at(2026, 10, 16, 0), at(2026, 10, 17, 0))));
        assert_eq!(win("last Saturday"), Some((at(2026, 10, 10, 0), at(2026, 10, 11, 0))), "strictly before today");
        assert_eq!(win("last Monday"), Some((at(2026, 10, 12, 0), at(2026, 10, 13, 0))));
        assert_eq!(win("what is due on Thursday"), None, "a bare weekday names content, not a window");
    }

    #[test]
    fn weeks_months_and_parts_of_today() {
        assert_eq!(win("last week"), Some((at(2026, 10, 5, 0), at(2026, 10, 12, 0))));
        assert_eq!(win("this week"), Some((at(2026, 10, 12, 0), at(2026, 10, 18, 0))));
        assert_eq!(win("two weeks ago"), Some((at(2026, 9, 28, 0), at(2026, 10, 5, 0))));
        assert_eq!(win("last month"), Some((at(2026, 9, 1, 0), at(2026, 10, 1, 0))));
        assert_eq!(win("this month"), Some((at(2026, 10, 1, 0), at(2026, 10, 18, 0))));
        assert_eq!(win("in September"), Some((at(2026, 9, 1, 0), at(2026, 10, 1, 0))));
        assert_eq!(win("in May 2026"), Some((at(2026, 5, 1, 0), at(2026, 6, 1, 0))));
        assert_eq!(win("this morning"), Some((at(2026, 10, 17, 0), at(2026, 10, 17, 12))));
        assert_eq!(win("this afternoon"), Some((at(2026, 10, 17, 12), at(2026, 10, 17, 18))));
        assert_eq!(win("tonight"), Some((at(2026, 10, 17, 18), at(2026, 10, 18, 0))));
    }

    #[test]
    fn unparsed_or_unsafe_phrases_give_no_window() {
        for q in ["what is the weather", "bake for two hours", "due on 31 October", "on December 25", "in November",
                  "I may be in May", "the deposit by 5 November", "recently", "last night", "in 2026",
                  "what did Thursday say", "100 days ago ago", "a week", "last weekend"] {
            assert_eq!(win(q), None, "{q}");
        }
    }

    #[test]
    fn week_and_month_boundaries() {
        let monday = d(2026, 10, 12);
        assert_eq!(bounds("last week", monday), Some((at(2026, 10, 5, 0), at(2026, 10, 12, 0))));
        assert_eq!(bounds("this week", monday), Some((at(2026, 10, 12, 0), at(2026, 10, 13, 0))));
        let sunday = d(2026, 10, 18);
        assert_eq!(bounds("this week", sunday), Some((at(2026, 10, 12, 0), at(2026, 10, 19, 0))));
        assert_eq!(bounds("last week", sunday), Some((at(2026, 10, 5, 0), at(2026, 10, 12, 0))));
        let new_year = d(2027, 1, 3);
        assert_eq!(bounds("last month", new_year), Some((at(2026, 12, 1, 0), at(2027, 1, 1, 0))));
        assert_eq!(bounds("last Friday", new_year), Some((at(2027, 1, 1, 0), at(2027, 1, 2, 0))));
        assert_eq!(bounds("last Friday", d(2026, 3, 1)), Some((at(2026, 2, 27, 0), at(2026, 2, 28, 0))));
        assert_eq!(bounds("on February 29", d(2027, 3, 1)), None, "no such day in 2027");
        assert_eq!(bounds("on February 29", d(2028, 3, 1)), Some((at(2028, 2, 29, 0), at(2028, 3, 1, 0))));
        assert_eq!(bounds("last month", d(2026, 3, 31)), Some((at(2026, 2, 1, 0), at(2026, 3, 1, 0))));
    }
}
