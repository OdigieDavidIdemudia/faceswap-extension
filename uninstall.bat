@echo off
REM ============================================================
REM  Local FaceSwap – Windows Uninstall Script
REM  Removes pip packages, Roop clone, tmp files, and icons.
REM ============================================================
echo.
echo  ============================================
echo   Local FaceSwap - Uninstall (Windows)
echo  ============================================
echo.
echo  [WARNING] This will:
echo    - Uninstall Python packages installed by this project
echo    - Delete the cloned roop\ directory
echo    - Delete the tmp\ folder and all temp images
echo.
set /p CONFIRM=  Type YES to continue or anything else to cancel: 

if /I not "%CONFIRM%"=="YES" (
    echo  Cancelled. Nothing was changed.
    pause & exit /b 0
)

echo.

REM ── 1. Uninstall pip packages ────────────────────────────────
echo [*] Uninstalling Python packages...
pip uninstall -y ^
    fastapi ^
    uvicorn ^
    python-multipart ^
    pillow ^
    insightface ^
    opencv-python ^
    onnxruntime ^
    numpy ^
    starlette ^
    anyio ^
    httptools ^
    h11 ^
    2>nul

echo [OK] Pip packages removed (any not installed are safely skipped).

REM ── 2. Remove Roop clone ─────────────────────────────────────
echo.
if exist roop (
    echo [*] Removing roop\ directory...
    rmdir /s /q roop
    echo [OK] roop\ deleted.
) else (
    echo [SKIP] roop\ directory not found.
)

REM ── 3. Remove tmp/ ───────────────────────────────────────────
echo.
if exist tmp (
    echo [*] Removing tmp\ directory...
    rmdir /s /q tmp
    echo [OK] tmp\ deleted.
) else (
    echo [SKIP] tmp\ directory not found.
)

REM ── 4. Remove __pycache__ ────────────────────────────────────
echo.
if exist __pycache__ (
    echo [*] Removing __pycache__...
    rmdir /s /q __pycache__
    echo [OK] __pycache__ deleted.
)

echo.
echo  ============================================
echo   Uninstall complete!
echo.
echo   The following were NOT removed (intentional):
echo     - server.py, requirements.txt, setup.bat
echo     - extension\ folder
echo     - README.md, .gitignore
echo.
echo   To fully remove the project, delete the
echo   entire faceswap-extension\ folder manually.
echo  ============================================
echo.
pause
