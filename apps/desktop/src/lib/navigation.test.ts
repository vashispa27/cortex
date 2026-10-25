import { describe, expect, it, vi, afterEach } from 'vitest';
import { resolvePage, savePage } from './navigation';
afterEach(() => vi.unstubAllGlobals());
describe('workspace navigation restoration', () => {
  it.each([['reminders', 'scheduled'], ['memory', 'memories'], ['wiki', 'memories'], ['tasks', 'agents'], ['write', 'ask'], ['missing', 'today'], [null, 'today']])('restores %s to %s', (old, page) => expect(resolvePage(old)).toBe(page));
  it.each(['today', 'timeline', 'scheduled', 'ask', 'memories', 'agents', 'settings'])('retains %s', page => expect(resolvePage(page)).toBe(page));
  it('replaces stale route parameters and saves a valid destination', () => {
    const replaceState = vi.fn(); const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    vi.stubGlobal('window', { location: { href: 'http://localhost/?page=write&tab=recent&query=old' }, history: { replaceState } });
    savePage('ask');
    expect(setItem).toHaveBeenCalledWith('cortex.workspace.page.v1', 'ask');
    expect(String(replaceState.mock.calls[0][2])).toBe('http://localhost/?page=ask');
  });
});
