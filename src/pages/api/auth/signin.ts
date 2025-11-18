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
        // Detectar la URL base (producción o desarrollo)
        // Prioridad: SITE_URL > PUBLIC_SITE_URL > SITE (Astro) > VERCEL_URL > headers HTTP > url.origin
        let origin: string;

        const siteUrl = import.meta.env.SITE_URL ||
            import.meta.env.PUBLIC_SITE_URL ||
            import.meta.env.SITE;
        const vercelUrl = import.meta.env.VERCEL_URL;

        if (siteUrl) {
            // Si hay SITE_URL configurada, usarla directamente
            origin = siteUrl;
        } else if (vercelUrl) {
            // Vercel proporciona VERCEL_URL automáticamente (sin protocolo)
            origin = `https://${vercelUrl}`;
        } else {
            // Intentar obtener la URL real desde headers (útil con proxies/load balancers)
            const forwardedHost = request.headers.get("x-forwarded-host");
            const forwardedProto = request.headers.get("x-forwarded-proto") ||
                (url.protocol === "https:" ? "https" : "http");

            if (forwardedHost) {
                origin = `${forwardedProto}://${forwardedHost}`;
            } else {
                // Fallback a url.origin
                origin = url.origin;
            }
        }

        // Asegurarse de que la URL sea absoluta y completa
        const callbackUrl = `${origin}/api/auth/callback`;

        // Log para debugging (visible en Vercel logs)
        const debugInfo = {
            callbackUrl,
            origin,
            currentUrl: url.href,
            siteUrl: import.meta.env.SITE_URL,
            publicSiteUrl: import.meta.env.PUBLIC_SITE_URL,
            site: import.meta.env.SITE,
            vercelUrl: import.meta.env.VERCEL_URL,
            forwardedHost: request.headers.get("x-forwarded-host"),
            forwardedProto: request.headers.get("x-forwarded-proto"),
        };

        console.log("🔐 OAuth Sign In Debug Info:", JSON.stringify(debugInfo, null, 2));

        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: provider as Provider,
            options: {
                redirectTo: callbackUrl,
            },
        });

        if (error) {
            console.error("❌ OAuth Error:", error);
            return new Response(
                JSON.stringify({
                    error: error.message,
                    debug: import.meta.env.DEV ? debugInfo : undefined
                }),
                {
                    status: 500,
                    headers: { "Content-Type": "application/json" }
                }
            );
        }

        console.log("✅ OAuth redirect URL:", data.url);
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
    return redirect("/dashboard");
};