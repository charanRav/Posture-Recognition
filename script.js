// SpineGuard — frontend using MediaPipe Pose (JS)
// Note: this file expects the browser to fetch MediaPipe pose from a CDN.
// Keep this file in the same folder as index.html and styles.css.

const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

const statusText = document.getElementById('statusText');
const angleText = document.getElementById('angleText');
const fpsText = document.getElementById('fpsText');
const adviceEl = document.getElementById('advice');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

const trailLenInput = document.getElementById('trailLen');
const lineWidthInput = document.getElementById('lineWidth');
const glowInput = document.getElementById('glow');

let running = false;
let lastTime = performance.now();
let trail = []; // store previous midpoints for trailing effect

// theme toggle
const themeToggle = document.getElementById('themeToggle');
const themeLabel = document.getElementById('themeLabel');
themeToggle.addEventListener('change', e=>{
  document.body.classList.toggle('dark', e.target.checked);
  themeLabel.textContent = e.target.checked ? 'Dark' : 'Light';
});

// resize helper
function resizeCanvas() {
  canvas.width = video.videoWidth || video.clientWidth;
  canvas.height = video.videoHeight || video.clientHeight;
}
window.addEventListener('resize', resizeCanvas);

// angle & status helpers
const GOOD_THRESHOLD = 8;
const MODERATE_THRESHOLD = 15;

function midpoint(a, b) {
  return {x: (a.x + b.x)/2, y: (a.y + b.y)/2};
}
function computeAngle(shoulderMid, hipMid) {
  const dx = hipMid.x - shoulderMid.x;
  const dy = hipMid.y - shoulderMid.y;
  const angleRad = Math.atan2(dx, dy);
  return angleRad * 180 / Math.PI;
}
function classifyPosture(angle){
  const mag = Math.abs(angle);
  if(mag <= GOOD_THRESHOLD) return 'GOOD';
  if(mag <= MODERATE_THRESHOLD) return 'MODERATE';
  return 'POOR';
}
function ergonomicAdvice(status){
  if(status === 'GOOD') return 'Maintain upright posture.';
  if(status === 'MODERATE') return 'Straighten your back slightly.';
  return 'Poor posture! Sit upright.';
}

