"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useAction, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import Image from "next/image";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { AlertTriangle, Edit, ArrowLeftIcon, ChevronLeft, ChevronRight, Circle, Flag, ArrowRight, Dot, CheckCircle2, Flame, Activity, XCircle, CircleDot, PauseCircle } from "lucide-react";
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/ui/timeline";
import CommentSection from "@/components/comment-section";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/shadcn-io/spinner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

// Attachment helper: try to render an <img>, fallback to link if it fails.
function Attachment({ url, idx, onOpen }: { url: string; idx: number; onOpen?: (u: string) => void }) {
  const [loadingImg, setLoadingImg] = useState(true);
  const [imgError, setImgError] = useState(false);
  // Try to render as image; if it fails we show the fallback link box
  const handleClick = (e: React.MouseEvent) => {
    if (imgError) return; // let link behave normally
    e.preventDefault();
    onOpen?.(url);
  };
  return (
    <div className="w-40">
      <a href={url} onClick={handleClick} target="_blank" rel="noreferrer" className="block">
        {!imgError ? (
          <div className="relative w-full h-28 bg-gray-50 rounded overflow-hidden">
            {loadingImg && (
              <div className="absolute inset-0 flex items-center justify-center">
                <LoadingSpinner />
              </div>
            )}
            <Image
              src={url}
              alt={`attachment-${idx}`}
              onLoadingComplete={() => setLoadingImg(false)}
              onError={() => { setImgError(true); setLoadingImg(false); }}
              className="object-cover rounded"
              width={320}
              height={180}
              unoptimized
            />
          </div>
        ) : (
          <div className="px-3 py-2 bg-gray-100 rounded text-sm truncate">{url}</div>
        )}
      </a>
    </div>
  );
}

// Shared types accessible to helper components
export type ThreadEvent = { _id?: string; type: string; details?: string; actorId?: string; createdAt?: number };

