// =========================
// SpineGuard script.js
// Module-based file. Uses MediaPipe Pose from CDN.
// Replace the old script.js fully with this file.
// =========================

// Import MediaPipe Pose and Camera utilities
import { Pose } from "https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/pose.js";
import { Camera } from "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3/camera_utils.js";

/* -------------------------
   DOM references
   ------------------------- */
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

// Panel alternate controls (kept in sync)
const trailLenPanel = document.getElementById("trailLenPanel");
const lineWidthPanel = document.getElementById("lineWidthPanel");

// Theme toggle
const themeToggle = document.getElementById("themeToggle");
const themeLabel = document.getElementById("themeLabel");

/* -------------------------
   Global state
   ------------------------- */
let pose = null;         // MediaPipe Pose instance (initialized once)
let camera = null;       // MediaPipe Camera instance (recreated on start)
let ctx = overlay.getContext("2d"); // canvas drawing context

// Drawing / trail state
let trailLength = parseInt(trailLenInput?.value || 12, 10);
let lineWidth = parseInt(lineWidthInput?.value || 3, 10);
let trails = {}; // map landmarkIndex -> array of previous {x,y}

// Zoom & pan state (keeps your earlier behavior)
let zoom = parseFloat(zoomInput?.value || 1);
let tx = 0, ty = 0;
let isPanning = false;
let panStart = { x:0, y:0, tx:0, ty:0 };

// FPS calculation
let lastFrameTime = performance.now();
let fps = 0;

/* -------------------------
   Utility helpers
   ------------------------- */

/**
 * Resize overlay canvas to match video element pixel size.
 * Must be called when video size available and on each results loop if video size changes.
 */
function resizeCanvasToVideo() {
  if (!video.videoWidth || !video.videoHeight) return;
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
}

/**
 * Map normalized landmark coordinate to canvas pixels.
 */
function lmToPoint(landmark) {
  return {
    x: landmark.x * overlay.width,
    y: landmark.y * overlay.height
  };
}

/* -------------------------
   Drawing: skeleton + trails
   ------------------------- */

/**
 * Pairs of landmark indices to draw lines between (simple skeleton)
 * Using MediaPipe Pose landmark indexing:
 * 11 = leftShoulder, 12 = rightShoulder, 23 = leftHip, 24 = rightHip, etc.
 */
const SKELETON_PAIRS = [
  [11,12], [11,23], [12,24], [23,24],
  [11,13], [13,15], // left arm
  [12,14], [14,16], // right arm
  [23,25], [24,26], // legs
  [25,27], [26,28]
];

/**
 * Draw skeleton and trails with subtle style (no neon/glow).
 * results.poseLandmarks expected
 */
