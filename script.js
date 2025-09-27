let video = document.getElementById("video");
let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");

let net = null;
let animationFrame = null;

// Start camera
async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: false
  });
  video.srcObject = stream;
  return new Promise(resolve => {
    video.onloadedmetadata = () => {
      video.play();
      resolve();
    };
  });
}

// Stop camera
function stopCamera() {
  let stream = video.srcObject;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
  if (animationFrame) cancelAnimationFrame(animationFrame);
}

// Draw skeleton
function drawSkeleton(pose) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(14,165,233,0.8)";
  ctx.fillStyle = "#0ea5e9";

  pose.keypoints.forEach(kp => {
    if (kp.score > 0.4) {
      ctx.beginPath();
      ctx.arc(kp.position.x, kp.position.y, 5, 0, 2 * Math.PI);
      ctx.fill();
    }
  });
}

// Detect poses
async function detectPose() {
  const pose = await net.estimateSinglePose(video, {
    flipHorizontal: false
  });
  drawSkeleton(pose);
  animationFrame = requestAnimationFrame(detectPose);
}

// Zoom control
document.getElementById("zoomSelect").addEventListener("change", (e) => {
  video.style.transform = `scale(${e.target.value})`;
});

// Start button
document.getElementById("startBtn").addEventListener("click", async () => {
  await startCamera();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  if (!net) {
    net = await posenet.load();
  }
  detectPose();

  document.getElementById("startBtn").disabled = true;
  document.getElementById("stopBtn").disabled = false;
});

// Stop button
document.getElementById("stopBtn").addEventListener("click", () => {
  stopCamera();
  document.getElementById("startBtn").disabled = false;
  document.getElementById("stopBtn").disabled = true;
});
