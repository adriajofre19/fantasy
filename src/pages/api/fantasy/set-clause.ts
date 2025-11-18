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
        const { playerId, releaseClause } = await request.json();

        if (!playerId || releaseClause === undefined || releaseClause < 0) {
            return new Response(
                JSON.stringify({ success: false, error: "Datos inválidos" }),
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

        // Verificar que el jugador pertenece al equipo del usuario
        const currentPlayers = await getTeamPlayers(userTeam.id);
        const player = currentPlayers.find(p => p.id === playerId);
        
        if (!player || player.team_id !== userTeam.id) {
            return new Response(
                JSON.stringify({ success: false, error: "Jugador no encontrado en tu equipo" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        // Obtener presupuesto actualizado
        const { data: currentTeam, error: teamError } = await supabase
            .from('user_teams')
            .select('budget')
            .eq('id', userTeam.id)
            .single();

        if (teamError || !currentTeam) {
            return new Response(
                JSON.stringify({ success: false, error: "Error obteniendo presupuesto" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        const currentBudget = parseFloat(currentTeam.budget);
        const currentClause = player.release_clause ? parseFloat(player.release_clause.toString()) : 0;
        const newClause = releaseClause === 0 ? 0 : releaseClause;
        
        // Calcular la diferencia: si la nueva cláusula es mayor, hay que pagar la diferencia
        // Si es menor o se elimina, se devuelve dinero
        const clauseDifference = newClause - currentClause;

        // Si se está estableciendo/actualizando una cláusula mayor, verificar presupuesto
        if (clauseDifference > 0 && currentBudget < clauseDifference) {
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: `Presupuesto insuficiente. Necesitas $${clauseDifference.toLocaleString()} pero tienes $${currentBudget.toLocaleString()}` 
                }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Actualizar presupuesto
        const newBudget = currentBudget - clauseDifference;
        const { error: budgetError } = await supabase
            .from('user_teams')
            .update({ budget: newBudget })
            .eq('id', userTeam.id);

        if (budgetError) {
            return new Response(
                JSON.stringify({ success: false, error: "Error actualizando presupuesto" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        // Actualizar cláusula (null si es 0 para eliminar la cláusula)
        const clauseValue = releaseClause === 0 ? null : releaseClause;
        
        const { error } = await supabase
            .from('players_on_team')
            .update({ release_clause: clauseValue })
            .eq('id', playerId)
            .eq('team_id', userTeam.id);

        if (error) {
            // Rollback del presupuesto si falla la actualización de la cláusula
            await supabase
                .from('user_teams')
                .update({ budget: currentBudget })
                .eq('id', userTeam.id);
            
            return new Response(
                JSON.stringify({ success: false, error: "Error actualizando cláusula" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ 
                success: true, 
                message: clauseValue 
                    ? `Cláusula establecida exitosamente. Se han descontado $${clauseDifference.toLocaleString()} de tu presupuesto.` 
                    : `Cláusula eliminada exitosamente. Se han devuelto $${Math.abs(clauseDifference).toLocaleString()} a tu presupuesto.`,
                newBudget: newBudget,
                clauseDifference: clauseDifference
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error('Error en set-clause:', error);
        return new Response(
            JSON.stringify({ success: false, error: "Error interno del servidor" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};

