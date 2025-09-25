// SpineGuard — Posture Recognition (Frontend)
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

let running = false;
let lastTime = performance.now();
let trail = [];

const themeToggle = document.getElementById('themeToggle');
const themeLabel = document.getElementById('themeLabel');
themeToggle.addEventListener('change', e=>{
  document.body.classList.toggle('dark', e.target.checked);
  themeLabel.textContent = e.target.checked ? 'Dark' : 'Light';
});

function resizeCanvas() {
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
}

// posture logic
const GOOD_THRESHOLD = 8;
const MODERATE_THRESHOLD = 15;
function midpoint(a,b){ return {x:(a.x+b.x)/2, y:(a.y+b.y)/2}; }
function computeAngle(a,b){
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.atan2(dx,dy)*180/Math.PI;
}
function classifyPosture(angle){
  const mag = Math.abs(angle);
  if(mag <= GOOD_THRESHOLD) return 'GOOD';
  if(mag <= MODERATE_THRESHOLD) return 'MODERATE';
  return 'POOR';
}
function ergonomicAdvice(status){
  if(status==='GOOD') return 'Maintain upright posture.';
  if(status==='MODERATE') return 'Straighten your back a little.';
  return 'Poor posture! Sit upright.';
}

// futuristic drawing
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

async function start(){
  if(running) return;
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
    video.srcObject=stream;
    await video.play();
    resizeCanvas();
    camera=new Camera(video,{onFrame:async()=>{await pose.send({image:video});}});
    camera.start();
    running=true;
    startBtn.disabled=true;
    stopBtn.disabled=false;
  }catch(err){ alert("Cannot access webcam: "+err.message); }
}

function stop(){
  if(!running) return;
  const tracks=video.srcObject?.getTracks()||[];
  tracks.forEach(t=>t.stop());
  video.srcObject=null;
  running=false;
  startBtn.disabled=false;
  stopBtn.disabled=true;
  clearCanvas();
}

startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);

function clearCanvas(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  statusText.textContent='—';
  angleText.textContent='—';
  fpsText.textContent='—';
  adviceEl.textContent='Advice will appear here.';
  trail=[];
}

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

  const colors={GOOD:{r:16,g:185,b:129},MODERATE:{r:250,g:204,b:21},POOR:{r:239,g:68,b:68}};
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

setupPose();
