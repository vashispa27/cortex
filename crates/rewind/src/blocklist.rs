//! Apps whose windows are never saved.
//!
//! Terminals and code editors hold commands, file paths, tokens and source code that nobody asks a
//! "memory of my life" question about, and they fill the index with self-referential noise. The list is
//! a small JSON file in the state directory (`blocked_apps.json`) so that a settings UI, the CLI
//! (`rewind blocklist ...`) or a person with a text editor can all change it. The capture loop
//! re-reads the file when it changes, so edits apply without a restart.
//!
//! Matching is on the app bundle id, case-insensitively: an exact id, or a prefix when the entry ends
//! in `*` (`com.jetbrains.*`). Disabled entries are kept in the file but ignored. Blocking is
//! prospective: snapshots saved earlier are left alone.
//!
//! The Accessibility helper still reads the frontmost window before the app id is known to this
//! process; a blocked window's tree is dropped in memory and never reaches SQLite or the index.

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::os::unix::net::UnixStream;
use std::time::SystemTime;

pub const FILE_NAME: &str = "blocked_apps.json";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Entry {
    /// Bundle id, or a prefix ending in `*`.
    pub app_id: String,
    /// Human-readable name for a UI.
    pub label: String,
    /// "terminal", "editor", "coding_agent" or "custom".
    pub category: String,
    /// "default" for entries shipped with the app, "user" for ones added by the person.
    pub origin: String,
    pub enabled: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Blocklist {
    pub version: u32,
    pub apps: Vec<Entry>,
}

fn default_entry(app_id: &str, label: &str, category: &str, enabled: bool) -> Entry {
    Entry { app_id: app_id.into(), label: label.into(), category: category.into(), origin: "default".into(), enabled }
}

/// Terminals and code editors are blocked by default. Coding-agent apps are listed but off: they are AI
/// chat apps, and whether their sessions count as "life" is the person's call.
pub fn defaults() -> Vec<Entry> {
    let mut v = Vec::new();
    for (id, label) in [
        ("com.apple.Terminal", "Terminal"),
        ("com.googlecode.iterm2", "iTerm2"),
        ("dev.warp.Warp-Stable", "Warp"),
        ("dev.warp.Warp", "Warp"),
        ("net.kovidgoyal.kitty", "kitty"),
        ("com.github.wez.wezterm", "WezTerm"),
        ("org.alacritty", "Alacritty"),
        ("co.zeit.hyper", "Hyper"),
        ("com.mitchellh.ghostty", "Ghostty"),
        ("com.cmuxterm.app", "cmux"),
    ] {
        v.push(default_entry(id, label, "terminal", true));
    }
    for (id, label) in [
        ("com.microsoft.VSCode", "Visual Studio Code"),
        ("com.microsoft.VSCodeInsiders", "Visual Studio Code Insiders"),
        ("com.visualstudio.code.oss", "VS Code (OSS)"),
        ("com.vscodium", "VSCodium"),
        ("com.todesktop.230313mzl4w4u92", "Cursor"),
        ("com.exafunction.windsurf", "Windsurf"),
        ("dev.zed.Zed", "Zed"),
        ("dev.zed.Zed-Preview", "Zed Preview"),
        ("com.apple.dt.Xcode", "Xcode"),
        ("com.jetbrains.*", "JetBrains IDEs"),
        ("com.google.android.studio", "Android Studio"),
        ("com.sublimetext.*", "Sublime Text"),
        ("com.panic.Nova", "Nova"),
        ("com.github.atom", "Atom"),
        ("org.vim.MacVim", "MacVim"),
        ("com.qvacua.VimR", "VimR"),
    ] {
        v.push(default_entry(id, label, "editor", true));
    }
    for (id, label) in [("ai.opencode.desktop", "OpenCode"), ("com.openai.codex", "Codex")] {
        v.push(default_entry(id, label, "coding_agent", false));
    }
    v
}

impl Default for Blocklist {
    fn default() -> Self {
        Blocklist { version: 1, apps: defaults() }
    }
}

fn pattern_matches(pattern: &str, app_id: &str) -> bool {
    let (p, a) = (pattern.to_lowercase(), app_id.to_lowercase());
    match p.strip_suffix('*') {
        Some(prefix) => a.starts_with(prefix),
        None => p == a,
    }
}

fn valid_id(app_id: &str) -> bool {
    let body = app_id.strip_suffix('*').unwrap_or(app_id);
    !body.is_empty() && body.len() <= 200 && body.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

impl Blocklist {
    pub fn path(state: &Path) -> PathBuf {
        state.join(FILE_NAME)
    }

    /// Reads the file; a missing file is the defaults (and is not written until something changes).
    /// An unreadable or corrupt file is an error, not an empty list: failing open would silently
    /// start saving terminals.
    pub fn load(state: &Path) -> Result<Self> {
        let path = Self::path(state);
        if !path.exists() {
            return Ok(Self::default());
        }
        let text = fs::read_to_string(&path).with_context(|| format!("cannot read {}", path.display()))?;
        let list: Blocklist = serde_json::from_str(&text).with_context(|| format!("{} is not valid; fix or delete it", path.display()))?;
        Ok(list)
    }

    pub fn save(&self, state: &Path) -> Result<()> {
        let path = Self::path(state);
        let tmp = state.join(format!("{FILE_NAME}.tmp"));
        fs::write(&tmp, serde_json::to_string_pretty(self)? + "\n")?;
        fs::rename(&tmp, &path)?;
        Ok(())
    }

    pub fn is_blocked(&self, app_id: &str) -> bool {
        self.matching(app_id).is_some()
    }

    /// The enabled entry that blocks `app_id`, if any.
    pub fn matching(&self, app_id: &str) -> Option<&Entry> {
        self.apps.iter().find(|e| e.enabled && pattern_matches(&e.app_id, app_id))
    }

    /// Adds an app, or re-enables and relabels an existing entry with the same id.
    pub fn add(&mut self, app_id: &str, label: Option<&str>) -> Result<()> {
        if !valid_id(app_id) {
            bail!("'{app_id}' is not a bundle id (letters, digits, '.', '-', '_', optional trailing '*')");
        }
        if let Some(e) = self.apps.iter_mut().find(|e| e.app_id.eq_ignore_ascii_case(app_id)) {
            e.enabled = true;
            if let Some(l) = label {
                e.label = l.into();
            }
        } else {
            self.apps.push(Entry {
                app_id: app_id.into(),
                label: label.unwrap_or(app_id).into(),
                category: "custom".into(),
                origin: "user".into(),
                enabled: true,
            });
        }
        Ok(())
    }

    /// Default entries are switched off (so they stay listed and can be turned back on); user entries are deleted.
    pub fn remove(&mut self, app_id: &str) -> Result<()> {
        let Some(i) = self.apps.iter().position(|e| e.app_id.eq_ignore_ascii_case(app_id)) else {
            bail!("'{app_id}' is not in the list");
        };
        if self.apps[i].origin == "default" {
            self.apps[i].enabled = false;
        } else {
            self.apps.remove(i);
        }
        Ok(())
    }

    pub fn set_enabled(&mut self, app_id: &str, enabled: bool) -> Result<()> {
        match self.apps.iter_mut().find(|e| e.app_id.eq_ignore_ascii_case(app_id)) {
            Some(e) => {
                e.enabled = enabled;
                Ok(())
            }
            None => bail!("'{app_id}' is not in the list"),
        }
    }

    pub fn reset(&mut self) {
        *self = Self::default();
    }
}

/// Watches the file's modification time so the capture loop can pick up edits made by a UI or the CLI.
pub struct Watcher {
    state: PathBuf,
    mtime: Option<SystemTime>,
    pub list: Blocklist,
}

impl Watcher {
    pub fn new(state: &Path) -> Result<Self> {
        let list = Blocklist::load(state)?;
        let mtime = fs::metadata(Blocklist::path(state)).and_then(|m| m.modified()).ok();
        Ok(Watcher { state: state.to_path_buf(), mtime, list })
    }

    /// Returns true when the list was reloaded. A file that became unreadable keeps the previous list
    /// (and reports the error once through `Err`), so a half-written edit never opens the gate.
    pub fn refresh(&mut self) -> Result<bool> {
        let mtime = fs::metadata(Blocklist::path(&self.state)).and_then(|m| m.modified()).ok();
        if mtime == self.mtime {
            return Ok(false);
        }
        self.mtime = mtime;
        self.list = Blocklist::load(&self.state)?;
        Ok(true)
    }
}

pub fn run_cli(state: &Path, args: &[String]) -> Result<()> {
    let mut list = Blocklist::load(state)?;
    let word = args.first().map(String::as_str).unwrap_or("list");
    match word {
        "list" => {
            println!("{:<34} {:<9} {:<13} {:<8} {}", "app id", "blocking", "category", "origin", "label");
            for e in &list.apps {
                println!("{:<34} {:<9} {:<13} {:<8} {}", e.app_id, if e.enabled { "yes" } else { "no" }, e.category, e.origin, e.label);
            }
            println!("\nFile: {}{}", Blocklist::path(state).display(), if Blocklist::path(state).exists() { "" } else { " (not written yet; showing defaults)" });
            return Ok(());
        }
        "check" => {
            let id = args.get(1).context("usage: blocklist check <app id>")?;
            match list.matching(id) {
                Some(e) => println!("{id}: blocked by '{}' ({})", e.app_id, e.label),
                None => println!("{id}: not blocked"),
            }
            return Ok(());
        }
        "add" => list.add(args.get(1).context("usage: blocklist add <app id> [label]")?, args.get(2).map(String::as_str))?,
        "remove" => list.remove(args.get(1).context("usage: blocklist remove <app id>")?)?,
        "enable" => list.set_enabled(args.get(1).context("usage: blocklist enable <app id>")?, true)?,
        "disable" => list.set_enabled(args.get(1).context("usage: blocklist disable <app id>")?, false)?,
        "reset" => list.reset(),
        "purge" => {
            let apply = args.iter().any(|a| a == "--yes");
            if let Some(bad) = args[1..].iter().find(|a| *a != "--yes") {
                bail!("unknown purge option '{bad}' (only --yes)");
            }
            return purge(state, &list, apply);
        }
        other => bail!("unknown blocklist command '{other}' (list, check, add, remove, enable, disable, reset, purge)"),
    }
    list.save(state)?;
    println!("saved {}", Blocklist::path(state).display());
    Ok(())
}

/// Deletes already-saved snapshots of blocked apps (SQLite rows, derived points that only they supported,
/// then rebuilds the Qdrant index from SQLite, which also drops their points and the WAL).
/// Without `apply` it only reports what would go. Old backups in the state directory
/// (`memory.pre-clean-*.sqlite3`) are not touched.
fn purge(state: &Path, list: &Blocklist, apply: bool) -> Result<()> {
    if UnixStream::connect(state.join("capture.sock")).is_ok() {
        bail!("stop the capture process before purging");
    }
    let mut db = super::open_db(state)?;
    let apps: Vec<String> = {
        let mut stmt = db.prepare("SELECT DISTINCT app_id FROM snapshots ORDER BY app_id")?;
        let found = stmt.query_map([], |r| r.get::<_, String>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
        found
    };
    let blocked: Vec<&String> = apps.iter().filter(|a| list.is_blocked(a)).collect();
    if blocked.is_empty() {
        println!("Nothing to purge: no saved snapshot belongs to a blocked app.");
        return Ok(());
    }
    let (mut snaps, mut sightings, mut chunks, mut bytes) = (0_i64, 0_i64, 0_i64, 0_i64);
    println!("{:<34} {:>9} {:>10} {:>8} {:>10}", "blocked app with saved data", "snapshots", "sightings", "chunks", "raw MB");
    for app in &blocked {
        let one = |sql: &str| -> Result<i64> { Ok(db.query_row(sql, [app], |r| r.get(0))?) };
        let s = one("SELECT COUNT(*) FROM snapshots WHERE app_id=?1")?;
        let o = one("SELECT COUNT(*) FROM observations WHERE snapshot_id IN (SELECT id FROM snapshots WHERE app_id=?1)")?;
        let c = one("SELECT COUNT(*) FROM chunks WHERE snapshot_id IN (SELECT id FROM snapshots WHERE app_id=?1)")?;
        let b = one("SELECT COALESCE(SUM(LENGTH(CAST(ax_nodes_json AS BLOB))),0) + COALESCE((SELECT SUM(LENGTH(CAST(ax_nodes_json AS BLOB))) FROM raw_versions WHERE snapshot_id IN (SELECT id FROM snapshots WHERE app_id=?1)),0) FROM snapshots WHERE app_id=?1")?;
        println!("{:<34} {:>9} {:>10} {:>8} {:>10.1}", app, s, o, c, b as f64 / 1e6);
        snaps += s; sightings += o; chunks += c; bytes += b;
    }
    println!("{:<34} {:>9} {:>10} {:>8} {:>10.1}", "total", snaps, sightings, chunks, bytes as f64 / 1e6);
    if !apply {
        println!("\nNothing deleted. Run `rewind blocklist purge --yes` to delete these snapshots for good.");
        return Ok(());
    }
    let tx = db.transaction()?;
    let derived_touched: Vec<i64> = {
        let mut stmt = tx.prepare("SELECT DISTINCT derived_id FROM derived_sources WHERE snapshot_id IN (SELECT id FROM snapshots WHERE app_id=?1)")?;
        let mut all = Vec::new();
        for app in &blocked {
            let ids = stmt.query_map([app], |r| r.get::<_, i64>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;
            all.extend(ids);
        }
        all
    };
    for app in &blocked {
        for table in ["observations", "raw_versions", "chunks", "derived_sources"] {
            tx.execute(&format!("DELETE FROM {table} WHERE snapshot_id IN (SELECT id FROM snapshots WHERE app_id=?1)"), [app])?;
        }
        tx.execute("DELETE FROM snapshots WHERE app_id=?1", [app])?;
    }
    let mut derived_gone = 0;
    for id in derived_touched {
        derived_gone += tx.execute("DELETE FROM derived WHERE id=?1 AND NOT EXISTS (SELECT 1 FROM derived_sources WHERE derived_id=?1)", [id])?;
    }
    tx.commit()?;
    db.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;")?;
    drop(db);
    let mut runtime = super::open_runtime(state, true)?;
    let mut points = 0;
    loop {
        let n = runtime.index_pending()?;
        points += n;
        if n == 0 {
            break;
        }
    }
    println!("\nDeleted {snaps} snapshots, {chunks} chunks, {derived_gone} derived points. Rebuilt the vector index from what is left (reindexed {points} points after opening).");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("om-blocklist-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn terminals_and_editors_are_blocked_by_default_but_life_apps_are_not() {
        let l = Blocklist::default();
        for id in ["com.apple.Terminal", "dev.warp.Warp-Stable", "com.googlecode.iterm2", "com.microsoft.VSCode", "com.apple.dt.Xcode", "com.jetbrains.intellij", "com.jetbrains.pycharm.ce"] {
            assert!(l.is_blocked(id), "{id} should be blocked");
        }
        for id in ["com.google.Chrome", "com.apple.Safari", "com.tinyspeck.slackmacgap", "com.apple.mail", "net.whatsapp.WhatsApp", "com.anthropic.claudefordesktop", "com.openai.chat"] {
            assert!(!l.is_blocked(id), "{id} must not be blocked");
        }
    }

    #[test]
    fn coding_agents_are_listed_but_off_until_enabled() {
        let mut l = Blocklist::default();
        assert!(!l.is_blocked("ai.opencode.desktop"));
        l.set_enabled("ai.opencode.desktop", true).unwrap();
        assert!(l.is_blocked("ai.opencode.desktop"));
    }

    #[test]
    fn matching_ignores_case_and_supports_prefix() {
        let mut l = Blocklist { version: 1, apps: vec![] };
        l.add("Com.Example.Tool", None).unwrap();
        l.add("com.vendor.*", Some("Vendor apps")).unwrap();
        assert!(l.is_blocked("com.example.tool"));
        assert!(l.is_blocked("com.vendor.anything.else"));
        assert!(!l.is_blocked("com.vendor"));
        assert!(!l.is_blocked("com.example.tool2"));
    }

    #[test]
    fn removing_a_default_turns_it_off_and_removing_a_user_entry_deletes_it() {
        let mut l = Blocklist::default();
        l.remove("com.apple.Terminal").unwrap();
        assert!(!l.is_blocked("com.apple.Terminal"));
        assert!(l.apps.iter().any(|e| e.app_id == "com.apple.Terminal" && !e.enabled));
        l.add("com.my.app", None).unwrap();
        l.remove("com.my.app").unwrap();
        assert!(!l.apps.iter().any(|e| e.app_id == "com.my.app"));
        assert!(l.remove("com.not.there").is_err());
    }

    #[test]
    fn adding_validates_the_id() {
        let mut l = Blocklist::default();
        for bad in ["", "*", "has space", "a/b", "../x"] {
            assert!(l.add(bad, None).is_err(), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn file_round_trip_and_missing_file_means_defaults() {
        let d = tmp("rt");
        assert_eq!(Blocklist::load(&d).unwrap(), Blocklist::default());
        let mut l = Blocklist::default();
        l.add("com.my.app", Some("My app")).unwrap();
        l.save(&d).unwrap();
        assert_eq!(Blocklist::load(&d).unwrap(), l);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn a_corrupt_file_is_an_error_not_an_empty_list() {
        let d = tmp("bad");
        fs::write(Blocklist::path(&d), "{ not json").unwrap();
        assert!(Blocklist::load(&d).is_err());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn watcher_picks_up_edits_and_keeps_the_old_list_on_a_bad_edit() {
        let d = tmp("watch");
        let mut w = Watcher::new(&d).unwrap();
        assert!(w.list.is_blocked("com.apple.Terminal"));
        assert!(!w.refresh().unwrap());
        let mut l = Blocklist::default();
        l.add("com.my.app", None).unwrap();
        l.save(&d).unwrap();
        assert!(w.refresh().unwrap());
        assert!(w.list.is_blocked("com.my.app"));
        std::thread::sleep(std::time::Duration::from_millis(20));
        fs::write(Blocklist::path(&d), "{ broken").unwrap();
        assert!(w.refresh().is_err());
        assert!(w.list.is_blocked("com.my.app"), "old list stays in force");
        let _ = fs::remove_dir_all(&d);
    }
}
