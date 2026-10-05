# Virtual Camera Setup Guide (Zoom, Discord, OBS)

The FaceSwap application has a built-in **Virtual Camera** toggle. This allows you to output the live swapped face directly to other applications like Zoom, Discord, Google Meet, or OBS Studio as if it were a physical webcam.

Since you are running the server on your PC and controlling the camera from your phone, this feature will output the swapped video feed **to your PC's Virtual Camera**.

### Requirements

To make the Virtual Camera feature work on Windows, you need a virtual camera driver installed. The easiest way is to use **OBS Studio**.

1. **Download OBS Studio**:
   - Go to [obsproject.com](https://obsproject.com/) and download the Windows version.
   - Install it using the default settings.

2. **Verify OBS Virtual Camera is Installed**:
   - Open OBS Studio.
   - You should see a "Start Virtual Camera" button in the Controls panel. You do not actually need to click it because our script will automatically use its background driver, but its presence confirms the driver is installed.

### How to Use

1. **Start the FaceSwap Server**:
   - Run your `python server.py` as usual.

2. **Connect via Phone**:
   - Open the web UI on your phone.
   - Upload your source face.
   - Toggle **"Output to Virtual Camera (PC)"** to ON.
   - Tap **"Start Swap"**.

3. **Select the Camera in Zoom / Discord / Meet**:
   - On your PC, open your video conferencing app (e.g., Zoom).
   - Go to the Video/Camera settings.
   - Select **"OBS Virtual Camera"** as your camera in the dropdown list.
   - You should now see the live swapped feed coming straight from your phone's camera!

> [!TIP]
> **Resolution Note**: The stream will operate at the resolution established by your phone's capture settings. If it looks tiny or skewed in Zoom, make sure Zoom's "Original Ratio" or "HD" toggle is enabled.
