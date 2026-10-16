-- Races table: one active race at a time (single row per race)
create table if not exists public.races (
  id uuid primary key default gen_random_uuid(),
  race_number int not null,
  phase text not null default 'betting',
  countdown_start_ms bigint,
  created_at timestamptz not null default now()
);

-- Bets table: one row per placed bet
create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  phone text not null,
  kind text not null,
  a int not null,
  b int not null default -1,
  amount numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_bets_race_id on public.bets(race_id);
create index if not exists idx_bets_race_id_phone on public.bets(race_id, phone);

alter table public.races enable row level security;
alter table public.bets enable row level security;

-- anyone can read
drop policy if exists races_read on public.races;
create policy races_read on public.races for select using (true);
drop policy if exists bets_read on public.bets;
create policy bets_read on public.bets for select using (true);

-- anyone can insert bets (single bet, tiny amounts)
drop policy if exists bets_insert on public.bets;
create policy bets_insert on public.bets for insert with check (true);

-- bets can be cleared by phone during betting (race phase check via delete)
drop policy if exists bets_delete on public.bets;
create policy bets_delete on public.bets for delete using (true);

-- races: anyone can insert (start new race), update (lock, start)
drop policy if exists races_insert on public.races;
create policy races_insert on public.races for insert with check (true);
drop policy if exists races_update on public.races;
create policy races_update on public.races for update using (true) with check (true);

-- Realtime publication
alter publication supabase_realtime add table public.races;
alter publication supabase_realtime add table public.bets;
