import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceClock, isInViewport } from "../src/animation-clock.js";
test("delayed callbacks preserve time and wrap across multiple examples", () => {
  assert.deepEqual(advanceClock(10000, 1000, 10400), {
    elapsed: 600,
    cycles: 1,
  });
  assert.deepEqual(advanceClock(500, 31500, 10400), {
    elapsed: 800,
    cycles: 3,
  });
});
test("even a small visible part of a tall demo keeps playing", () => {
  assert.equal(isInViewport({ top: -900, bottom: 70 }, 700), true);
  assert.equal(isInViewport({ top: 701, bottom: 1671 }, 700), false);
  assert.equal(isInViewport({ top: -970, bottom: 0 }, 700), false);
});