// futuristic drawing
function drawFuturisticLine(points, colorBase, width, glow){
  if(points.length < 2) return;
  // layered strokes for "futuristic" feel
  for(let layer=0; layer<4; layer++){
    ctx.beginPath();
    ctx.lineWidth = width * (1 + (4-layer)*0.15);
    ctx.lineCap = 'round';
    ctx.moveTo(points[0].x, points[0].y);
    for(let i=1;i<points.length;i++){
      const p = points[i];
      ctx.lineTo(p.x, p.y);
    }
    const alpha = 0.12 + layer*0.12;
    ctx.strokeStyle = `rgba(${colorBase.r}, ${colorBase.g}, ${colorBase.b}, ${alpha})`;
    ctx.shadowColor = `rgba(${colorBase.r}, ${colorBase.g}, ${colorBase.b}, ${Math.min(0.9, glow/40)})`;
    ctx.shadowBlur = glow * (0.7 - layer*0.12);
    ctx.stroke();
  }
  // bright center line
  ctx.beginPath();
  ctx.lineWidth = Math.max(1, width);
  ctx.moveTo(points[0].x, points[0].y);
  for(let i=1;i<points.length;i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();
}

// MediaPipe pose setup (dynamically import)
import('https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/pose.js').then(({Pose, POSE_CONNECTIONS})=>{
  import('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3/camera_utils.js').then(({Camera})=>{
    const pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`
    });
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    pose.onResults(onResults);

    let camera = null;

    async function start() {
      if(running) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({video:{width:1280,height:720}, audio:false});
        video.srcObject = stream;
        await video.play();
        resizeCanvas();
        camera = new Camera(video, {
          onFrame: async () => {
            await pose.send({image: video});
          },
          width: 1280,
          height: 720
        });
        camera.start();
        running = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
      } catch (err) {
        alert('Cannot access webcam: ' + err.message);
      }
    }

    function stop(){
      if(!running) return;
      const tracks = video.srcObject?.getTracks() || [];
      tracks.forEach(t=>t.stop());
      video.srcObject = null;
      running = false;
      startBtn.disabled = false;
      stopBtn.disabled = true;
      clearCanvas();
    }

    startBtn.addEventListener('click', start);
    stopBtn.addEventListener('click', stop);

    function clearCanvas(){
      ctx.clearRect(0,0,canvas.width,canvas.height);
      statusText.textContent = '—';
      angleText.textContent = '—';
      fpsText.textContent = '—';
      adviceEl.textContent = 'Advice will appear here.';
      trail = [];
    }

    function onResults(results){
      const now = performance.now();
      const dt = (now - lastTime)/1000;
      const fps = Math.round(1/dt);
      lastTime = now;
      fpsText.textContent = fps;

      resizeCanvas();
      ctx.clearRect(0,0,canvas.width,canvas.height);

      if(!results.poseLandmarks){
        ctx.font = '20px Arial';
        ctx.fillStyle = 'rgba(255,80,80,0.9)';
        ctx.fillText('No person detected', 20, 40);
        return;
      }

      // landmarks: use indices as in mediapipe pose
      const lm = results.poseLandmarks;
      // left shoulder 11, right shoulder 12, left hip 23, right hip 24
      const l_sh = lm[11], r_sh = lm[12], l_hp = lm[23], r_hp = lm[24];
      const shoulderMid = midpoint(l_sh, r_sh);
      const hipMid = midpoint(l_hp, r_hp);

      const angle = computeAngle(shoulderMid, hipMid);
      const status = classifyPosture(angle);
      const advice = ergonomicAdvice(status);

      statusText.textContent = status;
      angleText.textContent = angle.toFixed(1) + '°';
      adviceEl.textContent = advice;

      // convert normalized coords to canvas pixels
      function toPx(p){ return {x: p.x * canvas.width, y: p.y * canvas.height}; }
      const sPx = toPx(shoulderMid), hPx = toPx(hipMid);

      // add to trail
      const maxTrail = parseInt(trailLenInput.value || '12',10);
      trail.push({x:sPx.x, y:sPx.y, t:Date.now()});
      if(trail.length > maxTrail) trail.shift();

      // draw futuristic trail between shoulderMid and hipMid using interpolated points
      const interp = [];
      const steps = 24;
      for(let i=0;i<=steps;i++){
        const t = i/steps;
        interp.push({
          x: sPx.x * (1-t) + hPx.x * t,
          y: sPx.y * (1-t) + hPx.y * t
        });
      }

      // choose color based on status
      const colors = {
        GOOD: {r:16,g:185,b:129},
        MODERATE: {r:250,g:204,b:21},
        POOR: {r:239,g:68,b:68}
      };
      const colorBase = colors[status] || {r:14,g:165,b:233};
      const lineWidth = parseInt(lineWidthInput.value||'3',10);
      const glow = parseInt(glowInput.value||'12',10);

      drawFuturisticLine(interp, colorBase, lineWidth, glow);

      // draw circles at endpoints
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.arc(sPx.x, sPx.y, Math.max(4,lineWidth+1),0,Math.PI*2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.arc(hPx.x, hPx.y, Math.max(4,lineWidth+1),0,Math.PI*2);
      ctx.fill();

      // optional: draw trailing shadow from previous shoulder midpoints
      if(trail.length>1){
        const trailPoints = trail.map(p=>({x:p.x, y:p.y}));
        ctx.globalAlpha = 0.55;
        drawFuturisticLine(trailPoints, {r:120,g:80,b:240}, Math.max(1, lineWidth-1), Math.max(3, glow*0.6));
        ctx.globalAlpha = 1.0;
      }

      // draw small status panel on canvas (for recording)
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(10,10,240,84);
      ctx.fillStyle = 'white';
      ctx.font = '16px Arial';
      ctx.fillText('Posture: ' + status, 20, 36);
      ctx.fillText('Angle: ' + angle.toFixed(1) + '°', 20, 58);
      ctx.fillText('Advice: ' + advice, 20, 78);
    }

  });
}).catch(err=>{
  console.error('Error loading MediaPipe modules:', err);
  alert('Failed to load MediaPipe JS. Check console for details.');
});
