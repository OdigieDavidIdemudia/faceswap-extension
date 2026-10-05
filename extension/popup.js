let API_BASE = "http://192.168.0.188:8000";
let WS_BASE  = "ws://192.168.0.188:8000";

// ── DOM refs ────────────────────────────────────────────────────────────────
const serverStatus  = document.getElementById("server-status");
const sourceInput   = document.getElementById("source-input");
const targetInput   = document.getElementById("target-input");
const sourceDrop    = document.getElementById("source-drop");
const targetDrop    = document.getElementById("target-drop");
const sourceInner   = document.getElementById("source-inner");
const targetInner   = document.getElementById("target-inner");
const sourcePreview = document.getElementById("source-preview");
const targetPreview = document.getElementById("target-preview");
const swapBtn       = document.getElementById("swap-btn");
const btnLabel      = document.getElementById("btn-label");
const progressWrap  = document.getElementById("progress-wrap");
const progressBar   = document.getElementById("progress-bar");
const progressText  = document.getElementById("progress-text");
const resultSection = document.getElementById("result-section");
const resultImg     = document.getElementById("result-img");
const downloadBtn   = document.getElementById("download-btn");
const errorToast    = document.getElementById("error-toast");
const errorMsg      = document.getElementById("error-msg");

// New Mode & Camera Refs
const modeFileBtn    = document.getElementById("mode-file");
const modeCameraBtn  = document.getElementById("mode-camera");
const targetCard     = document.getElementById("target-card");
const cameraCard     = document.getElementById("camera-card");
const cameraVideo    = document.getElementById("camera-video");
const cameraCanvas   = document.getElementById("camera-canvas");
const cameraOverlay  = document.getElementById("camera-overlay");
const stopCameraBtn  = document.getElementById("stop-camera-btn");
const faceIndexInput = document.getElementById("face-index-input");
const vcamToggle     = document.getElementById("vcam-toggle");
const apiUrlInput    = document.getElementById("api-url-input");
const saveUrlBtn      = document.getElementById("save-url-btn");

let sourceFile    = null;
let targetFile    = null;
let resultBlobUrl = null;
let currentMode   = "file"; // "file" or "camera"
let isStreaming   = false;
let socket        = null;
let stream        = null;
let captureCanvas = document.createElement("canvas"); // Offscreen capture
let isWaitingForResponse = false;

// ── Mode Switching ──────────────────────────────────────────────────────────
modeFileBtn.addEventListener("click", () => setMode("file"));
modeCameraBtn.addEventListener("click", () => setMode("camera"));

function setMode(mode) {
  if (currentMode === mode) return;
  currentMode = mode;

  modeFileBtn.classList.toggle("active", mode === "file");
  modeCameraBtn.classList.toggle("active", mode === "camera");
  targetCard.classList.toggle("hidden", mode === "camera");
  cameraCard.classList.toggle("hidden", mode === "file");
  swapBtn.classList.toggle("hidden", mode === "camera");
  resultSection.classList.add("hidden");

  if (mode === "file") {
    stopCamera();
  }
}

// ── Camera Logic ────────────────────────────────────────────────────────────
cameraOverlay.addEventListener("click", startCamera);
stopCameraBtn.addEventListener("click", stopCamera);

