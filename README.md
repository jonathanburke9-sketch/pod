# POD Pulse User Guide

POD Pulse is a proof-of-delivery app for drivers. It lets you capture signed delivery documents with the phone camera, add invoice details and notes, save multiple scans as a single PDF, and keep records safely offline until you are ready to sync.

## Installation
1. Install Node.js 18 or later.
2. Open a terminal in the project folder.
3. Run `npm install`.
4. Confirm the app starts with `npm test` if you want to check the current code first.

## Run Locally
1. Start the app with `npm start`.
2. Open `http://localhost:3000` in your browser.
3. Open `http://localhost:3000/admin.html` if you need to manage drivers.

## Deployment
This project currently deploys as a simple Node app.

### Local or Server Deployment Steps
1. Copy the repository to the machine that will host the app.
2. Install Node.js 18 or later on that machine.
3. Run `npm install`.
4. Set any required environment variables, such as `PORT` or `ADMIN_KEY`, if you want to override defaults.
5. Start the server with `npm start`.
6. Point your browser or reverse proxy to the running host and port.

### Deployment Notes
- Default port: `3000`
- Main server entry point: `server.js`
- Production data files live in `data/`
- The app serves the driver UI from `public/`

## Device Deployment
Use these steps when you want to put the app onto driver devices such as phones or tablets.

### Before You Roll Out
1. Host the app on a machine or server that drivers can reach over the network.
2. Use a stable URL that stays the same for all devices.
3. Make sure the site is available over HTTPS in production.
4. Confirm the server is running and the driver list loads correctly.
5. Decide whether the admin page will be available only to supervisors.

### Install on Each Device
1. Open the app URL in the device browser.
2. Allow camera access when prompted.
3. If the browser offers it, install the app to the home screen.
4. Open the installed app from the home screen icon.
5. Link the device to the correct driver the first time it is used.

### Device Setup Checklist
1. Confirm the device has a working camera.
2. Confirm the device has enough storage for queued PDFs.
3. Confirm the date and time are correct on the device.
4. Test one capture before going live.
5. Test offline mode by turning off Wi-Fi or mobile data briefly.
6. Confirm the queue count updates after saving.

### Recommended Rollout Order
1. Set up the server.
2. Verify the driver list and admin page.
3. Install the app on one test device.
4. Bind the device to a driver.
5. Capture and save one sample POD.
6. Sync the queue.
7. Repeat for the remaining devices.

### Device Use Notes
- The device stays linked to the first driver chosen on that device.
- Users should enter invoice numbers as digits only.
- The app adds the `INV-` prefix automatically.
- Users can add notes and multiple scans before saving.

## What You Can Do
- Capture one or more invoice scans.
- Save each submission as a PDF.
- Enter invoice numbers using digits only. The app adds `INV-` automatically.
- Add optional notes to a submission.
- Choose a payment method.
- Work offline and sync later.
- Lock the app to a specific driver on a device.

## Driver Setup
When the app first opens, it asks you to link the device to a driver.

1. Select your name from the driver list.
2. Click the button to lock the driver to the device.
3. After the device is linked, the driver cannot be changed from the app.

If the driver is already linked, the app shows the linked name at the top of the screen.

## Taking a Proof of Delivery
1. Point the camera at the invoice.
2. Click Capture scan.
3. Repeat for more pages if needed.
4. Use Remove last scan or Clear scans if you need to correct something.
5. Enter the invoice number digits only.
6. Add notes if needed.
7. Choose the payment method.
8. Save the submission to the offline queue.

The app applies an edge-detection style scan effect and stores the final submission as one PDF made from all captured scans.

## Invoice Number Format
- Type digits only in the invoice field.
- The app automatically saves it as `INV-` plus the digits you entered.
- There is no fixed digit count, so any number of digits is accepted.

Example:
- You type `1042`
- The app saves `INV-1042`

## Notes
Use the Notes field for any extra delivery details, such as damaged packaging, customer comments, or special handoff instructions. Notes are saved with the queued submission.

## Offline Queue
POD Pulse keeps your queued submissions on the device so you can continue working without a connection.

- Queue records are stored in IndexedDB.
- Older queue data from `localStorage` is migrated automatically.
- The queue count at the top of the app shows how many submissions are waiting.
- When the device is online, the app tries to sync queued items.

## Payment Methods
The app currently supports:
- EFT
- Cash
- S2S

## Driver Administration
Open the admin page if you need to manage driver names or folder mappings.

1. Go to `http://localhost:3000/admin.html`.
2. Enter the admin key if one is configured.
3. Add, remove, or edit drivers.
4. Save the driver list.

Each driver should have a matching folder name for the upload destination.

## Driver List
The current drivers are:
- Jonathan (Admin)
- Deon
- Themba
- Janine
- Wilna

## Folder Naming
If you are preparing OneDrive folders for later upload use, follow this pattern:

1. Create a root folder named `POD_Uploads`.
2. Create one subfolder for each driver.
3. Keep the folder name exactly the same as the driver mapping.
4. Avoid trailing spaces or duplicate names.

## Project Files
- `public/index.html` main driver app page
- `public/admin.html` driver admin page
- `public/css/styles.css` shared styling
- `public/js/app.js` driver app logic
- `public/js/admin.js` admin page logic
- `settings/app_settings.json` labels, button text, and validation settings
- `data/drivers.json` current driver data
- `data/submissions.json` queued submission metadata
- `server.js` local Node server

## Useful Commands
- `npm install` install dependencies
- `npm start` start the app locally
- `npm test` run the test suite

## Troubleshooting
If the app does not work as expected:

1. Check that the camera has permission to run.
2. Make sure the driver has been locked to the device.
3. Confirm the invoice field contains digits only.
4. Make sure at least one scan has been captured before saving.
5. If sync does not work, check whether the device is online.

## Current Status
This project currently runs from local JSON and browser storage, while the later Supabase and OneDrive migration remains documented as a future step.
