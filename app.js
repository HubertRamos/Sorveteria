import * as THREE from '/vendor/three.module.min.js';

const MAX_TURNS = 6;
const REGULAR_TURNS = 3;

const FLAVOURS = {
  vanilla: {
    label: 'Baunilha',
    color: new THREE.Color('#f4e8cd'),
    emissive: new THREE.Color('#2a2114'),
    flatFill: '#f5ebd3',
  },
  strawberry: {
    label: 'Morango',
    color: new THREE.Color('#eba0b0'),
    emissive: new THREE.Color('#301219'),
    flatFill: '#eb9cab',
  },
  pistachio: {
    label: 'Pistache',
    color: new THREE.Color('#b9d79b'),
    emissive: new THREE.Color('#192813'),
    flatFill: '#b9d89c',
  },
};

const SPRINKLE_COLORS = [
  0xb8332a, // primary red
  0x9fc87d, // pistachio
  0xe790a2, // strawberry
  0xe6a13c, // amber
  0xfdfaf0, // paper cream
  0x4f78a8, // retro blue
];

const CHECK_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';

const SHARE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-share2 lucide-share-2" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"></line><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"></line></svg>';

const state = {
  selectedFlavour: 'vanilla',
  pourProgress: 0, // 0..6 continuous
  segments: [], // flavour key per 0.05 turn step (up to 120 steps)
  sprinkles: false,
  pearls: false,
  isPouring: false,
  autoTargetTurns: null,
  spinAngle: 0,
  spinVelocity: 0.28,
  toppingDropProgress: { sprinkles: 1, pearls: 1 },
  copyResetTimer: null,
};

const STEPS_PER_TURN = 20;
const MAX_STEPS = MAX_TURNS * STEPS_PER_TURN;

// DOM references
const stageEl = document.querySelector('.machine-stage');
const chamberEl = document.querySelector('.chamber-render');
const canvasEl = chamberEl?.querySelector('canvas');
const lampEl = document.querySelector('.amber-lamp');
const leverBtn = document.querySelector('.lever-control');
const sprinklesBtn = document.querySelector('.sprinkles-control');
const pearlsBtn = document.querySelector('.pearls-control');
const flavourBtns = {
  vanilla: document.querySelector('.flavour-vanilla'),
  strawberry: document.querySelector('.flavour-strawberry'),
  pistachio: document.querySelector('.flavour-pistachio'),
};
const receiptEl = document.querySelector('.receipt');
const receiptRows = receiptEl ? receiptEl.querySelectorAll('.receipt-row') : [];
const receiptFlavourVal = receiptRows[0]?.querySelector('span:last-child');
const receiptTurnsVal = receiptRows[1]?.querySelector('span:last-child');
const receiptToppingsVal = receiptRows[2]?.querySelector('span:last-child');
const receiptButtons = receiptEl ? receiptEl.querySelectorAll('button') : [];
const sendBtn = receiptButtons[0];
const resetBtn = receiptButtons[1];
const bottomTurnsEl = document.querySelector('.machine-bottom > div > span');
const regularConeBtn = document.querySelector('.machine-bottom > div > button');
const statusEl = document.querySelector('#machine [role="status"]');

// URL Recipe Encoding / Decoding
const FLAVOUR_CODES = { v: 'vanilla', s: 'strawberry', p: 'pistachio' };
const FLAVOUR_SHORT = { vanilla: 'v', strawberry: 's', pistachio: 'p' };

function encodeConeRecipe() {
  const turns = getDisplayTurns();
  if (turns === 0) return '';
  // Compress segments into per-half-turn or per-turn run-length encoding
  const turnFlavours = [];
  for (let t = 0; t < turns; t++) {
    const sampleIdx = Math.min(state.segments.length - 1, Math.floor((t + 0.5) * STEPS_PER_TURN));
    const f = state.segments[sampleIdx] || state.selectedFlavour;
    turnFlavours.push(FLAVOUR_SHORT[f] || 'v');
  }
  let topCode = '';
  if (state.sprinkles) topCode += 's';
  if (state.pearls) topCode += 'p';
  return topCode ? `${turnFlavours.join('')}.${topCode}` : turnFlavours.join('');
}

function loadConeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('cone');
  if (!raw) return;
  const [flavourPart, topPart = ''] = raw.split('.');
  const chars = [...(flavourPart || '')].filter((c) => FLAVOUR_CODES[c]).slice(0, MAX_TURNS);
  if (chars.length === 0) return;

  state.segments = [];
  chars.forEach((c) => {
    const fl = FLAVOUR_CODES[c];
    for (let i = 0; i < STEPS_PER_TURN; i++) {
      state.segments.push(fl);
    }
  });
  state.pourProgress = chars.length;
  state.selectedFlavour = FLAVOUR_CODES[chars[chars.length - 1]];
  state.sprinkles = topPart.includes('s');
  state.pearls = topPart.includes('p');
  state.toppingDropProgress.sprinkles = 1;
  state.toppingDropProgress.pearls = 1;
}

function getDisplayTurns() {
  if (state.pourProgress <= 0.01) return 0;
  return Math.min(MAX_TURNS, Math.max(1, Math.round(state.pourProgress)));
}

function getUsedFlavourSummary() {
  if (state.segments.length === 0) {
    return FLAVOURS[state.selectedFlavour].label;
  }
  const seen = [];
  for (const fl of state.segments) {
    if (!seen.includes(fl)) seen.push(fl);
  }
  return seen.map((k) => FLAVOURS[k].label).join(' + ');
}

function announce(text) {
  if (statusEl) statusEl.textContent = text;
}

