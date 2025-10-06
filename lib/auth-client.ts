import { createAuthClient } from "better-auth/react"
import { adminClient, customSessionClient, jwtClient, lastLoginMethodClient, twoFactorClient } from "better-auth/client/plugins"
import type { auth } from "@/lib/auth";

export const authClient = createAuthClient({
    /** The base URL of the server (optional if you're using the same domain) */
    baseURL: "http://localhost:3000",
    plugins: [
        adminClient(),
        customSessionClient<typeof auth>(),
        twoFactorClient(),
        jwtClient(),
        lastLoginMethodClient(),
    ]
});