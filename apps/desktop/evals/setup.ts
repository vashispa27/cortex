// Runs before any page module is imported. The page reads its model choice from localStorage
// (`rewind.desktop.preferences.v1`); here it comes from the environment instead.
const provider = process.env.EVAL_PROVIDER === "local" ? "local" : "openrouter";
const preferences = {
  aiProvider: provider,
  openrouterModel: process.env.EVAL_MODEL ?? "",
  localEndpoint: process.env.EVAL_LOCAL_ENDPOINT ?? "http://127.0.0.1:8080/v1",
  localModel: process.env.EVAL_LOCAL_MODEL ?? process.env.EVAL_MODEL ?? "",
};
const store = new Map<string, string>([["rewind.desktop.preferences.v1", JSON.stringify(preferences)]]);
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  },
});
