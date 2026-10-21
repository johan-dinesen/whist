-- AFTER you have signed in to the website with your email once:
-- replace the email below with your own and run in Supabase SQL Editor.
-- Do NOT commit personal email addresses or credentials if you prefer privacy.
insert into public.registrars(user_id)
select id from auth.users where email = 'REPLACE_WITH_YOUR_EMAIL'
on conflict (user_id) do nothing;

-- Confirm that one row was inserted. If 0 rows, complete your first email login
-- and check the email matches your Supabase Auth user.
