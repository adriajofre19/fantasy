import React, { useState, useEffect } from 'react';

interface Player {
    player_id: number;
    player_name: string;
    position: string;
    team: {
        abbreviation?: string;
        full_name?: string;
    } | null;
    height_feet: number | null;
    height_inches: number | null;
    weight_pounds: number | null;
    price: number;
    image_url: string;
}

interface MarketProps {
    initialBudget: number;
    initialPlayers: Player[];
    onBudgetUpdate?: (newBudget: number) => void;
}

const Market: React.FC<MarketProps> = ({ initialBudget, initialPlayers, onBudgetUpdate }) => {
    const [budget, setBudget] = useState<number>(initialBudget);
    const [players, setPlayers] = useState<Player[]>(initialPlayers);
    const [loading, setLoading] = useState<{ [key: number]: boolean }>({});
    const [error, setError] = useState<string | null>(null);

    const handleBuyPlayer = async (player: Player) => {
        if (budget < player.price) {
            setError('Presupuesto insuficiente');
            setTimeout(() => setError(null), 3000);
            return;
        }

        if (!confirm(`¿Estás seguro de comprar a ${player.player_name} por $${player.price.toLocaleString()}?`)) {
            return;
        }

        setLoading({ ...loading, [player.player_id]: true });
        setError(null);

        try {
            const response = await fetch('/api/fantasy/add-initial-player', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    playerId: player.player_id,
                    playerName: player.player_name,
                    price: player.price,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Error al comprar jugador');
            }

            // Actualizar presupuesto con el valor del servidor
            const newBudgetValue = data.newBudget !== undefined ? data.newBudget : budget - player.price;
            setBudget(newBudgetValue);
            
            // Notificar al componente padre del cambio de presupuesto
            if (onBudgetUpdate) {
                onBudgetUpdate(newBudgetValue);
            }

            // Disparar evento global para actualizar el navbar
            window.dispatchEvent(new CustomEvent('budgetUpdated', { detail: newBudgetValue }));
            
            // Remover jugador de la lista
            setPlayers(players.filter(p => p.player_id !== player.player_id));

            // Mostrar mensaje de éxito
            alert(`¡${player.player_name} agregado exitosamente a tu equipo!`);
            
            // Recargar la página después de un breve delay para ver el cambio
            setTimeout(() => {
                window.location.reload();
            }, 500);

        } catch (err) {
            console.error('Error comprando jugador:', err);
            const errorMessage = err instanceof Error ? err.message : 'Error desconocido al comprar jugador';
            setError(errorMessage);
            setTimeout(() => setError(null), 5000);
        } finally {
            setLoading({ ...loading, [player.player_id]: false });
        }
    };

    const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
        e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Crect fill='%23ddd' width='128' height='128'/%3E%3Ctext fill='%23999' font-family='sans-serif' font-size='14' dy='10.5' font-weight='bold' x='50%25' y='50%25' text-anchor='middle'%3ENBA%3C/text%3E%3C/svg%3E";
    };

    return (
        <div>
            {/* Mostrar presupuesto actualizado */}
            <div className="mb-6">
                <div className="bg-muted/50 rounded-lg px-4 py-2 inline-block">
                    <p className="text-sm text-muted-foreground">Tu Presupuesto</p>
                    <p className="text-2xl font-bold text-foreground">${budget.toLocaleString()}</p>
                </div>
            </div>

            {error && (
                <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="text-destructive text-sm font-medium">{error}</p>
                </div>
            )}

            {players.length === 0 ? (
                <div className="bg-card border border-border rounded-lg p-12 text-center">
                    <p className="text-lg text-muted-foreground mb-4">
                        No hay jugadores disponibles en el mercado
                    </p>
                    <a href="/my-team" className="text-primary hover:underline">
                        Volver a mi equipo
                    </a>
                </div>
            ) : (
                <>
                    <div className="mb-4">
                        <p className="text-sm text-muted-foreground">
                            Mostrando {players.length} jugadores disponibles de la NBA
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {players.map((player) => {
                            const canAfford = budget >= player.price;
                            const isLoading = loading[player.player_id] || false;

                            return (
                                <div
                                    key={player.player_id}
                                    className="bg-card border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors flex flex-col"
                                >
                                    {/* Imagen del jugador */}
                                    <div className="mb-3 flex justify-center">
                                        <img
                                            src={player.image_url}
                                            alt={player.player_name}
                                            className="w-32 h-32 object-cover rounded-lg bg-muted"
                                            onError={handleImageError}
                                        />
                                    </div>

                                    {/* Información del jugador */}
                                    <div className="mb-3 flex-grow">
                                        <h3 className="font-semibold text-lg text-foreground text-center">
                                            {player.player_name}
                                        </h3>
                                        <div className="text-sm text-muted-foreground mt-1 text-center">
                                            <p>
                                                {player.team?.abbreviation || 'N/A'} • {player.position}
                                            </p>
                                            {player.height_feet !== null && player.height_inches !== null && (
                                                <p className="text-xs mt-1">
                                                    {player.height_feet}'{player.height_inches}" • {player.weight_pounds ? `${player.weight_pounds} lbs` : ''}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Precio */}
                                    <div className="mb-4">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-muted-foreground">Precio:</span>
                                            <span className="text-xl font-bold text-primary">
                                                ${player.price.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Botón de compra */}
                                    <button
                                        onClick={() => handleBuyPlayer(player)}
                                        disabled={!canAfford || isLoading}
                                        className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${
                                            canAfford && !isLoading
                                                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                                : 'bg-muted text-muted-foreground cursor-not-allowed'
                                        }`}
                                    >
                                        {isLoading
                                            ? 'Comprando...'
                                            : canAfford
                                            ? `Comprar por $${player.price.toLocaleString()}`
                                            : 'Presupuesto insuficiente'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
};

export default Market;

