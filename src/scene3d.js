import * as THREE from 'three';

const WALK_DURATION = 5400;
const REDUCED_DURATION = 350;
const HEAD_REPLY_DURATION = 4200;
const palette = {
  grass: 0xc5d7a7,
  path: 0xd9c89d,
  soil: 0x9caf7d,
  wall: 0xe8d6ae,
  roof: 0x9c6d4f,
  wood: 0x79583f,
  window: 0xa9c8c8,
  trunk: 0x735b3f,
  leaf: 0x789965,
  leafLight: 0xa7be7f,
  flower: 0xe7a67f,
  skin: [0xc88965, 0xd89f79, 0xa96e5e, 0xe1b38c],
  clothes: [0x6d8d69, 0xb8795d, 0x637e9c, 0x96835b],
};

let renderer;
let scene;
let camera;
let root;
let villagersRoot;
let pakKades;
let headReplySpeech;
let headReplyTimer;
let totalBoard;
let totalFollowers = null;
let frame = 0;
let resizeObserver;
let lastTime = 0;
let reducedMotion = false;
const villagers = new Map();
const buildPlots = new Map();
const shared = new Set();
const materialCache = new Map();
let materials = {};
let clickHandler = null;
let controlsCanvas = null;
let controls = null;
let cameraTarget = new THREE.Vector3(0, 0.8, 0);
let cameraYaw = 0;
let cameraPitch = 0.82;
let cameraZoom = 7;
let pointers = new Map();
let pointerStart = null;
let pointerMoved = false;
let pinchDistance = null;
let buildClickHandler = null;
let recorder = null;
let recordingChunks = [];

const mat = color => {
  if (materialCache.has(color)) return materialCache.get(color);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });
  shared.add(material);
  materialCache.set(color, material);
  return material;
};
function createMaterials() {
  materials = Object.fromEntries(Object.entries(palette)
    .filter(([, value]) => typeof value === 'number')
    .map(([key, value]) => [key, mat(value)]));
}

function mesh(geometry, material, cast = true, receive = true) {
  const item = new THREE.Mesh(geometry, material);
  item.castShadow = cast;
  item.receiveShadow = receive;
  return item;
}

function addBox(parent, size, position, material, rotation = null) {
  const item = mesh(new THREE.BoxGeometry(...size), material);
  item.position.set(...position);
  if (rotation) item.rotation.set(...rotation);
  parent.add(item);
  return item;
}

