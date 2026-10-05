@echo off
REM ============================================================
REM  Local FaceSwap – Windows Setup Script
REM  Automated installation for dependencies and system tools
REM ============================================================
echo.
echo  ============================================
echo   Local FaceSwap - Automated Setup (Windows)
echo  ============================================
echo.

REM ── 0. Check License ─────────────────────────────────────────
if not exist .license.key (
    echo [ERROR] .license.key NOT FOUND. 
    echo Please ensure you have placed the license patch in this directory.
    echo Contact support if you need a new patch.
    pause & exit /b 1
)
echo [OK] License key detected.

REM ── 1. Check Python ──────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.10 (Highly Recommended) or 3.9+ from https://python.org
    pause & exit /b 1
)
echo [OK] Python found: 
python --version

REM ── 2. Check FFmpeg ──────────────────────────────────────────
echo.
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo [!] FFmpeg not found in PATH.
    echo [*] Attempting to install FFmpeg via winget...
    winget install --id=Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements
    if errorlevel 1 (
        echo [ERROR] FFmpeg installation failed. Please install it manually from https://ffmpeg.org
        pause & exit /b 1
    )
    echo [OK] FFmpeg installed. NOTE: You may need to RESTART your terminal for this to take effect.
) else (
    echo [OK] FFmpeg found.
)

REM ── 3. Upgrade pip + build essentials ────────────────────────
echo.
echo [*] Upgrading pip, setuptools, and wheel...
python -m pip install --upgrade pip setuptools wheel
echo [OK] pip tools upgraded.

REM ── 4. Install cmake (required for insightface build) ────────
echo.
echo [*] Installing cmake...
pip install cmake
echo [OK] cmake installed.

REM ── 5. Install insightface ───────────────────────────────────
echo.
echo [*] Installing insightface...
pip install insightface
if errorlevel 1 (
    echo.
    echo [!] Standard install failed. This usually means C++ Build Tools are missing.
    echo [*] Attempting to install Microsoft C++ Build Tools via winget (requires Admin)...
    echo [!] This is a large download and may require a system restart.
    winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" --passive
    if errorlevel 1 (
        echo.
        echo  ==============================================================
        echo   [ERROR] insightface compilation failed and Build Tools install failed.
        echo.
        echo   PLEASE MANUALLY INSTALL:
        echo   https://aka.ms/vs/17/release/vs_BuildTools.exe
        echo   Select "Desktop development with C++" during install.
        echo  ==============================================================
        echo.
        pause & exit /b 1
    )
    echo [OK] Build Tools installed. Please RESTART this script to try insightface again.
    pause & exit /b 0
)
echo [OK] insightface installed.

REM ── 6. Install remaining dependencies ────────────────────────
echo.
echo [*] Installing remaining dependencies (TensorFlow, OpenCV, etc.)...
pip install fastapi uvicorn[standard] python-multipart pillow opencv-python onnxruntime numpy tensorflow opennsfw2 tqdm
if errorlevel 1 (
    echo [ERROR] Failed to install remaining dependencies.
    pause & exit /b 1
)
echo [OK] All dependencies installed.

REM ── 7. Clone Roop if not present ─────────────────────────────
echo.
if not exist roop (
    echo [*] Cloning Roop...
    git clone https://github.com/s0md3v/roop roop
    if errorlevel 1 (
        echo [ERROR] git clone failed. Make sure git is installed.
        pause & exit /b 1
    )
    echo [OK] Roop cloned.
) else (
    echo [OK] Roop directory already exists.
)

REM ── 8. Create required directories ───────────────────────────
if not exist roop\models mkdir roop\models
if not exist tmp mkdir tmp

REM ── 9. Check for model ───────────────────────────────────────
echo.
if not exist roop\models\inswapper_128.onnx (
    echo  ==============================================
    echo   [ACTION REQUIRED] Download the ONNX model:
    echo.
    echo   URL:
    echo   https://huggingface.co/ezioruan/inswapper_128.onnx/resolve/main/inswapper_128.onnx
    echo.
    echo   Save to: %CD%\roop\models\inswapper_128.onnx
    echo  ==============================================
) else (
    echo [OK] Model found.
)

echo.
echo  ============================================
echo   Setup complete!
echo.
echo   To START the server:
echo     python server.py
echo.
echo   Then load the extension/ folder in Chrome:
echo     chrome://extensions  -^>  Load unpacked
echo  ============================================
echo.
pause
