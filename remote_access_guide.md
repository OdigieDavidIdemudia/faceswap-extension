# How to Access from Your Phone

Since the server is currently running on your PC's local network (`127.0.0.1`), your phone cannot see it yet. Here are the two ways to fix that:

### Option A: Local WiFi (Easiest for testing)
1.  **Your PC's Local IP**:
    -   I've identified your IP as `192.168.88.27`.
2.  **Files Updated**:
    -   I have already updated `web/app.js` and the extension to use this IP.
3.  **Open on Phone**:
    -   Host the web interface (Run `python server.py`).
    -   On your phone's browser, go to `http://192.168.88.27:8000/web/index.html`.

> [!WARNING]
> **Camera Access Fix (Important)**:
> Browsers block cameras on non-`localhost` addresses unless they use `https`. Since we are using an IP address, you must tell your phone to trust it:
> 1.  Open Chrome on your **phone**.
> 2.  Type `chrome://flags/#unsafely-treat-insecure-origin-as-secure` in the address bar.
> 3.  **Enable** the flag and add `http://192.168.88.27:8000` to the text box.
> 4.  Relaunch Chrome. The camera should now work!

### Option B: Remote Access (Best for external clients)
1.  **Install ngrok**: Download from `ngrok.com`.
2.  **Start the tunnel**:
    -   Run `ngrok http 8000`.
3.  **Use the URL**:
    -   ngrok will give you a public URL (e.g., `https://random-id.ngrok-free.app`).
    -   On your phone, open this URL. It will automatically route to your PC's FaceSwap server!

---

## Why the Web App is Better:
-   **No Extension Needed**: Works on any device with a browser (Phone, Tablet, Mac).
-   **Security**: You can host the web files yourself and only give access to paying clients.
-   **Accessibility**: The larger buttons and mobile-first design make it easier for people with limited mobility to interact with the system.
