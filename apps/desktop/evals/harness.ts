// Shared plumbing for the gold-set evaluations (see README.md in this folder).
//
// An evaluation run starts two throwaway child processes and never touches the real memory:
//   1. the Cortex engine (`cortex desktop`) in test mode, on a COPY of the eval archive;
//   2. the headless shell bridge (`examples/eval_bridge`), which runs the same commands the UI invokes
//      (`openrouter_chat` with its read-only tool loop, `openrouter_search_query`, `daemon_request`).
// The page's real `answerFromMemory` then runs unchanged in Node; `tauri-shim.ts` routes its `invoke`
// calls to the bridge.
import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export type GoldQuestion = {
  id: string;
  family: string;
  query: string;
  variant_of?: string;
  history: { role: "user" | "assistant"; content: string }[];
  expected_behavior: "memory" | "general" | "mixed" | "clarify" | "abstain";
  reference_answer: string;
  answer_facts: string[];
  support: { snapshot_id: number; chunk: number; answer_text: string }[];
  wrong_answers: string[];
  needs_multiple_chunks: boolean;
  redaction_expected: boolean;
  split: "dev" | "test";
  notes: string;
};

export const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
export const PRIVATE = join(REPO, "evals/private");
export const GOLD = process.env.EVAL_GOLD ?? join(PRIVATE, "gold.jsonl");

const REAL_ROOT = join(homedir(), "Library/Application Support/Cortex");
// Structure-aware chunks are the eval baseline; eval-memory stays only as the raw source they are built from.
const ARCHIVE = process.env.EVAL_ARCHIVE ?? join(REAL_ROOT, "eval-memory-segments");
const ENGINE_BIN = process.env.EVAL_ENGINE_BIN ?? join(REPO, "target/release/cortex");
const BRIDGE_BIN = process.env.EVAL_BRIDGE_BIN ?? join(REPO, "apps/desktop/src-tauri/target/release/examples/eval_bridge");

export function loadGold(): GoldQuestion[] {
  const all = readFileSync(GOLD, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as GoldQuestion);
  const ids = process.env.EVAL_IDS?.split(",").map((s) => s.trim()).filter(Boolean);
  const families = process.env.EVAL_FAMILIES?.split(",").map((s) => s.trim()).filter(Boolean);
  let rows = all.filter((q) => (!process.env.EVAL_SPLIT || q.split === process.env.EVAL_SPLIT) && (!ids || ids.includes(q.id)) && (!families || families.includes(q.family)));
  if (process.env.EVAL_LIMIT) rows = rows.slice(0, Number(process.env.EVAL_LIMIT));
  return rows;
}

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
let bridge: ChildProcess | null = null;
let engine: ChildProcess | null = null;
let workdir = "";
let nextId = 1;
const pending = new Map<number, Pending>();

/** The shim's `invoke`: one request to the bridge process. */
export function bridgeCall<T = unknown>(cmd: string, args: unknown): Promise<T> {
  if (!bridge?.stdin) return Promise.reject(new Error("evaluation bridge is not running; call startRig() first"));
  const id = nextId++;
  return new Promise<T>((resolvePromise, reject) => {
    pending.set(id, { resolve: resolvePromise as (value: unknown) => void, reject });
    bridge!.stdin!.write(JSON.stringify({ id, cmd, args: args ?? {} }) + "\n");
  });
}

function findModelDir(): string | undefined {
  if (process.env.CORTEX_MODEL_DIR) return process.env.CORTEX_MODEL_DIR;
  // Only the pinned embedding weights are read from the real folder, never captured data.
  const models = join(REAL_ROOT, "local-memory/models");
  if (!existsSync(models)) return undefined;
  return readdirSync(models).map((d) => join(models, d)).find((d) => existsSync(join(d, "model.safetensors")));
}

