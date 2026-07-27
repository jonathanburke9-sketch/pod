# ScanHive Upload Routes Guide

This guide explains how uploads are routed for each function and how to configure the app for the three supported destination patterns:

1. Direct local filesystem mirror
2. Supabase plus worker mirror
3. Power Automate direct upload

## Function Folder Structure

Each function writes into its own subfolder under the staff member folder.

Current function mappings:

- `pod-sb` -> `POD-SB`
- `pod-just` -> `POD-Just`
- `receipt-sb` -> `Receipt-SB`
- `receipt-just` -> `Receipt-Just`

The effective relative path is:

```text
POD_Uploads/<staff-folder>/<function-folder>/<year>/<month>/<file>.pdf
```

Example paths:

```text
POD_Uploads/Deon/POD-SB/2026/07/PODSB_INV-1042_20260725-101530.pdf
POD_Uploads/Janine/Receipt-Just/2026/07/RECJUST_Food-Lovers-Market_20260725-102200.pdf
```

## Where Routing Happens

The routing inputs come from three places:

1. `settings/app_settings.json`
   This defines each function code, label, folder suffix, and filename prefix.

2. `server.js`
   This validates the selected function, resolves the staff folder, builds the final file metadata, and sends the upload to the active route.

3. `sync-onedrive.js`
   This rebuilds the same function-aware path when uploads are first stored in Supabase and mirrored later by the worker.

## Route 1: Filesystem Mirror

Use this when the Node server runs on the same Windows machine that has access to the synced OneDrive folder.

### Environment

```env
UPLOAD_MIRROR_MODE=filesystem
ONEDRIVE_ROOT=C:\Users\<your-user>\OneDrive
ONEDRIVE_POD_ROOT=POD_Uploads
```

### Flow

1. The browser saves the PDF to the offline queue.
2. `POST /api/upload` sends the queued item to the Node server.
3. `server.js` builds the function-aware path.
4. The server writes the PDF directly into the local OneDrive-synced folder.

### Best Use

- Local office PC
- Single Windows machine deployment
- No separate worker required

## Route 2: Supabase Plus Worker Mirror

Use this when the upload API should accept files now, but the actual OneDrive mirror should happen later.

### Environment

```env
UPLOAD_MIRROR_MODE=worker
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SYNC_TARGET_MODE=filesystem
ONEDRIVE_ROOT=C:\Users\<your-user>\OneDrive
ONEDRIVE_POD_ROOT=POD_Uploads
```

### Flow

1. The browser uploads the queued PDF to the server.
2. The server stores the submission row in Supabase.
3. The worker reads rows where `pod_pdf_url` is still empty.
4. `sync-onedrive.js` rebuilds the same function-specific folder path.
5. The worker writes the PDF into OneDrive and updates Supabase.

### Start the Worker

One-time pass:

```bash
npm run sync:onedrive
```

Watch mode:

```bash
npm run sync:onedrive:watch
```

### Best Use

- Vercel or hosted backend with no local disk access
- Office PC available later to mirror into OneDrive
- Safer retry behavior for intermittent OneDrive access

## Route 3: Power Automate Direct Upload

Use this when the backend should hand the PDF directly to a Power Automate HTTP flow.

### Environment

```env
UPLOAD_MIRROR_MODE=power-automate
POWER_AUTOMATE_URL=https://prod-00.westeurope.logic.azure.com:443/workflows/...
POWER_AUTOMATE_SHARED_SECRET=replace_with_shared_secret
POWER_AUTOMATE_TARGET_FOLDER=POD_Uploads
POWER_AUTOMATE_FIXED_FOLDER_ONLY=false
```

### Flow

1. The browser uploads the queued PDF to the server.
2. The server validates the function and staff folder.
3. The server builds the function-aware relative path.
4. The server posts PDF data and function metadata to Power Automate.
5. For receipt functions, the server also sends Excel-table row payload data.
6. The flow creates the folder path and file in OneDrive or SharePoint.

### Power Automate Payload Highlights

Fields always sent for all 4 functions:

- `functionCode`
- `functionLabel`
- `functionFolder`
- `driverId`, `driverName`, `folder`
- `invoiceNumber`
- `paymentMethod`
- `targetFolder`, `targetFileName`
- `createFolder`, `fixedFolderOnly`, `renameOnly`
- `timestamp`
- `filename`
- `relativePath`
- `pdfBase64`