// A small low-poly reception desk keeps the queue anchored to Pak Kades.
function buildReception() {
  const group = new THREE.Group();
  // The counter sits on the path so the line can visibly reach it.
  group.position.set(0, 0, 1.05);
  const counter = new THREE.Group();
  addBox(counter, [3.55, 1.15, 0.72], [0, 0.62, 0], materials.wood);
  addBox(counter, [3.85, 0.16, 0.95], [0, 1.28, 0.02], materials.wall);
  addBox(counter, [2.65, 0.12, 0.8], [0, 1.42, 0.02], materials.roof);
  addBox(counter, [0.1, 0.82, 0.76], [-1.55, 0.7, 0], materials.roof);
  addBox(counter, [0.1, 0.82, 0.76], [1.55, 0.7, 0], materials.roof);
  group.add(counter);

  const sign = addBox(group, [2.35, 0.38, 0.08], [0, 2.14, 0.04], materials.wood);
  sign.userData.label = 'BALAI DESA';

  const person = new THREE.Group();
  person.position.set(0, 0, -0.5);
  const skin = mat(0xc88965);
  const shirt = mat(0x3f6c52);
  const dark = mat(0x2f3d35);
  const hat = mat(0x50774e);
  const body = mesh(new THREE.CapsuleGeometry(0.43, 0.72, 4, 8), shirt);
  body.position.y = 1.55;
  person.add(body);
  const head = mesh(new THREE.SphereGeometry(0.42, 8, 6), skin);
  head.position.y = 2.35;
  person.add(head);
  const hair = mesh(new THREE.SphereGeometry(0.43, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), dark);
  hair.position.y = 2.45;
  person.add(hair);
  const brim = mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.12, 8), hat);
  brim.position.y = 2.72;
  person.add(brim);
  const crown = mesh(new THREE.ConeGeometry(0.4, 0.5, 8), hat);
  crown.position.y = 3.0;
  person.add(crown);
  const nose = mesh(new THREE.ConeGeometry(0.065, 0.16, 5), skin);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 2.3, 0.4);
  person.add(nose);
  for (const x of [-0.16, 0.16]) {
    const eye = mesh(new THREE.SphereGeometry(0.045, 6, 4), dark, false, false);
    eye.position.set(x, 2.43, 0.36);
    person.add(eye);
  }
  const leftArm = addBox(person, [0.17, 0.66, 0.17], [-0.55, 1.55, 0.02], shirt, [0, 0, -0.2]);
  const rightArm = addBox(person, [0.17, 0.66, 0.17], [0.55, 1.55, 0.02], shirt, [0, 0, 0.2]);
  leftArm.userData.idleSide = -1;
  rightArm.userData.idleSide = 1;
  person.userData.arms = [leftArm, rightArm];
  const badge = addBox(person, [0.25, 0.18, 0.03], [0.23, 1.76, 0.39], materials.wall);
  badge.userData.label = 'PAK KADES';
  const legs = mat(0x48534b);
  addBox(person, [0.2, 0.72, 0.2], [-0.2, 0.48, 0], legs);
  addBox(person, [0.2, 0.72, 0.2], [0.2, 0.48, 0], legs);
  person.userData.baseY = person.position.y;
  person.scale.setScalar(1.15);
  group.add(person);
  pakKades = person;
  headReplySpeech = createSpeech({ name: 'Pak Kades', text: '' });
  headReplySpeech.position.set(0.15, 3.7, 0.25);
  headReplySpeech.scale.set(4.15, 1.95, 1);
  headReplySpeech.visible = false;
  person.add(headReplySpeech);

  const board = buildBaleBoard();
  board.position.set(3.25, 0, 0.42);
  board.rotation.y = 0.35;
  board.rotation.z = 0.025;
  group.add(board);
  totalBoard = board.userData.plaque;
  updateTotalBoard(totalFollowers);
  return group;
}

function buildBaleBoard() {
  const group = new THREE.Group();
  const postMaterial = materials.wood;
  const roofMaterial = materials.roof;
  addBox(group, [0.2, 2.5, 0.2], [-1.55, 1.25, 0], postMaterial);
  addBox(group, [0.2, 2.5, 0.2], [1.55, 1.25, 0], postMaterial);
  addBox(group, [0.42, 0.18, 0.46], [-1.55, 0.12, 0], roofMaterial);
  addBox(group, [0.42, 0.18, 0.46], [1.55, 0.12, 0], roofMaterial);
  addBox(group, [3.55, 1.78, 0.16], [0, 2.1, 0], postMaterial);
  addBox(group, [3.82, 0.16, 0.46], [0, 3.03, 0], roofMaterial);
  const roof = mesh(new THREE.ConeGeometry(2.05, 0.62, 4), roofMaterial);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 3.36;
  group.add(roof);
  const plaque = createTotalBoard();
  plaque.position.set(0, 2.1, 0.24);
  group.add(plaque);
  group.userData.plaque = plaque;
  return group;
}

function createTotalBoard() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 240;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.35), material);
  plaque.renderOrder = 18;
  plaque.userData.canvas = canvas;
  plaque.userData.context = context;
  plaque.userData.texture = texture;
  return plaque;
}

