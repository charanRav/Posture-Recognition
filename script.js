// DOM references
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(tc=>tc.classList.toggle('hidden', tc.id !== btn.dataset.tab));
  });
});

let camera=null;
let pose=null;

// Resize canvas
function resizeCanvas(){
  overlay.width=video.videoWidth;
  overlay.height=video.videoHeight;
}

// Draw skeleton points
function drawLandmarks(results){
  ctx.clearRect(0,0,overlay.width,overlay.height);
  if(!results.poseLandmarks) return;
  for(const lm of results.poseLandmarks){
    ctx.beginPath();
    ctx.arc(lm.x*overlay.width,lm.y*overlay.height,5,0,2*Math.PI);
    ctx.fillStyle='red';
    ctx.fill();
  }
}

// Calculate shoulder tilt
function interpretAngle(results){
  if(!results.poseLandmarks) return;
  const l=results.poseLandmarks[11];
  const r=results.poseLandmarks[12];
  const angle=Math.atan2((r.y-l.y),(r.x-l.x))*180/Math.PI;
  let advice='';
  if(Math.abs(angle)<5) advice='Proper';
  else if(Math.abs(angle)<15) advice='Fair';
  else advice='Needs Attention';
  statusDiv.textContent=`Angle: ${angle.toFixed(1)} | ${advice}`;
}

// On results callback
function onResults(results){
  resizeCanvas();
  drawLandmarks(results);
  interpretAngle(results);
}

// Start camera
startBtn.addEventListener('click',()=>{
  pose=new Pose({locateFile:(file)=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`});
  pose.setOptions({modelComplexity:1,smoothLandmarks:true,minDetectionConfidence:0.5,minTrackingConfidence:0.5});
  pose.onResults(onResults);

  camera=new Camera(video,{onFrame:async()=>{await pose.send({image:video});},width:640,height:480});
  camera.start();
  startBtn.disabled=true;
  stopBtn.disabled=false;
  statusDiv.textContent='Camera started';
});

// Stop camera
stopBtn.addEventListener('click',()=>{
  if(camera) camera.stop();
  startBtn.disabled=false;
  stopBtn.disabled=true;
  ctx.clearRect(0,0,overlay.width,overlay.height);
  statusDiv.textContent='Camera stopped';
});
