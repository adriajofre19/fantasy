-- Tabla para rastrear puntos semanales de jugadores por usuario
-- Esto permite calcular la clasificación basándose en cuándo cada usuario tenía fichado a cada jugador

CREATE TABLE IF NOT EXISTS player_weekly_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES user_teams(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL,
    player_name VARCHAR(200) NOT NULL,
    week_number INTEGER NOT NULL, -- Número de semana (1, 2, 3, etc.)
    week_start_date DATE NOT NULL, -- Fecha de inicio de la semana
    week_end_date DATE NOT NULL, -- Fecha de fin de la semana
    points DECIMAL(10, 2) DEFAULT 0, -- Puntos acumulados en esa semana
    purchase_date TIMESTAMP WITH TIME ZONE NOT NULL, -- Cuándo fue fichado
    sale_date TIMESTAMP WITH TIME ZONE, -- Cuándo fue vendido (null si aún lo tiene)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, player_id, week_number) -- Un usuario solo puede tener un registro por jugador por semana
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_player_weekly_points_user_id ON player_weekly_points(user_id);
CREATE INDEX IF NOT EXISTS idx_player_weekly_points_team_id ON player_weekly_points(team_id);
CREATE INDEX IF NOT EXISTS idx_player_weekly_points_player_id ON player_weekly_points(player_id);
CREATE INDEX IF NOT EXISTS idx_player_weekly_points_week ON player_weekly_points(week_number, week_start_date, week_end_date);
CREATE INDEX IF NOT EXISTS idx_player_weekly_points_dates ON player_weekly_points(purchase_date, sale_date);

-- Trigger para actualizar updated_at automáticamente
DROP TRIGGER IF EXISTS update_player_weekly_points_updated_at ON player_weekly_points;
CREATE TRIGGER update_player_weekly_points_updated_at BEFORE UPDATE ON player_weekly_points
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Políticas RLS
ALTER TABLE player_weekly_points ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios pueden ver todos los puntos semanales (para clasificación)
DROP POLICY IF EXISTS "Users can view all weekly points" ON player_weekly_points;
CREATE POLICY "Users can view all weekly points"
    ON player_weekly_points FOR SELECT
    USING (true);

-- Política: Los usuarios pueden insertar/actualizar sus propios puntos semanales
DROP POLICY IF EXISTS "Users can manage their weekly points" ON player_weekly_points;
CREATE POLICY "Users can manage their weekly points"
    ON player_weekly_points FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_teams
            WHERE user_teams.id = player_weekly_points.team_id
            AND user_teams.user_id = auth.uid()
        )
    );

