"use client";
import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
// Removed unused Card imports
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DateRangePicker, DateRangeValue } from '@/components/date-range-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FileSpreadsheet, Share2, Filter, ChevronDown, ChevronRight } from 'lucide-react';
import { ChartAreaInteractive } from '@/components/chart-area-interactive';
import { ChartLineInteractive } from '@/components/chart-line-interactive';
import { ChartPieDonutText } from '@/components/chart-pie';
import { SectionCardsNew } from '@/components/section-cards-new';
import { TopPerformers } from '@/components/top-perfomers';
import { authClient } from '@/lib/auth-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

// Safely extract current user id from session data without using 'any'
function extractUserId(sd: unknown): string | undefined {
  if (typeof sd !== 'object' || sd === null) return undefined;
  const obj = sd as { user?: unknown; session?: unknown };
  const u = obj.user as { id?: unknown } | undefined;
  if (u && typeof u === 'object' && u !== null && typeof u.id === 'string') return u.id;
  const s = obj.session as { userId?: unknown } | undefined;
  if (s && typeof s === 'object' && s !== null && typeof s.userId === 'string') return s.userId;
  return undefined;
}
// PDF export libs can be re-imported when the feature/button is enabled

interface Row { ticketId: string; title: string; status: string; priority: string; project?: string; assignedToGroup?: string; assignedToUser?: string; createdAt: number; updatedAt: number; turnaroundMs?: number; }
interface WorkDuration { userId: string; name?: string; ms: number }
interface RowExtended extends Row {
  assignedToUserName?: string;
  completedByUserId?: string; completedByUserName?: string;
  createdByUserId?: string; createdByUserName?: string;
  lastAssignedByUserId?: string; lastAssignedByUserName?: string;
  workDurations?: WorkDuration[]; // detailed breakdown
  workSummary?: string; // short human summary (top contributors)
}

