import * as THREE from 'three';

const WALK_DURATION = 5400;
const REDUCED_DURATION = 350;
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
let totalBoard;
let totalFollowers = null;
let frame = 0;
let resizeObserver;
let lastTime = 0;
let reducedMotion = false;
const villagers = new Map();
const shared = new Set();
const materialCache = new Map();
let materials = {};

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
  const ground = new THREE.Mesh(new THREE.BoxGeometry(18, 0.35, 13), materials.grass);
  ground.position.y = -0.18;
  ground.receiveShadow = true;
  group.add(ground);
  const path = new THREE.Mesh(new THREE.BoxGeometry(4, 0.08, 11), materials.path);
  path.position.set(0, 0.04, 1.2);
  path.rotation.y = -0.12;
  path.receiveShadow = true;
  group.add(path);
  group.add(buildReception());
  [[-6, -3, 1.3], [6, -2, 1.2], [-6, 4, 0.9], [6, 5, 1.1], [-3.8, 5.1, 0.8], [4, 1.5, 0.7]].forEach(item => group.add(buildTree(...item)));
  for (const [x, z] of [[-4.3, -0.5], [4.5, -1], [-5, 3.1], [5.3, 3.8]]) {
    const bush = mesh(new THREE.IcosahedronGeometry(0.65, 1), materials.leafLight);
    bush.position.set(x, 0.55, z);
    group.add(bush);
  }
  return group;
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
  camera = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 80);
  camera.position.set(11, 11, 11);
  camera.lookAt(0, 0.8, 0);
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
  if (replyText) updateSpeech(record.group.userData.speech, { name: 'Pak Kades', text: replyText });
  record.departing = true;
  record.elapsed = 0;
  record.start = record.group.position.clone();
  record.end = new THREE.Vector3(7.5, 0, 8.5);
  return true;
}

function dispose() {
  if (!renderer) return;
  cancelAnimationFrame(frame);
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
  totalBoard = null;
  totalFollowers = null;
  villagers.clear();
}

export const scene3d = { init, setVillagers, setTotalFollowers, depart, resize, dispose };
export { init, setVillagers, setTotalFollowers, depart, resize, dispose };