async function startCamera() {
  if (!sourceFile) {
    showError("Please upload a source face (Step 1) first.");
    return;
  }

  try {
    // 1. Send source face to server for live swap registration
    setProgress(10, "Registering face on server...");
    await uploadSourceForLive(sourceFile);

    // 2. Access Camera
    setProgress(30, "Accessing camera...");
    stream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: 480, height: 360, frameRate: { ideal: 20 } } 
    });
    
    cameraVideo.srcObject = stream;
    try {
      await cameraVideo.play();
      console.log("[FaceSwap] cameraVideo.play() called successfully");
    } catch (e) {
      console.warn("[FaceSwap] cameraVideo.play() failed:", e);
    }
    
    // Wait for video to be ready with real dimensions (at most 3 seconds)
    await new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          console.warn("[FaceSwap] Video ready timeout – proceeding anyway. Dims:",
            cameraVideo.videoWidth, "x", cameraVideo.videoHeight);
          resolved = true;
          resolve();
        }
      }, 3000);

      const check = () => {
        // readyState 4 = HAVE_ENOUGH_DATA; dimensions must be non-zero
        if (cameraVideo.readyState >= 3 && cameraVideo.videoWidth > 0 && cameraVideo.videoHeight > 0) {
          if (!resolved) {
            console.log("[FaceSwap] Video ready:", cameraVideo.videoWidth, "x", cameraVideo.videoHeight);
            resolved = true;
            clearTimeout(timeout);
            resolve();
          }
        }
      };

      cameraVideo.onloadeddata = check;
      cameraVideo.oncanplay    = check;
      cameraVideo.onplaying    = check;
      // In case it's already ready
      check();
    });

    cameraOverlay.classList.add("hidden");
    stopCameraBtn.classList.remove("hidden");
    isStreaming = true;

    // Reset stats for this session
    framesSent = 0;
    framesReceived = 0;
    wsReconnectAttempts = 0;
    isWaitingForResponse = false;
    updateStats();

    // 3. Connect WebSocket
    connectWS();

    // 4. Start Capture Loop
    requestAnimationFrame(captureLoop);
    setProgress(100, "Camera Ready!");

  } catch (err) {
    showError("Camera error: " + err.message);
    console.error(err);
  }
}

function stopCamera() {
  isStreaming = false;
  wsReconnectAttempts = 0;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  if (socket) {
    socket.onclose = null; // Prevent reconnect on deliberate close
    socket.close();
    socket = null;
  }
  cameraOverlay.classList.remove("hidden");
  stopCameraBtn.classList.add("hidden");
}

async function uploadSourceForLive(file) {
  const formData = new FormData();
  formData.append("source_face", file);
  
  const res = await fetch(`${API_BASE}/set-source`, {
    method: "POST",
    body: formData
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || "Failed to set source face on server.");
  }
}

let wsReconnectAttempts = 0;

function connectWS() {
  // Close any existing socket to ensure only ONE connection is alive at a time
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    socket.onclose = null; // Prevent reconnect loop from old socket
    socket.close();
    socket = null;
  }

  if (!isStreaming) return; // Guard: don't reconnect if camera was stopped

  socket = new WebSocket(`${WS_BASE}/live-swap`);

  socket.onopen = () => {
    console.log("[FaceSwap] WebSocket connected.");
    wsReconnectAttempts = 0;
  };

  socket.onmessage = (event) => {
    const data = event.data;
    if (data.startsWith("ERROR:")) {
      showError(data);
      stopCamera();
    } else {
      // Draw swapped frame to canvas
      const img = new Image();
      img.onload = () => {
        const ctx = cameraCanvas.getContext("2d");
        cameraCanvas.width = img.width;
        cameraCanvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        framesReceived++;
        isWaitingForResponse = false; // RE-ENABLE SENDING
        updateStats();
      };
      img.onerror = (e) => {
        console.error("[FaceSwap] Failed to load frame image:", e);
      };
      img.src = data;
    }
  };

  socket.onclose = (event) => {
    if (!isStreaming) return; // Camera was deliberately stopped
    wsReconnectAttempts++;
    // Exponential backoff: 1s, 2s, 4s, max 8s
    const delay = Math.min(1000 * Math.pow(2, wsReconnectAttempts - 1), 8000);
    console.log(`[FaceSwap] WS closed (attempt ${wsReconnectAttempts}), reconnecting in ${delay}ms…`);
    setTimeout(connectWS, delay);
  };

  socket.onerror = (err) => {
    console.error("[FaceSwap] WebSocket error:", err);
  };
}

function updateStats() {
  const statsEl = document.getElementById("camera-stats");
  if (statsEl) {
    statsEl.textContent = `Live: Tx ${framesSent} | Rx ${framesReceived}`;
  }
}

let lastFrameTime = 0;
const FRAME_INTERVAL = 100; // ms between frames (10 FPS limit)
let framesSent = 0;
let framesReceived = 0;

