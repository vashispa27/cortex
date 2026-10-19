import { describe, expect, it } from "vitest";
import { applyFailureMessage, assistChip, composeHint, originLabel, type FocusContext } from "./assist";

const context = (over: Partial<FocusContext> = {}): FocusContext => ({
  status: "ok", app_id: "com.tinyspeck.slackmacgap", app_name: "Slack", window_title: "Priya (DM)", source_type: "app", role: "AXTextArea",
  editable: true, multiline: true, text_before_caret: "", text_after_caret: "", selected_text: "", conversation_tail: "", recipient_hint: "Priya", ...over,
});

describe("assist labels", () => {
  it("says who a completion is for, or nothing when unknown", () => {
    expect(assistChip(context(), "autocomplete")).toBe("Completing for Priya…");
    expect(assistChip(context({ recipient_hint: null }), "autocomplete")).toBe("Completing…");
    expect(assistChip(context(), "rewrite")).toBe("Rewriting for Priya");
  });

  it("labels the source of a selection with the app and site", () => {
    expect(originLabel(context({ app_name: "Safari", url: "https://www.nytimes.com/2026/story" }))).toBe("Safari · nytimes.com");
    expect(originLabel(context({ app_name: "Preview", url: null }))).toBe("Preview");
  });

  it("explains why a field could not be read, only for reasons the user can act on", () => {
    expect(composeHint("secure_field")).toMatch(/Can't read this field/);
    expect(composeHint("accessibility_not_granted")).toMatch(/Accessibility/);
    expect(composeHint("own_window")).toBeNull();
    expect(composeHint(null)).toBeNull();
  });

  it("explains a refused write without implying anything was changed", () => {
    expect(applyFailureMessage({ outcome: "panel", code: "TARGET_STALE", reason: "x" }, "rewrite")).toMatch(/selection changed/);
    expect(applyFailureMessage({ outcome: "panel", code: "TARGET_STALE", reason: "x" }, "autocomplete")).toMatch(/did not insert/);
    expect(applyFailureMessage({ outcome: "panel", code: "TARGET_UNSUPPORTED", reason: "x" }, "rewrite")).toMatch(/Couldn't replace/);
    expect(applyFailureMessage({ outcome: "recovery", reason: "x" }, "autocomplete")).toMatch(/could not confirm/);
    expect(applyFailureMessage({ outcome: "applied", undo: null }, "autocomplete")).toBe("");
  });
});
