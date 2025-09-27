let video = document.getElementById("video");
let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");

let net;
let isCameraOn = false;
let showSkeleton = true;
let zoomLevel = 1;

// Initialize PoseNet
async function loadModel() {
  net = await posenet.load();
  console.log("PoseNet Loaded!");
}

// Start/Stop Camera
async function toggleCamera() {
  if (!isCameraOn) {
    let stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    isCameraOn = true;
    document.getElementById("startStopBtn").innerText = "⏹ Stop";
    detectPose();
  } else {
    let tracks = video.srcObject.getTracks();
    tracks.forEach(track => track.stop());
    isCameraOn = false;
    document.getElementById("startStopBtn").innerText = "▶ Start";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// Zoom Feature
document.querySelectorAll(".zoomBtn").forEach(btn => {
  btn.addEventListener("click", () => {
    zoomLevel = parseFloat(btn.dataset.zoom);
  });
});

// Toggle Skeleton
document.getElementById("toggleSkeleton").addEventListener("click", () => {
  showSkeleton = !showSkeleton;
  document.getElementById("toggleSkeleton").innerText = showSkeleton ? "⚡ Skeleton On" : "⚡ Skeleton Off";
});

// Info Button
document.getElementById("infoBtn").addEventListener("click", () => {
  alert("Futuristic Pose Tracker v2.0\n- Zoom Controls\n- Advanced Skeleton\n- Neon Futuristic Design");
});

// Pose Detection
async function detectPose() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  setInterval(async () => {
    if (!isCameraOn) return;
    const pose = await net.estimateSinglePose(video, { flipHorizontal: true });

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply Zoom
    ctx.save();
    ctx.scale(zoomLevel, zoomLevel);
    ctx.translate(
      (canvas.width / zoomLevel - canvas.width) / 2,
      (canvas.height / zoomLevel - canvas.height) / 2
    );

    // Draw Skeleton
    if (showSkeleton) {
      drawSkeleton(pose);
    }

    ctx.restore();
  }, 100);
}

// Futuristic Skeleton Drawing
function drawSkeleton(pose) {
  pose.keypoints.forEach(kp => {
    if (kp.score > 0.5) {
      ctx.beginPath();
      ctx.arc(kp.position.x, kp.position.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = "#0ff";
      ctx.fill();
    }
  });

  // Extra futuristic connections
  let connections = [
    ["leftShoulder", "rightShoulder"],
    ["leftHip", "rightHip"],
    ["leftShoulder", "leftElbow"],
    ["rightShoulder", "rightElbow"],
    ["leftElbow", "leftWrist"],
    ["rightElbow", "rightWrist"],
    ["leftHip", "leftKnee"],
    ["rightHip", "rightKnee"],
    ["leftKnee", "leftAnkle"],
    ["rightKnee", "rightAnkle"],
    ["leftShoulder", "leftHip"],
    ["rightShoulder", "rightHip"],
    // futuristic extras
    ["leftWrist", "rightWrist"],
    ["leftAnkle", "rightAnkle"],
    ["nose", "leftWrist"],
    ["nose", "rightWrist"],
  ];

  connections.forEach(([p1, p2]) => {
    let kp1 = pose.keypoints.find(k => k.part === p1);
    let kp2 = pose.keypoints.find(k => k.part === p2);

    if (kp1 && kp2 && kp1.score > 0.5 && kp2.score > 0.5) {
      ctx.beginPath();
      ctx.moveTo(kp1.position.x, kp1.position.y);
      ctx.lineTo(kp2.position.x, kp2.position.y);
      ctx.strokeStyle = "#0ff";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#0ff";
      ctx.stroke();
    }
  });
}

// Init
document.getElementById("startStopBtn").addEventListener("click", toggleCamera);
loadModel();
