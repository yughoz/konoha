import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
console.log('3D scene checks passed: procedural diorama API, camera, lighting, villagers, and departure timing.');
