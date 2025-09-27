const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');

const statusText = document.getElementById('statusText');
const angleText = document.getElementById('angleText');
const fpsText = document.getElementById('fpsText');
const adviceEl = document.getElementById('advice');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const themeToggle = document.getElementById('themeToggle');
const themeLabel = document.getElementById('themeLabel');
const zoomSelect = document.getElementById('zoomSelect');

let running = false, lastTime = performance.now();
let sessionStart, timerInterval;
let pose, camera;
let currentZoom = 1.0;

// Themes
themeToggle.addEventListener('change', e => {
  document.body.classList.toggle('dark', e.target.checked);
  themeLabel.textContent = e.target.checked ? 'Dark' : 'Light';
});

// Zoom functionality
zoomSelect.addEventListener('change', e => {
  currentZoom = parseFloat(e.target.value);
  if (video.srcObject) {
    const track = video.srcObject.getVideoTracks()[0];
    let caps = track.getCapabilities();
    if (caps.zoom) {
      track.applyConstraints({ advanced: [{ zoom: currentZoom }] });
    }
  }
});

function resizeCanvas() {
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
}

// Posture classification
const GOOD = 8, MODERATE = 15;
function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
function computeAngle(a, b) {
  return Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI;
}
function classifyPosture(angle) {
  const mag = Math.abs(angle);
  if (mag <= GOOD) return 'Healthy';
  if (mag <= MODERATE) return 'Needs Attention';
  return 'Risky';
}
function ergonomicAdvice(status) {
  if (status === 'Healthy') return 'Great posture! Keep it up.';
  if (status === 'Needs Attention') return 'Adjust a little to stay upright.';
  return 'Careful! Straighten your back.';
}

// Futuristic drawing
function drawFuturisticLine(points, colorBase) {
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let j = 1; j < points.length; j++) ctx.lineTo(points[j].x, points[j].y);
    ctx.strokeStyle = `rgba(${colorBase.r},${colorBase.g},${colorBase.b},${0.3 + i * 0.2})`;
    ctx.lineWidth = 6 - i * 2;
    ctx.shadowColor = `rgba(${colorBase.r},${colorBase.g},${colorBase.b},0.8)`;
    ctx.shadowBlur = 20 - i * 5;
    ctx.stroke();
  }
}

// Mediapipe Pose
function setupPose() {
  pose = new Pose({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  pose.onResults(onResults);
}

async function start() {
  if (running) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = stream;
    await video.play();
    resizeCanvas();
    camera = new Camera(video, { onFrame: async () => { await pose.send({ image: video }); } });
    camera.start();
    running = true;
    sessionStart = Date.now();
    timerInterval = setInterval(updateTimer, 1000);
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } catch (err) {
    alert("Cannot access webcam: " + err.message);
  }
}

function stop() {
  if (!running) return;
  const tracks = video.srcObject?.getTracks() || [];
  tracks.forEach(t => t.stop());
  video.srcObject = null;
  running = false;
  clearInterval(timerInterval);
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);

function updateTimer() {
  const diff = Math.floor((Date.now() - sessionStart) / 1000);
  const mins = Math.floor(diff / 60), secs = diff % 60;
  document.getElementById('timer').textContent = `🕒 Session: ${mins}m ${secs}s`;
  if (diff % 1800 === 0 && diff > 0) {
    document.getElementById('breakReminder').textContent = "💡 Time to stretch!";
  }
}

function onResults(results) {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  const fps = Math.round(1 / dt);
  lastTime = now;
  fpsText.textContent = fps;

  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.poseLandmarks) return;

  const lm = results.poseLandmarks;
  const shoulderMid = midpoint(lm[11], lm[12]);
  const hipMid = midpoint(lm[23], lm[24]);
  const angle = computeAngle(shoulderMid, hipMid);
  const status = classifyPosture(angle);
  const advice = ergonomicAdvice(status);

  statusText.textContent = status;
  angleText.textContent = angle.toFixed(1) + "°";
  adviceEl.textContent = advice;

  function toPx(p) { return { x: p.x * canvas.width, y: p.y * canvas.height }; }
  const sPx = toPx(shoulderMid), hPx = toPx(hipMid);

  const interp = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    interp.push({ x: sPx.x * (1 - t) + hPx.x * t, y: sPx.y * (1 - t) + hPx.y * t });
  }

  const colors = {
    Healthy: { r: 16, g: 185, b: 129 },
    "Needs Attention": { r: 250, g: 204, b: 21 },
    Risky: { r: 239, g: 68, b: 68 }
  };
  drawFuturisticLine(interp, colors[status]);
}

// Q&A Section
document.getElementById('qnaForm').addEventListener('submit', e => {
  e.preventDefault();
  const input = document.getElementById('qnaInput');
  const val = input.value.trim();
  if (!val) return;
  const li = document.createElement('li');
  li.textContent = val;
  document.getElementById('qnaList').appendChild(li);
  input.value = '';
});

setupPose();
