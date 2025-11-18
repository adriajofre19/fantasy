import type { APIRoute } from "astro";
import { supabase } from "../../../lib/supabase";
import { getOrCreateUserTeam, getTeamPlayers } from "../../../lib/fantasy";
import { getPlayers } from "../../../lib/rapidapi-nba";

/**
 * Endpoint administrativo para agregar jugadores iniciales a un usuario específico
 * POST /api/admin/add-players-to-user
 * Body: { email: string, playerIds: number[], prices: number[] }
 */
export const POST: APIRoute = async ({ request }) => {
    try {
        const { email, playerIds, prices } = await request.json();

        if (!email || !playerIds || !prices || playerIds.length !== prices.length) {
            return new Response(
                JSON.stringify({ success: false, error: "Datos incompletos o inválidos" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Buscar usuario por email
        const { data: users, error: userError } = await supabase.auth.admin.listUsers();
        
        if (userError) {
            console.error('Error obteniendo usuarios:', userError);
            return new Response(
                JSON.stringify({ success: false, error: "Error obteniendo usuarios" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        const user = users.users.find(u => u.email === email);
        
        if (!user) {
            return new Response(
                JSON.stringify({ success: false, error: `Usuario con email ${email} no encontrado` }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        // Obtener o crear equipo del usuario
        const userTeam = await getOrCreateUserTeam(user.id);
        if (!userTeam) {
            return new Response(
                JSON.stringify({ success: false, error: "Error obteniendo/creando equipo" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        // Obtener jugadores actuales del equipo
        const currentPlayers = await getTeamPlayers(userTeam.id);
        
        // Obtener información de los jugadores de la NBA
        const nbaPlayersData = await getPlayers(2025);
        const nbaPlayers = nbaPlayersData.data || [];
        const nbaPlayersMap = new Map(nbaPlayers.map(p => [p.id, p]));

        // Verificar límites
        const totalPlayers = currentPlayers.length + playerIds.length;
        if (totalPlayers > 9) {
            return new Response(
                JSON.stringify({ success: false, error: `El usuario ya tiene ${currentPlayers.length} jugadores. Agregar ${playerIds.length} excedería el límite de 9` }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const startersCount = currentPlayers.filter(p => p.is_starter).length;
        const playersToAdd = [];

        // Preparar jugadores para agregar
        for (let i = 0; i < playerIds.length; i++) {
            const playerId = playerIds[i];
            const price = prices[i];
            const nbaPlayer = nbaPlayersMap.get(playerId);

            if (!nbaPlayer) {
                console.warn(`Jugador con ID ${playerId} no encontrado en la lista de NBA`);
                continue;
            }

            const playerName = `${nbaPlayer.first_name} ${nbaPlayer.last_name}`;
            const isStarter = startersCount + playersToAdd.length < 5;

            // Verificar que el jugador no esté ya en el equipo
            const alreadyExists = currentPlayers.some(p => p.player_id === playerId);
            if (alreadyExists) {
                console.warn(`Jugador ${playerName} ya está en el equipo`);
                continue;
            }

            playersToAdd.push({
                team_id: userTeam.id,
                player_id: playerId,
                player_name: playerName,
                is_starter: isStarter,
                purchase_price: price,
                release_clause: null,
                purchased_from_user_id: null,
                can_be_sold: true,
            });
        }

        if (playersToAdd.length === 0) {
            return new Response(
                JSON.stringify({ success: false, error: "No se pudieron agregar jugadores (ya existen o no se encontraron)" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Calcular costo total
        const totalCost = playersToAdd.reduce((sum, p) => sum + p.purchase_price, 0);

        // Verificar presupuesto
        if (userTeam.budget < totalCost) {
            return new Response(
                JSON.stringify({ success: false, error: `Presupuesto insuficiente. Necesitas $${totalCost.toLocaleString()} pero tienes $${userTeam.budget.toLocaleString()}` }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Insertar jugadores
        const { error: insertError } = await supabase
            .from('players_on_team')
            .insert(playersToAdd);

        if (insertError) {
            console.error('Error insertando jugadores:', insertError);
            return new Response(
                JSON.stringify({ success: false, error: "Error agregando jugadores al equipo" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        // Actualizar presupuesto
        const { error: budgetError } = await supabase
            .from('user_teams')
            .update({ budget: userTeam.budget - totalCost })
            .eq('id', userTeam.id);

        if (budgetError) {
            console.error('Error actualizando presupuesto:', budgetError);
        }

        return new Response(
            JSON.stringify({ 
                success: true, 
                message: `Se agregaron ${playersToAdd.length} jugadores exitosamente`,
                playersAdded: playersToAdd.map(p => p.player_name),
                totalCost,
                remainingBudget: userTeam.budget - totalCost
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error('Error en add-players-to-user:', error);
        return new Response(
            JSON.stringify({ success: false, error: "Error interno del servidor" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};

