import type { APIRoute } from "astro";
import { getPlayerOwnershipPeriods } from "../../../lib/fantasy-ranking";
import { getPlayerAllGameLogs } from "../../../lib/fantasy-ranking";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/fantasy/debug-rankings
 * Endpoint de debug para ver qué está pasando con los rankings
 */
export const GET: APIRoute = async () => {
    try {
        const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_ANON_KEY;
        
        const supabaseAdmin = createClient(
            import.meta.env.SUPABASE_URL,
            serviceRoleKey,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        // Obtener equipos
        const { data: teams, error: teamsError } = await supabaseAdmin
            .from('user_teams')
            .select('id, user_id, team_name')
            .limit(5);

        // Obtener jugadores en equipos
        const { data: players, error: playersError } = await supabaseAdmin
            .from('players_on_team')
            .select('player_id, player_name, purchased_at, team_id')
            .limit(10);

        // Obtener períodos de propiedad
        const ownershipPeriods = await getPlayerOwnershipPeriods();

        // Obtener game logs de ejemplo (primer jugador)
        let gameLogsExample: any = null;
        if (players && players.length > 0) {
            const firstPlayerId = players[0].player_id;
            gameLogsExample = await getPlayerAllGameLogs(firstPlayerId);
        }

        return new Response(
            JSON.stringify({
                success: true,
                debug: {
                    teams: {
                        count: teams?.length || 0,
                        data: teams || [],
                        error: teamsError?.message,
                    },
                    players: {
                        count: players?.length || 0,
                        data: players || [],
                        error: playersError?.message,
                    },
                    ownershipPeriods: {
                        count: ownershipPeriods.length,
                        sample: ownershipPeriods.slice(0, 3),
                    },
                    gameLogsExample: {
                        playerId: players?.[0]?.player_id,
                        playerName: players?.[0]?.player_name,
                        gameLogsCount: gameLogsExample?.length || 0,
                        sampleGameLogs: gameLogsExample?.slice(0, 5) || [],
                    },
                },
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
    } catch (error) {
        console.error("❌ Error en debug:", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : "Error desconocido",
                stack: error instanceof Error ? error.stack : undefined,
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
};

