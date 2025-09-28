// SpineGuard — Posture Recognition JS
const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');

const statusText = document.getElementById('statusText');
const angleText = document.getElementById('angleText');
const fpsText = document.getElementById('fpsText');
const adviceEl = document.getElementById('advice');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

const trailLenInput = document.getElementById('trailLen');
const lineWidthInput = document.getElementById('lineWidth');
const glowInput = document.getElementById('glow');
const zoomLevel = document.getElementById('zoomLevel');

let running = false;
let lastTime = performance.now();
let trail = [];

const themeToggle = document.getElementById('themeToggle');
const themeLabel = document.getElementById('themeLabel');
themeToggle.addEventListener('change', e=>{
  document.body.classList.toggle('dark', e.target.checked);
  themeLabel.textContent = e.target.checked ? 'Dark' : 'Light';
});

// Canvas resize
function resizeCanvas() {
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
}

// Posture logic
const GOOD_THRESHOLD = 8;
const MODERATE_THRESHOLD = 15;
function midpoint(a,b){ return {x:(a.x+b.x)/2, y:(a.y+b.y)/2}; }
function computeAngle(a,b){
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.atan2(dx,dy)*180/Math.PI;
}
function classifyPosture(angle){
  const mag = Math.abs(angle);
  if(mag <= GOOD_THRESHOLD) return 'Excellent';
  if(mag <= MODERATE_THRESHOLD) return 'Needs Adjustment';
  return 'Fix Now';
}
function ergonomicAdvice(status){
  if(status==='Excellent') return 'Keep up the great posture!';
  if(status==='Needs Adjustment') return 'Straighten your back slightly.';
  return 'Fix posture immediately!';
}

// Futuristic drawing
function drawFuturisticLine(points, colorBase, width, glow){
  if(points.length<2) return;
  for(let layer=0;layer<3;layer++){
    ctx.beginPath();
    ctx.lineWidth = width*(1+(3-layer)*0.15);
    ctx.lineCap='round';
    ctx.moveTo(points[0].x, points[0].y);
    for(let i=1;i<points.length;i++) ctx.lineTo(points[i].x, points[i].y);
    const alpha=0.15+layer*0.15;
    ctx.strokeStyle=`rgba(${colorBase.r},${colorBase.g},${colorBase.b},${alpha})`;
    ctx.shadowColor=`rgba(${colorBase.r},${colorBase.g},${colorBase.b},${Math.min(0.9,glow/40)})`;
    ctx.shadowBlur=glow*(0.7-layer*0.2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.lineWidth=width;
  ctx.moveTo(points[0].x, points[0].y);
  for(let i=1;i<points.length;i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.shadowBlur=0;
  ctx.strokeStyle='rgba(255,255,255,0.9)';
  ctx.stroke();
}

// Mediapipe Pose
let camera, pose;
function setupPose(){
  pose = new Pose({locateFile:(f)=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${f}`});
  pose.setOptions({
    modelComplexity:1,
    smoothLandmarks:true,
    minDetectionConfidence:0.5,
    minTrackingConfidence:0.5
  });
  pose.onResults(onResults);
}
setupPose();

// Camera controls
// Camera controls
async function start() {
  if (running) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = stream;

    video.onloadedmetadata = async () => {
      await video.play();
      resizeCanvas();

      // ✅ always recreate Pose instance here
      pose = new Pose({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${f}` });
      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      pose.onResults(onResults);

      // ✅ always recreate Camera
      camera = new Camera(video, {
        onFrame: async () => {
          if (pose) await pose.send({ image: video });
        }
      });
      camera.start();

      running = true;
      startBtn.disabled = true;
      stopBtn.disabled = false;
    };
  } catch (err) {
    alert("Cannot access webcam: " + err.message);
  }
}

function stop() {
  if (!running) return;

  // stop video tracks
  const tracks = video.srcObject?.getTracks() || [];
  tracks.forEach(t => t.stop());
  video.srcObject = null;

  running = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  clearCanvas();

  // stop and cleanup camera
  if (camera) {
    camera.stop();
    camera = null;
  }

  // stop and cleanup pose
  if (pose) {
    pose.close();
    pose = null;
  }
}
startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);

// Clear canvas
function clearCanvas(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  statusText.textContent='—';
  angleText.textContent='—';
  fpsText.textContent='—';
  adviceEl.textContent='Advice will appear here.';
  trail=[];
}

// Main posture results
function onResults(results){
  const now=performance.now();
  const dt=(now-lastTime)/1000;
  const fps=Math.round(1/dt);
  lastTime=now;
  fpsText.textContent=fps;

  resizeCanvas();
  ctx.clearRect(0,0,canvas.width,canvas.height);

  if(!results.poseLandmarks){
    ctx.fillStyle='rgba(255,80,80,0.9)';
    ctx.font='20px Arial';
    ctx.fillText('No person detected',20,40);
    return;
  }

  const lm=results.poseLandmarks;
  const shoulderMid=midpoint(lm[11],lm[12]);
  const hipMid=midpoint(lm[23],lm[24]);
  const angle=computeAngle(shoulderMid,hipMid);
  const status=classifyPosture(angle);
  const advice=ergonomicAdvice(status);

  statusText.textContent=status;
  angleText.textContent=angle.toFixed(1)+"°";
  adviceEl.textContent=advice;

  function toPx(p){return {x:p.x*canvas.width,y:p.y*canvas.height};}
  const sPx=toPx(shoulderMid), hPx=toPx(hipMid);

  const interp=[];
  for(let i=0;i<=20;i++){
    const t=i/20;
    interp.push({x:sPx.x*(1-t)+hPx.x*t, y:sPx.y*(1-t)+hPx.y*t});
  }

  const colors={
    "Excellent":{r:16,g:185,b:129},
    "Needs Adjustment":{r:250,g:204,b:21},
    "Fix Now":{r:239,g:68,b:68}
  };
  const colorBase=colors[status];
  const lineWidth=parseInt(lineWidthInput.value,10);
  const glow=parseInt(glowInput.value,10);

  drawFuturisticLine(interp,colorBase,lineWidth,glow);

  ctx.beginPath();
  ctx.fillStyle='white';
  ctx.arc(sPx.x,sPx.y,6,0,Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(hPx.x,hPx.y,6,0,Math.PI*2);
  ctx.fill();
}

// Q&A Feature
const qaForm=document.getElementById('qaForm');
const qaInput=document.getElementById('qaInput');
const qaList=document.getElementById('qaList');
qaForm.addEventListener('submit', e=>{
  e.preventDefault();
  const text=qaInput.value.trim();
  if(!text) return;
  const li=document.createElement('li');
  li.textContent=text;
  qaList.appendChild(li);
  qaInput.value='';
});
