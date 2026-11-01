import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { scene3d, init, setVillagers, depart, resize, dispose } from '../src/scene3d.js';

for (const fn of [scene3d.init, scene3d.setVillagers, scene3d.setTotalFollowers, scene3d.depart, scene3d.resize, scene3d.dispose, init, setVillagers, depart, resize, dispose]) assert.equal(typeof fn, 'function');
const source = readFileSync(new URL('../src/scene3d.js', import.meta.url), 'utf8');
for (const token of ['OrthographicCamera', 'WebGLRenderer', 'buildReception', 'buildBaleBoard', 'createTotalBoard', 'PlaneGeometry', 'MeshBasicMaterial', 'ConeGeometry', 'buildTree', 'createVillager', 'queuePosition', 'WALK_DURATION = 5400', 'setPixelRatio', 'shadowMap.enabled']) assert.ok(source.includes(token), `scene3d keeps ${token}`);
assert.ok(source.includes('speech'), 'villagers expose a floating comment treatment');
assert.ok(source.includes('headReplySpeech = createSpeech'), 'Pak Kades has a separate reply bubble');
assert.ok(source.includes('updateSpeech(headReplySpeech'), 'admin replies render in Pak Kades bubble');
assert.ok(source.includes('headReplyTimer = setTimeout'), 'Pak Kades reply bubble is temporary');
assert.ok(source.includes('clearTimeout(headReplyTimer)'), 'reply timer is cleared when replaced or disposed');
assert.ok(source.includes('group.userData.speech = speech'), 'villagers own their original comment bubble');
assert.ok(!source.includes('updateSpeech(record.group.userData.speech'), 'departure does not overwrite the villager comment bubble');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const markup = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
assert.ok(main.includes('Browser ini membutuhkan WebGL'), 'WebGL failure has a simple browser requirement message');
for (const token of ['walkRig', 'world-fallback', 'scene-empty', 'reception-fallback', 'is-3d', 'comment-bubble']) {
  assert.ok(!main.includes(token) && !markup.includes(token) && !styles.includes(token), `2D fallback removed: ${token}`);
}
for (const asset of ['background.png', 'house.png', 'tree.png', 'bush.png']) {
  assert.ok(!markup.includes(`/assets/${asset}`), `2D asset removed from markup: ${asset}`);
  assert.ok(!existsSync(new URL(`../public/assets/${asset}`, import.meta.url)), `2D asset deleted: ${asset}`);
}
for (const file of ['../src/walk.js', '../test/walk.test.js']) assert.ok(!existsSync(new URL(file, import.meta.url)), `2D rig file deleted: ${file}`);
assert.ok(markup.includes('id="world-canvas"'), 'Three.js canvas remains the only world surface');
console.log('3D scene checks passed: procedural diorama API, camera, lighting, villagers, and departure timing.');
