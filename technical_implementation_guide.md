# Technical Implementation Guide: Local FaceSwap Extension

This document provides a comprehensive guide for deploying the Local FaceSwap project on any Windows-based system.

## 1. System Requirements

### Hardware
-   **Minimum**: Quad-core CPU, 8GB RAM.
-   **Recommended**: NVIDIA GPU (RTX 2060 or better) with 6GB+ VRAM for real-time performance.
-   **Storage**: 5GB free space (mostly for models and dependencies).

### Software
-   **OS**: Windows 10/11.
-   **Python**: 3.10.x (Recommended) or 3.11.x.
-   **FFmpeg**: Required for frame manipulation and video processing.
-   **CUDA/cuDNN**: Highly recommended for GPU acceleration (requires NVIDIA GPU).

## 2. Architectural Overview

The system consists of three main layers:

1.  **Frontend (Chrome Extension)**:
    -   Built with Vanilla HTML/JS/CSS.
    -   Handles camera access (getUserMedia) and frame capture.
    -   Implements **Synchronized Backpressure**: only sends a new frame once the previous one is processed.
2.  **Backend (FastAPI Server)**:
    -   Python-based server using `uvicorn`.
    -   WebSocket endpoint (`/live-swap`) for real-time frame streaming.
    -   Integrates the `roop` core and `insightface` for AI processing.
3.  **AI Core (InsightFace + Roop)**:
    -   `inswapper_128.onnx`: The primary model for face swapping.
    -   Runs on ONNX Runtime (CPU or CUDA).

## 3. Implementation Steps

### Phase 1: Environment Setup
1.  **Install Python**: Ensure "Add to PATH" is checked during installation.
2.  **Install FFmpeg**: Use the provided `setup.bat` or `winget install Gyan.FFmpeg`.
3.  **Visual Studio Build Tools**: Required to compile the `insightface` library. Install the "Desktop development with C++" workload.

### Phase 2: Dependency Installation
Run the following commands:
```bash
pip install insightface==0.7.3
pip install fastapi uvicorn[standard] opencv-python onnxruntime-gpu tqdm
```
*Note: Use `onnxruntime` if no NVIDIA GPU is available.*

### Phase 3: Model Deployment
Download `inswapper_128.onnx` and place it in the `roop/models/` directory.

### Phase 4: Extension Configuration
1.  Open Chrome and navigate to `chrome://extensions`.
2.  Enable "Developer mode".
3.  Click "Load unpacked" and select the `extension/` folder from this project.

## 4. Maintenance & Protection

### Protection Mechanism
The system includes a time-based validation check.
-   A `.license.key` file must be present in the root directory.
-   The server checks this key against the current system time.
-   If the key is older than 30-60 days, the server will refuse to start.

### Updating the License (Patching)
To maintain the system, the administrator must provide a new `.license.key` periodically.
1.  Run `python scripts/generate_patch.py` on the master machine.
2.  Transmit the resulting `.license.key` to the target machine's root folder.

## 5. Troubleshooting

-   **Lag/Choppiness**: Ensure GPU acceleration is active. Check `server.log` for processing times.
-   **No Face Detected**: Ensure good lighting and that the target face is clearly visible to the camera.
-   **WebSocket Error**: Ensure no other process is using port 8000 and the server is running.

---

## 6. Mobile Implementation (Phone)

To run this on a phone, the architecture shifts from a "Local Extension" to a "Client-Server Web App":
-   **Public Access**: The server must be reachable over the internet (e.g., via a public IP or a tunnel like `ngrok`).
-   **Mobile UI**: A standalone `index.html` (rather than a `popup.html`) is used to access the phone's camera.
-   **Streaming**: Use **WebRTC** instead of WebSockets for mobile data to handle variable network speeds better.

## 7. Accessibility & Facial Recognition

The software can be adapted as an assistive technology:
-   **Feature Stabilization**: Helping identify users with atypical facial movement or tremors by "normalizing" the face in real-time for traditional recognition systems.
-   **Biometric Aid**: Allowing users to "playback" their own pre-recorded "active expressions" (blinks, smiles) onto their live face to satisfy liveness detection requirements of third-party apps.
