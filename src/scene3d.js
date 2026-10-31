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

function buildHouse() {
  const group = new THREE.Group();
  group.position.set(0, 0, -4.1);
  group.add(addBox(group, [3.7, 2.2, 2.8], [0, 1.1, 0], materials.wall));
  const roof = mesh(new THREE.ConeGeometry(2.9, 1.45, 4), materials.roof);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2.9;
  group.add(roof);
  addBox(group, [0.72, 1.18, 0.12], [0, 0.6, 1.42], materials.wood);
  for (const x of [-1.12, 1.12]) {
    addBox(group, [0.72, 0.62, 0.12], [x, 1.35, 1.42], materials.window);
    addBox(group, [0.08, 0.62, 0.14], [x, 1.35, 1.48], materials.wood, [0, 0, 0]);
  }
  const sign = addBox(group, [2.5, 0.35, 0.08], [0, 2.12, 1.48], materials.wood);
  sign.userData.label = 'RUMAH PAK KADES';
  return group;
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
  group.add(buildHouse());
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
  canvas.width = 384;
  canvas.height = 188;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.55, 1.25, 1);
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
  context.lineWidth = 5;
  roundedRect(context, 8, 8, canvas.width - 16, canvas.height - 34, 20);
  context.fill();
  context.stroke();
  context.fillStyle = '#fffdf0';
  context.beginPath();
  context.moveTo(52, canvas.height - 28);
  context.lineTo(78, canvas.height - 4);
  context.lineTo(104, canvas.height - 28);
  context.closePath();
  context.fill();
  context.strokeStyle = '#d2d6b8';
  context.stroke();
  context.fillStyle = '#7b9468';
  context.font = '700 19px DM Sans, sans-serif';
  context.fillText(String(comment.name || 'Warga').slice(0, 22), 30, 38);
  context.fillStyle = '#4e654d';
  context.font = '500 18px DM Sans, sans-serif';
  wrapSpeech(comment.text).forEach((line, index) => context.fillText(line, 30, 72 + index * 27));
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
  const spread = 1.1;
  return new THREE.Vector3(((index % 2) ? 0.62 : -0.62), 0, 4.35 + Math.floor(index / 2) * spread);
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
  villagers.clear();
}

export const scene3d = { init, setVillagers, depart, resize, dispose };
export { init, setVillagers, depart, resize, dispose };
