"use client";

import { ChangeEvent, useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { authClient } from "@/lib/auth-client";
import * as z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Clock, Hash, Shield, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { SectionCards } from "@/components/section-cards";

const READ_ONLY = false;

type Priority = "P0" | "P1" | "P2" | "P3";

type Ticket = {
  _id: string;
  ticketId: string;
  title: string;
  description: string;
  priority: Priority;
  status: "open" | "in_progress" | "resolved" | "closed" | "escalated";
  createdBy: string;
  assignedToGroup?: string;
  _creationTime?: number;
  dueAt?: number;
  lastEscalationLevel?: number;
};

export default function DashboardPage() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id as string | undefined;
  const email = session?.user?.email as string | undefined;
  const name = (session?.user as { name?: string } | undefined)?.name;

  const tickets = useQuery(api.myFunctions.listActiveTickets, userId ? { userId } : "skip") as Ticket[] | undefined;
  const me = useQuery(api.users.getByAuthId, { authUserId: userId ?? "" });
  const projectList = (me?.projects ?? []) as string[];
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  // Call the query unconditionally to satisfy React Hooks rules. Pass "skip" to avoid running on the server when no project is selected.
  const projectTickets = useQuery(
    api.myFunctions.listTicketsByProject,
    projectFilter ? { project: projectFilter } : "skip"
  ) as Ticket[] | undefined;

  // Compute privileges from Convex roles OR fallback to Better Auth session role
  const sessionRole = ((session?.user as unknown as { role?: string })?.role ?? "").toLowerCase();
  const meRoles = ((me?.roles ?? []) as string[]).map((r) => r?.toLowerCase?.()).filter(Boolean) as string[];
  const PRIV_SET = new Set([
    "admin",
    "it_support",
    "irt",
    "security_delegate",
    "senior_management",
    "legal",
    "comms",
    "external_specialists",
  ]);
  const isPrivileged = meRoles.some((r) => PRIV_SET.has(r)) || PRIV_SET.has(sessionRole);
  const canAssignUI = meRoles.some((r) => r === "admin" || r === "dispatcher") || sessionRole === "admin" || sessionRole === "dispatcher";

  const create = useMutation(api.myFunctions.createTicket);
  const setStatus = useMutation(api.myFunctions.setTicketStatus);
  const getUploadUrl = useAction(api.myFunctions.getUploadUrl);
  const [files, setFiles] = useState<File[]>([]);
  const assignGroup = useMutation(api.myFunctions.assignToGroup);
  const GROUPS = ["IT Support", "IRT", "IRT+Senior", "Exec Escalation"] as const;
  const [groups, setGroups] = useState<Record<string, string>>({});

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  const allUsers = useQuery(api.users.listAll, {}) as { _id: string; authUserId: string; email: string; name?: string; roles: string[] }[] | undefined;
  const assign = useMutation(api.myFunctions.assignTicket);
  const upsertMe = useMutation(api.users.upsertCurrentUser);
  const upsertFromAuth = useMutation(api.users.upsertFromAuth);

  // Ensure the current user exists in Convex with the correct authUserId/email
  useEffect(() => {
    if (session?.user?.id) {
      upsertMe({}).catch(() => { });
      // Sync Better Auth role/name/email into Convex users table
      const sUser = session.user as unknown as { id: string; email?: string; name?: string; role?: string };
      upsertFromAuth({
        authUserId: sUser.id,
        email: sUser.email ?? "",
        name: sUser.name,
        role: sUser.role,
      }).catch(() => { });
    }
  }, [session, upsertMe, upsertFromAuth]);

  const [query, setQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState<"all" | Priority>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "in_progress" | "escalated" | "resolved" | "closed">("all");
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [openCreate, setOpenCreate] = useState(false);

  // When a team is selected via the Team select, fetch tickets for that team
  const teamTickets = useQuery(
    api.myFunctions.listTicketsByTeam,
    filterGroup && filterGroup !== "all" ? { team: filterGroup } : "skip"
  ) as Ticket[] | undefined;

  // Lock background scrolling when modal is open
  useEffect(() => {
    if (openCreate) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    return;
  }, [openCreate]);

  function fuzzyMatch(needle: string, hay: string) {
    if (!needle) return true;
    needle = needle.toLowerCase();
    hay = hay.toLowerCase();
    // quick includes
    if (hay.includes(needle)) return true;
    // subsequence match
    let i = 0;
    for (const ch of hay) {
      if (ch === needle[i]) i++;
      if (i === needle.length) return true;
    }
    return false;
  }

  const filtered = useMemo(() => {
    const q = query.trim();
    // Choose source list in this order: teamTickets (if team filter set), projectTickets (if projectFilter set), else global tickets
    let list = (filterGroup && filterGroup !== "all") ? (teamTickets ?? []) : (projectFilter ? (projectTickets ?? []) : (tickets ?? [])) as Ticket[];
    if (q) list = list.filter((t) => fuzzyMatch(q, `${t.title} ${t.ticketId}`));
    if (filterPriority !== "all") list = list.filter((t) => t.priority === filterPriority);
    if (filterStatus !== "all") list = list.filter((t) => t.status === filterStatus);
    if (filterGroup !== "all") list = list.filter((t) => (t.assignedToGroup || "").toLowerCase() === filterGroup.toLowerCase());

    // Date range filtering
    const from = dateRange?.from ? new Date(dateRange.from) : undefined;
    const to = dateRange?.to ? new Date(dateRange.to) : undefined;
    if (from && to) {
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
      const fromTs = from.getTime();
      const toTs = to.getTime();
      list = list.filter((t) => {
        const ct = t._creationTime ?? 0;
        return ct >= fromTs && ct <= toTs;
      });
    } else if (from && !to) {
      // Single-day selection
      const dayStart = new Date(from);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(from);
      dayEnd.setHours(23, 59, 59, 999);
      const fromTs = dayStart.getTime();
      const toTs = dayEnd.getTime();
      list = list.filter((t) => {
        const ct = t._creationTime ?? 0;
        return ct >= fromTs && ct <= toTs;
      });
    }

    return list;
  }, [tickets, query, filterPriority, filterStatus, filterGroup, dateRange, projectFilter, projectTickets, teamTickets]);

  const counts = useMemo(() => {
    const base = { total: tickets?.length ?? 0, open: 0, in_progress: 0, escalated: 0, resolved: 0 } as Record<string, number>;
    (tickets ?? []).forEach((t) => {
      base[t.status] = (base[t.status] ?? 0) + 1;
    });
    return base;
  }, [tickets]);

  function priorityBadgeClass(p: Priority) {
    switch (p) {
      case "P0":
        return "bg-red-100 text-red-700 border border-red-200";
      case "P1":
        return "bg-orange-100 text-orange-700 border border-orange-200";
      case "P2":
        return "bg-amber-100 text-amber-700 border border-amber-200";
      case "P3":
      default:
        return "bg-emerald-100 text-emerald-700 border border-emerald-200";
    }
  }
  function statusBadgeClass(s: Ticket["status"]) {
    switch (s) {
      case "open":
        return "bg-blue-100 text-blue-700 border border-blue-200";
      case "in_progress":
        return "bg-purple-100 text-purple-700 border border-purple-200";
      case "escalated":
        return "bg-rose-100 text-rose-700 border border-rose-200";
      case "resolved":
        return "bg-green-100 text-green-700 border border-green-200";
      case "closed":
        return "bg-zinc-100 text-zinc-700 border border-zinc-200";
    }
  }

  function priorityAccent(p: Priority) {
    switch (p) {
      case "P0":
        return "border-l-red-500/70";
      case "P1":
        return "border-l-orange-500/70";
      case "P2":
        return "border-l-amber-500/70";
      case "P3":
      default:
        return "border-l-emerald-500/70";
    }
  }

  async function uploadFiles(): Promise<string[]> {
    const storageIds: string[] = [];
    for (const file of files) {
      const url = await getUploadUrl({});
      const res = await fetch(url, { method: "POST", body: file });
      if (!res.ok) continue;
      const json = (await res.json()) as { storageId: string };
      storageIds.push(json.storageId);
    }
    return storageIds;
  }

  const formSchema = z.object({
    title: z.string().min(3, "Title must be at least 3 characters"),
    description: z.string().min(10, "Description must be at least 10 characters"),
    priority: z.enum(["P0", "P1", "P2", "P3"]),
    category: z.string().optional(),
    team: z.string().optional(),
    project: z.string().optional(),
  });
  type FormValues = z.infer<typeof formSchema>;
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", description: "", priority: "P3", category: "", team: undefined, project: undefined },
  });

  async function onSubmit(values: FormValues) {
    setCreating(true);
    setError("");
    setSuccess("");
    try {
      const storageIds = await uploadFiles();
      await create({
        title: values.title,
        description: values.description,
        priority: values.priority as Priority,
        createdBy: userId,
        email,
        name,
        attachments: storageIds,
        category: values.category || undefined,
        team: values.team || undefined,
        project: values.project || undefined,
      });
      form.reset({ title: "", description: "", priority: "P3", category: "", team: undefined });
      setAttachments([]);
      setFiles([]);
      setSuccess("Ticket created successfully");
      setOpenCreate(false);
    } catch {
      setError("Failed to create ticket");
    } finally {
      setCreating(false);
    }
  }

  return (
    // <div className="max-w-6xl mx-auto p-6 space-y-6">
    //   {/* Header */}
    //   <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
    //     <div>
    //       <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
    //       <p className="text-sm text-muted-foreground">Create and track tickets in real time.</p>
    //     </div>
    //     <div className="flex items-center gap-3">
    //       <div className="flex items-center gap-2 text-xs">
    //         <span className="px-2 py-1 rounded-full bg-muted">Total {counts.total}</span>
    //         <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700">Open {counts.open || 0}</span>
    //         <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-700">In progress {counts.in_progress || 0}</span>
    //         <span className="px-2 py-1 rounded-full bg-rose-100 text-rose-700">Escalated {counts.escalated || 0}</span>
    //         <span className="px-2 py-1 rounded-full bg-green-100 text-green-700">Resolved {counts.resolved || 0}</span>
    //       </div>
    //       <Button size="sm" onClick={() => setOpenCreate(true)}>Create ticket</Button>
    //       {openCreate && (
    //         <div className="fixed inset-0 z-50 flex items-start justify-center p-6">
    //           <div className="fixed inset-0 bg-black/30" onClick={() => setOpenCreate(false)} />
    //           <div className="bg-background rounded-lg border shadow-xl w-full max-w-[520px] z-10">
    //             <Card>
    //               <CardHeader className="py-3">
    //                 <div className="flex items-center justify-between">
    //                   <CardTitle className="text-base">Create ticket</CardTitle>
    //                   <button className="text-sm underline underline-offset-4" onClick={() => setOpenCreate(false)}>Close</button>
    //                 </div>
    //               </CardHeader>
    //               <CardContent className="grid gap-3">
    //                 {error && (
    //                   <Alert variant="destructive">
    //                     <AlertDescription>{error}</AlertDescription>
    //                   </Alert>
    //                 )}
    //                 {success && (
    //                   <Alert>
    //                     <AlertDescription>{success}</AlertDescription>
    //                   </Alert>
    //                 )}

    //                 <div className="max-h-[70vh] overflow-auto p-2">
    //                   <Form {...form}>
    //                     <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3">
    //                     <FormField
    //                       control={form.control}
    //                       name="title"
    //                       render={({ field }) => (
    //                         <FormItem>
    //                           <FormLabel>Title</FormLabel>
    //                           <FormControl>
    //                             <Input placeholder="Summarize the issue (e.g., VPN not connecting)" {...field} />
    //                           </FormControl>
    //                           <FormMessage />
    //                         </FormItem>
    //                       )}
    //                     />

    //                     <FormField
    //                       control={form.control}
    //                       name="description"
    //                       render={({ field }) => (
    //                         <FormItem>
    //                           <FormLabel>Description</FormLabel>
    //                           <FormControl>
    //                             <textarea
    //                               className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    //                               placeholder="Add steps to reproduce, screenshots, and error messages"
    //                               {...field}
    //                             />
    //                           </FormControl>
    //                           <FormDescription>Be as detailed as possible for faster resolution.</FormDescription>
    //                           <FormMessage />
    //                         </FormItem>
    //                       )}
    //                     />

    //                     <FormField
    //                       control={form.control}
    //                       name="priority"
    //                       render={({ field }) => (
    //                         <FormItem>
    //                           <FormLabel>Severity</FormLabel>
    //                           <FormControl>
    //                             <select className="border rounded-md px-3 py-2 text-sm bg-background" {...field}>
    //                               <option value="P3">P3 — Low</option>
    //                               <option value="P2">P2 — Medium</option>
    //                               <option value="P1">P1 — High</option>
    //                               <option value="P0">P0 — Critical</option>
    //                             </select>
    //                           </FormControl>
    //                           <FormMessage />
    //                         </FormItem>
    //                       )}
    //                     />

    //                     <FormField
    //                       control={form.control}
    //                       name="category"
    //                       render={({ field }) => (
    //                         <FormItem>
    //                           <FormLabel>Category</FormLabel>
    //                           <FormControl>
    //                             <Input placeholder="e.g. Network, Access, Security" {...field} />
    //                           </FormControl>
    //                           <FormMessage />
    //                         </FormItem>
    //                       )}
    //                     />

    //                     <FormField
    //                       control={form.control}
    //                       name="team"
    //                       render={({ field }) => (
    //                         <FormItem>
    //                           <FormLabel>Team</FormLabel>
    //                           <Select value={field.value ?? undefined} onValueChange={(v) => field.onChange(v === "unassigned" ? undefined : v)}>
    //                             <SelectTrigger className="w-full">
    //                               <SelectValue placeholder="Select a team (optional)" />
    //                             </SelectTrigger>
    //                             <SelectContent>
    //                               <SelectItem value="unassigned">Unassigned</SelectItem>
    //                               <SelectItem value="IT Support">IT Support</SelectItem>
    //                               <SelectItem value="IRT">IRT</SelectItem>
    //                               <SelectItem value="IRT+Senior">IRT+Senior</SelectItem>
    //                               <SelectItem value="Exec Escalation">Exec Escalation</SelectItem>
    //                             </SelectContent>
    //                           </Select>
    //                           <FormDescription>Route directly to a team or leave unassigned.</FormDescription>
    //                           <FormMessage />
    //                         </FormItem>
    //                       )}
    //                     />

    //                     {projectList.length > 0 && (
    //                       <FormField
    //                         control={form.control}
    //                         name="project"
    //                         render={({ field }) => (
    //                           <FormItem>
    //                             <FormLabel>Project</FormLabel>
    //                             <FormControl>
    //                               <Select value={field.value ?? undefined} onValueChange={(v) => field.onChange(v === "none" ? undefined : v)}>
    //                                 <SelectTrigger className="w-full">
    //                                   <SelectValue placeholder="Select a project (optional)" />
    //                                 </SelectTrigger>
    //                                 <SelectContent>
    //                                   <SelectItem value="none">None</SelectItem>
    //                                   {projectList.map((p) => (
    //                                     <SelectItem key={p} value={p}>{p}</SelectItem>
    //                                   ))}
    //                                 </SelectContent>
    //                               </Select>
    //                             </FormControl>
    //                             <FormMessage />
    //                           </FormItem>
    //                         )}
    //                       />
    //                     )}

    //                     {/* Screenshots upload */}
    //                     <div className="grid gap-2">
    //                       <Label htmlFor="files">Attachments</Label>
    //                       <input
    //                         id="files"
    //                         type="file"
    //                         multiple
    //                         accept="image/*"
    //                         onChange={(e: ChangeEvent<HTMLInputElement>) => {
    //                           const f = Array.from(e.target.files ?? []);
    //                           setFiles(f);
    //                         }}
    //                       />
    //                       {files.length > 0 && (
    //                         <div className="text-xs text-muted-foreground">{files.length} file(s) selected</div>
    //                       )}
    //                     </div>

    //                     {/* Optional external URLs */}
    //                     <div className="grid gap-2">
    //                       <Label htmlFor="attachments">Attachment URLs (optional)</Label>
    //                       <div className="space-y-2">
    //                         {attachments.map((url, idx) => (
    //                           <div key={idx} className="flex gap-2">
    //                             <Input
    //                               value={url}
    //                               onChange={(e) => {
    //                                 const next = [...attachments];
    //                                 next[idx] = e.target.value;
    //                                 setAttachments(next);
    //                               }}
    //                             />
    //                             <Button
    //                               type="button"
    //                               variant="outline"
    //                               onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}
    //                             >
    //                               Remove
    //                             </Button>
    //                           </div>
    //                         ))}
    //                         <Button type="button" variant="outline" onClick={() => setAttachments([...attachments, ""]) }>
    //                           Add URL
    //                         </Button>
    //                       </div>
    //                     </div>

    //                     <Button type="submit" disabled={creating} className="w-full">
    //                       {creating && <LoadingSpinner size="sm" className="mr-2" />}Create
    //                     </Button>
    //                     <p className="text-xs text-muted-foreground">Tip: Provide logs or screenshots for faster resolution.</p>
    //                     </form>
    //                   </Form>
    //                 </div>
    //               </CardContent>
    //             </Card>
    //           </div>
    //         </div>
    //       )}
    //     </div>
    //   </div>
    //   {/* Project chips (user's projects) */}
    //   {projectList.length > 0 && (
    //     <div className="flex items-center gap-2 flex-wrap">
    //       <div className="text-xs text-muted-foreground mr-2">Projects:</div>
    //       <Button size="sm" variant={projectFilter === null ? "secondary" : "ghost"} onClick={() => setProjectFilter(null)}>
    //         All projects
    //       </Button>
    //       {projectList.map((p) => (
    //         <Button
    //           key={p}
    //           size="sm"
    //           variant={projectFilter === p ? "secondary" : "ghost"}
    //           onClick={() => setProjectFilter(projectFilter === p ? null : p)}
    //         >
    //           {p}
    //         </Button>
    //       ))}
    //     </div>
    //   )}

    //   {/* Filters */}
    //   <div className="flex flex-col md:flex-row gap-3  items-end justify-between">
    //     <Input
    //       placeholder="Search by ID or title"
    //       value={query}
    //       onChange={(e) => setQuery(e.target.value)}
    //       className="md:w-[200px]"
    //     />
    //     <div className="flex flex-wrap gap-2">
    //       <div className=" items-center gap-2">
    //         <Label className="text-xs">Priority</Label>
    //         <Select value={filterPriority} onValueChange={(v: "all" | Priority) => setFilterPriority(v)}>
    //           <SelectTrigger className="w-[120px]">
    //             <SelectValue placeholder="All" />
    //           </SelectTrigger>
    //           <SelectContent>
    //             <SelectItem value="all">All</SelectItem>
    //             <SelectItem value="P3">P3</SelectItem>
    //             <SelectItem value="P2">P2</SelectItem>
    //             <SelectItem value="P1">P1</SelectItem>
    //             <SelectItem value="P0">P0</SelectItem>
    //           </SelectContent>
    //         </Select>
    //       </div>
    //       <div className=" items-center gap-2">
    //         <Label className="text-xs">Status</Label>
    //         <Select value={filterStatus} onValueChange={(v: "all" | "open" | "in_progress" | "escalated" | "resolved" | "closed") => setFilterStatus(v)}>
    //           <SelectTrigger className="w-[160px]">
    //             <SelectValue placeholder="All" />
    //           </SelectTrigger>
    //           <SelectContent>
    //             <SelectItem value="all">All</SelectItem>
    //             <SelectItem value="open">Open</SelectItem>
    //             <SelectItem value="in_progress">In progress</SelectItem>
    //             <SelectItem value="escalated">Escalated</SelectItem>
    //             <SelectItem value="resolved">Resolved</SelectItem>
    //             <SelectItem value="closed">Closed</SelectItem>
    //           </SelectContent>
    //         </Select>
    //       </div>
    //       <div className=" items-center gap-2">
    //         <Label className="text-xs">Team</Label>
    //         <Select value={filterGroup} onValueChange={(v) => setFilterGroup(v)}>
    //           <SelectTrigger className="w-[180px]">
    //             <SelectValue placeholder="All" />
    //           </SelectTrigger>
    //           <SelectContent>
    //             <SelectItem value="all">All</SelectItem>
    //             <SelectItem value="IT Support">IT Support</SelectItem>
    //             <SelectItem value="IRT">IRT</SelectItem>
    //             <SelectItem value="IRT+Senior">IRT+Senior</SelectItem>
    //             <SelectItem value="Exec Escalation">Exec Escalation</SelectItem>
    //           </SelectContent>
    //         </Select>
    //       </div>
    //       <div className=" items-center gap-2">
    //         <Label className="text-xs">Date range</Label>
    //         <Popover>
    //           <PopoverTrigger asChild>
    //             <Button
    //               variant="outline"
    //               className={cn(
    //                 "w-[260px] justify-start text-left font-normal",
    //                 !dateRange && "text-muted-foreground"
    //               )}
    //             >
    //               {dateRange?.from ? (
    //                 dateRange.to ? (
    //                   `${dateRange.from.toLocaleDateString()} - ${dateRange.to.toLocaleDateString()}`
    //                 ) : (
    //                   `${dateRange.from.toLocaleDateString()}`
    //                 )
    //               ) : (
    //                 "Pick a date range"
    //               )}
    //             </Button>
    //           </PopoverTrigger>
    //           <PopoverContent align="start" className="p-0">
    //             <Calendar
    //               mode="range"
    //               selected={dateRange}
    //               onSelect={setDateRange}
    //               numberOfMonths={2}
    //               initialFocus
    //             />
    //           </PopoverContent>
    //         </Popover>
    //         {dateRange && (
    //           <Button variant="ghost" size="sm" onClick={() => setDateRange(undefined)}>Clear</Button>
    //         )}
    //       </div>
    //     </div>
    //   </div>

    //   {/* Tickets as cards grid */}
    //   {tickets === undefined ? (
    //     <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoadingSpinner size="sm" /> Loading tickets…</div>
    //   ) : filtered.length === 0 ? (
    //     <div className="text-sm text-muted-foreground border rounded-md p-6 text-center">
    //       No tickets match your filters.
    //     </div>
    //   ) : (
    //     <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
    //       {filtered.map((t) => (
    //         <Card key={t._id} className={`group h-full transition-all hover:shadow-lg hover:-translate-y-0.5 border-l-4 ${priorityAccent(t.priority)}`}>
    //           <CardHeader className="pb-2">
    //             <div className="flex items-center justify-between gap-2">
    //               <div className="flex items-center gap-2 text-xs text-muted-foreground">
    //                 <Hash className="h-3.5 w-3.5" />
    //                 <span className="font-mono">{t.ticketId}</span>
    //               </div>
    //               <div className="flex items-center gap-2 text-xs text-muted-foreground">
    //                 <Clock className="h-3.5 w-3.5" />
    //                 <span>{t._creationTime ? new Date(t._creationTime).toLocaleString() : "—"}</span>
    //               </div>
    //             </div>
    //             <CardTitle className="text-base leading-snug line-clamp-2 cursor-pointer" title={t.title} onClick={() => setPeekId(t.ticketId)}>
    //               {t.title}
    //             </CardTitle>
    //             <CardDescription className="flex items-center gap-3 text-xs">
    //               <span className="inline-flex items-center gap-1">
    //                 <Shield className="h-3.5 w-3.5" />
    //                 {t.assignedToGroup || "Unassigned"}
    //               </span>
    //               {t.dueAt && (
    //                 <span className="inline-flex items-center gap-1">
    //                   <Clock className="h-3.5 w-3.5" />
    //                   SLA {new Date(t.dueAt).toLocaleTimeString()}
    //                 </span>
    //               )}
    //             </CardDescription>
    //           </CardHeader>

    //           <CardContent className="pt-0 pb-2">
    //             <div className="flex items-center gap-2 flex-wrap">
    //               <Badge className={priorityBadgeClass(t.priority)}>{t.priority}</Badge>
    //               <Badge className={statusBadgeClass(t.status)}>{t.status.replace("_", " ")}</Badge>
    //             </div>
    //           </CardContent>

    //           <CardFooter className="mt-auto pt-0">
    //             <div className="flex items-center gap-2 flex-wrap w-full">
    //               <a href={`/tickets/${t.ticketId}`} className="inline-flex items-center gap-1 text-sm underline underline-offset-4 ">
    //                 View
    //                 <ArrowRight className="h-4 w-4" />
    //               </a>
    //               {!READ_ONLY && isPrivileged && (
    //                 <>
    //                   <Button variant="outline" size="sm" onClick={() => setStatus({ ticketId: t.ticketId, status: "in_progress", userId })}>Start</Button>
    //                   <Button variant="outline" size="sm" onClick={() => setStatus({ ticketId: t.ticketId, status: "resolved", userId })}>Resolve</Button>
    //                   {canAssignUI && (
    //                     <>
    //                       <Select value={assignees[t.ticketId] || ""} onValueChange={(v) => setAssignees({ ...assignees, [t.ticketId]: v })}>
    //                         <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Assign user" /></SelectTrigger>
    //                         <SelectContent>
    //                           {(allUsers ?? []).map((u) => (
    //                             <SelectItem key={u._id} value={u.authUserId}>{u.email || u.authUserId}</SelectItem>
    //                           ))}
    //                         </SelectContent>
    //                       </Select>
    //                       <Button variant="outline" size="sm" onClick={async () => {
    //                         const uid = assignees[t.ticketId];
    //                         if (!uid) return;
    //                         await assign({ ticketId: t.ticketId, assigneeUserId: uid, userId });
    //                       }}>Save</Button>
    //                       <Select value={groups[t.ticketId] || ""} onValueChange={(v) => setGroups({ ...groups, [t.ticketId]: v })}>
    //                         <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Assign group" /></SelectTrigger>
    //                         <SelectContent>
    //                           {GROUPS.map((g) => (
    //                             <SelectItem key={g} value={g}>{g}</SelectItem>
    //                           ))}
    //                         </SelectContent>
    //                       </Select>
    //                       <Button variant="outline" size="sm" onClick={async () => {
    //                         const g = groups[t.ticketId];
    //                         if (!g) return;
    //                         await assignGroup({ ticketId: t.ticketId, group: g, userId });
    //                       }}>Save</Button>
    //                     </>
    //                   )}
    //                 </>
    //               )}
    //             </div>
    //           </CardFooter>
    //         </Card>
    //       ))}
    //     </div>
    //   )}

    //   {/* Peek popover */}
    //   {peekId && (
    //     <QuickPeek ticketId={peekId as string} onClose={() => setPeekId(null)} />
    //   )}
    // </div>

    <div className="flex  flex-col gap-4 p-4">
      <SectionCards />
      <ChartAreaInteractive />
    </div>
  );
}

