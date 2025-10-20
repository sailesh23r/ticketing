import { createAuthClient } from "better-auth/react"
import useSWR from "swr";
import { adminClient, customSessionClient, jwtClient, lastLoginMethodClient, twoFactorClient } from "better-auth/client/plugins"
import type { auth } from "@/lib/auth";

// Prefer using same-origin in browser; allow override via NEXT_PUBLIC_AUTH_BASE_URL
const resolvedBaseUrl =
    typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_AUTH_BASE_URL;

export const authClient = createAuthClient({
    // If undefined on server, the client will use relative paths at runtime
    baseURL: resolvedBaseUrl,
    plugins: [
        adminClient(),
        customSessionClient<typeof auth>(),
        twoFactorClient(),
        jwtClient(),
        lastLoginMethodClient(),
    ],
});

// Lightweight type to match our API response
export type Organization = { id: string; name: string };

// Simple SWR hook to list organizations from our API route
export function useListOrganizations() {
    return useSWR<Organization[]>(
        "/api/organizations",
        async (url: string) => {
            const res = await fetch(url, { cache: "no-store" });
            if (!res.ok) throw new Error("Failed to fetch organizations");
            return res.json();
        }
    );
}

// Minimal client for organization operations used by admin dialogs
export const organization = {
    async create({ name, slug }: { name: string; slug: string }) {
        const res = await fetch("/api/organizations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, slug }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to create organization");
        return data;
    },
};

    // Re-export a session hook for convenience
    export const useSession = () => authClient.useSession();