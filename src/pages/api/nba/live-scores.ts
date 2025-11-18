import type { APIRoute } from "astro";
import { getLiveScores } from "../../../lib/rapidapi-nba";

/**
 * GET /api/nba/live-scores
 * Obtiene los scores en vivo de los partidos que se están jugando actualmente
 */
export const GET: APIRoute = async () => {
    try {
        const data = await getLiveScores();

        return new Response(
            JSON.stringify({
                success: true,
                total: data.results,
                games: data.response.map((game) => ({
                    gameId: game.id,
                    status: {
                        long: game.status.long,
                        short: game.status.short,
                        timer: game.status.timer,
                    },
                    period: {
                        current: game.periods.current,
                        total: game.periods.total,
                        endOfPeriod: game.periods.endOfPeriod,
                    },
                    date: game.date.start,
                    arena: {
                        name: game.arena.name,
                        city: game.arena.city,
                        state: game.arena.state,
                        country: game.arena.country,
                    },
                    teams: {
                        visitors: {
                            id: game.teams.visitors.id,
                            name: game.teams.visitors.name,
                            nickname: game.teams.visitors.nickname,
                            code: game.teams.visitors.code,
                            logo: game.teams.visitors.logo,
                            points: game.scores.visitors.points,
                            wins: game.scores.visitors.win,
                            losses: game.scores.visitors.loss,
                            linescore: game.scores.visitors.linescore,
                        },
                        home: {
                            id: game.teams.home.id,
                            name: game.teams.home.name,
                            nickname: game.teams.home.nickname,
                            code: game.teams.home.code,
                            logo: game.teams.home.logo,
                            points: game.scores.home.points,
                            wins: game.scores.home.win,
                            losses: game.scores.home.loss,
                            linescore: game.scores.home.linescore,
                        },
                    },
                    league: {
                        name: game.league.name,
                        season: game.league.season,
                    },
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
        console.error("Error obteniendo scores en vivo:", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : "Error desconocido al obtener scores en vivo",
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
};

