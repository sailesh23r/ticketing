"use client";
import { CheckCircle, XCircle, Ban, Check, Search, Users, Shield, User, UserPlus } from "lucide-react";
import { format } from "date-fns";
import useSWR from "swr";
import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserWithDetails } from "@/utils/users";
import { useSession } from "@/lib/auth-client";
// (Account provider icons removed for now while showing organizations)
import { UserActions } from "./user-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { UserAddDialog } from "./user-add-dialog";

// Fetcher function for SWR with explicit error handling & content-type guard
const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    throw new Error(`Unexpected response (ct=${ct}): ${text.slice(0, 180)}`);
  }
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error || `Request failed (${res.status})`);
  }
  return json;
};

// (account icon rendering removed temporarily while showing organizations instead)

function extractRoles(session: unknown): string[] {
  if (session && typeof session === "object") {
    const s = session as Record<string, unknown>;
    // Check session.user.role (set by customSession plugin)
    const user = s["user"] as Record<string, unknown> | undefined;
    if (user && typeof user["role"] === "string" && user["role"]) {
      return [user["role"] as string];
    }
  }
  return [];
}

export function UsersTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const { data: session } = useSession();
  const isAdminViewer = extractRoles(session).includes("admin");

  // Filters and sort state, initialized from URL
  const [role, setRole] = useState(searchParams.get("role") || "all");
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [debouncedEmail, setDebouncedEmail] = useState(email);
  const [page, setPage] = useState(Number(searchParams.get("page")) || 1);
  const limit = 10;

  // Debounce email search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedEmail(email);
    }, 300);

    return () => clearTimeout(timer);
  }, [email]);

  // Update URL when filters/sort/page change
  useEffect(() => {
    const params = new URLSearchParams();
    if (role && role !== "all") params.set("role", role);
    if (debouncedEmail) params.set("email", debouncedEmail);
    if (page) params.set("page", String(page));
    params.set("limit", String(limit));
    router.replace(`?${params.toString()}`);
  }, [role, debouncedEmail, page, router]);

  // Build SWR key with all params
  const swrKey = useMemo(() => {
    const params = new URLSearchParams();
    if (role && role !== "all") params.set("role", role);
    if (debouncedEmail) params.set("email", debouncedEmail);
    params.set("page", String(page));
    params.set("limit", String(limit));
    return `/api/admin/users?${params.toString()}`;
  }, [role, debouncedEmail, page, limit]);

  const { data, error, mutate, isLoading } = useSWR(swrKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 2000,
  });

  const handleActionComplete = () => {
    // Force revalidation even inside deduping window
    mutate(undefined, { revalidate: true });
  };

  interface UsersApiResponse { users: UserWithDetails[]; total: number; totalPages: number; page: number; limit: number }
  type UserPatch = Partial<UserWithDetails> & { id: string };
  const handleUserPatched = (patch: UserPatch) => {
    mutate((current: UsersApiResponse | undefined) => {
      if (!current) return current;
      return {
        ...current,
        users: current.users.map((u) => (u.id === patch.id ? { ...u, ...patch } : u)),
      };
    }, { revalidate: true });
  };

  // Filter and sort controls
  const filterControls = (
    <div className="flex flex-wrap gap-2 items-end mb-2 w-full justify-between">
      <div className="flex gap-2 items-end">
        {/* Search by email */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search email..."
            className="pl-8 pr-2 py-2 border rounded-md text-sm bg-background w-[200px]"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {/* Role select with icon */}
        <Select
          value={role}
          onValueChange={(v) => {
            setRole(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px] flex items-center gap-2">
            <span className="flex items-center gap-2">
              {role === "all" ? (
                <Users className="w-4 h-4" />
              ) : role === "admin" ? (
                <Shield className="w-4 h-4" />
              ) : (
                <User className="w-4 h-4" />
              )}
              {role === "all"
                ? "All Roles"
                : role.charAt(0).toUpperCase() + role.slice(1)}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                All Roles
              </span>
            </SelectItem>
            <SelectItem value="admin">
              <span className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Admin
              </span>
            </SelectItem>
            <SelectItem value="provider">
              <span className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Provider
              </span>
            </SelectItem>
            <SelectItem value="scribe">
              <span className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Scribe
              </span>
            </SelectItem>
            <SelectItem value="scribeAdmin">
              <span className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Scribe Admin
              </span>
            </SelectItem>
            <SelectItem value="demo">
              <span className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Demo
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <button
        className="ml-auto bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium shadow-xs hover:bg-primary/90 transition-colors flex items-center gap-2"
        onClick={() => setIsAddDialogOpen(true)}
      >
        <UserPlus className="h-4 w-4" />
        Add a user
      </button>
    </div>
  );

  if (error) {
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium text-destructive">Failed to load users</div>
        <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-xs max-w-xl overflow-auto border">
{String(error.message || error)}
        </pre>
        <button
          onClick={() => mutate()}
          className="px-3 py-1 text-xs rounded bg-primary text-primary-foreground"
        >Retry</button>
      </div>
    );
  }
  if (!data)
    return (
      <div className="space-y-4 border-accent-foreground">
        {filterControls}
        <div className="overflow-hidden">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                {[
                  { label: "Name" },
                  { label: "Verification" },
                  { label: "Organizations" },
                  { label: "Role" },
                  { label: "Status" },
                  { label: "Last Sign In" },
                  { label: "Created At" },
                  { label: "Actions", className: "w-[80px]" },
                ].map((col) => (
                  <TableHead
                    key={col.label}
                    className={[
                      col.className,
                      "px-4 py-3 text-xs font-medium text-muted-foreground",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-[120px]" />
                        <Skeleton className="h-3 w-[160px]" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Skeleton className="h-6 w-[80px]" />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex -space-x-2">
                      {Array.from({ length: 2 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-8 rounded-full" />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Skeleton className="h-6 w-[60px]" />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Skeleton className="h-4 w-[140px]" />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Skeleton className="h-4 w-[140px]" />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Skeleton className="h-8 w-8 rounded-md" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );

  const { users, total, totalPages } = data;

  // Pagination logic for shadcn/ui Pagination
  const renderPagination = () => {
    if (totalPages <= 1) return null;
    const pageNumbers = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, page - 2);
    let endPage = Math.min(totalPages, page + 2);
    if (endPage - startPage < maxPagesToShow - 1) {
      if (startPage === 1) {
        endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
      } else if (endPage === totalPages) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
      }
    }
    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }
    return (
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-disabled={page === 1}
              tabIndex={page === 1 ? -1 : 0}
              className={page === 1 ? "pointer-events-none opacity-50" : ""}
            />
          </PaginationItem>
          {startPage > 1 && (
            <>
              <PaginationItem>
                <PaginationLink onClick={() => setPage(1)}>1</PaginationLink>
              </PaginationItem>
              {startPage > 2 && <PaginationEllipsis />}
            </>
          )}
          {pageNumbers.map((pNum) => (
            <PaginationItem key={pNum}>
              <PaginationLink
                isActive={pNum === page}
                onClick={() => setPage(pNum)}
              >
                {pNum}
              </PaginationLink>
            </PaginationItem>
          ))}
          {endPage < totalPages && (
            <>
              {endPage < totalPages - 1 && <PaginationEllipsis />}
              <PaginationItem>
                <PaginationLink onClick={() => setPage(totalPages)}>
                  {totalPages}
                </PaginationLink>
              </PaginationItem>
            </>
          )}
          <PaginationItem>
            <PaginationNext
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-disabled={page === totalPages}
              tabIndex={page === totalPages ? -1 : 0}
              className={
                page === totalPages ? "pointer-events-none opacity-50" : ""
              }
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  };

  return (
    <div className="space-y-4">
      {filterControls}
      <div className="overflow-hidden rounded-lg border-muted border ">
        <Table className="text-sm ">
          <TableHeader className=" bg-secondary hover:bg-muted/50 sticky top-0 z-10">
            <TableRow>
              {[
                { label: "Name" },
                { label: "Verification" },
                { label: "Organizations" },
                { label: "Role" },
                { label: "Status" },
                { label: "Last Sign In" },
                { label: "Created At" },
                { label: "Actions", className: "w-[80px]" },
              ].map((col) => (
                <TableHead
                  key={col.label}
                  className={[
                    col.className,
                    "px-4 py-3 text-xs font-medium text-muted-foreground",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-[120px]" />
                          <Skeleton className="h-3 w-[160px]" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Skeleton className="h-6 w-[80px]" />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                      <Skeleton className="h-4 w-[140px]" />
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Skeleton className="h-6 w-[60px]" />
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Skeleton className="h-4 w-[140px]" />
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Skeleton className="h-4 w-[140px]" />
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Skeleton className="h-8 w-8 rounded-md" />
                    </TableCell>
                  </TableRow>
                ))
              : users.map((user: UserWithDetails) => (
                  <TableRow key={user.id}>
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-4">
                        <Avatar>
                          <AvatarImage src={user.avatarUrl} alt={user.name} />
                          <AvatarFallback className="text-xs">
                            {user.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">
                            {user.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {user.email.replace(/^[^@]+/, (match) =>
                              "*".repeat(match.length),
                            )}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {user.verified ? (
                        <Badge
                          variant="outline"
                          className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900 dark:text-green-200 dark:border-green-700 flex items-center gap-1 px-2 py-1 text-xs"
                        >
                          <CheckCircle className="h-3 w-3" />
                          Verified
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-700 flex items-center gap-1 px-2 py-1 text-xs"
                        >
                          <XCircle className="h-3 w-3" />
                          Unverified
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                      {(() => {
                        const orgs = user.organizations || [];
                        if (!orgs.length) return <span className="text-muted-foreground/60">—</span>;
                        // Admin viewer: show only first org then +N more
                        if (isAdminViewer) {
                          const first = orgs[0];
                          const extra = orgs.length - 1;
                          return (
                            <div className="flex flex-wrap gap-1 max-w-[220px] items-center">
                              <span className="px-2 py-0.5 rounded bg-muted border text-[10px] leading-4">{first.name}</span>
                              {extra > 0 && (
                                <span className="px-2 py-0.5 rounded bg-muted border text-[10px] leading-4">+{extra}</span>
                              )}
                            </div>
                          );
                        }
                        // Non-admin viewer: show up to 4 with +N more
                        return (
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {orgs.slice(0,4).map(org => (
                              <span key={org.id} className="px-2 py-0.5 rounded bg-muted border text-[10px] leading-4">{org.name}</span>
                            ))}
                            {orgs.length > 4 && (
                              <span className="px-2 py-0.5 rounded bg-muted border text-[10px] leading-4">+{orgs.length - 4}</span>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={`flex items-center gap-1 px-2 py-1 text-xs ${
                          user.role === "admin"
                            ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900 dark:text-purple-200 dark:border-purple-700"
                            : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700"
                        }`}
                      >
                        {user.role === "admin" ? (
                          <Shield className="h-3 w-3" />
                        ) : (
                          <User className="h-3 w-3" />
                        )}
                        {user.role
                          ? user.role.charAt(0).toUpperCase() +
                            user.role.slice(1)
                          : "User"}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {user.banned ? (
                        <div className="flex flex-col gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="destructive"
                                className="flex items-center gap-1 px-2 py-1 text-xs cursor-help"
                              >
                                <Ban className="h-3 w-3" />
                                Banned
                              </Badge>
                            </TooltipTrigger>
                            {user.banReason && (
                              <TooltipContent>
                                Reason: {user.banReason}
                              </TooltipContent>
                            )}
                          </Tooltip>
                          {user.banExpires && (
                            <span className="text-xs text-muted-foreground">
                              Expires: {format(user.banExpires, "MMM d, yyyy")}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900 dark:text-green-200 dark:border-green-700 flex items-center gap-1 px-2 py-1 text-xs"
                        >
                          <Check className="h-3 w-3" />
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                      {user.lastSignIn
                        ? format(user.lastSignIn, "MMM d, yyyy 'at' h:mm a")
                        : "Never"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                      {format(user.createdAt, "MMM d, yyyy 'at' h:mm a")}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <UserActions
                        user={user}
                        onActionComplete={handleActionComplete}
                        onUserPatched={handleUserPatched}
                      />
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between px-4 py-1">
        <div className="text-sm text-muted-foreground">
          Showing {users.length} of {total} users
        </div>
        {renderPagination()}
      </div>
      <UserAddDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSuccess={() => mutate()}
      />
    </div>
  );
}