async function until(check: () => Promise<boolean>, what: string, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** Starts the engine (test mode, copied archive) and the bridge. Returns the throwaway folder. */
export async function startRig(options: { engine?: boolean } = {}): Promise<string> {
  const withEngine = options.engine !== false;
  for (const [name, path] of [["engine", ENGINE_BIN], ["bridge", BRIDGE_BIN], ["eval archive", ARCHIVE]] as const) {
    if (!withEngine && name !== "bridge") continue;
    if (!existsSync(path)) throw new Error(`${name} not found at ${path}. See evals/README.md for the build commands.`);
  }
  workdir = mkdtempSync(join(tmpdir(), "cortex-answer-eval-"));
  mkdirSync(join(workdir, "local-memory"), { recursive: true });
  const key = join(REAL_ROOT, "openrouter.key");
  if (existsSync(key)) { copyFileSync(key, join(workdir, "openrouter.key")); chmodSync(join(workdir, "openrouter.key"), 0o600); } // the shell refuses symlinks; the copy goes away with the folder
  const engineLog: string[] = [];
  if (withEngine) {
    cpSync(ARCHIVE, join(workdir, "eval-memory"), { recursive: true });
    // test_mode routes every search, including the tool loop's, to the (copied) eval archive.
    writeFileSync(join(workdir, "cortex-capture.json"), JSON.stringify({ version: 0, capture_enabled: false, capture_paused: false, mcp_enabled: false, excluded_apps: [], excluded_domains: [], test_mode: true }));
    const modelDir = findModelDir();
    engine = spawn(ENGINE_BIN, ["desktop"], {
      env: { ...process.env, CORTEX_STATE_DIR: join(workdir, "local-memory"), CORTEX_SETTINGS_DIR: workdir, CORTEX_EVAL_DIR: join(workdir, "eval-memory"), CORTEX_EXIT_ON_STDIN_EOF: "1", ...(modelDir ? { CORTEX_MODEL_DIR: modelDir } : {}) },
      stdio: ["pipe", "ignore", "pipe"],
    });
    engine.stderr?.on("data", (chunk) => { engineLog.push(String(chunk)); if (engineLog.length > 50) engineLog.shift(); });
  }

  bridge = spawn(BRIDGE_BIN, [], { env: { ...process.env, CORTEX_STATE_DIR: workdir }, stdio: ["pipe", "pipe", "inherit"] });
  createInterface({ input: bridge.stdout! }).on("line", (line) => {
    const msg = JSON.parse(line) as { id: number | null; ok: boolean; data?: unknown; error?: string };
    const waiter = msg.id == null ? undefined : pending.get(msg.id);
    if (!waiter || msg.id == null) return;
    pending.delete(msg.id);
    if (msg.ok) waiter.resolve(msg.data); else waiter.reject(new Error(msg.error ?? "bridge error"));
  });

  if (!withEngine) return workdir;
  try {
    await until(async () => { const s = await bridgeCall<{ data?: { test_mode?: boolean } }>("daemon_request", { method: "GET", path: "/v1/status", body: null }); return Boolean(s); }, "the engine", 180_000);
  } catch (error) {
    throw new Error(`${(error as Error).message}\nengine log:\n${engineLog.join("")}`);
  }
  const settings = await bridgeCall<{ data: { test_mode?: boolean } }>("daemon_request", { method: "GET", path: "/v1/settings", body: null });
  if (!settings.data?.test_mode) throw new Error("engine is not in test mode; refusing to run against anything but the eval archive");
  return workdir;
}

export function stopRig(): void {
  bridge?.stdin?.end();
  bridge?.kill();
  engine?.stdin?.end(); // CORTEX_EXIT_ON_STDIN_EOF makes the engine exit
  engine?.kill();
  bridge = engine = null;
  if (workdir) rmSync(workdir, { recursive: true, force: true });
  workdir = "";
}

/** Reads finished ids from a JSONL results file so an interrupted run can resume. */
export function doneIds(path: string): Set<string> {
  if (!existsSync(path)) return new Set();
  return new Set(readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => (JSON.parse(l) as { id: string }).id));
}
