import { test } from "node:test";
import assert from "node:assert/strict";
import { scenes, sceneAt, DURATION } from "../src/launch-timeline.js";
test("launch scenes cover the complete film without gaps or overlaps", () => {
  assert.equal(scenes[0].start, 0);
  for (let i = 1; i < scenes.length; i++)
    assert.equal(scenes[i].start, scenes[i - 1].end);
  assert.equal(scenes.at(-1).end, DURATION);
  for (const scene of scenes) {
    assert.equal(sceneAt(scene.start).id, scene.id);
    assert.equal(sceneAt(scene.end - 0.001).id, scene.id);
  }
  assert.equal(sceneAt(DURATION).id, "end");
});

test("narration timings match every visual scene", async () => {
  const { readFile } = await import("node:fs/promises");
  const narration = JSON.parse(
    await readFile(
      new URL("../launch-voiceover.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(narration.length, scenes.length);
  narration.forEach((line, index) => {
    assert.equal(line.scene, scenes[index].id);
    assert.equal(line.start, scenes[index].start);
    assert.equal(line.end, scenes[index].end);
    assert.ok(line.text.trim().length > 0);
  });
});
