import type { APIRoute } from "astro";
import { supabase } from "../../../lib/supabase";
import { getOrCreateUserTeam, getTeamPlayers } from "../../../lib/fantasy";

export const POST: APIRoute = async ({ request, cookies }) => {
    try {
        const accessToken = cookies.get("sb-access-token")?.value;
        const refreshToken = cookies.get("sb-refresh-token")?.value;

        if (!accessToken || !refreshToken) {
            return new Response(
                JSON.stringify({ success: false, error: "No autenticado" }),
                { status: 401, headers: { "Content-Type": "application/json" } }
            );
        }

        const session = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
        });

        if (session.error || !session.data.user) {
            return new Response(
                JSON.stringify({ success: false, error: "Sesión inválida" }),
                { status: 401, headers: { "Content-Type": "application/json" } }
            );
        }

        const userId = session.data.user.id;
        const { playerId, playerName, price } = await request.json();

        if (!playerId || !playerName || !price || price < 0) {
            return new Response(
                JSON.stringify({ success: false, error: "Datos incompletos o inválidos" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Obtener equipo del usuario
        const userTeam = await getOrCreateUserTeam(userId);
        if (!userTeam) {
            return new Response(
                JSON.stringify({ success: false, error: "Error obteniendo equipo" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        // Verificar presupuesto
        if (userTeam.budget < price) {
            return new Response(
                JSON.stringify({ success: false, error: "Presupuesto insuficiente" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Verificar límite de jugadores
        const currentPlayers = await getTeamPlayers(userTeam.id);
        if (currentPlayers.length >= 9) {
            return new Response(
                JSON.stringify({ success: false, error: "Ya tienes el máximo de jugadores (9)" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Verificar que el jugador no esté ya en el equipo
        const playerExists = currentPlayers.some(p => p.player_id === playerId);
        if (playerExists) {
            return new Response(
                JSON.stringify({ success: false, error: "Este jugador ya está en tu equipo" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Determinar si va como titular o suplente
        const startersCount = currentPlayers.filter(p => p.is_starter).length;
        const isStarter = startersCount < 5;

        // Agregar jugador al equipo
        const { error: insertError } = await supabase
            .from('players_on_team')
            .insert({
                team_id: userTeam.id,
                player_id: playerId,
                player_name: playerName,
                is_starter: isStarter,
                purchase_price: price,
                release_clause: null,
                purchased_from_user_id: null, // Jugador inicial, no comprado
                can_be_sold: true, // Los jugadores iniciales pueden venderse inmediatamente
            });

        if (insertError) {
            console.error('Error insertando jugador:', insertError);
            return new Response(
                JSON.stringify({ success: false, error: "Error agregando jugador al equipo" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        // Actualizar presupuesto
        const newBudget = userTeam.budget - price;
        const { data: updatedTeam, error: budgetError } = await supabase
            .from('user_teams')
            .update({ budget: newBudget })
            .eq('id', userTeam.id)
            .select()
            .single();

        if (budgetError) {
            console.error('Error actualizando presupuesto:', budgetError);
            // Si falla el presupuesto, intentar revertir la inserción del jugador
            await supabase
                .from('players_on_team')
                .delete()
                .eq('team_id', userTeam.id)
                .eq('player_id', playerId);
            
            return new Response(
                JSON.stringify({ success: false, error: "Error actualizando presupuesto" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        // Obtener el jugador recién agregado para confirmar
        const { data: addedPlayer } = await supabase
            .from('players_on_team')
            .select('*')
            .eq('team_id', userTeam.id)
            .eq('player_id', playerId)
            .single();

        return new Response(
            JSON.stringify({ 
                success: true, 
                message: "Jugador agregado exitosamente",
                player: addedPlayer,
                newBudget: updatedTeam?.budget || newBudget
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error('Error en add-initial-player:', error);
        return new Response(
            JSON.stringify({ success: false, error: "Error interno del servidor" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};

