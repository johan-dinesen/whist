-- Whist: first Statistik module, read-only standings.
-- Run AFTER 05_scoring_history.sql and the public-history repair.
-- Does NOT create/modify any player, game, tournament, password or picture.
-- Profile pictures already live in the whist-profiles Storage bucket from the original implementation.
-- Filter semantics exactly match public.get_game_history_for_notes:
--  null tournament IDs = all, [] = none except Kredsspil when enabled,
--  guest=false excludes WHOLE games involving a guest.

BEGIN;

-- Safe when upgrading a prior draft of the standings RPC with a different
-- return type. This function is read-only and has no dependent user data.
DROP FUNCTION IF EXISTS public.get_standings_for_notes(uuid[],boolean,boolean);

CREATE OR REPLACE FUNCTION public.get_standings_for_notes(
  p_tournament_ids uuid[] DEFAULT NULL,
  p_include_kredsspil boolean DEFAULT true,
  p_include_guests boolean DEFAULT false
)
RETURNS TABLE (
  player_id uuid,
  player_name text,
  is_guest boolean,
  games_played bigint,
  net_points numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Read access requires only an anonymous Supabase Auth session, not a password.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Kunne ikke oprette en læsesession';
  END IF;
  IF p_tournament_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_tournament_ids) requested(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = requested.id)
  ) THEN
    RAISE EXCEPTION 'Ukendt spilsamling';
  END IF;

  RETURN QUERY
    WITH eligible_games AS (
      SELECT g.id
      FROM public.games g
      WHERE (
        p_tournament_ids IS NULL
        OR g.tournament_id = ANY(p_tournament_ids)
        OR (g.tournament_id IS NULL AND COALESCE(p_include_kredsspil,false))
      )
      AND (
        COALESCE(p_include_guests,false)
        OR NOT EXISTS (
          SELECT 1 FROM public.game_participants participant
          WHERE participant.game_id = g.id AND participant.was_guest
        )
      )
    )
    SELECT
      payouts.player_id,
      MAX(payouts.player_name)::text AS player_name,
      BOOL_OR(payouts.is_guest) AS is_guest,
      COUNT(*)::bigint AS games_played,
      ROUND(SUM(payouts.payout),2)::numeric AS net_points
    FROM public.game_player_payouts payouts
    JOIN eligible_games e ON e.id = payouts.game_id
    GROUP BY payouts.player_id
    -- Every included player has played at least one qualifying game.
    ORDER BY ROUND(SUM(payouts.payout),2) DESC, COUNT(*) DESC, MAX(payouts.player_name) ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_standings_for_notes(uuid[],boolean,boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_standings_for_notes(uuid[],boolean,boolean)
  TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

SELECT to_regprocedure('public.get_standings_for_notes(uuid[],boolean,boolean)') AS standings_function;
-- Optional, verify 1 row per player with any games:
-- SELECT * FROM public.get_standings_for_notes(NULL,true,true);
