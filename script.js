/* script.js - SpineGuard full integration
   - Mediapipes Pose usage
   - Camera hardware zoom when available
   - CSS fallback zoom + pan
   - Multi-line futuristic skeleton + pulsing
   - Session timer + break reminders
   - Blog + local Q&A (localStorage)
*/

// DOM
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const zoomSlider = document.getElementById('zoomSlider');
const zoomDisplay = document.getElementById('zoomDisplay');
const resetZoomBtn = document.getElementById('resetZoom');

const trailLenInput = document.getElementById('trailLen');
const lineWidthInput = document.getElementById('lineWidth');
const glowInput = document.getElementById('glow');

const statusText = document.getElementById('statusText');
const angleText = document.getElementById('angleText');
const fpsText = document.getElementById('fpsText');
const adviceEl = document.getElementById('advice');
const sessionTimerEl = document.getElementById('sessionTimer');

const themeToggle = document.getElementById('themeToggle');
const videoWrap = document.getElementById('videoWrap');

const tabButtons = document.querySelectorAll('.tab');
const blogPane = document.getElementById('blogPane');
const qnaPane = document.getElementById('qnaPane');
const qnaForm = document.getElementById('qnaForm');
const qnaInput = document.getElementById('qnaInput');
const qnaList = document.getElementById('qnaList');
const clearQna = document.getElementById('clearQna');

// state
let pose, camera;
let running = false;
let lastTime = performance.now();
let sessionStart = null;
let timerInterval = null;
let audioBeep = null;

// zoom/pan state (fallback CSS if hardware zoom not supported)
let hardwareZoomSupported = false;
let currentZoom = parseFloat(zoomSlider.value || 1);
let tx = 0, ty = 0;
let isPanning = false, panStart = null;

// theme
themeToggle?.addEventListener('change', (e) => {
  document.body.classList.toggle('dark', e.target.checked);
});

// tabs
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    if (tab === 'blog') { blogPane.classList.remove('hidden'); qnaPane.classList.add('hidden'); }
    else { blogPane.classList.add('hidden'); qnaPane.classList.remove('hidden'); loadQnA(); }
  });
});

// QnA localStorage
function loadQnA(){
  qnaList.innerHTML = '';
  const data = JSON.parse(localStorage.getItem('spineguard_qna') || '[]');
  data.forEach(item => {
    const li = document.createElement('li'); li.textContent = item; qnaList.appendChild(li);
  });
}
function saveQnAPost(text){
  const data = JSON.parse(localStorage.getItem('spineguard_qna') || '[]');
  data.unshift(text);
  localStorage.setItem('spineguard_qna', JSON.stringify(data.slice(0,100)));
}
qnaForm?.addEventListener('submit', (e)=>{
  e.preventDefault();
  const v = qnaInput.value.trim();
  if(!v) return;
  saveQnAPost(v);
  qnaInput.value = '';
  loadQnA();
});
clearQna?.addEventListener('click', ()=>{
  localStorage.removeItem('spineguard_qna'); loadQnA();
});

// init beep
function initBeep(){
  try{
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.value = 0; // silent until play
    o.connect(g); g.connect(ac.destination); o.start();
    audioBeep = { ac, o, g };
  }catch(e){ audioBeep = null; }
}
initBeep();

// helpers
function setZoomDisplay(v){ zoomDisplay.textContent = v.toFixed(1) + 'x'; }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

// pan for fallback
videoWrap.addEventListener('pointerdown', (ev)=>{
  if (currentZoom <= 1) return;
  isPanning = true; panStart = { x: ev.clientX, y: ev.clientY, tx, ty };
  videoWrap.classList.add('dragging');
  videoWrap.setPointerCapture(ev.pointerId);
});
videoWrap.addEventListener('pointermove', (ev)=>{
  if(!isPanning) return;
  const dx = ev.clientX - panStart.x, dy = ev.clientY - panStart.y;
  tx = panStart.tx + dx; ty = panStart.ty + dy;
  clampPan(); applyCSSZoom();
});
videoWrap.addEventListener('pointerup', (ev)=>{
  isPanning = false; videoWrap.classList.remove('dragging'); try{ videoWrap.releasePointerCapture(ev.pointerId);}catch(e){}
});
videoWrap.addEventListener('pointercancel', ()=>{ isPanning = false; videoWrap.classList.remove('dragging'); });

