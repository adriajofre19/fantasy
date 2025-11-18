import type { APIRoute } from "astro";
import { supabase } from "../../../lib/supabase";
import { getOrCreateUserTeam, getTeamBudget, getTeamPlayers } from "../../../lib/fantasy";

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
        const { playerOnTeamId, price } = await request.json();

        if (!playerOnTeamId || !price) {
            return new Response(
                JSON.stringify({ success: false, error: "Datos incompletos" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Obtener equipo del comprador
        const buyerTeam = await getOrCreateUserTeam(userId);
        if (!buyerTeam) {
            return new Response(
                JSON.stringify({ success: false, error: "Error obteniendo equipo" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        // Verificar presupuesto
        const budget = await getTeamBudget(buyerTeam.id);
        if (budget < price) {
            return new Response(
                JSON.stringify({ success: false, error: "Presupuesto insuficiente" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Verificar límite de jugadores (máximo 9: 5 titulares + 4 suplentes)
        const currentPlayers = await getTeamPlayers(buyerTeam.id);
        if (currentPlayers.length >= 9) {
            return new Response(
                JSON.stringify({ success: false, error: "Ya tienes el máximo de jugadores (9)" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Obtener información del jugador a comprar
        const { data: playerToBuy, error: fetchError } = await supabase
            .from('players_on_team')
            .select('*, user_teams!inner(user_id)')
            .eq('id', playerOnTeamId)
            .single();

        if (fetchError || !playerToBuy) {
            return new Response(
                JSON.stringify({ success: false, error: "Jugador no encontrado" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        // Verificar que el jugador puede ser vendido
        if (!playerToBuy.can_be_sold) {
            return new Response(
                JSON.stringify({ success: false, error: "Este jugador no está disponible para venta (cooldown de 7 días)" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Verificar que no es el mismo usuario
        if (playerToBuy.user_teams.user_id === userId) {
            return new Response(
                JSON.stringify({ success: false, error: "No puedes comprar tu propio jugador" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const sellerTeamId = playerToBuy.team_id;
        // Obtener el user_id del vendedor desde playerToBuy (ya viene en la consulta)
        const sellerUserId = (playerToBuy.user_teams as any)?.user_id;

        if (!sellerUserId) {
            return new Response(
                JSON.stringify({ success: false, error: "Error obteniendo información del vendedor" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        // Realizar la transacción en una transacción de base de datos
        // 1. Actualizar presupuesto del comprador
        const { error: buyerBudgetError } = await supabase
            .from('user_teams')
            .update({ budget: budget - price })
            .eq('id', buyerTeam.id);

        if (buyerBudgetError) {
            return new Response(
                JSON.stringify({ success: false, error: "Error actualizando presupuesto del comprador" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        // 2. Actualizar presupuesto del vendedor
        const { data: sellerTeam } = await supabase
            .from('user_teams')
            .select('budget, user_id')
            .eq('id', sellerTeamId)
            .single();

        if (sellerTeam) {
            const { error: sellerBudgetError } = await supabase
                .from('user_teams')
                .update({ budget: sellerTeam.budget + price })
                .eq('id', sellerTeamId);

            if (sellerBudgetError) {
                console.error('Error actualizando presupuesto del vendedor:', sellerBudgetError);
            }
        }

        // 3. Mover el jugador al equipo del comprador
        // Usar el user_id del vendedor (sellerUserId) en lugar del comprador (userId)
        const { error: moveError } = await supabase
            .from('players_on_team')
            .update({
                team_id: buyerTeam.id,
                purchase_price: price,
                release_clause: null, // La cláusula se resetea
                purchased_from_user_id: sellerUserId, // ID del usuario que VENDIÓ el jugador (no el que lo compró)
                purchased_at: new Date().toISOString(),
                can_be_sold: false, // Cooldown de 7 días
                is_starter: currentPlayers.length < 5, // Si hay espacio, ponerlo como titular
            })
            .eq('id', playerOnTeamId);

        if (moveError) {
            return new Response(
                JSON.stringify({ success: false, error: "Error moviendo jugador" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        // 4. Registrar la transacción
        await supabase
            .from('transactions')
            .insert({
                buyer_team_id: buyerTeam.id,
                seller_team_id: sellerTeamId,
                player_id: playerToBuy.player_id,
                player_name: playerToBuy.player_name,
                transaction_price: price,
                release_clause_paid: playerToBuy.release_clause || null,
                transaction_type: 'purchase',
            });

        return new Response(
            JSON.stringify({ success: true, message: "Jugador comprado exitosamente" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error('Error en buy-player:', error);
        return new Response(
            JSON.stringify({ success: false, error: "Error interno del servidor" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};

