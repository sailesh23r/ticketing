"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CardContent } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { useState, useMemo } from "react";
import { useToast } from "@/components/ui/toast-provider";
import Image from "next/image";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ArrowLeft, User, Calendar, Clock, AlertTriangle, Edit } from "lucide-react";
import CommentSection from "@/components/comment-section";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/shadcn-io/spinner";

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
  type ThreadEvent = { _id?: string; type: string; details?: string; actorId?: string; createdAt?: number };
  type Thread = { ticket?: Ticket; messages?: ThreadMessage[]; events?: ThreadEvent[] };

  const thread = useQuery(api.myFunctions.getTicketThread, { ticketId, userId }) as Thread | null | undefined;
  const me = useQuery(api.users.getByAuthId, { authUserId: userId ?? "" });
  const setStatus = useMutation(api.myFunctions.setTicketStatus);
  const assignTicket = useMutation(api.myFunctions.assignTicket);
  const changeProject = useMutation(api.myFunctions.changeProject);
  const { push: pushToast } = useToast();
  const allUsers = useQuery(api.users.listAll) as Array<{ authUserId?: string; name?: string; email: string; projects?: string[]; _id?: string }> | undefined;
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

  if (thread === undefined) return( 
                  <div className="p-4 w-full flex justify-center h-full items-center">
                    <Spinner variant="circle-filled"  />
                  </div>
                  );
  if (thread === null || !thread.ticket) return <div className="p-6">Ticket not found</div>;

  const t = thread.ticket;

  return (
    <div className=" mx-auto p-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
                <span className={`px-3 py-1 text-sm font-medium rounded-full border ${(() => {
                  const map: Record<string, string> = { P0: 'bg-red-100 text-red-800 border-red-200', P1: 'bg-orange-100 text-orange-800 border-orange-200', P2: 'bg-yellow-100 text-yellow-800 border-yellow-200', P3: 'bg-green-100 text-green-800 border-green-200' };
                  return map[t.priority ?? ''] ?? 'bg-gray-100 text-gray-800 border-gray-200';
                })()}`}>
                  {({ P0: 'urgent', P1: 'high', P2: 'medium', P3: 'low' } as Record<string, string>)[t.priority ?? ''] ?? t.priority}
                </span>
                {t.dueAt && Date.now() > (t.dueAt ?? 0) && (
                  <div className="flex items-center gap-1 text-red-600">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="text-sm font-medium">SLA Breach</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-6 text-sm text-gray-500 mb-4">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.projectColor ?? undefined }} />
                  <span>{t.project ?? '—'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>Created {t.createdAt ? new Date(t.createdAt).toLocaleString() : t._creationTime ? new Date(t._creationTime).toLocaleString() : '—'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  <span>By {authors?.find((a) => a.authUserId === t.createdBy)?.name ?? t.createdBy ?? 'Unknown'}</span>
                </div>
              </div>

              {t.dueAt && (
                <div className="flex items-center gap-4 text-sm mb-4">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">{Math.max(0, Math.round(((Date.now() - (t.createdAt ?? t._creationTime ?? Date.now())) / (1000 * 60 * 60))))}h elapsed / {(t.dueAt && Math.max(1, Math.round(((t.dueAt - (t.createdAt ?? t._creationTime ?? Date.now())) / (1000 * 60 * 60))))) || '-'}h SLA</span>
                  </div>
                  {Date.now() > (t.dueAt ?? 0) && (
                    <span className="text-red-600 font-medium">Overdue</span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Status:</span>
              <Select onValueChange={async (val: string) => {
                try {
                  await setStatus({ ticketId: t.ticketId, status: val as 'open' | 'in_progress' | 'resolved' | 'closed' });
                  pushToast({ title: 'Status updated', description: `Status set to ${val}`, variant: 'success' });
                } catch {
                  pushToast({ title: 'Forbidden', description: 'You are not allowed to update status', variant: 'destructive' });
                }
              }} value={t.status}>
                <SelectTrigger className={`w-[180px] px-3 py-1 rounded-full text-sm font-medium border-0 ${t.status === 'open' ? 'bg-red-100 text-red-800' : t.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' : t.status === 'resolved' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>

            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Assigned to:</span>
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
                    pushToast({ title: 'Assignment updated', description: uid ? `Assigned to ${uid}` : 'Unassigned', variant: 'success' });
                  } catch {
                    pushToast({ title: 'Forbidden', description: 'You are not allowed to assign this ticket', variant: 'destructive' });
                  }
                }}
              />
            </div>
            <ProjectControl
              current={t.project}
              canEdit={isAdmin || t.assignedToUser === userId}
              projects={(me?.projects ?? []) as string[]}
              onChange={async (val) => {
                try {
                  await changeProject({ ticketId: t.ticketId, project: val });
                  pushToast({ title: 'Project updated', description: val ? `Project set to ${val}` : 'Project cleared', variant: 'success' });
                } catch {
                  pushToast({ title: 'Forbidden', description: 'You are not allowed to change project', variant: 'destructive' });
                }
              }}
            />
            </div>
          </div>
        </div>

        <div className="p-6 border-b border-gray-200">
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
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Attachments</h4>
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

        {/* Comments / activity area (events visible only to admins) */}
        <CardContent>
          {isAdmin && (
            <>
              <div className="text-sm font-medium mb-2">Activity</div>
              <div className="space-y-3">
                {(thread.events ?? []).map((e: ThreadEvent, idx: number) => {
                  const actor = authors?.find((a) => a.authUserId === e.actorId)?.name ?? e.actorId ?? 'System';
                  let detailsText = String(e.details ?? '');
                  try {
                    if (e.details) {
                      const parsed = JSON.parse(e.details);
                      if (parsed && typeof parsed === 'object') {
                        const toUser = parsed.toUser ?? parsed.assignedToUser ?? parsed.userId;
                        if (typeof toUser === 'string') {
                          const toName = authors?.find((a) => a.authUserId === toUser)?.name ?? toUser;
                          if ((e.type || '').toLowerCase().includes('assign')) {
                            detailsText = `Assigned — ${toName}`;
                          } else {
                            detailsText = JSON.stringify({ ...parsed, toUser: toName }, null, 2);
                          }
                        }
                      }
                    }
                  } catch { }
                  return (
                    <div key={e._id ?? `ev-${idx}`} className="text-sm text-muted-foreground border-l-2 border-muted pl-2">
                      <div className="text-xs uppercase tracking-wide">{e.type} {e.actorId ? `— ${actor}` : ''}</div>
                      <div className="text-xs">{detailsText}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Comments: use shared CommentSection component */}
          {/* existing local message handlers remain but CommentSection uses api.comments endpoints */}
          {/* Import and render the component */}
          <div className="pt-4">
            <CommentSection ticketId={t.ticketId} />
          </div>
        </CardContent>
      </div>
    </div>
  );
}

function AssignControl({ userId, assignedTo, isAssigningDefault, projectMembers, onAssign, currentAssigneeName, canReassign }: { userId?: string; assignedTo?: string; isAssigningDefault?: boolean; projectMembers?: Array<{ authUserId?: string; name?: string; email?: string; _id?: string }>; onAssign: (uid: string | null) => void; currentAssigneeName?: string; canReassign?: boolean }) {
  const [isAssigning, setIsAssigning] = useState<boolean>(!!isAssigningDefault);

  // If no assignee yet, offer quick self-assign button
  if (!assignedTo) {
    if (!isAssigning) {
      return (
        <div className="flex items-center gap-2">
          <button
            disabled={!userId}
            onClick={async () => { if (userId) await onAssign(userId); }}
            className="flex items-center gap-1 px-3 py-1 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded transition-colors"
          >
            Start working
          </button>
          <button
            onClick={() => setIsAssigning(true)}
            className="px-2 py-1 text-xs text-blue-600 hover:underline"
          >
            Assign someone else
          </button>
        </div>
      );
    }
    return (
      <select
        onChange={(e) => onAssign(e.target.value || null)}
        className="px-3 py-1 border border-gray-300 rounded text-sm"
        defaultValue=""
      >
        <option value="">Select assignee</option>
        {userId && <option value={userId}>Me</option>}
        {(projectMembers ?? []).filter(Boolean).map((member) => (
          <option key={member._id ?? member.authUserId} value={member.authUserId}>{member.name || member.email || member.authUserId}</option>
        ))}
      </select>
    );
  }

  // Already assigned: show current assignee with option to reassign
  if (isAssigning) {
    return (
      <select
        onChange={(e) => onAssign(e.target.value || null)}
        className="px-3 py-1 border border-gray-300 rounded text-sm"
        value={assignedTo}
      >
        {userId && <option value={userId}>Me</option>}
        {(projectMembers ?? []).filter(Boolean).map((member) => (
          <option key={member._id ?? member.authUserId} value={member.authUserId}>{member.name || member.email || member.authUserId}</option>
        ))}
        <option value="">Unassigned</option>
      </select>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">{currentAssigneeName ?? assignedTo}</span>
      {canReassign && (
        <button
          onClick={() => setIsAssigning(true)}
          className="flex items-center gap-1 px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
        >
          <Edit className="w-3 h-3" /> Change
        </button>
      )}
    </div>
  );
}

function ProjectControl({ current, canEdit, projects, onChange }: { current?: string; canEdit: boolean; projects: string[]; onChange: (val: string | null) => void }) {
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
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-gray-700">Project:</span>
      {editing ? (
        <Select
          value={current || '__none'}
          onValueChange={(val) => {
            const newVal = val === '__none' ? null : val;
            void onChange(newVal);
            setEditing(false);
          }}
        >
          <SelectTrigger className="w-[220px] px-3 py-1 rounded text-sm border-gray-300">
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
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
          >
            <Edit className="w-3 h-3" /> Change
          </button>
        </div>
      )}
    </div>
  );
}
