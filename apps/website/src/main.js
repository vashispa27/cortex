import { advanceClock, isInViewport } from "./animation-clock.js";
const examples = [
  {
    question: "What time did Abhinav suggest for our call on LinkedIn?",
    answer:
      "Thursday at 2 PM, for 30 minutes. Abhinav suggested a quick call about the project.",
    label: "LinkedIn · Message from Abhinav",
    who: "Abhinav · Yesterday",
    quote:
      "“Are you free Thursday at 2 PM to talk about the project? A quick 30-minute call.”",
    app: "LinkedIn · Messages",
    icon: "in",
    meta: "ABHINAV · YESTERDAY",
    title: "Let’s catch up.",
    body: "Are you free Thursday at 2 PM to talk about the project? A quick 30-minute call.",
    chip: "Meeting details, remembered",
    processing: "Finding the conversation",
    name: "Recall a conversation",
  },
  {
    question: "Do I have any meetings today?",
    answer:
      "You saw an invitation for a design review at 11 AM today. That’s the meeting in your captured context; your live calendar hasn’t been checked.",
    label: "Seen invitation · Design review",
    who: "Meeting invitation · Seen this morning",
    quote:
      "“Design review · Today, 11:00–11:30 AM. Agenda: review the new onboarding flow.”",
    app: "Mail · Meeting invitation",
    icon: "◷",
    meta: "TODAY · 11:00 AM",
    title: "Design review",
    body: "11:00–11:30 AM. Review the new onboarding flow with the team.",
    chip: "From a seen invitation",
    processing: "Looking through today’s context",
    name: "Plan your day",
  },
  {
    question: "Remind me tomorrow at 9 AM to send Abhinav the project notes.",
    answer:
      "Reminder set for tomorrow at 9 AM: send Abhinav the project notes.",
    label: "✓ Scheduled reminder · Tomorrow, 9 AM",
    who: "Cortex · Reminders",
    quote:
      "Tomorrow · 9:00 AM · Send Abhinav the project notes. This demo does not create a real reminder.",
    app: "Cortex · Reminders",
    icon: "✓",
    meta: "TOMORROW · 9:00 AM",
    title: "One less loose end.",
    body: "Send Abhinav the project notes.",
    chip: "Reminder scheduled",
    processing: "Setting your reminder",
    name: "Set a reminder",
  },
  {
    question: "Remember this: I prefer meetings after 11 AM.",
    answer:
      "Saved to permanent memory: you prefer meetings after 11 AM. You can edit or remove this memory whenever you like.",
    label: "✓ Saved · Permanent memory",
    who: "Cortex · Permanent memory",
    quote:
      "Meeting preference: after 11 AM. Saved explicitly by you. This illustration does not save a real memory.",
    app: "Cortex · Permanent memory",
    icon: "∞",
    meta: "SAVED BY YOU · KEPT FOR LATER",
    title: "Worth remembering.",
    body: "I prefer meetings after 11 AM.",
    chip: "Saved to permanent memory",
    processing: "Saving to permanent memory",
    name: "Permanent memory",
  },
];
const $ = (selector) => document.querySelector(selector);
const tabs = [...document.querySelectorAll("[data-example]")];
const stages = [...document.querySelectorAll("[data-animation]")];
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
const states = Object.fromEntries(
  stages.map((stage) => [
    stage.dataset.animation,
    { stage, elapsed: 0, visible: false, paused: motion.matches },
  ]),
);
const DEMO_TIMING = {
  typing: 2000,
  processing: 2900,
  answer: 1400,
  total: 5300,
};
const MEMORY_STEP_MS = 1300;
const MEMORY_DURATION_MS = MEMORY_STEP_MS * 4;
let selected = 0;
let memoryExample = 0;
let lastPhase = "";
let lastMemory = -1;
let lastAgent = -1;
const sourceButton = $("#source-toggle");
const sourceDetail = $("#source-detail");
function setText(selector, text) {
  if ($(selector).textContent !== text) $(selector).textContent = text;
}
function select(index, focus = false) {
  selected = index;
  states.demo.elapsed = 0;
  states.demo.manual = true;
  states.demo.paused = motion.matches;
  updatePauseUI();
  lastPhase = "";
  const example = examples[index];
  tabs.forEach((tab, i) => {
    tab.setAttribute("aria-selected", String(i === index));
    tab.tabIndex = i === index ? 0 : -1;
  });
  $("#demo-answer").setAttribute("aria-labelledby", tabs[index].id);
  states.demo.stage.dataset.example = String(index);
  setText("#context-app", example.app);
  setText("#context-icon", example.icon);
  setText("#context-meta", example.meta);
  setText("#context-title", example.title);
  setText("#context-body", example.body);
  setText("#context-chip", example.chip);
  setText("#processing-label", example.processing);
  sourceButton.textContent = `↗ ${example.label}`;
  sourceButton.setAttribute("aria-expanded", "false");
  sourceDetail.hidden = true;
  setText("#source-who", example.who);
  setText("#source-quote", example.quote);
  setText(
    "#demo-status",
    `0${index + 1} / ${String(examples.length).padStart(2, "0")} · ${example.name}`,
  );
  renderDemo();
  if (focus) tabs[index].focus();
}
function renderDemo() {
  const elapsed = states.demo.elapsed;
  const example = examples[selected];
  const staticMode = motion.matches;
  const phase =
    staticMode || elapsed >= DEMO_TIMING.processing
      ? "answer"
      : elapsed >= DEMO_TIMING.typing
        ? "processing"
        : "typing";
  if (phase !== lastPhase) {
    $(".cortex-demo").dataset.phase = phase;
    lastPhase = phase;
  }
  setText(
    "#demo-question",
    phase === "typing"
      ? example.question.slice(
          0,
          Math.floor((example.question.length * elapsed) / DEMO_TIMING.typing),
        )
      : example.question,
  );
  setText(
    "#answer-text",
    staticMode
      ? example.answer
      : example.answer.slice(
          0,
          Math.max(
            0,
            Math.floor(
              (example.answer.length * (elapsed - DEMO_TIMING.processing)) /
                DEMO_TIMING.answer,
            ),
          ),
        ),
  );
  states.demo.stage.style.setProperty(
    "--progress",
    `${Math.min(100, (elapsed / DEMO_TIMING.total) * 100)}%`,
  );
}
const memoryExamples = [
  {
    app: "Messages",
    person: "ABHINAV",
    message: "Can you send me the project notes tomorrow morning?",
    reply: "Of course. I'll send them over.",
    question: "What did Abhinav ask me to send?",
    answer: "The project notes, tomorrow morning.",
    source: "Messages · Abhinav",
    task: "Send Abhinav the project notes",
    time: "Tomorrow · 9:00 AM",
  },
  {
    app: "Mail",
    person: "DESIGN TEAM",
    message:
      "Design review is today at 11 AM. Please share the updated mockups afterward.",
    reply: "Invitation seen · Today, 8:42 AM",
    question: "Did I miss any meetings?",
    answer: "You saw a design review invitation for 11 AM today.",
    source: "Mail · Design review invitation",
    task: "Share the updated mockups",
    time: "Today · After the review",
  },
  {
    app: "Mail",
    person: "PROJECT UPDATE",
    message: "The launch brief is ready. Could you review it before Friday?",
    reply: "Launch brief.pdf · Read this morning",
    question: "What was that email about?",
    answer: "The launch brief is ready, with a review requested before Friday.",
    source: "Mail · Project update",
    task: "Review the launch brief",
    time: "Thursday · 10:00 AM",
  },
  {
    app: "Safari · Project docs",
    person: "WEBSITE / NEXT STEPS",
    message:
      "The hero is ready. Next: connect the interactive demo, then check the mobile layout.",
    reply: "Project notes · Last edited this afternoon",
    question: "Where did I leave off on the website?",
    answer: "The hero is done. The demo and mobile layout are next.",
    source: "Safari · Project notes",
    task: "Connect the demo and check mobile",
    time: "Next work session",
  },
];
const memoryCaptions = [
  "01 · Capture the conversation, with your permission.",
  "02 · Ask a question. Get the context back.",
  "03 · A useful next step, suggested from the conversation.",
  "04 · With an automation rule enabled, schedule the follow-up.",
];
function renderMemory() {
  const step = Math.min(3, Math.floor(states.memory.elapsed / MEMORY_STEP_MS));
  const key = memoryExample * 4 + step;
  if (key === lastMemory) return;
  lastMemory = key;
  const item = memoryExamples[memoryExample];
  states.memory.stage.dataset.step = String(step);
  states.memory.stage.dataset.example = String(memoryExample);
  document
    .querySelectorAll("[data-memory-example]")
    .forEach((button, index) => {
      button.setAttribute("aria-pressed", String(index === memoryExample));
    });
  setText("#capture-app", item.app);
  setText("#capture-count", `SCREEN 0${memoryExample + 1} / 04`);
  setText("#capture-person", item.person);
  setText("#capture-message", item.message);
  setText("#capture-reply", item.reply);
  setText("#memory-question", item.question);
  setText("#memory-answer", item.answer);
  setText("#memory-source", `↗ ${item.source}`);
  setText("#suggested-title", item.task);
  setText("#suggested-time", item.time);
  setText(
    "#suggestion-status",
    step === 3 ? "✓ Auto-scheduled · example" : "Suggested task",
  );
  setText("#flow-caption", memoryCaptions[step]);
}
const taskSteps = [
  {
    active: "codex",
    owner: "⌘ Codex · saved",
    handoff: "Hero finished. Next: connect the demo and check mobile.",
    event: "Codex hits a credit limit and saves a handoff to Cortex.",
    command: "Save my progress. I’m out of credits.",
    status: "Progress saved",
    column: 0,
  },
  {
    active: "claude",
    owner: "Unclaimed · ready to resume",
    handoff: "Goal, decisions, artifacts, and next steps are ready to read.",
    event:
      "Claude asks Cortex for unfinished tasks and reads the saved context.",
    command: "What tasks can I pick up?",
    status: "Reading shared task memory",
    column: 0,
  },
  {
    active: "claude",
    owner: "✳ Claude · in progress",
    handoff: "Resumed from Codex. Connecting the demo, then checking mobile.",
    event: "Claude claims the task and continues where Codex left off.",
    command: "Pick up CX–024 using the handoff.",
    status: "Continuing Codex’s work",
    column: 1,
  },
  {
    active: "claude",
    owner: "✳ Claude · updated",
    handoff: "Demo connected. Mobile layout checked. Ready for review.",
    event:
      "Claude updates the task. Every connected harness can read the progress.",
    command: "Update CX–024: demo and mobile are ready.",
    status: "Progress shared with Cortex",
    column: 1,
  },
  {
    active: "opencode",
    owner: "◈ OpenCode · review",
    handoff: "Reading the latest changes and checking the final result.",
    event: "OpenCode reads the latest task context and picks up the review.",
    command: "What changed? I’ll take the review.",
    status: "Reading Claude’s update",
    column: 1,
  },
  {
    active: "opencode",
    owner: "✓ OpenCode · complete",
    handoff:
      "Review passed. Work, artifacts, and the full handoff history saved.",
    event: "OpenCode completes the task. The context stays in Cortex.",
    command: "Mark CX–024 complete. Review passed.",
    status: "Outcome saved",
    column: 2,
  },
];
function renderAgents() {
  const step = Math.min(5, Math.floor(states.agents.elapsed / 3000));
  if (step === lastAgent) return;
  lastAgent = step;
  const item = taskSteps[step];
  if (step === 0) {
    setText("#command-codex", "Save my progress. I’m out of credits.");
    setText("#command-claude", "What tasks can I pick up?");
    setText("#command-opencode", "What changed on the landing page?");
    setText("#status-claude", "Connected to Cortex");
    setText("#status-opencode", "Connected to Cortex");
  }
  states.agents.stage.dataset.step = String(step);
  states.agents.stage.dataset.active = item.active;
  states.agents.stage.style.setProperty("--task-column", item.column);
  setText("#task-owner", item.owner);
  setText("#handoff-text", item.handoff);
  setText("#board-event", item.event);
  setText(`#command-${item.active}`, item.command);
  setText(`#status-${item.active}`, item.status);
  setText("#mini-board-count", step === 5 ? "Task complete" : "1 shared task");
}
function updatePauseUI() {
  document.querySelectorAll("[data-pause]").forEach((button) => {
    const state = states[button.dataset.pause];
    button.setAttribute("aria-pressed", String(state.paused));
    button.textContent = state.paused ? "Play animation" : "Pause animation";
    state.stage.classList.toggle("is-paused", state.paused);
  });
}
document.querySelectorAll("[data-pause]").forEach((button) =>
  button.addEventListener("click", () => {
    const state = states[button.dataset.pause];
    state.paused = !state.paused;
    updatePauseUI();
  }),
);
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => select(index));
  tab.addEventListener("keydown", (event) => {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : null;
    if (next !== null) {
      event.preventDefault();
      select(next, true);
    }
  });
});
sourceButton.addEventListener("click", () => {
  const expanded = sourceButton.getAttribute("aria-expanded") === "true";
  sourceButton.setAttribute("aria-expanded", String(!expanded));
  sourceDetail.hidden = expanded;
  // Let people read the evidence without the carousel replacing it.
  if (!expanded) {
    states.demo.paused = true;
    updatePauseUI();
  }
});
document.querySelectorAll("[data-memory-example]").forEach((button) =>
  button.addEventListener("click", () => {
    memoryExample = Number(button.dataset.memoryExample);
    states.memory.elapsed = 0;
    states.memory.paused = motion.matches;
    lastMemory = -1;
    renderMemory();
    updatePauseUI();
  }),
);
let previousTime = performance.now();
setInterval(() => {
  const now = performance.now();
  const delta = now - previousTime;
  previousTime = now;
  if (document.hidden) return;
  for (const [name, state] of Object.entries(states)) {
    state.visible = isInViewport(
      state.stage.getBoundingClientRect(),
      window.innerHeight,
    );
    state.stage.classList.toggle("offscreen", !state.visible);
    if (state.paused || (!state.visible && !(name === "demo" && state.manual)))
      continue;
    const duration =
      name === "demo"
        ? DEMO_TIMING.total
        : name === "memory"
          ? MEMORY_DURATION_MS
          : 18000;
    const next = advanceClock(state.elapsed, delta, duration);
    if (name === "demo" && next.cycles) {
      select((selected + next.cycles) % examples.length);
      state.manual = false;
    }
    if (name === "memory" && next.cycles)
      memoryExample = (memoryExample + next.cycles) % memoryExamples.length;
    state.elapsed = next.elapsed;
  }
  renderDemo();
  renderMemory();
  renderAgents();
}, 50);
document.addEventListener("visibilitychange", () => {
  previousTime = performance.now();
});
motion.addEventListener("change", () => {
  Object.values(states).forEach((state) => {
    state.paused = motion.matches;
  });
  updatePauseUI();
  renderDemo();
});
select(0);
renderMemory();
renderAgents();
updatePauseUI();
