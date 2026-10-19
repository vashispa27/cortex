use rewind_contracts::{EditDraft,ErrorCode,Selection,TargetRevision};
use serde::{Deserialize,Serialize};
use sha2::{Digest,Sha256};

#[derive(Clone, Debug)]
pub struct EditableState {
    pub revision: TargetRevision,
    pub text: String,
    pub writable: bool,
    pub secure: bool,
    pub plain_text: bool,
    pub exact_range_write: bool,
}

pub trait NativeEditor {
    /// Reads the current field immediately before an edit or verification.
    fn read_target(&mut self, target: &TargetRevision) -> Result<Option<EditableState>,String>;
    /// Uses a provider-supported exact-range write. It must never press Return.
    fn replace_selection(&mut self, target: &TargetRevision, selection: &Selection, replacement: &str) -> Result<(),String>;
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EditOutcome {
    Applied,
    ResultInPanel { code: ErrorCode, reason: String },
    Recovery { reason: String },
}

pub fn classify_operation(text: &str, selection: &Selection) -> rewind_contracts::EditOperation {
    use rewind_contracts::EditOperation;
    if selection.start < selection.end { EditOperation::RewriteSelection }
    else if text.trim_start().starts_with("/g") { EditOperation::DirectAnswer }
    else if text.trim().is_empty() { EditOperation::DraftResponse }
    else { EditOperation::InterpretInstruction }
}

/// Best-effort validation around a native provider call. No cross-process compare-and-swap is claimed.
pub fn apply_guarded<E: NativeEditor>(editor: &mut E, draft: &EditDraft, active_request_id: &str, current_epoch: i64, cancelled: bool) -> EditOutcome {
    if cancelled || draft.request_id != active_request_id || draft.memory_epoch != current_epoch {
        return EditOutcome::ResultInPanel { code: ErrorCode::Cancelled, reason: "Request is no longer current".into() };
    }
    let before = match editor.read_target(&draft.target) {
        Ok(Some(x)) => x,
        Ok(None) => return panel(ErrorCode::TargetStale,"Target disappeared"),
        Err(_) => return panel(ErrorCode::TargetUnsupported,"Target could not be read"),
    };
    if before.secure || !before.writable || !before.plain_text || !before.exact_range_write {
        return panel(ErrorCode::TargetUnsupported,"Exact plain-text range write unavailable");
    }
    if !same_revision(&before.revision,&draft.target) || hash(&before.text) != draft.target.field_text_hash {
        return panel(ErrorCode::TargetStale,"Target or field changed");
    }
    let selected = match slice_utf16(&before.text,&draft.target.selection) {
        Some(x) => x,
        None => return panel(ErrorCode::TargetStale,"Selection is not on UTF-16 character boundaries"),
    };
    if hash(selected) != draft.target.selected_text_hash {
        return panel(ErrorCode::TargetStale,"Selection changed");
    }
    let expected = match replace_utf16(&before.text,&draft.target.selection,&draft.replacement) {
        Some(x) => x,
        None => return panel(ErrorCode::TargetStale,"Selection is invalid"),
    };
    if editor.replace_selection(&draft.target,&draft.target.selection,&draft.replacement).is_err() {
        return EditOutcome::Recovery { reason: "Provider write failed; field state must be checked before retry".into() };
    }
    match editor.read_target(&draft.target) {
        Ok(Some(after)) if after.text == expected => EditOutcome::Applied,
        _ => EditOutcome::Recovery { reason: "Insertion could not be verified; copy the draft from the panel".into() },
    }
}

/// Everything needed to remove exactly one insertion, as long as nothing else changed since.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct UndoToken {
    /// The field as it stood right after the write, with the caret at the end of the inserted text.
    pub target: TargetRevision,
    /// Hash of the field text before the write; the undo must reproduce it.
    pub before_text_hash: String,
    /// UTF-16 offset of the inserted text.
    pub start: usize,
    /// UTF-16 length of the inserted text.
    pub inserted_len: usize,
    /// Text the write replaced (empty for a plain insertion).
    pub restore: String,
}

/// Builds the undo record after a verified write. `None` when the caret is not where an insertion
/// would leave it, in which case the user falls back to the app's own undo.
pub fn undo_token(before: &EditableState, after: &EditableState, selection: &Selection, replacement: &str) -> Option<UndoToken> {
    let inserted_len: usize = replacement.chars().map(char::len_utf16).sum();
    let end = selection.start + inserted_len;
    if inserted_len == 0 || after.revision.selection != (Selection { start: end, end }) { return None; }
    Some(UndoToken {
        target: after.revision.clone(),
        before_text_hash: hash(&before.text),
        start: selection.start,
        inserted_len,
        restore: slice_utf16(&before.text, selection)?.to_owned(),
    })
}

