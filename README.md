# SpineGuard — Poster / Posture Monitor (Frontend)

This is a browser-based frontend upgrade of your Python MediaPipe posture project.
It uses MediaPipe Pose (JS) to run pose detection in-browser and draws futuristic tracking lines
with a dark/light theme toggle.

## Files
- index.html
- styles.css
- script.js

## How it works
- `index.html` contains the UI and loads `script.js`.
- `script.js` dynamically loads MediaPipe Pose from a CDN and uses the webcam.
- The canvas overlays futuristic tracking lines between shoulder midpoint and hip midpoint.
- UI includes controls for theme, start/stop webcam, and tracking parameters.

## Run locally
1. You must serve files over HTTP (browsers block webcam on `file://`).
2. From the project folder run a simple static server. Examples:

**Using Python 3:**
```
# Python 3.x
python -m http.server 8000
# then open http://localhost:8000 in the browser
```

**Or using Node (http-server):**
```
npx http-server -p 8000
```

3. Click "Start". Allow webcam access.

## Deploy to GitHub Pages
1. Create a new GitHub repository and push these files to the `main` branch.
2. In the repository settings -> Pages, select the `main` branch and `/ (root)` as source.
3. Save — the site will be published at `https://<your-username>.github.io/<repo-name>/`.

Notes:
- MediaPipe JS is loaded from CDN (`jsdelivr`) — if you later want offline hosting, download the packages
  and serve them from your repo or use a bundler (Vite/Parcel/webpack).
- This frontend runs entirely in the browser — no Python or server-side code required.

## Upgrading visuals / tracking
- Adjust `trailLen`, `lineWidth`, and `glow` sliders in the UI.
- To change computation (e.g., more tracking points), edit `script.js` — you can sample additional landmarks
  (nose, shoulders, hips) and draw multi-segment spline paths.
- For recording video, you can capture the canvas stream with `canvas.captureStream()` and save it.

## License
MIT