function updateUI() {
  const turns = getDisplayTurns();
  const hasCone = turns > 0;
  const isFull = state.pourProgress >= MAX_TURNS - 0.001;

  // Flavour buttons
  for (const [key, btn] of Object.entries(flavourBtns)) {
    if (!btn) continue;
    const active = state.selectedFlavour === key;
    btn.classList.toggle('selected', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    const existingSvg = btn.querySelector('svg');
    if (active && !existingSvg) {
      btn.insertAdjacentHTML('afterbegin', CHECK_ICON_SVG);
    } else if (!active && existingSvg) {
      existingSvg.remove();
    }
  }

  // Amber lamp lights when pouring or when cone has soft serve
  if (lampEl) {
    lampEl.classList.toggle('lit', state.isPouring || hasCone);
  }

  // Lever button state
  if (leverBtn) {
    leverBtn.disabled = isFull;
    const span = leverBtn.querySelector('span');
    if (span) {
      span.textContent = isFull ? 'Cone full' : state.isPouring ? 'Swirling…' : 'Segure para servir';
    }
  }

  // Hopper buttons
  if (sprinklesBtn) {
    sprinklesBtn.disabled = !hasCone;
    sprinklesBtn.classList.toggle('selected', state.sprinkles);
    sprinklesBtn.setAttribute('aria-pressed', state.sprinkles ? 'true' : 'false');
    const span = sprinklesBtn.querySelector('span');
    if (span) span.textContent = state.sprinkles ? 'Sprinkles ✓' : 'Adicionar confeitos';
  }
  if (pearlsBtn) {
    pearlsBtn.disabled = !hasCone;
    pearlsBtn.classList.toggle('selected', state.pearls);
    pearlsBtn.setAttribute('aria-pressed', state.pearls ? 'true' : 'false');
    const span = pearlsBtn.querySelector('span');
    if (span) span.textContent = state.pearls ? 'Pearls ✓' : 'Adicionar pérolas';
  }

  // Cone drop CSS variable so taller cones have room below the nozzle
  if (chamberEl) {
    const dropPct = Math.min(18, (state.pourProgress / MAX_TURNS) * 18);
    chamberEl.style.setProperty('--cone-drop', `${dropPct.toFixed(2)}%`);
  }

  // Receipt
  if (receiptFlavourVal) receiptFlavourVal.textContent = getUsedFlavourSummary();
  if (receiptTurnsVal) receiptTurnsVal.textContent = `${turns} / ${MAX_TURNS}`;
  if (receiptToppingsVal) {
    const list = [];
    if (state.sprinkles) list.push('Sprinkles');
    if (state.pearls) list.push('Pearls');
    receiptToppingsVal.textContent = list.length ? list.join(', ') : 'Nenhuma';
  }
  if (sendBtn && !state.copyResetTimer) {
    sendBtn.disabled = !hasCone;
  }

  // Bottom bar
  if (bottomTurnsEl) {
    bottomTurnsEl.textContent = `${turns} de ${MAX_TURNS} voltas`;
  }
  if (regularConeBtn) {
    regularConeBtn.disabled = state.pourProgress >= REGULAR_TURNS && !state.autoTargetTurns;
  }
}

// ============================================================
// Three.js 3D Soft-Serve Swirl Renderer (with 2D fallback)
// ============================================================
let renderer = null;
let scene = null;
let camera = null;
let swirlGroup = null;
let swirlMesh = null;
let streamMesh = null;
let sprinklesGroup = null;
let pearlsGroup = null;
let useFallback2D = false;

function buildSwirlGeometry(progress, segments) {
  if (progress <= 0.02) return null;

  const totalSteps = Math.max(8, Math.round(progress * 44));
  const radialSegs = 30; // enough for 8 fluted star ridges
  const fluteCount = 8;

  // Height scales smoothly with progress (max ~2.15 units in scene space)
  const totalHeight = 0.36 + (progress / MAX_TURNS) * 1.75;
  const maxTurnRad = 0.56;
  const minTurnRad = 0.03;

  const positions = [];
  const colors = [];
  const indices = [];

  for (let i = 0; i <= totalSteps; i++) {
    const t = i / totalSteps; // 0 at cone rim -> 1 at peak
    const y = t * totalHeight;

    // Helical spiral: number of loops increases with progress
    const loops = Math.max(0.7, progress * 0.92);
    const spiralAngle = t * loops * Math.PI * 2;

    // Centerline spiral radius tapers gracefully to a point at the top
    const envelope = Math.pow(1 - t, 0.72);
    const centerRadius = (0.31 * envelope) * Math.min(1, 0.55 + progress * 0.12);
    const cx = Math.cos(spiralAngle) * centerRadius;
    const cz = Math.sin(spiralAngle) * centerRadius;

    // Tube thickness also tapers at bottom (tuck into cone) and top (soft peak)
    const baseThick = 0.255 * Math.pow(1 - t * 0.86, 0.68);
    const tipPinch = t > 0.88 ? 1 - ((t - 0.88) / 0.12) * 0.75 : 1;
    const tubeRadius = Math.max(minTurnRad, baseThick * tipPinch);

    // Flavour color at this step
    const segIdx = Math.min(segments.length - 1, Math.floor(t * Math.max(0, segments.length - 1)));
    const flKey = segments[segIdx] || state.selectedFlavour;
    const baseColor = FLAVOURS[flKey].color;

    for (let j = 0; j <= radialSegs; j++) {
      const phi = (j / radialSegs) * Math.PI * 2;
      // Star nozzle fluting
      const flute = 1 + 0.14 * Math.cos(fluteCount * phi + spiralAngle * 0.6);
      const r = tubeRadius * flute;

      // Cross-section oriented outward from spiral center + upward
      const nx = Math.cos(spiralAngle) * Math.cos(phi);
      const nz = Math.sin(spiralAngle) * Math.cos(phi);
      const ny = Math.sin(phi);

      const vx = cx + nx * r;
      const vy = y + ny * r * 0.82;
      const vz = cz + nz * r;

      positions.push(vx, vy, vz);

      // Subtle warm shading gradient so flutes read richly
      const shade = 0.96 + 0.06 * Math.sin(phi);
      colors.push(
        Math.min(1, baseColor.r * shade),
        Math.min(1, baseColor.g * shade),
        Math.min(1, baseColor.b * shade)
      );
    }
  }

  const ringStride = radialSegs + 1;
  for (let i = 0; i < totalSteps; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * ringStride + j;
      const b = (i + 1) * ringStride + j;
      const c = (i + 1) * ringStride + (j + 1);
      const d = i * ringStride + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  // Cap top peak cleanly
  const topCenterIdx = positions.length / 3;
  const topT = 1;
  const topLoop = Math.max(0.7, progress * 0.92) * Math.PI * 2;
  positions.push(0, totalHeight + 0.07, 0);
  const lastFl = segments[segments.length - 1] || state.selectedFlavour;
  const tc = FLAVOURS[lastFl].color;
  colors.push(tc.r, tc.g, tc.b);

  const lastRingStart = totalSteps * ringStride;
  for (let j = 0; j < radialSegs; j++) {
    indices.push(lastRingStart + j, topCenterIdx, lastRingStart + j + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return { geo, totalHeight, topX: Math.cos(topLoop) * 0.02, topZ: Math.sin(topLoop) * 0.02 };
}

function deterministicRand(seed) {
  let x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function rebuildToppings(totalHeight) {
  if (!sprinklesGroup || !pearlsGroup) return;

  sprinklesGroup.clear();
  pearlsGroup.clear();

  if (state.pourProgress <= 0.1 || totalHeight <= 0.1) return;

  const progress = state.pourProgress;
  const loops = Math.max(0.7, progress * 0.92);

  if (state.sprinkles) {
    const count = Math.min(100, Math.floor(24 + progress * 13));
    const sprinkleGeo = new THREE.CapsuleGeometry(0.017, 0.055, 4, 8);
    for (let i = 0; i < count; i++) {
      const r1 = deterministicRand(i + 1);
      const r2 = deterministicRand(i + 101);
      const r3 = deterministicRand(i + 201);

      const t = 0.08 + r1 * 0.86;
      const y = t * totalHeight;
      const spiralAngle = t * loops * Math.PI * 2;
      const envelope = Math.pow(1 - t, 0.72);
      const centerRadius = (0.31 * envelope) * Math.min(1, 0.55 + progress * 0.12);
      const tubeRadius = Math.max(0.04, 0.255 * Math.pow(1 - t * 0.86, 0.68));

      const phi = (r2 - 0.5) * Math.PI * 1.1; // outward face
      const surfaceR = centerRadius + Math.cos(phi) * tubeRadius * 1.03;
      const angle = spiralAngle + (r3 - 0.5) * 0.8;

      const mat = new THREE.MeshStandardMaterial({
        color: SPRINKLE_COLORS[i % SPRINKLE_COLORS.length],
        roughness: 0.32,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(sprinkleGeo, mat);
      mesh.position.set(
        Math.cos(angle) * surfaceR,
        y + Math.sin(phi) * tubeRadius * 0.78,
        Math.sin(angle) * surfaceR
      );
      mesh.rotation.set(r1 * Math.PI, r2 * Math.PI, r3 * Math.PI);
      mesh.userData.targetY = mesh.position.y;
      sprinklesGroup.add(mesh);
    }
  }

  if (state.pearls) {
    const count = Math.min(60, Math.floor(14 + progress * 8));
    const pearlGeo = new THREE.SphereGeometry(0.032, 12, 12);
    const pearlMat = new THREE.MeshStandardMaterial({
      color: 0x3b2216,
      roughness: 0.18,
      metalness: 0.15,
    });
    for (let i = 0; i < count; i++) {
      const r1 = deterministicRand(i + 501);
      const r2 = deterministicRand(i + 601);
      const r3 = deterministicRand(i + 701);

      const t = 0.08 + r1 * 0.85;
      const y = t * totalHeight;
      const spiralAngle = t * loops * Math.PI * 2;
      const envelope = Math.pow(1 - t, 0.72);
      const centerRadius = (0.31 * envelope) * Math.min(1, 0.55 + progress * 0.12);
      const tubeRadius = Math.max(0.04, 0.255 * Math.pow(1 - t * 0.86, 0.68));

      const phi = (r2 - 0.4) * Math.PI * 1.0;
      const surfaceR = centerRadius + Math.cos(phi) * tubeRadius * 1.02;
      const angle = spiralAngle + (r3 - 0.5) * 0.9;

      const mesh = new THREE.Mesh(pearlGeo, pearlMat);
      mesh.position.set(
        Math.cos(angle) * surfaceR,
        y + Math.sin(phi) * tubeRadius * 0.8,
        Math.sin(angle) * surfaceR
      );
      mesh.userData.targetY = mesh.position.y;
      pearlsGroup.add(mesh);
    }
  }
}

let lastGeometryKey = '';
let lastToppingsKey = '';

function syncSwirlMeshes() {
  if (useFallback2D) {
    renderFallback2D();
    return;
  }
  if (!swirlGroup) return;

  const roundedStep = Math.round(state.pourProgress * 30);
  const geomKey = `${roundedStep}:${state.segments.length}:${state.selectedFlavour}`;

  let currentHeight = 0;
  if (geomKey !== lastGeometryKey) {
    lastGeometryKey = geomKey;
    if (swirlMesh) {
      swirlMesh.geometry.dispose();
      swirlGroup.remove(swirlMesh);
      swirlMesh = null;
    }

    const built = buildSwirlGeometry(state.pourProgress, state.segments);
    if (built) {
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.36,
        metalness: 0.02,
      });
      swirlMesh = new THREE.Mesh(built.geo, mat);
      swirlGroup.add(swirlMesh);
      currentHeight = built.totalHeight;
      swirlGroup.userData.totalHeight = currentHeight;
    } else {
      swirlGroup.userData.totalHeight = 0;
    }
  } else {
    currentHeight = swirlGroup.userData.totalHeight || 0;
  }

  // Pouring stream from nozzle down to swirl top
  if (streamMesh) {
    streamMesh.visible = state.isPouring && state.pourProgress < MAX_TURNS;
    if (streamMesh.visible) {
      const flColor = FLAVOURS[state.selectedFlavour].color;
      streamMesh.material.color.copy(flColor);
      const dropNorm = Math.min(18, (state.pourProgress / MAX_TURNS) * 18) / 100;
      const coneRimY = -0.35 - dropNorm * 2.2;
      const topY = coneRimY + currentHeight;
      const nozzleY = 1.65;
      const streamLen = Math.max(0.1, nozzleY - topY);
      streamMesh.scale.set(1, streamLen, 1);
      streamMesh.position.y = topY + streamLen * 0.5;
    }
  }

  // Position swirlGroup right at the waffle cone's top rim (accounting for --cone-drop)
  const dropPct = Math.min(18, (state.pourProgress / MAX_TURNS) * 18);
  // At drop=0%, cone rim is around y = 0.62 in camera space; moves down proportionally with dropPct
  const coneRimWorldY = 0.66 - (dropPct / 100) * 3.1;
  swirlGroup.position.y = coneRimWorldY;

  const toppingsKey = `${Math.floor(state.pourProgress * 6)}:${state.sprinkles}:${state.pearls}`;
  if (toppingsKey !== lastToppingsKey) {
    lastToppingsKey = toppingsKey;
    rebuildToppings(currentHeight);
  }
}

function initThree() {
  if (!canvasEl || !chamberEl) return;

  // Reset inline fixed pixel sizes from saved snapshot
  canvasEl.removeAttribute('width');
  canvasEl.removeAttribute('height');
  canvasEl.style.width = '100%';
  canvasEl.style.height = '100%';

  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvasEl,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch {
    useFallback2D = true;
    return;
  }

  if (!renderer) {
    useFallback2D = true;
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  scene = new THREE.Scene();

  // Perspective camera aligned to match machine chamber front-on view
  camera = new THREE.PerspectiveCamera(34, 1.4, 0.1, 20);
  camera.position.set(0, 0.65, 5.2);
  camera.lookAt(0, 0.55, 0);

  // Warm stainless-bay lighting matching the two recessed chamber lamps
  const ambient = new THREE.AmbientLight(0xfff4e6, 1.45);
  scene.add(ambient);

  const leftLamp = new THREE.DirectionalLight(0xffdfb8, 1.55);
  leftLamp.position.set(-2.2, 3.2, 2.5);
  scene.add(leftLamp);

  const rightLamp = new THREE.DirectionalLight(0xffdcb0, 1.4);
  rightLamp.position.set(2.2, 3.0, 2.2);
  scene.add(rightLamp);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.65);
  rimLight.position.set(0, 1.5, -2.5);
  scene.add(rimLight);

  swirlGroup = new THREE.Group();
  sprinklesGroup = new THREE.Group();
  pearlsGroup = new THREE.Group();
  swirlGroup.add(sprinklesGroup);
  swirlGroup.add(pearlsGroup);
  scene.add(swirlGroup);

  // Continuous pouring stream mesh
  const streamGeo = new THREE.CylinderGeometry(0.095, 0.115, 1, 14);
  const streamMat = new THREE.MeshStandardMaterial({
    color: FLAVOURS.vanilla.color,
    roughness: 0.32,
    metalness: 0.02,
  });
  streamMesh = new THREE.Mesh(streamGeo, streamMat);
  streamMesh.visible = false;
  scene.add(streamMesh);

  handleResize();
}

function handleResize() {
  if (!chamberEl || !canvasEl) return;
  const rect = chamberEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  if (useFallback2D) {
    canvasEl.width = Math.round(rect.width * (window.devicePixelRatio || 1));
    canvasEl.height = Math.round(rect.height * (window.devicePixelRatio || 1));
    renderFallback2D();
    return;
  }

  if (renderer && camera) {
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  }
}

function renderFallback2D() {
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');
  if (!ctx) return;
  const w = canvasEl.width;
  const h = canvasEl.height;
  ctx.clearRect(0, 0, w, h);
  const turns = getDisplayTurns();
  if (turns === 0) return;

  const dropPct = Math.min(18, (state.pourProgress / MAX_TURNS) * 18) / 100;
  const baseRimY = h * (0.24 + dropPct);
  const cx = w * 0.5;
  const maxWidth = w * 0.21;
  const stepH = (h * 0.24) / MAX_TURNS;

  for (let i = 0; i < turns; i++) {
    const t = i / MAX_TURNS;
    const rw = maxWidth * (1 - t * 0.72);
    const rh = stepH * 1.15;
    const cy = baseRimY - i * stepH * 0.75;
    const sampleIdx = Math.min(state.segments.length - 1, Math.floor((i + 0.5) * STEPS_PER_TURN));
    const fl = state.segments[sampleIdx] || state.selectedFlavour;
    ctx.fillStyle = FLAVOURS[fl].flatFill;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw * 0.5, rh * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============================================================
// Interaction & Animation Loop
// ============================================================
let lastTime = performance.now();

function stepAnimation(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  // Pouring logic (manual hold or "Make a regular cone" auto-pour)
  const pouringActive = state.isPouring || state.autoTargetTurns !== null;
  if (pouringActive) {
    const targetMax = state.autoTargetTurns !== null ? state.autoTargetTurns : MAX_TURNS;
    if (state.pourProgress < targetMax) {
      const rate = 1.85; // turns per second
      const next = Math.min(targetMax, state.pourProgress + rate * dt);
      const targetSteps = Math.min(MAX_STEPS, Math.ceil(next * STEPS_PER_TURN));
      while (state.segments.length < targetSteps) {
        state.segments.push(state.selectedFlavour);
      }
      state.pourProgress = next;
      state.spinVelocity = 1.9;
      updateUI();
    } else {
      if (state.autoTargetTurns !== null) {
        state.autoTargetTurns = null;
        state.isPouring = false;
        announce(`Casquinha tradicional de ${FLAVOURS[state.selectedFlavour].label} pronta.`);
      } else {
        state.isPouring = false;
        announce('Casquinha pronta! Adicione coberturas ou compartilhe com alguém.');
      }
      updateUI();
    }
  } else {
    state.spinVelocity += (0.24 - state.spinVelocity) * Math.min(1, dt * 4);
  }

  state.spinAngle += state.spinVelocity * dt;

  // Animate topping drop-in
  ['sprinkles', 'pearls'].forEach((key) => {
    if (state.toppingDropProgress[key] < 1) {
      state.toppingDropProgress[key] = Math.min(1, state.toppingDropProgress[key] + dt * 3.5);
    }
  });

  syncSwirlMeshes();

  if (!useFallback2D && renderer && scene && camera) {
    if (swirlGroup) {
      swirlGroup.rotation.y = state.spinAngle;
    }
    if (sprinklesGroup) {
      const p = state.toppingDropProgress.sprinkles;
      const offset = (1 - p) * (1 - p) * 0.55;
      sprinklesGroup.position.y = offset;
    }
    if (pearlsGroup) {
      const p = state.toppingDropProgress.pearls;
      const offset = (1 - p) * (1 - p) * 0.55;
      pearlsGroup.position.y = offset;
    }
    renderer.render(scene, camera);
  }

  requestAnimationFrame(stepAnimation);
}

// ============================================================
// Event Handlers
// ============================================================
function selectFlavour(key) {
  if (!FLAVOURS[key]) return;
  state.selectedFlavour = key;
  updateUI();
  announce(`${FLAVOURS[key].label} selected. Ready to pour.`);
}

for (const [key, btn] of Object.entries(flavourBtns)) {
  btn?.addEventListener('click', () => selectFlavour(key));
}

function startPouring() {
  if (state.pourProgress >= MAX_TURNS - 0.001) return;
  state.autoTargetTurns = null;
  state.isPouring = true;
  // Ensure at least a tiny tap registers 1 turn smoothly
  if (state.segments.length === 0) {
    for (let i = 0; i < 4; i++) state.segments.push(state.selectedFlavour);
    state.pourProgress = 0.2;
  }
  updateUI();
}

function stopPouring() {
  if (!state.isPouring) return;
  state.isPouring = false;
  // Snap cleanly to whole turn if close, or at least 1 turn if started
  if (state.pourProgress > 0 && state.pourProgress < 1) {
    while (state.segments.length < STEPS_PER_TURN) {
      state.segments.push(state.selectedFlavour);
    }
    state.pourProgress = 1;
  } else {
    const snapped = Math.min(MAX_TURNS, Math.round(state.pourProgress));
    const targetSteps = snapped * STEPS_PER_TURN;
    while (state.segments.length < targetSteps) state.segments.push(state.selectedFlavour);
    if (state.segments.length > targetSteps) state.segments.length = targetSteps;
    state.pourProgress = snapped;
  }
  updateUI();
  const turns = getDisplayTurns();
  announce(`Poured ${turns} ${turns === 1 ? 'volta' : 'voltas'}.`);
}

if (leverBtn) {
  leverBtn.addEventListener('pointerdown', (e) => {
    if (leverBtn.disabled) return;
    e.preventDefault();
    leverBtn.setPointerCapture?.(e.pointerId);
    startPouring();
  });
  leverBtn.addEventListener('pointerup', stopPouring);
  leverBtn.addEventListener('pointercancel', stopPouring);
  leverBtn.addEventListener('lostpointercapture', stopPouring);
  leverBtn.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      startPouring();
    }
  });
  leverBtn.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      stopPouring();
    }
  });
}

sprinklesBtn?.addEventListener('click', () => {
  if (getDisplayTurns() === 0) return;
  state.sprinkles = !state.sprinkles;
  if (state.sprinkles) state.toppingDropProgress.sprinkles = 0;
  updateUI();
  announce(state.sprinkles ? 'Confeitos coloridos adicionados.' : 'Confeitos coloridos removidos.');
});

pearlsBtn?.addEventListener('click', () => {
  if (getDisplayTurns() === 0) return;
  state.pearls = !state.pearls;
  if (state.pearls) state.toppingDropProgress.pearls = 0;
  updateUI();
  announce(state.pearls ? 'Pérolas de chocolate adicionadas.' : 'Pérolas de chocolate removidas.');
});

regularConeBtn?.addEventListener('click', () => {
  if (state.pourProgress >= REGULAR_TURNS) return;
  state.isPouring = false;
  state.autoTargetTurns = REGULAR_TURNS;
  updateUI();
});

resetBtn?.addEventListener('click', () => {
  state.pourProgress = 0;
  state.segments = [];
  state.sprinkles = false;
  state.pearls = false;
  state.isPouring = false;
  state.autoTargetTurns = null;
  if (window.location.search.includes('cone=')) {
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, '', cleanUrl);
  }
  updateUI();
  announce('Casquinha limpa. Tudo pronto para montar outra.');
});

