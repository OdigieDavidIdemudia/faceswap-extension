#!/usr/bin/env bash
# ============================================================
#  Local FaceSwap – Linux/macOS Setup Script
# ============================================================
set -e

echo ""
echo " ============================================"
echo "  Local FaceSwap - Automated Setup"
echo " ============================================"
echo ""

# 1. Python check
if ! command -v python3 &>/dev/null; then
    echo "[ERROR] python3 not found. Install Python 3.10 (Highly Recommended) or 3.9+"
    exit 1
fi
echo "[OK] $(python3 --version)"

# 2. FFmpeg check
if ! command -v ffmpeg &>/dev/null; then
    echo "[ERROR] ffmpeg not found. Install it via your package manager (e.g., 'sudo apt install ffmpeg' or 'brew install ffmpeg')"
    exit 1
fi
echo "[OK] FFmpeg found."

# 3. Install core dependencies
echo ""
echo "[*] Installing Python dependencies..."
pip3 install fastapi uvicorn[standard] python-multipart pillow insightface opencv-python onnxruntime numpy tensorflow opennsfw2 tqdm
echo "[OK] Dependencies installed."

# 4. Clone Roop
if [ ! -d "roop" ]; then
    echo ""
    echo "[*] Cloning Roop..."
    git clone https://github.com/s0md3v/roop roop
    echo "[OK] Roop cloned."
else
    echo "[OK] Roop directory already exists."
fi

# 5. Model directory
mkdir -p roop/models tmp

# 6. Model check
if [ ! -f "roop/models/inswapper_128.onnx" ]; then
    echo ""
    echo " ============================================"
    echo "  [ACTION REQUIRED] Download the model:"
    echo ""
    echo "  URL: https://huggingface.co/ezioruan/inswapper_128.onnx/resolve/main/inswapper_128.onnx"
    echo "  Target: $(pwd)/roop/models/inswapper_128.onnx"
    echo ""
    echo "    wget -O roop/models/inswapper_128.onnx \\"
    echo "      https://huggingface.co/ezioruan/inswapper_128.onnx/resolve/main/inswapper_128.onnx"
    echo " ============================================"
else
    echo "[OK] Model found."
fi

echo ""
echo " ============================================"
echo "  Setup complete!"
echo ""
echo "  Start the server:"
echo "    python3 server.py"
echo ""
echo "  Load the extension/ folder in Chrome:"
echo "    chrome://extensions  ->  Load unpacked"
echo " ============================================"
echo ""
