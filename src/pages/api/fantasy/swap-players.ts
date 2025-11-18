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
            console.error('Error de sesión:', session.error);
            return new Response(
                JSON.stringify({ success: false, error: "Sesión inválida" }),
                { status: 401, headers: { "Content-Type": "application/json" } }
            );
        }

        const userId = session.data.user.id;
        const { player1Id, player2Id } = await request.json();
        
        // Crear un cliente de Supabase con el token de acceso para las operaciones
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseClient = createClient(
            import.meta.env.SUPABASE_URL,
            import.meta.env.SUPABASE_ANON_KEY,
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                },
            }
        );

        if (!player1Id || !player2Id) {
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
        
        const player1 = currentPlayers.find(p => p.id === player1Id);
        const player2 = currentPlayers.find(p => p.id === player2Id);

        if (!player1 || !player2 || player1.team_id !== userTeam.id || player2.team_id !== userTeam.id) {
            return new Response(
                JSON.stringify({ success: false, error: "Uno o ambos jugadores no encontrados en tu equipo" }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        // Si ambos están en la misma posición, no es un intercambio válido
        if (player1.is_starter === player2.is_starter) {
            return new Response(
                JSON.stringify({ success: false, error: "Los jugadores están en la misma categoría. Usa la función de mover individual." }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Intentar usar función SQL primero, si falla usar método alternativo
        let swapSuccess = false;
        
        try {
            const { data: swapResult, error: swapError } = await supabaseClient.rpc('swap_players', {
                p_player1_id: player1Id,
                p_player2_id: player2Id,
                p_team_id: userTeam.id
            });

            if (swapError) {
                console.log('Error en función RPC swap_players:', swapError);
                // Continuar con método alternativo
            } else if (swapResult) {
                // La función retorna JSON, verificar el resultado
                if (typeof swapResult === 'object' && 'success' in swapResult) {
                    if (swapResult.success) {
                        swapSuccess = true;
                    } else {
                        return new Response(
                            JSON.stringify({ success: false, error: swapResult.error || 'Error al intercambiar jugadores' }),
                            { status: 400, headers: { "Content-Type": "application/json" } }
                        );
                    }
                } else if (swapResult === true) {
                    swapSuccess = true;
                }
            }
        } catch (rpcError) {
            console.log('Excepción al llamar función RPC, usando método alternativo:', rpcError);
            // Continuar con método alternativo
        }

        // Si la función RPC no funcionó, usar método alternativo
        if (!swapSuccess) {
            // Intercambiar posiciones manualmente
            // Estrategia: mover primero el que va de suplente a titular (crea espacio),
            // luego mover el que va de titular a suplente (ocupa el espacio creado)
            const player1NewPosition = !player1.is_starter;
            const player2NewPosition = !player2.is_starter;

            // Determinar el orden: mover primero el que va de suplente a titular
            let firstPlayerId, firstPlayerNewPosition, firstPlayerOldPosition;
            let secondPlayerId, secondPlayerNewPosition, secondPlayerOldPosition;

            if (player1.is_starter && !player2.is_starter) {
                // player1 es titular, player2 es suplente
                // Mover primero player2 (suplente -> titular), luego player1 (titular -> suplente)
                firstPlayerId = player2Id;
                firstPlayerNewPosition = true;
                firstPlayerOldPosition = false;
                secondPlayerId = player1Id;
                secondPlayerNewPosition = false;
                secondPlayerOldPosition = true;
            } else {
                // player2 es titular, player1 es suplente
                // Mover primero player1 (suplente -> titular), luego player2 (titular -> suplente)
                firstPlayerId = player1Id;
                firstPlayerNewPosition = true;
                firstPlayerOldPosition = false;
                secondPlayerId = player2Id;
                secondPlayerNewPosition = false;
                secondPlayerOldPosition = true;
            }

            // Primero mover el suplente a titular (esto crea espacio en suplentes)
            console.log(`Moviendo jugador ${firstPlayerId} de ${firstPlayerOldPosition ? 'titular' : 'suplente'} a ${firstPlayerNewPosition ? 'titular' : 'suplente'}`);
            const { data: update1Data, error: error1 } = await supabaseClient
                .from('players_on_team')
                .update({ is_starter: firstPlayerNewPosition })
                .eq('id', firstPlayerId)
                .eq('team_id', userTeam.id)
                .select();

            if (error1) {
                console.error('Error actualizando primer jugador:', error1);
                return new Response(
                    JSON.stringify({ 
                        success: false, 
                        error: `Error actualizando jugador: ${error1.message || JSON.stringify(error1)}` 
                    }),
                    { status: 500, headers: { "Content-Type": "application/json" } }
                );
            }

            console.log('Primer jugador actualizado exitosamente');

            // Luego mover el titular a suplente (esto ocupa el espacio creado)
            console.log(`Moviendo jugador ${secondPlayerId} de ${secondPlayerOldPosition ? 'titular' : 'suplente'} a ${secondPlayerNewPosition ? 'titular' : 'suplente'}`);
            const { data: update2Data, error: error2 } = await supabaseClient
                .from('players_on_team')
                .update({ is_starter: secondPlayerNewPosition })
                .eq('id', secondPlayerId)
                .eq('team_id', userTeam.id)
                .select();

            if (error2) {
                console.error('Error actualizando segundo jugador:', error2);
                // Intentar revertir el cambio del primer jugador
                console.log('Revirtiendo cambio del primer jugador...');
                await supabaseClient
                    .from('players_on_team')
                    .update({ is_starter: firstPlayerOldPosition })
                    .eq('id', firstPlayerId)
                    .eq('team_id', userTeam.id);
                
                return new Response(
                    JSON.stringify({ 
                        success: false, 
                        error: `Error actualizando segundo jugador: ${error2.message || JSON.stringify(error2)}` 
                    }),
                    { status: 500, headers: { "Content-Type": "application/json" } }
                );
            }

            console.log('Segundo jugador actualizado exitosamente. Intercambio completado.');
        }

        return new Response(
            JSON.stringify({ success: true, message: "Jugadores intercambiados exitosamente" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error('Error en swap-players:', error);
        return new Response(
            JSON.stringify({ success: false, error: "Error interno del servidor" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
};

