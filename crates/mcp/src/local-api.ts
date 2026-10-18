import { lstat, readFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

export class LocalApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export function stateDirectory(env: NodeJS.ProcessEnv = process.env): string {
  if (env.REWIND_STATE_DIR) return env.REWIND_STATE_DIR;
  if (env.REWIND_STATE_DIR) return env.REWIND_STATE_DIR;
  switch (platform()) {
    case 'darwin': return join(homedir(), 'Library', 'Application Support', 'Rewind');
    case 'win32': return join(env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Rewind');
    default: return join(env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'), 'rewind');
  }
}

export class LocalApi {
  constructor(private readonly stateDir = stateDirectory()) {}

  async request(path: string, body?: unknown): Promise<unknown> {
    const route = new URL(path, 'http://127.0.0.1');
    if (route.origin !== 'http://127.0.0.1' || !/^\/v1\/[a-z0-9/]+$/.test(route.pathname)) {
      throw new LocalApiError('INVALID_ROUTE', 'Invalid local route');
    }
    const tokenPath = join(this.stateDir, 'daemon.token');
    const [portText, tokenText, tokenInfo] = await Promise.all([
      readFile(join(this.stateDir, 'daemon.port'), 'utf8'),
      readFile(tokenPath, 'utf8'),
      lstat(tokenPath),
    ]).catch(() => { throw new LocalApiError('DAEMON_OFFLINE', 'Local memory service is unavailable'); });
    if (!tokenInfo.isFile() || (platform() !== 'win32' && ((tokenInfo.mode & 0o077) !== 0 || tokenInfo.uid !== process.getuid?.()))) {
      throw new LocalApiError('INSECURE_TOKEN_FILE', 'Local token file permissions are unsafe');
    }
    const port = Number(portText.trim());
    const token = tokenText.trim();
    if (!Number.isInteger(port) || port < 1 || port > 65535 || !/^[a-fA-F0-9]{64}$/.test(token)) {
      throw new LocalApiError('INVALID_CONNECTION', 'Local service connection files are invalid');
    }
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    if (serialized && Buffer.byteLength(serialized) > 32_768) {
      throw new LocalApiError('REQUEST_TOO_LARGE', 'Memory request is too large');
    }
    let response: Response;
    try {
      response = await fetch(`http://127.0.0.1:${port}${route.pathname}${route.search}`, {
        method: serialized === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Memory-Client': 'mcp',
          ...(serialized === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: serialized,
        signal: AbortSignal.timeout(8_000),
        redirect: 'error',
      });
    } catch {
      throw new LocalApiError('DAEMON_OFFLINE', 'Local memory service did not respond');
    }
    if (!response.ok) {
      const code = response.status === 401 ? 'LOCAL_AUTH_FAILED' : response.status === 403 ? 'MCP_DISABLED' : response.status === 404 ? 'UNAVAILABLE' : 'LOCAL_API_ERROR';
      const message = response.status === 403 ? 'Connected AI app access is disabled or blocked by local policy' : `Local memory request failed (${response.status})`;
      throw new LocalApiError(code, message);
    }
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
      throw new LocalApiError('RESPONSE_TOO_LARGE', 'Local memory response is too large');
    }
    const raw = await response.text();
    if (Buffer.byteLength(raw) > 1_000_000) {
      throw new LocalApiError('RESPONSE_TOO_LARGE', 'Local memory response is too large');
    }
    try { return JSON.parse(raw); }
    catch { throw new LocalApiError('INVALID_RESPONSE', 'Local memory response is invalid'); }
  }
}
