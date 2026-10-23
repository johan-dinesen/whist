-- Whist: Efter klokkeslæt, Statistik.
-- Apply after 05_scoring_history.sql and 21_hands_statistics.sql.
-- Adds ONE read-only RPC. No existing games, scores or profiles are changed.
--
-- Pooled by LOCAL clock hour, using actual games.played_at only.
-- Clock window: [10:00, next day 03:00), i.e. buckets 10..23, 00..02.
-- Midnight hours are represented as 24, 25, 26 for graph ordering.
-- Historical games with NULL played_at are excluded (not created_at!).
-- Helsinki tournaments use Europe/Helsinki; other tournaments and Kredsspil
-- default to Europe/Copenhagen. If a future tournament is held elsewhere,
-- extend the location-to-timezone mapping below before using its data.
-- No time-dependent values are rounded before aggregation.
--
-- Exact calls use the same definition as 18_ordinary_deviation_only.sql:
--   ordinary/Vip with score=0, Ren Sol/Ren Bord wins, Sol/Bord wins with 0
--   tricks. Legacy 'Vundet' without a trick count remains unclassified but
--   remains in the calls denominator, consistent with Meldingsstatistik.
-- Absolute deviation includes ordinary/Vip callers only (score not NULL).
-- A multi-caller solo hand counts as a call for EACH caller.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_hourly_statistics_for_notes(
  p_tournament_ids uuid[] DEFAULT NULL,
  p_include_kredsspil boolean DEFAULT true,
  p_include_guests boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Kunne ikke oprette en læsesession';
  END IF;

  IF p_tournament_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_tournament_ids) requested(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = requested.id)
  ) THEN
    RAISE EXCEPTION 'Ukendt spilsamling';
  END IF;

  WITH timed_games AS (
    SELECT g.id, g.call_type, g.score,
      EXTRACT(HOUR FROM (
        g.played_at AT TIME ZONE
        CASE WHEN t.name ILIKE '%Helsinki%' THEN 'Europe/Helsinki'
             ELSE 'Europe/Copenhagen' END
      ))::integer AS clock_hour
    FROM public.games g
    LEFT JOIN public.tournaments t ON t.id = g.tournament_id
    WHERE g.played_at IS NOT NULL
      AND (
        p_tournament_ids IS NULL
        OR g.tournament_id = ANY(p_tournament_ids)
        OR (g.tournament_id IS NULL AND COALESCE(p_include_kredsspil, false))
      )
      AND (
        COALESCE(p_include_guests, false)
        OR NOT EXISTS (
          SELECT 1 FROM public.game_participants gp
          WHERE gp.game_id = g.id AND gp.was_guest
        )
      )
  ),
  eligible_games AS (
    SELECT g.id, g.call_type, g.score,
      CASE WHEN g.clock_hour < 3 THEN g.clock_hour + 24
           ELSE g.clock_hour END AS display_hour
    FROM timed_games g
    WHERE g.clock_hour BETWEEN 10 AND 23 OR g.clock_hour BETWEEN 0 AND 2
  ),
  player_hours AS (
    SELECT paid.player_id,
      MAX(paid.player_name)::text AS player_name,
      g.display_hour AS hour,
      COUNT(*)::bigint AS games,
      ROUND(SUM(paid.payout), 2) AS points,
      COUNT(*) FILTER (WHERE paid.is_caller)::bigint AS calls,
      COUNT(*) FILTER (WHERE paid.is_caller AND (
        (g.call_type IN ('almindelig','gode','halve','vip') AND g.score = 0)
        OR (g.call_type IN ('ren_sol','ren_bordlaegger')
            AND paid.solo_result ILIKE 'Vundet%')
        OR (g.call_type IN ('sol','bordlaegger')
            AND paid.solo_result ILIKE 'Vundet (0%')
      ))::bigint AS exact_calls,
      COUNT(*) FILTER (
        WHERE paid.is_caller
          AND g.call_type IN ('almindelig','gode','halve','vip')
          AND g.score IS NOT NULL
      )::bigint AS ordinary_calls,
      COALESCE(SUM(ABS(g.score::numeric)) FILTER (
        WHERE paid.is_caller
          AND g.call_type IN ('almindelig','gode','halve','vip')
      ), 0)::numeric AS ordinary_abs_sum,
      COUNT(*) FILTER (
        WHERE paid.is_caller
          AND g.call_type IN ('sol','ren_sol','bordlaegger','ren_bordlaegger')
      )::bigint AS solo_calls
    FROM eligible_games g
    JOIN public.game_player_payouts paid ON paid.game_id = g.id
    GROUP BY paid.player_id, g.display_hour
  ),
  players AS (
    SELECT player_id, MAX(player_name)::text AS name
    FROM player_hours
    GROUP BY player_id
  )
  SELECT jsonb_build_object(
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.player_id, 'name', p.name)
        ORDER BY p.name, p.player_id)
      FROM players p
    ), '[]'::jsonb),
    'hours', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'player_id', h.player_id,
        'hour', h.hour,
        'games', h.games,
        'points', h.points,
        'calls', h.calls,
        'exact_calls', h.exact_calls,
        'ordinary_calls', h.ordinary_calls,
        'ordinary_abs_sum', h.ordinary_abs_sum,
        'solo_calls', h.solo_calls
      ) ORDER BY h.hour, h.player_id)
      FROM player_hours h
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_hourly_statistics_for_notes(uuid[],boolean,boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_hourly_statistics_for_notes(uuid[],boolean,boolean)
  TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

SELECT to_regprocedure('public.get_hourly_statistics_for_notes(uuid[],boolean,boolean)')
  AS hourly_statistics_function;
