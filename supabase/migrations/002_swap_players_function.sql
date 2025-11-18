-- Función SQL para intercambiar dos jugadores sin verificar límites
-- Esto permite intercambiar un titular con un suplente sin problemas de límites
-- La función deshabilita temporalmente el trigger de límites durante el intercambio

CREATE OR REPLACE FUNCTION swap_players(
    p_player1_id UUID,
    p_player2_id UUID,
    p_team_id UUID
)
RETURNS JSON AS $$
DECLARE
    player1_record RECORD;
    player2_record RECORD;
    player1_old_position BOOLEAN;
    player2_old_position BOOLEAN;
BEGIN
    -- Obtener información de ambos jugadores
    SELECT * INTO player1_record
    FROM players_on_team
    WHERE id = p_player1_id AND team_id = p_team_id;
    
    SELECT * INTO player2_record
    FROM players_on_team
    WHERE id = p_player2_id AND team_id = p_team_id;
    
    -- Verificar que ambos jugadores existen y pertenecen al mismo equipo
    IF player1_record IS NULL OR player2_record IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Uno o ambos jugadores no encontrados'
        );
    END IF;
    
    -- Verificar que están en diferentes categorías
    IF player1_record.is_starter = player2_record.is_starter THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Los jugadores están en la misma categoría'
        );
    END IF;
    
    -- Guardar posiciones originales
    player1_old_position := player1_record.is_starter;
    player2_old_position := player2_record.is_starter;
    
    -- Deshabilitar temporalmente el trigger de límites
    ALTER TABLE players_on_team DISABLE TRIGGER check_player_limits_trigger;
    
    BEGIN
        -- Intercambiar posiciones
        UPDATE players_on_team
        SET is_starter = player2_old_position
        WHERE id = p_player1_id AND team_id = p_team_id;
        
        UPDATE players_on_team
        SET is_starter = player1_old_position
        WHERE id = p_player2_id AND team_id = p_team_id;
        
        -- Rehabilitar el trigger
        ALTER TABLE players_on_team ENABLE TRIGGER check_player_limits_trigger;
        
        RETURN json_build_object(
            'success', true,
            'message', 'Jugadores intercambiados exitosamente'
        );
    EXCEPTION
        WHEN OTHERS THEN
            -- En caso de error, rehabilitar el trigger y propagar el error
            ALTER TABLE players_on_team ENABLE TRIGGER check_player_limits_trigger;
            RAISE;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Dar permisos a los usuarios autenticados
GRANT EXECUTE ON FUNCTION swap_players(UUID, UUID, UUID) TO authenticated;

