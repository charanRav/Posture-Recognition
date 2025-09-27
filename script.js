// --- DOM Elements ---
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const loader = document.getElementById("loader");
// Buttons
const startStopBtn = document.getElementById("startStopBtn");
const calibrateBtn = document.getElementById("calibrateBtn");
const skeletonToggleBtn = document.getElementById("skeletonToggleBtn");
const audioToggleBtn = document.getElementById("audioToggleBtn");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const infoBtn = document.getElementById("infoBtn");
// UI Elements
const statusText = document.getElementById("statusText");
const scoreText = document.getElementById("scoreText");
const alertSound = document.getElementById("alertSound");
// Modals & Icons
const infoModal = document.getElementById("infoModal");
const closeModalBtn = document.querySelector(".close-btn");
const startStopIcon = document.getElementById("startStopIcon");
const audioIcon = document.getElementById("audioIcon");
const themeIcon = document.getElementById("themeIcon");

// --- App State ---
let net = null, animationFrame = null;
let isCameraOn = false, skeletonVisible = true, isAudioMuted = true;
let isCalibrated = false, idealPose = null, badPostureFrames = 0;
const POSTURE_HISTORY_LENGTH = 15; // Frames to average over
let postureHistory = [];

// --- SVG Icons ---
const playIcon = `<path fill="currentColor" d="M8 5v14l11-7z"></path>`;
const pauseIcon = `<path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path>`;
const audioOnIcon = `<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path>`;
const audioOffIcon = `<path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"></path>`;
const sunIcon = `<path fill="currentColor" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.03-3.59 2.18-6.68 5-7.93V3H7v2.07C4.18 6.32 2.03 9.41 2 13zm18 0c-.03-3.59-2.18-6.68-5-7.93V3h2v2.07c2.82 1.25 4.97 4.34 5 8.93h-2zM12 5V3h2v2c-3.59.03-6.68 2.18-7.93 5H5.07C6.32 7.18 9.41 5.03 13 5h-1zm0 14v2h-2v-2c3.59-.03 6.68-2.18 7.93-5h1.99c-1.25 2.82-4.34 4.97-8.93 5h1z"></path>`;
const moonIcon = `<path fill="currentColor" d="M12 3a9 9 0 0 0 9 9c0 .46-.04.92-.1 1.36a5.5 5.5 0 0 1-9.76-4.86A9 9 0 0 0 12 3z"></path>`;

// --- Main Application Logic ---

// Initializes the PoseNet model
async function initializeApp() {
    try {
        net = await posenet.load({ architecture: 'MobileNetV1', outputStride: 16, inputResolution: { width: 640, height: 480 }, multiplier: 0.75 });
        loader.style.display = 'none';
        startStopBtn.disabled = false;
        skeletonToggleBtn.disabled = false;
        calibrateBtn.disabled = false;
    } catch (error) {
        loader.innerHTML = "<p>Error: Could not load AI model. Please refresh.</p>";
        console.error(error);
    }
}

// Starts/Stops the camera and detection loop
function toggleCamera() {
    isCameraOn = !isCameraOn;
    if (isCameraOn) {
        startStopIcon.innerHTML = pauseIcon;
        startStopBtn.title = "Stop Camera";
        startCamera();
    } else {
        startStopIcon.innerHTML = playIcon;
        startStopBtn.title = "Start Camera";
        stopCamera();
    }
}

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        video.srcObject = stream;
        await new Promise(resolve => { video.onloadedmetadata = () => { video.play(); resolve(); }; });
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        detectPose();
    } catch (err) {
        alert("Could not access camera. Please grant permission.");
        console.error(err);
        toggleCamera(); // Revert state
    }
}

function stopCamera() {
    video.srcObject?.getTracks().forEach(track => track.stop());
    cancelAnimationFrame(animationFrame);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    statusText.textContent = isCalibrated ? "Paused" : "Awaiting Calibration";
    scoreText.textContent = '--';
}

// Main detection loop
async function detectPose() {
    if (!isCameraOn) return;
    const pose = await net.estimateSinglePose(video, { flipHorizontal: false });
    if (pose) {
        analyzePose(pose);
        if (skeletonVisible) drawSkeleton(pose);
    }
    animationFrame = requestAnimationFrame(detectPose);
}

// --- Pose Analysis ---

// Calculates the angle between three points
function calculateAngle(a, b, c) {
    const rad = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(rad * 180.0 / Math.PI);
    return angle > 180.0 ? 360 - angle : angle;
}

