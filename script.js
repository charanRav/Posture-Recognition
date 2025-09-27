// --- DOM Elements ---
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const loader = document.getElementById("loader");

const startStopBtn = document.getElementById("startStopBtn");
const startStopIcon = document.getElementById("startStopIcon");
const zoomBtns = document.querySelectorAll(".zoom-btn");
const skeletonToggleBtn = document.getElementById("skeletonToggleBtn");
const infoBtn = document.getElementById("infoBtn");
const modal = document.getElementById("infoModal");
const closeModalBtn = document.querySelector(".close-btn");

// --- App State ---
let net = null;
let animationFrame = null;
let isCameraOn = false;
let skeletonVisible = true;

// --- SVG Icons ---
const playIcon = `<path d="M8 5v14l11-7z"></path>`; // Play Icon
const pauseIcon = `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path>`; // Pause Icon

// --- Core Functions ---

/**
 * Loads the PoseNet model and enables the start button.
 * This is the main fix for the tracking issue.
 */
async function initializeApp() {
    try {
        net = await posenet.load({
            architecture: 'MobileNetV1',
            outputStride: 16,
            inputResolution: { width: 640, height: 480 },
            multiplier: 0.75
        });
        loader.style.display = "none"; // Hide loader
        startStopBtn.disabled = false; // Enable button
    } catch (error) {
        console.error("Failed to load PoseNet model.", error);
        loader.innerHTML = "<p>Error: Could not load AI model. Please refresh.</p>";
    }
}

/**
 * Starts the camera feed.
 */
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        video.srcObject = stream;
        await new Promise(resolve => {
            video.onloadedmetadata = () => { video.play(); resolve(); };
        });
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        isCameraOn = true;
        startStopIcon.innerHTML = pauseIcon;
        startStopBtn.title = "Stop Camera";
        detectPose(); // Start detection loop
    } catch (err) {
        console.error("Error accessing camera:", err);
        alert("Could not access camera. Please grant permission and try again.");
    }
}

/**
 * Stops the camera feed and clears the canvas.
 */
function stopCamera() {
    const stream = video.srcObject;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    isCameraOn = false;
    startStopIcon.innerHTML = playIcon;
    startStopBtn.title = "Start Camera";
}

/**
 * Draws the skeleton on the canvas.
 */
function drawSkeleton(pose) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!skeletonVisible || !pose) return;

    const keypoints = pose.keypoints;
    const minConfidence = 0.5;

    // Draw connecting lines (bones)
    const adjacentKeyPoints = posenet.getAdjacentKeyPoints(keypoints, minConfidence);
    adjacentKeyPoints.forEach(points => {
        ctx.beginPath();
        ctx.moveTo(points[0].position.x, points[0].position.y);
        ctx.lineTo(points[1].position.x, points[1].position.y);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0, 210, 255, 0.7)';
        ctx.stroke();
    });
    
    // Draw keypoints (joints)
    keypoints.forEach(kp => {
        if (kp.score > minConfidence) {
            ctx.beginPath();
            ctx.arc(kp.position.x, kp.position.y, 5, 0, 2 * Math.PI);
            ctx.fillStyle = '#00d2ff';
            ctx.fill();
        }
    });
}

/**
 * Main detection loop.
 */
async function detectPose() {
    if (!isCameraOn) return;
    const pose = await net.estimateSinglePose(video, { flipHorizontal: false });
    drawSkeleton(pose);
    animationFrame = requestAnimationFrame(detectPose);
}

// --- Event Listeners ---

startStopBtn.addEventListener("click", () => {
    isCameraOn ? stopCamera() : startCamera();
});

skeletonToggleBtn.addEventListener("click", () => {
    skeletonVisible = !skeletonVisible;
    skeletonToggleBtn.classList.toggle("active", skeletonVisible);
});

zoomBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        zoomBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const zoomValue = btn.getAttribute("data-zoom");
        const transformValue = `translate(-50%, -50%) scale(${zoomValue}) scaleX(-1)`;
        video.style.transform = transformValue;
        canvas.style.transform = transformValue;
    });
});

infoBtn.addEventListener("click", () => modal.style.display = "block");
closeModalBtn.addEventListener("click", () => modal.style.display = "none");
window.addEventListener("click", e => {
    if (e.target === modal) modal.style.display = "none";
});

// --- Initialize the App ---
initializeApp();
