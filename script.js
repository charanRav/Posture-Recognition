const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('output');
const canvasCtx = canvasElement.getContext('2d');
const startBtn = document.getElementById('startBtn');
const zoomRange = document.getElementById('zoomRange');
const zoomValue = document.getElementById('zoomValue');

let currentZoom = 1;

// Update zoom value display
zoomRange.addEventListener('input', () => {
  currentZoom = parseFloat(zoomRange.value);
  zoomValue.textContent = currentZoom.toFixed(1) + "x";
  videoElement.style.transform = `scale(${currentZoom})`;
  canvasElement.style.transform = `scale(${currentZoom})`;
});

// Setup Pose model
const pose = new Pose.Pose({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
});

pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

pose.onResults(onResults);

// Handle results (draw futuristic lines)
function onResults(results) {
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;

  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  if (results.poseLandmarks) {
    // Normal skeleton
    drawConnectors(canvasCtx, results.poseLandmarks, Pose.POSE_CONNECTIONS, {
      color: '#00e0ff',
      lineWidth: 4
    });
    drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#ff0055', radius: 4 });

    // Extra futuristic overlays
    canvasCtx.strokeStyle = "rgba(0, 255, 150, 0.7)";
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    results.poseLandmarks.forEach((lm, i) => {
      const x = lm.x * canvasElement.width;
      const y = lm.y * canvasElement.height;
      if (i % 2 === 0) {
        canvasCtx.lineTo(x, y);
      }
    });
    canvasCtx.stroke();

    // Circular overlay around head
    const head = results.poseLandmarks[0];
    if (head) {
      const hx = head.x * canvasElement.width;
      const hy = head.y * canvasElement.height;
      canvasCtx.beginPath();
      canvasCtx.arc(hx, hy, 40, 0, 2 * Math.PI);
      canvasCtx.strokeStyle = "rgba(255, 0, 200, 0.6)";
      canvasCtx.lineWidth = 3;
      canvasCtx.stroke();
    }
  }
}

// Start webcam + pose
startBtn.addEventListener('click', () => {
  const camera = new Camera(videoElement, {
    onFrame: async () => {
      await pose.send({ image: videoElement });
    },
    width: 640,
    height: 480,
  });
  camera.start();
});