function captureLoop(time) {
  if (!isStreaming) return;

  // Synchronization: Don't send a new frame until the previous one is received
  if (isWaitingForResponse) {
    requestAnimationFrame(captureLoop);
    return;
  }

  if (socket && socket.readyState === WebSocket.OPEN) {
    if (cameraVideo.readyState >= 3 && cameraVideo.videoWidth > 0 && cameraVideo.videoHeight > 0) {
      const ctx = captureCanvas.getContext("2d");
      
      // OPTIMIZATION: Fixed capture size for consistency
      const TARGET_W = 400;
      const TARGET_H = Math.round((cameraVideo.videoHeight / cameraVideo.videoWidth) * TARGET_W);
      
      captureCanvas.width = TARGET_W;
      captureCanvas.height = TARGET_H;
      ctx.drawImage(cameraVideo, 0, 0, TARGET_W, TARGET_H);
      
      const pixelData = ctx.getImageData(0, 0, 10, 10).data;
      const avgBrightness = (pixelData[0] + pixelData[1] + pixelData[2]) / 3;
      if (avgBrightness < 5) {
        requestAnimationFrame(captureLoop);
        return;
      }

      // Send as JPEG with balanced quality
      const base64 = captureCanvas.toDataURL("image/jpeg", 0.5);
      
      isWaitingForResponse = true; // LOCK
      socket.send(base64);

      // Safety timeout: if server doesn't respond in 2s, allow next frame anyway
      setTimeout(() => { isWaitingForResponse = false; }, 2000);
      
      framesSent++;
      if (framesSent % 20 === 0) {
        console.log(`[FaceSwap] Stats: Tx ${framesSent}, Rx ${framesReceived}`);
      }
    }
  }

  requestAnimationFrame(captureLoop);
}

// ── Server health check ─────────────────────────────────────────────────────
async function checkServer() {
  serverStatus.className = "status-dot status-checking";
  serverStatus.title = "Checking server…";
  try {
    const res = await fetch(`${API_BASE}/`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      serverStatus.className = "status-dot status-online";
      serverStatus.title = data.model_found
        ? "Server online – model ready ✓"
        : "Server online, but model not found";
    } else {
      setOffline();
    }
  } catch {
    setOffline();
  }
}

function setOffline() {
  serverStatus.className = "status-dot status-offline";
  serverStatus.title = "Server offline – start uvicorn first";
}

// ── Preview helper ──────────────────────────────────────────────────────────
function loadPreview(file, previewEl, innerEl) {
  const url = URL.createObjectURL(file);
  previewEl.src = url;
  previewEl.classList.remove("hidden");
  innerEl.classList.add("hidden");
}

function updateSwapBtn() {
  swapBtn.disabled = !(sourceFile && targetFile);
}

// ── File input listeners ────────────────────────────────────────────────────
sourceInput.addEventListener("change", () => {
  if (sourceInput.files[0]) {
    sourceFile = sourceInput.files[0];
    loadPreview(sourceFile, sourcePreview, sourceInner);
    updateSwapBtn();
    // If we're already in camera mode, update the source on server
    if (isStreaming) uploadSourceForLive(sourceFile).catch(err => showError(err.message));
  }
});

targetInput.addEventListener("change", () => {
  if (targetInput.files[0]) {
    targetFile = targetInput.files[0];
    loadPreview(targetFile, targetPreview, targetInner);
    updateSwapBtn();
  }
});

// Face Index change
faceIndexInput.addEventListener("change", async () => {
  const index = parseInt(faceIndexInput.value);
  try {
    await fetch(`${API_BASE}/set-face-index?index=${index}`, { method: "POST" });
    console.log(`[FaceSwap] Target face index updated to ${index}`);
  } catch (err) {
    showError("Failed to update face index on server.");
  }
});

// Virtual Cam toggle
vcamToggle.addEventListener("change", async () => {
  const enabled = vcamToggle.checked;
  try {
    await fetch(`${API_BASE}/set-vcam?enabled=${enabled}`, { method: "POST" });
    console.log(`[FaceSwap] Virtual Camera ${enabled ? "enabled" : "disabled"}`);
  } catch (err) {
    showError("Failed to update Virtual Camera status on server.");
    vcamToggle.checked = !enabled; // Revert
  }
});

// ── Drag & Drop ─────────────────────────────────────────────────────────────
function setupDragDrop(dropZone, onFile) {
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) onFile(file);
  });
}

setupDragDrop(sourceDrop, (file) => {
  sourceFile = file;
  loadPreview(file, sourcePreview, sourceInner);
  updateSwapBtn();
  if (isStreaming) uploadSourceForLive(sourceFile).catch(err => showError(err.message));
});

setupDragDrop(targetDrop, (file) => {
  targetFile = file;
  loadPreview(file, targetPreview, targetInner);
  updateSwapBtn();
});