export default function ReportsPage() {
  const { data: sessionData } = authClient.useSession();
  const currentUserId: string | undefined = extractUserId(sessionData);
  // Global filters
  const [team, setTeam] = useState<string | undefined>(undefined);
  const [project, setProject] = useState<string | undefined>(undefined);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [range, setRange] = useState<DateRangeValue>(() => {
    const end = new Date(); end.setHours(23,59,59,999);
    const start = new Date(); start.setDate(end.getDate() - 29); start.setHours(0,0,0,0);
    return { start, end };
  });
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>([]); // empty = all
  const [priorityFilters, setPriorityFilters] = useState<string[]>([]);
  const [shareState, setShareState] = useState<{ url?: string; expiresAt?: number; loading: boolean; error?: string }>({ loading: false });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const days = Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / 86400000));
  const startParam = range.start.getTime();
  const endParam = range.end.getTime();

  const report = useQuery(api.stats.ticketReport, { project, team, days, start: startParam, end: endParam }) as | { isAdmin: boolean; count: number; rows: Row[] } | undefined;
  const teams = useQuery(api.stats.listTeams, {}) as string[] | undefined;
  const projects = useQuery(api.stats.listProjects, {}) as Array<{ slug: string; name: string }> | undefined;
  const createShared = useMutation(api.stats.createSharedReport);

  const rows: Row[] = useMemo(() => {
    let base = report?.rows ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      base = base.filter(r => r.ticketId.toLowerCase().includes(q) || r.title.toLowerCase().includes(q));
    }
    if (statusFilters.length) base = base.filter(r => statusFilters.includes(r.status));
    if (priorityFilters.length) base = base.filter(r => priorityFilters.includes(r.priority));

    // Role-based filtering: if not admin, restrict to tickets the user created or worked on
    if (report && !report.isAdmin) {
      if (!currentUserId) return [];
      base = base.filter(r => {
        const re = r as RowExtended;
        const createdBy = re.createdByUserId === currentUserId;
        const completedBy = re.completedByUserId === currentUserId;
        const assignedTo = r.assignedToUser === currentUserId; // raw id if present
        const workedOn = Array.isArray(re.workDurations) && re.workDurations.some(w => w.userId === currentUserId);
        return createdBy || completedBy || assignedTo || workedOn;
      });
    }
    return base;
  }, [report, search, statusFilters, priorityFilters, currentUserId]);

  const grouped = useMemo(() => {
    const byStatus: Record<string, number> = {}; rows.forEach(r => { byStatus[r.status] = (byStatus[r.status]||0)+1; }); return byStatus;
  }, [rows]);

  const priorityMap: Record<string, { label: string; cls: string }> = { P0:{label:'Critical',cls:'bg-red-400/20 text-red-700 border border-red-300'}, P1:{label:'High',cls:'bg-orange-400/20 text-orange-700 border border-orange-300'}, P2:{label:'Medium',cls:'bg-amber-400/20 text-amber-700 border border-amber-300'}, P3:{label:'Low',cls:'bg-emerald-500/15 text-emerald-700 border border-emerald-300'} };
  const statusMap: Record<string, { label: string; cls: string }> = { open:{label:'Open',cls:'bg-red-500/15 text-red-700 border border-red-300'}, in_progress:{label:'In progress',cls:'bg-blue-500/15 text-blue-700 border border-blue-300'}, in_development:{label:'In development',cls:'bg-indigo-500/15 text-indigo-700 border border-indigo-300'}, missing_information:{label:'Missing information',cls:'bg-orange-500/15 text-orange-700 border border-orange-300'}, escalated:{label:'Escalated',cls:'bg-fuchsia-600/80 text-white'}, resolved:{label:'Resolved',cls:'bg-green-500/15 text-green-700 border border-green-300'}, closed:{label:'Closed',cls:'bg-gray-500/20 text-gray-700 border border-gray-300'} };
  const allStatuses = Object.keys(statusMap);
  const allPriorities = Object.keys(priorityMap);

  function formatDuration(ms: number) { if (ms < 1000) return ms + 'ms'; const sec = Math.floor(ms/1000); if (sec<60) return sec+'s'; const min=Math.floor(sec/60); if (min<60) return min+'m'; const hr=Math.floor(min/60); const remMin=min%60; if (hr<24) return remMin?`${hr}h ${remMin}m`:`${hr}h`; const days=Math.floor(hr/24); const remHr=hr%24; return remHr?`${days}d ${remHr}h`:`${days}d`; }
  function formatDate(ts: number) { return new Date(ts).toLocaleString(); }
  function rangeLabel() { return `${range.start.toLocaleDateString()} - ${range.end.toLocaleDateString()}`; }

  // Simple SLA targets per priority (assumption; adjust if your backend provides exact values)
  const SLA_TARGETS_MS: Record<string, number> = useMemo(() => ({
    P0: 4 * 60 * 60 * 1000,   // 4h
    P1: 8 * 60 * 60 * 1000,   // 8h
    P2: 24 * 60 * 60 * 1000,  // 24h
    P3: 72 * 60 * 60 * 1000,  // 72h
  }), []);

  function computeSlaForRow(r: Row) {
    const target = SLA_TARGETS_MS[r.priority];
    if (!target) return null;
    const isDone = r.status === 'resolved' || r.status === 'closed';
    const elapsed = isDone
      ? (typeof r.turnaroundMs === 'number' ? r.turnaroundMs : Math.max(0, r.updatedAt - r.createdAt))
      : Math.max(0, Date.now() - r.createdAt);
    const percentRaw = (elapsed / target) * 100;
    const percent = Math.max(0, Math.min(100, Math.round(percentRaw)));
    const over = elapsed > target;
    return {
      target,
      elapsed,
      percent,
      over,
      label: `${formatDuration(elapsed)} / ${formatDuration(target)}`,
    };
  }

  async function handleShare(ttlMinutes: number) {
    try {
      setShareState({ loading: true });
      const { token, expiresAt } = await createShared({ project, team, days, ttlMinutes, start: startParam, end: endParam, statuses: statusFilters.length ? statusFilters : undefined, priorities: priorityFilters.length ? priorityFilters : undefined });
      const url = `${window.location.origin}/reports/${token}`;
      setShareState({ loading: false, url, expiresAt });
    } catch(e) { setShareState({ loading:false, error: e instanceof Error ? e.message : 'Failed to share' }); }
  }

  async function exportExcel() {
    if (!rows.length) return;
    const dataset = rows.map(r => {
      const re = r as RowExtended;
      return {
        ticket: r.ticketId,
        title: r.title,
        status: r.status,
        priority: r.priority,
        project: r.project || '',
        team: r.assignedToGroup || '',
        assignedTo: re.assignedToUserName || r.assignedToUser || '',
        createdBy: re.createdByUserName || '',
        assignedBy: re.lastAssignedByUserName || '',
        completedBy: re.completedByUserName || '',
        effort: re.workSummary || '',
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
        turnaroundHours: typeof r.turnaroundMs === 'number' ? (r.turnaroundMs / 3600000) : undefined,
        turnaroundHuman: typeof r.turnaroundMs === 'number' ? formatDuration(r.turnaroundMs) : ''
      };
    });

    // Minimal workbook typing to avoid explicit any
    type MinimalWorksheet = {
      columns: Array<{ header: string; key: string; width: number }>;
      addRow: (row: Record<string, unknown>) => void;
      getRow: (idx: number) => { font?: Record<string, unknown>; [k: string]: unknown };
    };
    type MinimalWorkbook = {
      addWorksheet: (name: string) => MinimalWorksheet;
      xlsx: { writeBuffer: () => Promise<ArrayBuffer> };
    };

    let workbook: MinimalWorkbook | null = null;
    try {
      // Dynamic import so app still works if exceljs not present (optional dependency)
      const exceljs = await import('exceljs');
      // Cast to minimal shape we rely on
      workbook = new (exceljs as unknown as { Workbook: new () => MinimalWorkbook }).Workbook();
    } catch {
      // Fallback to CSV below
    }

    if (!workbook) {
      const header = Object.keys(dataset[0]);
      const csv = [
        header.join(','),
        ...dataset.map(row => header.map(h => JSON.stringify((row as Record<string, unknown>)[h] ?? '')).join(','))
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'report.csv'; a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const ws = workbook.addWorksheet('Report');
    ws.columns = Object.keys(dataset[0]).map(k => ({ header: k, key: k, width: 18 }));
  dataset.forEach(d => ws.addRow(d as unknown as Record<string, unknown>));
  interface RowWithFont { font?: Record<string, unknown> }
  const headerRow = ws.getRow(1) as unknown as RowWithFont;
  headerRow.font = { bold: true };
    try {
      const buf: ArrayBuffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'report.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore workbook write errors
    }
  }

  // exportPdf removed due to being unused; can be re-enabled with a button when needed.

  const reportRef = useRef<HTMLDivElement | null>(null);

  function toggleStatus(s: string) {
    setStatusFilters(curr => curr.includes(s) ? curr.filter(x=>x!==s) : [...curr, s]);
  }
  function togglePriority(p: string) {
    setPriorityFilters(curr => curr.includes(p) ? curr.filter(x=>x!==p) : [...curr, p]);
  }
  function clearFilters() {
    setStatusFilters([]); setPriorityFilters([]); setTeam(undefined); setProject(undefined); setSearch("");
  }

  return (
    <div className="flex flex-col gap-4 py-6 px-4 lg:px-8" ref={reportRef}>
      {/* Filters & Actions */}
      <Card>
        <CardHeader className="gap-2">
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <CardTitle>Global Report</CardTitle>
          </div>
          <CardDescription className="text-xs">Search, filter, export and share your ticket data.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-center text-xs">
          <Select value={team ?? 'all'} onValueChange={(v)=>setTeam(v==='all'?undefined:v)}>
            <SelectTrigger size='sm' className="h-7 w-[140px] text-xs"><SelectValue placeholder="Team" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Teams</SelectItem>{(teams||[]).map(t=> <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={project ?? 'all'} onValueChange={(v)=>setProject(v==='all'?undefined:v)}>
            <SelectTrigger size='sm' className="h-7 w-[140px] text-xs"><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Projects</SelectItem>{(projects||[]).map(p=> <SelectItem key={p.slug} value={p.slug}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 " aria-label="Date range">{rangeLabel()}</Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <DateRangePicker value={range} onChange={(r)=>setRange(r)} />
            </PopoverContent>
          </Popover>
          <input
            value={search}
            onChange={(e)=>setSearch(e.target.value)}
            placeholder="Search ticket/title"
            className="h-8 w-[180px] rounded-md border px-2 text-xs focus-visible:outline-none focus-visible:ring-1"
          />
          {(!!team || !!project || !!search.trim() || statusFilters.length > 0 || priorityFilters.length > 0) && (
            <Button variant="ghost" size="sm" className="h-8" onClick={clearFilters}>Reset</Button>
          )}
          <div className="flex flex-wrap gap-2 ml-auto">
          <Button size="sm" variant="outline" className="gap-1" onClick={exportExcel}><FileSpreadsheet className="size-3" />Excel</Button>
          {/* Optional: Add PDF export button when needed */}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="secondary" className="gap-1"><Share2 className="size-3" />Share</Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="end">
              <div className="flex flex-col gap-2">
                <Button disabled={shareState.loading} size="sm" variant="outline" onClick={()=>handleShare(30)}>Link 30m</Button>
                <Button disabled={shareState.loading} size="sm" variant="outline" onClick={()=>handleShare(60)}>Link 1h</Button>
                <Button disabled={shareState.loading} size="sm" variant="outline" onClick={()=>handleShare(5*60)}>Link 5h</Button>
                <Button disabled={shareState.loading} size="sm" variant="outline" onClick={()=>handleShare(10*60)}>Link 10h</Button>
                {shareState.loading && <span className="text-[10px] text-muted-foreground">Creating...</span>}
                {shareState.url && (
                  <div className="space-y-1">
                    <input readOnly value={shareState.url} className="w-full rounded border px-1 py-0.5 text-[10px]" />
                    <Button size="sm" variant="outline" className="w-full" onClick={()=>navigator.clipboard.writeText(shareState.url!)}>Copy</Button>
                  </div>
                )}
                {shareState.error && <span className="text-[10px] text-red-600">{shareState.error}</span>}
              </div>
            </PopoverContent>
          </Popover>
          </div>
        </CardContent>
      </Card>

      {/* Summary / KPI cards (project-level; team filter not yet supported inside component) */}
      {/* Quick status & priority filter pills */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-muted-foreground mr-2">Status:</span>
        {allStatuses.map(s => (
          <button key={s} onClick={()=>toggleStatus(s)} className={`px-2 py-1 rounded border transition text-xs ${statusFilters.includes(s) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}>{statusMap[s]?.label || s}</button>
        ))}
        <span className="ml-4 text-muted-foreground mr-2">Priority:</span>
        {allPriorities.map(p => (
          <button key={p} onClick={()=>togglePriority(p)} className={`px-2 py-1 rounded border transition text-xs ${priorityFilters.includes(p) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}>{priorityMap[p]?.label || p}</button>
        ))}
        <div className="ml-auto flex gap-2 items-center">
          <span className="inline-flex items-center gap-1 rounded border px-2 py-1">Open <span className="font-medium">{rows.filter(r=>r.status==='open').length}</span></span>
          <span className="inline-flex items-center gap-1 rounded border px-2 py-1">In Progress <span className="font-medium">{rows.filter(r=>r.status==='in_progress').length}</span></span>
          <span className="inline-flex items-center gap-1 rounded border px-2 py-1">Escalated <span className="font-medium">{rows.filter(r=>r.status==='escalated').length}</span></span>
          <span className="inline-flex items-center gap-1 rounded border px-2 py-1">Resolved <span className="font-medium">{rows.filter(r=>r.status==='resolved').length}</span></span>
          <span className="inline-flex items-center gap-1 rounded border px-2 py-1">Closed <span className="font-medium">{rows.filter(r=>r.status==='closed').length}</span></span>
        </div>
      </div>
      <SectionCardsNew project={project} hideControls paddings='px-4 lg:px-2' />

      {/* Charts section (uses global filters) */}
      <Card>
        <CardHeader>
          <CardTitle>Insights</CardTitle>
          <CardDescription className="text-xs">Trends and distributions for the selected range and filters.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 items-stretch">
            <ChartAreaInteractive team={team} project={project} days={days} start={startParam} end={endParam} hideControls />
            <ChartLineInteractive team={team} project={project} days={days} start={startParam} end={endParam} hideControls />
            <div className="flex flex-col gap-4">
              <ChartPieDonutText team={team} project={project} />
              <TopPerformers team={team} project={project} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary badges */}
      {report && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary" className="gap-1">Rows <span className="font-semibold">{rows.length}</span></Badge>
          {Object.entries(grouped).map(([s,c])=> <span key={s} className="inline-flex items-center gap-1 rounded border px-2 py-1">{s}<span className="font-medium">{c}</span></span>)}
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="gap-2">
          <CardTitle>Tickets</CardTitle>
          {report && (
            <CardDescription className="text-xs">Rows: {rows.length}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
        <table className="w-full text-xs table-fixed border-collapse [&_th]:text-[10px] [&_th]:uppercase [&_th]:tracking-wide" aria-label="Global ticket report table">
          <thead className="text-muted-foreground select-none">
            <tr className="bg-muted/30">
              <th className="sticky top-0 z-10 text-left px-2 py-2 font-medium w-8" aria-hidden></th>
              <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Project</th>
              <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Ticket ID & Subject</th>
              <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Priority</th>
              <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Created By</th>
              <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Assigned Agent / Team</th>
              <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Status</th>
              <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Resolved By</th>
              <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Created Date & Time</th>
              {/* <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Last Updated</th> */}
              <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Turnaround Time</th>
            </tr>
          </thead>
          <tbody className="[&_tr]:transition-colors">
            {rows.map(r => {
              const priorityMeta = priorityMap[r.priority] || { label: r.priority, cls: 'bg-gray-200 text-gray-700 border border-gray-300' };
              const statusMeta = statusMap[r.status] || { label: r.status, cls: 'bg-gray-200 text-gray-700 border border-gray-300' };
              const createdStr = new Date(r.createdAt).toLocaleDateString(undefined, { month:'short', day:'numeric' });
              // const updatedStr = new Date(r.updatedAt).toLocaleDateString(undefined, { month:'short', day:'numeric' });
              const turnaroundDisplay = typeof r.turnaroundMs==='number'? formatDuration(r.turnaroundMs) : '—';
              const turnaroundTooltip = typeof r.turnaroundMs==='number'? (r.turnaroundMs/3600000).toFixed(2)+' hours' : '';
              const priorityDotMap: Record<string,string> = { P0:'bg-red-500', P1:'bg-orange-500', P2:'bg-amber-400', P3:'bg-emerald-500' };
              const statusDotMap: Record<string,string> = { open:'bg-red-500', in_progress:'bg-blue-500', escalated:'bg-fuchsia-600', resolved:'bg-green-500', closed:'bg-gray-500' };
              const re = r as RowExtended;
              // const effortTooltip = re.workDurations && re.workDurations.length
              //   ? re.workDurations
              //       .sort((a,b)=>b.ms-a.ms)
              //       .map(w=>`${w.name || w.userId}: ${(w.ms/3600000).toFixed(2)}h`)
              //       .join('\n')
              //   : '';
              const isOpen = !!expanded[r.ticketId];
              return (
                <React.Fragment key={r.ticketId}>
                  <tr className="hover:bg-muted/40">
                    <td className="px-2 py-2 border border-gray-100">
                      <button
                        aria-label={isOpen ? 'Collapse row' : 'Expand row'}
                        aria-expanded={isOpen}
                        className="inline-flex items-center justify-center size-6 rounded hover:bg-muted"
                        onClick={() => setExpanded(prev => ({ ...prev, [r.ticketId]: !prev[r.ticketId] }))}
                      >
                        {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-xs border border-gray-100" title={r.project || ''}>{r.project ?? '—'}</td>
                    <td className="px-3 py-2 border border-gray-100" title={`${r.ticketId} — ${r.title}`}>
                      <div className="min-w-0">
                        <div className="font-mono text-[11px] leading-tight truncate" aria-label="Ticket ID">{r.ticketId}</div>
                        <div className="text-xs truncate text-foreground/90" aria-label="Subject">{r.title}</div>
                      </div>
                    </td>
                    <td className="px-3 py-2 border border-gray-100">
                      <span className={`inline-flex items-center gap-1.5 h-5 text-[10px] font-medium leading-none px-2 py-0.5 rounded border ${priorityMeta.cls}`} title={r.priority}>
                        <span className={`size-1.5 rounded-full ${priorityDotMap[r.priority] || 'bg-gray-500'}`}></span>
                        {priorityMeta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs border border-gray-100" title={re.createdByUserName || ''}>{re.createdByUserName || '—'}</td>
                    <td className="px-3 py-2 text-xs border border-gray-100" title={`${re.assignedToUserName || r.assignedToUser || '—'} / ${r.assignedToGroup || '—'}`}>{(re.assignedToUserName || r.assignedToUser || '—')}{' '}/{' '}{r.assignedToGroup ?? '—'}</td>
                    <td className="px-3 py-2 border border-gray-100">
                      <span className={`inline-flex items-center gap-1.5 h-5 text-[10px] font-medium leading-none px-2 py-0.5 rounded border ${statusMeta.cls}`} title={r.status}>
                        <span className={`size-1.5 rounded-full ${statusDotMap[r.status] || 'bg-gray-500'}`}></span>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs border border-gray-100" title={re.completedByUserName || ''}>{re.completedByUserName || '—'}</td>
                    <td className="px-3 py-2 text-xs border border-gray-100" title={formatDate(r.createdAt)}>{createdStr}</td>
                    {/* <td className="px-3 py-2 text-xs border border-gray-100" title={formatDate(r.updatedAt)}>{updatedStr}</td> */}
                    <td className="px-3 py-2 text-xs border border-gray-100" title={turnaroundTooltip}>{turnaroundDisplay}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={10} className="bg-muted/20 border border-gray-100 p-3 overflow-hidden">
                        <div className="grid gap-3 md:grid-cols-4 text-xs min-w-0">
                          <div>
                            <div className="text-muted-foreground">Assigned By</div>
                            <div className="font-medium">{re.lastAssignedByUserName || '—'}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Last Updated</div>
                            <div className="font-medium">{formatDate(r.updatedAt)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Effort</div>
                            <div className="font-medium">{re.workSummary || (re.workDurations && re.workDurations.length ? 'View' : '—')}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Resolution / Closure Time</div>
                            <div className="font-medium">{(r.status === 'resolved' || r.status === 'closed') ? formatDate(r.updatedAt) : '—'}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Resolved By (Agent)</div>
                            <div className="font-medium">{re.completedByUserName || '—'}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Turnaround Time (TAT)</div>
                            <div className="font-medium">{turnaroundDisplay}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Total Time to Resolve (TTR)</div>
                            <div className="font-medium">{turnaroundDisplay}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-muted-foreground">SLA</div>
                            {(() => {
                              const sla = computeSlaForRow(r);
                              if (!sla) return <div className="font-medium">—</div>;
                              return (
                                <div className="space-y-1 min-w-0" title={sla.label} aria-label={`SLA consumption ${sla.label}`}>
                                  <div className="h-2 w-full rounded bg-muted overflow-hidden">
                                    <div
                                      className={`h-full transition-all ${sla.over ? 'bg-red-500' : 'bg-green-500'}`}
                                      style={{ width: `${sla.percent}%` }}
                                    />
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    {sla.label} {sla.over && <span className="ml-1 text-red-600 font-medium">(Breached)</span>}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                          <div>
                            <div className="text-muted-foreground">Reopened Count / Time</div>
                            <div className="font-medium">—</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Escalation Status / Level</div>
                            <div className="font-medium">{r.status === 'escalated' ? 'Escalated' : '—'}</div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-8 text-xs text-muted-foreground border border-gray-100">No tickets in range.</td>
              </tr>
            )}
          </tbody>
        </table>
        </CardContent>
      </Card>
    </div>
  );
}
