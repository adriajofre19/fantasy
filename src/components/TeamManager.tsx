import { useState, useEffect } from "react";
import BasketballCourt from "./BasketballCourt";
import ClauseModal from "./ClauseModal";
import BenchPlayers from "./BenchPlayers";

interface Player {
    id: string;
    player_id: number;
    player_name: string;
    is_starter: boolean;
    purchase_price: number;
    release_clause: number | null;
    can_be_sold: boolean;
}

interface TeamManagerProps {
    starters: Player[];
    bench: Player[];
    onPlayerMoved?: () => void;
}

export default function TeamManager({ starters, bench, onPlayerMoved }: TeamManagerProps) {
    const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
    const [isMoving, setIsMoving] = useState(false);
    const [clauseModalOpen, setClauseModalOpen] = useState(false);
    const [clausePlayerId, setClausePlayerId] = useState<string | null>(null);
    const [clausePlayerName, setClausePlayerName] = useState<string>('');
    const [clauseCurrentClause, setClauseCurrentClause] = useState<number | null>(null);

    // Escuchar eventos para abrir el modal desde otros componentes
    useEffect(() => {
        const handleOpenClauseModal = (event: Event) => {
            const customEvent = event as CustomEvent;
            console.log('Evento openClauseModal recibido:', customEvent.detail);
            const { playerId, playerName, currentClause } = customEvent.detail || {};
            
            if (playerId && playerName !== undefined) {
                setClausePlayerId(playerId);
                setClausePlayerName(playerName);
                setClauseCurrentClause(currentClause || null);
                setClauseModalOpen(true);
            } else {
                console.error('Evento openClauseModal sin datos válidos:', customEvent.detail);
            }
        };

        window.addEventListener('openClauseModal', handleOpenClauseModal);
        
        return () => {
            window.removeEventListener('openClauseModal', handleOpenClauseModal);
        };
    }, []);

    const handlePlayerClick = async (playerId: string, isStarter: boolean) => {
        if (isMoving) return;

        if (selectedPlayer === playerId) {
            // Deseleccionar si se hace clic en el mismo jugador
            setSelectedPlayer(null);
            return;
        }

        // Si hay un jugador seleccionado, verificar que sea del tipo opuesto
        if (selectedPlayer) {
            const selectedPlayerData = [...starters, ...bench].find(p => p.id === selectedPlayer);
            if (selectedPlayerData) {
                // Si el jugador seleccionado es titular, solo permitir seleccionar suplentes
                if (selectedPlayerData.is_starter && isStarter) {
                    alert("Ya has seleccionado un titular. Por favor, selecciona un suplente para intercambiar.");
                    return;
                }
                // Si el jugador seleccionado es suplente, solo permitir seleccionar titulares
                if (!selectedPlayerData.is_starter && !isStarter) {
                    alert("Ya has seleccionado un suplente. Por favor, selecciona un titular para intercambiar.");
                    return;
                }
            }
            // Ya hay un jugador seleccionado y es del tipo opuesto, intercambiar
            swapPlayers(selectedPlayer, playerId);
            return;
        }

        // Si hay menos de 5 titulares y se hace clic en un suplente sin selección previa,
        // agregarlo automáticamente como titular
        if (!isStarter && starters.length < 5) {
            await movePlayerToStarter(playerId);
            return;
        }

        // Seleccionar jugador
        setSelectedPlayer(playerId);
    };

    const movePlayerToStarter = async (playerId: string) => {
        setIsMoving(true);
        
        try {
            const res = await fetch(`/api/fantasy/move-player`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerId, isStarter: true })
            });

            const data = await res.json();
            if (data.success) {
                if (onPlayerMoved) {
                    onPlayerMoved();
                } else {
                    window.location.reload();
                }
            } else {
                alert(`Error: ${data.error || 'Error al agregar jugador a la plantilla'}`);
                setIsMoving(false);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error al agregar jugador a la plantilla');
            setIsMoving(false);
        }
    };

    const swapPlayers = async (player1Id: string, player2Id: string) => {
        setIsMoving(true);
        
        const player1 = [...starters, ...bench].find(p => p.id === player1Id);
        const player2 = [...starters, ...bench].find(p => p.id === player2Id);

        if (!player1 || !player2) {
            setIsMoving(false);
            setSelectedPlayer(null);
            return;
        }

        // Si ambos están en la misma posición (ambos titulares o ambos suplentes)
        if (player1.is_starter === player2.is_starter) {
            // Mover solo el segundo jugador a la posición opuesta
            const newPosition = !player2.is_starter;
            
            // Verificar límites solo cuando se mueve de una categoría a otra
            if (newPosition && starters.length >= 5) {
                alert("Ya tienes 5 jugadores titulares. No puedes agregar más.");
                setIsMoving(false);
                setSelectedPlayer(null);
                return;
            }
            
            if (!newPosition && bench.length >= 4) {
                alert("Ya tienes 4 jugadores suplentes. No puedes agregar más.");
                setIsMoving(false);
                setSelectedPlayer(null);
                return;
            }

            try {
                const res = await fetch(`/api/fantasy/move-player`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ playerId: player2Id, isStarter: newPosition })
                });

                const data = await res.json();
                if (data.success) {
                    setSelectedPlayer(null);
                    if (onPlayerMoved) {
                        onPlayerMoved();
                    } else {
                        window.location.reload();
                    }
                } else {
                    alert(`Error: ${data.error}`);
                    setIsMoving(false);
                    setSelectedPlayer(null);
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Error al mover jugador');
                setIsMoving(false);
                setSelectedPlayer(null);
            }
            return;
        }

        // Intercambiar posiciones (uno es titular, otro suplente)
        // Usar endpoint específico para intercambios que no verifica límites
        try {
            const res = await fetch(`/api/fantasy/swap-players`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ player1Id, player2Id })
            });

            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }

            const data = await res.json();

            if (data.success) {
                setSelectedPlayer(null);
                if (onPlayerMoved) {
                    onPlayerMoved();
                } else {
                    window.location.reload();
                }
            } else {
                console.error('Error del servidor:', data);
                alert(`Error: ${data.error || 'Error al intercambiar jugadores'}`);
                setIsMoving(false);
                setSelectedPlayer(null);
            }
        } catch (error) {
            console.error('Error de red o servidor:', error);
            const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
            alert(`Error de conexión: ${errorMessage}. Por favor, intenta de nuevo.`);
            setIsMoving(false);
            setSelectedPlayer(null);
        }
    };

    const handleSetClause = (playerId: string, playerName: string, currentClause: number | null) => {
        setClausePlayerId(playerId);
        setClausePlayerName(playerName);
        setClauseCurrentClause(currentClause);
        setClauseModalOpen(true);
    };

    const handleClauseSuccess = () => {
        setClauseModalOpen(false);
        if (onPlayerMoved) {
            onPlayerMoved();
        } else {
            window.location.reload();
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Campo de baloncesto con titulares - Izquierda, más grande */}
            <div className="lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-semibold text-foreground">
                        Titulares ({starters.length}/5)
                    </h2>
                </div>
                <div className="bg-card border border-border rounded-lg p-1 h-full min-h-[900px] flex flex-col">
                    <BasketballCourt
                        starters={starters}
                        bench={bench}
                        onPlayerClick={handlePlayerClick}
                        selectedPlayer={selectedPlayer}
                        isMoving={isMoving}
                        selectedPlayerIsStarter={selectedPlayer ? [...starters, ...bench].find(p => p.id === selectedPlayer)?.is_starter ?? null : null}
                    />
                </div>
                {starters.length < 5 && (
                    <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <p className="text-sm text-blue-500 font-medium">
                            💡 Haz clic en un suplente para agregarlo automáticamente como titular ({starters.length}/5)
                        </p>
                    </div>
                )}
                {selectedPlayer && starters.find(p => p.id === selectedPlayer) && (
                    <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                        <p className="text-sm text-primary font-medium">
                            ✓ Jugador seleccionado - Haz clic en un suplente para intercambiar
                        </p>
                    </div>
                )}
            </div>

            {/* Suplentes - Derecha */}
            <div className="lg:col-span-1">
                <h2 className="text-2xl font-semibold mb-4 text-foreground">
                    Suplentes ({bench.length}/4)
                </h2>
                <div className="bg-card border border-border rounded-lg p-4">
                    <BenchPlayers
                        players={bench}
                        onPlayerClick={handlePlayerClick}
                        selectedPlayer={selectedPlayer}
                        isMoving={isMoving}
                        onSetClause={handleSetClause}
                        selectedPlayerIsStarter={selectedPlayer ? [...starters, ...bench].find(p => p.id === selectedPlayer)?.is_starter ?? null : null}
                    />
                </div>
                {selectedPlayer && bench.find(p => p.id === selectedPlayer) && (
                    <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                        <p className="text-sm text-primary font-medium">
                            ✓ Jugador seleccionado - Haz clic en un titular para intercambiar
                        </p>
                    </div>
                )}
                {!selectedPlayer && starters.length < 5 && bench.length > 0 && (
                    <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <p className="text-sm text-blue-500 font-medium">
                            💡 Haz clic en un suplente para agregarlo automáticamente como titular ({starters.length}/5)
                        </p>
                    </div>
                )}
            </div>

            {/* Modal de cláusula */}
            <ClauseModal
                isOpen={clauseModalOpen}
                playerId={clausePlayerId}
                playerName={clausePlayerName}
                currentClause={clauseCurrentClause}
                onClose={() => setClauseModalOpen(false)}
                onSuccess={handleClauseSuccess}
            />
        </div>
    );
}

// Extender el tipo Window para incluir setClause
declare global {
    interface Window {
        setClause?: (playerId: string, playerName: string, currentClause?: number | null) => void;
    }
}

