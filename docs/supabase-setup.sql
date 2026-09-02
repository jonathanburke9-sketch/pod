-- Run this once in the Supabase SQL Editor for a new project.
-- Tables required by server.js for the ScanHive admin panel and submission log.

create table if not exists drivers (
  id text primary key,
  name text not null,
  folder text not null,
  active boolean not null default true,
  functions text[] not null default '{}'
);

create table if not exists app_settings (
  id text primary key,
  value jsonb not null
);

create table if not exists pod_submissions (
  id bigint generated always as identity primary key,
  driver_id text,
  driver_name text,
  driver_folder text,
  invoice_number text,
  payment_method text,
  notes text,
  pod_pdf_url text,
  status text,
  source_device text,
  payload jsonb,
  synced_at timestamptz not null default now()
);

-- Seed the initial staff list (matches data/drivers.json). Safe to edit afterwards from the Admin page.
insert into drivers (id, name, folder, active, functions) values
  ('driver-001', 'Jonathan (Admin)', 'Jonathan-Admin', true, array['pod-sb','pod-just','receipt-sb','receipt-just']),
  ('driver-002', 'Deon', 'Deon', true, array['pod-sb','receipt-sb']),
  ('driver-003', 'Themba', 'Themba', true, array['pod-sb','pod-just']),
  ('driver-004', 'Janine', 'Janine', true, array['receipt-sb','receipt-just']),
  ('driver-005', 'Wilna', 'Wilna', true, array['pod-sb','pod-just','receipt-sb','receipt-just'])
on conflict (id) do nothing;
