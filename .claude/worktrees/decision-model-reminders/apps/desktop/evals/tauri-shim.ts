// Stands in for `@tauri-apps/api/core` in evaluation runs (see vitest.eval.config.ts).
import { bridgeCall } from "./harness";

export const isTauri = () => true;
export const invoke = <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => bridgeCall<T>(cmd, args);
