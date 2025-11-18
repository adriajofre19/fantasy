import type { APIRoute } from "astro";
import { getPlayerSeasonStatsFromNBA } from "../../../lib/rapidapi-nba";

/**
 * GET /api/nba/player-stats
 * Obtiene las estadísticas de temporada de un jugador desde la API oficial de la NBA
 * 
 * Query params:
 * - playerId: (requerido) ID del jugador (PERSON_ID de la NBA)
 * - season: (opcional) Temporada en formato '2025-26', por defecto '2025-26'
 */
export const GET: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const playerIdParam = url.searchParams.get("playerId");
        const seasonParam = url.searchParams.get("season") || "2025-26";

        if (!playerIdParam) {
            return new Response(
                JSON.stringify({ error: "El parámetro 'playerId' es requerido" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const playerId = parseInt(playerIdParam, 10);

        if (isNaN(playerId)) {
            return new Response(
                JSON.stringify({ error: "El parámetro 'playerId' debe ser un número válido" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const stats = await getPlayerSeasonStatsFromNBA(playerId, seasonParam);

        if (!stats) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: "No se encontraron estadísticas para este jugador en la temporada especificada",
                }),
                {
                    status: 404,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        return new Response(
            JSON.stringify({
                success: true,
                ...stats,
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
    } catch (error) {
        console.error("Error obteniendo estadísticas del jugador:", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : "Error desconocido al obtener estadísticas",
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
};

