import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { walkRig } from '../src/walk.js';

for (let variant = 1; variant <= 4; variant++) {
  const html = walkRig(variant);
  const layers = [...html.matchAll(/<img class="([^"]+)" src="([^"]+)" alt="" style="clip-path:polygon\(([^)]+)\)">/g)];
  assert.equal(layers.length, 3, `variant ${variant} has two legs and a body`);
  assert.ok(layers[0][1].includes('walk-leg-left'));
  assert.ok(layers[1][1].includes('walk-leg-right'));
  assert.equal(layers[2][1], 'walk-body');
  assert.notEqual(layers[0][3], layers[1][3], 'legs use independent masks');
  assert.notEqual(layers[0][3], layers[2][3], 'body stays separate from the moving legs');
  for (const [, , source, polygon] of layers) {
    assert.equal(source, `/assets/villager-${variant}.png`, 'every layer preserves the correct character');
    const coordinates = [...polygon.matchAll(/(-?[\d.]+)%/g)].map(match => Number(match[1]));
    assert.ok(coordinates.length >= 8 && coordinates.length % 2 === 0);
    assert.ok(coordinates.every(value => Number.isFinite(value) && value >= 0 && value <= 100), 'masks stay within the image');
  }
  assert.ok(html.includes('aria-hidden="true"'), 'decorative duplicates are hidden from assistive technology');
  const png = readFileSync(new URL(`../public/assets/villager-${variant}.png`, import.meta.url));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.subarray(12, 16).toString(), 'IHDR');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [192, 256], 'mask coordinates match the source image');
}
for (const invalid of [0, 5, -1, 1.5, '1', null, undefined, NaN]) {
  assert.throws(() => walkRig(invalid), /Varian warga tidak valid/);
}
console.log('Walk checks passed: four matching cutout rigs, independent legs, valid PNG sources, and invalid variants rejected.');