function clampPan(){
  const w = videoWrap.clientWidth, h = videoWrap.clientHeight;
  const maxX = Math.max(0, (currentZoom - 1) * w / 2);
  const maxY = Math.max(0, (currentZoom - 1) * h / 2);
  tx = clamp(tx, -maxX, maxX); ty = clamp(ty, -maxY, maxY);
}
function applyCSSZoom(){
  videoWrap.style.transform = `translate(${tx}px, ${ty}px) scale(${currentZoom})`;
}

// zoom handling (attempt hardware zoom, otherwise CSS fallback)
async function initZoomForStream(stream){
  const track = stream.getVideoTracks()[0];
  if(!track) return;
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  if('zoom' in caps){
    hardwareZoomSupported = true;
    // set slider to hardware min/max if provided
    const min = caps.zoom.min ?? 1; const max = caps.zoom.max ?? 3; const step = caps.zoom.step ?? 0.1;
    zoomSlider.min = min; zoomSlider.max = max; zoomSlider.step = step;
    zoomSlider.value = clamp(currentZoom, min, max);
    setZoomDisplay(parseFloat(zoomSlider.value));
    // try to initialize to 1 or current
    try{ await track.applyConstraints({ advanced: [{ zoom: parseFloat(zoomSlider.value) }] }); }catch(e){}
  } else {
    hardwareZoomSupported = false;
    // CSS fallback range already 0.5-3
    zoomSlider.min = 0.5; zoomSlider.max = 3; zoomSlider.step = 0.1;
    zoomSlider.value = currentZoom;
    setZoomDisplay(currentZoom);
    applyCSSZoom();
  }
}

// slider events
zoomSlider.addEventListener('input', async (e)=>{
  const v = parseFloat(e.target.value);
  currentZoom = v;
  setZoomDisplay(v);
  if(hardwareZoomSupported && video.srcObject){
    const track = video.srcObject.getVideoTracks()[0];
    try{ await track.applyConstraints({ advanced: [{ zoom: v }] }); }
    catch(err){ console.warn('Zoom constraint failed: ', err); }
  } else {
    // CSS fallback
    clampPan();
    applyCSSZoom();
  }
});
resetZoomBtn.addEventListener('click', async ()=>{
  tx = 0; ty = 0;
  if(hardwareZoomSupported && video.srcObject){
    const track = video.srcObject.getVideoTracks()[0];
    const v = 1.0; currentZoom = v; zoomSlider.value = v; setZoomDisplay(v);
    try{ await track.applyConstraints({ advanced: [{ zoom: v }] }); }catch(e){ console.warn(e); }
  } else { currentZoom = 1; zoomSlider.value = 1; setZoomDisplay(1); applyCSSZoom(); }
});

// posture helpers
const GOOD_THRESHOLD = 8, MODERATE_THRESHOLD = 15;
function midpoint(a,b){ return {x:(a.x+b.x)/2, y:(a.y+b.y)/2}; }
function computeAngle(a,b){ const dx = b.x - a.x, dy = b.y - a.y; return Math.atan2(dx, dy) * 180/Math.PI; }
function classifyPosture(angle){
  const mag = Math.abs(angle);
  if(mag <= GOOD_THRESHOLD) return 'Healthy';
  if(mag <= MODERATE_THRESHOLD) return 'Needs Attention';
  return 'Risky';
}
function ergonomicAdvice(status){
  if(status === 'Healthy') return 'Great posture — keep it up!';
  if(status === 'Needs Attention') return 'Adjust your back slightly.';
  return 'Risky posture — straighten up now.';
}