function updateTotalBoard(value) {
  if (!totalBoard) return;
  const canvas = totalBoard.userData.canvas;
  const context = totalBoard.userData.context;
  const formatted = Number.isFinite(Number(value)) ? new Intl.NumberFormat('id-ID').format(Number(value)) : '—';
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#7b573d';
  context.strokeStyle = '#4d3427';
  context.lineWidth = 14;
  roundedRect(context, 8, 8, canvas.width - 16, canvas.height - 16, 24);
  context.fill();
  context.stroke();
  context.strokeStyle = '#9a704d66';
  context.lineWidth = 3;
  for (const y of [74, 170]) {
    context.beginPath();
    context.moveTo(30, y);
    context.lineTo(canvas.width - 30, y + 2);
    context.stroke();
  }
  context.textAlign = 'center';
  context.fillStyle = '#f3e4b9';
  context.font = '700 27px DM Sans, sans-serif';
  context.fillText('TOTAL WARGA', canvas.width / 2, 58);
  context.fillStyle = '#f6d384';
  context.font = '700 72px Fraunces, Georgia, serif';
  context.fillText(formatted, canvas.width / 2, 150);
  context.fillStyle = '#dbc39b';
  context.font = '700 17px DM Sans, sans-serif';
  context.fillText('PENGIKUT IG', canvas.width / 2, 205);
  totalBoard.userData.texture.needsUpdate = true;
}

function buildTree(x, z, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  group.add(mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.5, 6), materials.trunk));
  const crown = mesh(new THREE.IcosahedronGeometry(1.15, 1), materials.leaf);
  crown.position.y = 1.55;
  group.add(crown);
  const crown2 = mesh(new THREE.IcosahedronGeometry(0.75, 1), materials.leafLight);
  crown2.position.set(0.45, 2.05, 0.1);
  group.add(crown2);
  return group;
}

function buildVillage() {
  const group = new THREE.Group();
  // The larger ground keeps the village readable after the camera is panned.
  const ground = new THREE.Mesh(new THREE.BoxGeometry(30, 0.35, 22), materials.grass);
  ground.position.y = -0.18;
  ground.receiveShadow = true;
  group.add(ground);
  const path = new THREE.Mesh(new THREE.BoxGeometry(4, 0.08, 20), materials.path);
  path.position.set(0, 0.04, 1.2); path.rotation.y = -0.12; path.receiveShadow = true; group.add(path);
  const crossPath = new THREE.Mesh(new THREE.BoxGeometry(26, 0.07, 2.5), materials.path);
  crossPath.position.set(0, 0.045, 2.2); crossPath.rotation.y = -0.12; crossPath.receiveShadow = true; group.add(crossPath);
  group.add(buildReception());
  [[-11, -7, 1.3], [-7, -8, 1.0], [8, -8, 1.2], [12, -6, 1.1], [-12, 7, 1.0], [-8, 9, 0.9], [8, 8, 1.1], [12, 6, 1.2], [-3.8, 7.8, 0.8], [4, -5.8, 0.7], [10, 1.5, 0.8], [-10, 1.2, 0.9]].forEach(item => group.add(buildTree(...item)));
  for (const [x, z] of [[-8.3, -3.5], [7.5, -3.4], [-11, 3.1], [11, 3.8], [-5.5, 8.2], [5.5, 8]]) {
    const bush = mesh(new THREE.IcosahedronGeometry(0.65, 1), materials.leafLight);
    bush.position.set(x, 0.55, z);
    group.add(bush);
  }
  return group;
}

const BUILD_POSITIONS = [[-7, -4], [7, -4], [-8, 5], [8, 5], [-3.8, 8], [4.5, 8], [-11, -8], [11, -8]];
const BUILD_STATUS = { 'to-do': 'RENCANA', 'in-progress': 'DIBANGUN', 'in-review': 'HAMPIR JADI', done: 'SELESAI' };

