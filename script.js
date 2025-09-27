// =========================
// Zoom + Pan Controls
// =========================
const zoomInput = document.getElementById('zoom');
const videoWrap = document.getElementById('videoWrap');

let zoom = parseFloat(zoomInput?.value || 1);
let tx = 0, ty = 0;
let isPanning = false;
let panStart = { x:0, y:0, tx:0, ty:0 };

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
    clampPan();
    applyTransform();
  });
}

videoWrap.addEventListener('pointerdown', (ev) => {
  if (zoom <= 1) return;
  isPanning = true;
  videoWrap.classList.add('dragging');
  panStart = { x: ev.clientX, y: ev.clientY, tx, ty };
  videoWrap.setPointerCapture(ev.pointerId);
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

// =========================
// MediaPipe Pose Detection
// with Start/Stop Fix
// =========================
import { Pose } from "https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/pose.js";
import { Camera } from "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3/camera_utils.js";

const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");

let camera = null;
let pose = null;
const ctx = overlay.getContext("2d");

// Initialize Pose only once
function initPose() {
  pose = new Pose({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`,
  });
  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  pose.onResults(onResults);
}

// Handle results (drawing + angle calculation)
function onResults(results) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!results.poseLandmarks) return;

  // Example: calculate shoulder tilt angle
  const leftShoulder = results.poseLandmarks[11];
  const rightShoulder = results.poseLandmarks[12];
  const leftHip = results.poseLandmarks[23];
  const rightHip = results.poseLandmarks[24];

  if (leftShoulder && rightShoulder && leftHip && rightHip) {
    const dx = (rightShoulder.x - leftShoulder.x);
    const dy = (rightShoulder.y - leftShoulder.y);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    document.getElementById("angleText").textContent = angle.toFixed(2);
    document.getElementById("statusText").textContent =
      Math.abs(angle) > 10 ? "Bad" : "Good";
  }
}

// Start camera + pose
function startCamera() {
  if (!pose) initPose();

  camera = new Camera(video, {
    onFrame: async () => {
      await pose.send({ image: video });
    },
    width: 640,
    height: 480,
  });
  camera.start();

  startBtn.disabled = true;
  stopBtn.disabled = false;
}

// Stop camera cleanly
function stopCamera() {
  if (camera) {
    camera.stop();
    camera = null;
  }
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);
