let API_BASE = window.location.protocol === 'file:' ? 'http://192.168.88.27:8000' : (window.location.origin === "null" ? "" : window.location.origin);
let WS_BASE  = API_BASE ? API_BASE.replace('http', 'ws') : `ws://${window.location.host}`;

// Load from localStorage if present
const savedUrl = localStorage.getItem('faceswap_api_url');
if (savedUrl) {
    API_BASE = savedUrl;
    WS_BASE = API_BASE.replace('http', 'ws');
}

const sourceInput = document.getElementById('source-input');
const sourcePreview = document.getElementById('source-preview');
const vcamToggle = document.getElementById('vcam-toggle');
const apiUrlInput = document.getElementById('api-url-input');
const saveUrlBtn = document.getElementById('save-url-btn');
const cameraVideo = document.getElementById('camera-video');
const cameraCanvas = document.getElementById('camera-canvas');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const statsEl = document.getElementById('camera-stats');

let stream = null;
let socket = null;
let isStreaming = false;
let isWaiting = false;
let captureCanvas = document.createElement('canvas');

sourceInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        sourcePreview.src = URL.createObjectURL(file);
        sourcePreview.classList.remove('hidden');
        uploadSource(file);
    }
};

async function uploadSource(file) {
    const formData = new FormData();
    formData.append('source_face', file);
    try {
        const res = await fetch(`${API_BASE}/set-source`, { method: 'POST', body: formData });
        if (res.ok) statsEl.textContent = "Source face set!";
    } catch (e) {
        alert("Server unreachable. Ensure it is running and accessible.");
    }
}

vcamToggle.onchange = async () => {
    const enabled = vcamToggle.checked;
    try {
        await fetch(`${API_BASE}/set-vcam?enabled=${enabled}`, { method: 'POST' });
    } catch (e) {
        alert("Failed to update Virtual Camera status on server.");
        vcamToggle.checked = !enabled;
    }
};

startBtn.onclick = async () => {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        cameraVideo.srcObject = stream;
        isStreaming = true;
        
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        cameraVideo.classList.remove('hidden');
        cameraCanvas.classList.add('hidden');

        connectWS();
        requestAnimationFrame(captureLoop);
    } catch (e) {
        alert("Camera access denied: " + e.message);
    }
};

stopBtn.onclick = () => {
    isStreaming = false;
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (socket) socket.close();
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
};

function connectWS() {
    socket = new WebSocket(`${WS_BASE}/live-swap`);
    socket.onmessage = (e) => {
        if (typeof e.data === 'string' && e.data.startsWith("ERROR:")) {
            alert(e.data);
            isStreaming = false;
            isWaiting = false;
            if (stream) stream.getTracks().forEach(t => t.stop());
            startBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');
            return;
        }
        
        const img = new Image();
        img.onload = () => {
            const ctx = cameraCanvas.getContext('2d');
            cameraCanvas.width = img.width;
            cameraCanvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            cameraCanvas.classList.remove('hidden');
            cameraVideo.classList.add('hidden');
            isWaiting = false;
        };
        img.src = e.data;
    };
}

function captureLoop() {
    if (!isStreaming) return;
    if (isWaiting || !socket || socket.readyState !== 1) {
        requestAnimationFrame(captureLoop);
        return;
    }

    if (cameraVideo.readyState >= 3) {
        const ctx = captureCanvas.getContext('2d');
        const w = 400;
        const h = (cameraVideo.videoHeight / cameraVideo.videoWidth) * w;
        captureCanvas.width = w;
        captureCanvas.height = h;
        ctx.drawImage(cameraVideo, 0, 0, w, h);

        const data = captureCanvas.toDataURL('image/jpeg', 0.5);
        socket.send(data);
        isWaiting = true;

        // Safety timeout: if server doesn't respond in 2s, allow next frame anyway
        setTimeout(() => { isWaiting = false; }, 2000);
    }
    requestAnimationFrame(captureLoop);
}

// ── Init ────────────────────────────────────────────────────────────────────
apiUrlInput.value = API_BASE;
saveUrlBtn.onclick = () => {
    const newUrl = apiUrlInput.value.trim().replace(/\/$/, "");
    if (!newUrl) return;
    localStorage.setItem('faceswap_api_url', newUrl);
    window.location.reload();
};
