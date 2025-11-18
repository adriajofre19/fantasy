-- Tabla para almacenar rankings calculados (caché)
-- Esto mejora significativamente el rendimiento al evitar recalcular los puntos cada vez

CREATE TABLE IF NOT EXISTS team_rankings_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES user_teams(id) ON DELETE CASCADE,
    team_name VARCHAR(100) NOT NULL,
    total_points DECIMAL(12, 2) DEFAULT 0,
    weekly_breakdown JSONB NOT NULL DEFAULT '{}', -- {weekNumber: points}
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, team_id)
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_team_rankings_cache_user_id ON team_rankings_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_team_rankings_cache_team_id ON team_rankings_cache(team_id);
CREATE INDEX IF NOT EXISTS idx_team_rankings_cache_total_points ON team_rankings_cache(total_points DESC);
CREATE INDEX IF NOT EXISTS idx_team_rankings_cache_calculated_at ON team_rankings_cache(calculated_at);

-- Trigger para actualizar updated_at automáticamente
DROP TRIGGER IF EXISTS update_team_rankings_cache_updated_at ON team_rankings_cache;
CREATE TRIGGER update_team_rankings_cache_updated_at BEFORE UPDATE ON team_rankings_cache
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Políticas RLS
ALTER TABLE team_rankings_cache ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios pueden ver todos los rankings (para clasificación)
DROP POLICY IF EXISTS "Users can view all rankings" ON team_rankings_cache;
CREATE POLICY "Users can view all rankings"
    ON team_rankings_cache FOR SELECT
    USING (true);

-- Política: Solo el sistema puede insertar/actualizar rankings (usando service role)
-- En producción, esto se hará desde el backend con service role key

