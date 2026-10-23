-- Whist v0.2.11: Hænder, per-call-type breakdown for Statistik.
-- Run after 05_scoring_history.sql, 06_tournament_notes.sql and 16_standings.sql.
-- Read-only RPC. It creates/replaces a function; no games or players are changed.
-- Matches the existing Spilsamlinger and Medtag gæstespil filter semantics.
-- Antal counts individual calls: a solo game with two callers contributes TWO
-- Sol meldinger. Ordinary calls contribute one observation per game.
-- Gns. for ordinary/Vip = average signed g.score (not payout points).
-- Gns./% for solo types = proportion of winning callers * 100.
-- Only combinations represented in the selected games appear in the rows.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_hands_statistics_for_notes(
  p_tournament_ids uuid[] DEFAULT NULL,
  p_include_kredsspil boolean DEFAULT true,
  p_include_guests boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Anonymous Supabase Auth sessions may read stats; a registration password
  -- is not required. Anonymous API keys WITHOUT a session cannot call this.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Kunne ikke oprette en læsesession';
  END IF;

  IF p_tournament_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_tournament_ids) requested(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tournaments t WHERE t.id = requested.id
    )
  ) THEN
    RAISE EXCEPTION 'Ukendt spilsamling';
  END IF;

  WITH eligible_games AS (
    SELECT g.id, g.call_type, g.tricks, g.vip_depth, g.score
    FROM public.games g
    WHERE (
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
  participating_players AS (
    SELECT DISTINCT p.id, p.display_name
    FROM eligible_games g
    JOIN public.game_participants gp ON gp.game_id = g.id
    JOIN public.players p ON p.id = gp.player_id
  ),
  calls AS (
    SELECT
      g.call_type,
      g.tricks,
      COALESCE(g.vip_depth, 0)::integer AS depth,
      gp.player_id,
      CASE
        WHEN g.call_type IN ('almindelig', 'gode', 'halve', 'vip')
          THEN g.score::numeric
        WHEN gp.solo_result ILIKE 'Vundet%' THEN 100::numeric
        ELSE 0::numeric
      END AS observed_value
    FROM eligible_games g
    JOIN public.game_participants gp
      ON gp.game_id = g.id AND gp.is_caller
    WHERE g.call_type IN (
      'almindelig', 'gode', 'halve', 'vip',
      'sol', 'ren_sol', 'bordlaegger', 'ren_bordlaegger'
    )
  ),
  hand_summary AS (
    SELECT c.call_type, c.tricks, c.depth,
           COUNT(*)::bigint AS total_count,
           ROUND(AVG(c.observed_value), 2) AS total_average
    FROM calls c
    GROUP BY c.call_type, c.tricks, c.depth
  ),
  player_summary AS (
    SELECT c.call_type, c.tricks, c.depth, c.player_id,
           COUNT(*)::bigint AS player_count,
           ROUND(AVG(c.observed_value), 2) AS player_average
    FROM calls c
    GROUP BY c.call_type, c.tricks, c.depth, c.player_id
  ),
  hand_rows AS (
    SELECT
      h.call_type, h.tricks, h.depth, h.total_count, h.total_average,
      h.call_type IN ('sol','ren_sol','bordlaegger','ren_bordlaegger') AS is_solo,
      CASE h.call_type
        WHEN 'sol' THEN 'Sol'
        WHEN 'ren_sol' THEN 'Ren Sol'
        WHEN 'bordlaegger' THEN 'Bordlægger'
        WHEN 'ren_bordlaegger' THEN 'Ren Bordlægger'
        ELSE concat(
          h.tricks::text,
          CASE h.call_type
            WHEN 'almindelig' THEN 'Alm'
            WHEN 'gode' THEN 'Gode'
            WHEN 'halve' THEN 'Halve'
            WHEN 'vip' THEN 'Vip'
          END,
          CASE WHEN h.call_type = 'vip' THEN h.depth::text ELSE '' END
        )
      END AS label,
      (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'player_id', player.id,
            'count', COALESCE(ps.player_count, 0),
            'average', ps.player_average
          ) ORDER BY player.display_name, player.id
        ), '[]'::jsonb)
        FROM participating_players player
        LEFT JOIN player_summary ps
          ON ps.player_id = player.id
         AND ps.call_type = h.call_type
         AND ps.tricks IS NOT DISTINCT FROM h.tricks
         AND ps.depth = h.depth
      ) AS by_player
    FROM hand_summary h
  )
  SELECT jsonb_build_object(
    'players', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('id', p.id, 'name', p.display_name)
        ORDER BY p.display_name, p.id
      ) FROM participating_players p
    ), '[]'::jsonb),
    'hands', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'label', h.label,
          'call_type', h.call_type,
          'is_solo', h.is_solo,
          'count', h.total_count,
          'average', h.total_average,
          'players', h.by_player
        )
        ORDER BY
          CASE WHEN h.is_solo THEN 1 ELSE 0 END,
          COALESCE(h.tricks, 0),
          CASE h.call_type
            WHEN 'almindelig' THEN 1
            WHEN 'gode' THEN 2
            WHEN 'halve' THEN 3
            WHEN 'vip' THEN 4
            WHEN 'sol' THEN 1
            WHEN 'ren_sol' THEN 2
            WHEN 'bordlaegger' THEN 3
            WHEN 'ren_bordlaegger' THEN 4
            ELSE 99 END,
          h.depth
      ) FROM hand_rows h
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_hands_statistics_for_notes(uuid[],boolean,boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_hands_statistics_for_notes(uuid[],boolean,boolean)
  TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

SELECT to_regprocedure('public.get_hands_statistics_for_notes(uuid[],boolean,boolean)')
  AS hands_statistics_function;