function createBuildPlaque(build) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 180;
  const context = canvas.getContext('2d');
  context.fillStyle = '#76553b'; context.strokeStyle = '#4d3427'; context.lineWidth = 8;
  roundedRect(context, 6, 6, 500, 168, 18); context.fill(); context.stroke();
  context.fillStyle = '#f4e1b3'; context.font = '700 25px DM Sans, sans-serif'; context.fillText(BUILD_STATUS[build.status] || String(build.status || '').toUpperCase(), 24, 40);
  context.fillStyle = '#fff9e2'; context.font = '600 28px DM Sans, sans-serif';
  const title = String(build.title || 'Rencana warga').slice(0, 29); context.fillText(title, 24, 84);
  context.fillStyle = '#e0c99b'; context.font = '500 19px DM Sans, sans-serif'; context.fillText(build.username ? `@${String(build.username).replace(/^@/, '')}` : 'DESA KOMEN', 24, 132);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.98), new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthTest: false }));
  plaque.position.set(0, 2.2, 0.05); plaque.renderOrder = 19; plaque.userData.texture = texture; return plaque;
}

function buildConstruction(build, index) {
  const group = new THREE.Group();
  const [x, z] = BUILD_POSITIONS[index % BUILD_POSITIONS.length]; group.position.set(x, 0, z); group.userData.build = build;
  const base = addBox(group, [3.7, 0.16, 3.1], [0, 0.08, 0], materials.soil); base.userData.build = build;
  const status = String(build.status || 'to-do').toLowerCase();
  if (status === 'to-do') {
    addBox(group, [0.16, 2.3, 0.16], [-1.25, 1.15, 0], materials.wood);
    addBox(group, [0.16, 2.3, 0.16], [1.25, 1.15, 0], materials.wood);
    addBox(group, [2.7, 0.16, 0.16], [0, 2.2, 0], materials.wood);
  } else {
    const height = status === 'in-progress' ? 1.45 : 2.05;
    addBox(group, [2.65, height, 2.05], [0, height / 2, 0], materials.wall);
    addBox(group, [0.55, 1.05, 0.08], [0, 0.56, 1.06], materials.wood);
    for (const px of [-0.78, 0.78]) addBox(group, [0.45, 0.62, 0.08], [px, 1.05, 1.06], materials.window);
    const roof = mesh(new THREE.ConeGeometry(1.95, 0.72, 4), materials.roof); roof.rotation.y = Math.PI / 4; roof.position.y = height + 0.38; group.add(roof);
    if (status === 'in-progress') {
      const scaffold = materials.wood;
      for (const sx of [-1.65, 1.65]) { addBox(group, [0.11, 2.7, 0.11], [sx, 1.35, 1.2], scaffold); addBox(group, [0.11, 2.7, 0.11], [sx, 1.35, -1.2], scaffold); }
      for (const sy of [0.55, 1.55, 2.45]) addBox(group, [3.45, 0.09, 0.09], [0, sy, 1.2], scaffold);
    }
  }
  group.add(createBuildPlaque(build));
  return group;
}

function setBuilds(items = []) {
  if (!renderer || !root) return;
  const visible = items.filter(build => String(build.status || '').toLowerCase() !== 'cancelled').slice(0, BUILD_POSITIONS.length);
  const ids = new Set(visible.map(build => String(build.id ?? build.number ?? build.title)));
  for (const [id, plot] of buildPlots) {
    if (ids.has(id)) continue;
    root.remove(plot); disposeObject(plot); buildPlots.delete(id);
  }
  visible.forEach((build, index) => {
    const id = String(build.id ?? build.number ?? build.title);
    const existing = buildPlots.get(id);
    if (existing) {
      const old = existing.userData.build || {};
      if (old.status === build.status && old.title === build.title && old.username === build.username) return;
      root.remove(existing); disposeObject(existing); buildPlots.delete(id);
    }
    const plot = buildConstruction(build, index); buildPlots.set(id, plot); root.add(plot);
  });
}

function wrapSpeech(text, maxChars = 90) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const clipped = clean.length > maxChars ? `${clean.slice(0, maxChars - 1).trimEnd()}…` : clean;
  const words = clipped.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > 28 && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function createSpeech(comment) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 240;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.8, 1.8, 1);
  sprite.position.set(0, 3.02, 0);
  sprite.renderOrder = 20;
  sprite.userData.canvas = canvas;
  sprite.userData.context = context;
  sprite.userData.texture = texture;
  sprite.userData.textKey = '';
  updateSpeech(sprite, comment);
  return sprite;
}

