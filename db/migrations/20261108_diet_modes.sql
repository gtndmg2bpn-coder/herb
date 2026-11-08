-- Diet modes (Karum, 8 Nov 2026). NOT YET APPLIED: apply via Supabase MCP only on Karum's go-ahead.
-- Class C. Impact note: claude/HERB_Impact_Note_Diet_Modes_20261108.md
-- Additive only: three diet rows (inactive until onboarding ships) and two nullable profile columns.

insert into public.diets (key, label, carb_ceiling_g, carb_aim_g, kcal_day_band, kcal_week_band,
                          fat_lever_label, fat_lever_kcal_per_g, fat_lever_max_g_per_slot, active, notes)
values
  ('deficit', 'Calorie deficit', null, null, 0.1, 0.05, null, null, null, false,
   'Mode (8 Nov). No carb ceiling; fat 30% of kcal, carbs the remainder (lib/targets.js). Protein 1.8 g/kg. Inactive until 5-question onboarding ships.'),
  ('gut', 'Gut health', null, null, 0.1, 0.05, null, null, null, false,
   'Mode (8 Nov). As deficit for kcal/macros; 30 g fibre/day and 30 plants/week shown. Fermented-food swaps to follow. Inactive until onboarding ships.'),
  ('muscle', 'Muscle gain', null, null, 0.1, 0.05, 'olive oil', 8.84, 15, false,
   'Mode (8 Nov). Maintenance + 300 kcal. Protein 1.8 g/kg. Olive-oil lever kept to close a surplus gap. Inactive until onboarding ships.')
on conflict (key) do nothing;

alter table public.profiles
  add column if not exists avg_daily_steps integer
    check (avg_daily_steps is null or (avg_daily_steps >= 0 and avg_daily_steps <= 60000)),
  add column if not exists gym_sessions_per_week numeric
    check (gym_sessions_per_week is null or (gym_sessions_per_week >= 0 and gym_sessions_per_week <= 14));