sendBtn?.addEventListener('click', async () => {
  const code = encodeConeRecipe();
  if (!code) return;
  const shareUrl = `${window.location.origin}${window.location.pathname}?cone=${code}`;
  window.history.replaceState({}, '', `?cone=${code}`);

  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      copied = true;
    }
  } catch {
    copied = false;
  }

  if (!copied) {
    try {
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      copied = document.execCommand('copy');
      ta.remove();
    } catch {
      copied = false;
    }
  }

  if (state.copyResetTimer) clearTimeout(state.copyResetTimer);
  sendBtn.innerHTML = `${CHECK_ICON_SVG} ${copied ? 'Link copiado!' : 'Link disponível na URL'}`;
  announce('Link do sorvete copiado.');
  state.copyResetTimer = setTimeout(() => {
    state.copyResetTimer = null;
    sendBtn.innerHTML = `${SHARE_ICON_SVG}Compartilhar sorvete`;
    updateUI();
  }, 2400);
});

// Interactive drag-to-spin on the cone chamber
if (chamberEl) {
  const dragTarget = chamberEl.querySelector('div') || chamberEl;
  let dragging = false;
  let lastX = 0;

  dragTarget.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    dragTarget.setPointerCapture?.(e.pointerId);
  });
  dragTarget.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    state.spinAngle += dx * 0.015;
    state.spinVelocity = dx * 0.06;
  });
  const endDrag = () => {
    dragging = false;
  };
  dragTarget.addEventListener('pointerup', endDrag);
  dragTarget.addEventListener('pointercancel', endDrag);
}

