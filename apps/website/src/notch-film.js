import { DURATION, DESKTOP_SCENES, sceneAt } from "./notch-film-timeline.js";
const canvas = document.querySelector("#film"),
  c = canvas.getContext("2d");
const controls = {
  play: document.querySelector("#play"),
  restart: document.querySelector("#restart"),
  seek: document.querySelector("#seek"),
  time: document.querySelector("#time"),
  export: document.querySelector("#export"),
  voice: document.querySelector("#voice"),
};
const narration = document.querySelector("#narration");
narration.preload = "auto";
let audioContext, audioBus;
async function audioGraph() {
  if (!audioContext) {
    audioContext = new AudioContext();
    audioBus = audioContext.createMediaStreamDestination();
    const source = audioContext.createMediaElementSource(narration);
    source.connect(audioContext.destination);
    source.connect(audioBus);
  }
  await audioContext.resume();
  return audioBus.stream;
}
controls.voice.addEventListener("click", () => {
  narration.muted = !narration.muted;
  controls.voice.setAttribute("aria-pressed", String(!narration.muted));
  controls.voice.textContent = narration.muted ? "Voice off" : "Voice on";
});
const params = new URLSearchParams(location.search),
  capture = params.has("capture");
if (capture) document.body.classList.add("capture");
const colors = {
  ink: "#f3f5f8",
  muted: "#a4aab6",
  dim: "#7f90a7",
  blue: "#3488ff",
  cyan: "#8cc5ff",
  line: "#ffffff16",
  // The open notch uses the desktop app's light panel colors.
  panel: "#f0eef4f2",
  panelInk: "#243242",
  panelMuted: "#647585",
  eyebrow: "#287f9f",
  neon: "#4cddff",
  send: "#1769d6",
  green: "#5fd39a",
  amber: "#f2c46b",
};
const assets = {};
await Promise.all(
  Object.entries({
    brain: "/cortex-mark.svg",
    claude: "/logos/claude-color.svg",
    codex: "/logos/codex-color.svg",
    opencode: "/logos/opencode.svg",
  }).map(async ([name, url]) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    assets[name] = img;
  }),
);
const clamp = (v) => Math.max(0, Math.min(1, v));
const ease = (v) => {
  v = clamp(v);
  return 1 - (1 - v) ** 3;
};
const smooth = (v) => {
  v = clamp(v);
  return v * v * (3 - 2 * v);
};
const lerp = (a, b, p) => a + (b - a) * p;
const font = (size, weight) =>
  `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
function rect(x, y, w, h, r = 20, fill = "#192230", stroke = colors.line) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 1.5;
    c.stroke();
  }
}
function text(
  value,
  x,
  y,
  size = 30,
  color = colors.ink,
  weight = 400,
  align = "left",
) {
  c.font = font(size, weight);
  c.textAlign = align;
  c.textBaseline = "top";
  c.fillStyle = color;
  c.fillText(value, x, y);
}
function width(value, size, weight = 400) {
  c.font = font(size, weight);
  return c.measureText(value).width;
}
function lines(value, maxWidth, size, weight = 400) {
  c.font = font(size, weight);
  const rows = [];
  let row = "";
  for (const word of value.split(" ")) {
    const next = row ? `${row} ${word}` : word;
    if (c.measureText(next).width > maxWidth && row) {
      rows.push(row);
      row = word;
    } else row = next;
  }
  if (row) rows.push(row);
  return rows;
}
function wrap(
  value,
  x,
  y,
  maxWidth,
  size = 30,
  color = colors.ink,
  line = 1.5,
  weight = 400,
) {
  const rows = lines(value, maxWidth, size, weight);
  rows.forEach((row, i) => text(row, x, y + i * size * line, size, color, weight));
  return rows.length * size * line;
}
function image(name, x, y, size) {
  c.drawImage(assets[name], x, y, size, size);
}
function logo(name, x, y, size = 52) {
  const bg =
    name === "claude"
      ? "#d9775722"
      : name === "opencode"
        ? "#c4a3ff33"
        : "#8cc5ff20";
  rect(x, y, size, size, 13, bg);
  if (name === "opencode") {
    c.save();
    c.filter = "brightness(0) invert(1)";
    image(name, x + 10, y + 10, size - 20);
    c.restore();
  } else image(name, x + 10, y + 10, size - 20);
}
function label(value, x, y, color = colors.dim, size = 17) {
  text(value.toUpperCase(), x, y, size, color, 600);
}
function heading(a, b) {
  text(a, 120, 112, 63, colors.ink, 550);
  if (b) text(b, 120, 190, 63, colors.cyan, 500);
}
function pulse(x, y, t, color = colors.blue, size = 5) {
  c.beginPath();
  c.arc(x, y, size + Math.sin(t * 4) * 1.3, 0, Math.PI * 2);
  c.fillStyle = color;
  c.shadowColor = color;
  c.shadowBlur = 18;
  c.fill();
  c.shadowBlur = 0;
}
function signal(x1, y1, x2, y2, t) {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.strokeStyle = "#6caaff60";
  c.lineWidth = 2;
  c.stroke();
  const p = (((t % 1.6) + 1.6) % 1.6) / 1.6;
  pulse(x1 + (x2 - x1) * p, y1 + (y2 - y1) * p, t);
}
function brain(x, y, size, t, glow = 1) {
  c.save();
  c.shadowColor = "#3488ff";
  c.shadowBlur = (25 + 12 * Math.sin(t * 3)) * glow;
  image("brain", x, y, size);
  c.restore();
}
function dots(x, y, t, color = colors.cyan) {
  const alpha = c.globalAlpha;
  for (let i = 0; i < 3; i++) {
    c.globalAlpha = alpha * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 6 - i)));
    c.beginPath();
    c.arc(x + i * 14, y, 4, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
  }
  c.globalAlpha = alpha;
}
function typed(value, t, start, duration) {
  return value.slice(0, Math.floor(value.length * clamp((t - start) / duration)));
}
function fadeIn(t, start, duration = 0.35) {
  return ease((t - start) / duration);
}
function faded(alpha, draw) {
  if (alpha <= 0) return;
  c.save();
  c.globalAlpha *= alpha;
  draw();
  c.restore();
}
// Keyframed values: [[time, ...values]], eased between neighbours.
function track(frames, t) {
  if (t <= frames[0][0]) return frames[0].slice(1);
  for (let i = 1; i < frames.length; i++) {
    const [t1] = frames[i],
      [t0] = frames[i - 1];
    if (t < t1) {
      const p = smooth((t - t0) / (t1 - t0));
      return frames[i].slice(1).map((v, k) => lerp(frames[i - 1][k + 1], v, p));
    }
  }
  return frames.at(-1).slice(1);
}

// ---------- Story data (fictional) ----------
const QUESTION = "What did Priya ask about the launch?";
const ANSWER =
  "Priya asked to move the launch to Tuesday, Nov 12, so marketing gets one more week. She also wants the deck by Friday.";
const SOURCE = "Team chat · #launch · Priya Shah · 10:14 AM";
const FLAGS = [
  {
    title: "Send the launch deck to Priya",
    sub: "Due Friday · from Team chat",
    action: "Remind me",
    done: "Reminder set · Fri 9:00 AM",
    click: 28.8,
  },
  {
    title: "Confirm EU pricing for Sam",
    sub: "Today · from Mail",
    action: "Add task",
    done: "Added to shared tasks",
    click: 30.8,
  },
];

// ---------- Desktop ----------
const WINDOWS = {
  chat: { x: 50, y: 200, w: 540, h: 640, title: "Team chat — #launch" },
  doc: { x: 690, y: 340, w: 600, h: 470, title: "Docs — Launch plan" },
  mail: { x: 1270, y: 230, w: 570, h: 540, title: "Mail — Inbox" },
};
function focusAt(t) {
  if (t < 7) return "doc";
  if (t < 10) return "chat";
  if (t < 13) return "mail";
  if (t < 16) return "doc";
  return "chat";
}
function wallpaper() {
  const g = c.createLinearGradient(0, 0, 1920, 1080);
  g.addColorStop(0, "#14213d");
  g.addColorStop(0.55, "#0e1628");
  g.addColorStop(1, "#1d1433");
  c.fillStyle = g;
  c.fillRect(0, 0, 1920, 1080);
  const r = c.createRadialGradient(1500, 180, 0, 1500, 180, 1100);
  r.addColorStop(0, "#2d5fa055");
  r.addColorStop(1, "#0e162800");
  c.fillStyle = r;
  c.fillRect(0, 0, 1920, 1080);
  const r2 = c.createRadialGradient(300, 1000, 0, 300, 1000, 900);
  r2.addColorStop(0, "#5a3a9a40");
  r2.addColorStop(1, "#0e162800");
  c.fillStyle = r2;
  c.fillRect(0, 0, 1920, 1080);
}
function menuBar(t) {
  c.fillStyle = "#0b0f18cc";
  c.fillRect(0, 0, 1920, 44);
  const app = { chat: "Team chat", mail: "Mail", doc: "Docs" }[focusAt(t)];
  text(app, 32, 12, 19, colors.ink, 650);
  ["File", "Edit", "View", "Window"].forEach((m, i) =>
    text(m, 32 + width(app, 19, 650) + 34 + i * 72, 12, 19, "#c8d0dc"),
  );
  // The capture scene is a look back at earlier in the day.
  const clock = t >= 7 && t < 16 ? ["10:14", "10:31", "10:38"][Math.floor((t - 7) / 3)] : "10:42";
  text(`Wed 28 Oct  ${clock} AM`, 1890, 12, 19, "#dde3ec", 500, "right");
}
function windowFrame({ x, y, w, h, title }, focused) {
  c.save();
  c.shadowColor = "#00000080";
  c.shadowBlur = focused ? 60 : 30;
  c.shadowOffsetY = 18;
  rect(x, y, w, h, 18, focused ? "#1b2230" : "#171c26", focused ? "#ffffff24" : "#ffffff12");
  c.restore();
  c.save();
  c.beginPath();
  c.roundRect(x, y, w, 50, [18, 18, 0, 0]);
  c.fillStyle = focused ? "#252e3d" : "#1d2430";
  c.fill();
  c.restore();
  ["#ec6a5e", "#f4bf4f", "#61c554"].forEach((col, i) => {
    c.beginPath();
    c.arc(x + 26 + i * 22, y + 25, 7, 0, Math.PI * 2);
    c.fillStyle = focused ? col : "#4a5160";
    c.fill();
  });
  text(title, x + w / 2, y + 15, 18, focused ? "#c9d3e1" : "#7d8796", 500, "center");
}
function avatar(x, y, initials, color) {
  c.beginPath();
  c.arc(x + 22, y + 22, 22, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
  text(initials, x + 22, y + 11, 18, "#fff", 650, "center");
}
// Returns the rows Cortex "reads" from each window, for the capture highlights.
function chatContent(win, highlight) {
  const { x, y } = win;
  const rows = [];
  const msg = (yy, who, initials, color, time, body) => {
    avatar(x + 28, yy, initials, color);
    text(who, x + 88, yy - 2, 20, colors.ink, 650);
    text(time, x + 98 + width(who, 20, 650), yy + 1, 16, colors.dim);
    const h = wrap(body, x + 88, yy + 30, win.w - 130, 21, "#c6d1df", 1.42);
    rows.push({ x: x + 80, y: yy - 8, w: win.w - 108, h: h + 46 });
    return yy + h + 54;
  };
  let yy = y + 82;
  yy = msg(yy, "Ravi Menon", "RM", "#7a5af5", "9:02 AM", "Standup moved to 11 today.");
  yy = msg(yy, "Priya Shah", "PS", "#d9774f", "10:14 AM", "Can we move the launch to Tue, Nov 12? Marketing needs one more week.");
  const priyaStart = rows.length - 1;
  yy = msg(yy, "Priya Shah", "PS", "#d9774f", "10:15 AM", "Also, could you send me the deck by Friday?");
  yy = msg(yy, "You", "AV", "#2f7de1", "10:20 AM", "Sounds good, will do.");
  if (highlight > 0) {
    const a = rows[priyaStart],
      b = rows[priyaStart + 1];
    c.save();
    c.globalAlpha *= highlight;
    rect(a.x - 6, a.y, a.w + 12, b.y + b.h - a.y, 14, "#3488ff1c", "#8cc5ffaa");
    c.restore();
  }
  rect(x + 24, y + win.h - 78, win.w - 48, 54, 12, "#121822", "#ffffff14");
  text("Message #launch", x + 46, y + win.h - 62, 19, "#6c7686");
  return rows;
}
function mailContent(win) {
  const { x, y } = win;
  const rows = [];
  text("EU pricing", x + 34, y + 84, 30, colors.ink, 650);
  avatar(x + 34, y + 140, "SL", "#2d9c7a");
  text("Sam Lee", x + 92, y + 138, 20, colors.ink, 600);
  text("to me · 10:31 AM", x + 92, y + 164, 16, colors.dim);
  rows.push({ x: x + 26, y: y + 76, w: win.w - 52, h: 120 });
  const h = wrap(
    "Hey, can you confirm pricing for the EU plan by end of day? Finance is waiting on it before Thursday.",
    x + 34,
    y + 222,
    win.w - 70,
    21,
    "#c6d1df",
    1.5,
  );
  rows.push({ x: x + 26, y: y + 212, w: win.w - 52, h: h + 14 });
  text("Thanks, Sam", x + 34, y + 240 + h, 21, "#c6d1df");
  rect(x + 34, y + win.h - 90, 120, 46, 10, "#2a3446", null);
  text("Reply", x + 94, y + win.h - 78, 19, colors.ink, 500, "center");
  return rows;
}
function docContent(win) {
  const { x, y } = win;
  const rows = [];
  text("Launch plan · Q4", x + 40, y + 84, 32, colors.ink, 650);
  rows.push({ x: x + 30, y: y + 76, w: 360, h: 52 });
  [
    ["Pricing page", "In progress"],
    ["Launch post", "Draft"],
    ["Launch date", "Nov 5 → TBD"],
    ["Owner", "Abhinav"],
  ].forEach(([k, v], i) => {
    const yy = y + 160 + i * 62;
    c.fillStyle = "#ffffff10";
    c.fillRect(x + 40, yy + 46, win.w - 80, 1);
    text(k, x + 40, yy + 10, 21, "#c6d1df");
    text(v, x + win.w - 40, yy + 10, 21, colors.cyan, 500, "right");
    rows.push({ x: x + 30, y: yy, w: win.w - 60, h: 46 });
  });
  return rows;
}
const CONTENT = { chat: chatContent, mail: mailContent, doc: docContent };
function desktopWindows(t) {
  const focus = focusAt(t);
  const order = ["mail", "doc", "chat"].filter((id) => id !== focus).concat(focus);
  let focusedRows = [];
  const highlight = t >= 19.6 && t < 25.4 ? fadeIn(t, 19.6, 0.5) * clamp((25.4 - t) / 0.4) : 0;
  for (const id of order) {
    const win = WINDOWS[id];
    windowFrame(win, id === focus);
    c.save();
    if (id !== focus) c.globalAlpha *= 0.55;
    const rows = CONTENT[id](win, id === "chat" ? highlight : 0);
    c.restore();
    if (id === focus) focusedRows = rows;
  }
  return { focus, rows: focusedRows };
}

// ---------- Screen reading (capture scene) ----------
function readingOverlay(t, focus, rows) {
  if (t < 7 || t >= 16) return;
  const local = (t - 7) % 3;
  const win = WINDOWS[focus];
  // Scan line over the focused window.
  const sy = win.y + 50 + (win.h - 60) * clamp(local / 2.4);
  const g = c.createLinearGradient(0, sy - 40, 0, sy);
  g.addColorStop(0, "#4cddff00");
  g.addColorStop(1, "#4cddff40");
  c.fillStyle = g;
  c.fillRect(win.x + 2, sy - 40, win.w - 4, 40);
  c.fillStyle = "#78efffcc";
  c.fillRect(win.x + 2, sy, win.w - 4, 2);
  // Rows above the scan line are "read" and fly into the notch.
  rows.forEach((row) => {
    if (row.y + row.h / 2 > sy) return;
    const readAt = (row.y + row.h / 2 - win.y - 50) / (win.h - 60) * 2.4;
    const age = local - readAt;
    faded(clamp(1 - age / 1.6) * 0.9, () =>
      rect(row.x, row.y, row.w, row.h, 10, "#4cddff10", "#4cddff99"),
    );
    const p = ease(age / 0.9);
    if (age > 0 && age < 0.95) {
      const sx = row.x + row.w / 2,
        sy2 = row.y + row.h / 2;
      const x = lerp(sx, 960, p),
        y = lerp(sy2, 26, p) - Math.sin(p * Math.PI) * 60;
      faded(1 - p * 0.7, () => {
        const s = lerp(1, 0.35, p);
        rect(x - 60 * s, y - 14 * s, 120 * s, 28 * s, 8 * s, "#4cddff55", "#9beeff");
      });
    }
  });
}
function captureBadges(t) {
  if (t < 7 || t >= 16) return;
  const a = fadeIn(t, 7.4) * clamp((16 - t) / 0.3);
  const count = Math.floor(1180 + 104 * clamp((t - 7.4) / 8.4));
  faded(a, () => {
    const msg = `Reading screen text · ${count.toLocaleString("en-US")} snippets stored on this Mac`;
    const w = width(msg, 18, 500) + 70;
    rect(960 - w / 2, 62, w, 42, 21, "#0b1220e6", "#4cddff66");
    pulse(960 - w / 2 + 24, 83, t, colors.neon, 4);
    text(msg, 960 - w / 2 + 44, 73, 18, "#d7f6ff", 500);
    rect(40, 62, 210, 42, 21, "#0b1220e6", "#ffffff22");
    text("◷  Earlier today", 145, 73, 18, colors.ink, 500, "center");
  });
  faded(fadeIn(t, 13.6) * clamp((16 - t) / 0.3), () => {
    rect(1430, 790, 430, 86, 16, "#0b1220ee", "#ffffff22");
    text("Skipped automatically", 1456, 806, 19, colors.ink, 600);
    text("Passwords · terminals · private windows", 1456, 838, 17, colors.dim);
  });
}

// ---------- The notch ----------
const NOTCH = {
  collapsed: [250, 40, 0],
  compose: [820, 86, 1],
  thinking: [820, 132, 1],
  answer: [820, 460, 1],
  flags: [940, 410, 1],
};
const NOTCH_FRAMES = [
  [0, "collapsed"],
  [1.65, "compose"],
  [5.35, "thinking"],
  [7.0, "collapsed"],
  [16.0, "thinking"],
  [17.3, "answer"],
  [25.3, "flags"],
  [32.6, "collapsed"],
];
const NOTCH_MORPH = 0.5;
function notchState(t) {
  let i = 0;
  while (i + 1 < NOTCH_FRAMES.length && NOTCH_FRAMES[i + 1][0] <= t) i++;
  const [start, name] = NOTCH_FRAMES[i];
  const from = NOTCH[i ? NOTCH_FRAMES[i - 1][1] : name],
    to = NOTCH[name];
  const p = ease((t - start) / NOTCH_MORPH);
  const [w, h, open] = to.map((v, k) => lerp(from[k], v, p));
  return { name, start, w, h, open, settled: fadeIn(t, start + NOTCH_MORPH * 0.7, 0.3) };
}
function notch(t) {
  const s = notchState(t);
  const x = 960 - s.w / 2,
    y = lerp(0, 12, s.open);
  // Collapsed: the black hardware notch. Open: the light Cortex panel.
  faded(1 - s.open, () => {
    c.beginPath();
    c.roundRect(x, 0, s.w, s.h, [0, 0, 18, 18]);
    c.fillStyle = "#000";
    c.fill();
  });
  faded(s.open, () => {
    c.save();
    c.shadowColor = "#00b7ff55";
    c.shadowBlur = 50;
    c.shadowOffsetY = 12;
    rect(x, y, s.w, s.h, 26, colors.panel, "#57daffaa");
    c.restore();
    c.save();
    c.beginPath();
    c.roundRect(x, y, s.w, s.h, 26);
    c.clip();
    if (s.name === "thinking" || (s.name === "answer" && t - s.start < 0.4)) {
      // Busy edge glow, like the app.
      c.strokeStyle = `rgba(76,221,255,${0.35 + 0.35 * Math.sin(t * 5)})`;
      c.lineWidth = 4;
      c.stroke();
    }
    c.restore();
  });
  c.save();
  c.beginPath();
  c.roundRect(x, y, s.w, s.h, s.open > 0.5 ? 26 : 18);
  c.clip();
  faded(s.settled, () => NOTCH_CONTENT[s.name](t, x, y, s));
  c.restore();
}
function composeRow(t, x, y, w, value, placeholder, caretOn) {
  brain(x + 22, y + 18, 50, t, 0.4);
  if (value) text(value, x + 92, y + 27, 28, colors.panelInk, 450);
  else text(placeholder, x + 92, y + 27, 28, colors.panelMuted, 400);
  if (caretOn && Math.floor(t * 2.2) % 2 === 0) {
    const cx = x + 94 + (value ? width(value, 28, 450) : 0);
    c.fillStyle = colors.neon;
    c.fillRect(cx, y + 24, 3, 36);
  }
  const flash = t >= 5.25 && t < 5.6 ? 1 : 0;
  rect(x + w - 70, y + 19, 48, 48, 14, flash ? "#0f4fa8" : colors.send, "#64cfff");
  text("↵", x + w - 46, y + 27, 26, "#fff", 600, "center");
}
const NOTCH_CONTENT = {
  collapsed(t, x, y, s) {
    brain(x + 16, 5, 30, t, 0.6);
    if (t >= 7 && t < 16) {
      pulse(x + s.w - 26, 20, t * 1.5, colors.neon, 4);
    } else {
      c.strokeStyle = "#83bed7";
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(x + s.w - 40, 11, 22, 17, 5);
      c.stroke();
    }
  },
  compose(t, x, y, s) {
    composeRow(t, x, y, s.w, typed(QUESTION, t, 2.6, 2.2), "Ask Cortex…", true);
  },
  thinking(t, x, y, s) {
    composeRow(t, x, y, s.w, t < 10 ? QUESTION : "", "Ask Cortex…", false);
    label("Searching your screen memory", x + 92, y + 92, colors.eyebrow, 15);
    dots(x + 92 + width("SEARCHING YOUR SCREEN MEMORY", 15, 600) + 22, y + 100, t, colors.neon);
    c.fillStyle = "#00a4ff2e";
    c.fillRect(x + 92, y + 118, s.w - 130, 2);
    const p = (t * 0.9) % 1;
    const g = c.createLinearGradient(x + 92 + (s.w - 130) * (p - 0.2), 0, x + 92 + (s.w - 130) * p, 0);
    g.addColorStop(0, "#78efff00");
    g.addColorStop(1, "#78efff");
    c.fillStyle = g;
    c.fillRect(x + 92, y + 118, (s.w - 130) * p, 2);
  },
  answer(t, x, y, s) {
    const l = t - s.start;
    brain(x + 24, y + 20, 44, t, 0.4);
    label("Cortex answer", x + 84, y + 22, colors.eyebrow, 14);
    text("Priya's launch request", x + 84, y + 42, 23, colors.panelInk, 600);
    text("✕", x + s.w - 44, y + 30, 22, colors.panelMuted, 400, "center");
    c.fillStyle = "#24324218";
    c.fillRect(x, y + 86, s.w, 1);
    // The question, as a sent bubble.
    const qw = width(QUESTION, 22, 450) + 40;
    rect(x + s.w - 28 - qw, y + 108, qw, 52, [20, 20, 6, 20], colors.send, "#277de4");
    text(QUESTION, x + s.w - 28 - qw + 20, y + 122, 22, "#fff", 450);
    // The answer, typed out.
    brain(x + 26, y + 188, 30, t, 0.3);
    const bx = x + 70,
      bw = s.w - 100;
    const rows = lines(ANSWER, bw - 40, 22);
    const bh = rows.length * 33 + 106;
    rect(bx, y + 180, bw, bh, [6, 20, 20, 20], "#f8fafdf5", "#d5e2ee");
    if (l < 0.6) dots(bx + 30, y + 210, t, colors.neon);
    else wrap(typed(ANSWER, t, s.start + 0.6, 1.8), bx + 20, y + 196, bw - 40, 22, colors.panelInk, 1.5);
    faded(fadeIn(t, s.start + 2.5), () => {
      const sy = y + 180 + bh - 74;
      rect(bx + 20, sy, bw - 40, 56, 12, "#ffffff", "#d5e2ee");
      rect(bx + 32, sy + 12, 32, 32, 8, "#00a2ff1f", null);
      text("↗", bx + 48, sy + 16, 20, "#1a8fd1", 600, "center");
      text(SOURCE, bx + 78, sy + 10, 18, "#304454", 600);
      text("Opens the original message", bx + 78, sy + 32, 15, colors.panelMuted);
    });
    faded(fadeIn(t, s.start + 2.5), () => {
      c.fillStyle = "#24324218";
      c.fillRect(x, y + s.h - 52, s.w, 1);
      text("Answered from local memory on this Mac", x + 28, y + s.h - 36, 16, colors.panelMuted);
    });
  },
  flags(t, x, y, s) {
    brain(x + 24, y + 20, 44, t, 0.4);
    label("Spotted in your conversations", x + 84, y + 22, colors.eyebrow, 14);
    text("2 things you may owe people", x + 84, y + 42, 23, colors.panelInk, 600);
    c.fillStyle = "#24324218";
    c.fillRect(x, y + 86, s.w, 1);
    FLAGS.forEach((f, i) => {
      const ry = y + 108 + i * 118;
      faded(fadeIn(t, s.start + 0.5 + i * 0.3), () => {
        const done = t >= f.click;
        rect(x + 24, ry, s.w - 48, 100, 16, done ? "#e9f8f0" : "#ffffff", done ? "#9bdcb9" : "#d5e2ee");
        c.beginPath();
        c.arc(x + 64, ry + 50, 15, 0, Math.PI * 2);
        c.fillStyle = done ? "#2fa36b" : "transparent";
        c.fill();
        c.strokeStyle = done ? "#2fa36b" : "#9fb2c4";
        c.lineWidth = 2.5;
        c.stroke();
        if (done) text("✓", x + 64, ry + 38, 20, "#fff", 700, "center");
        text(f.title, x + 98, ry + 20, 24, colors.panelInk, 600);
        text(done ? f.done : f.sub, x + 98, ry + 58, 18, done ? "#2a8a5a" : colors.panelMuted, done ? 600 : 400);
        if (!done) {
          const b = flagButton(i);
          const press = t >= f.click - 0.15 ? 0.94 : 1;
          rect(b.x + (b.w * (1 - press)) / 2, b.y, b.w * press, b.h, 12, colors.send, "#64cfff");
          text(f.action, b.x + b.w / 2, b.y + 14, 20, "#fff", 600, "center");
        }
      });
    });
    faded(fadeIn(t, s.start + 1.2), () =>
      text("Cortex only suggests. Nothing is added until you say so.", x + 28, y + s.h - 56, 17, colors.panelMuted),
    );
  },
};
function flagButton(i) {
  const [w] = NOTCH.flags;
  const x = 960 - w / 2,
    ry = 12 + 108 + i * 118;
  return { x: x + w - 48 - 24 - 170, y: ry + 26, w: 170, h: 50 };
}

// ---------- Cursor ----------
const b0 = flagButton(0),
  b1 = flagButton(1);
const CURSOR = [
  [0, 1320, 760],
  [1.5, 965, 24],
  [2.2, 975, 30],
  [3.2, 1520, 620],
  [16, 1520, 620],
  [27.2, 1520, 640],
  [28.5, b0.x + b0.w / 2 + 8, b0.y + b0.h / 2 + 4],
  [29.6, b0.x + b0.w / 2 + 8, b0.y + b0.h / 2 + 4],
  [30.5, b1.x + b1.w / 2 + 8, b1.y + b1.h / 2 + 4],
  [31.6, b1.x + b1.w / 2 + 8, b1.y + b1.h / 2 + 4],
  [33, 1300, 760],
];
const CLICKS = [1.6, FLAGS[0].click, FLAGS[1].click];
function cursor(t) {
  if (t >= 7 && t < 16) return;
  const [x, y] = track(CURSOR, t);
  for (const at of CLICKS) {
    const age = t - at;
    if (age >= 0 && age < 0.5) {
      faded(1 - age / 0.5, () => {
        c.beginPath();
        c.arc(x, y, 12 + age * 70, 0, Math.PI * 2);
        c.strokeStyle = "#ffffffcc";
        c.lineWidth = 3;
        c.stroke();
      });
    }
  }
  c.save();
  c.translate(x, y);
  c.scale(1.5, 1.5);
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(0, 22);
  c.lineTo(5.5, 17);
  c.lineTo(9.5, 26);
  c.lineTo(13, 24.5);
  c.lineTo(9, 16);
  c.lineTo(16, 16);
  c.closePath();
  c.shadowColor = "#00000080";
  c.shadowBlur = 6;
  c.fillStyle = "#000";
  c.fill();
  c.shadowBlur = 0;
  c.strokeStyle = "#fff";
  c.lineWidth = 1.6;
  c.stroke();
  c.restore();
}

// ---------- Captions ----------
const CAPTIONS = {
  open: ["Cortex lives in your notch.", "Click it. Ask anything."],
  capture: ["It reads your screen.", "And keeps it on your Mac."],
  ask: ["Answers from what you saw.", "With the source, every time."],
  flags: ["It flags what you owe people.", "Suggested reminders and tasks."],
};
function caption(scene, local) {
  const [a, b] = CAPTIONS[scene.id];
  const alpha = fadeIn(local, 0.35, 0.5) * clamp((scene.end - scene.start - local) / 0.3);
  const g = c.createLinearGradient(0, 820, 0, 1080);
  g.addColorStop(0, "#05080f00");
  g.addColorStop(1, "#05080fee");
  c.fillStyle = g;
  c.fillRect(0, 820, 1920, 260);
  faded(alpha, () => {
    c.translate(0, (1 - alpha) * 16);
    text(a, 960, 900, 54, colors.ink, 650, "center");
    text(b, 960, 968, 32, colors.cyan, 500, "center");
  });
}

// ---------- Agents ----------
const TASKS = [
  { id: "CX–031", title: "Ship the pricing page" },
  { id: "CX–032", title: "Confirm EU pricing for Sam" },
  { id: "CX–029", title: "Fix capture crash on wake" },
];
function agentPhase(t) {
  if (t < 3.2) return 0;
  if (t < 6.8) return 1;
  return 2;
}
function chip(value, x, y, color) {
  const w = width(value, 16, 600) + 28;
  rect(x - w, y, w, 32, 16, `${color}22`, `${color}88`);
  text(value, x - w / 2, y + 7, 16, color, 600, "center");
}
function renderAgents(t) {
  heading("A shared task manager", "for your agents.");
  const phase = agentPhase(t);
  const owners = ["codex", "claude", "opencode"];
  const names = { codex: "Codex", claude: "Claude", opencode: "OpenCode" };
  // Board
  rect(120, 320, 1080, 600, 24, "#18212f", "#8cc5ff30");
  image("brain", 150, 344, 40);
  text("Agent Space", 204, 352, 24, colors.ink, 600);
  text("Shared tasks · Cortex MCP", 1170, 356, 17, colors.dim, 400, "right");
  c.fillStyle = colors.line;
  c.fillRect(120, 408, 1080, 1);
  const progress = [
    lerp(0.15, 0.6, clamp(t / 2.6)),
    lerp(0.6, 0.96, clamp((t - 3.6) / 2.8)),
    1,
  ][phase];
  TASKS.forEach((task, i) => {
    const y = 432 + i * 156;
    const active = i === 0;
    rect(144, y, 1032, 136, 16, active ? "#22324a" : "#1b2534", active ? "#76b7ff66" : colors.line);
    text(task.id, 170, y + 22, 18, colors.dim, 600);
    text(task.title, 270, y + 18, 26, colors.ink, 550);
    let owner, status, statusColor, note;
    if (i === 0) {
      owner = owners[phase];
      status = ["In progress", "Resumed", "Done"][phase];
      statusColor = [colors.cyan, colors.cyan, colors.green][phase];
      if (phase === 0 && t >= 2.4) {
        status = "Handoff saved";
        statusColor = colors.amber;
      }
      if (phase === 2 && t < 7.8) {
        status = "In review";
        statusColor = colors.amber;
      }
      note = [
        t >= 2.4 ? "Handoff: pricing table done. Next: FAQ and mobile." : "Codex is building the pricing table…",
        "Claude resumed from Codex's handoff. No recap needed.",
        t >= 7.8 ? "Reviewed by OpenCode. History kept in Cortex." : "OpenCode is reviewing the change…",
      ][phase];
    } else if (i === 1) {
      owner = null;
      status = "Shared";
      statusColor = colors.cyan;
      note = "Added from Cortex · flagged in Mail";
    } else {
      owner = "opencode";
      status = "Done";
      statusColor = colors.green;
      note = "Closed yesterday";
    }
    if (owner) {
      logo(owner, 170, y + 66, 44);
      text(names[owner], 226, y + 76, 19, colors.muted, 500);
    } else {
      avatar(170, y + 66, "AV", "#2f7de1");
      text("You", 226, y + 76, 19, colors.muted, 500);
    }
    text(note, 380, y + 76, 19, active ? "#c9d8ec" : colors.dim);
    chip(status, 1150, y + 20, statusColor);
    if (active) {
      c.fillStyle = "#ffffff14";
      c.fillRect(170, y + 124, 980, 4);
      c.fillStyle = statusColor;
      c.fillRect(170, y + 124, 980 * progress, 4);
    }
  });
  // Agents
  owners.forEach((id, i) => {
    const y = 330 + i * 200;
    const active = phase === i;
    if (active) signal(1300, y + 75, 1180, 500, t);
    rect(1300, y, 500, 150, 18, active ? "#254569" : "#182230", active ? "#76b7ff80" : colors.line);
    logo(id, 1326, y + 26, 56);
    text(names[id], 1400, y + 30, 28, active ? colors.ink : colors.muted, 600);
    const lines = [
      [t >= 2.4 ? "Usage limit hit. Handoff saved." : "Claimed CX–031"],
      [phase >= 1 ? "Claimed CX–031 · read the handoff" : "Waiting for work"],
      [phase === 2 ? (t >= 7.8 ? "Review passed. Marked done." : "Reviewing CX–031…") : "Idle"],
    ][i];
    text(lines[0], 1326, y + 102, 19, active ? colors.cyan : colors.dim);
  });
  // The handoff note travels from Codex to Claude.
  if (t >= 2.5 && t < 3.9) {
    const p = ease((t - 2.5) / 1.1);
    faded(clamp((3.9 - t) / 0.3), () => {
      const x = 1560,
        y = lerp(400, 600, p);
      rect(x, y, 230, 64, 12, "#2b3f5c", "#f2c46b99");
      text("Handoff note", x + 18, y + 10, 17, colors.amber, 600);
      text("Goal · decisions · next", x + 18, y + 35, 15, colors.muted);
    });
  }
  text("One task list. Any agent can claim, resume, and finish the work.", 960, 968, 24, colors.muted, 400, "center");
}

// ---------- End ----------
function renderEnd(t) {
  brain(880, 170, 160, t);
  text("cortex.", 960, 360, 110, colors.ink, 600, "center");
  text("Your screen's memory. Your agents' shared tasks.", 960, 520, 38, colors.cyan, 400, "center");
  text("Local-first · Open source · macOS", 960, 600, 28, colors.muted, 400, "center");
  rect(610, 700, 700, 96, 18, "#245590", "#8cc5ff60");
  text("cortex.vashipa.link", 960, 724, 42, colors.ink, 600, "center");
  text("github.com/vashispa27/cortex", 960, 840, 24, colors.dim, 400, "center");
}

// ---------- Frame ----------
function renderDesktop(time) {
  wallpaper();
  const { focus, rows } = desktopWindows(time);
  readingOverlay(time, focus, rows);
  menuBar(time);
  captureBadges(time);
  notch(time);
  cursor(time);
}
let time = 0,
  playing = false,
  origin = 0,
  recorder = null,
  exporting = false;
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
function draw(at) {
  time = Math.max(0, Math.min(DURATION, at));
  c.globalAlpha = 1;
  c.clearRect(0, 0, 1920, 1080);
  c.fillStyle = "#101216";
  c.fillRect(0, 0, 1920, 1080);
  const scene = sceneAt(time),
    local = time - scene.start;
  if (DESKTOP_SCENES.includes(scene.id)) {
    c.save();
    c.globalAlpha = Math.min(ease(time / 0.5), clamp((33 - time) / 0.4));
    renderDesktop(time);
    caption(scene, local);
    c.restore();
  } else {
    const g = c.createRadialGradient(1500, 100, 0, 1500, 100, 1400);
    g.addColorStop(0, "#24569028");
    g.addColorStop(1, "#10121600");
    c.fillStyle = g;
    c.fillRect(0, 0, 1920, 1080);
    c.save();
    c.globalAlpha = Math.min(
      ease(local / 0.4),
      scene.id === "end" ? 1 : clamp((scene.end - time) / 0.3),
    );
    (scene.id === "agents" ? renderAgents : renderEnd)(local);
    c.restore();
  }
  if (scene.id !== "end")
    text("Illustrative product demo · Fictional data", 1890, 1046, 14, "#7f90a780", 400, "right");
  controls.seek.value = time;
  controls.time.textContent = `${clock(time)} / ${clock(DURATION)}`;
  canvas.dataset.scene = scene.id;
  canvas.dataset.time = time.toFixed(2);
}
// Frame-accurate offline rendering hook (see scripts/render-film.mjs).
if (capture) window.renderFilmFrame = draw;
async function play() {
  if (time >= DURATION) time = 0;
  narration.currentTime = time;
  try {
    if (audioContext) await audioContext.resume();
    await narration.play();
  } catch {
    controls.voice.textContent = "Click for voice";
  }
  origin = performance.now() - time * 1000;
  playing = true;
  controls.play.textContent = "Pause";
}
function pause() {
  playing = false;
  narration.pause();
  controls.play.textContent = "Play film";
}
function tick(now) {
  if (playing) {
    const audible = !narration.paused && narration.readyState >= 2;
    draw(audible ? narration.currentTime : (now - origin) / 1000);
    if (time >= DURATION) {
      pause();
      if (recorder?.state === "recording") recorder.stop();
    }
  }
  requestAnimationFrame(tick);
}
controls.play.addEventListener("click", () => (playing ? pause() : play()));
controls.restart.addEventListener("click", () => {
  draw(0);
  play();
});
controls.seek.addEventListener("input", () => {
  pause();
  draw(Number(controls.seek.value));
  narration.currentTime = time;
});
controls.export.addEventListener("click", async () => {
  if (exporting) return;
  if (!canvas.captureStream || !window.MediaRecorder) {
    alert(
      "Video export is unavailable in this browser. Open this page in a browser with canvas recording support.",
    );
    return;
  }
  const mime = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm",
  ].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) {
    alert("This browser does not support a video recording format.");
    return;
  }
  const stream = canvas.captureStream(30),
    chunks = [];
  try {
    const audioStream = await audioGraph();
    audioStream.getAudioTracks().forEach((track) => stream.addTrack(track.clone()));
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    alert("Audio recording is unavailable in this browser. Try a browser with Web Audio support.");
    return;
  }
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12000000 });
  exporting = true;
  controls.export.disabled = true;
  controls.export.textContent = "Recording…";
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.onstop = () => {
    const url = URL.createObjectURL(new Blob(chunks, { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `cortex-notch-film.${mime.startsWith("video/mp4") ? "mp4" : "webm"}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    stream.getTracks().forEach((track) => track.stop());
    exporting = false;
    controls.export.disabled = false;
    controls.export.textContent = "Export video";
  };
  recorder.start();
  draw(0);
  play();
});
draw(Number(params.get("time")) || 0);
if (params.has("autoplay")) play();
requestAnimationFrame(tick);