Receipt-only Excel fields:

- `excel.enabled`: true for `receipt-sb` and `receipt-just`
- `excel.tableName`: `Receipt_SB` or `Receipt_Just`
- `excel.row`: row values for Excel insert

Expected receipt row keys:

- `vendorName`
- `paymentMethod` (Card or Cash)
- `totalAmount`
- `vatAmount`
- `category`
- `receiptType`
- `timestamp`
- `driverName`
- `driverId`

Flow tip:

- Branch on `excel.enabled`.
- If true, write `excel.row` to the `excel.tableName` table.
- If false, skip the Excel step.

### Important Setting

If you want separate folders per function, keep `POWER_AUTOMATE_FIXED_FOLDER_ONLY=false`.

If you set `POWER_AUTOMATE_FIXED_FOLDER_ONLY=true`, the backend sends a fixed folder plus file name only, and the flow must decide how to route files itself.

For full payload examples, see `docs/power-automate-contract.md`.

## Business OneDrive Graph Worker

The worker can also mirror into Microsoft 365 Business OneDrive through Graph instead of a local filesystem.

### Environment

```env
UPLOAD_MIRROR_MODE=worker
SYNC_TARGET_MODE=business-onedrive
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
MS_TENANT_ID=your_tenant_id
MS_CLIENT_ID=your_client_id
MS_CLIENT_SECRET=your_client_secret
ONEDRIVE_DRIVE_ID=your_drive_id
ONEDRIVE_POD_ROOT=POD_Uploads
```

### Flow

1. The server stores the submission in Supabase.
2. The worker reads pending rows.
3. The worker uploads the PDF buffer through Microsoft Graph.
4. The remote path still follows the same function-specific structure.

## Per-Function Setup Checklist

For each function you add later, update both:

1. `settings/app_settings.json`
   Add `code`, `label`, `folderSuffix`, and `filenamePrefix`.

2. `server.js` and `sync-onedrive.js`
   Add the same function code inside their `functionConfigs` maps.

If the function exists in settings but not in the backend maps, uploads will fall back to the default function config.

## Driver Folder Setup

Each staff member still needs a base folder mapping such as:

- `Jonathan-Admin`
- `Deon`
- `Themba`
- `Janine`
- `Wilna`

The final route is:

```text
<root>/<staff-folder>/<function-folder>/<year>/<month>/<file>.pdf
```

Examples on disk:

```text
C:\Users\ops\OneDrive\POD_Uploads\Deon\POD-SB\2026\07\PODSB_INV-1042_20260725-101530.pdf
C:\Users\ops\OneDrive\POD_Uploads\Janine\Receipt-Just\2026\07\RECJUST_Food-Lovers-Market_20260725-102200.pdf
```

## Troubleshooting

### Upload lands in the wrong folder

- Check the driver folder value in Admin.
- Check the function code in the capture URL.
- Check that `folderSuffix` is correct in settings and backend maps.

### Power Automate ignores function folders

- Set `POWER_AUTOMATE_FIXED_FOLDER_ONLY=false`.
- Make sure the flow uses the incoming `relativePath` or `path` field.

### Receipt uploads do not write to Excel

- Confirm your flow checks `excel.enabled` before the Excel action.
- Confirm table names exist exactly as `Receipt_SB` and `Receipt_Just`.
- Confirm `excel.row.category` matches a valid category value.

### Worker mirrors old rows into flat folders

- Restart the worker after deploying updated code.
- Confirm stored rows include `payload.functionCode`.

### Offline queue saves but upload never runs later

- Confirm the device returns online.
- Tap `Sync now`.
- Check `GET /api/health/storage`.
- Check worker logs if `UPLOAD_MIRROR_MODE=worker`.

## Recommended Defaults

For a local Windows office machine:

```env
UPLOAD_MIRROR_MODE=filesystem
ONEDRIVE_ROOT=C:\Users\<your-user>\OneDrive
ONEDRIVE_POD_ROOT=POD_Uploads
```

For Vercel plus delayed office mirroring:

```env
UPLOAD_MIRROR_MODE=worker
SYNC_TARGET_MODE=filesystem
```

For direct cloud handoff through Power Automate:

```env
UPLOAD_MIRROR_MODE=power-automate
POWER_AUTOMATE_FIXED_FOLDER_ONLY=false
```