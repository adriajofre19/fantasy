import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";

interface Player {
    id: string;
    player_id: number;
    player_name: string;
    is_starter: boolean;
    purchase_price: number;
    release_clause: number | null;
    can_be_sold: boolean;
}

interface PlayerStats {
    pointsPerGame: number;
    totalPoints: number;
    gamesPlayed: number;
    weeklyPoints?: number;
    dailyPoints?: number;
    lastGameDate?: string;
}

interface BenchPlayersProps {
    players: Player[];
    onPlayerClick?: (playerId: string, isStarter: boolean) => void;
    selectedPlayer?: string | null;
    isMoving?: boolean;
    onSetClause: (playerId: string, playerName: string, currentClause: number | null) => void;
    selectedPlayerIsStarter?: boolean | null;
}

// Función para obtener la URL de la imagen del jugador
function getPlayerImageUrl(playerId: number): string {
    return `https://cdn.nba.com/headshots/nba/latest/260x190/${playerId}.png`;
}

export default function BenchPlayers({
    players,
    onPlayerClick,
    selectedPlayer,
    isMoving = false,
    onSetClause,
    selectedPlayerIsStarter = null
}: BenchPlayersProps) {
    const [playerStats, setPlayerStats] = useState<Record<number, PlayerStats>>({});
    const [loadingStats, setLoadingStats] = useState<Record<number, boolean>>({});

    // Crear una cadena estable de IDs ordenados para la dependencia
    // Esto evita recargar cuando solo cambian las posiciones pero los jugadores son los mismos
    const playerIdsStr = useMemo(() => {
        return [...players].map(p => p.player_id).sort((a, b) => a - b).join(',');
    }, [players.map(p => p.player_id).sort((a, b) => a - b).join(',')]);

    // Obtener estadísticas de los jugadores suplentes (optimizado)
    // Solo se ejecuta cuando cambian los IDs de los jugadores, no cuando cambian las posiciones
    useEffect(() => {
        // Timeout de seguridad: si después de 30 segundos un jugador sigue cargando, resetear su estado
        const safetyTimeout = setTimeout(() => {
            setLoadingStats(prev => {
                const updated = { ...prev };
                let changed = false;
                players.forEach(player => {
                    // Si está cargando pero no tiene stats después de 30 segundos, resetear
                    if (updated[player.player_id] && !playerStats[player.player_id]) {
                        updated[player.player_id] = false;
                        changed = true;
                    }
                });
                return changed ? updated : prev;
            });
        }, 30000);

        const fetchStats = async () => {
            // Cargar stats básicas primero (más rápido)
            const basicStatsPromises = players.map(async (player) => {
                // Si ya tenemos las stats cargadas, asegurarse de que loadingStats esté en false y no recargar
                if (playerStats[player.player_id] && playerStats[player.player_id].pointsPerGame !== undefined) {
                    // Asegurarse de que loadingStats esté en false para este jugador
                    setLoadingStats(prev => {
                        if (prev[player.player_id]) {
                            return { ...prev, [player.player_id]: false };
                        }
                        return prev;
                    });
                    return;
                }
                
                setLoadingStats(prev => ({ ...prev, [player.player_id]: true }));
                
                try {
                    // Cargar stats básicas primero
                    // Sistema de reintentos con timeout de 10 segundos
                    let statsResponse;
                    let statsData;
                    let lastError;
                    const maxRetries = 2;
                    
                    for (let attempt = 0; attempt <= maxRetries; attempt++) {
                        try {
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 10000);
                            
                            try {
                                statsResponse = await fetch(`/api/nba/player-stats?playerId=${player.player_id}&season=2025-26`, {
                                    signal: controller.signal
                                });
                                clearTimeout(timeoutId);
                                
                                // Verificar que la respuesta sea JSON válido
                                const text = await statsResponse.text();
                                try {
                                    statsData = JSON.parse(text);
                                    // Si llegamos aquí, la petición fue exitosa
                                    break;
                                } catch (parseError) {
                                    throw new Error(`Respuesta no es JSON válido: ${text.substring(0, 100)}`);
                                }
                            } catch (fetchError) {
                                clearTimeout(timeoutId);
                                lastError = fetchError;
                                if (fetchError instanceof Error && fetchError.name === 'AbortError') {
                                    lastError = new Error('Timeout: La petición tardó demasiado');
                                }
                                // Si no es el último intento, esperar un poco antes de reintentar
                                if (attempt < maxRetries) {
                                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                                    continue;
                                }
                                throw lastError;
                            }
                        } catch (retryError) {
                            lastError = retryError;
                            if (attempt === maxRetries) {
                                throw retryError;
                            }
                            // Esperar antes del siguiente intento
                            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                        }
                    }
                    
                    if (statsResponse.ok && statsData.success) {
                        const pointsPerGame = Number(statsData.pointsPerGame);
                        const totalPoints = Number(statsData.totalPoints);
                        const gamesPlayed = Number(statsData.gamesPlayed);
                        
                        if (!isNaN(pointsPerGame) && pointsPerGame >= 0) {
                            // Mostrar stats básicas inmediatamente
                            setPlayerStats(prev => ({
                                ...prev,
                                [player.player_id]: {
                                    pointsPerGame: pointsPerGame,
                                    totalPoints: !isNaN(totalPoints) ? totalPoints : 0,
                                    gamesPlayed: !isNaN(gamesPlayed) ? gamesPlayed : 0,
                                    dailyPoints: 0, // Se actualizará después
                                    weeklyPoints: 0, // Se actualizará después
                                }
                            }));
                            
                            // Cargar game logs en segundo plano (no bloquea la visualización)
                            fetch(`/api/nba/player-game-logs?playerId=${player.player_id}&season=2025-26`)
                                .then(res => res.ok ? res.json() : null)
                                .then(gameLogsData => {
                                    if (gameLogsData?.success) {
                                        setPlayerStats(prev => ({
                                            ...prev,
                                            [player.player_id]: {
                                                ...prev[player.player_id],
                                                dailyPoints: gameLogsData.dailyPoints || 0,
                                                weeklyPoints: gameLogsData.weeklyPoints || 0,
                                                lastGameDate: gameLogsData.lastGameDate,
                                            }
                                        }));
                                    }
                                })
                                .catch(() => {
                                    // Ignorar errores de game logs
                                });
                        } else {
                            console.warn(`⚠️ Stats inválidas para ${player.player_name} (ID: ${player.player_id}):`, statsData);
                            setPlayerStats(prev => ({
                                ...prev,
                                [player.player_id]: {
                                    pointsPerGame: 0,
                                    totalPoints: 0,
                                    gamesPlayed: 0,
                                    dailyPoints: 0,
                                    weeklyPoints: 0,
                                }
                            }));
                        }
                    } else {
                        // Error en la respuesta
                        const errorMsg = statsData?.error || `HTTP ${statsResponse.status}`;
                        console.warn(`⚠️ No se pudieron cargar stats para ${player.player_name} (ID: ${player.player_id}): ${errorMsg}`);
                        
                        // Intentar con temporada anterior como fallback (solo stats básicas)
                        try {
                            const fallbackController = new AbortController();
                            const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), 10000);
                            
                            try {
                                const fallbackStatsResponse = await fetch(`/api/nba/player-stats?playerId=${player.player_id}&season=2024-25`, {
                                    signal: fallbackController.signal
                                });
                                clearTimeout(fallbackTimeoutId);
                                
                                if (fallbackStatsResponse.ok) {
                                    const fallbackText = await fallbackStatsResponse.text();
                                    let fallbackStatsData;
                                    try {
                                        fallbackStatsData = JSON.parse(fallbackText);
                                    } catch (parseError) {
                                        throw new Error('Respuesta fallback no es JSON válido');
                                    }
                                    
                                    if (fallbackStatsData.success && fallbackStatsData.pointsPerGame !== undefined) {
                                        const fallbackPpg = Number(fallbackStatsData.pointsPerGame);
                                        
                                        if (!isNaN(fallbackPpg) && fallbackPpg >= 0) {
                                            console.log(`✅ Stats cargadas desde temporada anterior para ${player.player_name}: ${fallbackPpg} PPG`);
                                            setPlayerStats(prev => ({
                                                ...prev,
                                                [player.player_id]: {
                                                    pointsPerGame: fallbackPpg,
                                                    totalPoints: Number(fallbackStatsData.totalPoints) || 0,
                                                    gamesPlayed: Number(fallbackStatsData.gamesPlayed) || 0,
                                                    dailyPoints: 0,
                                                    weeklyPoints: 0,
                                                }
                                            }));
                                            return; // Salir temprano si encontramos datos en fallback
                                        }
                                    }
                                }
                            } catch (fallbackFetchError) {
                                clearTimeout(fallbackTimeoutId);
                                throw fallbackFetchError;
                            }
                        } catch (fallbackError) {
                            console.warn(`Fallback también falló para ${player.player_name}:`, fallbackError);
                        }
                        
                        // Si llegamos aquí, establecer valores por defecto
                        setPlayerStats(prev => ({
                            ...prev,
                            [player.player_id]: {
                                pointsPerGame: 0,
                                totalPoints: 0,
                                gamesPlayed: 0,
                                dailyPoints: 0,
                                weeklyPoints: 0,
                            }
                        }));
                    }
                } catch (error) {
                    console.error(`Error obteniendo stats para ${player.player_name}:`, error);
                    setPlayerStats(prev => ({
                        ...prev,
                        [player.player_id]: {
                            pointsPerGame: 0,
                            totalPoints: 0,
                            gamesPlayed: 0,
                            dailyPoints: 0,
                            weeklyPoints: 0,
                        }
                    }));
                } finally {
                    setLoadingStats(prev => ({ ...prev, [player.player_id]: false }));
                }
            });

            // Ejecutar todas las peticiones en paralelo
            await Promise.all(basicStatsPromises);
        };

        if (players.length > 0) {
            fetchStats();
        }

        // Limpiar el timeout cuando el componente se desmonte o cambien los jugadores
        return () => {
            clearTimeout(safetyTimeout);
        };
        // Dependencia basada en los IDs de los jugadores ordenados, no en el array completo
        // Esto evita recargar cuando solo cambian las posiciones pero los jugadores son los mismos
    }, [playerIdsStr]);

    const handlePlayerCardClick = (player: Player) => {
        if (onPlayerClick && !isMoving) {
            onPlayerClick(player.id, player.is_starter);
        }
    };

    if (players.length === 0) {
        return (
            <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
                <p>No tienes jugadores suplentes</p>
                <a href="/market" className="text-primary hover:underline mt-2 inline-block">
                    Ir al mercado
                </a>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {players.map((player) => {
                        const stats = playerStats[player.player_id];
                        const isLoading = loadingStats[player.player_id] && !stats; // Solo mostrar loading si no hay stats
                        const isSelected = selectedPlayer === player.id;
                        // Si hay un jugador seleccionado y es suplente, deshabilitar otros suplentes
                        const isDisabled = selectedPlayer !== null && selectedPlayerIsStarter === false && !isSelected;

                return (
                    <div
                        key={player.id}
                        onClick={() => handlePlayerCardClick(player)}
                        className={cn(
                            "bg-card border-2 rounded-lg shadow-lg p-1.5 transition-[border-color,shadow,ring,transform] duration-300 group relative",
                            isSelected 
                                ? "border-primary shadow-primary/50 ring-2 ring-primary ring-offset-2 cursor-pointer scale-105" 
                                : isDisabled
                                    ? "border-border opacity-40 cursor-not-allowed"
                                    : "border-border hover:border-primary/50 cursor-pointer",
                            isMoving && "opacity-50 cursor-wait"
                        )}
                    >
                        {/* Imagen del jugador */}
                        <div className="relative w-full aspect-[4/3] mb-1 rounded overflow-hidden bg-muted">
                            <img
                                src={getPlayerImageUrl(player.player_id)}
                                alt={player.player_name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    if (target.parentElement) {
                                        target.parentElement.innerHTML = `
                                            <div class="w-full h-full flex items-center justify-center bg-primary/20 text-primary font-bold text-lg">
                                                ${player.player_name.charAt(0)}
                                            </div>
                                        `;
                                    }
                                }}
                            />
                        </div>

                        {/* Nombre del jugador */}
                        <p className="text-[10px] font-semibold text-foreground text-center mb-0.5 truncate leading-tight">
                            {player.player_name}
                        </p>

                        {/* Puntos */}
                        <div className="text-center mb-1">
                            {isLoading ? (
                                <div className="text-[9px] text-muted-foreground animate-pulse">Cargando...</div>
                            ) : (
                                <div className="text-sm font-bold text-primary leading-tight">
                                    {stats?.totalPoints ? stats.totalPoints.toLocaleString() : '0'}
                                </div>
                            )}
                        </div>

                        {/* Indicador de selección */}
                        {isSelected && (
                            <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold shadow-lg">
                                ✓
                            </div>
                        )}

                        {/* Botón para cláusula (hover) */}
                        <div className="absolute bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm rounded-b-lg p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSetClause(player.id, player.player_name, player.release_clause);
                                }}
                                className="w-full text-[9px] px-1 py-0.5 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors font-medium leading-tight"
                                disabled={isMoving}
                                title={player.release_clause ? 'Haz clic para editar la cláusula' : 'Haz clic para establecer una cláusula'}
                            >
                                {player.release_clause ? `Editar: $${(player.release_clause / 1000).toFixed(0)}k` : 'Establecer cláusula'}
                            </button>
                        </div>

                        {/* Información adicional */}
                        <div className="mt-1 mb-6 text-[9px] text-muted-foreground text-center leading-tight">
                            <p>Comprado: ${player.purchase_price.toLocaleString()}</p>
                            {!player.can_be_sold && (
                                <p className="text-orange-500 mt-0.5">Cooldown 7 días</p>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

