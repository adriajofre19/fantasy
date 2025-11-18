import { useEffect, useState } from "react";

interface PlayerStats {
	playerId: number;
	season: string;
	gamesPlayed: number;
	pointsPerGame: number;
	reboundsPerGame: number;
	assistsPerGame: number;
	stealsPerGame: number;
	blocksPerGame: number;
	fieldGoalPercentage: number;
	threePointPercentage: number;
	freeThrowPercentage: number;
	minutesPerGame: number;
	totalPoints: number;
	totalRebounds: number;
	totalAssists: number;
	totalSteals: number;
	totalBlocks: number;
}

export default function PlayerStatsModal() {
	const [playerId, setPlayerId] = useState<number | null>(null);
	const [playerName, setPlayerName] = useState<string>("");
	const [stats, setStats] = useState<PlayerStats | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Escuchar eventos de clic en las filas de la tabla
	useEffect(() => {
		const handleRowClick = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			const row = target.closest("tr[data-player-id]");
			
			if (row) {
				const id = row.getAttribute("data-player-id");
				const name = row.getAttribute("data-player-name");
				
				if (id && name) {
					setPlayerId(parseInt(id, 10));
					setPlayerName(name);
					setStats(null);
					setError(null);
				}
			}
		};

		document.addEventListener("click", handleRowClick);
		return () => {
			document.removeEventListener("click", handleRowClick);
		};
	}, []);

	const handleClose = () => {
		setPlayerId(null);
		setPlayerName("");
		setStats(null);
		setError(null);
	};

	useEffect(() => {
		if (!playerId) return;

		const fetchStats = async () => {
			setLoading(true);
			setError(null);

			try {
				const response = await fetch(
					`/api/nba/player-stats?playerId=${playerId}&season=2025-26`
				);
				const data = await response.json();

				if (data.success) {
					setStats(data);
				} else {
					setError(data.error || "No se pudieron cargar las estadísticas");
				}
			} catch (err) {
				setError("Error al cargar las estadísticas");
				console.error(err);
			} finally {
				setLoading(false);
			}
		};

		fetchStats();
	}, [playerId]);

	if (!playerId) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
			onClick={handleClose}
		>
			<div
				className="bg-card border border-border rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
					<h2 className="text-2xl font-bold text-foreground">
						Estadísticas de {playerName}
					</h2>
					<button
						onClick={handleClose}
						className="text-muted-foreground hover:text-foreground transition-colors text-2xl leading-none"
						aria-label="Cerrar"
					>
						×
					</button>
				</div>

				<div className="p-6">
					{loading ? (
						<div className="text-center py-12">
							<div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
							<p className="mt-4 text-muted-foreground">
								Cargando estadísticas...
							</p>
						</div>
					) : error ? (
						<div className="text-center py-12">
							<p className="text-destructive">{error}</p>
						</div>
					) : stats ? (
						<div className="space-y-6">
							{/* Información general */}
							<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
								<div className="bg-muted/50 rounded-lg p-4">
									<p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
										Partidos
									</p>
									<p className="text-2xl font-bold text-foreground">
										{stats.gamesPlayed}
									</p>
								</div>
								<div className="bg-muted/50 rounded-lg p-4">
									<p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
										Minutos/Partido
									</p>
									<p className="text-2xl font-bold text-foreground">
										{stats.minutesPerGame}
									</p>
								</div>
								<div className="bg-muted/50 rounded-lg p-4">
									<p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
										Puntos Totales
									</p>
									<p className="text-2xl font-bold text-foreground">
										{stats.totalPoints.toLocaleString()}
									</p>
								</div>
								<div className="bg-muted/50 rounded-lg p-4">
									<p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
										Temporada
									</p>
									<p className="text-2xl font-bold text-foreground">
										{stats.season}
									</p>
								</div>
							</div>

							{/* Estadísticas por partido */}
							<div>
								<h3 className="text-lg font-semibold mb-4 text-foreground">
									Promedios por Partido
								</h3>
								<div className="grid grid-cols-2 md:grid-cols-3 gap-4">
									<div className="bg-card border border-border rounded-lg p-4">
										<p className="text-sm text-muted-foreground mb-1">
											Puntos
										</p>
										<p className="text-xl font-bold text-foreground">
											{stats.pointsPerGame}
										</p>
									</div>
									<div className="bg-card border border-border rounded-lg p-4">
										<p className="text-sm text-muted-foreground mb-1">
											Rebotes
										</p>
										<p className="text-xl font-bold text-foreground">
											{stats.reboundsPerGame}
										</p>
									</div>
									<div className="bg-card border border-border rounded-lg p-4">
										<p className="text-sm text-muted-foreground mb-1">
											Asistencias
										</p>
										<p className="text-xl font-bold text-foreground">
											{stats.assistsPerGame}
										</p>
									</div>
									<div className="bg-card border border-border rounded-lg p-4">
										<p className="text-sm text-muted-foreground mb-1">
											Robos
										</p>
										<p className="text-xl font-bold text-foreground">
											{stats.stealsPerGame}
										</p>
									</div>
									<div className="bg-card border border-border rounded-lg p-4">
										<p className="text-sm text-muted-foreground mb-1">
											Bloqueos
										</p>
										<p className="text-xl font-bold text-foreground">
											{stats.blocksPerGame}
										</p>
									</div>
								</div>
							</div>

							{/* Porcentajes */}
							<div>
								<h3 className="text-lg font-semibold mb-4 text-foreground">
									Porcentajes de Tiro
								</h3>
								<div className="grid grid-cols-3 gap-4">
									<div className="bg-card border border-border rounded-lg p-4">
										<p className="text-sm text-muted-foreground mb-1">
											FG%
										</p>
										<p className="text-xl font-bold text-foreground">
											{stats.fieldGoalPercentage}%
										</p>
									</div>
									<div className="bg-card border border-border rounded-lg p-4">
										<p className="text-sm text-muted-foreground mb-1">
											3PT%
										</p>
										<p className="text-xl font-bold text-foreground">
											{stats.threePointPercentage}%
										</p>
									</div>
									<div className="bg-card border border-border rounded-lg p-4">
										<p className="text-sm text-muted-foreground mb-1">
											FT%
										</p>
										<p className="text-xl font-bold text-foreground">
											{stats.freeThrowPercentage}%
										</p>
									</div>
								</div>
							</div>

							{/* Totales */}
							<div>
								<h3 className="text-lg font-semibold mb-4 text-foreground">
									Totales de Temporada
								</h3>
								<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
									<div className="bg-muted/30 rounded-lg p-3">
										<p className="text-xs text-muted-foreground mb-1">
											Rebotes Totales
										</p>
										<p className="text-lg font-semibold text-foreground">
											{stats.totalRebounds}
										</p>
									</div>
									<div className="bg-muted/30 rounded-lg p-3">
										<p className="text-xs text-muted-foreground mb-1">
											Asistencias Totales
										</p>
										<p className="text-lg font-semibold text-foreground">
											{stats.totalAssists}
										</p>
									</div>
									<div className="bg-muted/30 rounded-lg p-3">
										<p className="text-xs text-muted-foreground mb-1">
											Robos Totales
										</p>
										<p className="text-lg font-semibold text-foreground">
											{stats.totalSteals}
										</p>
									</div>
									<div className="bg-muted/30 rounded-lg p-3">
										<p className="text-xs text-muted-foreground mb-1">
											Bloqueos Totales
										</p>
										<p className="text-lg font-semibold text-foreground">
											{stats.totalBlocks}
										</p>
									</div>
								</div>
							</div>
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}