// Analyzes the detected pose for posture
function analyzePose(pose) {
    const kp = pose.keypoints.reduce((acc, curr) => ({ ...acc, [curr.part]: curr.position }), {});
    const minConfidence = 0.3;

    if (['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip', 'leftEar', 'rightEar'].every(p => pose.keypoints.find(kp => kp.part === p).score > minConfidence)) {
        const shoulder = { x: (kp.leftShoulder.x + kp.rightShoulder.x) / 2, y: (kp.leftShoulder.y + kp.rightShoulder.y) / 2 };
        const hip = { x: (kp.leftHip.x + kp.rightHip.x) / 2, y: (kp.leftHip.y + kp.rightHip.y) / 2 };
        const ear = { x: (kp.leftEar.x + kp.rightEar.x) / 2, y: (kp.rightEar.y + kp.leftEar.y) / 2 };
        const neckAngle = calculateAngle(ear, shoulder, hip);

        const defaultIdeal = { neck: 160 };
        const ideal = isCalibrated ? idealPose : defaultIdeal;
        
        const neckDeviation = Math.abs(neckAngle - ideal.neck);
        
        let score = 100 - (neckDeviation * 3); // Simple scoring
        score = Math.max(0, Math.min(100, score)); // Clamp score 0-100
        scoreText.textContent = Math.round(score);

        let status = "Good Posture";
        if (neckDeviation > 15) status = "Straighten Your Back";
        if (neckAngle < ideal.neck - 10) status = "Tuck Your Chin In";
        
        updatePostureHistory(status);
    }
}

// Smooths feedback to prevent flickering
function updatePostureHistory(currentStatus) {
    postureHistory.push(currentStatus);
    if (postureHistory.length > POSTURE_HISTORY_LENGTH) postureHistory.shift();

    const statusCounts = postureHistory.reduce((acc, status) => {
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {});

    const dominantStatus = Object.keys(statusCounts).reduce((a, b) => statusCounts[a] > statusCounts[b] ? a : b);
    statusText.textContent = dominantStatus;

    // Handle alerts for prolonged bad posture
    if (dominantStatus !== "Good Posture") {
        badPostureFrames++;
        if (badPostureFrames > 45 && !isAudioMuted) { // approx 1.5 seconds
            alertSound.play();
            badPostureFrames = 0; // Reset after alert
        }
    } else {
        badPostureFrames = 0;
    }
}

// --- Drawing ---

function drawSkeleton(pose) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const neckDeviation = idealPose ? Math.abs(calculateAngle(
        pose.keypoints.find(k=>k.part==='leftEar').position, 
        pose.keypoints.find(k=>k.part==='leftShoulder').position, 
        pose.keypoints.find(k=>k.part==='leftHip').position) - idealPose.neck) : 0;
    
    let color = 'rgba(0, 255, 0, 0.8)'; // Green
    if (neckDeviation > 15) color = 'rgba(255, 0, 0, 0.8)'; // Red
    else if (neckDeviation > 7) color = 'rgba(255, 255, 0, 0.8)'; // Yellow

    posenet.getAdjacentKeyPoints(pose.keypoints, 0.5).forEach(points => {
        ctx.beginPath();
        ctx.moveTo(points[0].position.x, points[0].position.y);
        ctx.lineTo(points[1].position.x, points[1].position.y);
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.stroke();
    });
}

// --- Event Listeners ---

startStopBtn.addEventListener('click', toggleCamera);

calibrateBtn.addEventListener('click', () => {
    if (!isCameraOn) {
        alert("Please start the camera first!");
        return;
    }
    // Simple calibration based on neck angle
    const pose = net.estimateSinglePose(video, { flipHorizontal: false }).then(pose => {
        const kp = pose.keypoints.reduce((acc, curr) => ({ ...acc, [curr.part]: curr.position }), {});
        const shoulder = { x: (kp.leftShoulder.x + kp.rightShoulder.x) / 2, y: (kp.leftShoulder.y + kp.rightShoulder.y) / 2 };
        const hip = { x: (kp.leftHip.x + kp.rightHip.x) / 2, y: (kp.leftHip.y + kp.rightHip.y) / 2 };
        const ear = { x: (kp.leftEar.x + kp.rightEar.x) / 2, y: (kp.rightEar.y + kp.leftEar.y) / 2 };
        idealPose = { neck: calculateAngle(ear, shoulder, hip) };
        isCalibrated = true;
        statusText.textContent = "Calibrated!";
        setTimeout(() => { if(isCameraOn) statusText.textContent = "Good Posture"; }, 2000);
    });
});

skeletonToggleBtn.addEventListener('click', () => {
    skeletonVisible = !skeletonVisible;
    skeletonToggleBtn.classList.toggle('active', skeletonVisible);
});

audioToggleBtn.addEventListener('click', () => {
    isAudioMuted = !isAudioMuted;
    audioToggleBtn.title = isAudioMuted ? "Unmute Alerts" : "Mute Alerts";
    audioIcon.innerHTML = isAudioMuted ? audioOffIcon : audioOnIcon;
});

themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.body.dataset.theme;
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.body.dataset.theme = newTheme;
    themeIcon.innerHTML = newTheme === 'light' ? moonIcon : sunIcon;
});

infoBtn.addEventListener('click', () => modal.style.display = 'block');
closeModalBtn.addEventListener('click', () => modal.style.display = 'none');
window.addEventListener('click', e => { if (e.target === infoModal) modal.style.display = 'none'; });

// --- Initialize ---
initializeApp();
