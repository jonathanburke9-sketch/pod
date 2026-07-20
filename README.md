# POD Pulse Setup Guide (Supabase + OneDrive)

POD Pulse is an offline-first proof-of-delivery app for drivers. This guide explains:

1. How to run the app now (current local JSON mode).
2. How to set up Supabase in detail.
3. How to link OneDrive folders to the driver mapping.
4. How to migrate from local files to cloud-backed storage.

## Current Architecture

At the moment, the running app behavior is:

- Driver list API reads from `data/drivers.json`.
- Upload API stores payloads in `data/submissions.json`.
- Supabase client exists in `lib/supabase.js`, but `server.js` is not yet wired to use it.

This README gives you the exact setup so you can switch cleanly.

## Prerequisites

1. Node.js 18+
2. npm
3. Supabase account and project
4. Microsoft OneDrive account (personal or business)

## Local Installation

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

3. Open:

- Driver app: `http://localhost:3000`
- Admin page: `http://localhost:3000/admin.html`

## Environment Variables

Create a `.env` file in the project root for secure secrets:

```env
PORT=3000
HOST=0.0.0.0
ADMIN_KEY=replace_with_strong_admin_key

SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
```

Notes:

- `SUPABASE_SERVICE_ROLE_KEY` must only be used on the server.
- Never expose service role keys to browser code.
- Keep `.env` out of source control.

## Supabase Project Setup (Detailed)

### Step 1: Create Project

1. Go to Supabase Dashboard.
2. Create a new project.
3. Save:

- Project URL
- `anon` key
- `service_role` key

### Step 2: Create Tables

Run this SQL in Supabase SQL Editor:

```sql
create extension if not exists pgcrypto;

create table if not exists drivers (
	id text primary key,
	name text not null,
	folder text not null,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists pod_submissions (
	id uuid primary key default gen_random_uuid(),
	driver_id text not null,
	driver_name text not null,
	driver_folder text not null,
	invoice_number text not null,
	payment_method text,
	notes text,
	pod_pdf_url text,
	status text not null default 'queued',
	source_device text,
	payload jsonb,
	created_at timestamptz not null default now(),
	synced_at timestamptz
);

create index if not exists idx_pod_submissions_driver_id
	on pod_submissions(driver_id);

create index if not exists idx_pod_submissions_created_at
	on pod_submissions(created_at desc);
```

Optional trigger to auto-update `updated_at` on `drivers`:

```sql
create or replace function set_updated_at()
returns trigger as $$
begin
	new.updated_at = now();
	return new;
end;
$$ language plpgsql;

drop trigger if exists trg_drivers_updated_at on drivers;
create trigger trg_drivers_updated_at
before update on drivers
for each row
execute function set_updated_at();
```

### Step 3: Seed Drivers

```sql
insert into drivers (id, name, folder) values
('driver-001', 'Jonathan (Admin)', 'Jonathan-Admin'),
('driver-002', 'Deon', 'Deon'),
('driver-003', 'Themba', 'Themba'),
('driver-004', 'Janine', 'Janine'),
('driver-005', 'Wilna', 'Wilna')
on conflict (id) do update
set name = excluded.name,
		folder = excluded.folder,
		active = true;
```

### Step 4: Enable Row Level Security

For internal server-only access with service role key, policies can stay strict while server bypasses RLS.

```sql
alter table drivers enable row level security;
alter table pod_submissions enable row level security;
```

If you later expose direct browser reads with `anon` key, add explicit read policies.

### Step 5: Storage Bucket for PDFs

1. Go to Supabase Storage.
2. Create bucket: `pod-files`.
3. Set privacy based on requirements:

- Private recommended for signed POD files.

Recommended object path format:

`POD_Uploads/<driver-folder>/<invoice-number>/<timestamp>.pdf`

## Wiring This Codebase to Supabase

`lib/supabase.js` is already present and creates a Supabase client from env vars.

To fully switch from local JSON to Supabase, update `server.js` API handlers:

1. `GET /api/drivers`

- Replace file read with `select id, name, folder from drivers where active = true`.

2. `POST /api/admin/drivers`

- Validate admin key.
- Upsert rows into `drivers`.

3. `POST /api/upload`

- Insert payload into `pod_submissions`.
- Optionally store generated PDF in `pod-files` and save URL/path.

Migration strategy:

1. Keep local file write as fallback.
2. Try Supabase insert first.
3. If Supabase fails, queue locally and retry.

## OneDrive Folder Linking (Detailed)

The app uses each driver's `folder` value to map delivery files to destination folders.

### Folder Convention

Use this base structure in OneDrive:

```text
OneDrive/
	POD_Uploads/
		Jonathan-Admin/
		Deon/
		Themba/
		Janine/
		Wilna/
```

Important rules:

1. Folder name must match the driver `folder` value exactly.
2. Avoid trailing spaces and special characters.
3. Keep naming stable after drivers are linked.

### Windows Setup Steps

1. Open OneDrive folder on the server PC.
2. Create `POD_Uploads`.
3. Create one subfolder per driver using exact mapping values.
4. Confirm OneDrive status is green check (fully synced).

### Link Driver Mapping in Admin

1. Open `http://localhost:3000/admin.html`.
2. Enter admin key.
3. For each driver row:

- `name`: display name in the app.
- `folder`: exact OneDrive subfolder name.

4. Save drivers.

### Verify Link Integrity

Use this checklist:

1. Driver appears in app dropdown.
2. Driver has non-empty folder value.
3. Folder exists in `OneDrive/POD_Uploads/`.
4. Names match exactly (case and spaces).

## Suggested Upload Path Format

When saving each POD file, build paths like:

`POD_Uploads/<driver-folder>/<YYYY>/<MM>/INV-<number>_<timestamp>.pdf`

Example:

`POD_Uploads/Deon/2026/07/INV-1042_2026-07-20T14-22-13Z.pdf`

This improves search, monthly audits, and recovery.

## Migration from Local Data

### Drivers Migration

1. Export `data/drivers.json`.
2. Upsert into Supabase `drivers` table.
3. Verify admin page returns Supabase values.

### Submissions Migration

1. Export `data/submissions.json`.
2. Transform each object into `pod_submissions` fields.
3. Keep original object inside `payload` for traceability.

## Security Recommendations

1. Use strong `ADMIN_KEY`.
2. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
3. Use HTTPS in production.
4. Restrict server firewall to required ports.
5. Back up Supabase and OneDrive regularly.

## Project Files

- `server.js` HTTP API and static serving
- `lib/supabase.js` Supabase client bootstrap
- `data/drivers.json` local fallback drivers
- `data/submissions.json` local fallback submissions
- `public/index.html` driver UI
- `public/admin.html` admin UI
- `public/js/app.js` driver app logic
- `public/js/admin.js` admin panel logic
- `settings/app_settings.json` UI labels and configuration

## Commands

```bash
npm install
npm start
npm test
```

## Quick Troubleshooting

### Drivers not loading

1. Check `/api/drivers` response in browser network tab.
2. Validate `drivers` table rows in Supabase.
3. Confirm server env vars are loaded.

### Admin save fails

1. Verify `ADMIN_KEY` header matches server value.
2. Check server logs for 403 or validation errors.

### OneDrive files missing

1. Confirm driver folder mapping text matches exactly.
2. Confirm OneDrive client is signed in and syncing.
3. Check folder permissions for service account/user.
