/**
 * Funciones de utilidad para el sistema Fantasy NBA
 */

import { supabase } from './supabase';

export interface PlayerOnTeam {
    id: string;
    team_id: string;
    player_id: number;
    player_name: string;
    is_starter: boolean;
    purchase_price: number;
    release_clause: number | null;
    purchased_at: string;
    purchased_from_user_id: string | null;
    can_be_sold: boolean;
    created_at: string;
    updated_at: string;
}

export interface UserTeam {
    id: string;
    user_id: string;
    team_name: string;
    budget: number;
    created_at: string;
    updated_at: string;
}

export interface Transaction {
    id: string;
    buyer_team_id: string;
    seller_team_id: string;
    player_id: number;
    player_name: string;
    transaction_price: number;
    release_clause_paid: number | null;
    transaction_type: 'purchase' | 'sale';
    created_at: string;
}

/**
 * Obtiene o crea el equipo del usuario actual
 */
export async function getOrCreateUserTeam(userId: string): Promise<UserTeam | null> {
    try {
        // Intentar obtener el equipo existente
        const { data: existingTeam, error: fetchError } = await supabase
            .from('user_teams')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (existingTeam && !fetchError) {
            return existingTeam;
        }

        // Si no existe, crear uno nuevo
        const { data: newTeam, error: createError } = await supabase
            .from('user_teams')
            .insert({
                user_id: userId,
                team_name: `Equipo de ${userId.slice(0, 8)}`,
                budget: 1000000.00,
            })
            .select()
            .single();

        if (createError) {
            console.error('Error creando equipo:', createError);
            return null;
        }

        return newTeam;
    } catch (error) {
        console.error('Error en getOrCreateUserTeam:', error);
        return null;
    }
}

/**
 * Obtiene los jugadores del equipo del usuario
 */
export async function getTeamPlayers(teamId: string): Promise<PlayerOnTeam[]> {
    try {
        const { data, error } = await supabase
            .from('players_on_team')
            .select('*')
            .eq('team_id', teamId)
            .order('is_starter', { ascending: false })
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error obteniendo jugadores:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Error en getTeamPlayers:', error);
        return [];
    }
}

/**
 * Verifica si un jugador puede ser vendido (cooldown de 7 días)
 */
export function canPlayerBeSold(player: PlayerOnTeam): boolean {
    if (!player.purchased_at) {
        return true; // Jugador inicial, puede venderse
    }

    if (player.can_be_sold) {
        return true;
    }

    const purchaseDate = new Date(player.purchased_at);
    const now = new Date();
    const daysSincePurchase = (now.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24);

    return daysSincePurchase >= 7;
}

/**
 * Obtiene todos los jugadores disponibles en el mercado (de otros usuarios)
 */
export async function getMarketPlayers(excludeTeamId: string): Promise<PlayerOnTeam[]> {
    try {
        const { data, error } = await supabase
            .from('players_on_team')
            .select('*')
            .neq('team_id', excludeTeamId)
            .eq('can_be_sold', true);

        if (error) {
            console.error('Error obteniendo jugadores del mercado:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Error en getMarketPlayers:', error);
        return [];
    }
}

/**
 * Obtiene el presupuesto del equipo
 */
export async function getTeamBudget(teamId: string): Promise<number> {
    try {
        const { data, error } = await supabase
            .from('user_teams')
            .select('budget')
            .eq('id', teamId)
            .single();

        if (error || !data) {
            return 0;
        }

        return data.budget;
    } catch (error) {
        console.error('Error obteniendo presupuesto:', error);
        return 0;
    }
}

