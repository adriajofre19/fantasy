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
    weeklyPoints?: number; // Puntos de los últimos 7 días
    dailyPoints?: number; // Puntos del último partido
    lastGameDate?: string; // Fecha del último partido
}

interface BasketballCourtProps {
    starters: Player[];
    bench: Player[];
    onPlayerClick?: (playerId: string, isStarter: boolean) => void;
    selectedPlayer?: string | null;
    isMoving?: boolean;
    selectedPlayerIsStarter?: boolean | null;
}

// Función para obtener la URL de la imagen del jugador
function getPlayerImageUrl(playerId: number): string {
    return `https://cdn.nba.com/headshots/nba/latest/260x190/${playerId}.png`;
}

// Posiciones en el campo (5 titulares)
const COURT_POSITIONS = [
    { top: '8%', left: '20%', label: 'PG' }, // Point Guard
    { top: '8%', left: '50%', label: 'SG' }, // Shooting Guard
    { top: '35%', left: '50%', label: 'C' },  // Center
    { top: '8%', left: '80%', label: 'SF' }, // Small Forward
    { top: '8%', left: '50%', label: 'PF' }, // Power Forward (se ajustará)
];

export default function BasketballCourt({ 
    starters, 
    bench, 
    onPlayerClick,
    selectedPlayer,
    isMoving = false,
    selectedPlayerIsStarter = null
}: BasketballCourtProps) {
    const [playerStats, setPlayerStats] = useState<Record<number, PlayerStats>>({});
    const [loadingStats, setLoadingStats] = useState<Record<number, boolean>>({});

    // Crear una cadena estable de IDs ordenados para la dependencia
    // Esto evita recargar cuando solo cambian las posiciones pero los jugadores son los mismos
    const starterIdsStr = useMemo(() => {
        return [...starters].map(p => p.player_id).sort((a, b) => a - b).join(',');
    }, [starters.map(p => p.player_id).sort((a, b) => a - b).join(',')]);

    // Obtener estadísticas de los jugadores titulares
    // Solo se ejecuta cuando cambian los IDs de los jugadores, no cuando cambian las posiciones
    useEffect(() => {
        // Timeout de seguridad: si después de 30 segundos un jugador sigue cargando, resetear su estado
        const safetyTimeout = setTimeout(() => {
            setLoadingStats(prev => {
                const updated = { ...prev };
                let changed = false;
                starters.forEach(player => {
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
            const statsPromises = starters.map(async (player) => {
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
                    // Cargar stats básicas primero (más rápido, no espera game logs)
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
                        // Verificar que los datos sean válidos
                        const pointsPerGame = Number(statsData.pointsPerGame);
                        const totalPoints = Number(statsData.totalPoints);
                        const gamesPlayed = Number(statsData.gamesPlayed);
                        
                        if (!isNaN(pointsPerGame) && pointsPerGame >= 0) {
                            // Mostrar stats básicas inmediatamente (sin esperar game logs)
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
                                    // Ignorar errores de game logs, ya tenemos stats básicas
                                });
                            
                            console.log(`✅ Stats cargadas para ${player.player_name} (ID: ${player.player_id}): ${pointsPerGame} PPG`);
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
                        const errorMsg = statsData.error || `HTTP ${statsResponse.status}`;
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
                    console.error(`❌ Error de red obteniendo stats para ${player.player_name} (ID: ${player.player_id}):`, error);
                    // Establecer valores por defecto en caso de error de red
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

            await Promise.all(statsPromises);
        };

        if (starters.length > 0) {
            fetchStats();
        }

        // Limpiar el timeout cuando el componente se desmonte o cambien los jugadores
        return () => {
            clearTimeout(safetyTimeout);
        };
        // Dependencia basada en los IDs de los jugadores ordenados, no en el array completo
        // Esto evita recargar cuando solo cambian las posiciones pero los jugadores son los mismos
    }, [starterIdsStr]);

    // Calcular posiciones distribuidas para los jugadores (adaptadas al nuevo campo SVG)
    const getPlayerPosition = (index: number, total: number) => {
        if (total === 1) {
            return { top: '50%', left: '50%' };
        }
        if (total === 2) {
            return index === 0 
                ? { top: '25%', left: '35%' }
                : { top: '75%', left: '65%' };
        }
        if (total === 3) {
            const positions = [
                { top: '18%', left: '35%' },
                { top: '50%', left: '50%' },
                { top: '82%', left: '65%' },
            ];
            return positions[index];
        }
        if (total === 4) {
            const positions = [
                { top: '18%', left: '25%' },
                { top: '18%', left: '75%' },
                { top: '75%', left: '35%' },
                { top: '75%', left: '65%' },
            ];
            return positions[index];
        }
        // 5 jugadores (distribución mejorada en formación de baloncesto)
        const positions = [
            { top: '20%', left: '20%' },  // PG - parte superior izquierda
            { top: '20%', left: '50%' },  // SG - parte superior centro
            { top: '50%', left: '50%' },  // C - centro del campo
            { top: '20%', left: '80%' },  // SF - parte superior derecha
            { top: '75%', left: '50%' },  // PF - parte inferior centro
        ];
        return positions[index] || { top: '50%', left: '50%' };
    };

    const handlePlayerCardClick = (player: Player) => {
        if (onPlayerClick && !isMoving) {
            onPlayerClick(player.id, player.is_starter);
        }
    };

    return (
        <div className="relative w-full h-full flex-1" style={{ minHeight: '900px', maxHeight: '900px', height: '900px', overflow: 'hidden' }}>
            {/* Campo de baloncesto de fondo */}
            <div className="absolute inset-0 rounded-lg overflow-hidden w-full h-full" style={{ height: '100%', width: '100%' }}>
                {/* SVG del campo de baloncesto */}
                <svg 
                    className="absolute inset-0 w-full h-full" 
                    viewBox="0 0 653 1036"
                    preserveAspectRatio="xMidYMid meet"
                >
                    <rect y="1036" width="1036" height="653" transform="rotate(-90 0 1036)" fill="#00000A"/>
                    <rect x="35" y="1002" width="967" height="585" transform="rotate(-90 35 1002)" stroke="#4D5466" strokeWidth="4"/>
                    <line x1="34" y1="518" x2="620" y2="518" stroke="#4D5466" strokeWidth="4"/>
                    <circle cx="328.5" cy="518.5" r="74.5" transform="rotate(-90 328.5 518.5)" stroke="#4D5466" strokeWidth="4"/>
                    <circle cx="328.5" cy="518.5" r="74.5" transform="rotate(-90 328.5 518.5)" stroke="#4D5466" strokeWidth="4"/>
                    <path d="M251 922.5H245H244" stroke="#4D5466" strokeWidth="4"/>
                    <path d="M251 887.5H244" stroke="#4D5466" strokeWidth="4"/>
                    <path d="M251 853.5H244" stroke="#4D5466" strokeWidth="4"/>
                    <path d="M251 818.5H244" stroke="#4D5466" strokeWidth="4"/>
                    <path d="M404 922.5H411" stroke="#4D5466" strokeWidth="4"/>
                    <path d="M404 887.5H411" stroke="#4D5466" strokeWidth="4"/>
                    <path d="M404 853.5H411" stroke="#4D5466" strokeWidth="4"/>
                    <path d="M404 818.5H411" stroke="#4D5466" strokeWidth="4"/>
                    <rect x="253" y="1002" width="218" height="149" transform="rotate(-90 253 1002)" stroke="#4D5466" strokeWidth="4"/>
                    <circle cx="327.5" cy="782.5" r="74.5" transform="rotate(-90 327.5 782.5)" stroke="#4D5466" strokeWidth="4"/>
                    <circle cx="327.5" cy="934.5" r="19.5" transform="rotate(-90 327.5 934.5)" stroke="#4D5466" strokeWidth="4"/>
                    <path d="M91 921C91 793.975 196.885 691 327.5 691C458.115 691 564 793.975 564 921C564 935.465 562.626 949.618 560 963.343V929H559.856C559.952 926.345 560 923.678 560 921C560 796.288 456.012 695 327.5 695C198.988 695 95 796.288 95 921C95 922.336 95.0124 923.669 95.0361 925H95V963.343C92.3739 949.618 91 935.465 91 921ZM543.814 1004C544.354 1002.67 544.879 1001.34 545.394 1000H549.678C549.174 1001.34 548.66 1002.67 548.132 1004H543.814ZM109.604 1000C110.119 1001.34 110.645 1002.67 111.185 1004H106.867C106.339 1002.67 105.824 1001.34 105.32 1000H109.604Z" fill="#4D5466"/>
                    <path d="M95 926V1000H560V926H564V1004H91V926H95Z" fill="#4D5466"/>
                    <line x1="283" y1="963" x2="371" y2="963" stroke="#4D5466" strokeWidth="4"/>
                    <line x1="324" y1="965" x2="324" y2="955" stroke="#4D5466" strokeWidth="4"/>
                    <line x1="331" y1="965" x2="331" y2="955" stroke="#4D5466" strokeWidth="4"/>
                    <path d="M250 114.5H244H243" stroke="#4D5466" strokeWidth="4"/>
                    <path d="M250 149.5H243" stroke="#4D5466" strokeWidth="4"/>
                    <path d="M250 183.5H243" stroke="#4D5466" strokeWidth="4"/>
                    <path d="M250 218.5H243" stroke="#4D5466" strokeWidth="4"/>
                    <path d="M403 114.5H410" stroke="#4D5466" strokeWidth="4"/>
                    <path d="M403 149.5H410" stroke="#4D5466" strokeWidth="4"/>
                    <path d="M403 183.5H410" stroke="#4D5466" strokeWidth="4"/>
                    <path d="M403 218.5H410" stroke="#4D5466" strokeWidth="4"/>
                    <rect x="2" y="2" width="218" height="149" transform="matrix(0 1 1 0 250 33)" stroke="#4D5466" strokeWidth="4"/>
                    <circle cx="76.5" cy="76.5" r="74.5" transform="matrix(0 1 1 0 250 178)" stroke="#4D5466" strokeWidth="4"/>
                    <circle cx="21.5" cy="21.5" r="19.5" transform="matrix(0 1 1 0 305 81)" stroke="#4D5466" strokeWidth="4"/>
                    <path d="M90 116C90 243.025 195.885 346 326.5 346C457.115 346 563 243.025 563 116C563 101.535 561.626 87.3819 559 73.6572V108H558.856C558.952 110.655 559 113.322 559 116C559 240.712 455.012 342 326.5 342C197.988 342 94 240.712 94 116C94 114.664 94.0124 113.331 94.0361 112H94V73.6572C91.3739 87.382 90 101.535 90 116ZM542.814 33C543.354 34.3271 543.879 35.6608 544.394 37H548.678C548.174 35.661 547.66 34.3272 547.132 33H542.814ZM108.604 37C109.119 35.6607 109.645 34.3272 110.185 33H105.867C105.339 34.3273 104.824 35.6609 104.32 37H108.604Z" fill="#4D5466"/>
                    <path d="M94 111V37L559 37V111H563V33L90 33V111H94Z" fill="#4D5466"/>
                    <line y1="-2" x2="88" y2="-2" transform="matrix(1 0 0 -1 282 72)" stroke="#4D5466" strokeWidth="4"/>
                    <line y1="-2" x2="10" y2="-2" transform="matrix(0 1 1 0 325 72)" stroke="#4D5466" strokeWidth="4"/>
                    <line y1="-2" x2="10" y2="-2" transform="matrix(0 1 1 0 332 72)" stroke="#4D5466" strokeWidth="4"/>
                </svg>
            </div>

            {/* Jugadores titulares posicionados en el campo */}
            <div className="relative z-10 w-full h-full" style={{ minHeight: '100%', height: '100%' }}>
                {starters.map((player, index) => {
                    const position = getPlayerPosition(index, starters.length);
                    const stats = playerStats[player.player_id];
                    const isLoading = loadingStats[player.player_id] && !stats; // Solo mostrar loading si no hay stats
                    const isSelected = selectedPlayer === player.id;
                    // Si hay un jugador seleccionado y es titular, deshabilitar otros titulares
                    const isDisabled = selectedPlayer !== null && selectedPlayerIsStarter === true && !isSelected;

                    return (
                        <div
                            key={player.id}
                            className="absolute transform -translate-x-1/2 -translate-y-1/2"
                            style={{
                                top: position.top,
                                left: position.left,
                            }}
                        >
                            <div
                                onClick={() => handlePlayerCardClick(player)}
                                className={cn(
                                    "bg-card border-2 rounded-lg shadow-xl p-1.5 w-28 transition-[border-color,shadow,ring,transform] duration-300 group",
                                    isSelected 
                                        ? "border-primary shadow-primary/50 ring-2 ring-primary ring-offset-2 z-20 cursor-pointer scale-110" 
                                        : isDisabled
                                            ? "border-border opacity-40 cursor-not-allowed"
                                            : "border-border hover:border-primary/50 hover:z-10 cursor-pointer",
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
                                            // Fallback si la imagen no carga
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
                                <div className="text-center">
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
                                            console.log('Botón de cláusula clickeado para:', player.player_name, player.id);
                                            // Disparar evento personalizado para abrir el modal
                                            const event = new CustomEvent('openClauseModal', {
                                                detail: {
                                                    playerId: player.id,
                                                    playerName: player.player_name,
                                                    currentClause: player.release_clause
                                                }
                                            });
                                            console.log('Disparando evento:', event.detail);
                                            window.dispatchEvent(event);
                                        }}
                                        className="w-full text-[9px] px-1 py-0.5 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors font-medium leading-tight"
                                        title={player.release_clause ? 'Haz clic para editar la cláusula' : 'Haz clic para establecer una cláusula'}
                                    >
                                        {player.release_clause ? `Editar: $${(player.release_clause / 1000).toFixed(0)}k` : 'Establecer cláusula'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Mensaje si no hay jugadores */}
                {starters.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-card/90 border border-border rounded-lg p-8 text-center">
                            <p className="text-muted-foreground text-lg mb-2">No tienes jugadores titulares</p>
                            <a href="/market" className="text-primary hover:underline">
                                Ir al mercado
                            </a>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Extender el tipo Window para incluir setClause
declare global {
    interface Window {
        setClause?: (playerId: string, playerName: string, currentClause?: number | null) => void;
    }
}

