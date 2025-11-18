import type { APIRoute } from "astro";
import { supabase } from "../../../lib/supabase";
import { getOrCreateUserTeam, getTeamPlayers } from "../../../lib/fantasy";

/**
 * Endpoint para agregar jugadores iniciales al usuario adria.ordis@gmail.com
 * GET /api/admin/add-players-adria
 */
export const GET: APIRoute = async () => {
    try {
        const email = "adria.ordis@gmail.com";
        
        // Jugadores populares de la NBA con sus IDs y precios
        const playersToAdd = [
            { playerId: 2544, name: "LeBron James", price: 500000 },
            { playerId: 203076, name: "Stephen Curry", price: 450000 },
            { playerId: 201142, name: "Kevin Durant", price: 400000 },
            { playerId: 203507, name: "Giannis Antetokounmpo", price: 480000 },
            { playerId: 1628369, name: "Jayson Tatum", price: 420000 },
        ];

        // Buscar usuario por email usando auth.users directamente
        // Necesitamos usar una consulta SQL directa ya que no tenemos admin access
        const { data: userData, error: userError } = await supabase
            .from('auth.users')
            .select('id, email')
            .eq('email', email)
            .single();

        // Si no funciona con auth.users, intentar obtener el user_id desde user_teams
        let userId: string | null = null;
        
        if (userError || !userData) {
            // Intentar obtener desde user_teams si existe
            const { data: teamData } = await supabase
                .from('user_teams')
                .select('user_id')
                .limit(1);
            
            // Si esto tampoco funciona, necesitamos usar el admin API
            // Por ahora, vamos a crear un método alternativo
            console.log("No se pudo obtener el usuario directamente. Usando método alternativo...");
            
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: "Para agregar jugadores, necesitas ejecutar el script directamente o usar el admin API de Supabase",
                    instructions: [
                        "1. Ve a Supabase Dashboard > SQL Editor",
                        "2. Ejecuta la siguiente consulta para obtener el user_id:",
                        `   SELECT id FROM auth.users WHERE email = '${email}';`,
                        "3. Luego ejecuta el script add-players-to-user.ts con el user_id obtenido"
                    ]
                }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        userId = userData.id;

        // Obtener o crear equipo
        const userTeam = await getOrCreateUserTeam(userId);
        if (!userTeam) {
            return new Response(
                JSON.stringify({ success: false, error: "Error obteniendo/creando equipo" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        // Obtener jugadores actuales
        const currentPlayers = await getTeamPlayers(userTeam.id);
        const currentPlayerIds = currentPlayers.map(p => p.player_id);
        const startersCount = currentPlayers.filter(p => p.is_starter).length;

        // Preparar jugadores para insertar
        const playersToInsert = playersToAdd
            .filter(p => !currentPlayerIds.includes(p.playerId))
            .map((p, index) => ({
                team_id: userTeam.id,
                player_id: p.playerId,
                player_name: p.name,
                is_starter: startersCount + index < 5,
                purchase_price: p.price,
                release_clause: null,
                purchased_from_user_id: null,
                can_be_sold: true,
            }));

        if (playersToInsert.length === 0) {
            return new Response(
                JSON.stringify({ success: true, message: "Todos los jugadores ya están en el equipo" }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        // Calcular costo total
        const totalCost = playersToInsert.reduce((sum, p) => sum + p.purchase_price, 0);

        if (userTeam.budget < totalCost) {
            return new Response(
                JSON.stringify({ 
                    success: false, 
                    error: `Presupuesto insuficiente. Necesitas $${totalCost.toLocaleString()} pero tienes $${userTeam.budget.toLocaleString()}` 
                }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Insertar jugadores
        const { error: insertError } = await supabase
            .from('players_on_team')
            .insert(playersToInsert);

        if (insertError) {
            console.error("Error insertando jugadores:", insertError);
            return new Response(
                JSON.stringify({ success: false, error: "Error agregando jugadores al equipo", details: insertError.message }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        // Actualizar presupuesto
        const { error: budgetError } = await supabase
            .from('user_teams')
            .update({ budget: userTeam.budget - totalCost })
            .eq('id', userTeam.id);

        if (budgetError) {
            console.error("Error actualizando presupuesto:", budgetError);
        }

        return new Response(
            JSON.stringify({ 
                success: true, 
                message: `Se agregaron ${playersToInsert.length} jugadores exitosamente`,
                playersAdded: playersToInsert.map(p => ({
                    name: p.player_name,
                    position: p.is_starter ? 'Titular' : 'Suplente',
                    price: p.purchase_price
                })),
                totalCost,
                remainingBudget: userTeam.budget - totalCost
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error:", error);
        return new Response(
            JSON.stringify({ success: false, error: "Error interno del servidor", details: error instanceof Error ? error.message : String(error) }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};

