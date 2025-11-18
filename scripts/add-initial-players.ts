/**
 * Script para agregar jugadores iniciales a un usuario específico
 * Ejecutar con: npx tsx scripts/add-initial-players.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Necesitas la service role key para admin

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function addPlayersToUser() {
    const email = "adria.ordis@gmail.com";
    
    // Jugadores populares de la NBA con sus IDs y precios sugeridos
    const playersToAdd = [
        { playerId: 2544, name: "LeBron James", price: 500000 }, // LAL
        { playerId: 203076, name: "Stephen Curry", price: 450000 }, // GSW
        { playerId: 201142, name: "Kevin Durant", price: 400000 }, // PHX
        { playerId: 203507, name: "Giannis Antetokounmpo", price: 480000 }, // MIL
        { playerId: 1628369, name: "Jayson Tatum", price: 420000 }, // BOS
    ];

    try {
        // Buscar usuario por email
        const { data: users, error: userError } = await supabase.auth.admin.listUsers();
        
        if (userError) {
            console.error("Error obteniendo usuarios:", userError);
            return;
        }

        const user = users.users.find(u => u.email === email);
        
        if (!user) {
            console.error(`Usuario con email ${email} no encontrado`);
            return;
        }

        console.log(`Usuario encontrado: ${user.email} (ID: ${user.id})`);

        // Obtener o crear equipo
        let { data: team, error: teamError } = await supabase
            .from('user_teams')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (teamError || !team) {
            // Crear equipo si no existe
            const { data: newTeam, error: createError } = await supabase
                .from('user_teams')
                .insert({
                    user_id: user.id,
                    team_name: `Equipo de ${user.email?.split('@')[0] || 'Usuario'}`,
                    budget: 1000000.00,
                })
                .select()
                .single();

            if (createError || !newTeam) {
                console.error("Error creando equipo:", createError);
                return;
            }

            team = newTeam;
            console.log("Equipo creado:", team.id);
        } else {
            console.log("Equipo existente encontrado:", team.id);
        }

        // Obtener jugadores actuales
        const { data: currentPlayers } = await supabase
            .from('players_on_team')
            .select('*')
            .eq('team_id', team.id);

        const currentPlayerIds = (currentPlayers || []).map(p => p.player_id);
        const startersCount = (currentPlayers || []).filter(p => p.is_starter).length;

        // Filtrar jugadores que no están ya en el equipo
        const playersToInsert = playersToAdd
            .filter(p => !currentPlayerIds.includes(p.playerId))
            .map((p, index) => ({
                team_id: team.id,
                player_id: p.playerId,
                player_name: p.name,
                is_starter: startersCount + index < 5,
                purchase_price: p.price,
                release_clause: null,
                purchased_from_user_id: null,
                can_be_sold: true,
            }));

        if (playersToInsert.length === 0) {
            console.log("Todos los jugadores ya están en el equipo");
            return;
        }

        // Calcular costo total
        const totalCost = playersToInsert.reduce((sum, p) => sum + p.purchase_price, 0);

        if (team.budget < totalCost) {
            console.error(`Presupuesto insuficiente. Necesitas $${totalCost} pero tienes $${team.budget}`);
            return;
        }

        // Insertar jugadores
        const { error: insertError } = await supabase
            .from('players_on_team')
            .insert(playersToInsert);

        if (insertError) {
            console.error("Error insertando jugadores:", insertError);
            return;
        }

        // Actualizar presupuesto
        const { error: budgetError } = await supabase
            .from('user_teams')
            .update({ budget: team.budget - totalCost })
            .eq('id', team.id);

        if (budgetError) {
            console.error("Error actualizando presupuesto:", budgetError);
            return;
        }

        console.log(`✅ Jugadores agregados exitosamente:`);
        playersToInsert.forEach(p => {
            console.log(`   - ${p.player_name} (${p.is_starter ? 'Titular' : 'Suplente'}) - $${p.purchase_price.toLocaleString()}`);
        });
        console.log(`💰 Costo total: $${totalCost.toLocaleString()}`);
        console.log(`💵 Presupuesto restante: $${(team.budget - totalCost).toLocaleString()}`);
    } catch (error) {
        console.error("Error:", error);
    }
}

addPlayersToUser();

