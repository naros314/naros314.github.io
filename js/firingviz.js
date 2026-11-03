import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class ChipFiring {
  constructor(n, boundary) { this.reset(n, boundary); }
  reset(n, boundary) {
    this.n = n; this.n2 = n * n; this.N = n * n * n;
    this.chips = new Int32Array(this.N);
    this.buf = new Int32Array(this.N);
    this.deg = new Uint8Array(this.N);
    this.fired = new Uint8Array(this.N);
    this.step = 0; this.topplings = 0; this.lastTopplings = 0;
    this.lost = 0; this.dropped = 0; this.total = 0; this.unstable = 0;
    this.setBoundary(boundary);
  }
  setBoundary(boundary) {
    this.boundary = boundary;
    const n = this.n, sink = boundary === 'sink', deg = this.deg, chips = this.chips;
    let u = 0;
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) {
      const i = (x * n + y) * n + z;
      const d = sink ? 6 : (x > 0) + (x < n - 1) + (y > 0) + (y < n - 1) + (z > 0) + (z < n - 1);
      deg[i] = d;
      if (chips[i] >= d) u++;
    }
    this.unstable = u;
  }
  idx(x, y, z) { return (x * this.n + y) * this.n + z; }
  center() { const m = (this.n - 1) >> 1; return this.idx(m, m, m); }
  add(i, k) {
    const d = this.deg[i], was = this.chips[i] >= d;
    this.chips[i] += k; this.total += k; this.dropped += k;
    if (!was && this.chips[i] >= d) this.unstable++;
  }
  stepOnce() {
    const { n, n2, N, chips, buf, deg, fired } = this;
    const sink = this.boundary === 'sink';
    buf.fill(0);
    let t = 0, lost = 0;
    for (let i = 0; i < N; i++) {
      const d = deg[i];
      if (chips[i] >= d) {
        t++; fired[i] = 1; chips[i] -= d;
        const x = (i / n2) | 0, r = i - x * n2, y = (r / n) | 0, z = r - y * n;
        if (x > 0) buf[i - n2]++; else if (sink) lost++;
        if (x < n - 1) buf[i + n2]++; else if (sink) lost++;
        if (y > 0) buf[i - n]++; else if (sink) lost++;
        if (y < n - 1) buf[i + n]++; else if (sink) lost++;
        if (z > 0) buf[i - 1]++; else if (sink) lost++;
        if (z < n - 1) buf[i + 1]++; else if (sink) lost++;
      } else fired[i] = 0;
    }
    let u = 0;
    for (let i = 0; i < N; i++) { const c = chips[i] + buf[i]; chips[i] = c; if (c >= deg[i]) u++; }
    this.unstable = u; this.lastTopplings = t; this.topplings += t;
    this.lost += lost; this.total -= lost; this.step++;
    return t;
  }
  stabilize(maxSteps = 1e7) { let s = 0; while (this.unstable > 0 && s < maxSteps) { this.stepOnce(); s++; } return s; }
}

const $ = id => document.getElementById(id);
const fmt = x => x.toLocaleString('en-US');

const PAL = [
  [0.165, 0.188, 0.251],
  [0.275, 0.196, 0.494],
  [0.212, 0.361, 0.553],
  [0.122, 0.631, 0.529],
  [0.624, 0.855, 0.227],
  [0.992, 0.906, 0.145],
];
const PAL_HEX = ['#2a3040', '#46327e', '#365c8d', '#1fa187', '#9fda3a', '#fde725', '#ff3d3d'];
function hot(c, out) { const t = Math.min(1, Math.log2(c - 4) / 10); out[0] = 1; out[1] = 0.24 + 0.76 * t; out[2] = 0.24 + 0.76 * t; }

const view = { size: 0.8, hideBelow: 1, axis: 0, cut: 25, highlight: false, sizeByChips: false, stepsPerFrame: 10, autoRotate: false };
const drive = { mode: 'off' };
let sim = new ChipFiring(25, 'sink');
let running = false, dirty = true;

