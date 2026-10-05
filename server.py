"""
Local FaceSwap Server - FastAPI Backend
Runs on http://localhost:8000

Exposes:
- POST /swap-face: Original image-to-image endpoint.
- POST /set-source: Upload source face for live swapping.
- WS /live-swap: WebSocket for real-time camera frame swapping.
"""

import os
import uuid
import logging
import sys
import base64
import cv2
import numpy as np
import threading
import asyncio
import time
from datetime import datetime
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import requests
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Setup Path for Roop
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).parent
ROOP_DIR = BASE_DIR / "roop"
sys.path.append(str(ROOP_DIR))

# Now we can import from roop
import roop.globals
import roop.processors.frame.face_swapper
import roop.processors.frame.face_enhancer
from roop.face_analyser import get_one_face
from roop.utilities import resolve_relative_path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
TMP_DIR = BASE_DIR / "tmp"
MODEL_PATH = ROOP_DIR / "models" / "inswapper_128.onnx"
LOG_FILE = BASE_DIR / "server.log"

TMP_DIR.mkdir(exist_ok=True)

# Configure logging to both console and file
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    handlers=[
        logging.FileHandler(str(LOG_FILE)),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Global State for Live Swap
# ---------------------------------------------------------------------------
CURRENT_SOURCE_FACE = None
CURRENT_FACE_INDEX = -1 # -1 means swap all faces
USE_VCAM = False
VCAM_INSTANCE = None
VCAM_LOCK = threading.Lock()
FRAME_COUNT = 0

def check_license():
    """Verify the .license.key file exists and is not expired."""
    license_file = BASE_DIR / ".license.key"
    if not license_file.exists():
        logger.error("CRITICAL: .license.key NOT FOUND. Operation suspended.")
        return False
    
    try:
        with open(license_file, "r") as f:
            encoded = f.read().strip()
        
        obfuscated = base64.b64decode(encoded)
        key = b"antigravity-secure-key-2026"
        deobfuscated = bytes([obfuscated[i] ^ key[i % len(key)] for i in range(len(obfuscated))])
        
        expiry_ts = int(deobfuscated.decode())
        if time.time() > expiry_ts:
            expiry_date = datetime.fromtimestamp(expiry_ts).strftime('%Y-%m-%d')
            logger.error(f"CRITICAL: License EXPIRED on {expiry_date}. Please apply a new patch.")
            return False
            
        logger.info(f"License verified. System active.")
        return True
    except Exception as e:
        logger.error(f"CRITICAL: License integrity check FAILED: {e}")
        return False

def download_model(url: str, dest_path: Path):
    """Download a file with a progress bar."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    
    if dest_path.exists():
        logger.info(f"Model already exists at {dest_path}")
        return

    logger.info(f"Downloading model from {url} to {dest_path}...")
    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()
        total_size = int(response.headers.get('content-length', 0))
        
        with open(dest_path, 'wb') as file, tqdm(
            desc=dest_path.name,
            total=total_size,
            unit='iB',
            unit_scale=True,
            unit_divisor=1024,
        ) as bar:
            for data in response.iter_content(chunk_size=1024):
                size = file.write(data)
                bar.update(size)
        logger.info("Download completed successfully.")
    except Exception as e:
        logger.error(f"Failed to download model: {e}")
        if dest_path.exists():
            dest_path.unlink() # Cleanup partial download
        raise

def init_roop():
    """Initialize roop globals and pre-load the face swapper model."""
    roop.globals.execution_providers = ["CPUExecutionProvider"] # Default to CPU
    
    # Try to find FFmpeg in common paths for roop's internal checks if not in PATH
    possible_ffmpeg = [
        r"C:\Users\DELL\AppData\Local\CapCut\Apps\6.4.0.2530",
        r"C:\ffmpeg\bin",
    ]
    for p in possible_ffmpeg:
        if Path(p).exists():
            os.environ["PATH"] = f"{p};{os.environ.get('PATH', '')}"
            logger.info("Found FFmpeg candidate at: %s", p)
            break

    # Check if we should use CUDA
    try:
        import onnxruntime
        available_providers = onnxruntime.get_available_providers()
        if "CUDAExecutionProvider" in available_providers:
            roop.globals.execution_providers = ["CUDAExecutionProvider"]
            logger.info("Using CUDA for face swapping!")
        else:
            logger.info("Using CPU for face swapping. Available providers: %s", available_providers)
    except Exception:
        logger.warning("Failed to check for CUDA, falling back to CPU.")

    # Pre-load the models
    roop.processors.frame.face_swapper.get_face_swapper()
    logger.info("Face swapper model loaded.")
    roop.processors.frame.face_enhancer.get_face_enhancer()
    logger.info("Face enhancer model loaded.")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Local FaceSwap API",
    description="Perform AI face swapping locally using Roop + InsightFace",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files from the /web directory
app.mount("/web", StaticFiles(directory=str(BASE_DIR / "web")), name="web")

@app.on_event("startup")
async def startup_event():
    # 0. License check
    if not check_license():
        logger.error("Shutting down due to license failure.")
        os._exit(1)

    # 1. Ensure model is present
    model_url = "https://huggingface.co/deepinsight/inswapper/resolve/main/inswapper_128.onnx"
    try:
        download_model(model_url, MODEL_PATH)
    except Exception as e:
        logger.error(f"Critical error during startup: could not ensure model presence. {e}")
        # We continue, but roop will likely fail later if model is missing
    
    # 2. Ensure face enhancer model is present
    try:
        roop.processors.frame.face_enhancer.pre_check()
    except Exception as e:
        logger.error(f"Error ensuring face enhancer model presence: {e}")

    init_roop()

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/", tags=["health"])
def health():
    """Simple health check."""
    return {
        "status": "running",
        "model_found": MODEL_PATH.exists(),
        "live_source_ready": CURRENT_SOURCE_FACE is not None,
    }

# ---------------------------------------------------------------------------
# Set Source Face for Live Swap
# ---------------------------------------------------------------------------
@app.post("/set-source", tags=["faceswap"])
async def set_source(source_face: UploadFile = File(...)):
    """Upload and detect the source face to be used for live swapping."""
    global CURRENT_SOURCE_FACE
    
    try:
        contents = await source_face.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        face = get_one_face(img)
        if face:
            CURRENT_SOURCE_FACE = face
            logger.info("New source face registered for live swap.")
            return {"status": "success", "message": "Source face registered."}
        else:
            raise HTTPException(status_code=400, detail="No face detected in the source image.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting source face: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/set-face-index", tags=["faceswap"])
async def set_face_index(index: int):
    """Set which face index to swap. -1 for all faces."""
    global CURRENT_FACE_INDEX
    CURRENT_FACE_INDEX = index
    logger.info(f"Target face index set to: {index}")
    return {"status": "success", "index": index}

@app.post("/set-vcam", tags=["faceswap"])
async def set_vcam(enabled: bool):
    """Enable or disable the Virtual Camera output."""
    global USE_VCAM, VCAM_INSTANCE
    USE_VCAM = enabled
    if not enabled and VCAM_INSTANCE:
        with VCAM_LOCK:
            VCAM_INSTANCE.close()
            VCAM_INSTANCE = None
    logger.info(f"Virtual Camera Output set to: {enabled}")
    return {"status": "success", "enabled": enabled}

# ---------------------------------------------------------------------------
# WebSocket Live Swap
# ---------------------------------------------------------------------------
@app.websocket("/live-swap")
async def websocket_endpoint(websocket: WebSocket):
    global FRAME_COUNT, USE_VCAM
    await websocket.accept()
    logger.info("WebSocket connection established.")
    
    # Session stats and logic flags
    session_frames_received = 0
    session_frames_processed = 0
    vcam_init_attempted = False
    
    # This prevents the event loop from being Starved by CPU-heavy roop calls
    # We will process one frame at a time per connection; new frames arriving 
    # while the thread is busy will be dropped.
    processing_lock = asyncio.Lock()

    async def process_frame(img_data: bytes, rx_index: int):
        nonlocal session_frames_processed, vcam_init_attempted
        global FRAME_COUNT, USE_VCAM
        
        # 1. Decode
        start_decode = time.time()
        nparr = np.frombuffer(img_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None or frame.shape[0] == 0 or frame.shape[1] == 0:
            return None

        # 2. Black frame check
        mean_val = np.mean(frame)
        if mean_val < 0.5:
            if rx_index % 100 == 1:
                logger.warning(f"Received nearly black frame (mean={mean_val:.2f})")
            # We used to return None here, but that deadlocks the client waiting for a response.
            # We'll let it fall through to the swapping logic; if no face is found, it just returns the black frame.
        
        # 3. Heavy Swapping (In Thread)
        def run_swap():
            roop.globals.many_faces = True 
            f = frame.copy()
            target_faces = roop.processors.frame.face_swapper.get_many_faces(f)
            if target_faces:
                for idx, target_face in enumerate(target_faces):
                    if CURRENT_FACE_INDEX == -1 or CURRENT_FACE_INDEX == idx:
                        f = roop.processors.frame.face_swapper.swap_face(
                            CURRENT_SOURCE_FACE, 
                            target_face, 
                            f
                        )
            return f

        start_swap = time.time()
        swapped_frame = await asyncio.to_thread(run_swap)
        swap_time = (time.time() - start_swap) * 1000
        total_time = (time.time() - start_decode) * 1000

        # 4. Global progress / debug
        FRAME_COUNT += 1
        if FRAME_COUNT % 50 == 0:
            debug_path = BASE_DIR / "debug_live.jpg"
            cv2.imwrite(str(debug_path), swapped_frame)
            logger.info(f"Saved global debug frame {FRAME_COUNT} to {debug_path}")

        # 5. Virtual Camera (Async friendly - no sleep)
        if USE_VCAM:
            await handle_vcam(swapped_frame)

        # 6. Encode
        start_enc = time.time()
        _, buffer = cv2.imencode('.jpg', swapped_frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
        enc_time = (time.time() - start_enc) * 1000
        
        session_frames_processed += 1
        
        if session_frames_processed % 50 == 0:
            logger.info(f"Frame {session_frames_processed}: Total processing time: {total_time:.1f}ms (Swap: {swap_time:.1f}ms, Enc: {enc_time:.1f}ms)")
            
        return base64.b64encode(buffer).decode('utf-8')

    async def handle_vcam(frame):
        nonlocal vcam_init_attempted
        global USE_VCAM
        try:
            global VCAM_INSTANCE
            with VCAM_LOCK:
                if VCAM_INSTANCE is None and not vcam_init_attempted:
                    import pyvirtualcam
                    h, w = frame.shape[:2]
                    try:
                        VCAM_INSTANCE = pyvirtualcam.Camera(width=w, height=h, fps=20, fmt=pyvirtualcam.PixelFormat.BGR)
                        logger.info(f"Virtual Camera initialized: {w}x{h}")
                    except Exception as e:
                        logger.error(f"VCam Init Error: {e}")
                        USE_VCAM = False
                    vcam_init_attempted = True
                
                if VCAM_INSTANCE:
                    if frame.shape[1] != VCAM_INSTANCE.width or frame.shape[0] != VCAM_INSTANCE.height:
                        frame = cv2.resize(frame, (VCAM_INSTANCE.width, VCAM_INSTANCE.height))
                    VCAM_INSTANCE.send(frame)
                    # No sleep here; it blocks the event loop!
        except Exception:
            pass

    try:
        while True:
            data = await websocket.receive_text()
            session_frames_received += 1
            
            if CURRENT_SOURCE_FACE is None:
                if session_frames_received % 50 == 1:
                    logger.warning("Live swap requested but CURRENT_SOURCE_FACE is None")
                await websocket.send_text("ERROR: No source face set.")
                continue

            # Frame Dropping: If we are already processing a frame, drop this one
            if processing_lock.locked():
                continue

            async with processing_lock:
                try:
                    if "," in data:
                        _, encoded = data.split(",", 1)
                    else:
                        encoded = data
                    
                    raw_bytes = base64.b64decode(encoded)
                    encoded_result = await process_frame(raw_bytes, session_frames_received)
                    
                    if encoded_result:
                        await websocket.send_text(f"data:image/jpeg;base64,{encoded_result}")
                except Exception as e:
                    logger.error(f"Frame processing error: {e}")

    except WebSocketDisconnect:
        logger.info(f"WS Disconnected. Rx: {session_frames_received}, Proc: {session_frames_processed}")
    except Exception as e:
        logger.error(f"WS Error: {e}")
                
    except WebSocketDisconnect:
        logger.info(f"WebSocket closed. Session summary: Rx {session_frames_received}, Processed {session_frames_processed}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        logger.info(f"WebSocket closed. Session summary: Rx {session_frames_received}, Processed {session_frames_processed}")

# ---------------------------------------------------------------------------
# Original Face swap endpoint (Refactored to use library)
# ---------------------------------------------------------------------------
@app.post("/swap-face", tags=["faceswap"])
async def swap_face(
    source_face: UploadFile = File(...),
    target_image: UploadFile = File(...),
):
    """Refactored legacy endpoint using the library directly for speed."""
    try:
        # Load source
        source_bytes = await source_face.read()
        source_img = cv2.imdecode(np.frombuffer(source_bytes, np.uint8), cv2.IMREAD_COLOR)
        source_face_obj = get_one_face(source_img)
        
        if not source_face_obj:
            raise HTTPException(status_code=400, detail="No face detected in source image.")
            
        # Load target
        target_bytes = await target_image.read()
        target_img = cv2.imdecode(np.frombuffer(target_bytes, np.uint8), cv2.IMREAD_COLOR)
        
        # Process
        roop.globals.many_faces = True
        target_faces = roop.processors.frame.face_swapper.get_many_faces(target_img)
        
        if target_faces:
            for target_face in target_faces:
                target_img = roop.processors.frame.face_swapper.swap_face(
                    source_face_obj,
                    target_face,
                    target_img
                )
                target_img = roop.processors.frame.face_enhancer.enhance_face(
                    target_face,
                    target_img
                )
        
        # Save to temp and return
        job_id = uuid.uuid4().hex
        output_path = TMP_DIR / f"{job_id}_out.png"
        cv2.imwrite(str(output_path), target_img)
        
        return FileResponse(
            path=str(output_path),
            media_type="image/png",
            filename="swapped.png",
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in swap_face")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)
