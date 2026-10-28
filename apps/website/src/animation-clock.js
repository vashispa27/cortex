// Preserve elapsed time when browsers throttle or delay animation callbacks.
export function advanceClock(elapsed, delta, duration) {
  const total = elapsed + Math.max(0, delta);
  return { elapsed: total % duration, cycles: Math.floor(total / duration) };
}
export function isInViewport(rect, height) {
  return rect.bottom > 0 && rect.top < height;
}
