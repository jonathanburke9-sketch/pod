# POD Pulse

A compact installable proof-of-delivery app for delivery drivers.

## What it does
- Lets a driver capture a photo of a signed invoice using the phone camera.
- Applies a simple edge-detection effect to sharpen the captured document.
- Stores the delivery as an offline-safe queue item with a driver-linked file name.
- Locks a selected driver to the device on first setup so the driver cannot be switched later from the app.
- Uses payment options: Cash, EFT, S2S.
- Supports admin-only driver updates from the backend API (not from the driver app UI).

## Folder structure
- `public/index.html` driver app page
- `public/admin.html` separate admin page for driver management
- `public/css/styles.css` shared UI styles
- `public/js/app.js` driver app logic
- `public/js/admin.js` admin page logic
- `settings/app_settings.json` central UI/theme/config settings
- `data/drivers.json` driver list and OneDrive folder mapping
- `data/submissions.json` queued uploads persisted by backend
- `server.js` Node server and API routes

## Run locally
1. Install Node.js 18+
2. Start the app:
   - `node server.js`
3. Open http://localhost:3000

## Notes
- The current backend uses local JSON storage for drivers and uploads so it can be tested immediately.
- Each submission is named using the pattern: invoice-number-date-time-driver-payment-method.
- The driver record includes a folder name ready for a OneDrive folder mapping integration.
- Set an admin key before backend driver changes: `set ADMIN_KEY=your-secret`.
- Update drivers through backend endpoint: `POST /api/admin/drivers` with header `x-admin-key`.

## UI settings
- Edit `settings/app_settings.json` to change:
- Titles, labels, button text, and payment options
- Theme tokens (button colors, form colors, text, panel and border colors)
- Admin page labels

## Admin page
- Open `/admin.html`.
- Enter admin key.
- Add, edit, or remove drivers and OneDrive folder names.
- Click Save Drivers to commit changes via `/api/admin/drivers`.
