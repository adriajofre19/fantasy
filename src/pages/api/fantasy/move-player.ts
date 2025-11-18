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
        const { playerId, isStarter } = await request.json();

        if (!playerId || typeof isStarter !== 'boolean') {
            return new Response(
                JSON.stringify({ success: false, error: "Datos incompletos" }),
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

        // Obtener jugadores actuales
        const currentPlayers = await getTeamPlayers(userTeam.id);
        
        // Encontrar el jugador que se está moviendo
        const playerToMove = currentPlayers.find(p => p.id === playerId);
        if (!playerToMove) {
            return new Response(
                JSON.stringify({ success: false, error: "Jugador no encontrado" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        // Si el jugador ya está en la posición deseada, no hacer nada
        if (playerToMove.is_starter === isStarter) {
            return new Response(
                JSON.stringify({ success: true, message: "El jugador ya está en esa posición" }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        // Verificar límites solo si el jugador está cambiando de categoría
        // Si va de suplente a titular
        if (isStarter && !playerToMove.is_starter) {
            const startersCount = currentPlayers.filter(p => p.is_starter && p.id !== playerId).length;
            if (startersCount >= 5) {
                return new Response(
                    JSON.stringify({ success: false, error: "Ya tienes 5 jugadores titulares" }),
                    { status: 400, headers: { "Content-Type": "application/json" } }
                );
            }
        }
        
        // Si va de titular a suplente
        if (!isStarter && playerToMove.is_starter) {
            const benchCount = currentPlayers.filter(p => !p.is_starter && p.id !== playerId).length;
            if (benchCount >= 4) {
                return new Response(
                    JSON.stringify({ success: false, error: "Ya tienes 4 jugadores suplentes" }),
                    { status: 400, headers: { "Content-Type": "application/json" } }
                );
            }
        }

        // Verificar que el jugador pertenece al equipo del usuario
        const player = currentPlayers.find(p => p.id === playerId);
        if (!player || player.team_id !== userTeam.id) {
            return new Response(
                JSON.stringify({ success: false, error: "Jugador no encontrado en tu equipo" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        // Actualizar posición del jugador
        const { error } = await supabase
            .from('players_on_team')
            .update({ is_starter: isStarter })
            .eq('id', playerId)
            .eq('team_id', userTeam.id);

        if (error) {
            return new Response(
                JSON.stringify({ success: false, error: "Error actualizando jugador" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ success: true, message: "Jugador movido exitosamente" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error('Error en move-player:', error);
        return new Response(
            JSON.stringify({ success: false, error: "Error interno del servidor" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};

