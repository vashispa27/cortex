import { DURATION, sceneAt } from "./launch-timeline.js";
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
  c.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  c.textAlign = align;
  c.textBaseline = "top";
  c.fillStyle = color;
  c.fillText(value, x, y);
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
  c.font = `${weight} ${size}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
  const words = value.split(" ");
  let row = "",
    offset = 0;
  for (const word of words) {
    const next = row ? `${row} ${word}` : word;
    if (c.measureText(next).width > maxWidth && row) {
      text(row, x, y + offset, size, color, weight);
      row = word;
      offset += size * line;
    } else row = next;
  }
  if (row) text(row, x, y + offset, size, color, weight);
  return offset + size * line;
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
function label(value, x, y) {
  text(value.toUpperCase(), x, y, 17, colors.dim, 500);
}
function heading(a, b) {
  text(a, 120, 112, 63, colors.ink, 550);
  if (b) text(b, 120, 190, 63, colors.cyan, 500);
}
function pulse(x, y, t) {
  c.beginPath();
  c.arc(x, y, 5 + Math.sin(t * 4) * 1.3, 0, Math.PI * 2);
  c.fillStyle = colors.blue;
  c.shadowColor = colors.blue;
  c.shadowBlur = 18;
  c.fill();
  c.shadowBlur = 0;
}
function line(x1, y1, x2, y2, alpha = 1) {
  c.globalAlpha *= alpha;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.strokeStyle = "#6caaff60";
  c.lineWidth = 2;
  c.stroke();
  c.globalAlpha /= alpha || 1;
}
function signal(x1, y1, x2, y2, t) {
  line(x1, y1, x2, y2);
  const p = (((t % 1.8) + 1.8) % 1.8) / 1.8;
  pulse(x1 + (x2 - x1) * p, y1 + (y2 - y1) * p, t);
}
function chrome(x, y, w, h, title) {
  rect(x, y, w, h, 22, "#151d2a", "#8cc5ff30");
  rect(x, y, w, 49, 20, "#222d3d");
  ["#d58a80", "#cfb371", "#79b795"].forEach((col, i) => {
    c.beginPath();
    c.arc(x + 24 + i * 17, y + 24, 5, 0, Math.PI * 2);
    c.fillStyle = col;
    c.fill();
  });
  text(title, x + 100, y + 17, 16, colors.muted);
}
function brain(x, y, size, t) {
  c.save();
  c.shadowColor = "#3488ff";
  c.shadowBlur = 25 + 12 * Math.sin(t * 3);
  image("brain", x, y, size);
  c.restore();
}
function dots(x, y, t) {
  for (let i = 0; i < 3; i++) {
    c.globalAlpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 6 - i));
    c.beginPath();
    c.arc(x + i * 14, y, 4, 0, Math.PI * 2);
    c.fillStyle = colors.cyan;
    c.fill();
  }
  c.globalAlpha = 1;
}
function typed(value, t, start, duration) {
  return value.slice(
    0,
    Math.floor(value.length * clamp((t - start) / duration)),
  );
}
function askPanel({
  x = 675,
  y = 350,
  w = 1010,
  h = 470,
  q,
  a,
  t,
  permanent = false,
}) {
  rect(x, y, w, h, 24, "#1d293b", "#8cc5ff40");
  image("brain", x + 32, y + 26, 43);
  text("Ask Cortex", x + 89, y + 35, 23);
  pulse(x + w - 170, y + 47, t);
  text("Local memory", x + w - 153, y + 37, 15, colors.muted);
  label("You ask", x + 35, y + 110);
  wrap(
    typed(q, t, 0.3, 1.8),
    x + 35,
    y + 149,
    w - 70,
    32,
    colors.ink,
    1.35,
    450,
  );
  if (t >= 2.1 && t < 3.15) {
    brain(x + 35, y + 268, 44, t);
    text(
      permanent ? "Saving to permanent memory" : "Finding the conversation",
      x + 95,
      y + 283,
      21,
      colors.cyan,
    );
    dots(x + w - 95, y + 292, t);
  }
  if (t >= 3.15) {
    c.save();
    c.globalAlpha = ease((t - 3.15) / 0.35);
    label("Cortex", x + 35, y + 265);
    wrap(typed(a, t, 3.15, 1), x + 35, y + 301, w - 70, 27, "#c9d8ec", 1.45);
    rect(
      x + 35,
      y + h - 65,
      permanent ? 380 : 420,
      35,
      7,
      "#3488ff15",
      "#3488ff35",
    );
    text(
      permanent
        ? "✓  Saved to permanent memory"
        : "↗  LinkedIn · Message from Abhinav",
      x + 48,
      y + h - 55,
      16,
      colors.cyan,
    );
    c.restore();
  }
}
function renderNotch(t) {
  const p = ease((t - 0.2) / 0.9);
  rect(100, 50, 1720, 945, 30, "#121923", "#ffffff20");
  text("Cortex", 140, 77, 20, colors.muted);
  text("Wed 10:42", 1640, 77, 18, colors.muted);
  rect(815, 50, 290, 65, 0, "#05070b");
  rect(815, 80, 290, 45, 22, "#05070b", null);
  brain(938, 65, 44, t);
  text("A super brain.", 960, 300, 96, colors.ink, 550, "center");
  text("In your Mac notch.", 960, 420, 96, colors.cyan, 500, "center");
  c.save();
  c.globalAlpha = p;
  c.translate(0, (1 - p) * 30);
  text(
    "A shared, local-first memory for you and your agents.",
    960,
    592,
    32,
    colors.muted,
    400,
    "center",
  );
  [
    ["claude", "Claude"],
    ["codex", "Codex"],
    ["opencode", "OpenCode"],
  ].forEach(([id, name], i) => {
    const x = 640 + i * 245;
    logo(id, x, 710);
    text(name, x + 67, 725, 23, colors.muted);
  });
  c.restore();
}
function renderRecall(t) {
  heading("Remember the conversation.", "Skip the search.");
  chrome(145, 365, 650, 455, "LinkedIn · Messages");
  label("Abhinav · Yesterday", 180, 455);
  rect(180, 500, 540, 170, 15, "#273b59");
  wrap(
    "Are you free Thursday at 2 PM to talk about the project? A quick 30-minute call.",
    205,
    527,
    490,
    27,
    "#d4e5fc",
  );
  askPanel({
    x: 755,
    y: 330,
    w: 1000,
    h: 505,
    q: "What time did Abhinav suggest for our call?",
    a: "Thursday at 2 PM, for 30 minutes. A quick call about the project.",
    t,
  });
}
function renderRemember(t) {
  heading("Some things are", "worth remembering.");
  askPanel({
    x: 230,
    y: 340,
    w: 1100,
    h: 495,
    q: "Remember this: I prefer meetings after 11 AM.",
    a: "Saved. You prefer meetings after 11 AM. You can edit or remove this memory anytime.",
    t,
    permanent: true,
  });
  c.save();
  c.globalAlpha = ease((t - 3.7) / 0.6);
  rect(1400, 450, 325, 280, 22, "#1b3043", "#65a8ff50");
  text("∞", 1430, 478, 54, colors.cyan);
  label("Permanent memory", 1430, 551);
  wrap("Meetings after 11 AM.", 1430, 594, 265, 29);
  text("Saved explicitly by you", 1430, 682, 15, colors.dim);
  c.restore();
}
function renderLocal(t) {
  heading("One local-first memory.", "For you and your agents.");
  chrome(135, 398, 535, 355, "Your day · Available screen text");
  label("Messages · Abhinav", 165, 480);
  wrap("Can you send me the project notes tomorrow?", 165, 522, 465, 27);
  rect(165, 640, 470, 54, 10, "#20486b66");
  text("Of course. I’ll send them over.", 180, 655, 20, colors.cyan);
  const sy = 455 + ((t * 65) % 270);
  c.fillStyle = "#65a8ff40";
  c.fillRect(143, sy, 519, 3);
  signal(675, 580, 898, 580, t);
  brain(900, 487, 155, t);
  text("Cortex", 978, 663, 33, colors.ink, 500, "center");
  label("Stored on your Mac", 885, 716);
  const nodes = [
    ["claude", "Claude", "Context through MCP"],
    ["codex", "Codex", "Context through MCP"],
  ];
  nodes.forEach(([id, name, sub], i) => {
    const y = 410 + i * 155;
    signal(1060, 580, 1280, y + 45, t - 0.6);
    rect(1290, y, 470, 105, 16, "#1b2636");
    logo(id, 1310, y + 24);
    text(name, 1385, y + 22, 26);
    text(sub, 1385, y + 60, 19, colors.dim);
  });
  text(
    "Your archive stays local. Cloud models receive selected context when used.",
    960,
    867,
    22,
    colors.muted,
    400,
    "center",
  );
}
function renderHandoff(t) {
  heading("Switch agents.", "Keep your context.");
  const step = Math.min(3, Math.floor(t / 2.6));
  const data = [
    [
      "codex",
      "Codex saves its place.",
      "Save my progress. I’m out of credits.",
      "Ready to resume",
      "Hero done. Next: demo and mobile.",
    ],
    [
      "claude",
      "Claude reads the handoff.",
      "What tasks can I pick up?",
      "Context loaded",
      "Goal, decisions, and next steps included.",
    ],
    [
      "claude",
      "Claude picks up the work.",
      "Pick up CX–024 using the handoff.",
      "Claude · in progress",
      "Continue from Codex’s saved context.",
    ],
    [
      "opencode",
      "OpenCode updates the task.",
      "Review passed. Mark CX–024 complete.",
      "Complete",
      "The outcome and history stay in Cortex.",
    ],
  ][step];
  rect(655, 310, 610, 195, 18, "#202f43", "#8cc5ff35");
  text("Shared task memory", 680, 332, 22);
  rect(680, 380, 560, 64, 10, "#284970");
  text("CX–024  Build the landing page", 698, 392, 21);
  text(data[3], 698, 422, 15, colors.cyan);
  text(data[4], 680, 466, 18, colors.muted);
  signal(960, 508, 960, 567, t);
  brain(905, 565, 110, t);
  label("Cortex", 921, 696);
  ["codex", "claude", "opencode"].forEach((id, i) => {
    const x = 180 + i * 580,
      y = 790;
    signal(960, 674, x + 200, y, t + i * 0.25);
    const active = data[0] === id;
    rect(
      x,
      y,
      400,
      100,
      15,
      active ? "#254569" : "#182230",
      active ? "#76b7ff80" : colors.line,
    );
    logo(id, x + 20, y + 24);
    text(
      id === "opencode" ? "OpenCode" : id === "codex" ? "Codex" : "Claude",
      x + 91,
      y + 35,
      27,
      active ? colors.ink : colors.muted,
      500,
    );
  });
  text(data[1], 960, 936, 26, colors.cyan, 500, "center");
  rect(1130, 560, 610, 100, 14, "#1b2d45", "#3488ff40");
  wrap(data[2], 1155, 586, 560, 25, colors.ink, 1.35);
}
function renderEnd(t) {
  brain(880, 210, 160, t);
  text("cortex.", 960, 404, 110, colors.ink, 600, "center");
  text(
    "A shared memory for you and your agents.",
    960,
    565,
    37,
    colors.cyan,
    400,
    "center",
  );
  text("Completely open source.", 960, 663, 31, colors.muted, 400, "center");
  rect(525, 772, 870, 84, 14, "#245590", "#8cc5ff60");
  text("github.com/vashispa27/cortex", 960, 794, 35, colors.ink, 500, "center");
  text("macOS · In development", 960, 902, 20, colors.dim, 400, "center");
}
const renderers = {
  notch: renderNotch,
  recall: renderRecall,
  remember: renderRemember,
  local: renderLocal,
  handoff: renderHandoff,
  end: renderEnd,
};
let time = 0,
  playing = false,
  origin = 0,
  recorder = null,
  exporting = false;
function draw(at) {
  time = Math.max(0, Math.min(DURATION, at));
  c.globalAlpha = 1;
  c.clearRect(0, 0, 1920, 1080);
  c.fillStyle = "#101216";
  c.fillRect(0, 0, 1920, 1080);
  const g = c.createRadialGradient(1500, 100, 0, 1500, 100, 1400);
  g.addColorStop(0, "#24569028");
  g.addColorStop(1, "#10121600");
  c.fillStyle = g;
  c.fillRect(0, 0, 1920, 1080);
  const scene = sceneAt(time),
    local = time - scene.start;
  const alpha = Math.min(
    ease(local / 0.35),
    scene.id === "end" ? 1 : clamp((scene.end - time) / 0.28),
  );
  c.save();
  c.globalAlpha = alpha;
  renderers[scene.id](local);
  c.restore();
  if (scene.id !== "end") {
    text("CORTEX", 120, 1015, 16, colors.dim, 500);
    text(
      "Illustrative product demo · Fictional data",
      1800,
      1015,
      16,
      colors.dim,
      400,
      "right",
    );
  }
  if (scene.id === "handoff")
    text(
      "Connected agent sessions · Shared MCP workspace",
      960,
      1000,
      16,
      colors.dim,
      400,
      "center",
    );
  controls.seek.value = time;
  controls.time.textContent = `0:${String(Math.floor(time)).padStart(2, "0")} / 0:42`;
  canvas.dataset.scene = scene.id;
  canvas.dataset.time = time.toFixed(2);
}
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
    draw(!narration.paused ? narration.currentTime : (now - origin) / 1000);
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
    audioStream
      .getAudioTracks()
      .forEach((track) => stream.addTrack(track.clone()));
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    alert(
      "Audio recording is unavailable in this browser. Try a browser with Web Audio support.",
    );
    return;
  }
  recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 12000000,
  });
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
    a.download = `cortex-launch.${mime.startsWith("video/mp4") ? "mp4" : "webm"}`;
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