/// Removes the inserted span if and only if the field is exactly as the write left it.
pub fn undo_guarded<E: NativeEditor>(editor: &mut E, token: &UndoToken) -> EditOutcome {
    let current = match editor.read_target(&token.target) {
        Ok(Some(x)) => x,
        Ok(None) => return panel(ErrorCode::TargetStale,"Target disappeared"),
        Err(_) => return panel(ErrorCode::TargetUnsupported,"Target could not be read"),
    };
    if current.secure || !current.writable || !current.plain_text || !current.exact_range_write {
        return panel(ErrorCode::TargetUnsupported,"Exact plain-text range write unavailable");
    }
    let mut expected = token.target.clone();
    expected.captured_at_ms = current.revision.captured_at_ms;
    if !same_revision(&current.revision,&expected) || hash(&current.text) != token.target.field_text_hash {
        return panel(ErrorCode::TargetStale,"Target changed since the insertion");
    }
    let span = Selection { start: token.start, end: token.start + token.inserted_len };
    if slice_utf16(&current.text,&span).is_none() { return panel(ErrorCode::TargetStale,"Inserted text is no longer there"); }
    let Some(restored) = replace_utf16(&current.text,&span,&token.restore) else { return panel(ErrorCode::TargetStale,"Inserted text is no longer there") };
    if hash(&restored) != token.before_text_hash { return panel(ErrorCode::TargetStale,"Target changed since the insertion"); }
    if editor.replace_selection(&token.target,&span,&token.restore).is_err() {
        return EditOutcome::Recovery { reason: "Provider write failed; field state must be checked before retry".into() };
    }
    match editor.read_target(&token.target) {
        Ok(Some(after)) if after.text == restored => EditOutcome::Applied,
        _ => EditOutcome::Recovery { reason: "Undo could not be verified; use the app's own undo".into() },
    }
}

fn panel(code: ErrorCode, reason: &str) -> EditOutcome {
    EditOutcome::ResultInPanel { code, reason: reason.into() }
}

fn same_revision(a: &TargetRevision, b: &TargetRevision) -> bool {
    a.app_id == b.app_id && a.process_id == b.process_id &&
    a.process_started_at_ms == b.process_started_at_ms &&
    a.window_session_id == b.window_session_id &&
    a.element_handle == b.element_handle &&
    a.element_fingerprint == b.element_fingerprint &&
    a.field_text_hash == b.field_text_hash && a.selection == b.selection &&
    a.selected_text_hash == b.selected_text_hash
}

pub fn same_target(a: &TargetRevision, b: &TargetRevision) -> bool { same_revision(a,b) }

pub fn hash(value: &str) -> String { hex::encode(Sha256::digest(value.as_bytes())) }

fn utf16_to_byte(text: &str, index: usize) -> Option<usize> {
    let mut position = 0;
    for (byte,c) in text.char_indices() {
        if position == index { return Some(byte); }
        position += c.len_utf16();
    }
    if position == index { Some(text.len()) } else { None }
}

fn slice_utf16<'a>(text: &'a str, selection: &Selection) -> Option<&'a str> {
    if selection.end < selection.start { return None; }
    Some(&text[utf16_to_byte(text,selection.start)?..utf16_to_byte(text,selection.end)?])
}

