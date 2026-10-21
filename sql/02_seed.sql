-- Optional initial data from 2026Klitmøller.xlsx.
-- Change names here before running if desired. Rerunning won't duplicate names.
insert into public.players(display_name,is_guest) values
 ('David',false),('Gustav',false),('Johan',false),('Samuel',false),
 ('Sofus',false),('William',false),
 ('Anna',true),('Caroline',true),('Iben',true),('Maria',true),('Stine',true),('Vera',true)
on conflict do nothing;

-- No invented start or end dates. Add these later through Supabase Table Editor.
insert into public.tournaments(name) values ('Klitmøller 2026')
on conflict (name) do nothing;
