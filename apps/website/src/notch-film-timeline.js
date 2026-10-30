export const DURATION = 50;
// The first four scenes share one continuous desktop; only the notch changes.
export const DESKTOP_SCENES = ["open", "capture", "ask", "flags"];
export const scenes = [
  { id: "open", start: 0, end: 7, title: "Cortex lives in your notch." },
  { id: "capture", start: 7, end: 16, title: "It reads your screen." },
  { id: "ask", start: 16, end: 25, title: "Ask about anything you saw." },
  { id: "flags", start: 25, end: 33, title: "It flags what you owe people." },
  { id: "agents", start: 33, end: 43, title: "A shared task manager for your agents." },
  { id: "end", start: 43, end: 50, title: "Local-first and open source." },
];
export function sceneAt(time) {
  return scenes.find((scene) => time < scene.end) || scenes.at(-1);
}
