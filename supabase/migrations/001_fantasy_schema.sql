-- Esquema de base de datos para Fantasy NBA

-- Tabla para equipos de usuarios (cada usuario tiene un equipo)
CREATE TABLE IF NOT EXISTS user_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    team_name VARCHAR(100) NOT NULL,
    budget DECIMAL(12, 2) DEFAULT 1000000.00, -- Presupuesto inicial: 1 millón
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Tabla para jugadores en equipos de usuarios
CREATE TABLE IF NOT EXISTS players_on_team (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES user_teams(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL, -- ID del jugador de la NBA
    player_name VARCHAR(200) NOT NULL,
    is_starter BOOLEAN DEFAULT FALSE, -- true = titular, false = suplente
    purchase_price DECIMAL(12, 2) NOT NULL, -- Precio al que se compró
    release_clause DECIMAL(12, 2), -- Cláusula de rescisión (opcional)
    purchased_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    purchased_from_user_id UUID REFERENCES auth.users(id), -- Usuario del que se compró
    can_be_sold BOOLEAN DEFAULT TRUE, -- false durante los 7 días después de compra
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(team_id, player_id) -- Un jugador solo puede estar una vez en un equipo
);

-- Tabla para transacciones (historial de compras/ventas)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_team_id UUID NOT NULL REFERENCES user_teams(id) ON DELETE CASCADE,
    seller_team_id UUID NOT NULL REFERENCES user_teams(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL,
    player_name VARCHAR(200) NOT NULL,
    transaction_price DECIMAL(12, 2) NOT NULL,
    release_clause_paid DECIMAL(12, 2), -- Cláusula pagada (si aplica)
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('purchase', 'sale')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_user_teams_user_id ON user_teams(user_id);
CREATE INDEX IF NOT EXISTS idx_players_on_team_team_id ON players_on_team(team_id);
CREATE INDEX IF NOT EXISTS idx_players_on_team_player_id ON players_on_team(player_id);
CREATE INDEX IF NOT EXISTS idx_players_on_team_can_be_sold ON players_on_team(can_be_sold);
CREATE INDEX IF NOT EXISTS idx_transactions_buyer ON transactions(buyer_team_id);
CREATE INDEX IF NOT EXISTS idx_transactions_seller ON transactions(seller_team_id);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para actualizar updated_at (usar DROP IF EXISTS para evitar errores si ya existen)
DROP TRIGGER IF EXISTS update_user_teams_updated_at ON user_teams;
CREATE TRIGGER update_user_teams_updated_at BEFORE UPDATE ON user_teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_players_on_team_updated_at ON players_on_team;
CREATE TRIGGER update_players_on_team_updated_at BEFORE UPDATE ON players_on_team
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para verificar límites de jugadores (5 titulares, 4 suplentes máximo)
-- Esta función solo verifica cuando se AGREGA un jugador nuevo o se CAMBIA de categoría
CREATE OR REPLACE FUNCTION check_player_limits()
RETURNS TRIGGER AS $$
DECLARE
    starter_count INTEGER;
    bench_count INTEGER;
    old_is_starter BOOLEAN;
BEGIN
    -- Si es un UPDATE, verificar si realmente está cambiando de categoría
    IF TG_OP = 'UPDATE' THEN
        old_is_starter := OLD.is_starter;
        
        -- Si no está cambiando de categoría, no hacer nada
        IF OLD.is_starter = NEW.is_starter THEN
            RETURN NEW;
        END IF;
        
        -- Si está cambiando de suplente a titular
        IF NEW.is_starter = TRUE AND old_is_starter = FALSE THEN
            SELECT COUNT(*) INTO starter_count
            FROM players_on_team
            WHERE team_id = NEW.team_id AND is_starter = TRUE AND id != NEW.id;
            
            -- Permitir si hay menos de 5 titulares (el jugador que se mueve ocupará el lugar)
            IF starter_count >= 5 THEN
                RAISE EXCEPTION 'No se pueden tener más de 5 jugadores titulares';
            END IF;
        END IF;
        
        -- Si está cambiando de titular a suplente
        IF NEW.is_starter = FALSE AND old_is_starter = TRUE THEN
            SELECT COUNT(*) INTO bench_count
            FROM players_on_team
            WHERE team_id = NEW.team_id AND is_starter = FALSE AND id != NEW.id;
            
            -- Permitir si hay menos de 4 suplentes (el jugador que se mueve ocupará el lugar)
            IF bench_count >= 4 THEN
                RAISE EXCEPTION 'No se pueden tener más de 4 jugadores suplentes';
            END IF;
        END IF;
        
        RETURN NEW;
    END IF;
    
    -- Si es un INSERT, verificar límites normalmente
    IF TG_OP = 'INSERT' THEN
        -- Contar titulares
        SELECT COUNT(*) INTO starter_count
        FROM players_on_team
        WHERE team_id = NEW.team_id AND is_starter = TRUE AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);
        
        -- Contar suplentes
        SELECT COUNT(*) INTO bench_count
        FROM players_on_team
        WHERE team_id = NEW.team_id AND is_starter = FALSE AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);
        
        -- Verificar límites
        IF NEW.is_starter = TRUE AND starter_count >= 5 THEN
            RAISE EXCEPTION 'No se pueden tener más de 5 jugadores titulares';
        END IF;
        
        IF NEW.is_starter = FALSE AND bench_count >= 4 THEN
            RAISE EXCEPTION 'No se pueden tener más de 4 jugadores suplentes';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para verificar límites antes de insertar/actualizar (usar DROP IF EXISTS para evitar errores si ya existe)