function updateSpeech(sprite, comment) {
  const textKey = `${comment.name || ''}\n${comment.text || ''}`;
  if (sprite.userData.textKey === textKey) return;
  const canvas = sprite.userData.canvas;
  const context = sprite.userData.context;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#fffdf0';
  context.strokeStyle = '#d2d6b8';
  context.lineWidth = 6;
  roundedRect(context, 8, 8, canvas.width - 16, canvas.height - 42, 24);
  context.fill();
  context.stroke();
  context.fillStyle = '#fffdf0';
  context.beginPath();
  context.moveTo(65, canvas.height - 36);
  context.lineTo(98, canvas.height - 4);
  context.lineTo(131, canvas.height - 36);
  context.closePath();
  context.fill();
  context.strokeStyle = '#d2d6b8';
  context.stroke();
  context.fillStyle = '#7b9468';
  context.font = '700 34px DM Sans, sans-serif';
  context.fillText(String(comment.name || 'Warga').slice(0, 22), 36, 49);
  context.fillStyle = '#4e654d';
  context.font = '500 31px DM Sans, sans-serif';
  wrapSpeech(comment.text).forEach((line, index) => context.fillText(line, 36, 98 + index * 40));
  sprite.userData.textKey = textKey;
  sprite.userData.texture.needsUpdate = true;
}

function createVillager(comment, index) {
  const group = new THREE.Group();
  group.userData.id = comment.id;
  const variant = [...String(comment.name || '')].reduce((sum, char) => sum + char.codePointAt(0), 0) % 4;
  const skin = mat(palette.skin[variant]);
  const clothes = mat(palette.clothes[variant]);
  const hair = mat([0x4d3427, 0x2f2824, 0x633d2c, 0x503e38][variant]);
  const body = mesh(new THREE.CapsuleGeometry(0.36, 0.55, 3, 6), clothes);
  body.position.y = 1.05;
  group.add(body);
  const head = mesh(new THREE.SphereGeometry(0.35, 8, 6), skin);
  head.position.y = 1.75;
  group.add(head);
  const hairCap = mesh(new THREE.SphereGeometry(0.37, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), hair);
  hairCap.position.y = 1.85;
  group.add(hairCap);
  const leftLeg = addBox(group, [0.16, 0.58, 0.16], [-0.16, 0.38, 0], clothes);
  const rightLeg = addBox(group, [0.16, 0.58, 0.16], [0.16, 0.38, 0], clothes);
  leftLeg.userData.leg = 'left'; rightLeg.userData.leg = 'right';
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ color: 0x466044, transparent: true, opacity: 0.18, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);
  group.userData.legs = [leftLeg, rightLeg];
  const speech = createSpeech(comment);
  group.userData.speech = speech;
  group.add(speech);
  group.userData.comment = comment;
  group.userData.index = index;
  group.scale.setScalar(0.82);
  villagersRoot.add(group);
  const position = queuePosition(index);
  group.position.copy(position);
  return group;
}

function queuePosition(index) {
  return new THREE.Vector3(0, 0, 2.55 + index * 1.15);
}

function updateVillager(group, comment, index, now) {
  group.userData.comment = comment;
  group.userData.index = index;
  updateSpeech(group.userData.speech, comment);
  const target = queuePosition(index);
  const moving = group.position.distanceToSquared(target) > 0.001;
  group.position.lerp(target, reducedMotion ? 1 : Math.min(1, 0.16 + (now - lastTime) * 0.004));
  const phase = now * 0.009 + index * 0.7;
  const [left, right] = group.userData.legs;
  const stride = moving && !reducedMotion ? Math.sin(phase) * 0.45 : 0;
  left.rotation.x = stride;
  right.rotation.x = -stride;
  group.rotation.y = moving ? (target.x - group.position.x) * 0.35 : 0;
}

