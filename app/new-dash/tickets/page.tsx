"use client";
import React, { useMemo, useState, useEffect, useRef } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {  ChartPie, CircleAlert, ExternalLink, FileText, SearchIcon, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CreateTicketModal } from "@/components/create-ticket-modal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface TicketRow {
  _id: string;
  ticketId: string;
  title: string;
  description?: string;
  priority?: string;
  status?: string;
  assignedToUser?: string;
  assignedToGroup?: string | null;
  createdAt?: number;
  _creationTime?: number;
  dueAt?: number | null;
  createdBy?: string;
  project?: string;
}

export default function TicketsDashboardList() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id as string | undefined;
  const me = useQuery(api.users.getByAuthId, userId ? { authUserId: userId } : "skip") as { roles?: string[] } | undefined;
  const roles = (me?.roles || []).map(r => r.toLowerCase());
  const isAdmin = roles.includes("admin");

  // Filter state
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState<"all" | "P0" | "P1" | "P2" | "P3">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "in_progress" | "escalated" | "resolved" | "closed">("all");
  const [filterProject, setFilterProject] = useState<string | "all">("all");
  const [filterTeam, setFilterTeam] = useState<string | "all">("all");

  // Fetch tickets with server-side filters where possible
  const { results, status, loadMore } = usePaginatedQuery(
    api.myFunctions.listTicketsPaginated as unknown as Parameters<typeof usePaginatedQuery>[0],
    {
      status: filterStatus === "all" ? undefined : filterStatus,
      priority: filterPriority === "all" ? undefined : filterPriority,
      group: filterTeam === "all" ? undefined : filterTeam,
      project: filterProject === "all" ? undefined : filterProject,
      from: undefined,
      to: undefined,
    },
    { initialNumItems: 40 }
  ) as unknown as { results: TicketRow[] | undefined; status: string; loadMore: () => void };

  // Derive option lists (projects & teams)
  const projectOptions = useMemo(() => {
    const set = new Set<string>();
    const userProjects = (me as unknown as { projects?: string[] })?.projects || [];
    userProjects.forEach((p: string) => set.add(p));
    (results || []).forEach((r: TicketRow) => { if (r.project) set.add(r.project); });
    return Array.from(set).sort();
  }, [me, results]);

  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    const possibleTeams = (me && (me as unknown as { teams?: string[] }).teams) || [];
    possibleTeams.forEach(t => set.add(t));
    (results || []).forEach(r => { if (r.assignedToGroup) set.add(r.assignedToGroup); });
    return Array.from(set).sort();
  }, [me, results]);

  const tickets = useMemo(() => {
    const base = (results || []).filter(t => {
      // For non-admin view limit to own/assigned
      if (!isAdmin && !(t.createdBy === userId || t.assignedToUser === userId)) return false;
      return true;
    });
    if (!search.trim()) return base;
    const q = search.trim().toLowerCase();
    return base.filter(t => (
      (t.ticketId || '').toLowerCase().includes(q) ||
      (t.title || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q)
    ));
  }, [results, isAdmin, userId, search]);

  const assigneeIds = useMemo(() => Array.from(new Set(tickets.map(t => t.assignedToUser).filter(Boolean) as string[])), [tickets]);
  const assignees = useQuery(api.users.getByAuthIds, { authUserIds: assigneeIds }) as Array<{ authUserId: string; name: string; email: string }> | undefined;
  const assigneeMap = useMemo(() => {
    const m = new Map<string, { name: string; email: string }>();
    assignees?.forEach(a => m.set(a.authUserId, { name: a.name, email: a.email }));
    return m;
  }, [assignees]);

  // Ref for the primary search input (the decorated one with the kbd hint)
  const primarySearchRef = useRef<HTMLInputElement | null>(null);

  // Determine platform for proper shortcut display (runs client-side only)
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    try {
      const platform = (navigator.platform || navigator.userAgent || "").toLowerCase();
      setIsMac(/mac|iphone|ipad|ipod/.test(platform));
    } catch {
      setIsMac(false);
    }
  }, []);

  // Global keyboard listener for focusing the search (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key?.toLowerCase();
      if (key === 'k' && (e.metaKey || e.ctrlKey)) {
        // Avoid browser default (e.g., Chrome focuses omnibox on Ctrl+K)
        e.preventDefault();
        if (primarySearchRef.current) {
          primarySearchRef.current.focus();
          // Select existing text for quick overwrite
          primarySearchRef.current.select();
        }
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, []);

  // Click helper for the shortcut badge
  const focusPrimarySearch = () => {
    if (primarySearchRef.current) {
      primarySearchRef.current.focus();
      primarySearchRef.current.select();
    }
  };

  return (
    <div className="space-y-6 m-4">
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Tickets</CardTitle>
            <CardDescription className="text-xs">Search, filter, and manage tickets.</CardDescription>
          </div>
          <div className="self-end md:self-auto">
            <CreateTicketModal />
          </div>
        </CardHeader>
        <CardContent>
      {/* Filters Bar */}
      <div className="flex flex-wrap gap-3 items-end pb-2 w-full">
        <div className="relative">
          <Input
            ref={primarySearchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="peer ps-9 pe-12" /* extra right padding for clickable badge */
            placeholder="Search id/title"
            type="search"
            aria-label="Search tickets by id or title"
          />
          <div className="text-muted-foreground/80 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
            <SearchIcon size={16} />
          </div>
          <button
            type="button"
            onClick={focusPrimarySearch}
            tabIndex={-1}
            aria-label={`Focus search (${isMac ? 'Command' : 'Control'}+K)`}
            className="group absolute inset-y-0 end-0 flex items-center justify-center pe-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <kbd className="text-muted-foreground/70 group-hover:text-foreground inline-flex h-5 max-h-full items-center rounded border px-1 font-[inherit] text-[0.625rem] font-medium">
              {isMac ? '⌘K' : 'Ctrl K'}
            </kbd>
          </button>
        </div>

        <div className="flex gap-2">
          <div className="flex flex-col">
            {/* <label className="text-xs font-medium mb-1">Priority</label> */}
            <Select value={filterPriority} onValueChange={(v) => setFilterPriority(v as typeof filterPriority)}>
              <SelectTrigger className="h-8 text-xs border-0 shadow-none">
                <CircleAlert />
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Priority</SelectItem>
                <SelectItem value="P0">Critical</SelectItem>
                <SelectItem value="P1">High</SelectItem>
                <SelectItem value="P2">Medium</SelectItem>
                <SelectItem value="P3">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col ">
            {/* <label className="text-xs font-medium mb-1">Status</label> */}
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
              <SelectTrigger className="h-8 text-xs border-0 shadow-none">
                <ChartPie />
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col ">
            {/* <label className="text-xs font-medium mb-1">Project</label> */}
            <Select value={filterProject} onValueChange={(v) => setFilterProject(v)}>
              <SelectTrigger className="h-8 text-xs border-0 shadow-none">
                <FileText />
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Project</SelectItem>
                {projectOptions.map(p => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col">
            {/* <label className="text-xs font-medium mb-1">Team</label> */}
            <Select value={filterTeam} onValueChange={(v) => setFilterTeam(v)}>
              <SelectTrigger className="h-8 text-xs border-0 shadow-none">
                <Users />
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {teamOptions.map(t => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          {(filterPriority !== 'all' || filterStatus !== 'all' || filterProject !== 'all' || filterTeam !== 'all' || search) && (
            <button onClick={() => { setFilterPriority('all'); setFilterStatus('all'); setFilterProject('all'); setFilterTeam('all'); setSearch(''); }} className="text-xs px-3 py-1.5 border rounded bg-background hover:bg-muted transition-colors">Reset</button>
          )}
        </div>
      </div>

      {status === 'LoadingFirstPage' ? (
        <div className="flex justify-center py-20"><LoadingSpinner /></div>
      ) : (
        <div className="overflow-x-auto ">
          <table
            className="w-full text-sm table-fixed border-collapse [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wide"
            aria-label="Tickets table"
          >
            <thead className="text-muted-foreground select-none">
              <tr className="bg-background">
                <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium  border-l-0">ID</th>
                <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium ">Title</th>
                <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium ">Priority</th>
                <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium ">Status</th>
                <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium ">Team</th>
                <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium ">Assignee</th>
                <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium ">Created</th>
                <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium  border-r-0">SLA</th>
              </tr>
            </thead>
            <tbody className="[&_tr]:transition-colors">
              {tickets.map(t => {
                const created = t.createdAt ?? t._creationTime ?? 0;
                const assignee = t.assignedToUser ? (assigneeMap.get(t.assignedToUser)?.name || t.assignedToUser) : '—';
                const elapsedH = created ? Math.max(0, Math.round((Date.now() - created) / (1000 * 60 * 60))) : 0;
                const slaH = t.dueAt ? Math.max(1, Math.round(((t.dueAt - (created || Date.now())) / (1000 * 60 * 60)))) : null;
                const overdue = t.dueAt ? Date.now() > t.dueAt : false;
                const priorityLabelMap: Record<string, string> = { P0: 'Critical', P1: 'High', P2: 'Medium', P3: 'Low' };
                const priorityColorMap: Record<string, string> = {
                  P0: 'bg-red-400/20 text-red-700 border border-red-300',
                  P1: 'bg-orange-400/20 text-orange-700 border border-orange-300',
                  P2: 'bg-amber-400/20 text-amber-700 border border-amber-300',
                  P3: 'bg-emerald-500/15 text-emerald-700 border border-emerald-300'
                };
                const statusColorMap: Record<string, string> = {
                  open: 'bg-red-500/15 text-red-700 border border-red-300',
                  in_progress: 'bg-blue-500/15 text-blue-700 border border-blue-300',
                  escalated: 'bg-fuchsia-600/80 text-white',
                  resolved: 'bg-green-500/15 text-green-700 border border-green-300',
                  closed: 'bg-gray-500/20 text-gray-700 border border-gray-300'
                };
                const statusLabelMap: Record<string, string> = {
                  open: 'Open',
                  in_progress: 'In progress',
                  escalated: 'Escalated',
                  resolved: 'Resolved',
                  closed: 'Closed'
                };
                return (
                  <tr key={t._id}>
                    <td className="px-3 py-2 font-mono text-xs border border-gray-100 whitespace-nowrap">
                      <Link href={`/new-dash/tickets/${t.ticketId}`} className="underline-offset-2 hover:underline focus:outline-none focus:ring-1 focus:ring-ring rounded-sm flex items-center gap-1">
                      {t.ticketId} <ExternalLink className="size-3" />
                      </Link>
                      </td>
                    <td className="px-3 py-2 max-w-[280px] truncate border border-gray-100" title={t.title}>{t.title}</td>
                    <td className="px-3 py-2 border border-gray-100">
                      {t.priority && (() => {
                        const priorityDotColorMap: Record<string, string> = { P0: 'bg-red-500', P1: 'bg-orange-500', P2: 'bg-amber-400', P3: 'bg-emerald-500' };
                        const colorClasses = priorityColorMap[t.priority] || 'bg-gray-200 text-gray-700';
                        return (
                          <Badge
                            variant="outline"
                            className={`h-5 text-[10px] font-medium leading-none px-2 py-0.5 gap-1.5 border-0 ${colorClasses}`}
                          >
                            <span className={`size-1.5 rounded-full ${priorityDotColorMap[t.priority] || 'bg-gray-500'}`} aria-hidden="true"></span>
                            {priorityLabelMap[t.priority] || t.priority}
                          </Badge>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 border border-gray-100">
                      {t.status && (() => {
                        const statusDotColorMap: Record<string, string> = {
                          open: 'bg-red-500',
                          in_progress: 'bg-blue-500',
                          escalated: 'bg-fuchsia-600',
                          resolved: 'bg-green-500',
                          closed: 'bg-gray-500'
                        };
                        const colorClasses = statusColorMap[t.status] || 'bg-gray-200 text-gray-700';
                        return (
                          <Badge
                            variant="outline"
                            className={`h-5 text-[10px] font-medium leading-none px-2 py-0.5 gap-1.5 border-0 ${colorClasses}`}
                          >
                            <span className={`size-1.5 rounded-full ${statusDotColorMap[t.status] || 'bg-gray-500'}`} aria-hidden="true"></span>
                            {statusLabelMap[t.status] || t.status}
                          </Badge>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground border border-gray-100">{t.assignedToGroup || '—'}</td>
                    <td className="px-3 py-2 text-xs border border-gray-100">{assignee}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap border border-gray-100">{created ? new Date(created).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}</td>
                    <td className="px-3 py-2 text-xs border border-gray-100 ">
                      {slaH ? (
                        <span className={overdue ? 'text-red-600 font-medium' : ''}>{elapsedH}h / {slaH}h {overdue && '• Overdue'}</span>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
              {tickets.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-sm text-muted-foreground border border-gray-100">No tickets found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {status === 'CanLoadMore' && (
        <div className="pt-2">
          <button onClick={() => loadMore()} className="px-4 py-2 text-sm rounded border hover:bg-muted transition-colors">Load more</button>
        </div>
      )}
        </CardContent>
      </Card>
    </div>
  );
}
