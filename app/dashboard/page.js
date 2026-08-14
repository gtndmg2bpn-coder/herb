-- ============================================================================
-- HERB — Dashboard v1  ·  SECTION A: SCHEMA + EVENT-LOG SPINE + ACTION LAYER
-- Claude-authored. Run this WHOLE file in the Supabase SQL Editor, top to bottom,
-- BEFORE any JS is touched. This is GATE 1 — nothing in Section B/C is valid until
-- this runs clean on the live DB and you report the result back.
--
-- Conventions matched to the live schema (ground truth from the repo):
--   * money is INTEGER PENCE, never floats
--   * derived quantities are VIEWS over an append-only ledger, never mutable columns
--     (mirrors the existing weight_log -> weight_current pattern exactly)
--   * every user table gets RLS scoped to auth.uid()
--   * views are security_invoker
--   * ledgers are RPC-only: no client insert/update/delete policy exists, so the
--     ONLY write path is a security-definer action function. This is what makes
--     "actions are the only mutation path" a hard invariant, not a convention —
--     so voice / receipt / n8n adapters later plug onto the same actions for free.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. STATE — the meal plan (MUTABLE, editable; NOT an event-log)
--    day x meal -> a recipe, OR an eating-out marker with est. cost + macros.
-- ---------------------------------------------------------------------------
create table if not exists public.plan_slots (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  slot_date        date not null,
  meal             text not null check (meal in ('breakfast','lunch','dinner','snack')),
  recipe_id        uuid references public.recipes(id) on delete set null,
  eating_out       boolean not null default false,
  eating_out_label text,
  est_cost_pence   integer check (est_cost_pence is null or est_cost_pence >= 0),
  est_kcal         integer,
  est_protein_g    integer,
  est_carbs_g      integer,
  est_fat_g        integer,
  portions         numeric not null default 1 check (portions > 0),
  capacity         text check (capacity is null or capacity in ('cook','batch','assemble')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, slot_date, meal)
);
create index if not exists plan_slots_user_date_idx on public.plan_slots (user_id, slot_date);

-- ---------------------------------------------------------------------------
-- 2. EVENT-LOG SPINE — the pantry (APPEND-ONLY ledger; stock is DERIVED)
--    A cooked meal lives here as a 'cooked_portion'; a raw ingredient as
--    'ingredient'. quantity is a SIGNED delta: + added, - consumed. Stock is a
--    SUM over this ledger. THIS TABLE IS NEVER UPDATED IN PLACE.
-- ---------------------------------------------------------------------------
create table if not exists public.pantry_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  item_kind     text not null check (item_kind in ('ingredient','cooked_portion')),
  ingredient_id uuid references public.ingredients(id) on delete restrict,
  recipe_id     uuid references public.recipes(id) on delete restrict,
  label         text,                        -- human fallback when neither id applies
  quantity      numeric not null,            -- SIGNED: + added, - consumed
  unit          text,
  location      text not null check (location in ('fridge','freezer','cupboard')),
  cost_pence    integer check (cost_pence is null or cost_pence >= 0),
  expiry_date   date,
  note          text,
  created_at    timestamptz not null default now(),
  constraint pantry_item_identified check (
    (item_kind = 'ingredient'     and ingredient_id is not null) or
    (item_kind = 'cooked_portion' and recipe_id     is not null) or
    (ingredient_id is null and recipe_id is null and label is not null)
  )
);
create index if not exists pantry_log_user_idx on public.pantry_log (user_id);

-- Derived stock: signed SUM over the ledger. The spine's read side. Never a column.
-- drop-then-create (not "create or replace") so a pre-existing view of this name with
-- different columns can't trigger 42P16. Dropping a VIEW never loses data.
drop view if exists public.pantry_stock cascade;
create view public.pantry_stock
with (security_invoker = true) as
  select
    user_id,
    item_kind,
    ingredient_id,
    recipe_id,
    location,
    sum(quantity) as quantity
  from public.pantry_log
  group by user_id, item_kind, ingredient_id, recipe_id, location
  having sum(quantity) > 0;

-- Lots view: the positive ADD rows, each carrying its own cost/expiry. Feeds the
-- soft-shelf-life WARN badges now and FEFO picking later. (v1 simplification: a lot
-- is not decremented as it is consumed, so a lot may over-report against stock —
-- acceptable because shelf-life is WARN-only; precise lot depletion is v2 FEFO.)
drop view if exists public.pantry_lots cascade;
create view public.pantry_lots
with (security_invoker = true) as
  select id, user_id, item_kind, ingredient_id, recipe_id, label,
         quantity, unit, location, cost_pence, expiry_date, note, created_at
  from public.pantry_log
  where quantity > 0;

-- ---------------------------------------------------------------------------
-- 3. LEDGERS — spend + off-plan intake (both APPEND-ONLY)
-- ---------------------------------------------------------------------------
create table if not exists public.spend_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  spend_date   date not null default current_date,
  amount_pence integer not null check (amount_pence >= 0),
  category     text not null default 'grocery'
                 check (category in ('grocery','eating_out','other')),
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists spend_log_user_idx on public.spend_log (user_id, spend_date);