fn replace_utf16(text: &str, selection: &Selection, replacement: &str) -> Option<String> {
    let start = utf16_to_byte(text,selection.start)?;
    let end = utf16_to_byte(text,selection.end)?;
    if end < start { return None; }
    let mut out = String::with_capacity(text.len()+replacement.len());
    out.push_str(&text[..start]);
    out.push_str(replacement);
    out.push_str(&text[end..]);
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rewind_contracts::EditOperation;

    struct MockEditor { state: EditableState, writes: usize, mutate_after_write: bool }
    impl NativeEditor for MockEditor {
        fn read_target(&mut self, _target: &TargetRevision) -> Result<Option<EditableState>,String> { Ok(Some(self.state.clone())) }
        fn replace_selection(&mut self,_target:&TargetRevision,selection:&Selection,replacement:&str) -> Result<(),String> {
            self.writes += 1;
            self.state.text = replace_utf16(&self.state.text,selection,replacement).unwrap();
            if self.mutate_after_write { self.state.text.push('!'); }
            self.state.revision.field_text_hash = hash(&self.state.text);
            Ok(())
        }
    }
    fn fixture() -> (MockEditor,EditDraft) {
        let text = "Hi 👋 Alex";
        let selection = Selection { start: 3, end: 5 };
        let revision = TargetRevision { app_id: "example.mail".into(), process_id: 7, process_started_at_ms: 100, window_session_id: "w".into(), element_handle: "e".into(), element_fingerprint: "fp".into(), field_text_hash: hash(text), selection: selection.clone(), selected_text_hash: hash("👋"), captured_at_ms: 200 };
        let state = EditableState { revision: revision.clone(), text: text.into(), writable: true, secure: false, plain_text: true, exact_range_write: true };
        (MockEditor { state, writes: 0, mutate_after_write: false }, EditDraft { request_id: "r1".into(), target: revision, operation: EditOperation::RewriteSelection, replacement: "hello".into(), memory_epoch: 0 })
    }
    #[test]
    fn replaces_utf16_selection_and_verifies() {
        let (mut editor,draft) = fixture();
        assert_eq!(apply_guarded(&mut editor,&draft,"r1",0,false),EditOutcome::Applied);
        assert_eq!(editor.state.text,"Hi hello Alex");
        assert_eq!(editor.writes,1);
    }
    #[test]
    fn rejects_stale_secure_and_cancelled_without_writes() {
        let (mut editor,draft) = fixture();
        editor.state.text.push('!');
        assert!(matches!(apply_guarded(&mut editor,&draft,"r1",0,false),EditOutcome::ResultInPanel{code:ErrorCode::TargetStale,..}));
        assert_eq!(editor.writes,0);
        let (mut editor,draft) = fixture();
        editor.state.secure = true;
        assert!(matches!(apply_guarded(&mut editor,&draft,"r1",0,false),EditOutcome::ResultInPanel{code:ErrorCode::TargetUnsupported,..}));
        assert_eq!(editor.writes,0);
        let (mut editor,draft) = fixture();
        assert!(matches!(apply_guarded(&mut editor,&draft,"r1",0,true),EditOutcome::ResultInPanel{code:ErrorCode::Cancelled,..}));
        assert_eq!(editor.writes,0);
    }
    fn caret_fixture(text: &str, caret: usize) -> (MockEditor,EditDraft) {
        let (mut editor,mut draft) = fixture();
        editor.state.text = text.into();
        let revision = TargetRevision { field_text_hash: hash(text), selection: Selection{start:caret,end:caret}, selected_text_hash: hash(""), ..draft.target.clone() };
        editor.state.revision = revision.clone();
        draft.target = revision;
        draft.replacement = " by Thursday.".into();
        draft.operation = EditOperation::DraftResponse;
        (editor,draft)
    }
    impl MockEditor {
        fn place_caret(&mut self, caret: usize) {
            self.state.revision.selection = Selection{start:caret,end:caret};
        }
    }
    #[test]
    fn undo_removes_the_insertion_only_when_the_field_is_unchanged() {
        let (mut editor,draft) = caret_fixture("I can send the deck",19);
        let before = editor.state.clone();
        assert_eq!(apply_guarded(&mut editor,&draft,"r1",0,false),EditOutcome::Applied);
        assert_eq!(editor.state.text,"I can send the deck by Thursday.");
        editor.place_caret(19 + " by Thursday.".len());
        let after = editor.state.clone();
        let token = undo_token(&before,&after,&Selection{start:19,end:19},&draft.replacement).expect("caret is at the end of the insertion");
        assert_eq!(token.inserted_len,13);
        assert_eq!(undo_guarded(&mut editor,&token),EditOutcome::Applied);
        assert_eq!(editor.state.text,"I can send the deck");
    }
    #[test]
    fn undo_is_refused_after_further_typing_or_a_moved_caret() {
        let (mut editor,draft) = caret_fixture("I can send the deck",19);
        let before = editor.state.clone();
        apply_guarded(&mut editor,&draft,"r1",0,false);
        editor.place_caret(32);
        let token = undo_token(&before,&editor.state.clone(),&Selection{start:19,end:19},&draft.replacement).unwrap();
        let writes = editor.writes;
        editor.state.text.push('x');
        editor.state.revision.field_text_hash = hash(&editor.state.text);
        assert!(matches!(undo_guarded(&mut editor,&token),EditOutcome::ResultInPanel{code:ErrorCode::TargetStale,..}));
        assert_eq!(editor.writes,writes);
        let (mut editor,draft) = caret_fixture("I can send the deck",19);
        let before = editor.state.clone();
        apply_guarded(&mut editor,&draft,"r1",0,false);
        editor.place_caret(5);
        assert!(undo_token(&before,&editor.state.clone(),&Selection{start:19,end:19},&draft.replacement).is_none());
    }
    #[test]
    fn verification_failure_does_not_retry() {
        let (mut editor,draft) = fixture();
        editor.mutate_after_write = true;
        assert!(matches!(apply_guarded(&mut editor,&draft,"r1",0,false),EditOutcome::Recovery{..}));
        assert_eq!(editor.writes,1);
    }
}