export default function TicketThreadPage() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id as string | undefined;

  const params = useParams();
  const ticketId = String(params.ticketId);
  const router = useRouter();

  type Ticket = {
    ticketId: string;
    title: string;
    description?: string;
    priority?: "P0" | "P1" | "P2" | "P3";
    status?: string;
    assignedToGroup?: string;
    assignedToUser?: string;
    _creationTime?: number;
    attachments?: string[];
    project?: string;
    projectColor?: string;
    createdAt?: number;
    tags?: string[];
    dueAt?: number;
    createdBy?: string;
  };

  type ThreadMessage = { _id: string; authorId?: string; role?: string; content?: string; createdAt?: number };
  type Thread = { ticket?: Ticket; messages?: ThreadMessage[]; events?: ThreadEvent[] };

  const thread = useQuery(api.myFunctions.getTicketThread, { ticketId, userId }) as Thread | null | undefined;
  const similarTickets = useAction(api.embeddings.similarTicketsForTicket);
  const me = useQuery(api.users.getByAuthId, { authUserId: userId ?? "" });
  const setStatus = useMutation(api.myFunctions.setTicketStatus);
  const setPriority = useMutation(api.myFunctions.setTicketPriority);
  const assignTicket = useMutation(api.myFunctions.assignTicket);
  const changeProject = useMutation(api.myFunctions.changeProject);
  const assignToGroup = useMutation(api.myFunctions.assignToGroup);
  // Sonner toast is used for notifications
  const allUsers = useQuery(api.users.listAll) as Array<{ authUserId?: string; name?: string; email: string; projects?: string[]; _id?: string }> | undefined;
  const teamsList = useQuery(api.teams.listAll, {});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Resolve display names for authors/actors in messages/events
  const msgIds = (thread?.messages ?? []).map((m) => m.authorId).filter(Boolean) as string[];
  const actorIds = (thread?.events ?? []).map((e) => e.actorId).filter(Boolean) as string[];
  // include ticket actors (creator/assignee)
  const ticketCreator = thread?.ticket?.createdBy ? [thread.ticket.createdBy] : [];
  const ticketAssignee = thread?.ticket?.assignedToUser ? [thread.ticket.assignedToUser as string] : [];
  // Also extract any user IDs embedded inside event.details JSON (e.g. { toUser: '...' })
  const detailIds: string[] = [];
  for (const ev of (thread?.events ?? [])) {
    try {
      if (ev.details) {
        const parsed = JSON.parse(ev.details);
        if (parsed && typeof parsed === "object") {
          if (typeof parsed.toUser === "string") detailIds.push(parsed.toUser);
          if (typeof parsed.assignedToUser === "string") detailIds.push(parsed.assignedToUser);
          if (typeof parsed.userId === "string") detailIds.push(parsed.userId);
        }
      }
    } catch {
      // details not JSON — ignore
    }
  }
  const authorIds = Array.from(new Set([...msgIds, ...actorIds, ...detailIds, ...ticketCreator, ...ticketAssignee])) as string[];
  const authors = useQuery(api.users.getByAuthIds, { authUserIds: authorIds }) as Array<{ authUserId: string; name: string; email: string }> | undefined;

  // Compute whether current user is admin (re-use dashboard pattern)
  const sessionRole = ((session?.user as unknown as { role?: string })?.role ?? "").toLowerCase();
  const meRoles = ((me?.roles ?? []) as string[]).map((r) => r?.toLowerCase?.()).filter(Boolean) as string[];
  const isAdmin = meRoles.includes("admin") || sessionRole === "admin";
  const canChangeTeam = isAdmin || meRoles.includes("dispatcher");
  const teamNames = useMemo(() => (Array.isArray(teamsList) ? (teamsList as Array<{ name?: string }>).map(t => t.name).filter(Boolean) as string[] : []), [teamsList]);

  // Build project members list from all users if ticket.project is present
  const projectMembers = useMemo(() => {
    const proj = thread?.ticket?.project ?? thread?.ticket?.project;
    if (!allUsers) return [] as Array<{ authUserId?: string; name?: string; email?: string; _id?: string }>;
    const members = proj ? allUsers.filter((u) => Array.isArray(u.projects) && (u.projects as string[]).includes(proj)) : [];
    // Ensure current assignee is present in the options so the select can show it
    const assigneeId = thread?.ticket?.assignedToUser;
    if (assigneeId && !members.some((m) => m.authUserId === assigneeId)) {
      const existing = allUsers.find((u) => u.authUserId === assigneeId || u._id === assigneeId);
      if (existing) members.unshift(existing);
      else members.unshift({ authUserId: assigneeId, name: assigneeId, email: "" });
    }
    return members;
  }, [allUsers, thread]);

  // Similar tickets state and effect must be declared before any early returns
  const [similar, setSimilar] = useState<Array<{ _id: string; ticketId: string; title: string; status: string; project?: string; _score: number }>>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await similarTickets({ ticketId, limit: 5 });
        if (alive && Array.isArray(res)) setSimilar(res);
      } catch {
        // ignore errors
      }
    })();
    return () => { alive = false };
  }, [ticketId, similarTickets]);

  // Preload tickets for prev/next navigation (hook must be before early returns)
  const ticketsForNav = usePaginatedQuery(
    api.myFunctions.listTicketsPaginated as unknown as Parameters<typeof usePaginatedQuery>[0],
    { status: undefined, priority: undefined, group: undefined, project: undefined, from: undefined, to: undefined },
    { initialNumItems: 120 }
  ) as unknown as { results?: Array<{ ticketId: string; createdAt?: number; _creationTime?: number; title?: string }>; status: string };

  // State for close action
  const [closing, setClosing] = useState(false);

  if (thread === undefined) return (
    <div className="p-4 w-full flex justify-center h-full items-center">
      <Spinner variant="circle-filled" />
    </div>
  );
  if (thread === null || !thread.ticket) return <div className="p-6">Ticket not found</div>;

  const t = thread.ticket;

  // Build navigation index (stable ascending by creation time)
  const sortedNav = (ticketsForNav.results || []).slice().sort((a, b) => (a.createdAt ?? a._creationTime ?? 0) - (b.createdAt ?? b._creationTime ?? 0));
  const currentIdx = sortedNav.findIndex(x => x.ticketId === t.ticketId);
  const prevTicket = currentIdx > 0 ? sortedNav[currentIdx - 1] : undefined;
  const nextTicket = currentIdx >= 0 && currentIdx < sortedNav.length - 1 ? sortedNav[currentIdx + 1] : undefined;

  const handleClose = async () => {
    if (t.status === 'closed' || closing) return;
    try {
      setClosing(true);
      await setStatus({ ticketId: t.ticketId, status: 'closed' });
      toast.success('Ticket closed', { description: `Ticket ${t.ticketId} marked closed` });
    } catch {
      toast.error('Failed to close', { description: 'Permission denied' });
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="m-4 rounded-lg">
      <header className="flex justify-between items-center p-4 border-b bg-card">
        <Button className="" variant="link" onClick={() => router.push('/new-dash/tickets')}>
          <ArrowLeftIcon /> Ticket list
        </Button>
        <div className="flex gap-2 items-center">
          <Button className="" variant="ghost" size="icon" disabled={!prevTicket} onClick={() => prevTicket && router.push(`/new-dash/tickets/${prevTicket.ticketId}`)}>
            <ChevronLeft />
          </Button>
          <Button className="" variant="ghost" size="icon" disabled={!nextTicket} onClick={() => nextTicket && router.push(`/new-dash/tickets/${nextTicket.ticketId}`)}>
            <ChevronRight />
          </Button>
          <h2 className="font-bold">#{t.ticketId} <span className="text-muted-foreground font-normal bg-muted p-1 px-3 rounded-sm" title={t.title}>{t.title}</span></h2>
        </div>
        <Button variant="default" disabled={t.status === 'closed' || closing} onClick={handleClose}>
          {t.status === 'closed' ? 'Closed' : closing ? 'Closing…' : 'Submit as closed'}
        </Button>
      </header>

      <Tabs defaultValue="overview" className="items-center w-full bg-card">
        <TabsList className="text-foreground h-auto gap-2 rounded-none border-b bg-transparent justify-center px-0 py-1 w-full">
          <TabsTrigger
            value="overview"
            className="max-w-52 hover:bg-accent hover:text-foreground data-[state=active]:after:bg-primary data-[state=active]:hover:bg-accent relative after:absolute after:inset-x-0 after:bottom-0 after:-mb-1 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="similarTickets"
            className="max-w-52 hover:bg-accent hover:text-foreground data-[state=active]:after:bg-primary data-[state=active]:hover:bg-accent relative after:absolute after:inset-x-0 after:bottom-0 after:-mb-1 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Similar tickets
          </TabsTrigger>
          <TabsTrigger
            value="activity"
            className="max-w-52 hover:bg-accent hover:text-foreground data-[state=active]:after:bg-primary data-[state=active]:hover:bg-accent relative after:absolute after:inset-x-0 after:bottom-0 after:-mb-1 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Activity
          </TabsTrigger>
          <TabsTrigger
            value="comments"
            className="max-w-52 hover:bg-accent hover:text-foreground data-[state=active]:after:bg-primary data-[state=active]:hover:bg-accent relative after:absolute after:inset-x-0 after:bottom-0 after:-mb-1 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Comments
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="w-full">
          <div className="p-6 border-b border-gray-200">
            {/* Overview Grid Row 1: Title, Status, Priority, Project */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {/* Title */}
              <div className="min-w-0">
                <div className="text-xs font-medium text-muted-foreground mb-1">Title</div>
                <div className="text-lg font-semibold text-foreground truncate" title={t.title}>{t.title}</div>
              </div>
              {/* Status */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Status</div>
                <Select
                  onValueChange={async (val: string) => {
                    try {
                      await setStatus({ ticketId: t.ticketId, status: val as 'open'|'in_progress'|'in_development'|'missing_information'|'resolved'|'closed'|'escalated' });
                      toast.success('Status updated', { description: `Status set to ${val}` });
                    } catch {
                      toast.error('Forbidden', { description: 'You are not allowed to update status' });
                    }
                  }}
                  value={t.status ?? undefined}
                >
                  {(() => {
                    const statusMeta: Record<string, { trigger: string; dot: string; label: string }> = {
                      open: { trigger: 'bg-red-100 text-red-800 border-red-200', dot: 'bg-red-500', label: 'Open' },
                      in_progress: { trigger: 'bg-blue-100 text-blue-800 border-blue-200', dot: 'bg-blue-500', label: 'In Progress' },
                      in_development: { trigger: 'bg-indigo-100 text-indigo-800 border-indigo-200', dot: 'bg-indigo-500', label: 'In Development' },
                      missing_information: { trigger: 'bg-orange-100 text-orange-800 border-orange-200', dot: 'bg-orange-500', label: 'Missing Information' },
                      resolved: { trigger: 'bg-green-100 text-green-800 border-green-200', dot: 'bg-green-500', label: 'Resolved' },
                      closed: { trigger: 'bg-gray-100 text-gray-800 border-gray-200', dot: 'bg-gray-500', label: 'Closed' },
                    };
                    const meta = statusMeta[t.status ?? ''];
                    const label = meta?.label ?? 'Select status';
                    return (
                      <SelectTrigger className={`w-full ${meta ? `border ${meta.trigger}` : ''}`}>
                        <div className="flex items-center gap-2 w-full">
                          {meta && <span className={`size-2 rounded-full ${meta.dot}`} />}
                          <span className="truncate">{label}</span>
                        </div>
                      </SelectTrigger>
                    );
                  })()}
                  <SelectContent>
                    {[
                      { value: 'open', label: 'Open', dot: 'bg-red-500' },
                      { value: 'in_progress', label: 'In Progress', dot: 'bg-blue-500' },
                      { value: 'in_development', label: 'In Development', dot: 'bg-indigo-500' },
                      { value: 'missing_information', label: 'Missing Information', dot: 'bg-orange-500' },
                      { value: 'resolved', label: 'Resolved', dot: 'bg-green-500' },
                      { value: 'closed', label: 'Closed', dot: 'bg-gray-500' },
                    ].map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <span className="inline-flex items-center gap-2">
                          <span className={`size-2 rounded-full ${s.dot}`} />
                          {s.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Priority */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Priority</div>
                <Select
                  onValueChange={async (val: string) => {
                    try {
                      await setPriority({ ticketId: t.ticketId, priority: val as 'P0'|'P1'|'P2'|'P3' });
                      toast.success('Priority updated', { description: `Priority set to ${val}` });
                    } catch {
                      toast.error('Forbidden', { description: 'You are not allowed to update priority' });
                    }
                  }}
                  value={t.priority ?? undefined}
                >
                  {(() => {
                    const metaMap: Record<string, { cls: string; label: string }> = {
                      P0: { cls: 'bg-red-100 text-red-800 border-red-200', label: 'Critical' },
                      P1: { cls: 'bg-orange-100 text-orange-800 border-orange-200', label: 'High' },
                      P2: { cls: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'Medium' },
                      P3: { cls: 'bg-green-100 text-green-800 border-green-200', label: 'Low' },
                    };
                    const meta = t.priority ? metaMap[t.priority] : undefined;
                    const label = meta?.label ?? 'Select priority';
                    return (
                      <SelectTrigger className={`w-full ${meta ? `border ${meta.cls}` : ''}`}>
                        <div className="flex items-center gap-2 w-full">
                          <span className="truncate">{label}</span>
                        </div>
                      </SelectTrigger>
                    );
                  })()}
                  <SelectContent>
                    {[
                      { value: 'P0', label: 'Critical' },
                      { value: 'P1', label: 'High' },
                      { value: 'P2', label: 'Medium' },
                      { value: 'P3', label: 'Low' },
                    ].map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Project */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Project</div>
                <ProjectControl
                  current={t.project}
                  canEdit={isAdmin || t.assignedToUser === userId}
                  projects={(me?.projects ?? []) as string[]}
                  onChange={async (val) => {
                    try {
                      await changeProject({ ticketId: t.ticketId, project: val });
                      toast.success('Project updated', { description: val ? `Project set to ${val}` : 'Project cleared' });
                    } catch {
                      toast.error('Forbidden', { description: 'You are not allowed to change project' });
                    }
                  }}
                  hideLabel
                />
              </div>
            </div>

            {/* Overview Grid Row 2: Created by, Assigned to, Team, SLA */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Created by */}
              <div className="min-w-0">
                <div className="text-xs font-medium text-muted-foreground mb-1">Created by</div>
                <div className="text-sm text-foreground truncate">{authors?.find((a) => a.authUserId === t.createdBy)?.name ?? t.createdBy ?? 'Unknown'}</div>
              </div>
              {/* Assigned to */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Assigned to</div>
                <AssignControl
                  userId={userId}
                  assignedTo={t.assignedToUser}
                  currentAssigneeName={authors?.find((a) => a.authUserId === t.assignedToUser)?.name}
                  isAssigningDefault={false}
                  projectMembers={projectMembers}
                  canReassign={isAdmin || t.assignedToUser === userId}
                  onAssign={async (uid) => {
                    try {
                      await assignTicket({ ticketId: t.ticketId, assigneeUserId: uid ?? '' });
                      toast.success('Assignment updated', { description: uid ? `Assigned to ${uid}` : 'Unassigned' });
                    } catch {
                      toast.error('Forbidden', { description: 'You are not allowed to assign this ticket' });
                    }
                  }}
                />
              </div>
              {/* Team */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Team</div>
                <TeamControl
                  current={t.assignedToGroup}
                  canEdit={canChangeTeam}
                  teams={teamNames}
                  onChange={async (val: string) => {
                    try {
                      await assignToGroup({ ticketId: t.ticketId, group: val });
                      toast.success('Team updated', { description: `Team set to ${val}` });
                    } catch {
                      toast.error('Forbidden', { description: 'You are not allowed to change team' });
                    }
                  }}
                  hideLabel
                />
              </div>
              {/* SLA */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">SLA</div>
                {(() => {
                  const created = t.createdAt ?? t._creationTime ?? Date.now();
                  const now = Date.now();
                  const elapsedMs = Math.max(0, now - created);
                  const slaMs = t.dueAt ? Math.max(1, (t.dueAt - created)) : 0;
                  const pct = t.dueAt ? Math.min(100, Math.max(0, Math.round((elapsedMs / slaMs) * 100))) : 0;
                  const elapsedH = Math.round(elapsedMs / (1000 * 60 * 60));
                  const slaH = t.dueAt ? Math.max(1, Math.round(slaMs / (1000 * 60 * 60))) : 0;
                  const overdue = t.dueAt && Date.now() > (t.dueAt ?? 0);
                  return (
                    <div className="flex flex-col gap-1">
                      <Progress value={pct} />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{elapsedH}h elapsed</span>
                        {t.dueAt ? <span>{slaH}h SLA</span> : <span>No SLA</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        <span>Created {t.createdAt ? new Date(t.createdAt).toLocaleString() : t._creationTime ? new Date(t._creationTime).toLocaleString() : '—'}</span>
                        {overdue && <span className="ml-2 text-red-600 font-medium">Overdue</span>}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

        <div className="p-6  border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Description</h3>
          <div className="prose prose-sm max-w-none">
            <p className="text-gray-700 whitespace-pre-wrap">{t.description}</p>
          </div>

          {t.tags && t.tags.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Tags</h4>
              <div className="flex flex-wrap gap-2">
                {t.tags.map((tag: string, index: number) => (
                  <span key={index} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">{tag}</span>
                ))}
              </div>
            </div>
          )}

          {t.attachments && t.attachments.length > 0 && (
            <div className="mt-4 pt-2 border-t">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Attachments</h3>
              <div className="flex flex-wrap gap-3">
                {t.attachments.map((url: string, idx: number) => (
                  <Attachment key={idx} url={url} idx={idx} onOpen={(u) => setPreviewUrl(u)} />
                ))}
              </div>
            </div>
          )}

          {/* Lightbox preview */}
          {previewUrl && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setPreviewUrl(null)}>
              <div className="max-w-3xl max-h-[80vh] p-4">
                <Image src={previewUrl} alt="preview" width={1200} height={800} className="object-contain" unoptimized />
              </div>
            </div>
          )}
        </div>
        </TabsContent>
        <TabsContent value="similarTickets" className="w-full px-20">
            {/* Similar tickets */}
          {similar.length > 0 && (
            <div className="mb-6 mt-5">
              {/* <div className="text-sm font-medium my-2">Similar tickets</div> */}
              <ul className="divide-y border rounded">
                {similar.map((s) => (
                  <li key={s._id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <a href={`/dashboard/tickets/${s.ticketId}`} className="font-medium hover:underline truncate inline-block max-w-[60ch]" title={s.title}>
                        {s.title}
                      </a>
                      <div className="text-xs text-muted-foreground">{s.ticketId} • {s.project ?? '—'} • {s.status}</div>
                    </div>
                    <div className="text-xs text-muted-foreground ml-3">{(s._score).toFixed(2)}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>
        <TabsContent value="activity" className="w-full px-20 pb-5">
          {isAdmin && (
            <div className="mt-8">
              {/* <div className="text-sm font-medium mb-4">Activity</div> */}
              <ActivityTimeline events={(thread.events ?? []) as ThreadEvent[]} authors={authors} />
            </div>
          )}
        </TabsContent>
        <TabsContent value="comments" className="w-full px-52 pt-4">
            <CommentSection ticketId={t.ticketId} />
        </TabsContent>
      </Tabs>

    </div>
  );
}

// Activity timeline component leveraging the Timeline UI primitives
function ActivityTimeline({ events, authors }: { events: ThreadEvent[]; authors?: Array<{ authUserId: string; name: string; email: string }> }) {
  // Sort newest first or oldest first? Timeline design above implies chronological (oldest at top)
  const ordered = [...events].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

  const now = Date.now();
  const formatRelative = (ts?: number) => {
    if (!ts) return '';
    const diffMs = now - ts;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  };

  const prettyValue = (val: unknown): string => {
    if (val === null || val === undefined) return '—';
    if (typeof val !== 'string') return String(val);
    const raw = val;
    const lower = raw.toLowerCase();
    const map: Record<string, string> = {
      open: 'Open',
      in_progress: 'In progress',
      in_development: 'In development',
      missing_information: 'Missing information',
      escalated: 'Escalated',
      resolved: 'Resolved',
      closed: 'Closed'
    };
    if (map[lower]) return map[lower];
    return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const renderDetails = (e: ThreadEvent): { action: string; description?: string; actorName: string; avatarFallback: string; rich?: React.ReactNode } => {
    const actorName = authors?.find((a) => a.authUserId === e.actorId)?.name || e.actorId || 'System';
    let action = e.type;
    let description: string | undefined = undefined;
    let rich: React.ReactNode | undefined;

    const tryPretty = (obj: unknown) => {
      try {
        return JSON.stringify(obj, null, 2);
      } catch { return undefined; }
    };

    interface ParsedDetails {
      toUser?: string; assignedToUser?: string; userId?: string;
      oldValue?: unknown; fromValue?: unknown; previous?: unknown;
      newValue?: unknown; toValue?: unknown; next?: unknown;
      action?: string; description?: string; status?: string; project?: string;
      // Generic diff style keys
      from?: unknown; to?: unknown;
      // Field change batch
      priority?: string; team?: string; attachments?: number;
    }
    const isParsedDetails = (v: unknown): v is ParsedDetails => typeof v === 'object' && v !== null;

    try {
      if (e.details) {
        const parsed = JSON.parse(e.details);
        if (parsed && isParsedDetails(parsed)) {
          const lowerType = (e.type || '').toLowerCase();
          const toUser = parsed.toUser ?? parsed.assignedToUser ?? parsed.userId;
          const toName = typeof toUser === 'string' ? (authors?.find((a) => a.authUserId === toUser)?.name || toUser) : undefined;
          const oldValue = parsed.oldValue ?? parsed.fromValue ?? parsed.previous;
          const newValue = parsed.newValue ?? parsed.toValue ?? parsed.next;
          const explicitAction = parsed.action;
          const explicitDescription = parsed.description;

          if (explicitAction && typeof explicitAction === 'string') action = explicitAction;

          if (lowerType.includes('assign') || explicitAction === 'assigned') {
            action = 'changed assignment';
            if (toName) description = `Assigned to ${toName}`;
            if (!description && newValue) description = `Assigned → ${newValue}`;
          } else if (lowerType.includes('status')) {
            action = 'updated status';
            if (newValue || parsed.status) {
              const st = parsed.status ?? newValue;
              const oldPretty = oldValue !== undefined ? prettyValue(oldValue) + ' → ' : '';
              description = `${oldPretty}${prettyValue(st)}`;
            }
          } else if (lowerType.includes('project')) {
            action = 'changed project';
            if (newValue || parsed.project) {
              const proj = parsed.project ?? newValue;
              const oldPretty = oldValue !== undefined ? prettyValue(oldValue) + ' → ' : '';
              description = `${oldPretty}${prettyValue(proj)}`;
            }
          }

          // If still no description but structured description exists
          if (!description && typeof explicitDescription === 'string') {
            description = explicitDescription;
          }
          // If old/new present and description empty, compose generic transition
          if (!description && (oldValue !== undefined || newValue !== undefined)) {
            description = `${prettyValue(oldValue)} → ${prettyValue(newValue)}`;
          }

          // Handle generic {from, to} diff objects (e.g. status changes not tagged)
          if (!description && (parsed.from !== undefined || parsed.to !== undefined)) {
            description = `${prettyValue(parsed.from)} → ${prettyValue(parsed.to)}`;
            if (/status/i.test(action) === false && typeof parsed.from === 'string' && typeof parsed.to === 'string') {
              action = 'updated value';
            }
          }

            // Batch field update object e.g. {priority:"P3", team:"IT", project:"X", attachments:0}
          if (!description) {
            const changedFields: string[] = [];
            const priorityLabel: Record<string,string> = { P0:'Critical', P1:'High', P2:'Medium', P3:'Low' };
            if (parsed.priority) changedFields.push(`Priority=${priorityLabel[parsed.priority] || parsed.priority}`);
            if (parsed.team) changedFields.push(`Team=${parsed.team}`);
            if (parsed.project) changedFields.push(`Project=${parsed.project}`);
            if (typeof parsed.attachments === 'number') changedFields.push(`Attachments=${parsed.attachments}`);
            // Avoid from/to we handled already
            if (!description && changedFields.length) {
              action = changedFields.length > 1 ? 'updated fields' : 'updated field';
              description = changedFields.join(' • ');
            }
          }

          // Provide rich formatted JSON only if we did not derive a concise description OR object is large
          const pretty = tryPretty(parsed);
          const keyCount = Object.keys(parsed as Record<string, unknown>).length;
          const showRaw = !description || keyCount > 6; // heuristic
          if (pretty && showRaw) {
            rich = (
              <details className="mt-1 group">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">Details JSON</summary>
                <pre className="mt-1 rounded border bg-muted/40 p-2 text-[10px] leading-relaxed overflow-x-auto max-h-60 whitespace-pre-wrap break-words">
                  {pretty}
                </pre>
              </details>
            );
          }
        } else if (typeof e.details === 'string') {
          description = e.details;
        }
      }
    } catch {
      if (typeof e.details === 'string') description = e.details;
    }
    // Final fallback if still nothing
    if (!description && e.details && typeof e.details === 'string') description = e.details.slice(0, 200) + (e.details.length > 200 ? '…' : '');
    const avatarFallback = actorName?.[0]?.toUpperCase?.() || 'U';
    return { action, description, actorName, avatarFallback, rich };
  };

  // Highlight / color-code phrases inside description
  const [highlightEnabled, setHighlightEnabled] = useState(true);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('timelineHighlightEnabled');
      if (saved !== null) setHighlightEnabled(saved === 'true');
    } catch { /* ignore */ }
  }, []);
  const toggleHighlight = () => {
    setHighlightEnabled(prev => {
      const next = !prev; try { localStorage.setItem('timelineHighlightEnabled', String(next)); } catch {}
      return next;
    });
  };

  const highlightDescription = (desc: string): React.ReactNode => {
    if (!highlightEnabled) return desc;
    // Maps for statuses & priorities
    const statusClasses: Record<string, string> = {
      open: 'text-red-600 dark:text-red-400',
      'in progress': 'text-blue-600 dark:text-blue-400',
      'in development': 'text-indigo-600 dark:text-indigo-400',
      'missing information': 'text-orange-600 dark:text-orange-400',
      escalated: 'text-fuchsia-600 dark:text-fuchsia-400',
      resolved: 'text-green-600 dark:text-green-400',
      closed: 'text-gray-600 dark:text-gray-400'
    };
    const priorityClasses: Record<string, string> = {
      critical: 'text-red-600 dark:text-red-400',
      high: 'text-orange-600 dark:text-orange-400',
      medium: 'text-amber-600 dark:text-amber-400',
      low: 'text-green-600 dark:text-green-400'
    };

    const statusIcon = (val?: string) => {
      const v = (val || '').toLowerCase();
      const commonCls = 'w-3 h-3';
      switch (v) {
        case 'open': return <CircleDot className={commonCls} />;
  case 'in progress': return <Activity className={commonCls} />;
  case 'in development': return <Activity className={commonCls} />;
  case 'missing information': return <AlertTriangle className={commonCls} />;
        case 'escalated': return <AlertTriangle className={commonCls} />;
        case 'resolved': return <CheckCircle2 className={commonCls} />;
        case 'closed': return <XCircle className={commonCls} />;
        default: return <Circle className={commonCls} />;
      }
    };
    const priorityIcon = (val?: string) => {
      const v = (val || '').toLowerCase();
      const commonCls = 'w-3 h-3';
      switch (v) {
        case 'critical': return <AlertTriangle className={commonCls} />;
        case 'high': return <Flame className={commonCls} />;
        case 'medium': return <PauseCircle className={commonCls} />;
        case 'low': return <CheckCircle2 className={commonCls} />;
        default: return <Flag className={commonCls} />;
      }
    };
    const genericIcon = () => <Dot className="w-3 h-3" />;
    const transitionArrow = () => <ArrowRight className="w-3 h-3 text-muted-foreground" />;
    const wrapToken = (text: string, cls: string, icon?: React.ReactNode, key?: React.Key) => (
      <span key={key} className="inline-flex items-center gap-1">
        {icon}
        <span className={cls + ' font-medium'}>{text}</span>
      </span>
    );

    // If transition pattern old → new
    if (desc.includes(' → ')) {
      const [oldPart, newPart] = desc.split(' → ');
      const lowerNew = newPart.toLowerCase();
      const lowerOld = oldPart.toLowerCase();
      const newClass = statusClasses[lowerNew] || priorityClasses[lowerNew] || 'text-foreground';
      const oldClass = statusClasses[lowerOld] || priorityClasses[lowerOld] ? 'text-muted-foreground' : 'text-muted-foreground';
      const iconNew = statusClasses[lowerNew] ? statusIcon(newPart) : priorityClasses[lowerNew] ? priorityIcon(newPart) : genericIcon();
      const iconOld = statusClasses[lowerOld] ? statusIcon(oldPart) : priorityClasses[lowerOld] ? priorityIcon(oldPart) : genericIcon();
      return (
        <span className="inline-flex items-center gap-2 flex-wrap">
          {wrapToken(oldPart, oldClass, iconOld, 'old')}
          {transitionArrow()}
          {wrapToken(newPart, newClass, iconNew, 'new')}
        </span>
      );
    }

    // Batch updates separated by •
    if (desc.includes(' • ')) {
      return (
        <span className="flex flex-wrap gap-x-2 gap-y-0.5">
          {desc.split(' • ').map((segment, i) => {
            // field=value pattern
            const eqIdx = segment.indexOf('=');
            if (eqIdx > 0) {
              const field = segment.slice(0, eqIdx).trim();
              const valueRaw = segment.slice(eqIdx + 1).trim();
              const valueLower = valueRaw.toLowerCase();
              const cls = statusClasses[valueLower] || priorityClasses[valueLower] || 'text-foreground';
              const icon = statusClasses[valueLower] ? statusIcon(valueRaw) : priorityClasses[valueLower] ? priorityIcon(valueRaw) : genericIcon();
              return (
                <span key={i} className="text-xs inline-flex items-center gap-1">
                  <span className="text-muted-foreground">{field}=</span>
                  {icon}
                  <span className={cls + ' font-medium'}>{valueRaw}</span>
                </span>
              );
            }
            return <span key={i} className="text-xs">{segment}</span>;
          })}
        </span>
      );
    }

    // Assignment sentence
    if (/^Assigned to /i.test(desc)) {
      const name = desc.replace(/^Assigned to /i, '');
      return (
        <span>
          <span className="text-muted-foreground">Assigned to </span>
          <span className="font-medium text-blue-600">{name}</span>
        </span>
      );
    }

    // Status or priority standalone
    const lower = desc.toLowerCase();
    if (statusClasses[lower] || priorityClasses[lower]) {
      const cls = statusClasses[lower] || priorityClasses[lower];
      return <span className={`font-medium ${cls}`}>{desc}</span>;
    }

    // Generic fallback with inline highlighting of known words
    const tokens = desc.split(/(\s+)/);
    return (
      <span>
        {tokens.map((t, i) => {
          const key = t.toLowerCase();
          const cls = statusClasses[key] || priorityClasses[key];
            if (cls) return <span key={i} className={`font-medium ${cls}`}>{t}</span>;
            return <span key={i}>{t}</span>;
        })}
      </span>
    );
  };

  if (!ordered.length) {
    return <div className="text-xs text-muted-foreground">No activity yet.</div>;
  }

  return (
    <div className="relative">
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={toggleHighlight}
          className="text-[10px] px-2 py-1 rounded border bg-background hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          {highlightEnabled ? 'Disable highlight' : 'Enable highlight'}
        </button>
      </div>
      <Timeline className="relative">
      {ordered.map((e, idx) => {
  const { action, description, actorName, avatarFallback, rich } = renderDetails(e);
        const rel = formatRelative(e.createdAt);
        return (
          <TimelineItem
            key={e._id ?? `evt-${idx}`}
            step={idx + 1}
            className="group-data-[orientation=vertical]/timeline:ms-10 group-data-[orientation=vertical]/timeline:not-last:pb-8"
          >
            <TimelineHeader>
              <TimelineSeparator className="group-data-[orientation=vertical]/timeline:-left-7 group-data-[orientation=vertical]/timeline:h-[calc(100%-1.5rem-0.25rem)] group-data-[orientation=vertical]/timeline:translate-y-6.5" />
              <TimelineTitle className="mt-0.5">
                {actorName} <span className="text-muted-foreground text-sm font-normal">{action}</span>
              </TimelineTitle>
              <TimelineIndicator className="bg-primary/10 group-data-completed/timeline-item:bg-primary group-data-completed/timeline-item:text-primary-foreground flex size-6 items-center justify-center border-none group-data-[orientation=vertical]/timeline:-left-7">
                <div className="size-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-medium text-primary-700 dark:text-primary-200">
                  {avatarFallback}
                </div>
              </TimelineIndicator>
            </TimelineHeader>
            <TimelineContent className="text-foreground mt-2 rounded-lg border px-4 py-3">
              {description && <div className="text-xs leading-relaxed whitespace-pre-wrap mb-1">{highlightDescription(description)}</div>}
              {rich}
              <TimelineDate className="mt-1 mb-0">{rel}</TimelineDate>
            </TimelineContent>
          </TimelineItem>
        );
      })}
      </Timeline>
    </div>
  );
}

function AssignControl({ userId, assignedTo, isAssigningDefault, projectMembers, onAssign, currentAssigneeName, canReassign }: { userId?: string; assignedTo?: string; isAssigningDefault?: boolean; projectMembers?: Array<{ authUserId?: string; name?: string; email?: string; _id?: string }>; onAssign: (uid: string | null) => void; currentAssigneeName?: string; canReassign?: boolean }) {
  const [isAssigning, setIsAssigning] = useState<boolean>(!!isAssigningDefault);

  const renderSelect = (currentValue?: string) => (
    <Select
      value={currentValue ?? '__none'}
      onValueChange={async (val) => {
        const newVal = val === '__none' ? null : val;
        await onAssign(newVal);
        setIsAssigning(false);
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select assignee" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">Unassigned</SelectItem>
        {userId && <SelectItem value={userId}>Me</SelectItem>}
        {(projectMembers ?? []).filter(Boolean).map((member) => (
          <SelectItem key={member._id ?? member.authUserId} value={member.authUserId ?? ''}>
            {member.name || member.email || member.authUserId}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  // If no assignee yet, offer quick actions or selection
  if (!assignedTo) {
    if (!isAssigning) {
      return (
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!userId} onClick={async () => { if (userId) await onAssign(userId); }}>Start working</Button>
          <Button size="sm" variant="ghost" onClick={() => setIsAssigning(true)}>Assign someone else</Button>
        </div>
      );
    }
    return renderSelect();
  }

  // Already assigned
  if (isAssigning) {
    return renderSelect(assignedTo);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">{currentAssigneeName ?? assignedTo}</span>
      {canReassign && (
        <Button size="icon" variant="outline" onClick={() => setIsAssigning(true)} aria-label="Reassign">
          <Edit className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

function ProjectControl({ current, canEdit, projects, onChange, hideLabel }: { current?: string; canEdit: boolean; projects: string[]; onChange: (val: string | null) => void; hideLabel?: boolean }) {
  const [editing, setEditing] = useState(false);
  if (!canEdit) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Project:</span>
        <span className="text-sm text-gray-600">{current || '—'}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {!hideLabel && <span className="text-sm font-semibold text-gray-700">Project:</span>}
      {editing ? (
        <Select
          value={current || '__none'}
          onValueChange={(val) => {
            const newVal = val === '__none' ? null : val;
            void onChange(newVal);
            setEditing(false);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">None</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">{current || '—'}</span>
          <Button size="icon" variant="outline" onClick={() => setEditing(true)} aria-label="Edit project">
            <Edit className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function TeamControl({ current, canEdit, teams, onChange, hideLabel }: { current?: string; canEdit: boolean; teams: string[]; onChange: (val: string) => void; hideLabel?: boolean }) {
  const [editing, setEditing] = useState(false);
  if (!canEdit) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Team:</span>
        <span className="text-sm text-gray-600">{current || '—'}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {!hideLabel && <span className="text-sm font-medium text-gray-700">Team:</span>}
      {editing ? (
        <Select
          value={current && teams.includes(current) ? current : undefined}
          onValueChange={(val) => {
            void onChange(val);
            setEditing(false);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select team" />
          </SelectTrigger>
          <SelectContent>
            {teams.map((g) => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">{current || '—'}</span>
          <Button size="icon" variant="outline" onClick={() => setEditing(true)} aria-label="Edit team">
            <Edit className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