const canvas = $('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  const err = $('err'); err.style.display = 'grid'; err.textContent = 'WebGL is not available in this browser: ' + e.message;
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d14);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.autoRotateSpeed = 0.8;
scene.add(new THREE.HemisphereLight(0xffffff, 0x1a2233, 0.85));
const key = new THREE.DirectionalLight(0xffffff, 1.0); key.position.set(1, 1.6, 1.2); scene.add(key);
const fill = new THREE.DirectionalLight(0x9db4ff, 0.3); fill.position.set(-1.2, -0.6, -1); scene.add(fill);

const geo = new THREE.BoxGeometry(1, 1, 1);
const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
let mesh = null, frame = null;

function buildMesh(n) {
  if (mesh) { scene.remove(mesh); mesh.dispose(); }
  if (frame) { scene.remove(frame); frame.geometry.dispose(); frame.material.dispose(); }
  const N = n * n * n;
  mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const a = mesh.instanceMatrix.array, off = (n - 1) / 2;
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) {
    const o = ((x * n + y) * n + z) * 16;
    a[o + 15] = 1; a[o + 12] = x - off; a[o + 13] = y - off; a[o + 14] = z - off;
  }
  scene.add(mesh);
  frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(n, n, n)),
    new THREE.LineBasicMaterial({ color: 0x334060 }));
  scene.add(frame);
  camera.position.set(n * 1.35, n * 1.05, n * 1.75);
  controls.target.set(0, 0, 0);
  camera.far = n * 40; camera.updateProjectionMatrix();
}

const counts = new Int32Array(7);
const tmp = [0, 0, 0];
function updateVisuals() {
  const { n, n2, N, chips, deg, fired } = sim;
  const ma = mesh.instanceMatrix.array, ca = mesh.instanceColor.array;
  const s = view.size, hide = view.hideBelow, axis = view.axis, cut = view.cut, hl = view.highlight, sbc = view.sizeByChips;
  counts.fill(0);
  for (let i = 0; i < N; i++) {
    const c = chips[i], d = deg[i], unst = c >= d;
    counts[unst ? 6 : c]++;
    const x = (i / n2) | 0, r = i - x * n2, y = (r / n) | 0, z = r - y * n;
    const coord = axis === 0 ? x : axis === 1 ? y : z;
    let sc = 0;
    if ((c >= hide || unst) && coord < cut) sc = sbc ? s * (0.3 + 0.7 * Math.min(c, 6) / 6) : s;
    const o = i * 16; ma[o] = sc; ma[o + 5] = sc; ma[o + 10] = sc;
    const q = i * 3;
    if (hl && fired[i]) { ca[q] = 1; ca[q + 1] = 1; ca[q + 2] = 1; }
    else if (unst) { hot(c, tmp); ca[q] = tmp[0]; ca[q + 1] = tmp[1]; ca[q + 2] = tmp[2]; }
    else { const p = PAL[c]; ca[q] = p[0]; ca[q + 1] = p[1]; ca[q + 2] = p[2]; }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
}

const legendCounts = [];
(function buildLegend() {
  const names = ['0', '1', '2', '3', '4', '5', 'unstable'];
  const el = $('legend');
  names.forEach((nm, k) => {
    const d = document.createElement('div'); d.className = 'lg';
    d.innerHTML = `<div class="sw" style="background:${PAL_HEX[k]}"></div><div>${nm}</div><div class="n">0</div>`;
    el.appendChild(d); legendCounts.push(d.lastElementChild);
  });
})();

function updateStats() {
  $('sStep').textContent = fmt(sim.step);
  $('sChips').textContent = fmt(sim.total);
  $('sUnst').textContent = fmt(sim.unstable);
  $('sLast').textContent = fmt(sim.lastTopplings);
  $('sTop').textContent = fmt(sim.topplings);
  $('sLost').textContent = fmt(sim.lost);
  for (let k = 0; k < 7; k++) legendCounts[k].textContent = fmt(counts[k]);
  const busy = sim.unstable > 0;
  $('dot').classList.toggle('busy', busy);
  $('status').textContent = busy
    ? (running ? 'Toppling' : 'Paused · unstable sites remain')
    : (running && drive.mode !== 'off' ? 'Stable · auto-dropping' : 'Stable');
}

function setRunning(v) {
  running = v;
  const b = $('run'); b.textContent = v ? '❚❚ Pause' : '▶ Run'; b.classList.toggle('primary', !v);
  dirty = true;
}

function tick() {
  requestAnimationFrame(tick);
  if (running) {
    let k = view.stepsPerFrame;
    while (k-- > 0) {
      if (sim.unstable === 0) {
        if (drive.mode === 'off') { setRunning(false); break; }
        sim.add(drive.mode === 'center' ? sim.center() : (Math.random() * sim.N) | 0, 1);
        continue;
      }
      sim.stepOnce();
    }
    dirty = true;
  }
  if (dirty) { updateVisuals(); updateStats(); dirty = false; }
  controls.autoRotate = view.autoRotate;
  controls.update();
  renderer.render(scene, camera);
}

function bindRange(id, valId, onInput, fmtFn = v => v, liveEvent = 'input') {
  const el = $(id), out = $(valId);
  el.addEventListener('input', () => { out.textContent = fmtFn(el.value); });
  el.addEventListener(liveEvent, () => onInput(+el.value));
  out.textContent = fmtFn(el.value); onInput(+el.value);
}
function bindSeg(id, onChange) {
  const el = $(id);
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    onChange(b.dataset.v);
  }));
}
const amount = () => Math.max(1, Math.floor(+$('amt').value || 1));

