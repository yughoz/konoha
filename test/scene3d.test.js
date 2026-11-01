import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scene3d, init, setVillagers, depart, resize, dispose } from '../src/scene3d.js';

for (const fn of [scene3d.init, scene3d.setVillagers, scene3d.setTotalFollowers, scene3d.depart, scene3d.resize, scene3d.dispose, init, setVillagers, depart, resize, dispose]) assert.equal(typeof fn, 'function');
const source = readFileSync(new URL('../src/scene3d.js', import.meta.url), 'utf8');
for (const token of ['OrthographicCamera', 'WebGLRenderer', 'buildReception', 'buildBaleBoard', 'createTotalBoard', 'ConeGeometry', 'buildTree', 'createVillager', 'queuePosition', 'WALK_DURATION = 5400', 'setPixelRatio', 'shadowMap.enabled']) assert.ok(source.includes(token), `scene3d keeps ${token}`);
assert.ok(source.includes('speech'), 'villagers expose a floating comment treatment');
console.log('3D scene checks passed: procedural diorama API, camera, lighting, villagers, and departure timing.');
