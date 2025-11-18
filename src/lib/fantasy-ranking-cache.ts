/**
 * Funciones para gestionar el caché de rankings en la base de datos
 */

import { supabase } from './supabase';
import { calculateRankings, type TeamRanking } from './fantasy-ranking';

/**
 * Guarda los rankings calculados en la base de datos
 */
export async function saveRankingsToCache(rankings: TeamRanking[]): Promise<boolean> {
    try {
        const { createClient } = await import('@supabase/supabase-js');
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

        // Preparar datos para insertar/actualizar
        const rankingsData = rankings.map(ranking => ({
            user_id: ranking.userId,
            team_id: ranking.teamId,
            team_name: ranking.teamName,
            total_points: ranking.totalPoints,
            weekly_breakdown: Object.fromEntries(ranking.weeklyBreakdown),
            calculated_at: new Date().toISOString(),
        }));

        // Usar upsert para insertar o actualizar
        const { error } = await supabaseAdmin
            .from('team_rankings_cache')
            .upsert(rankingsData, {
                onConflict: 'user_id,team_id',
            });

        if (error) {
            console.error('❌ Error guardando rankings en caché:', error);
            return false;
        }

        console.log(`✅ Rankings guardados en caché: ${rankingsData.length} equipos`);
        return true;
    } catch (error) {
        console.error('❌ Error en saveRankingsToCache:', error);
        return false;
    }
}

/**
 * Obtiene los rankings desde el caché de la base de datos
 */
export async function getRankingsFromCache(maxAgeMinutes: number = 30): Promise<TeamRanking[] | null> {
    try {
        const { createClient } = await import('@supabase/supabase-js');
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

        // Calcular la fecha mínima para considerar el caché válido
        const minCalculatedAt = new Date();
        minCalculatedAt.setMinutes(minCalculatedAt.getMinutes() - maxAgeMinutes);

        const { data, error } = await supabaseAdmin
            .from('team_rankings_cache')
            .select('*')
            .gte('calculated_at', minCalculatedAt.toISOString())
            .order('total_points', { ascending: false });

        if (error) {
            console.error('❌ Error obteniendo rankings desde caché:', error);
            return null;
        }

        if (!data || data.length === 0) {
            console.log('📭 No hay rankings en caché o están expirados');
            return null;
        }

        // Convertir a formato TeamRanking
        const rankings: TeamRanking[] = data.map(row => ({
            userId: row.user_id,
            teamId: row.team_id,
            teamName: row.team_name,
            totalPoints: parseFloat(row.total_points) || 0,
            weeklyBreakdown: new Map(Object.entries(row.weekly_breakdown || {}).map(([week, points]) => [
                parseInt(week),
                typeof points === 'number' ? points : parseFloat(points as string) || 0
            ])),
        }));

        console.log(`✅ Rankings obtenidos desde caché: ${rankings.length} equipos (calculados hace ${Math.round((Date.now() - new Date(data[0].calculated_at).getTime()) / 60000)} minutos)`);
        return rankings;
    } catch (error) {
        console.error('❌ Error en getRankingsFromCache:', error);
        return null;
    }
}

/**
 * Calcula y guarda los rankings en caché
 * Esta función puede ser llamada periódicamente o cuando se necesite actualizar
 */
export async function calculateAndCacheRankings(): Promise<TeamRanking[]> {
    console.log('🔄 Calculando rankings y guardando en caché...');
    
    // Calcular rankings
    const rankings = await calculateRankings();
    
    // Guardar en caché
    await saveRankingsToCache(rankings);
    
    return rankings;
}

/**
 * Obtiene rankings, usando caché si está disponible y no está expirado
 * Si no hay caché válido, calcula y guarda en caché
 */
export async function getRankingsWithCache(maxAgeMinutes: number = 30): Promise<TeamRanking[]> {
    // Intentar obtener desde caché
    const cachedRankings = await getRankingsFromCache(maxAgeMinutes);
    
    if (cachedRankings) {
        return cachedRankings;
    }
    
    // Si no hay caché válido, calcular y guardar
    console.log('📊 Caché no disponible o expirado, calculando rankings...');
    return await calculateAndCacheRankings();
}

