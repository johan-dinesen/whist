-- Whist v0.2.5: Synergi / partnership matrix.
-- Run AFTER 05_scoring_history.sql, 16_standings.sql and 18_ordinary_deviation_only.sql.
-- Read-only RPC: does not insert, update or delete any games.
-- Includes all players who participated in >=1 qualifying game, even if they
-- never called / partnered in an ordinary game.
-- Only Almindelig, Gode, Halve, Vip can form a partnership; solo calls do not.
-- A caller who is their own partner is a diagonal, one-versus-three observation.
-- Score = CALLER'S actual net payout, via public.game_player_payouts.
-- Symmetric output includes n*n pairs (missing pairs: 0 games, NULL average).

BEGIN;

DROP FUNCTION IF EXISTS public.get_synergy_for_notes(uuid[],boolean,boolean);

CREATE FUNCTION public.get_synergy_for_notes(
  p_tournament_ids uuid[] DEFAULT NULL,
  p_include_kredsspil boolean DEFAULT true,
  p_include_guests boolean DEFAULT false
)
RETURNS TABLE (
  row_player_id uuid,
  row_player_name text,
  col_player_id uuid,
  col_player_name text,
  games_together bigint,
  average_points numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Kunne ikke oprette en læsesession';
  END IF;

  IF p_tournament_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_tournament_ids) AS requested(id)
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
        SELECT 1 FROM public.game_participants member
        WHERE member.game_id = g.id AND member.was_guest
      )
    )
  ),
  participating_players AS (
    SELECT DISTINCT player.id, player.display_name
    FROM eligible_games game
    JOIN public.game_participants gp ON gp.game_id = game.id
    JOIN public.players player ON player.id = gp.player_id
  ),
  partnership_scores AS (
    SELECT
      LEAST(caller.player_id, partner.player_id) AS first_player,
      GREATEST(caller.player_id, partner.player_id) AS second_player,
      COUNT(*)::bigint AS sample_size,
      ROUND(AVG(caller_payout.payout), 2)::numeric AS mean_payout
    FROM eligible_games game
    JOIN public.game_participants caller
      ON caller.game_id = game.id AND caller.is_caller
    JOIN public.game_participants partner
      ON partner.game_id = game.id AND partner.is_partner
    JOIN public.game_player_payouts caller_payout
      ON caller_payout.game_id = game.id
      AND caller_payout.player_id = caller.player_id
    WHERE game.call_type IN ('almindelig', 'gode', 'halve', 'vip')
    GROUP BY 1,2
  )
  SELECT
    row_player.id,
    row_player.display_name::text,
    col_player.id,
    col_player.display_name::text,
    COALESCE(partnership.sample_size, 0)::bigint,
    partnership.mean_payout
  FROM participating_players row_player
  CROSS JOIN participating_players col_player
  LEFT JOIN partnership_scores partnership
    ON partnership.first_player = LEAST(row_player.id, col_player.id)
   AND partnership.second_player = GREATEST(row_player.id, col_player.id)
  ORDER BY row_player.display_name, col_player.display_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_synergy_for_notes(uuid[],boolean,boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_synergy_for_notes(uuid[],boolean,boolean)
  TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

-- Expected: non-null signature. Run after the migration.
SELECT to_regprocedure('public.get_synergy_for_notes(uuid[],boolean,boolean)') AS synergy_function;
