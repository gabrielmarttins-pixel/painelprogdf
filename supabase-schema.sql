create table if not exists public.panel_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.panel_state enable row level security;

drop policy if exists "Allow public panel read" on public.panel_state;
drop policy if exists "Allow public panel upsert" on public.panel_state;
drop policy if exists "Allow public panel insert" on public.panel_state;
drop policy if exists "Allow public panel update" on public.panel_state;

create policy "Allow public panel read"
on public.panel_state
for select
to anon
using (id = 'current');

create policy "Allow public panel insert"
on public.panel_state
for insert
to anon
with check (id = 'current');

create policy "Allow public panel update"
on public.panel_state
for update
to anon
using (id = 'current')
with check (id = 'current');

insert into public.panel_state (id, data)
values (
  'current',
  '{
    "updatedAt": "",
    "isCleared": false,
    "carouselImages": [],
    "program": {
      "program": "",
      "date": "",
      "time": "",
      "production": "",
      "blocks": "",
      "notes": "",
      "bulletin": {
        "id": "",
        "name": "",
        "duration": "",
        "time": ""
      },
      "calls": [
        {
          "id": "ID DA CHAMADA",
          "name": "NOME DA CHAMADA",
          "duration": "00:00:30",
          "time": "00:00"
        }
      ]
    }
  }'::jsonb
)
on conflict (id) do nothing;
