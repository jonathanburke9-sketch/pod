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

## OneDrive folder setup
Use this setup so each driver has a dedicated OneDrive destination folder.

1. In OneDrive, create a root folder named `POD_Uploads`.
2. Create one subfolder per driver, for example:
   - `POD_Uploads/Ava`
   - `POD_Uploads/Jonathan`
   - `POD_Uploads/Maria`
3. In the admin page, set each driver's `OneDrive Folder` value to match the subfolder name exactly.
4. Keep a consistent naming rule:
   - Use plain names with no trailing spaces.
   - Avoid duplicate folder names.
5. Confirm the folder mapping by exporting driver data (or checking `data/drivers.json`) and verifying:
   - `name` = display name in app
   - `folder` = matching OneDrive subfolder name

### Recommended permissions
- Create a dedicated service account for app uploads.
- Share `POD_Uploads` with this account as `Can edit`.
- Keep drivers as `Can view` unless they must manage files.

### Important
- Current project stores the target folder name and upload records locally.
- Direct upload to OneDrive API is not wired yet.
- To enable real OneDrive upload, add a backend step that exchanges Microsoft OAuth token and uploads each file into `POD_Uploads/<driver-folder>/`.

## Deploying the page
Two common deployment options are below.

### Option A: Full app deployment (recommended)
Use this if you need driver/admin pages plus API endpoints.

1. Push this repo to GitHub.
2. Deploy to a Node host (Render, Railway, Azure App Service, Fly.io, or similar).
3. Configure environment variables:
   - `PORT` provided by host
   - `ADMIN_KEY` set to a strong secret
4. Start command:
   - `node server.js`
5. Verify after deploy:
   - `/index.html` loads driver app
   - `/admin.html` loads admin app
   - `/settings/app_settings.json` loads settings JSON
6. PWA check on mobile:
   - Open deployed URL in browser
   - Add to Home Screen
   - Confirm offline launch works

### Option B: Page-only static deployment
Use this only for UI demo (no backend save/admin API behavior).

1. Deploy `public/` to static hosting (GitHub Pages, Netlify static, Azure Static Web Apps).
2. Also publish `settings/app_settings.json` under `/settings/app_settings.json`.
3. Note: API calls (`/api/*`) will fail unless you add a backend.

## Production checklist
- Replace `data/*.json` local files with a real database/storage.
- Add HTTPS-only deployment.
- Add rate limiting for `/api/admin/drivers` and `/api/upload`.
- Add authentication for admin page route, not only API key header.
- Add OneDrive API integration and retry queue for failed uploads.