function disposeObject(object) {
  object.traverse(item => {
    if (item.geometry) item.geometry.dispose();
    if (item.material && !shared.has(item.material)) {
      if (item.material.map) item.material.map.dispose();
      if (Array.isArray(item.material)) item.material.forEach(material => material.dispose());
      else item.material.dispose();
    }
  });
}

function render(now = performance.now()) {
  if (!renderer) return;
  const delta = Math.min(100, now - lastTime);
  lastTime = now;
  if (pakKades) {
    const phase = now * 0.0022;
    pakKades.position.y = pakKades.userData.baseY + Math.sin(phase) * 0.025;
    const [leftArm, rightArm] = pakKades.userData.arms;
    leftArm.rotation.z = -0.2 + Math.sin(phase + Math.PI) * 0.035;
    rightArm.rotation.z = 0.2 + Math.sin(phase) * 0.035;
  }
  for (const record of villagers.values()) {
    if (record.departing) {
      const duration = reducedMotion ? REDUCED_DURATION : WALK_DURATION;
      record.elapsed += delta;
      const progress = Math.min(1, record.elapsed / duration);
      record.group.position.lerpVectors(record.start, record.end, progress);
      record.group.position.y = Math.sin(progress * Math.PI) * 0.05;
      const stride = reducedMotion ? 0 : Math.sin(now * 0.012) * 0.45;
      record.group.userData.legs[0].rotation.x = stride;
      record.group.userData.legs[1].rotation.x = -stride;
      record.group.rotation.y = Math.PI;
      if (progress >= 1) {
        villagersRoot.remove(record.group);
        disposeObject(record.group);
        villagers.delete(record.id);
      }
    } else updateVillager(record.group, record.comment, record.index, now);
  }
  renderer.render(scene, camera);
  frame = requestAnimationFrame(render);
}

function recordingMimeType() {
  const Recorder = globalThis.MediaRecorder;
  if (!Recorder) return '';
  for (const mimeType of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (!Recorder.isTypeSupported || Recorder.isTypeSupported(mimeType)) return mimeType;
  }
  return '';
}

function canRecord() {
  return Boolean(renderer?.domElement?.captureStream && typeof globalThis.MediaRecorder === 'function');
}

function recordingFilename(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `desa-komen-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.webm`;
}