// ── UI helpers ──────────────────────────────────────────────────────────────
function showError(msg) {
  errorMsg.textContent = msg;
  errorToast.classList.remove("hidden");
  setTimeout(() => errorToast.classList.add("hidden"), 6000);
}

function setProgress(pct, text) {
  progressBar.style.width = `${pct}%`;
  if (text) progressText.textContent = text;
}

function setBusy(busy) {
  swapBtn.disabled = busy;
  btnLabel.textContent = busy ? "Processing…" : "Swap Face";
  if (busy) {
    progressWrap.classList.remove("hidden");
    resultSection.classList.add("hidden");
    errorToast.classList.add("hidden");
    setProgress(10, "Uploading images…");
  } else {
    progressWrap.classList.add("hidden");
    swapBtn.disabled = !(sourceFile && targetFile);
    btnLabel.textContent = "Swap Face";
  }
}

// ── Fake progress ticker ────────────────────────────────────────────────────
let progressInterval = null;
function startProgressTicker() {
  let pct = 15;
  progressInterval = setInterval(() => {
    if (pct < 85) {
      pct += Math.random() * 6;
      const messages = [
        "Detecting faces…",
        "Extracting facial features…",
        "Running InsightFace…",
        "Swapping face mesh…",
        "Blending result…",
      ];
      setProgress(pct, messages[Math.floor((pct - 15) / 15)] || "Processing…");
    }
  }, 700);
}
function stopProgressTicker() {
  clearInterval(progressInterval);
  progressInterval = null;
}

// ── Swap API call ───────────────────────────────────────────────────────────
swapBtn.addEventListener("click", async () => {
  if (!sourceFile || !targetFile) return;

  // Revoke previous result blob
  if (resultBlobUrl) { URL.revokeObjectURL(resultBlobUrl); resultBlobUrl = null; }

  setBusy(true);
  startProgressTicker();

  try {
    const formData = new FormData();
    formData.append("source_face", sourceFile, sourceFile.name);
    formData.append("target_image", targetFile, targetFile.name);

    const response = await fetch(`${API_BASE}/swap-face`, {
      method: "POST",
      body: formData,
    });

    stopProgressTicker();

    if (!response.ok) {
      let detail = `Server error ${response.status}`;
      try {
        const json = await response.json();
        detail = json.detail || detail;
      } catch { /* ignore */ }
      throw new Error(detail);
    }

    setProgress(95, "Finalising…");

    const blob = await response.blob();
    resultBlobUrl = URL.createObjectURL(blob);
    resultImg.src = resultBlobUrl;

    setProgress(100, "Done!");
    setTimeout(() => {
      setBusy(false);
      resultSection.classList.remove("hidden");
      resultSection.scrollIntoView({ behavior: "smooth" });
    }, 400);

  } catch (err) {
    stopProgressTicker();
    setBusy(false);

    const msg = err.message.includes("Failed to fetch")
      ? "Cannot reach server. Is it running? (uvicorn server:app --port 8000)"
      : err.message;

    showError(msg);
    console.error("[FaceSwap]", err);
  }
});

// ── Download result ─────────────────────────────────────────────────────────
downloadBtn.addEventListener("click", () => {
  if (!resultBlobUrl) return;
  const a = document.createElement("a");
  a.href = resultBlobUrl;
  a.download = `faceswap_result_${Date.now()}.png`;
  a.click();
});

// ── URL Persistance ─────────────────────────────────────────────────────────
async function initUrl() {
  const data = await chrome.storage.local.get(["apiUrl"]);
  if (data.apiUrl) {
    API_BASE = data.apiUrl.replace(/\/$/, "");
    WS_BASE = API_BASE.replace("http", "ws");
  }
  apiUrlInput.value = API_BASE;
  checkServer();
}

saveUrlBtn.addEventListener("click", () => {
  const newUrl = apiUrlInput.value.trim().replace(/\/$/, "");
  if (!newUrl) return;
  chrome.storage.local.set({ apiUrl: newUrl }, () => {
    API_BASE = newUrl;
    WS_BASE = newUrl.replace("http", "ws");
    showError("URL Saved! Re-checking server...");
    checkServer();
  });
});

// ── Init ────────────────────────────────────────────────────────────────────
initUrl();
// Re-check every 15 s while popup is open
setInterval(checkServer, 15_000);
