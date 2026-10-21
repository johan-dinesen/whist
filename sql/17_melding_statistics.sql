-- Whist v0.2.3: per-player calling/accuracy and average payout statistics.
-- Apply AFTER 05_scoring_history.sql, 06_tournament_notes.sql and
-- 16_standings.sql. Only creates one READ-ONLY RPC; changes no existing data.
-- Matches get_standings_for_notes() for tournament and guest filtering.
-- A zero/one-trick distinction is NOT present in many historical Sol/Bordlægger
-- wins imported as "Vundet". These are UNCLASSIFIED rather than invented.
-- A lost solo call has no known numeric trick deviation and is excluded from
-- deviation averages, while still included in calls_made and over_calls.

BEGIN;

DROP FUNCTION IF EXISTS public.get_melding_statistics_for_notes(uuid[],boolean,boolean);

CREATE FUNCTION public.get_melding_statistics_for_notes(
  p_tournament_ids uuid[] DEFAULT NULL,
  p_include_kredsspil boolean DEFAULT true,
  p_include_guests boolean DEFAULT false
)
RETURNS TABLE (
  player_id uuid,
  player_name text,
  is_guest boolean,
  games_played bigint,
  net_points numeric,
  calls_made bigint,
  under_calls bigint,
  over_calls bigint,
  exact_calls bigint,
  unclassified_calls bigint,
  under_pct numeric,
  over_pct numeric,
  exact_pct numeric,
  avg_deviation numeric,
  avg_abs_deviation numeric,
  deviation_observations bigint,
  avg_points_per_hand numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Same anonymous-Supabase-Auth read access as Historik and Stilling.
  -- NO call to is_registrar(): the shared password remains write-only.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Kunne ikke oprette en læsesession';
  END IF;

  IF p_tournament_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_tournament_ids) AS requested(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tournaments t WHERE t.id = requested.id
    )
  ) THEN
    RAISE EXCEPTION 'Ukendt spilsamling';
  END IF;

  RETURN QUERY
  WITH eligible_games AS (
    SELECT g.id, g.call_type, g.score
    FROM public.games g
    WHERE (
      p_tournament_ids IS NULL
      OR g.tournament_id = ANY(p_tournament_ids)
      OR (g.tournament_id IS NULL AND COALESCE(p_include_kredsspil, false))
    )
    AND (
      COALESCE(p_include_guests, false)
      OR NOT EXISTS (
        SELECT 1 FROM public.game_participants member
        WHERE member.game_id = g.id AND member.was_guest
      )
    )
  ),
  player_hands AS (
    SELECT
      paid.player_id,
      paid.player_name,
      paid.is_guest,
      paid.is_caller,
      paid.solo_result,
      paid.payout,
      game.call_type,
      game.score
    FROM public.game_player_payouts paid
    JOIN eligible_games game ON game.id = paid.game_id
  ),
  classified AS (
    SELECT hand.*,
      CASE
        WHEN NOT hand.is_caller THEN NULL
        WHEN hand.call_type IN ('almindelig', 'gode', 'halve', 'vip') THEN
          CASE
            WHEN hand.score > 0 THEN 'under'
            WHEN hand.score < 0 THEN 'over'
            WHEN hand.score = 0 THEN 'exact'
            ELSE 'unknown'
          END
        WHEN hand.call_type IN ('ren_sol', 'ren_bordlaegger') THEN
          CASE WHEN hand.solo_result ILIKE 'Vundet%' THEN 'exact' ELSE 'over' END
        WHEN hand.call_type IN ('sol', 'bordlaegger') THEN
          CASE
            WHEN hand.solo_result ILIKE 'Vundet (0%' THEN 'exact'
            WHEN hand.solo_result ILIKE 'Vundet (1%' THEN 'under'
            WHEN hand.solo_result ILIKE 'Vundet%' THEN 'unknown'
            ELSE 'over'
          END
        ELSE 'unknown'
      END AS outcome,
      CASE
        WHEN NOT hand.is_caller THEN NULL::numeric
        WHEN hand.call_type IN ('almindelig', 'gode', 'halve', 'vip')
          THEN hand.score::numeric
        WHEN hand.call_type IN ('ren_sol', 'ren_bordlaegger')
          AND hand.solo_result ILIKE 'Vundet%' THEN 0::numeric
        WHEN hand.call_type IN ('sol', 'bordlaegger')
          AND hand.solo_result ILIKE 'Vundet (0%' THEN 0::numeric
        WHEN hand.call_type IN ('sol', 'bordlaegger')
          AND hand.solo_result ILIKE 'Vundet (1%' THEN 1::numeric
        ELSE NULL::numeric
      END AS deviation
    FROM player_hands hand
  ),
  counts AS (
    SELECT
      c.player_id,
      MAX(c.player_name)::text AS player_name,
      BOOL_OR(c.is_guest) AS is_guest,
      COUNT(*)::bigint AS games_played,
      ROUND(SUM(c.payout), 2)::numeric AS net_points,
      COUNT(*) FILTER (WHERE c.is_caller)::bigint AS calls_made,
      COUNT(*) FILTER (WHERE c.outcome = 'under')::bigint AS under_calls,
      COUNT(*) FILTER (WHERE c.outcome = 'over')::bigint AS over_calls,
      COUNT(*) FILTER (WHERE c.outcome = 'exact')::bigint AS exact_calls,
      COUNT(*) FILTER (WHERE c.outcome = 'unknown')::bigint AS unclassified_calls,
      ROUND(AVG(c.deviation), 2)::numeric AS avg_deviation,
      ROUND(AVG(ABS(c.deviation)), 2)::numeric AS avg_abs_deviation,
      COUNT(c.deviation)::bigint AS deviation_observations,
      ROUND(AVG(c.payout), 2)::numeric AS avg_points_per_hand
    FROM classified c
    GROUP BY c.player_id
  )
  SELECT
    s.player_id, s.player_name, s.is_guest,
    s.games_played, s.net_points,
    s.calls_made, s.under_calls, s.over_calls, s.exact_calls, s.unclassified_calls,
    ROUND(100::numeric * s.under_calls / NULLIF(s.calls_made, 0), 1)::numeric,
    ROUND(100::numeric * s.over_calls / NULLIF(s.calls_made, 0), 1)::numeric,
    ROUND(100::numeric * s.exact_calls / NULLIF(s.calls_made, 0), 1)::numeric,
    s.avg_deviation, s.avg_abs_deviation, s.deviation_observations,
    s.avg_points_per_hand
  FROM counts s
  ORDER BY s.net_points DESC, s.games_played DESC, s.player_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_melding_statistics_for_notes(uuid[],boolean,boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_melding_statistics_for_notes(uuid[],boolean,boolean)
  TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

-- Verify that the function is installed (testing from the browser also needed):
SELECT to_regprocedure('public.get_melding_statistics_for_notes(uuid[],boolean,boolean)')
  AS player_statistics_function;