function downloadRecording(blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = recordingFilename();
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function startRecording() {
  if (isRecording() || !canRecord()) return false;
  const Recorder = globalThis.MediaRecorder;
  let stream;
  try { stream = renderer.domElement.captureStream(30); }
  catch { return false; }
  const mimeType = recordingMimeType();
  try {
    recorder = mimeType ? new Recorder(stream, { mimeType }) : new Recorder(stream);
  } catch {
    stream.getTracks?.().forEach(track => track.stop());
    recorder = null;
    return false;
  }
  recordingChunks = [];
  recorder.ondataavailable = event => { if (event.data?.size) recordingChunks.push(event.data); };
  recorder.onerror = () => { recordingChunks = []; };
  recorder.onstop = () => {
    const current = recorder;
    const chunks = recordingChunks;
    recorder = null;
    recordingChunks = [];
    current?.stream?.getTracks?.().forEach(track => track.stop());
    if (chunks.length) downloadRecording(new Blob(chunks, { type: current?.mimeType || 'video/webm' }));
  };
  try {
    recorder.start();
  } catch {
    recorder.stream?.getTracks?.().forEach(track => track.stop());
    recorder = null;
    recordingChunks = [];
    return false;
  }
  return true;
}

function stopRecording() {
  if (!isRecording()) return false;
  recorder.stop();
  return true;
}

function isRecording() {
  return recorder?.state === 'recording';
}

function updateCamera() {
  if (!camera) return;
  const distance = cameraZoom * 1.65;
  const horizontal = Math.cos(cameraPitch) * distance;
  camera.position.set(
    cameraTarget.x + Math.sin(cameraYaw) * horizontal,
    cameraTarget.y + Math.sin(cameraPitch) * distance,
    cameraTarget.z + Math.cos(cameraYaw) * horizontal,
  );
  camera.lookAt(cameraTarget);
}

function recenter() {
  cameraTarget.set(0, 0.8, 0);
  cameraYaw = 0;
  cameraPitch = 0.82;
  cameraZoom = 7;
  updateCamera();
  resize();
}

function pointerDistance() {
  const values = [...pointers.values()];
  if (values.length < 2) return null;
  return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
}

function bindControls(canvas) {
  controlsCanvas = canvas;
  controls = {
    down(event) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture?.(event.pointerId);
      pointerStart = { x: event.clientX, y: event.clientY, targetX: cameraTarget.x, targetZ: cameraTarget.z, yaw: cameraYaw };
      pointerMoved = false;
      pinchDistance = pointerDistance();
    },
    move(event) {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size > 1) {
        const distance = pointerDistance();
        if (distance && pinchDistance) cameraZoom = THREE.MathUtils.clamp(cameraZoom * pinchDistance / distance, 4.2, 11);
        pinchDistance = distance;
        updateCamera();
        pointerMoved = true;
        return;
      }
      if (!pointerStart) return;
      const dx = event.clientX - pointerStart.x;
      const dy = event.clientY - pointerStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) pointerMoved = true;
      // Horizontal drag gives a restrained orbit; vertical drag pans over the map.
      cameraYaw = THREE.MathUtils.clamp(pointerStart.yaw - dx * 0.004, -0.75, 0.75);
      const scale = cameraZoom / Math.max(220, canvas.clientHeight);
      cameraTarget.x = THREE.MathUtils.clamp(pointerStart.targetX - dx * scale, -9.5, 9.5);
      cameraTarget.z = THREE.MathUtils.clamp(pointerStart.targetZ + dy * scale, -7, 7);
      updateCamera();
    },
    up(event) {
      const wasClick = !pointerMoved && pointers.size === 1;
      pointers.delete(event.pointerId);
      if (wasClick && (clickHandler || buildClickHandler) && camera && renderer) {
        const rect = canvas.getBoundingClientRect();
        const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects([...villagers.values()].map(record => record.group).concat([...buildPlots.values()]), true);
        const hit = hits.find(item => item.object.visible);
        if (hit) {
          let object = hit.object;
          while (object && !object.userData?.comment && !object.userData?.build) object = object.parent;
          if (object?.userData?.comment) clickHandler?.(object.userData.comment);
          else if (object?.userData?.build) buildClickHandler?.(object.userData.build);
        }
      }
      if (!pointers.size) { pointerStart = null; pinchDistance = null; }
    },
    wheel(event) { event.preventDefault(); cameraZoom = THREE.MathUtils.clamp(cameraZoom * Math.exp(event.deltaY * 0.001), 4.2, 11); updateCamera(); },
  };
  canvas.addEventListener('pointerdown', controls.down, { passive: true });
  canvas.addEventListener('pointermove', controls.move, { passive: true });
  canvas.addEventListener('pointerup', controls.up, { passive: true });
  canvas.addEventListener('pointercancel', controls.up, { passive: true });
  canvas.addEventListener('wheel', controls.wheel, { passive: false });
}

function unbindControls() {
  if (!controlsCanvas || !controls) return;
  controlsCanvas.removeEventListener('pointerdown', controls.down);
  controlsCanvas.removeEventListener('pointermove', controls.move);
  controlsCanvas.removeEventListener('pointerup', controls.up);
  controlsCanvas.removeEventListener('pointercancel', controls.up);
  controlsCanvas.removeEventListener('wheel', controls.wheel);
  pointers.clear(); pointerStart = null; pinchDistance = null; controlsCanvas = null; controls = null;
}

