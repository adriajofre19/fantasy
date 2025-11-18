import type { APIRoute } from "astro";
import { supabase } from "../../../lib/supabase";

export const POST: APIRoute = async ({ cookies, request }) => {
    try {
        // Obtener tokens de las cookies para cerrar sesión en Supabase
        const accessToken = cookies.get("sb-access-token")?.value;
        const refreshToken = cookies.get("sb-refresh-token")?.value;

        // Cerrar sesión en Supabase si hay tokens
        if (accessToken && refreshToken) {
            try {
                await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken,
                });
                await supabase.auth.signOut();
            } catch (error) {
                console.error('Error cerrando sesión en Supabase:', error);
                // Continuar aunque falle, para eliminar las cookies de todas formas
            }
        }

        // Eliminar cookies - usar las mismas opciones que se usaron al establecerlas
        cookies.delete("sb-access-token", {
            path: "/"
        });
        cookies.delete("sb-refresh-token", {
            path: "/"
        });

        return new Response(
            JSON.stringify({ success: true, message: "Sesión cerrada exitosamente" }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
    } catch (error) {
        console.error('Error en signout:', error);
        // Aún así, eliminar las cookies
        cookies.delete("sb-access-token", { path: "/" });
        cookies.delete("sb-refresh-token", { path: "/" });

        return new Response(
            JSON.stringify({ success: false, error: "Error al cerrar sesión" }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
    }
};

// También mantener GET para compatibilidad
export const GET: APIRoute = async ({ cookies, redirect }) => {
    const accessToken = cookies.get("sb-access-token")?.value;
    const refreshToken = cookies.get("sb-refresh-token")?.value;

    // Cerrar sesión en Supabase si hay tokens
    if (accessToken && refreshToken) {
        try {
            await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
            });
            await supabase.auth.signOut();
        } catch (error) {
            console.error('Error cerrando sesión en Supabase:', error);
        }
    }

    cookies.delete("sb-access-token", { path: "/" });
    cookies.delete("sb-refresh-token", { path: "/" });
    return redirect("/signin");
};