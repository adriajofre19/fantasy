import type { APIRoute } from "astro";
import { getPlayers } from "../../../lib/rapidapi-nba";

/**
 * GET /api/nba/players
 * Obtiene todos los jugadores activos de la temporada 2025-2026
 * 
 * Query params:
 * - season: (opcional) Año de la temporada, por defecto 2025
 */
export const GET: APIRoute = async ({ request }) => {
    try {
        const url = new URL(request.url);
        const seasonParam = url.searchParams.get("season");
        const season = seasonParam ? parseInt(seasonParam, 10) : 2025;

        if (isNaN(season)) {
            return new Response(
                JSON.stringify({ error: "El parámetro 'season' debe ser un número válido" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const data = await getPlayers(season);

        // Filtrar solo jugadores activos
        const activePlayers = data.response.filter(
            (player) => player.leagues?.standard?.active === true
        );

        return new Response(
            JSON.stringify({
                success: true,
                season,
                total: activePlayers.length,
                players: activePlayers.map((player) => ({
                    id: player.id,
                    firstName: player.firstname,
                    lastName: player.lastname,
                    fullName: `${player.firstname} ${player.lastname}`,
                    position: player.leagues?.standard?.pos || "N/A",
                    jerseyNumber: player.leagues?.standard?.jersey || null,
                    height: player.height,
                    weight: player.weight,
                    birthDate: player.birth?.date || null,
                    country: player.birth?.country || null,
                    college: player.college || null,
                    nbaStartYear: player.nba?.start || null,
                })),
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
    } catch (error) {
        console.error("Error obteniendo jugadores:", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : "Error desconocido al obtener jugadores",
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
};

