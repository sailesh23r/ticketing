"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

const PRIV_ROLES = new Set([
    "admin",
    "it_support",
    "irt",
    "security_delegate",
    "senior_management",
    "legal",
    "comms",
    "external_specialists",
]);

export default function TopNav() {
    const { data: session } = authClient.useSession();
    const [open, setOpen] = useState(false);

    const email = session?.user?.email ?? "";
    const name = (session?.user as { name?: string } | undefined)?.name ?? "";
    const role = (session?.user as { role?: string } | undefined)?.role ?? "";
    const isPrivileged = !!role && PRIV_ROLES.has(role.toLowerCase());

    const initial = (name || email || "?").trim().charAt(0).toUpperCase();

    console.log(session?.user.id, "session?.user.id");
    

    async function handleSignOut() {
        try {
            // Better Auth client sign out
            await authClient.signOut();
        } finally {
            window.location.href = "/login";
        }
    }

    return (
        <div className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="max-w-6xl mx-auto h-14 px-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href="/dashboard"
                        className="font-semibold tracking-tight"
                    >
                        Tickets
                    </Link>
                    <Link
                        href="/notifications"
                        className="text-sm text-muted-foreground hover:text-foreground"
                    >
                        Notifications
                    </Link>
                    {isPrivileged && (
                        <>
                            <Link
                                href="/reports"
                                className="text-sm text-muted-foreground hover:text-foreground"
                            >
                                Reports
                            </Link>
                            <Link
                                href="/admin/roles"
                                className="text-sm text-muted-foreground hover:text-foreground"
                            >
                                Roles
                            </Link>
                        </>
                    )}
                </div>

                {session?.user ? (
                    <div className="relative">
                        <button
                            className="flex items-center gap-2 rounded-full border px-2.5 py-1.5 hover:bg-accent/60"
                            onClick={() => setOpen((v) => !v)}
                            aria-haspopup="menu"
                            aria-expanded={open}
                        >
                            {session?.user?.image ? (
                                <Image
                                    src={session.user.image as string}
                                    alt={name || email || "User avatar"}
                                    width={28}
                                    height={28}
                                    className="rounded-full object-cover"
                                    unoptimized
                                />
                            ) : (
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm">
                                    {initial}
                                </span>
                            )}
                            <span className="hidden sm:block text-sm text-foreground/90 max-w-[160px] truncate">
                                {email}
                            </span>
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 20 20"
                                fill="none"
                                className={`transition ${open ? "rotate-180" : ""
                                    }`}
                            >
                                <path
                                    d="M5 8l5 5 5-5"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </button>
                        {open && (
                            <div className="absolute right-0 mt-2 w-60 rounded-md border bg-popover shadow-md p-1">
                                <div className="px-2 py-2 text-xs text-muted-foreground">
                                    Signed in as
                                    <div className="truncate text-foreground text-sm">
                                        {email}
                                    </div>
                                    {role && (
                                        <div className="mt-0.5">
                                            Role:{" "}
                                            <span className="font-medium">{role}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="my-1 h-px bg-border" />
                                <Link
                                    href="/dashboard"
                                    className="block px-2 py-1.5 text-sm rounded hover:bg-accent"
                                >
                                    My tickets
                                </Link>
                                <Link
                                    href="/notifications"
                                    className="block px-2 py-1.5 text-sm rounded hover:bg-accent"
                                >
                                    Notifications
                                </Link>
                                <Link
                                    href="/profile"
                                    className="block px-2 py-1.5 text-sm rounded hover:bg-accent"
                                >
                                    Profile
                                </Link>
                                {isPrivileged && (
                                    <>
                                        <Link
                                            href="/reports"
                                            className="block px-2 py-1.5 text-sm rounded hover:bg-accent"
                                        >
                                            Reports
                                        </Link>
                                        <Link
                                            href="/admin/roles"
                                            className="block px-2 py-1.5 text-sm rounded hover:bg-accent"
                                        >
                                            Manage roles
                                        </Link>
                                    </>
                                )}
                                <div className="my-1 h-px bg-border" />
                                <Button
                                    variant="destructive"
                                    className="w-full"
                                    onClick={handleSignOut}
                                >
                                    Sign out
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <Link href="/login">
                            <Button variant="outline" size="sm">
                                Sign in
                            </Button>
                        </Link>
                        <Link href="/register">
                            <Button size="sm">Sign up</Button>
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
