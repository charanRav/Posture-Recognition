// script.js (module)
// Uses MediaPipe Pose and Camera utilities via module imports

import { Pose } from "https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/pose.js";
import { Camera } from "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3/camera_utils.js";

/* ---------------- DOM refs ---------------- */
const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const videoWrap = document.getElementById("videoWrap");

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");

const fpsText = document.getElementById("fpsText");
const fpsTextPanel = document.getElementById("fpsTextPanel");
const angleText = document.getElementById("angleText");
const angleTextPanel = document.getElementById("angleTextPanel");
const statusText = document.getElementById("statusText");
const statusTextPanel = document.getElementById("statusTextPanel");
const adviceBox = document.getElementById("advice");

const zoomInput = document.getElementById("zoom");
const zoomLabel = document.getElementById("zoomLabel");
const trailLenInput = document.getElementById("trailLen");
const lineWidthInput = document.getElementById("lineWidth");

const trailLenPanel = document.getElementById("trailLenPanel");
const lineWidthPanel = document.getElementById("lineWidthPanel");

const themeToggle = document.getElementById("themeToggle");
const themeLabel = document.getElementById("themeLabel");

/* ---------------- state ---------------- */
let pose = null;     // MediaPipe Pose instance
let camera = null;   // MediaPipe Camera instance
let ctx = overlay.getContext("2d");

let trailLength = parseInt(trailLenInput?.value || 12, 10);
let lineWidth = parseInt(lineWidthInput?.value || 3, 10);
let trails = {}; // per-landmark trail points

let zoom = parseFloat(zoomInput?.value || 1);
let tx = 0, ty = 0;
let isPanning = false;
let panStart = { x:0, y:0, tx:0, ty:0 };

let lastFrameTime = performance.now();
let fps = 0;

