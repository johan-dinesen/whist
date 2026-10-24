-- Pointkilder: positive/negative net-point contributions by a player's role.
-- Run AFTER 16_standings.sql and 05_scoring_history.sql.
-- Read-only RPC; does not modify games, participants, payouts or permissions elsewhere.
-- Role definitions:
--   Melder: ordinary call, is_caller (including self-partner legacy cases)
--   Makker: ordinary call, partner but not caller
--   Modstander: non-team player in ordinary games and non-caller in solo games
--   Solospil: a caller in Sol / Ren Sol / Bordlægger / Ren Bordlægger
-- In multi-caller solo games, each participant's *entire net payout* for
-- that physical game goes in one category according to their game role.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_point_sources_for_notes(
  p_tournament_ids uuid[] DEFAULT NULL,
  p_include_kredsspil boolean DEFAULT true,
  p_include_guests boolean DEFAULT false
)
RETURNS TABLE (
  player_id uuid,
  player_name text,
  is_guest boolean,
  source_role text,
  games_played bigint,
  net_points numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
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

  RETURN QUERY
    WITH eligible_games AS (
      SELECT g.id, g.call_type
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
    ), categorized AS (
      SELECT
        p.player_id,
        p.player_name,
        p.is_guest,
        p.payout,
        CASE
          WHEN e.call_type IN ('sol','ren_sol','bordlaegger','ren_bordlaegger')
            THEN CASE WHEN p.is_caller THEN 'solo' ELSE 'opponent' END
          WHEN p.is_caller THEN 'caller'
          WHEN p.is_partner THEN 'partner'
          ELSE 'opponent'
        END AS role_key
      FROM public.game_player_payouts p
      JOIN eligible_games e ON e.id = p.game_id
    )
    SELECT
      c.player_id,
      MAX(c.player_name)::text AS player_name,
      BOOL_OR(c.is_guest) AS is_guest,
      c.role_key::text AS source_role,
      COUNT(*)::bigint AS games_played,
      ROUND(SUM(c.payout), 2)::numeric AS net_points
    FROM categorized c
    GROUP BY c.player_id, c.role_key
    ORDER BY MAX(c.player_name), c.role_key;
END;
$$;

REVOKE ALL ON FUNCTION public.get_point_sources_for_notes(uuid[], boolean, boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_point_sources_for_notes(uuid[], boolean, boolean)
  TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

SELECT to_regprocedure('public.get_point_sources_for_notes(uuid[],boolean,boolean)') AS point_sources_function;
