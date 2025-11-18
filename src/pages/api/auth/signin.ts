import type { APIRoute } from "astro";
import { supabase } from "../../../lib/supabase";
import type { Provider } from "@supabase/supabase-js";

export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
    const formData = await request.formData();
    const email = formData.get("email")?.toString();
    const password = formData.get("password")?.toString();
    const provider = formData.get("provider")?.toString();

    const validProviders = ["google", "github", "discord"];

    if (provider && validProviders.includes(provider)) {
        // Detectar l'URL base (producció o desenvolupament)
        // Prioridad: SITE_URL > VERCEL_URL > headers HTTP > url.origin
        let origin: string;

        const siteUrl = import.meta.env.SITE_URL || import.meta.env.PUBLIC_SITE_URL;
        const vercelUrl = import.meta.env.VERCEL_URL;

        if (siteUrl) {
            origin = siteUrl;
        } else if (vercelUrl) {
            // Vercel proporciona VERCEL_URL automáticamente
            origin = `https://${vercelUrl}`;
        } else {
            // Intentar obtener la URL real desde headers (útil con proxies/load balancers)
            const forwardedHost = request.headers.get("x-forwarded-host");
            const forwardedProto = request.headers.get("x-forwarded-proto") || "https";

            if (forwardedHost) {
                origin = `${forwardedProto}://${forwardedHost}`;
            } else {
                origin = url.origin;
            }
        }

        const callbackUrl = `${origin}/api/auth/callback`;

        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: provider as Provider,
            options: {
                redirectTo: callbackUrl
            },
        });

        if (error) {
            return new Response(error.message, { status: 500 });
        }

        return redirect(data.url);
    }

    if (!email || !password) {
        return new Response("Correo electrónico y contraseña obligatorios", { status: 400 });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        return new Response(error.message, { status: 500 });
    }

    const { access_token, refresh_token } = data.session;
    cookies.set("sb-access-token", access_token, {
        path: "/",
    });
    cookies.set("sb-refresh-token", refresh_token, {
        path: "/",
    });
    return redirect("/");
};
