# Power Automate Contract

This document defines the exact request and response contract expected by the backend when `UPLOAD_MIRROR_MODE=power-automate`.

## Endpoint

The backend sends an HTTP `POST` to the configured `POWER_AUTOMATE_URL`.

If `POWER_AUTOMATE_SHARED_SECRET` is set, the backend includes:

```text
x-shared-secret: <secret>
```

## Upload Request Payload

The Power Automate flow should accept this JSON body:

```json
{
  "functionCode": "receipt-sb",
  "functionLabel": "Receipt-SB",
  "functionFolder": "Receipt-SB",
  "driverId": "driver-002",
  "driverName": "Deon",
  "folder": "Deon",
  "invoiceNumber": "Vendor ABC",
  "paymentMethod": "Card",
  "notes": "",
  "timestamp": "2026-07-21T08:30:12.000Z",
  "filename": "RECSB-Vendor-ABC-2026.07.27-09.30-Deon-Card.pdf",
  "targetFolder": "POD_Uploads/Inbox",
  "targetFileName": "RECSB-Vendor-ABC-2026.07.27-09.30-Deon-Card.pdf",
  "createFolder": false,
  "fixedFolderOnly": true,
  "renameOnly": true,
  "relativePath": "POD_Uploads/Inbox/RECSB-Vendor-ABC-2026.07.27-09.30-Deon-Card.pdf",
  "suggestedFinalRelativePath": "POD_Uploads/Deon/Receipt-SB/2026/07/RECSB-Vendor-ABC-2026.07.27-09.30-Deon-Card.pdf",
  "inboxFolder": "POD_Uploads/Inbox",
  "year": "2026",
  "month": "07",
  "scanCount": 1,
  "qualityWarnings": [],
  "extraFields": {
    "totalAmount": "1200.50",
    "vatAmount": "180.08",
    "category": "Ingredients"
  },
  "excel": {
    "enabled": true,
    "tableName": "Receipt_SB",
    "row": {
      "vendorName": "Vendor ABC",
      "paymentMethod": "Card",
      "totalAmount": "1200.50",
      "vatAmount": "180.08",
      "category": "Ingredients",
      "receiptType": "Receipt-SB",
      "timestamp": "2026-07-21T08:30:12.000Z",
      "driverName": "Deon",
      "driverId": "driver-002"
    }
  },
  "pdfBase64": "JVBERi0xLjQK..."
}
```

## Function and Excel Fields

These fields are always included for all 4 functions:

- `functionCode`: one of `pod-sb`, `pod-just`, `receipt-sb`, `receipt-just`
- `functionLabel`: display label for the selected function
- `functionFolder`: folder suffix used for the function route
- `targetFolder`: destination root folder used by the flow
- `targetFileName`: final PDF file name
- `createFolder`, `fixedFolderOnly`, `renameOnly`: folder behavior flags
- `relativePath`: fixed Inbox path where the file should be created first
- `suggestedFinalRelativePath`: backend suggestion for the final function-based destination path
- `inboxFolder`: Inbox destination root used for initial file creation

Excel integration fields are included for receipt functions only:

- `excel.enabled`: `true` for `receipt-sb` and `receipt-just`, otherwise `false`
- `excel.tableName`: `Receipt_SB` or `Receipt_Just`
- `excel.row`: object containing values for the Excel table row

The expected receipt row fields are:

- `vendorName`
- `paymentMethod` (Card or Cash)
- `totalAmount`
- `vatAmount`
- `category`
- `receiptType`
- `timestamp`
- `driverName`
- `driverId`

## Receipt Example for Excel Flow

Use this branch condition in the flow before Excel actions:

- Process receipt row when `excel.enabled` is `true`
- Skip Excel action when `excel.enabled` is `false`

## Upload Semantics

The flow should:

1. Parse the JSON body.
2. Use `targetFolder` (recommended: `POD_Uploads/Inbox`) as a pre-existing fixed Inbox path.
3. Do **not** create new folders when `createFolder` is `false`.
4. Decode `pdfBase64` and create the file in Inbox using `targetFileName`.
5. Branch by `functionCode` for `POD-SB`, `POD-Just`, `Receipt-SB`, `Receipt-Just`.
6. For receipt functions (`excel.enabled=true`), write `excel.row` into `excel.tableName`.
7. Move the file from Inbox to the final path using `suggestedFinalRelativePath` (or your own mapping logic).
8. Return success details to the backend.

## Upload Success Response

Return HTTP `200` with JSON like this:

```json
{
  "ok": true,
  "path": "POD_Uploads/Deon/2026/07/INV-1042_20260721-083012.pdf",
  "webUrl": "https://tenant-my.sharepoint.com/:b:/g/personal/...",
  "fileId": "01ABCDEF..."
}
```

Recognized fields:

- `path`: preferred relative path stored by the backend
- `relativePath`: accepted alternative to `path`
- `webUrl`: optional OneDrive/SharePoint link
- `absoluteFilePath`: optional, mainly for local gateway/hybrid flows

Optional echo fields your flow can return:

- `excel`: object with write status, for example `{ "ok": true, "table": "Receipt_SB", "rowId": "42" }`

## Fixed Folder Configuration

The backend can be configured with:

- `POWER_AUTOMATE_TARGET_FOLDER`: fixed destination folder, e.g. `POD_Uploads` or `POD_Uploads/Inbound`
- `POWER_AUTOMATE_FIXED_FOLDER_ONLY`: defaults to `true`; when true, backend sends `createFolder=false`, `renameOnly=true`, and sets `relativePath` to `targetFolder/targetFileName`

Recommended for the original path behavior:

- `POWER_AUTOMATE_TARGET_FOLDER=POD_Uploads/Inbox`
- `POWER_AUTOMATE_FIXED_FOLDER_ONLY=true`

## Upload Failure Response

Return any non-2xx status with a plain text or JSON error body.

Example:

```json
{
  "ok": false,
  "error": "Folder creation failed"
}
```

The backend treats any non-2xx response as upload failure and keeps the submission in the phone queue for retry.

## Health Check Request Payload

The server health endpoint can probe the flow by sending:

```json
{
  "healthCheck": true,
  "source": "pod-pulse-server",
  "timestamp": "2026-07-21T08:30:12.000Z"
}
```

## Health Check Semantics

The Power Automate flow should branch early:

1. If `healthCheck === true`, do **not** create a file.
2. Return a small success payload immediately.

## Health Check Success Response

Return HTTP `200` with JSON like this:

```json
{
  "ok": true,
  "mode": "health-check",
  "message": "Power Automate reachable"
}
```

## Optional Backend Health Endpoint

After deployment, the backend can test the configured flow using:

```text
GET /api/health/power-automate
GET /api/health/power-automate?probe=1
```

Both require the admin header:

```text
x-admin-key: <ADMIN_KEY>
```

- Without `probe=1`, the endpoint reports whether the backend is configured.
- With `probe=1`, it performs the real flow probe using the health-check request above.