// --- START OF NEW FEATURES (DOM Elements) ---
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const startStopBtn = document.getElementById("startStopBtn");
const zoomBtns = document.querySelectorAll(".zoom-btn");
const skeletonToggleBtn = document.getElementById("skeletonToggleBtn");
const infoBtn = document.getElementById("infoBtn");
const modal = document.getElementById("infoModal");
const closeModalBtn = document.querySelector(".close-btn");

let net = null;
let animationFrame = null;
let isCameraOn = false;
let skeletonVisible = true;
// --- END OF NEW FEATURES (DOM Elements) ---

// --- START OF EXISTING CODE (Modified for new structure) ---
// Start camera function
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: false,
        });
        video.srcObject = stream;
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.play();
                resolve();
            };
        });
        isCameraOn = true;
        startStopBtn.textContent = "■"; // Stop icon
        startStopBtn.title = "Stop Camera";
    } catch (err) {
        console.error("Error accessing camera:", err);
        alert("Could not access the camera. Please ensure you have granted permission.");
    }
}

// Stop camera function
function stopCamera() {
    let stream = video.srcObject;
    if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
    }
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
    // Clear the canvas when camera stops
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    isCameraOn = false;
    startStopBtn.textContent = "▶"; // Start icon
    startStopBtn.title = "Start Camera";
}

// Draw skeleton function (Replaced with Advanced Skeleton Tracking)
// The original simple 'drawSkeleton' is now replaced by the two functions below
// for a more advanced visual.
// --- END OF EXISTING CODE ---

// --- START OF NEW FEATURES (Advanced Skeleton and Pose Logic) ---

/**
 * Draws a line between two keypoints.
 * @param {Object} keypoint1 - The first keypoint.
 * @param {Object} keypoint2 - The second keypoint.
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
 */
function drawSegment([ay, ax], [by, bx], color, scale, ctx) {
    ctx.beginPath();
    ctx.moveTo(ax * scale, ay * scale);
    ctx.lineTo(bx * scale, by * scale);
    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    ctx.stroke();
}

/**
 * Draws the complete skeleton with connecting lines.
 * This provides the "advanced" look by connecting all adjacent joints.
 * @param {Object} pose - The pose object from PoseNet.
 */
function drawAdvancedSkeleton(pose) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!skeletonVisible) return; // Stop drawing if skeleton is toggled off

    const keypoints = pose.keypoints;
    const minConfidence = 0.4; // Confidence threshold

    // Draw keypoints (joints)
    ctx.fillStyle = "rgba(14, 165, 233, 0.9)"; // Neon blue
    keypoints.forEach(kp => {
        if (kp.score > minConfidence) {
            ctx.beginPath();
            ctx.arc(kp.position.x, kp.position.y, 6, 0, 2 * Math.PI);
            ctx.fill();
        }
    });

    // Draw connections (bones)
    const adjacentKeyPoints = posenet.getAdjacentKeyPoints(keypoints, minConfidence);
    ctx.strokeStyle = "rgba(60, 102, 192, 0.7)"; // Lighter neon blue for lines
    ctx.lineWidth = 3;

    adjacentKeyPoints.forEach((points) => {
        ctx.beginPath();
        ctx.moveTo(points[0].position.x, points[0].position.y);
        ctx.lineTo(points[1].position.x, points[1].position.y);
        ctx.stroke();
    });
}


// Detect poses function (Modified to call the new drawing function)
async function detectPose() {
    if (!isCameraOn) return;
    const pose = await net.estimateSinglePose(video, {
        flipHorizontal: false // Already handled by CSS transform
    });
    drawAdvancedSkeleton(pose);
    animationFrame = requestAnimationFrame(detectPose);
}

// --- Event Listeners for new controls ---

// Start/Stop button
startStopBtn.addEventListener("click", async () => {
    if (isCameraOn) {
        stopCamera();
    } else {
        await startCamera();
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        if (!net) {
            try {
                 net = await posenet.load();
            } catch (error) {
                console.error("Failed to load PoseNet model.", error);
                alert("Failed to load PoseNet model. Please check your internet connection and try again.");
                stopCamera();
                return;
            }
        }
        detectPose();
    }
});

// Zoom controls
zoomBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        // Remove active class from all zoom buttons
        zoomBtns.forEach(b => b.classList.remove("active"));
        // Add active class to the clicked button
        btn.classList.add("active");

        const zoomValue = btn.getAttribute("data-zoom");
        const transformValue = `translate(-50%, -50%) scale(${zoomValue}) scaleX(-1)`;
        
        video.style.transform = transformValue;
        canvas.style.transform = transformValue;
    });
});


// Toggle skeleton button
skeletonToggleBtn.addEventListener("click", () => {
    skeletonVisible = !skeletonVisible;
    skeletonToggleBtn.classList.toggle("active", skeletonVisible);
});

// Info Modal controls
infoBtn.addEventListener("click", () => {
    modal.style.display = "block";
});

closeModalBtn.addEventListener("click", () => {
    modal.style.display = "none";
});

window.addEventListener("click", (event) => {
    if (event.target == modal) {
        modal.style.display = "none";
    }
});
// --- END OF NEW FEATURES ---
