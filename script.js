// SpineGuard — Full JS
const video=document.getElementById("video"),overlay=document.getElementById("overlay"),ctx=overlay.getContext("2d");
const startBtn=document.getElementById("startBtn"),stopBtn=document.getElementById("stopBtn");
const zoomSlider=document.getElementById("zoomSlider"),zoomDisplay=document.getElementById("zoomDisplay"),resetZoom=document.getElementById("resetZoom");
const trailLenInput=document.getElementById("trailLen"),lineWidthInput=document.getElementById("lineWidth"),glowInput=document.getElementById("glow");
const statusText=document.getElementById("statusText"),angleText=document.getElementById("angleText"),fpsText=document.getElementById("fpsText"),adviceEl=document.getElementById("advice"),sessionTimerEl=document.getElementById("sessionTimer");
const themeToggle=document.getElementById("themeToggle");
const blogPane=document.getElementById("blogPane"),qnaPane=document.getElementById("qnaPane"),qnaForm=document.getElementById("qnaForm"),qnaInput=document.getElementById("qnaInput"),qnaList=document.getElementById("qnaList"),clearQna=document.getElementById("clearQna");
const tabs=document.querySelectorAll(".tab");
let pose,camera,running=false,lastTime=performance.now(),sessionStart=null,timerInt=null,currentZoom=1,hardwareZoom=false;

// theme
themeToggle.addEventListener("change",e=>{document.body.classList.toggle("dark",e.target.checked)});

// tabs
tabs.forEach(b=>b.addEventListener("click",()=>{tabs.forEach(x=>x.classList.remove("active"));b.classList.add("active");if(b.dataset.tab==="blog"){blogPane.classList.remove("hidden");qnaPane.classList.add("hidden")}else{blogPane.classList.add("hidden");qnaPane.classList.remove("hidden");loadQnA()}}));

// QnA local
function loadQnA(){qnaList.innerHTML="";const d=JSON.parse(localStorage.getItem("spine_qna")||"[]");d.forEach(t=>{const li=document.createElement("li");li.textContent=t;qnaList.appendChild(li)})}
qnaForm.addEventListener("submit",e=>{e.preventDefault();if(!qnaInput.value.trim())return;const d=JSON.parse(localStorage.getItem("spine_qna")||"[]");d.unshift(qnaInput.value.trim());localStorage.setItem("spine_qna",JSON.stringify(d));qnaInput.value="";loadQnA()});
clearQna.addEventListener("click",()=>{localStorage.removeItem("spine_qna");loadQnA()});

// posture logic
function midpoint(a,b){return{x:(a.x+b.x)/2,y:(a.y+b.y)/2}}
function computeAngle(a,b){return Math.atan2(b.x-a.x,b.y-a.y)*180/Math.PI}
function classify(angle){const m=Math.abs(angle);if(m<=8)return"Healthy";if(m<=15)return"Needs Attention";return"Risky"}
function advice(s){if(s==="Healthy")return"Great posture!";if(s==="Needs Attention")return"Adjust slightly.";return"Straighten up!"}

// skeleton draw
let pulse=0;
function drawFuturistic(lm,status){
  const toPx=p=>({x:p.x*overlay.width,y:p.y*overlay.height});
  const sh=midpoint(lm[11],lm[12]),hp=midpoint(lm[23],lm[24]);
  const sPx=toPx(sh),hPx=toPx(hp);
  pulse+=0.05;
  const interp=[];for(let i=0;i<=20;i++){const t=i/20;interp.push({x:sPx.x*(1-t)+hPx.x*t,y:sPx.y*(1-t)+hPx.y*t})}
  const colors={Healthy:{r:16,g:185,b:129}, "Needs Attention":{r:250,g:204,b:21}, Risky:{r:239,g:68,b:68}};
  const c=colors[status],w=parseInt(lineWidthInput.value),g=parseInt(glowInput.value);
  ctx.beginPath();ctx.moveTo(interp[0].x,interp[0].y);interp.forEach(p=>ctx.lineTo(p.x,p.y));ctx.strokeStyle=`rgba(${c.r},${c.g},${c.b},0.8)`;ctx.lineWidth=w;ctx.shadowBlur=g;ctx.shadowColor=`rgba(${c.r},${c.g},${c.b},0.8)`;ctx.stroke();
}

// mediapipe
function setupPose(){pose=new Pose({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${f}`});pose.setOptions({modelComplexity:1,smoothLandmarks:true,minDetectionConfidence:0.5,minTrackingConfidence:0.5});pose.onResults(onResults)}
setupPose();

// start/stop
async function start(){
  if(running)return;
  try{const stream=await navigator.mediaDevices.getUserMedia({video:{width:1280,height:720},audio:false});
    video.srcObject=stream;await video.play();
    overlay.width=video.videoWidth;overlay.height=video.videoHeight;
    camera=new Camera(video,{onFrame:async()=>{await pose.send({image:video})}});
    camera.start();running=true;sessionStart=Date.now();timerInt=setInterval(updateTimer,1000);initZoom(stream);
    startBtn.disabled=true;stopBtn.disabled=false}
  catch(e){alert("Cam error:"+e.message)}
}
function stop(){if(!running)return;video.srcObject.getTracks().forEach(t=>t.stop());running=false;clearInterval(timerInt);startBtn.disabled=false;stopBtn.disabled=true}

// timer
function updateTimer(){const d=Math.floor((Date.now()-sessionStart)/1000);sessionTimerEl.textContent=`Session: ${Math.floor(d/60)}m ${d%60}s`;}

// zoom
async function initZoom(stream){const track=stream.getVideoTracks()[0],cap=track.getCapabilities();if(cap.zoom){hardwareZoom=true}else{hardwareZoom=false}}
zoomSlider.addEventListener("input",async e=>{currentZoom=parseFloat(e.target.value);zoomDisplay.textContent=currentZoom.toFixed(1)+"x";if(!hardwareZoom){video.style.transform=`scale(${currentZoom})`}else{try{await video.srcObject.getVideoTracks()[0].applyConstraints({advanced:[{zoom:currentZoom}]})}catch{}}})
resetZoom.addEventListener("click",()=>{currentZoom=1;zoomSlider.value=1;zoomDisplay.textContent="1.0x";video.style.transform="scale(1)"})

// results
function onResults(r){
  const now=performance.now(),fps=Math.round(1000/(now-lastTime));lastTime=now;fpsText.textContent=fps;
  ctx.clearRect(0,0,overlay.width,overlay.height);
  if(!r.poseLandmarks){ctx.fillStyle="#f66";ctx.fillText("No person",20,40);return}
  const lm=r.poseLandmarks;const sh=midpoint(lm[11],lm[12]),hp=midpoint(lm[23],lm[24]);const angle=computeAngle(sh,hp);const st=classify(angle);
  statusText.textContent=st;angleText.textContent=angle.toFixed(1)+"°";adviceEl.textContent=advice(st);
  drawFuturistic(lm,st)
}

// buttons
startBtn.addEventListener("click",start);stopBtn.addEventListener("click",stop);
