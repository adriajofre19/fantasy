import { useState, useEffect } from 'react';
import { Button } from './ui/button';

interface ClauseModalProps {
    isOpen: boolean;
    playerId: string | null;
    playerName: string;
    currentClause: number | null;
    onClose: () => void;
    onSuccess?: () => void;
}

export default function ClauseModal({
    isOpen,
    playerId,
    playerName,
    currentClause,
    onClose,
    onSuccess
}: ClauseModalProps) {
    const [amount, setAmount] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && playerId) {
            setAmount(currentClause ? currentClause.toString() : '');
            setError(null);
            setSuccess(null);
        }
    }, [isOpen, playerId, currentClause]);

    const calculateCost = (): { difference: number; type: 'cost' | 'refund' | 'none' } => {
        const newValue = parseFloat(amount) || 0;
        const currentValue = currentClause || 0;
        const difference = newValue - currentValue;

        if (difference > 0) {
            return { difference, type: 'cost' };
        } else if (difference < 0) {
            return { difference: Math.abs(difference), type: 'refund' };
        }
        return { difference: 0, type: 'none' };
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!playerId) return;

        const amountValue = parseFloat(amount);
        if (isNaN(amountValue) || amountValue < 0) {
            setError('Por favor ingresa un monto válido (0 o mayor)');
            return;
        }

        setIsLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await fetch('/api/fantasy/set-clause', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerId, releaseClause: amountValue })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Error al establecer cláusula');
            }

            // Mostrar mensaje de éxito
            const costInfo = calculateCost();
            let successMessage = data.message || 'Cláusula establecida exitosamente';
            if (data.newBudget !== undefined) {
                successMessage += `\n\nPresupuesto actualizado: $${data.newBudget.toLocaleString()}`;
            }
            setSuccess(successMessage);

            // Disparar evento para actualizar el navbar
            if (data.newBudget !== undefined && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('budgetUpdated', { detail: data.newBudget }));
            }

            // Cerrar después de 1.5 segundos y recargar
            setTimeout(() => {
                if (onSuccess) {
                    onSuccess();
                } else {
                    window.location.reload();
                }
            }, 1500);

        } catch (err) {
            console.error('Error:', err);
            setError(err instanceof Error ? err.message : 'Error al establecer cláusula');
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        if (!isLoading) {
            setAmount('');
            setError(null);
            setSuccess(null);
            onClose();
        }
    };

    if (!isOpen) return null;

    const costInfo = calculateCost();

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
        >
            <div
                className="bg-card border border-border rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-foreground">
                        {currentClause && currentClause > 0 ? 'Editar Cláusula de Rescisión' : 'Establecer Cláusula de Rescisión'}
                    </h3>
                    <button
                        onClick={handleClose}
                        disabled={isLoading}
                        className="text-muted-foreground hover:text-foreground transition-colors text-2xl leading-none disabled:opacity-50"
                        aria-label="Cerrar"
                    >
                        ×
                    </button>
                </div>

                <p className="text-sm text-muted-foreground mb-4">
                    Jugador: <span className="font-medium text-foreground">{playerName}</span>
                </p>

                {currentClause && currentClause > 0 && (
                    <div className="mb-4 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                        <p className="text-xs text-primary font-medium">
                            Cláusula actual: ${currentClause.toLocaleString()}
                        </p>
                    </div>
                )}

                {!currentClause && (
                    <div className="mb-4 p-3 bg-muted/50 border border-border rounded-lg">
                        <p className="text-xs text-muted-foreground">Sin cláusula establecida</p>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <label className="block mb-2 text-sm font-medium text-foreground">
                        Cláusula de Rescisión (USD)
                    </label>
                    <p className="text-xs text-muted-foreground mb-2">
                        Si otro usuario quiere comprar este jugador, deberá pagar esta cantidad. El costo de establecer la cláusula se descontará de tu presupuesto. Deja en 0 para eliminar la cláusula y recuperar el dinero.
                    </p>

                    {costInfo.type === 'cost' && (
                        <div className="mb-2 p-2 bg-orange-500/10 border border-orange-500/20 rounded">
                            <p className="text-xs text-orange-500 font-medium">
                                💰 Costo: ${costInfo.difference.toLocaleString()} (se descontará de tu presupuesto)
                            </p>
                        </div>
                    )}

                    {costInfo.type === 'refund' && (
                        <div className="mb-2 p-2 bg-green-500/10 border border-green-500/20 rounded">
                            <p className="text-xs text-green-500 font-medium">
                                💰 Recuperarás: ${costInfo.difference.toLocaleString()} (se devolverá a tu presupuesto)
                            </p>
                        </div>
                    )}

                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        min="0"
                        step="1000"
                        placeholder="Ej: 1000000"
                        className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground mb-4 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        required
                        disabled={isLoading}
                    />

                    {error && (
                        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                            <p className="text-sm text-destructive">{error}</p>
                        </div>
                    )}

                    {success && (
                        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                            <p className="text-sm text-green-500 whitespace-pre-line">{success}</p>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleClose}
                            disabled={isLoading}
                            className="flex-1"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1"
                        >
                            {isLoading 
                                ? 'Guardando...' 
                                : currentClause && currentClause > 0 
                                    ? 'Actualizar Cláusula' 
                                    : 'Establecer Cláusula'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}