function QuickPeek({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id as string | undefined;
  type ThreadMessage = { _id: string; role: string; content: string };
  type Thread = { ticket?: { ticketId: string; title: string; description: string; priority: string; status: string; attachments?: string[] }; messages?: ThreadMessage[] };
  const thread = useQuery(api.myFunctions.getTicketThread, { ticketId, userId }) as Thread | undefined | null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-start justify-center p-6 z-50">
      <div className="bg-background rounded-lg border shadow-xl w-full max-w-3xl">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-medium">{thread?.ticket?.ticketId} — {thread?.ticket?.title}</div>
          <button className="text-sm underline" onClick={onClose}>Close</button>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-sm text-muted-foreground">{thread?.ticket?.priority} • {thread?.ticket?.status}</div>
          <div className="whitespace-pre-wrap text-sm">{thread?.ticket?.description}</div>
          {Array.isArray(thread?.ticket?.attachments) && thread.ticket.attachments.length > 0 && (
            <div className="text-xs text-muted-foreground">Attachments: {thread.ticket.attachments.length}</div>
          )}
          <div className="max-h-64 overflow-auto border rounded p-2 space-y-2">
            {(thread?.messages ?? []).slice(-5).map((m) => (
              <div key={m._id} className="text-sm">
                <span className="text-xs text-muted-foreground mr-2">{m.role}</span>
                {m.content}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2">
            <a className="text-sm underline underline-offset-4" href={`/tickets/${ticketId}`}>Open full view</a>
            {/* Action buttons hidden in read-only mode */}
          </div>
        </div>
      </div>
    </div>
  );
}
