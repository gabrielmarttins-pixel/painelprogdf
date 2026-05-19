create table if not exists public.panel_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.panel_state enable row level security;

drop policy if exists "Allow public panel read" on public.panel_state;
drop policy if exists "Allow public panel upsert" on public.panel_state;

create policy "Allow public panel read"
on public.panel_state
for select
to anon
using (id = 'current');

create policy "Allow public panel upsert"
on public.panel_state
for all
to anon
using (id = 'current')
with check (id = 'current');
