/**
 * Funciones para calcular la clasificación basándose en puntos históricos
 * Los puntos se cuentan solo cuando el jugador está fichado en el equipo del usuario
 */

import { supabase } from './supabase';

export interface PlayerGameLog {
    date: string;
    points: number;
}

export interface PlayerOwnershipPeriod {
    userId: string;
    teamId: string;
    playerId: number;
    playerName: string;
    purchaseDate: Date;
    saleDate: Date | null;
}

export interface WeeklyPoints {
    weekNumber: number;
    weekStartDate: Date;
    weekEndDate: Date;
    points: number;
}

/**
 * Obtiene todos los game logs de un jugador desde la API de la NBA
 */
export async function getPlayerAllGameLogs(
    playerId: number,
    season: string = '2025-26'
): Promise<PlayerGameLog[]> {
    try {
        const nbaHeaders = {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.nba.com/',
            'Origin': 'https://www.nba.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        };

        const gameLogsUrl = `https://stats.nba.com/stats/playergamelog?DateFrom=&DateTo=&LeagueID=00&PlayerID=${playerId}&Season=${season}&SeasonType=Regular%20Season`;
        
        const response = await fetch(gameLogsUrl, {
            headers: nbaHeaders,
        });

        if (!response.ok) {
            console.error(`Error obteniendo game logs para jugador ${playerId}: ${response.status}`);
            return [];
        }

        const data = await response.json();

        if (!data.resultSets || data.resultSets.length === 0) {
            return [];
        }

        const gameLogs = data.resultSets[0];
        const headers = gameLogs.headers || [];
        const rows = gameLogs.rowSet || [];

        const gameDateIdx = headers.indexOf('GAME_DATE');
        const ptsIdx = headers.indexOf('PTS');

        if (gameDateIdx === -1 || ptsIdx === -1) {
            return [];
        }

        const games = rows.map((row: any[]) => ({
            date: row[gameDateIdx],
            points: parseInt(row[ptsIdx]) || 0,
        })).sort((a, b) => {
            // Ordenar por fecha ascendente (más antiguo primero)
            return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

        // Log para debugging - mostrar formato de fecha recibido
        if (games.length > 0) {
            console.log(`📋 Game logs obtenidos para jugador ${playerId}: ${games.length} partidos`);
            console.log(`   - Formato de fecha del primer partido: "${games[0].date}"`);
            console.log(`   - Formato de fecha del último partido: "${games[games.length - 1].date}"`);
        }

        return games;
    } catch (error) {
        console.error(`Error obteniendo game logs para jugador ${playerId}:`, error);
        return [];
    }
}

/**
 * Normaliza una fecha a medianoche en UTC para comparaciones consistentes
 * Maneja diferentes formatos de fecha de la NBA API (YYYY-MM-DD, MM/DD/YYYY, MMM DD YYYY, etc.)
 */
function normalizeDate(date: Date | string): Date {
    let d: Date;
    const originalDate = date;
    
    if (typeof date === 'string') {
        // La NBA API puede devolver fechas en varios formatos:
        // - "YYYY-MM-DD"
        // - "MM/DD/YYYY"
        // - "MMM DD, YYYY" (ej: "Oct 22, 2025")
        // - "YYYYMMDD" (formato numérico)
        
        // Intentar parsear formato "MMM DD, YYYY" primero (ej: "Oct 22, 2025")
        const mmmDdYyyyMatch = date.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/);
        if (mmmDdYyyyMatch) {
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                               'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const month = monthNames.indexOf(mmmDdYyyyMatch[1]);
            const day = parseInt(mmmDdYyyyMatch[2]);
            const year = parseInt(mmmDdYyyyMatch[3]);
            if (month !== -1) {
                d = new Date(year, month, day);
            } else {
                d = new Date(date);
            }
        } else if (date.includes('/')) {
            // Formato MM/DD/YYYY
            const parts = date.split('/');
            if (parts.length === 3) {
                d = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
            } else {
                d = new Date(date);
            }
        } else if (/^\d{8}$/.test(date)) {
            // Formato YYYYMMDD (numérico)
            const year = parseInt(date.substring(0, 4));
            const month = parseInt(date.substring(4, 6)) - 1;
            const day = parseInt(date.substring(6, 8));
            d = new Date(year, month, day);
        } else {
            // Formato YYYY-MM-DD o ISO
            d = new Date(date);
        }
    } else {
        d = date;
    }
    
    // Validar que la fecha es válida
    if (isNaN(d.getTime())) {
        console.warn(`⚠️ Fecha inválida detectada: "${originalDate}"`);
        return new Date(Date.UTC(1970, 0, 1)); // Fecha por defecto muy antigua
    }
    
    // Crear una nueva fecha solo con año, mes y día (sin hora) en UTC
    const normalized = new Date(Date.UTC(
        d.getFullYear(),
        d.getMonth(),
        d.getDate()
    ));
    
    return normalized;
}

/**
 * Calcula el número de semana basándose en una fecha
 * Las semanas empiezan el lunes
 */
export function getWeekNumber(date: Date, seasonStartDate: Date = new Date('2024-10-22')): number {
    const normalizedDate = normalizeDate(date);
    const normalizedStart = normalizeDate(seasonStartDate);
    const diffTime = normalizedDate.getTime() - normalizedStart.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const weekNumber = Math.floor(diffDays / 7) + 1;
    return Math.max(1, weekNumber);
}

/**
 * Obtiene la fecha de inicio y fin de una semana
 */
export function getWeekDates(weekNumber: number, seasonStartDate: Date = new Date('2024-10-22')): { start: Date; end: Date } {
    const startDays = (weekNumber - 1) * 7;
    const start = new Date(seasonStartDate);
    start.setDate(start.getDate() + startDays);
    
    // Ajustar al lunes de esa semana
    const dayOfWeek = start.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    start.setDate(start.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    
    return { start, end };
}

/**
 * Obtiene todos los períodos de propiedad de jugadores (cuándo cada usuario tenía fichado a cada jugador)
 */
export async function getPlayerOwnershipPeriods(): Promise<PlayerOwnershipPeriod[]> {
    try {
        console.log('🔄 Obteniendo períodos de propiedad de jugadores...');
        
        // Crear cliente admin para obtener todos los datos (saltarse RLS)
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
        
        // Obtener todos los jugadores actuales en equipos con sus fechas de compra
        const { data: playersOnTeam, error: playersError } = await supabaseAdmin
            .from('players_on_team')
            .select(`
                id,
                team_id,
                player_id,
                player_name,
                purchased_at,
                created_at,
                team:user_teams!inner(user_id)
            `)
            .order('purchased_at', { ascending: true })
            .order('created_at', { ascending: true });

        if (playersError) {
            console.error('❌ Error obteniendo jugadores:', playersError);
            return [];
        }

        console.log(`📋 Jugadores encontrados en equipos: ${playersOnTeam?.length || 0}`);

        // Obtener todas las transacciones de compra ordenadas por fecha
        const { data: transactions, error: transactionsError } = await supabaseAdmin
            .from('transactions')
            .select(`
                *,
                buyer_team:user_teams!buyer_team_id(user_id),
                seller_team:user_teams!seller_team_id(user_id)
            `)
            .eq('transaction_type', 'purchase')
            .order('created_at', { ascending: true });

        if (transactionsError) {
            console.error('❌ Error obteniendo transacciones:', transactionsError);
        } else {
            console.log(`💰 Transacciones encontradas: ${transactions?.length || 0}`);
        }

        const periods: PlayerOwnershipPeriod[] = [];
        
        // Crear un mapa para rastrear el historial completo de cada jugador
        // playerId -> Array de períodos ordenados por fecha de compra
        const playerHistoryMap = new Map<number, Array<{
            userId: string;
            teamId: string;
            purchaseDate: Date;
            saleDate: Date | null;
        }>>();

        // Paso 1: Procesar todas las transacciones para construir el historial completo
        if (transactions && transactions.length > 0) {
            console.log(`🔄 Procesando ${transactions.length} transacciones...`);
            
            transactions.forEach((transaction) => {
                const buyerTeam = transaction.buyer_team as any;
                const sellerTeam = transaction.seller_team as any;
                
                const buyerUserId = buyerTeam?.user_id;
                const sellerUserId = sellerTeam?.user_id;
                
                if (!buyerUserId || !sellerUserId) {
                    console.warn(`⚠️ Saltando transacción ${transaction.id}: buyerUserId o sellerUserId faltante`);
                    return;
                }

                const playerId = transaction.player_id;
                const transactionDate = new Date(transaction.created_at);

                // Obtener o crear el historial para este jugador
                if (!playerHistoryMap.has(playerId)) {
                    playerHistoryMap.set(playerId, []);
                }
                const history = playerHistoryMap.get(playerId)!;

                // Marcar la venta del período anterior (si existe)
                const previousPeriod = history.find(p => 
                    p.userId === sellerUserId && 
                    p.teamId === transaction.seller_team_id &&
                    p.saleDate === null
                );
                if (previousPeriod) {
                    previousPeriod.saleDate = transactionDate;
                }

                // Agregar el nuevo período de propiedad para el comprador
                history.push({
                    userId: buyerUserId,
                    teamId: transaction.buyer_team_id,
                    purchaseDate: transactionDate,
                    saleDate: null, // Se actualizará si hay una venta posterior
                });
            });
        }

        // Paso 2: Para cada jugador actual en players_on_team, crear o actualizar períodos
        if (playersOnTeam && playersOnTeam.length > 0) {
            console.log(`🔄 Procesando ${playersOnTeam.length} jugadores actuales...`);
            
            for (const player of playersOnTeam) {
                const teamData = player.team as any;
                const userId = teamData?.user_id;
                
                if (!userId) {
                    console.warn(`⚠️ Saltando jugador ${player.player_name}: userId faltante`);
                    continue;
                }

                const playerId = player.player_id;
                // Usar purchased_at si existe, sino usar created_at
                const purchaseDate = player.purchased_at 
                    ? new Date(player.purchased_at) 
                    : new Date(player.created_at);

                // Obtener el historial de este jugador
                const history = playerHistoryMap.get(playerId) || [];
                
                // Buscar si ya existe un período activo (sin venta) para este usuario y equipo
                const existingActivePeriod = history.find(p => 
                    p.userId === userId && 
                    p.teamId === player.team_id &&
                    p.saleDate === null
                );

                if (existingActivePeriod) {
                    // Ya existe un período activo desde transacciones, usarlo
                    periods.push({
                        userId,
                        teamId: player.team_id,
                        playerId,
                        playerName: player.player_name,
                        purchaseDate: existingActivePeriod.purchaseDate,
                        saleDate: null,
                    });
                } else {
                    // No hay período activo desde transacciones, crear uno nuevo
                    // Esto puede ser un jugador inicial o un jugador agregado directamente
                    periods.push({
                        userId,
                        teamId: player.team_id,
                        playerId,
                        playerName: player.player_name,
                        purchaseDate,
                        saleDate: null,
                    });
                }
            }
        }

        // Paso 3: Agregar períodos históricos terminados (jugadores que fueron vendidos)
        playerHistoryMap.forEach((history, playerId) => {
            // Obtener el nombre del jugador
            const player = playersOnTeam?.find(p => p.player_id === playerId);
            const playerName = player?.player_name || 
                transactions?.find(t => t.player_id === playerId)?.player_name || 
                `Jugador ${playerId}`;

            history.forEach(period => {
                // Solo agregar períodos que ya terminaron (tienen fecha de venta)
                if (period.saleDate) {
                    // Verificar que no esté ya agregado
                    const alreadyAdded = periods.some(p => 
                        p.playerId === playerId &&
                        p.userId === period.userId &&
                        p.teamId === period.teamId &&
                        Math.abs(p.purchaseDate.getTime() - period.purchaseDate.getTime()) < 1000
                    );

                    if (!alreadyAdded) {
                        periods.push({
                            userId: period.userId,
                            teamId: period.teamId,
                            playerId,
                            playerName,
                            purchaseDate: period.purchaseDate,
                            saleDate: period.saleDate,
                        });
                    }
                }
            });
        });

        console.log(`✅ Períodos de propiedad generados: ${periods.length}`);
        
        // Log resumen por usuario
        const userPeriodsMap = new Map<string, number>();
        periods.forEach(p => {
            userPeriodsMap.set(p.userId, (userPeriodsMap.get(p.userId) || 0) + 1);
        });
        
        console.log(`📊 Resumen por usuario:`);
        userPeriodsMap.forEach((count, userId) => {
            console.log(`   - UserId ${userId}: ${count} períodos`);
        });
        
        return periods;
    } catch (error) {
        console.error('❌ Error obteniendo períodos de propiedad:', error);
        return [];
    }
}

/**
 * Calcula los puntos por semana para un período de propiedad
 */
export function calculateWeeklyPoints(
    gameLogs: PlayerGameLog[],
    purchaseDate: Date,
    saleDate: Date | null,
    seasonStartDate: Date = new Date('2024-10-22')
): WeeklyPoints[] {
    const weeklyPointsMap = new Map<number, number>();

    // Normalizar fechas para comparación
    const normalizedPurchaseDate = normalizeDate(purchaseDate);
    const normalizedSaleDate = saleDate ? normalizeDate(saleDate) : null;
    const normalizedSeasonStart = normalizeDate(seasonStartDate);

    // Filtrar game logs que están dentro del período de propiedad
    // Un partido cuenta si ocurre en o después de la fecha de compra, y antes de la fecha de venta (si existe)
    const filteredGames = gameLogs.filter(game => {
        const gameDate = normalizeDate(game.date);
        // Incluir partidos desde la fecha de compra (inclusive)
        const isAfterPurchase = gameDate >= normalizedPurchaseDate;
        // Excluir partidos en o después de la fecha de venta
        const isBeforeSale = normalizedSaleDate === null || gameDate < normalizedSaleDate;
        const isInRange = isAfterPurchase && isBeforeSale;
        return isInRange;
    });
    
    // Log detallado para debugging
    if (gameLogs.length > 0) {
        const firstGame = normalizeDate(gameLogs[0].date);
        const lastGame = normalizeDate(gameLogs[gameLogs.length - 1].date);
        
        console.log(`📅 Filtrado de partidos:`);
        console.log(`   - Fecha compra: ${normalizedPurchaseDate.toISOString().split('T')[0]}`);
        console.log(`   - Fecha venta: ${normalizedSaleDate ? normalizedSaleDate.toISOString().split('T')[0] : 'N/A'}`);
        console.log(`   - Primer partido disponible: ${firstGame.toISOString().split('T')[0]}`);
        console.log(`   - Último partido disponible: ${lastGame.toISOString().split('T')[0]}`);
        console.log(`   - Total partidos disponibles: ${gameLogs.length}`);
        console.log(`   - Partidos filtrados: ${filteredGames.length}`);
        
        if (filteredGames.length > 0) {
            const totalPoints = filteredGames.reduce((sum, game) => sum + game.points, 0);
            console.log(`   ✅ Puntos totales de partidos filtrados: ${totalPoints}`);
        } else {
            console.warn(`   ⚠️ No se filtraron partidos. Verificando razón...`);
            
            // Verificar si hay partidos después de la fecha de compra
            const gamesAfterPurchase = gameLogs.filter(game => {
                const gameDate = normalizeDate(game.date);
                return gameDate >= normalizedPurchaseDate;
            });
            
            if (gamesAfterPurchase.length === 0) {
                console.warn(`   ⚠️ No hay partidos después de la fecha de compra (${normalizedPurchaseDate.toISOString().split('T')[0]})`);
                console.warn(`   ℹ️ El último partido disponible es ${lastGame.toISOString().split('T')[0]}`);
            } else {
                console.warn(`   ⚠️ Hay ${gamesAfterPurchase.length} partidos después de la compra, pero fueron filtrados por la fecha de venta`);
            }
        }
    }

    // Agrupar por semana
    filteredGames.forEach(game => {
        const gameDate = normalizeDate(game.date);
        const weekNumber = getWeekNumber(gameDate, normalizedSeasonStart);
        const currentPoints = weeklyPointsMap.get(weekNumber) || 0;
        weeklyPointsMap.set(weekNumber, currentPoints + game.points);
    });

    // Convertir a array
    const weeklyPoints: WeeklyPoints[] = [];
    weeklyPointsMap.forEach((points, weekNumber) => {
        const { start, end } = getWeekDates(weekNumber, normalizedSeasonStart);
        weeklyPoints.push({
            weekNumber,
            weekStartDate: start,
            weekEndDate: end,
            points,
        });
    });

    return weeklyPoints.sort((a, b) => a.weekNumber - b.weekNumber);
}

/**
 * Calcula la clasificación total de todos los equipos
 */
export interface TeamRanking {
    userId: string;
    teamId: string;
    teamName: string;
    totalPoints: number;
    weeklyBreakdown: Map<number, number>; // weekNumber -> points
}

export async function calculateRankings(): Promise<TeamRanking[]> {
    try {
        console.log('📊 Calculando clasificación...');
        
        // Crear cliente admin para obtener todos los equipos (saltarse RLS)
        // Esto es necesario porque las políticas RLS solo permiten ver el propio equipo
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
        
        // Obtener todos los equipos usando el cliente admin para saltarse RLS
        const { data: teams, error: teamsError } = await supabaseAdmin
            .from('user_teams')
            .select('id, user_id, team_name')
            .order('created_at', { ascending: true });

        if (teamsError) {
            console.error('❌ Error obteniendo equipos:', teamsError);
            return [];
        }

        // Si no hay equipos, retornar array vacío
        if (!teams || teams.length === 0) {
            console.warn('⚠️ No se encontraron equipos');
            return [];
        }

        console.log(`📋 Equipos encontrados: ${teams.length}`);
        teams.forEach((team, index) => {
            console.log(`   ${index + 1}. TeamId: ${team.id}, UserId: ${team.user_id}, Nombre: ${team.team_name}`);
        });

        // Obtener períodos de propiedad
        const ownershipPeriods = await getPlayerOwnershipPeriods();
        console.log(`👥 Períodos de propiedad encontrados: ${ownershipPeriods.length}`);

        if (ownershipPeriods.length === 0) {
            console.warn('⚠️ No se encontraron períodos de propiedad. Verificando jugadores...');
        }

        // Agrupar períodos por jugador para obtener game logs una sola vez por jugador
        const playerIds = [...new Set(ownershipPeriods.map(p => p.playerId))];
        console.log(`🎮 Jugadores únicos a procesar: ${playerIds.length}`);
        
        // Obtener game logs para todos los jugadores únicos
        const playerGameLogsMap = new Map<number, PlayerGameLog[]>();
        await Promise.all(
            playerIds.map(async (playerId) => {
                const gameLogs = await getPlayerAllGameLogs(playerId);
                playerGameLogsMap.set(playerId, gameLogs);
                if (gameLogs.length > 0) {
                    console.log(`  ✓ Jugador ${playerId}: ${gameLogs.length} partidos encontrados`);
                } else {
                    console.warn(`  ⚠ Jugador ${playerId}: No se encontraron partidos`);
                }
            })
        );

        // Calcular puntos por usuario - usar userId como clave principal
        // Crear un mapa por userId para asegurar que cada usuario tenga su ranking
        const userRankingsMap = new Map<string, TeamRanking>();
        const teamIdToUserIdMap = new Map<string, string>(); // Para mapear teamId -> userId

        // Inicializar rankings desde los equipos existentes
        teams.forEach(team => {
            userRankingsMap.set(team.user_id, {
                userId: team.user_id,
                teamId: team.id,
                teamName: team.team_name,
                totalPoints: 0,
                weeklyBreakdown: new Map(),
            });
            teamIdToUserIdMap.set(team.id, team.user_id);
        });

        console.log(`📊 Inicializados ${userRankingsMap.size} usuarios en el ranking`);

        // Procesar cada período de propiedad
        // Para cada usuario, calcular puntos de cada jugador desde su fecha de compra
        console.log('🔄 Procesando períodos de propiedad...');
        console.log(`📊 Total períodos a procesar: ${ownershipPeriods.length}`);
        
        // Agrupar períodos por usuario para mejor visualización
        const periodsByUser = new Map<string, PlayerOwnershipPeriod[]>();
        ownershipPeriods.forEach(period => {
            if (!periodsByUser.has(period.userId)) {
                periodsByUser.set(period.userId, []);
            }
            periodsByUser.get(period.userId)!.push(period);
        });
        
        console.log(`👥 Usuarios con períodos de propiedad: ${periodsByUser.size}`);
        periodsByUser.forEach((userPeriods, userId) => {
            console.log(`   - UserId ${userId}: ${userPeriods.length} períodos`);
        });
        
        for (const period of ownershipPeriods) {
            const gameLogs = playerGameLogsMap.get(period.playerId) || [];
            
            // Obtener el ranking por userId (más confiable que teamId)
            let ranking = userRankingsMap.get(period.userId);
            
            // Si no existe ranking por userId, intentar crearlo desde teamId
            if (!ranking) {
                const team = teams.find(t => t.id === period.teamId);
                if (team) {
                    ranking = {
                        userId: period.userId,
                        teamId: period.teamId,
                        teamName: team.team_name,
                        totalPoints: 0,
                        weeklyBreakdown: new Map(),
                    };
                    userRankingsMap.set(period.userId, ranking);
                    teamIdToUserIdMap.set(period.teamId, period.userId);
                    console.log(`   ⚠️ Creado ranking nuevo para userId ${period.userId} desde teamId ${period.teamId}`);
                } else {
                    console.error(`❌ ERROR: No se encontró equipo ni usuario para:`);
                    console.error(`   - UserId: ${period.userId}`);
                    console.error(`   - TeamId: ${period.teamId}`);
                    console.error(`   - Jugador: ${period.playerName} (${period.playerId})`);
                    continue;
                }
            }

            // Calcular puntos semanales para este período
            // Los puntos se calculan desde purchaseDate hasta saleDate (o hasta ahora si no hay venta)
            const weeklyPoints = calculateWeeklyPoints(
                gameLogs,
                period.purchaseDate,  // Fecha de compra del jugador por este usuario
                period.saleDate      // Fecha de venta (null si aún lo tiene)
            );

            // Sumar puntos al ranking del usuario
            const totalPeriodPoints = weeklyPoints.reduce((sum, wp) => sum + wp.points, 0);
            
            weeklyPoints.forEach(weekly => {
                const currentWeekPoints = ranking!.weeklyBreakdown.get(weekly.weekNumber) || 0;
                const newWeekPoints = currentWeekPoints + weekly.points;
                ranking!.weeklyBreakdown.set(weekly.weekNumber, newWeekPoints);
                ranking!.totalPoints += weekly.points;
            });

            // Log detallado para cada período
            const purchaseDateStr = period.purchaseDate.toISOString().split('T')[0];
            const saleDateStr = period.saleDate ? period.saleDate.toISOString().split('T')[0] : 'actualidad';
            
            if (totalPeriodPoints > 0) {
                console.log(`  ✅ Usuario ${period.userId} - ${period.playerName} (${period.playerId}):`);
                console.log(`     - Fecha compra: ${purchaseDateStr}`);
                console.log(`     - Fecha venta: ${saleDateStr}`);
                console.log(`     - Puntos totales: ${totalPeriodPoints}`);
                console.log(`     - Equipo: ${ranking.teamName}`);
            } else {
                console.log(`  ⚠️ Usuario ${period.userId} - ${period.playerName} (${period.playerId}): 0 puntos`);
                console.log(`     - Fecha compra: ${purchaseDateStr}`);
                console.log(`     - Fecha venta: ${saleDateStr}`);
                console.log(`     - Partidos disponibles: ${gameLogs.length}`);
            }
        }
        
        // Resumen final por usuario
        console.log(`\n📊 Resumen final de puntos por usuario:`);
        userRankingsMap.forEach((ranking, userId) => {
            console.log(`   - UserId ${userId} (${ranking.teamName}): ${ranking.totalPoints} puntos totales`);
        });

        // Convertir a array y ordenar por puntos totales (descendente)
        const rankings = Array.from(userRankingsMap.values());
        rankings.sort((a, b) => {
            // Primero por puntos (descendente)
            if (b.totalPoints !== a.totalPoints) {
                return b.totalPoints - a.totalPoints;
            }
            // Si tienen los mismos puntos, ordenar alfabéticamente por nombre
            return a.teamName.localeCompare(b.teamName);
        });

        // Asegurarse de que TODOS los usuarios estén en el ranking, incluso si no tienen puntos
        // Esto garantiza que todos los usuarios con equipos aparezcan en la clasificación
        const rankedUserIds = new Set(rankings.map(r => r.userId));
        
        // Agregar usuarios que no tienen puntos (no aparecieron en períodos de propiedad)
        teams.forEach(team => {
            if (!rankedUserIds.has(team.user_id)) {
                rankings.push({
                    userId: team.user_id,
                    teamId: team.id,
                    teamName: team.team_name,
                    totalPoints: 0,
                    weeklyBreakdown: new Map(),
                });
            }
        });

        // Reordenar después de agregar los equipos faltantes
        rankings.sort((a, b) => {
            // Primero por puntos (descendente)
            if (b.totalPoints !== a.totalPoints) {
                return b.totalPoints - a.totalPoints;
            }
            // Si tienen los mismos puntos, ordenar alfabéticamente por nombre
            return a.teamName.localeCompare(b.teamName);
        });

        console.log(`🏆 Ranking final: ${rankings.length} usuarios`);
        rankings.forEach((r, index) => {
            console.log(`   ${index + 1}. ${r.teamName}: ${r.totalPoints} puntos`);
        });

        return rankings;
    } catch (error) {
        console.error('Error calculando clasificación:', error);
        return [];
    }
}