/* ---------------- helpers ---------------- */
function resizeCanvasToVideo() {
  if (!video.videoWidth || !video.videoHeight) return;
  // set canvas pixel size to match video resolution
  const dpr = window.devicePixelRatio || 1;
  overlay.width = Math.round(video.videoWidth * dpr);
  overlay.height = Math.round(video.videoHeight * dpr);
  overlay.style.width = video.videoWidth + "px";
  overlay.style.height = video.videoHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function lmToPoint(landmark) {
  return { x: landmark.x * video.videoWidth, y: landmark.y * video.videoHeight };
}

/* ---------------- skeleton pairs ---------------- */
/* Indices follow MediaPipe Pose: using common pairs plus extras */
const SKELETON_PAIRS = [
  [11,12], [11,23], [12,24], [23,24],
  [11,13], [13,15], [12,14], [14,16],
  [23,25], [24,26], [25,27], [26,28],
  /* extras for 'futuristic' look */
  [15,19], [16,20], // elbows -> fingers-ish
  [15,17], [16,18], // palms
  [11,16], [12,15], // cross-arm accents
  [11,14], [12,13]  // shoulder/elbow cross links
];

/* ---------------- drawing ---------------- */
function drawSkeletonAndTrails(landmarks) {
  if (!landmarks || !landmarks.length) {
    ctx.clearRect(0,0,overlay.width, overlay.height);
    return;
  }
  resizeCanvasToVideo();

  // scale to natural pixel coords (lmToPoint used video.videoWidth/Height)
  // Update trails
  for (let i = 0; i < landmarks.length; i++) {
    const p = lmToPoint(landmarks[i]);
    if (!trails[i]) trails[i] = [];
    trails[i].push(p);
    while (trails[i].length > trailLength) trails[i].shift();
  }

  // clear
  ctx.clearRect(0,0,overlay.width, overlay.height);

  // Draw trails (faded)
  ctx.lineCap = 'round';
  for (let i = 0; i < landmarks.length; i++) {
    const t = trails[i];
    if (!t || t.length < 2) continue;
    ctx.beginPath();
    for (let j = 0; j < t.length; j++) {
      const alpha = (j+1) / t.length * 0.6;
      ctx.globalAlpha = alpha * 0.9;
      const pt = t[j];
      if (j === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.lineWidth = Math.max(1, lineWidth * 0.6);
    ctx.strokeStyle = 'rgba(11,95,170,0.55)';
    ctx.shadowBlur = 6;
    ctx.shadowColor = 'rgba(11,95,170,0.4)';
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1.0;
  }

  // Draw skeleton lines (futuristic glow)
  ctx.lineWidth = Math.max(1, lineWidth);
  ctx.strokeStyle = 'rgba(111,184,255,0.95)';
  ctx.beginPath();
  for (const pair of SKELETON_PAIRS) {
    const a = lmToPoint(landmarks[pair[0]]);
    const b = lmToPoint(landmarks[pair[1]]);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.shadowBlur = 18;
  ctx.shadowColor = 'rgba(111,184,255,0.45)';
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Draw joints
  for (let i = 0; i < landmarks.length; i++) {
    const p = lmToPoint(landmarks[i]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1, lineWidth/1.5), 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(11,15,23,0.12)';
    ctx.stroke();
  }
}

/* ---------------- posture math ---------------- */
function calcShoulderTilt(landmarks) {
  const l = landmarks[11];
  const r = landmarks[12];
  if (!l || !r) return null;
  const p1 = lmToPoint(l);
  const p2 = lmToPoint(r);
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  return angle;
}

function interpretAngle(angle) {
  if (angle === null) return { label: '—', advice: 'No person detected' };
  const a = Math.abs(angle);
  if (a <= 5) {
    return { label: 'Proper', advice: 'Good posture — keep it up.' };
  } else if (a <= 15) {
    return { label: 'Fair', advice: 'Slight tilt — square your shoulders.' };
  } else {
    return { label: 'Needs Attention', advice: 'Significant tilt — sit/stand up straight.' };
  }
}

/* ---------------- MediaPipe setup ---------------- */
function initPoseIfNeeded() {
  if (pose) return;
  pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`
  });
  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  pose.onResults(onResults);
}

/* ---------------- start / stop camera ---------------- */
async function startCamera() {
  if (camera) return; // already running
  initPoseIfNeeded();

  try {
    camera = new Camera(video, {
      onFrame: async () => {
        await pose.send({ image: video });
      },
      width: 1280,
      height: 720
    });
    camera.start();
    startBtn.disabled = true;
    stopBtn.disabled = false;
    adviceBox.textContent = 'Starting camera... allow camera permission in the browser.';
  } catch (err) {
    console.error('Camera start error', err);
    adviceBox.textContent = 'Failed to start camera: ' + (err.message || err);
  }
}

function stopCamera() {
  if (camera) {
    try {
      camera.stop();
    } catch (e) { /* ignore */ }
    camera = null;
  }
  // Also stop any tracks if present
  try {
    if (video && video.srcObject) {
      const st = video.srcObject;
      if (st.getTracks) st.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
  } catch (e) { /* ignore */ }

  // clear UI and trails
  ctx.clearRect(0,0,overlay.width, overlay.height);
  trails = {};
  angleText.textContent = '—';
  angleTextPanel.textContent = '—';
  statusText.textContent = '—';
  statusTextPanel.textContent = '—';
  fpsText.textContent = '—';
  fpsTextPanel.textContent = '—';
  adviceBox.textContent = 'Camera stopped.';
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

/* ---------------- results handler ---------------- */
function onResults(results) {
  if (!results) return;

  // update canvas size if necessary
  resizeCanvasToVideo();

  const now = performance.now();
  fps = 1000 / (now - lastFrameTime);
  lastFrameTime = now;
  if (Number.isFinite(fps)) {
    fpsText.textContent = Math.round(fps);
    if (fpsTextPanel) fpsTextPanel.textContent = Math.round(fps);
  }

  if (!results.poseLandmarks) {
    ctx.clearRect(0,0,overlay.width, overlay.height);
    adviceBox.textContent = 'No person detected';
    return;
  }

  drawSkeletonAndTrails(results.poseLandmarks);

  const angle = calcShoulderTilt(results.poseLandmarks);
  if (angle !== null) {
    angleText.textContent = angle.toFixed(2);
    if (angleTextPanel) angleTextPanel.textContent = angle.toFixed(2);
    const interp = interpretAngle(angle);
    statusText.textContent = interp.label;
    if (statusTextPanel) statusTextPanel.textContent = interp.label;
    adviceBox.textContent = interp.advice;
  }
}

/* ---------------- zoom & pan ---------------- */
function applyTransform() {
  videoWrap.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;
}
function clampPan() {
  const maxX = Math.max(0, (zoom - 1) * videoWrap.clientWidth / 2);
  const maxY = Math.max(0, (zoom - 1) * videoWrap.clientHeight / 2);
  tx = Math.max(-maxX, Math.min(maxX, tx));
  ty = Math.max(-maxY, Math.min(maxY, ty));
}

if (zoomInput) {
  zoomInput.addEventListener('input', (e) => {
    zoom = parseFloat(e.target.value);
    zoomLabel.textContent = zoom + 'x';
    clampPan();
    applyTransform();
    updateZoomButtonsByValue(zoom);
  });
}

document.querySelectorAll('.zoom-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const z = parseFloat(btn.dataset.zoom);
    document.querySelectorAll('.zoom-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    zoom = z;
    if (zoomInput) zoomInput.value = z;
    zoomLabel.textContent = zoom + 'x';
    clampPan();
    applyTransform();
  });
});

function updateZoomButtonsByValue(val) {
  document.querySelectorAll('.zoom-btn').forEach(b => {
    if (Math.abs(parseFloat(b.dataset.zoom) - Math.round(val*10)/10) < 0.001) b.classList.add('active');
    else b.classList.remove('active');
  });
}

videoWrap.addEventListener('pointerdown', (ev) => {
  if (zoom <= 1) return;
  isPanning = true;
  videoWrap.classList.add('dragging');
  panStart = { x: ev.clientX, y: ev.clientY, tx, ty };
  try { videoWrap.setPointerCapture(ev.pointerId); } catch {}
});
videoWrap.addEventListener('pointermove', (ev) => {
  if (!isPanning) return;
  const dx = ev.clientX - panStart.x;
  const dy = ev.clientY - panStart.y;
  tx = panStart.tx + dx;
  ty = panStart.ty + dy;
  clampPan();
  applyTransform();
});
videoWrap.addEventListener('pointerup', (ev) => {
  isPanning = false;
  videoWrap.classList.remove('dragging');
  try { videoWrap.releasePointerCapture(ev.pointerId); } catch {}
});
videoWrap.addEventListener('pointercancel', () => {
  isPanning = false;
  videoWrap.classList.remove('dragging');
});

/* ---------------- panel sync ---------------- */
if (trailLenInput && trailLenPanel) {
  trailLenInput.addEventListener('input', () => {
    trailLength = parseInt(trailLenInput.value, 10);
    trailLenPanel.value = trailLength;
  });
  trailLenPanel.addEventListener('input', () => {
    trailLength = parseInt(trailLenPanel.value, 10);
    trailLenInput.value = trailLength;
  });
}
if (lineWidthInput && lineWidthPanel) {
  lineWidthInput.addEventListener('input', () => {
    lineWidth = parseInt(lineWidthInput.value, 10);
    lineWidthPanel.value = lineWidth;
  });
  lineWidthPanel.addEventListener('input', () => {
    lineWidth = parseInt(lineWidthPanel.value, 10);
    lineWidthInput.value = lineWidth;
  });
}

/* ---------------- theme & tabs ---------------- */
if (themeToggle) {
  themeToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      document.body.classList.add('dark');
      if (themeLabel) themeLabel.textContent = 'Dark';
    } else {
      document.body.classList.remove('dark');
      if (themeLabel) themeLabel.textContent = 'Light';
    }
  });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-content').forEach(tc => {
      tc.classList.toggle('hidden', tc.id !== tab);
    });
  });
});

/* ---------------- start/stop wiring ---------------- */
startBtn.addEventListener('click', () => {
  startCamera();
  adviceBox.textContent = 'Starting camera... allow camera permission in the browser.';
});
stopBtn.addEventListener('click', () => {
  stopCamera();
});

/* ---------------- video metadata & init ---------------- */
video.addEventListener('loadedmetadata', () => {
  resizeCanvasToVideo();
});

(function initUI() {
  zoomLabel.textContent = zoom + 'x';
  if (trailLenPanel) trailLenPanel.value = trailLength;
  if (lineWidthPanel) lineWidthPanel.value = lineWidth;
  updateZoomButtonsByValue(zoom);
  adviceBox.textContent = 'Press Start to begin tracking.';
})();