function rebuild(n) {
  setRunning(false);
  sim.reset(n, sim.boundary);
  buildMesh(n);
  const cut = $('cut'); cut.max = n; cut.value = n; view.cut = n; $('cutV').textContent = n;
  dirty = true;
}

bindRange('n', 'nV', v => { if (v !== sim.n) rebuild(v); }, v => v, 'change');
bindRange('spf', 'spfV', v => { view.stepsPerFrame = v; });
bindRange('hideBelow', 'hideV', v => { view.hideBelow = v; dirty = true; }, v => v === '6' ? 'only unstable' : v);
bindRange('cut', 'cutV', v => { view.cut = v; dirty = true; });
bindRange('size', 'sizeV', v => { view.size = v; dirty = true; }, v => (+v).toFixed(2));
bindSeg('boundary', v => { sim.setBoundary(v); dirty = true; });
bindSeg('drive', v => { drive.mode = v; if (v !== 'off') setRunning(true); dirty = true; });
bindSeg('axis', v => { view.axis = +v; dirty = true; });
$('hl').addEventListener('change', e => { view.highlight = e.target.checked; dirty = true; });
$('rot').addEventListener('change', e => { view.autoRotate = e.target.checked; });
$('sbc').addEventListener('change', e => { view.sizeByChips = e.target.checked; dirty = true; });

$('run').addEventListener('click', () => setRunning(!running));
$('step').addEventListener('click', () => { setRunning(false); if (sim.unstable > 0) sim.stepOnce(); dirty = true; });
$('reset').addEventListener('click', () => { setRunning(false); sim.reset(sim.n, sim.boundary); dirty = true; });
$('dropC').addEventListener('click', () => { sim.add(sim.center(), amount()); setRunning(true); });
$('dropR').addEventListener('click', () => { sim.add((Math.random() * sim.N) | 0, amount()); setRunning(true); });
$('collapse').addEventListener('click', () => document.body.classList.add('collapsed'));
$('expand').addEventListener('click', () => document.body.classList.remove('collapsed'));

addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey) return;
  if (e.code === 'Space') { e.preventDefault(); setRunning(!running); }
  else if (e.key === 's' || e.key === 'S') { setRunning(false); if (sim.unstable > 0) sim.stepOnce(); dirty = true; }
  else if (e.key === 'r' || e.key === 'R') { setRunning(false); sim.reset(sim.n, sim.boundary); dirty = true; }
});

const raycaster = new THREE.Raycaster(); const ndc = new THREE.Vector2(); let down = null;
canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', e => {
  if (!down) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y, dt = performance.now() - down.t; down = null;
  if (dx * dx + dy * dy > 36 || dt > 400) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(mesh, false)[0];
  if (hit && hit.instanceId != null) { sim.add(hit.instanceId, amount()); setRunning(true); }
});

function onResize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', onResize);

buildMesh(sim.n);
onResize();
sim.add(sim.center(), 10000);
setRunning(true);
tick();