DROP TRIGGER IF EXISTS check_player_limits_trigger ON players_on_team;
CREATE TRIGGER check_player_limits_trigger
    BEFORE INSERT OR UPDATE ON players_on_team
    FOR EACH ROW EXECUTE FUNCTION check_player_limits();

-- Función para establecer can_be_sold = false por 7 días después de compra
CREATE OR REPLACE FUNCTION set_purchase_cooldown()
RETURNS TRIGGER AS $$
BEGIN
    -- Si se acaba de comprar (purchased_from_user_id no es null), establecer cooldown
    IF NEW.purchased_from_user_id IS NOT NULL THEN
        NEW.can_be_sold = FALSE;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS set_purchase_cooldown_trigger ON players_on_team;
CREATE TRIGGER set_purchase_cooldown_trigger
    BEFORE INSERT OR UPDATE ON players_on_team
    FOR EACH ROW EXECUTE FUNCTION set_purchase_cooldown();

-- Función para verificar si pasaron 7 días y permitir venta
CREATE OR REPLACE FUNCTION check_cooldown_expired()
RETURNS TRIGGER AS $$
BEGIN
    -- Si pasaron 7 días desde la compra, permitir venta
    IF NEW.purchased_at IS NOT NULL AND 
       NEW.purchased_at < NOW() - INTERVAL '7 days' AND
       NEW.can_be_sold = FALSE THEN
        NEW.can_be_sold = TRUE;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS check_cooldown_expired_trigger ON players_on_team;
CREATE TRIGGER check_cooldown_expired_trigger
    BEFORE UPDATE ON players_on_team
    FOR EACH ROW EXECUTE FUNCTION check_cooldown_expired();

-- Políticas RLS (Row Level Security)
ALTER TABLE user_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players_on_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios solo pueden ver/editar su propio equipo (usar DROP IF EXISTS para evitar errores)
DROP POLICY IF EXISTS "Users can view their own team" ON user_teams;
CREATE POLICY "Users can view their own team"
    ON user_teams FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own team" ON user_teams;
CREATE POLICY "Users can update their own team"
    ON user_teams FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own team" ON user_teams;
CREATE POLICY "Users can insert their own team"
    ON user_teams FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Política: Los usuarios pueden ver jugadores de su equipo
DROP POLICY IF EXISTS "Users can view players in their team" ON players_on_team;
CREATE POLICY "Users can view players in their team"
    ON players_on_team FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_teams
            WHERE user_teams.id = players_on_team.team_id
            AND user_teams.user_id = auth.uid()
        )
    );

-- Política: Los usuarios pueden ver jugadores de otros equipos (para mercado)
DROP POLICY IF EXISTS "Users can view all players for market" ON players_on_team;
CREATE POLICY "Users can view all players for market"
    ON players_on_team FOR SELECT
    USING (true);

-- Política: Los usuarios pueden insertar/actualizar jugadores en su equipo
DROP POLICY IF EXISTS "Users can manage players in their team" ON players_on_team;
CREATE POLICY "Users can manage players in their team"
    ON players_on_team FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_teams
            WHERE user_teams.id = players_on_team.team_id
            AND user_teams.user_id = auth.uid()
        )
    );

-- Política: Los usuarios pueden ver todas las transacciones
DROP POLICY IF EXISTS "Users can view all transactions" ON transactions;
CREATE POLICY "Users can view all transactions"
    ON transactions FOR SELECT
    USING (true);

-- Política: Los usuarios pueden crear transacciones
DROP POLICY IF EXISTS "Users can create transactions" ON transactions;
CREATE POLICY "Users can create transactions"
    ON transactions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_teams
            WHERE user_teams.id = transactions.buyer_team_id
            AND user_teams.user_id = auth.uid()
        )
    );