// draw futuristic multi-line skeleton + pulses
let pulsePhase = 0;
function drawFuturistic(lm){
  if(!lm || lm.length < 25) return;
  // convert normalized to px
  const toPx = p => ({ x: p.x * overlay.width, y: p.y * overlay.height });

  // compute points we'll draw
  const leftShoulder = toPx(lm[11]), rightShoulder = toPx(lm[12]);
  const leftHip = toPx(lm[23]), rightHip = toPx(lm[24]);
  const shoulderMid = { x: (leftShoulder.x + rightShoulder.x)/2, y: (leftShoulder.y + rightShoulder.y)/2 };
  const hipMid = { x: (leftHip.x + rightHip.x)/2, y: (leftHip.y + rightHip.y)/2 };

  // dynamic glow using sin
  pulsePhase += 0.06;
  const pulse = (Math.sin(pulsePhase) + 1) / 2;

  const lineW = Math.max(1, parseInt(lineWidthInput?.value || '3',10));
  const glow = Math.max(0, parseInt(glowInput?.value || '12',10));

  // main midline (shoulderMid -> hipMid)
  const mainPoints = [];
  for(let i=0;i<=24;i++){
    const t = i/24;
    mainPoints.push({ x: shoulderMid.x*(1-t) + hipMid.x*t, y: shoulderMid.y*(1-t) + hipMid.y*t });
  }

  // extra lines: shoulders line, hips line, chest-to-hips curve
  const shoulders = [leftShoulder, rightShoulder];
  const hips = [leftHip, rightHip];
  const chestToHip = [];
  for(let i=0;i<=24;i++){
    const t=i/24;
    chestToHip.push({
      x: (leftShoulder.x*(1-t) + leftHip.x*t + rightShoulder.x*(1-t) + rightHip.x*t)/2,
      y: (leftShoulder.y*(1-t) + leftHip.y*t + rightShoulder.y*(1-t) + rightHip.y*t)/2
    });
  }

  // color selection based on posture (will be set by caller)
  // draw helper
  function strokeLine(points, color, width, blur){
    if(!points || points.length<2) return;
    // layered glow
    for(let layer=0; layer<3; layer++){
      ctx.beginPath();
      ctx.lineWidth = width * (1 + (2-layer)*0.6);
      ctx.lineCap = 'round';
      ctx.moveTo(points[0].x, points[0].y);
      for(let i=1;i<points.length;i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${0.12 + layer*0.16})`;
      ctx.shadowColor = `rgba(${color.r}, ${color.g}, ${color.b}, ${Math.min(0.9, blur/40)})`;
      ctx.shadowBlur = blur * (0.6 - layer*0.18) + pulse*6;
      ctx.stroke();
    }
    // bright core
    ctx.beginPath();
    ctx.lineWidth = Math.max(1, width - 0.5);
    ctx.moveTo(points[0].x, points[0].y);
    for(let i=1;i<points.length;i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
  }

  // caller will pass colorBase via global variable set in onResults
  if(window.__SG_colorBase) strokeLine(mainPoints, window.__SG_colorBase, lineW, glow);
  strokeLine(shoulders, {r:120,g:200,b:255}, Math.max(1,lineW-1), Math.max(3, Math.round(glow*0.6)));
  strokeLine(hips, {r:255,g:110,b:180}, Math.max(1,lineW-1), Math.max(3, Math.round(glow*0.6)));
  strokeLine(chestToHip, {r:180,g:160,b:255}, Math.max(1,lineW-2), Math.max(2, Math.round(glow*0.45)));

  // pulse circles on key joints: head (0), shoulders (11,12), hips (23,24)
  [0,11,12,23,24].forEach(idx=>{
    const p = toPx(lm[idx]);
    if(!p) return;
    ctx.beginPath();
    const rad = 6 + pulse*3;
    ctx.fillStyle = `rgba(255,255,255,0.9)`;
    ctx.arc(p.x, p.y, Math.max(3, rad), 0, Math.PI*2);
    ctx.fill();
    // glow ring
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad + 6, 0, Math.PI*2);
    ctx.strokeStyle = `rgba(255,255,255,${0.06 + pulse*0.12})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

// draw status panel background when no person
function drawNoPerson(){
  ctx.fillStyle = 'rgba(255,80,80,0.08)';
  ctx.font = '18px Inter, Arial';
  ctx.fillText('No person detected - position yourself in frame', 20, 40);
}

// audio alert for risky posture (throttle)
let lastAlert = 0;
function alertRisk(){
  const now = Date.now();
  if(now - lastAlert < 4000) return; // 4s throttle
  lastAlert = now;
  if(audioBeep){
    try{
      audioBeep.gain = audioBeep.g;
      audioBeep.g.gain.cancelScheduledValues(0);
      audioBeep.g.gain.setValueAtTime(0, audioBeep.ac.currentTime);
      audioBeep.g.gain.linearRampToValueAtTime(0.03, audioBeep.ac.currentTime + 0.01);
      setTimeout(()=>{ audioBeep.g.gain.linearRampToValueAtTime(0, audioBeep.ac.currentTime + 0.01); }, 250);
    }catch(e){}
  }
  // optional vibration
  if(navigator.vibrate) navigator.vibrate(150);
}

// MediaPipe setup
function setupPose(){
  pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`
  });
  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  pose.onResults(onResults);
}
setupPose();

// start / stop camera + init zoom support
async function start(){
  if(running) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" }, audio: false });
    video.srcObject = stream;
    await video.play();
    overlay.width = video.videoWidth || 640;
    overlay.height = video.videoHeight || 480;
    // initialize camera util for frame feeding
    camera = new Camera(video, { onFrame: async () => { await pose.send({ image: video }); }, width: video.videoWidth, height: video.videoHeight });
    camera.start();
    running = true;
    sessionStart = Date.now();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateSessionTimer, 1000);
    startBtn.disabled = true; stopBtn.disabled = false;
    // init zoom capabilities
    await initZoomForStream(stream);
  } catch (err) {
    alert('Cannot access webcam: ' + err.message);
  }
}
function stop(){
  if(!running) return;
  const tracks = video.srcObject?.getTracks() || [];
  tracks.forEach(t => t.stop());
  video.srcObject = null;
  running = false;
  if(camera && camera.stop) try{ camera.stop(); }catch(e){}
  startBtn.disabled = false; stopBtn.disabled = true;
  if(timerInterval) clearInterval(timerInterval);
}

// update session timer
function updateSessionTimer(){
  const diff = Math.floor((Date.now() - sessionStart) / 1000);
  const m = Math.floor(diff/60), s = diff % 60;
  sessionTimerEl.textContent = `Session: ${m}m ${s}s`;
  // every 30 minutes (1800s) show reminder
  if(diff > 0 && diff % 1800 === 0) {
    const rem = document.getElementById('sessionTimer');
    if(rem) rem.textContent = `Session: ${m}m ${s}s • Time to stretch!`;
  }
}

// zoom init for stream (hardware check)
async function initZoomForStream(stream){
  try{
    const track = stream.getVideoTracks()[0];
    if(!track || !track.getCapabilities) { hardwareZoomSupported = false; return; }
    const caps = track.getCapabilities();
    if('zoom' in caps) {
      hardwareZoomSupported = true;
      const min = caps.zoom.min ?? 1;
      const max = caps.zoom.max ?? 3;
      const step = caps.zoom.step ?? 0.1;
      zoomSlider.min = min; zoomSlider.max = max; zoomSlider.step = step;
      zoomSlider.value = clamp(1, min, max);
      currentZoom = parseFloat(zoomSlider.value);
      setZoomUI(currentZoom);
      // try to set 1
      await track.applyConstraints({ advanced: [{ zoom: currentZoom }] });
    } else {
      hardwareZoomSupported = false;
      zoomSlider.min = 0.5; zoomSlider.max = 3; zoomSlider.step = 0.1;
      zoomSlider.value = currentZoom;
      setZoomUI(currentZoom);
      applyCSSZoom(); // apply initial CSS zoom
    }
  }catch(e){
    console.warn('Zoom init error', e); hardwareZoomSupported = false;
    zoomSlider.min = 0.5; zoomSlider.max = 3; zoomSlider.step = 0.1;
    zoomSlider.value = currentZoom; setZoomUI(currentZoom); applyCSSZoom();
  }
}

function setZoomUI(v){ zoomDisplay.textContent = v.toFixed(1) + 'x'; }

// zoom slider event
zoomSlider.addEventListener('input', async (e)=>{
  const v = parseFloat(e.target.value);
  currentZoom = v;
  setZoomUI(v);
  if(hardwareZoomSupported && video.srcObject){
    try{
      await video.srcObject.getVideoTracks()[0].applyConstraints({ advanced: [{ zoom: v }] });
    }catch(err){
      console.warn('applyConstraints zoom failed', err);
    }
  } else {
    // css fallback
    clampPan(); applyCSSZoom();
  }
});

// reset zoom
resetZoomBtn.addEventListener('click', async ()=>{
  tx = 0; ty = 0;
  if(hardwareZoomSupported && video.srcObject){
    currentZoom = 1; zoomSlider.value = 1; setZoomUI(1);
    try{ await video.srcObject.getVideoTracks()[0].applyConstraints({ advanced: [{ zoom: 1 }] }); }catch(e){}
  } else {
    currentZoom = 1; zoomSlider.value = 1; setZoomUI(1); applyCSSZoom();
  }
});

// initial CSS zoom application
function applyCSSZoom(){
  videoWrap.style.transform = `translate(${tx}px, ${ty}px) scale(${currentZoom})`;
}

// onResults handler for MediaPipe
function onResults(results){
  const now = performance.now();
  const dt = (now - lastTime) / 1000 || 0.001;
  const fps = Math.round(1 / dt);
  lastTime = now;
  fpsText.textContent = `${fps}`;

  // resize overlay
  overlay.width = video.videoWidth || 640;
  overlay.height = video.videoHeight || 480;
  ctx.clearRect(0,0,overlay.width, overlay.height);

  if(!results.poseLandmarks || results.poseLandmarks.length === 0){
    drawNoPerson();
    statusText.textContent = '—';
    angleText.textContent = '—';
    adviceEl.textContent = 'No person detected';
    return;
  }

  // posture calc
  const lm = results.poseLandmarks;
  const shoulderMid = midpoint(lm[11], lm[12]);
  const hipMid = midpoint(lm[23], lm[24]);
  const angle = computeAngle(shoulderMid, hipMid);
  const status = classifyPosture(angle);
  const advice = ergonomicAdvice(status);

  statusText.textContent = status;
  angleText.textContent = angle.toFixed(1) + '°';
  adviceEl.textContent = advice;

  // choose color for main line
  const colors = {
    Healthy: {r: 16, g: 185, b: 129},
    "Needs Attention": {r: 250, g: 204, b: 21},
    Risky: {r: 239, g: 68, b: 68}
  };
  window.__SG_colorBase = colors[status] || {r:14,g:165,b:233};

  // draw futuristic skeleton
  drawFuturistic(lm);

  // alert for risky
  if(status === 'Risky') alertRisk();
}

// start/stop buttons
startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);

// load qna on start
loadQnA();

// pointer resize support
window.addEventListener('resize', ()=>{ overlay.width = video.videoWidth || overlay.width; overlay.height = video.videoHeight || overlay.height; });

// utility
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
