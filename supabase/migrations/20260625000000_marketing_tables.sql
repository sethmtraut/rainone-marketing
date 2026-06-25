-- ─────────────────────────────────────────────────────────────────────────────
-- Rain One Marketing Tools — New Homeowner Address Tool schema
-- ─────────────────────────────────────────────────────────────────────────────
-- mkt_runs           — one row per mail-list run (summary counts)
-- mkt_addresses      — every address output by a run = the master mailed history
-- mkt_customer_keys  — cached ServiceTitan customer/location address keys
-- mkt_meta           — last customer-cache refresh time + count
--
-- Shares the same Supabase project as SPIFF / Install Planner. Tables are
-- namespaced with the mkt_ prefix. Authenticated users have full access.

create table if not exists mkt_runs (
  id                uuid primary key default gen_random_uuid(),
  run_date          date not null,
  label             text,
  total_uploaded    integer not null default 0,
  removed_customers integer not null default 0,
  dupes_within      integer not null default 0,
  dupes_history     integer not null default 0,
  net_new           integer not null default 0,
  match_behavior    text not null default 'remove',
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now()
);

create table if not exists mkt_addresses (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references mkt_runs(id) on delete cascade,
  addr_key     text not null,
  address      text,
  city         text,
  state        text,
  zip          text,
  status       text,
  list_price   text,
  beds         text,
  baths        text,
  sqft         text,
  keyword_hit  text,
  source       text,
  date_pulled  date,
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists mkt_addresses_run_id_idx on mkt_addresses (run_id);
create index if not exists mkt_addresses_addr_key_idx on mkt_addresses (addr_key);

create table if not exists mkt_customer_keys (
  addr_key     text primary key,
  source       text,
  refreshed_at timestamptz not null default now()
);

create table if not exists mkt_meta (
  id                     integer primary key default 1,
  customers_refreshed_at timestamptz,
  customer_key_count     integer not null default 0
);
insert into mkt_meta (id) values (1) on conflict (id) do nothing;

-- ─── Row-Level Security (authenticated = full access; small trusted team) ─────
alter table mkt_runs          enable row level security;
alter table mkt_addresses     enable row level security;
alter table mkt_customer_keys enable row level security;
alter table mkt_meta          enable row level security;

create policy mkt_runs_authed          on mkt_runs          for all to authenticated using (true) with check (true);
create policy mkt_addresses_authed     on mkt_addresses     for all to authenticated using (true) with check (true);
create policy mkt_customer_keys_authed on mkt_customer_keys for all to authenticated using (true) with check (true);
create policy mkt_meta_authed          on mkt_meta          for all to authenticated using (true) with check (true);
