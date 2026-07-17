# POD Pulse User Guide

POD Pulse is a proof-of-delivery app for drivers. It lets you capture signed delivery documents with the phone camera, add invoice details and notes, save multiple scans as a single PDF, and keep records safely offline until you are ready to sync.

## Quick Start
1. Install Node.js 18 or later.
2. Open a terminal in the project folder.
3. Run `node server.js`.
4. Open `http://localhost:3000` in your browser.
5. Open `http://localhost:3000/admin.html` if you need to manage drivers.

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
2. Enter the admin key.
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

## Troubleshooting
If the app does not work as expected:

1. Check that the camera has permission to run.
2. Make sure the driver has been locked to the device.
3. Confirm the invoice field contains digits only.
4. Make sure at least one scan has been captured before saving.
5. If sync does not work, check whether the device is online.

## Current Status
This project currently runs from local JSON and browser storage, while the later Supabase and OneDrive migration remains documented as a future step.
