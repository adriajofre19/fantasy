-- Script SQL para agregar jugadores iniciales al usuario adria.ordis@gmail.com
-- Ejecutar en Supabase SQL Editor

-- Primero, obtener el user_id del usuario
-- SELECT id FROM auth.users WHERE email = 'adria.ordis@gmail.com';

-- Luego, ejecutar este script reemplazando 'USER_ID_AQUI' con el ID obtenido

DO $$
DECLARE
    v_user_id UUID;
    v_team_id UUID;
    v_budget DECIMAL;
    v_starters_count INTEGER;
    v_total_cost DECIMAL := 0;
BEGIN
    -- Obtener user_id
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'adria.ordis@gmail.com';
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado';
    END IF;
    
    -- Obtener o crear equipo
    SELECT id, budget INTO v_team_id, v_budget
    FROM user_teams
    WHERE user_id = v_user_id;
    
    IF v_team_id IS NULL THEN
        INSERT INTO user_teams (user_id, team_name, budget)
        VALUES (v_user_id, 'Equipo de Adria', 1000000.00)
        RETURNING id, budget INTO v_team_id, v_budget;
    END IF;
    
    -- Contar titulares y suplentes actuales
    SELECT COUNT(*) INTO v_starters_count
    FROM players_on_team
    WHERE team_id = v_team_id AND is_starter = TRUE;
    
    -- Agregar jugadores (solo si no existen ya)
    -- 5 titulares + 4 suplentes = 9 jugadores totales
    INSERT INTO players_on_team (
        team_id, player_id, player_name, is_starter, 
        purchase_price, release_clause, purchased_from_user_id, can_be_sold
    )
    SELECT 
        v_team_id,
        player_data.player_id,
        player_data.player_name,
        CASE 
            WHEN v_starters_count + row_number() OVER (ORDER BY player_data.player_id) <= 5 THEN TRUE 
            ELSE FALSE 
        END,
        player_data.price,
        NULL,
        NULL,
        TRUE
    FROM (
        VALUES
            -- Titulares (5)
            (2544, 'LeBron James', 500000),
            (203076, 'Stephen Curry', 450000),
            (201142, 'Kevin Durant', 400000),
            (203507, 'Giannis Antetokounmpo', 480000),
            (1628369, 'Jayson Tatum', 420000),
            -- Suplentes (4)
            (1629029, 'Luka Doncic', 380000),
            (1629028, 'Trae Young', 350000),
            (1629021, 'Deandre Ayton', 320000),
            (1629020, 'Marvin Bagley III', 300000)
    ) AS player_data(player_id, player_name, price)
    WHERE NOT EXISTS (
        SELECT 1 FROM players_on_team 
        WHERE team_id = v_team_id AND player_id = player_data.player_id
    );
    
    -- Calcular costo total de los jugadores agregados
    SELECT COALESCE(SUM(purchase_price), 0) INTO v_total_cost
    FROM players_on_team
    WHERE team_id = v_team_id
    AND player_id IN (2544, 203076, 201142, 203507, 1628369, 1629029, 1629028, 1629021, 1629020)
    AND purchased_from_user_id IS NULL; -- Solo los que acabamos de agregar
    
    -- Actualizar presupuesto
    UPDATE user_teams
    SET budget = budget - v_total_cost
    WHERE id = v_team_id;
    
    RAISE NOTICE 'Jugadores agregados exitosamente. Costo total: %', v_total_cost;
    RAISE NOTICE 'Presupuesto restante: %', v_budget - v_total_cost;
END $$;

