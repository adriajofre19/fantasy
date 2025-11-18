import type { APIRoute } from "astro";
import { calculateRankings } from "../../../lib/fantasy-ranking";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/fantasy/ranking
 * Obtiene la clasificación de todos los equipos basándose en puntos históricos
 * Los puntos se cuentan solo cuando el jugador está fichado en el equipo
 * Muestra TODOS los usuarios autenticados, incluso si no tienen equipo
 */
export const GET: APIRoute = async ({ request }) => {
    try {
        console.log('🔄 Iniciando cálculo de clasificación...');
        
        // Obtener todos los usuarios autenticados usando el servicio admin
        let allUsers: Array<{ id: string; email: string | undefined; displayName: string | undefined }> = [];
        
        try {
            // Intentar obtener SERVICE_ROLE_KEY de las variables de entorno
            const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
            
            if (!serviceRoleKey) {
                console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY no está configurada. Solo se mostrarán usuarios con equipos.');
                console.warn('💡 Para mostrar todos los usuarios, configura SUPABASE_SERVICE_ROLE_KEY en tus variables de entorno.');
            } else {
                // Crear cliente admin para obtener todos los usuarios
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
                
                const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
                
                if (!usersError && usersData?.users) {
                    allUsers = usersData.users.map(user => ({
                        id: user.id,
                        email: user.email,
                        displayName: user.user_metadata?.full_name || 
                                    user.user_metadata?.name || 
                                    user.user_metadata?.display_name ||
                                    user.email?.split('@')[0] || 
                                    'Usuario'
                    }));
                    console.log(`👥 Usuarios autenticados encontrados: ${allUsers.length}`);
                } else {
                    console.warn('⚠️ No se pudieron obtener usuarios desde auth.admin:', usersError?.message);
                    console.warn('   Usando solo usuarios que tienen equipos.');
                }
            }
        } catch (adminError) {
            console.warn('⚠️ Error obteniendo usuarios con admin API:', adminError);
            console.warn('   Continuando con solo usuarios que tienen equipos.');
        }
        
        // Calcular rankings (esto obtiene usuarios desde user_teams)
        const rankings = await calculateRankings();
        console.log(`✅ Clasificación calculada: ${rankings.length} equipos`);
        
        // Crear un mapa de rankings por userId para facilitar la búsqueda
        const rankingsMap = new Map<string, typeof rankings[0]>();
        rankings.forEach(r => {
            rankingsMap.set(r.userId, r);
        });
        
        // Agregar usuarios que no tienen equipos (con 0 puntos)
        if (allUsers.length > 0) {
            allUsers.forEach(user => {
                if (!rankingsMap.has(user.id)) {
                    // Usuario sin equipo - crear un nombre de equipo basado en su información
                    const teamName = user.displayName || 
                                   (user.email ? `Equipo de ${user.email.split('@')[0]}` : 'Usuario') ||
                                   'Usuario';
                    
                    rankings.push({
                        userId: user.id,
                        teamId: `user-${user.id}`, // ID temporal para usuarios sin equipo
                        teamName: teamName,
                        totalPoints: 0,
                        weeklyBreakdown: new Map(),
                    });
                } else {
                    // Actualizar el nombre del equipo con el display name si está disponible y es mejor
                    const ranking = rankingsMap.get(user.id);
                    if (ranking && user.displayName) {
                        // Si el nombre actual es genérico (empieza con "Equipo de"), usar el display name
                        if (ranking.teamName.startsWith('Equipo de ') || ranking.teamName === 'Usuario') {
                            ranking.teamName = user.displayName;
                        }
                    }
                }
            });
        }
        
        // Reordenar después de agregar usuarios sin equipos
        rankings.sort((a, b) => {
            // Primero por puntos (descendente)
            if (b.totalPoints !== a.totalPoints) {
                return b.totalPoints - a.totalPoints;
            }
            // Si tienen los mismos puntos, ordenar alfabéticamente por nombre
            return a.teamName.localeCompare(b.teamName);
        });
        
        if (rankings.length > 0) {
            console.log('📊 Resumen de puntos:');
            rankings.forEach((r, index) => {
                console.log(`  ${index + 1}. ${r.teamName}: ${r.totalPoints} puntos`);
            });
        } else {
            console.warn('⚠️ No se encontraron usuarios en la clasificación');
        }

        return new Response(
            JSON.stringify({
                success: true,
                totalUsers: rankings.length,
                rankings: rankings.map(r => ({
                    userId: r.userId,
                    teamId: r.teamId,
                    teamName: r.teamName,
                    totalPoints: r.totalPoints || 0,
                    weeklyBreakdown: Object.fromEntries(r.weeklyBreakdown),
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
        console.error("❌ Error obteniendo clasificación:", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : "Error desconocido al obtener clasificación",
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
};