// Flavour section "Pour" links select that flavour when clicked
document.querySelectorAll('#flavours .flavour-row').forEach((row) => {
  const name = row.querySelector('h3')?.textContent?.trim().toLowerCase();
  const link = row.querySelector('a');
  if (name && FLAVOURS[name] && link) {
    link.addEventListener('click', () => {
      selectFlavour(name);
    });
  }
});

// Scroll-driven sprinkles video in #toppings
const toppingsSection = document.querySelector('#toppings');
const toppingsVideo = toppingsSection?.querySelector('video.film');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (toppingsSection && toppingsVideo) {
  toppingsVideo.muted = true;
  if (!prefersReducedMotion) {
    let ticking = false;
    const syncVideoToScroll = () => {
      ticking = false;
      if (!toppingsVideo.duration || Number.isNaN(toppingsVideo.duration)) return;
      const rect = toppingsSection.getBoundingClientRect();
      const scrollable = Math.max(1, toppingsSection.offsetHeight - window.innerHeight);
      const scrolled = Math.min(scrollable, Math.max(0, -rect.top));
      const ratio = scrolled / scrollable;
      toppingsVideo.currentTime = ratio * toppingsVideo.duration;
    };
    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(syncVideoToScroll);
        }
      },
      { passive: true }
    );
    toppingsVideo.addEventListener('loadedmetadata', syncVideoToScroll);
  }
}

// Resize listener
window.addEventListener('resize', handleResize);
if (typeof ResizeObserver !== 'undefined' && chamberEl) {
  new ResizeObserver(handleResize).observe(chamberEl);
}

// Initialize
loadConeFromUrl();
initThree();
updateUI();
requestAnimationFrame(stepAnimation);
