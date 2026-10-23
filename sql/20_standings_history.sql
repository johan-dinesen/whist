-- Whist v0.2.6 · Stillingshistorik.
-- Requires existing scoring view public.game_player_payouts, and the
-- historical metadata columns introduced by the Slettestrand 2023 import.
-- READ-ONLY. Does not alter existing games or scores.
-- Returns a single JSON object to avoid PostgREST's default 1,000-row cap.
-- Filters match the existing Stilling, Meldingsstatistik and Synergi RPCs.
-- Chronology:
--   1. played_at if actually recorded;
--   2. otherwise Jan 1 of played_year ONLY AS A SORTING KEY;
--   3. otherwise created_at (fallback for records without a known year).
-- Slettestrand 2023 unknown-time games sort in original legacy_row order.
-- Neither a synthetic played_at nor fake times are written to the database.

BEGIN;

DROP FUNCTION IF EXISTS public.get_standings_history_for_notes(uuid[], boolean, boolean);

CREATE FUNCTION public.get_standings_history_for_notes(
  p_tournament_ids uuid[] DEFAULT NULL,
  p_include_kredsspil boolean DEFAULT true,
  p_include_guests boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  -- Anonymous Auth sessions may read the graph without a registration password.
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

  WITH eligible_games AS (
    SELECT g.id, g.created_at, g.legacy_row,
      COALESCE(
        g.played_at,
        CASE WHEN g.played_year IS NOT NULL
          THEN make_timestamptz(g.played_year, 1, 1, 0, 0, 0, 'UTC')
          ELSE NULL::timestamptz END,
        g.created_at
      ) AS sort_at
    FROM public.games g
    WHERE (
      p_tournament_ids IS NULL
      OR g.tournament_id = ANY(p_tournament_ids)
      OR (g.tournament_id IS NULL AND COALESCE(p_include_kredsspil, false))
    )
    AND (
      COALESCE(p_include_guests, false)
      OR NOT EXISTS (
        SELECT 1 FROM public.game_participants participant
        WHERE participant.game_id = g.id AND participant.was_guest
      )
    )
  ),
  ordered_games AS (
    SELECT e.id,
      row_number() OVER (
        ORDER BY e.sort_at ASC NULLS LAST,
                 e.legacy_row ASC NULLS LAST,
                 e.created_at ASC NULLS LAST,
                 e.id ASC
      )::integer AS game_index
    FROM eligible_games e
  ),
  included_players AS (
    SELECT DISTINCT p.id, p.display_name
    FROM ordered_games og
    JOIN public.game_participants gp ON gp.game_id = og.id
    JOIN public.players p ON p.id = gp.player_id
  ),
  game_payouts AS (
    SELECT og.game_index,
      jsonb_agg(
        jsonb_build_object('player_id', paid.player_id, 'points', paid.payout)
        ORDER BY paid.seat
      ) AS payouts
    FROM ordered_games og
    JOIN public.game_player_payouts paid ON paid.game_id = og.id
    GROUP BY og.game_index
  )
  SELECT jsonb_build_object(
    'game_count', (SELECT count(*) FROM ordered_games),
    'players', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('id', p.id, 'name', p.display_name)
        ORDER BY p.display_name, p.id
      ) FROM included_players p
    ), '[]'::jsonb),
    'games', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('index', gp.game_index, 'payouts', gp.payouts)
        ORDER BY gp.game_index
      ) FROM game_payouts gp
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_standings_history_for_notes(uuid[],boolean,boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_standings_history_for_notes(uuid[],boolean,boolean)
  TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

-- Expect a non-NULL function name:
SELECT to_regprocedure('public.get_standings_history_for_notes(uuid[],boolean,boolean)')
  AS standings_history_function;
