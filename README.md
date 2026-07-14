# POD Pulse

A compact installable proof-of-delivery app for delivery drivers.

## What it does
- Lets a driver capture a photo of a signed invoice using the phone camera.
- Applies a simple edge-detection effect to sharpen the captured document.
- Stores the delivery as an offline-safe queue item with a driver-linked file name.
- Persists the selected driver on the installed device and stores per-driver folder mapping for downstream OneDrive sync.
- Supports adding and removing drivers from a simple backend JSON file.

## Run locally
1. Install Node.js 18+
2. Start the app:
   - `node server.js`
3. Open http://localhost:3000

## Notes
- The current backend uses local JSON storage for drivers and uploads so it can be tested immediately.
- Each submission is named using the pattern: invoice-number-date-time-driver-payment-method.
- The driver record includes a folder name ready for a OneDrive folder mapping integration.