create table if not exists public.intake_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  intake_date date not null default current_date,
  description text not null,
  kcal        integer,
  protein_g   integer,
  carbs_g     integer,
  fat_g       integer,
  confidence  text not null default 'ESTIMATED'
                check (confidence in
                  ('CONFIRMED','ESTIMATED','UNVERIFIED','USER_CONFIRMED','USER_SUPPLIED')),
  source      text,
  created_at  timestamptz not null default now()
);
create index if not exists intake_log_user_idx on public.intake_log (user_id, intake_date);

-- ---------------------------------------------------------------------------
-- 4. PROFILE ADDITIONS — household default + recipe-level "never again"
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists household_portions integer not null default 1;
alter table public.profiles
  add column if not exists disliked_recipe_ids uuid[] not null default '{}';

-- ---------------------------------------------------------------------------
-- 5. RLS  — read-own on all; NO write policies on ledgers/state (RPC-only writes).
--    plan_slots is mutable STATE, but is still mutated only via its actions, so it
--    also gets read-own + writes-via-RPC. Direct client writes are denied by the
--    absence of insert/update/delete policies.
-- ---------------------------------------------------------------------------
alter table public.plan_slots enable row level security;
alter table public.pantry_log enable row level security;
alter table public.spend_log  enable row level security;
alter table public.intake_log enable row level security;

drop policy if exists plan_slots_read_own on public.plan_slots;
create policy plan_slots_read_own on public.plan_slots
  for select using (auth.uid() = user_id);

drop policy if exists pantry_log_read_own on public.pantry_log;
create policy pantry_log_read_own on public.pantry_log
  for select using (auth.uid() = user_id);

drop policy if exists spend_log_read_own on public.spend_log;
create policy spend_log_read_own on public.spend_log
  for select using (auth.uid() = user_id);

drop policy if exists intake_log_read_own on public.intake_log;
create policy intake_log_read_own on public.intake_log
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 6. ACTION LAYER — the fixed vocabulary. Every mutation goes through one of
--    these. security definer so they can write past the (write-denying) RLS,
--    but each re-derives user_id from auth.uid() and never trusts a passed id.
-- ---------------------------------------------------------------------------

-- swap_meal: plan a recipe into a slot (upsert). If p_never_again, the recipe that
-- was there is added to profiles.disliked_recipe_ids so it is not suggested again.
create or replace function public.swap_meal(
  p_slot_date  date,
  p_meal       text,
  p_recipe_id  uuid,
  p_never_again boolean default false
) returns public.plan_slots
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_prev uuid;
  v_row  public.plan_slots;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select recipe_id into v_prev
    from public.plan_slots
   where user_id = v_uid and slot_date = p_slot_date and meal = p_meal;

  insert into public.plan_slots (user_id, slot_date, meal, recipe_id, eating_out)
  values (v_uid, p_slot_date, p_meal, p_recipe_id, false)
  on conflict (user_id, slot_date, meal) do update
    set recipe_id        = excluded.recipe_id,
        eating_out       = false,
        eating_out_label = null,
        updated_at       = now()
  returning * into v_row;

  if p_never_again and v_prev is not null then
    update public.profiles
       set disliked_recipe_ids =
             (select array(select distinct e
                             from unnest(coalesce(disliked_recipe_ids,'{}') || v_prev) e))
     where id = v_uid;
  end if;

  return v_row;
end;
$$;

-- mark_eating_out: replace a slot with an eating-out marker + est cost/macros.
create or replace function public.mark_eating_out(
  p_slot_date     date,
  p_meal          text,
  p_label         text,
  p_est_cost_pence integer default null,
  p_est_kcal      integer default null,
  p_est_protein_g integer default null,
  p_est_carbs_g   integer default null,
  p_est_fat_g     integer default null
) returns public.plan_slots
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.plan_slots;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  insert into public.plan_slots
    (user_id, slot_date, meal, recipe_id, eating_out, eating_out_label,
     est_cost_pence, est_kcal, est_protein_g, est_carbs_g, est_fat_g)
  values
    (v_uid, p_slot_date, p_meal, null, true, p_label,
     p_est_cost_pence, p_est_kcal, p_est_protein_g, p_est_carbs_g, p_est_fat_g)
  on conflict (user_id, slot_date, meal) do update
    set recipe_id        = null,
        eating_out       = true,
        eating_out_label = excluded.eating_out_label,
        est_cost_pence   = excluded.est_cost_pence,
        est_kcal         = excluded.est_kcal,
        est_protein_g    = excluded.est_protein_g,
        est_carbs_g      = excluded.est_carbs_g,
        est_fat_g        = excluded.est_fat_g,
        updated_at       = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- set_portions: override portions for one slot (household default lives on profile).
create or replace function public.set_portions(
  p_slot_date date,
  p_meal      text,
  p_portions  numeric
) returns public.plan_slots
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.plan_slots;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_portions is null or p_portions <= 0 then
    raise exception 'portions must be > 0';
  end if;

  update public.plan_slots
     set portions = p_portions, updated_at = now()
   where user_id = v_uid and slot_date = p_slot_date and meal = p_meal
  returning * into v_row;

  if not found then raise exception 'no plan slot for that day/meal'; end if;
  return v_row;
