# 🎭 Local FaceSwap — Browser Extension + AI Server

A privacy-first, locally-hosted AI face-swapping system consisting of a **Chrome/Chromium browser extension** paired with a **FastAPI backend server**. The entire pipeline runs on your own machine — no cloud uploads, no third-party APIs.

---

## ✨ Features

- **One-Click Face Swap** — Upload a source face through the browser popup and swap it onto any image on the current tab.
- **Live Webcam Swap (WebSocket)** — Real-time face swapping from your webcam feed via a persistent WebSocket connection (`/live-swap`).
- **GFPGAN Face Enhancement** — Optional post-processing to enhance and sharpen swapped faces using the GFPGAN model.
- **Local-Only Privacy** — All processing happens on `localhost:8000`. No data ever leaves your machine.
- **Virtual Camera Compatible** — Output can be piped into virtual camera software (OBS, etc.) for use in video calls.

---

## 🏗️ Architecture

```
Browser Extension (MV3)
│── popup.html / popup.js   — Source face upload UI
│── extension/              — Chrome extension files (manifest v3)
│
FastAPI Server (server.py)
│── POST /swap-face         — Static image-to-image face swap
│── POST /set-source        — Upload & cache source face
│── WS   /live-swap         — WebSocket real-time camera frame swap
│
AI Backend
│── roop/                   — Roop face-swapper (inswapper_128.onnx)
└── gfpgan/                 — GFPGAN face enhancement
```

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend server | Python, FastAPI, Uvicorn |
| Face swapping | [Roop](https://github.com/s0md3v/roop), InsightFace, ONNX Runtime |
| Face enhancement | GFPGAN, BasicSR |
| Image processing | OpenCV, NumPy |
| Browser extension | Manifest V3 (Chrome/Chromium) |
| Real-time comms | WebSocket |

---

## ⚙️ Requirements

- Python 3.10+
- CUDA-compatible GPU (recommended) or CPU
- Google Chrome / Chromium browser

---

## 🚀 Installation

### 1. Clone the repository

```bash
git clone https://github.com/OdigieDavidIdemudia/faceswap-extension.git
cd faceswap-extension
```

### 2. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 3. Download models

The server requires the `inswapper_128.onnx` model from InsightFace:

```bash
# Place the model at:
roop/models/inswapper_128.onnx
```

> See `cloud_and_hardware_guide.md` for GPU setup guidance.

### 4. Start the server

```bash
python server.py
```

The server starts at `http://localhost:8000`.

### 5. Load the browser extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer Mode**
3. Click **Load unpacked** and select the `extension/` folder
4. The FaceSwap extension icon will appear in your toolbar

---

## 🖥️ Usage

### Static Image Swap
1. Click the extension icon in your browser toolbar.
2. Upload a **source face** image via the popup.
3. Navigate to any webpage with a face image.
4. Click **Swap Face** — the selected image on the page is replaced.

### Live Webcam Swap
1. Set your source face via `POST /set-source`.
2. Open the web UI at `http://localhost:8000`.
3. Enable the webcam — frames are streamed over WebSocket and returned with the swapped face in real time.

---

## 📁 Project Structure

```
faceswap-extension/
├── server.py               # FastAPI backend — main entry point
├── extension/              # Chrome MV3 extension
│   ├── manifest.json
│   ├── popup.html / popup.js
│   └── icons/
├── roop/                   # Roop face-swapping engine
├── gfpgan/                 # GFPGAN face-enhancement model
├── web/                    # Static web UI (index.html, app.js)
├── scripts/                # Helper scripts
├── requirements.txt
├── setup.sh / setup.bat    # Platform setup scripts
└── technical_implementation_guide.md
```

---

## 📖 Guides

| Guide | Description |
|-------|-------------|
| [`technical_implementation_guide.md`](technical_implementation_guide.md) | Architecture deep-dive |
| [`cloud_and_hardware_guide.md`](cloud_and_hardware_guide.md) | GPU/cloud setup |
| [`virtual_camera_guide.md`](virtual_camera_guide.md) | OBS/virtual camera integration |
| [`remote_access_guide.md`](remote_access_guide.md) | Remote server access via tunnels |

---

## ⚠️ Disclaimer

This tool is intended for **research, creative, and educational purposes only**. Do not use this software to create deceptive, non-consensual, or harmful content. Misuse of face-swapping technology is unethical and may be illegal.

---

## 📄 License

MIT License — see [`roop/LICENSE`](roop/LICENSE) for the underlying Roop engine license.
