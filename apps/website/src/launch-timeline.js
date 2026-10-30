export const DURATION = 42;
export const scenes = [
  { id: "notch", start: 0, end: 5, title: "A super brain. In your Mac notch." },
  {
    id: "recall",
    start: 5,
    end: 13,
    title: "Remember the conversation. Skip the search.",
  },
  {
    id: "remember",
    start: 13,
    end: 19,
    title: "Some things are worth remembering.",
  },
  {
    id: "local",
    start: 19,
    end: 26,
    title: "One local-first memory. For you and your agents.",
  },
  {
    id: "handoff",
    start: 26,
    end: 37,
    title: "Switch agents. Keep your context.",
  },
  { id: "end", start: 37, end: 42, title: "Completely open source." },
];
export function sceneAt(time) {
  return scenes.find((scene) => time < scene.end) || scenes.at(-1);
}