end;
$$;

-- add_pantry_items: append one or more POSITIVE stock rows from a JSON array.
-- Each element: {item_kind, ingredient_id?, recipe_id?, label?, quantity, unit?,
--                location, cost_pence?, expiry_date?, note?}
create or replace function public.add_pantry_items(p_items jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_count integer := 0;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'p_items must be a JSON array'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.pantry_log
      (user_id, item_kind, ingredient_id, recipe_id, label, quantity, unit,
       location, cost_pence, expiry_date, note)
    values (
      v_uid,
      v_item->>'item_kind',
      nullif(v_item->>'ingredient_id','')::uuid,
      nullif(v_item->>'recipe_id','')::uuid,
      v_item->>'label',
      abs((v_item->>'quantity')::numeric),          -- adds are positive
      v_item->>'unit',
      v_item->>'location',
      nullif(v_item->>'cost_pence','')::integer,
      nullif(v_item->>'expiry_date','')::date,
      v_item->>'note'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- consume_pantry_item: append a NEGATIVE row (stock down). item identified the same
-- way an add is. Does not force stock non-negative (WARN-not-block ethos); the UI
-- surfaces negatives if they ever occur.
create or replace function public.consume_pantry_item(
  p_item_kind     text,
  p_quantity      numeric,
  p_location      text,
  p_ingredient_id uuid default null,
  p_recipe_id     uuid default null,
  p_label         text default null,
  p_unit          text default null,
  p_note          text default null
) returns public.pantry_log
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.pantry_log;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity to consume must be > 0';
  end if;

  insert into public.pantry_log
    (user_id, item_kind, ingredient_id, recipe_id, label, quantity, unit, location, note)
  values
    (v_uid, p_item_kind, p_ingredient_id, p_recipe_id, p_label,
     -abs(p_quantity), p_unit, p_location, p_note)
  returning * into v_row;

  return v_row;
end;
$$;

-- log_spend: append a spend row.
create or replace function public.log_spend(
  p_amount_pence integer,
  p_category     text default 'grocery',
  p_spend_date   date default current_date,
  p_note         text default null
) returns public.spend_log
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_row public.spend_log;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.spend_log (user_id, amount_pence, category, spend_date, note)
  values (v_uid, p_amount_pence, p_category, p_spend_date, p_note)
  returning * into v_row;
  return v_row;
end;
$$;

-- log_off_plan_intake: append an intake row. Defaults confidence ESTIMATED so the
-- UI knows to ask the user to confirm (price/intake confidence taxonomy).
create or replace function public.log_off_plan_intake(
  p_description text,
  p_kcal        integer default null,
  p_protein_g   integer default null,
  p_carbs_g     integer default null,
  p_fat_g       integer default null,
  p_confidence  text default 'ESTIMATED',
  p_source      text default null,
  p_intake_date date default current_date
) returns public.intake_log
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_row public.intake_log;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.intake_log
    (user_id, description, kcal, protein_g, carbs_g, fat_g, confidence, source, intake_date)
  values
    (v_uid, p_description, p_kcal, p_protein_g, p_carbs_g, p_fat_g,
     coalesce(p_confidence,'ESTIMATED'), p_source, p_intake_date)
  returning * into v_row;
  return v_row;
end;
$$;

-- log_weight: append a weigh-in to the EXISTING spine (weight_log -> weight_current).
create or replace function public.log_weight(
  p_weight_kg numeric,
  p_note      text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_weight_kg is null or p_weight_kg <= 0 then raise exception 'weight_kg must be > 0'; end if;
  insert into public.weight_log (user_id, weight_kg, note)
  values (v_uid, p_weight_kg, coalesce(p_note, 'Logged from dashboard'));
end;
$$;

-- Execution grants: authenticated users only (anon cannot call actions).
revoke all on function
  public.swap_meal(date,text,uuid,boolean),
  public.mark_eating_out(date,text,text,integer,integer,integer,integer,integer),
  public.set_portions(date,text,numeric),
  public.add_pantry_items(jsonb),
  public.consume_pantry_item(text,numeric,text,uuid,uuid,text,text,text),
  public.log_spend(integer,text,date,text),
  public.log_off_plan_intake(text,integer,integer,integer,integer,text,text,date),
  public.log_weight(numeric,text)
from public;

grant execute on function
  public.swap_meal(date,text,uuid,boolean),
  public.mark_eating_out(date,text,text,integer,integer,integer,integer,integer),
  public.set_portions(date,text,numeric),
  public.add_pantry_items(jsonb),
  public.consume_pantry_item(text,numeric,text,uuid,uuid,text,text,text),
  public.log_spend(integer,text,date,text),
  public.log_off_plan_intake(text,integer,integer,integer,integer,text,text,date),
  public.log_weight(numeric,text)
to authenticated;

-- ============================================================================
-- END SECTION A. Expected: "Success. No rows returned." Report any error verbatim
-- before Section B/C is built — this file is the gate.
-- ============================================================================
