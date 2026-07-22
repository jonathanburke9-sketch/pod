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
  "driverId": "driver-002",
  "driverName": "Deon",
  "folder": "Deon",
  "invoiceNumber": "INV-1042",
  "paymentMethod": "EFT",
  "notes": "Delivered to reception",
  "timestamp": "2026-07-21T08:30:12.000Z",
  "filename": "INV-1042_20260721-083012.pdf",
  "targetFolder": "POD_Uploads",
  "targetFileName": "INV-1042_20260721-083012.pdf",
  "createFolder": false,
  "fixedFolderOnly": true,
  "renameOnly": true,
  "relativePath": "POD_Uploads/INV-1042_20260721-083012.pdf",
  "year": "2026",
  "month": "07",
  "scanCount": 1,
  "qualityWarnings": [],
  "pdfBase64": "JVBERi0xLjQK..."
}
```

## Upload Semantics

The flow should:

1. Parse the JSON body.
2. Use `targetFolder` as a pre-existing fixed folder path.
3. Do **not** create new folders when `createFolder` is `false`.
4. Decode `pdfBase64` and create the file using `targetFileName` (rename-only behavior in that fixed folder).
5. Return success details to the backend.

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

## Fixed Folder Configuration

The backend can be configured with:

- `POWER_AUTOMATE_TARGET_FOLDER`: fixed destination folder, e.g. `POD_Uploads` or `POD_Uploads/Inbound`
- `POWER_AUTOMATE_FIXED_FOLDER_ONLY`: defaults to `true`; when true, backend sends `createFolder=false`, `renameOnly=true`, and sets `relativePath` to `targetFolder/targetFileName`

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