function init(container) {
  if (renderer) return true;
  if (!container) return false;
  reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const canvas = container.querySelector('#world-canvas') || document.createElement('canvas');
  if (!canvas.parentElement) container.prepend(canvas);
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    renderer = null;
    return false;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'world-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe8ce);
  camera = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 100);
  recenter();
  scene.add(new THREE.HemisphereLight(0xfaf4dc, 0x66805f, 2.2));
  const sun = new THREE.DirectionalLight(0xfff0c9, 2.4);
  sun.position.set(-7, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -14; sun.shadow.camera.right = 14; sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 40;
  scene.add(sun);
  createMaterials();
  root = buildVillage();
  villagersRoot = new THREE.Group();
  root.add(villagersRoot);
  scene.add(root);
  bindControls(canvas);
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
  }
  resize();
  frame = requestAnimationFrame(render);
  return true;
}

function resize() {
  if (!renderer || !renderer.domElement.parentElement) return;
  const parent = renderer.domElement.parentElement;
  const width = Math.max(1, parent.clientWidth);
  const height = Math.max(1, parent.clientHeight);
  const aspect = width / height;
  const view = 7;
  camera.left = -view * aspect;
  camera.right = view * aspect;
  camera.top = view;
  camera.bottom = -view;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function setVillagers(comments = []) {
  if (!renderer) return;
  const visible = comments.slice(0, 30);
  const ids = new Set(visible.map(comment => comment.id));
  for (const [id, record] of villagers) {
    if (!ids.has(id) && !record.departing) {
      villagersRoot.remove(record.group);
      disposeObject(record.group);
      villagers.delete(id);
    }
  }
  visible.forEach((comment, index) => {
    const existing = villagers.get(comment.id);
    if (existing && !existing.departing) {
      existing.index = index;
      existing.comment = comment;
    } else if (!existing) villagers.set(comment.id, { id: comment.id, group: createVillager(comment, index), comment, index, departing: false });
  });
}

function setTotalFollowers(value) {
  const numeric = Number(value);
  totalFollowers = Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  updateTotalBoard(totalFollowers);
}

function depart(id, replyText) {
  const record = villagers.get(id);
  if (!record || record.departing) return false;
  if (replyText && headReplySpeech) {
    clearTimeout(headReplyTimer);
    updateSpeech(headReplySpeech, { name: 'Pak Kades', text: replyText });
    headReplySpeech.visible = true;
    headReplyTimer = setTimeout(() => {
      if (headReplySpeech) headReplySpeech.visible = false;
      headReplyTimer = null;
    }, HEAD_REPLY_DURATION);
  }
  record.departing = true;
  record.elapsed = 0;
  record.start = record.group.position.clone();
  record.end = new THREE.Vector3(7.5, 0, 8.5);
  return true;
}

function dispose() {
  if (!renderer) return;
  if (isRecording()) stopRecording();
  cancelAnimationFrame(frame);
  unbindControls();
  clearTimeout(headReplyTimer);
  headReplyTimer = null;
  resizeObserver?.disconnect();
  disposeObject(scene);
  shared.forEach(material => material.dispose());
  shared.clear();
  materialCache.clear();
  materials = {};
  renderer.dispose();
  renderer.domElement.remove();
  renderer = null; scene = null; camera = null; root = null; villagersRoot = null;
  pakKades = null;
  headReplySpeech = null;
  totalBoard = null;
  totalFollowers = null;
  villagers.clear();
  buildPlots.clear();
}

function setClickHandler(handler) { clickHandler = typeof handler === 'function' ? handler : null; }
function setBuildClickHandler(handler) { buildClickHandler = typeof handler === 'function' ? handler : null; }

export const scene3d = { init, setVillagers, setTotalFollowers, setBuilds, depart, resize, dispose, recenter, setClickHandler, setBuildClickHandler, canRecord, startRecording, stopRecording, isRecording };
export { init, setVillagers, setTotalFollowers, setBuilds, depart, resize, dispose, recenter, setClickHandler, setBuildClickHandler, canRecord, startRecording, stopRecording, isRecording };