function drawSkeletonAndTrails(landmarks) {
  // Ensure canvas size matches video
  resizeCanvasToVideo();

  // Subtle background clear
  ctx.clearRect(0,0,overlay.width, overlay.height);

  // Update trails: maintain arrays for each landmark index
  for (let i = 0; i < landmarks.length; i++) {
    const p = lmToPoint(landmarks[i]);
    if (!trails[i]) trails[i] = [];
    trails[i].push(p);
    while (trails[i].length > trailLength) trails[i].shift();
  }

  // Draw trails (faded)
  ctx.lineCap = 'round';
  for (let i = 0; i < landmarks.length; i++) {
    const t = trails[i];
    if (!t || t.length < 2) continue;
    ctx.beginPath();
    for (let j = 0; j < t.length; j++) {
      const alpha = (j+1) / t.length * 0.6; // fade older points
      ctx.globalAlpha = alpha * 0.9;
      const pt = t[j];
      if (j === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.lineWidth = Math.max(1, lineWidth * 0.6);
    ctx.strokeStyle = 'rgba(16,24,40,0.55)';
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }

  // Draw skeleton lines
  ctx.lineWidth = Math.max(1, lineWidth);
  ctx.strokeStyle = 'rgba(16,24,40,0.95)';
  ctx.beginPath();
  for (const pair of SKELETON_PAIRS) {
    const a = lmToPoint(landmarks[pair[0]]);
    const b = lmToPoint(landmarks[pair[1]]);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

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

/* -------------------------
   Posture calculation & interpretation
   ------------------------- */

/**
 * Calculate shoulder tilt angle in degrees.
 * Returns the signed angle between shoulders in degrees.
 */
function calcShoulderTilt(landmarks) {
  const l = landmarks[11]; // left shoulder
  const r = landmarks[12]; // right shoulder
  if (!l || !r) return null;
  // Use normalized coordinates scaled to canvas for accuracy
  const p1 = lmToPoint(l);
  const p2 = lmToPoint(r);
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI); // degrees
  return angle;
}

/**
 * Interpret angle into our three labels:
 * Proper (GOOD) -> "Proper"
 * Fair (MODERATE) -> "Fair"
 * Needs Attention (POOR) -> "Needs Attention"
 *
 * Thresholds adjustable here:
 *   Proper: abs(angle) <= 5 deg
 *   Fair: 5 < abs(angle) <= 15 deg
 *   Needs Attention: abs(angle) > 15 deg
 */
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

/* -------------------------
   MediaPipe initialization & start/stop handling
   (fixed so Stop -> Start works repeatedly)
   ------------------------- */

function initPoseIfNeeded() {
  if (pose) return; // already initialized once
  pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`
  });

  // Recommended options
  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  // Attach results handler
  pose.onResults(onResults);
}

/**
 * Start camera (creates a new Camera each time).
 * Reuses the single `pose` instance but creates fresh camera so start/stop works repeatedly.
 */
function startCamera() {
  // if camera already running, ignore
  if (camera) return;

  initPoseIfNeeded();

  // Request camera and create MediaPipe Camera wrapper
  camera = new Camera(video, {
    onFrame: async () => {
      // send current video frame to pose
      await pose.send({ image: video });
    },
    width: 1280,
    height: 720
  });

  camera.start();

  startBtn.disabled = true;
  stopBtn.disabled = false;
}

/**
 * Stop camera cleanly.
 * Does not destroy pose instance (so re-initialization is fast).
 */
function stopCamera() {
  if (camera) {
    camera.stop();
    camera = null;
  }

  // clear overlays and reset indicators
  ctx.clearRect(0,0,overlay.width, overlay.height);
  trails = {}; // reset trails
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

/* -------------------------
   Results handler (called by MediaPipe onResults)
   ------------------------- */
function onResults(results) {
  if (!results) return;

  // update canvas size if video size available
  resizeCanvasToVideo();

  // FPS
  const now = performance.now();
  fps = 1000 / (now - lastFrameTime);
  lastFrameTime = now;
  fpsText.textContent = Math.round(fps);
  fpsTextPanel.textContent = Math.round(fps);

  // If no landmarks, clear a bit and return
  if (!results.poseLandmarks) {
    ctx.clearRect(0,0,overlay.width, overlay.height);
    adviceBox.textContent = 'No person detected';
    return;
  }

  // Draw skeleton and trails
  drawSkeletonAndTrails(results.poseLandmarks);

  // Compute angle and interpretation
  const angle = calcShoulderTilt(results.poseLandmarks);
  if (angle !== null) {
    angleText.textContent = angle.toFixed(2);
    angleTextPanel.textContent = angle.toFixed(2);
    const interp = interpretAngle(angle);
    statusText.textContent = interp.label;
    statusTextPanel.textContent = interp.label;
    adviceBox.textContent = interp.advice;
  }
}

/* -------------------------
   Zoom & pan interactions (keeps the previous behavior)
   ------------------------- */

function applyTransform() {
  videoWrap.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;
}
function clampPan() {
  const maxX = Math.max(0, (zoom - 1) * videoWrap.clientWidth / 2);
  const maxY = Math.max(0, (zoom - 1) * videoWrap.clientHeight / 2);
  tx = Math.max(-maxX, Math.min(maxX, tx));
  ty = Math.max(-maxY, Math.min(maxY, ty));
}

// slider zoom
if (zoomInput) {
  zoomInput.addEventListener('input', (e) => {
    zoom = parseFloat(e.target.value);
    zoomLabel.textContent = zoom + 'x';
    clampPan();
    applyTransform();
    // Update zoom-level buttons active state
    updateZoomButtonsByValue(zoom);
  });
}

// quick zoom buttons (0.5x, 1x, 2x)
document.querySelectorAll('.zoom-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const z = parseFloat(btn.dataset.zoom);
    // update active class for buttons
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
    if (parseFloat(b.dataset.zoom) === Math.round(val*10)/10) b.classList.add('active');
    else b.classList.remove('active');
  });
}

// pan with pointer
videoWrap.addEventListener('pointerdown', (ev) => {
  if (zoom <= 1) return;
  isPanning = true;
  videoWrap.classList.add('dragging');
  panStart = { x: ev.clientX, y: ev.clientY, tx, ty };
  try { videoWrap.setPointerCapture(ev.pointerId); } catch (e) {}
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

/* -------------------------
   UI: sync panel controls and inputs
   ------------------------- */
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

/* -------------------------
   Theme toggle
   ------------------------- */
themeToggle.addEventListener('change', (e) => {
  if (e.target.checked) {
    document.body.classList.add('dark');
    themeLabel.textContent = 'Dark';
  } else {
    document.body.classList.remove('dark');
    themeLabel.textContent = 'Light';
  }
});

/* -------------------------
   Tabbed content for Blog / Q&A
   ------------------------- */
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

/* -------------------------
   Start & Stop button wiring
   ------------------------- */
startBtn.addEventListener('click', () => {
  startCamera();
  adviceBox.textContent = 'Starting camera... allow camera permission in the browser.';
});
stopBtn.addEventListener('click', () => {
  stopCamera();
});

/* -------------------------
   When video metadata loads, ensure canvas matches
   ------------------------- */
video.addEventListener('loadedmetadata', () => {
  resizeCanvasToVideo();
});

/* -------------------------
   Safety: if page hidden, stop camera to save resources (optional)
   ------------------------- */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // optional: stop camera when tab not visible
    // stopCamera();
  }
});

/* -------------------------
   Initialize a few UI defaults
   ------------------------- */
(function initUI() {
  zoomLabel.textContent = zoom + 'x';
  // ensure panel sync
  if (trailLenPanel) trailLenPanel.value = trailLength;
  if (lineWidthPanel) lineWidthPanel.value = lineWidth;
  updateZoomButtonsByValue(zoom);
  adviceBox.textContent = 'Press Start to begin tracking.';
})();

/* =========================
   Notes for editing later:
   - Thresholds (Proper/Fair/Needs Attention) are in interpretAngle().
   - SKELETON_PAIRS controls which lines are drawn.
   - Trails length and line width are controlled by the range inputs.
   - Blog & Q&A are static and live in index.html (easy to edit).
   - To add more measurements (e.g., hip tilt), compute using landmark indices 23/24 and similar functions.
   ========================= */
