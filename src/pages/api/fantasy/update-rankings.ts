import type { APIRoute } from "astro";
import { calculateAndCacheRankings } from "../../../lib/fantasy-ranking-cache";

/**
 * POST /api/fantasy/update-rankings
 * Endpoint para forzar la actualización del caché de rankings
 * Útil para llamar periódicamente o después de cambios importantes
 */
export const POST: APIRoute = async () => {
    try {
        console.log('🔄 Iniciando actualización de rankings...');
        
        const rankings = await calculateAndCacheRankings();
        
        return new Response(
            JSON.stringify({
                success: true,
                message: `Rankings actualizados: ${rankings.length} equipos`,
                totalTeams: rankings.length,
                updatedAt: new Date().toISOString(),
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
    } catch (error) {
        console.error("❌ Error actualizando rankings:", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : "Error desconocido al actualizar rankings",
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
};

/**
 * GET /api/fantasy/update-rankings
 * También permite actualizar mediante GET (útil para cron jobs)
 */
export const GET: APIRoute = async () => {
    return POST({} as any);
};

