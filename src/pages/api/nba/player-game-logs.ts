import type { APIRoute } from "astro";

/**
 * GET /api/nba/player-game-logs
 * Obtiene los game logs de un jugador para calcular puntos diarios y semanales
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

        // Headers necesarios para la API de la NBA
        const nbaHeaders = {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.nba.com/',
            'Origin': 'https://www.nba.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        };

        // Endpoint para obtener game logs
        const gameLogsUrl = `https://stats.nba.com/stats/playergamelog?DateFrom=&DateTo=&LeagueID=00&PlayerID=${playerId}&Season=${seasonParam}&SeasonType=Regular%20Season`;
        
        const response = await fetch(gameLogsUrl, {
            headers: nbaHeaders,
        });

        if (!response.ok) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: `Error HTTP: ${response.status}`,
                }),
                {
                    status: response.status,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        const data = await response.json();

        if (!data.resultSets || data.resultSets.length === 0) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: "No se encontraron game logs para este jugador",
                }),
                {
                    status: 404,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        const gameLogs = data.resultSets[0];
        const headers = gameLogs.headers || [];
        const rows = gameLogs.rowSet || [];

        // Encontrar índices de columnas importantes
        const gameDateIdx = headers.indexOf('GAME_DATE');
        const ptsIdx = headers.indexOf('PTS');

        if (gameDateIdx === -1 || ptsIdx === -1) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: "Estructura de datos inesperada",
                }),
                {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        // Procesar game logs
        const games = rows.map((row: any[]) => ({
            date: row[gameDateIdx],
            points: parseInt(row[ptsIdx]) || 0,
        })).sort((a, b) => {
            // Ordenar por fecha descendente (más reciente primero)
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        });

        // Calcular puntos diarios (último partido)
        const dailyPoints = games.length > 0 ? games[0].points : 0;
        const lastGameDate = games.length > 0 ? games[0].date : null;

        // Calcular puntos semanales (últimos 7 días)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const weeklyGames = games.filter(game => {
            const gameDate = new Date(game.date);
            return gameDate >= sevenDaysAgo;
        });
        
        const weeklyPoints = weeklyGames.reduce((sum, game) => sum + game.points, 0);

        return new Response(
            JSON.stringify({
                success: true,
                dailyPoints,
                weeklyPoints,
                lastGameDate,
                totalGames: games.length,
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
    } catch (error) {
        console.error("Error obteniendo game logs del jugador:", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : "Error desconocido al obtener game logs",
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
};

