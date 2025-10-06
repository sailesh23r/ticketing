"use client";

import * as React from 'react';
import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DateRangePicker, DateRangeValue } from '@/components/date-range-picker';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Share2, FileSpreadsheet } from 'lucide-react';

interface Row {
  ticketId: string;
  title: string;
  status: string;
  priority: string;
  project?: string;
  assignedToGroup?: string;
  assignedToUser?: string;
  createdAt: number;
  updatedAt: number;
  turnaroundMs?: number;
}
interface RowExtended extends Row {
  assignedToUserName?: string;
  completedByUserId?: string;
  completedByUserName?: string;
}
export function TicketReports({ exportOnly = false }: { exportOnly?: boolean }) {
  const [team, setTeam] = useState<string | undefined>(undefined);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [range, setRange] = useState<DateRangeValue>(() => {
    const end = new Date(); end.setHours(23,59,59,999);
    const start = new Date(); start.setDate(end.getDate() - 29); start.setHours(0,0,0,0);
    return { start, end };
  });
  const [project, setProject] = useState<string | undefined>(undefined);
  // Compute inclusive day span (ceil + 1 day if same day)
  const days = Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / 86400000) + 1 - 1);
  const startParam = range.start.getTime();
  const endParam = range.end.getTime();

  function rangeLabel() {
    return `${range.start.toLocaleDateString()} - ${range.end.toLocaleDateString()}`;
  }
  const report = useQuery(api.stats.ticketReport, { project, team, days, start: startParam, end: endParam }) as | { isAdmin: boolean; count: number; rows: Row[] } | undefined;
  const teams = useQuery(api.stats.listTeams, {}) as string[] | undefined;
  const projects = useQuery(api.stats.listProjects, {}) as Array<{ slug: string; name: string }> | undefined;
  const createShared = useMutation(api.stats.createSharedReport);

  const [shareState, setShareState] = useState<{ url?: string; expiresAt?: number; loading: boolean; error?: string }>({ loading: false });

  const rows = useMemo(() => report?.rows ?? [], [report]);

  const grouped = useMemo(() => {
    const byStatus: Record<string, number> = {};
    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    }
    return byStatus;
  }, [rows]);

  const priorityMap: Record<string, { label: string; cls: string }> = {
    P0: { label: 'Critical', cls: 'bg-red-100 text-red-800 border-red-200' },
    P1: { label: 'High', cls: 'bg-orange-100 text-orange-800 border-orange-200' },
    P2: { label: 'Medium', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    P3: { label: 'Low', cls: 'bg-green-100 text-green-800 border-green-200' },
  };

  const statusMap: Record<string, { label: string; cls: string }> = {
    open: { label: 'Open', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
    in_progress: { label: 'In Progress', cls: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    resolved: { label: 'Resolved', cls: 'bg-green-100 text-green-800 border-green-200' },
    closed: { label: 'Closed', cls: 'bg-gray-100 text-gray-800 border-gray-200' },
    escalated: { label: 'Escalated', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
  };

  async function exportToExcel() {
    if (!rows.length) return;
    const dataset = rows.map(r => {
      const er = r as RowExtended;
      const createdDate = new Date(r.createdAt);
      const updatedDate = new Date(r.updatedAt);
      const turnaroundHoursNum = typeof r.turnaroundMs === 'number' ? (r.turnaroundMs / 3600000) : undefined;
      const humanTurnaround = typeof r.turnaroundMs === 'number' ? formatDuration(r.turnaroundMs) : '';
      return {
        ticket: r.ticketId,
        title: r.title,
        status: statusMap[r.status]?.label || r.status,
        rawStatus: r.status,
        priority: priorityMap[r.priority]?.label || r.priority,
        rawPriority: r.priority,
        project: r.project || '',
        team: r.assignedToGroup || '',
        assignedTo: er.assignedToUserName || r.assignedToUser || '',
        completedBy: er.completedByUserName || er.completedByUserId || '',
        created: createdDate,
        updated: updatedDate,
        turnaroundHours: turnaroundHoursNum,
        turnaroundHuman: humanTurnaround,
      };
    });
    // Try exceljs dynamic import for styled export
    // Attempt styled Excel export; silently fallback to CSV if lib absent
    let workbook: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      const exceljs: any = await import('exceljs'); // eslint-disable-line @typescript-eslint/no-explicit-any
      workbook = new exceljs.Workbook();
    } catch {
      workbook = null;
    }
    if (!workbook || typeof workbook.addWorksheet !== 'function') {
      // Fallback CSV
      const header = Object.keys(dataset[0]).filter(k => !k.startsWith('raw'));
      const csv = [
        header.join(','),
        ...dataset.map(row => header.map(h => JSON.stringify((row as Record<string, unknown>)[h] ?? '')).join(',')),
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ticket-report.csv';
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
  const ws = workbook.addWorksheet('Tickets');
    ws.columns = [
      { header: 'Ticket', key: 'ticket', width: 16 },
      { header: 'Title', key: 'title', width: 40 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Priority', key: 'priority', width: 12 },
      { header: 'Project', key: 'project', width: 14 },
      { header: 'Team', key: 'team', width: 16 },
      { header: 'Assigned To', key: 'assignedTo', width: 18 },
      { header: 'Completed By', key: 'completedBy', width: 18 },
      { header: 'Created', key: 'created', width: 22 },
      { header: 'Updated', key: 'updated', width: 22 },
      { header: 'Turnaround Hours', key: 'turnaroundHours', width: 18 },
      { header: 'Turnaround (Human)', key: 'turnaroundHuman', width: 18 },
    ];
    const statusColor: Record<string, { fg?: string; bg?: string }> = {
      open: { bg: 'FFDBEAFE', fg: 'FF1E3A8A' },
      in_progress: { bg: 'FFE0E7FF', fg: 'FF3730A3' },
      resolved: { bg: 'FFD1FAE5', fg: 'FF065F46' },
      closed: { bg: 'FFE5E7EB', fg: 'FF374151' },
      escalated: { bg: 'FFFEE2E2', fg: 'FF991B1B' },
    };
    const priorityColor: Record<string, { bg?: string; fg?: string }> = {
      P0: { bg: 'FFFEE2E2', fg: 'FF991B1B' },
      P1: { bg: 'FFFFEDD5', fg: 'FF9A3412' },
      P2: { bg: 'FFFEF9C3', fg: 'FF854D0E' },
      P3: { bg: 'FFD1FAE5', fg: 'FF065F46' },
    };
    dataset.forEach(d => {
      const row = ws.addRow({ ...d });
      // Status style (column 3)
      const sMeta = statusColor[d.rawStatus];
      if (sMeta) {
        const cell = row.getCell('status');
        cell.fill = sMeta.bg ? { type: 'pattern', pattern: 'solid', fgColor: { argb: sMeta.bg } } : undefined;
        cell.font = sMeta.fg ? { color: { argb: sMeta.fg }, bold: true } : { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      }
      // Priority style (column 4)
      const pMeta = priorityColor[d.rawPriority];
      if (pMeta) {
        const cell = row.getCell('priority');
        cell.fill = pMeta.bg ? { type: 'pattern', pattern: 'solid', fgColor: { argb: pMeta.bg } } : undefined;
        cell.font = pMeta.fg ? { color: { argb: pMeta.fg }, bold: true } : { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      }
      // Date formatting and number formatting
      const createdCell = row.getCell('created');
      if (createdCell.value instanceof Date) createdCell.numFmt = 'yyyy-mm-dd hh:mm:ss';
      const updatedCell = row.getCell('updated');
      if (updatedCell.value instanceof Date) updatedCell.numFmt = 'yyyy-mm-dd hh:mm:ss';
      const taCell = row.getCell('turnaroundHours');
      if (typeof taCell.value === 'number') taCell.numFmt = '0.00';
    });
    // Header styling
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { horizontal: 'center' };
    if (workbook && workbook.xlsx && typeof workbook.xlsx.writeBuffer === 'function') {
      try {
        const buf: ArrayBuffer = await workbook.xlsx.writeBuffer();
        const blobX = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const urlX = URL.createObjectURL(blobX);
        const aX = document.createElement('a');
        aX.href = urlX;
        aX.download = 'ticket-report.xlsx';
        aX.click();
        URL.revokeObjectURL(urlX);
        return;
      } catch { /* fall through to CSV */ }
    }
    // Fallback CSV if workbook writeBuffer unsupported
    const header = Object.keys(dataset[0]).filter(k => !k.startsWith('raw'));
    const csv = [
      header.join(','),
      ...dataset.map(row => header.map(h => JSON.stringify((row as Record<string, unknown>)[h] ?? '')).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ticket-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleShare(ttlMinutes: number) {
    try {
      setShareState({ loading: true });
      const args: { project?: string; team?: string; days: number; ttlMinutes: number; start: number; end: number } = { project, team, days, ttlMinutes, start: range.start.getTime(), end: range.end.getTime() };
      const { token, expiresAt } = await createShared(args);
      const url = `${window.location.origin}/reports/${token}`;
      setShareState({ loading: false, url, expiresAt });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create share link';
      setShareState({ loading: false, error: msg });
    }
  }

  function formatDate(ts: number) {
    return new Date(ts).toLocaleString();
  }

  function formatDuration(ms: number) {
    if (ms < 1000) return ms + 'ms';
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return sec + 's';
    const min = Math.floor(sec / 60);
    if (min < 60) return min + 'm';
    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    if (hr < 24) return remMin ? `${hr}h ${remMin}m` : `${hr}h`;
    const days = Math.floor(hr / 24);
    const remHr = hr % 24;
    return remHr ? `${days}d ${remHr}h` : `${days}d`;
  }

  return (
    <Card className="pt-0">
      <CardHeader className="flex flex-col gap-2 space-y-0 border-b py-5 md:flex-row md:items-center">
        <div className="grid flex-1 gap-1">
          <CardTitle>Ticket report</CardTitle>
          <CardDescription>Filterable ticket data with export link</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={team ?? 'all'} onValueChange={(v) => setTeam(v === 'all' ? undefined : v)}>
            <SelectTrigger className="w-[140px] h-8" aria-label="Team" size='sm'>
              <SelectValue placeholder="Team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All teams</SelectItem>
              {(teams ?? []).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={project ?? 'all'} onValueChange={(v) => setProject(v === 'all' ? undefined : v)}>
            <SelectTrigger className="w-[150px] h-8" aria-label="Project" size='sm'>
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {(projects ?? []).map((p) => <SelectItem key={p.slug} value={p.slug}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
              <PopoverTrigger asChild>
                <Button variant={rangeOpen ? 'secondary' : 'outline'} size="sm" className="max-w-[240px] truncate">{rangeLabel()}</Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <DateRangePicker value={range} onChange={(r) => setRange(r)} />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={exportOnly ? 'Export report' : 'Share or export report'}
                  className='size-8'
                >
                  {exportOnly ? <FileSpreadsheet className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-2" align="end">
                {exportOnly ? (
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!report || !rows.length}
                      onClick={exportToExcel}
                      className="flex items-center gap-1"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" /> Export
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!report || shareState.loading}
                      onClick={() => handleShare(30)}
                    >
                      Share 30m
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!report || shareState.loading}
                      onClick={() => handleShare(60)}
                    >
                      Share 1h
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!report || !rows.length}
                      onClick={exportToExcel}
                      className="flex items-center gap-1"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" /> Export
                    </Button>
                    {shareState.loading && (
                      <span className="text-[11px] text-muted-foreground text-center">Creating link...</span>
                    )}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {report ? (
          <>
            {shareState.url && (
              <div className="mb-5 space-y-1 rounded border p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">Share link:</span>
                  <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(shareState.url!)}>Copy</Button>
                </div>
                <a href={shareState.url} target="_blank" rel="noopener" className="break-all text-blue-600 hover:underline">
                  {shareState.url}
                </a>
                {shareState.expiresAt && (
                  <p className="text-muted-foreground">Expires {formatDate(shareState.expiresAt)}</p>
                )}
              </div>
            )}
            {shareState.error && <p className="mt-3 text-xs text-red-600">{shareState.error}</p>}
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary" className="gap-1">Rows <span className="font-semibold">{report.count}</span></Badge>
              {Object.entries(grouped).map(([s, c]) => (
                <span key={s} className="inline-flex items-center gap-1 rounded border px-2 py-1">{s}<span className="font-medium">{c}</span></span>
              ))}
            </div>
            <div className="overflow-auto mx-0">
              <table
                className="w-full text-xs table-fixed border-collapse [&_th]:text-[10px] [&_th]:uppercase [&_th]:tracking-wide"
                aria-label="Ticket report table"
              >
                <thead className="text-muted-foreground select-none">
                  <tr className="bg-muted/30">
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Ticket</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Title</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Priority</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Status</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Project</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Team</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Assigned</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Completed</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Created</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Updated</th>
                    <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Turnaround</th>
                  </tr>
                </thead>
                <tbody className="[&_tr]:transition-colors">
                  {rows.map(r => {
                    const er = r as RowExtended;
                    const createdDateStr = new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    const updatedDateStr = new Date(r.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    const assignedName = er.assignedToUserName || r.assignedToUser || '—';
                    const completedName = er.completedByUserName || er.completedByUserId || ((r.status === 'resolved' || r.status === 'closed') ? '—' : '');
                    const priorityMeta = priorityMap[r.priority] || { label: r.priority, cls: 'bg-muted text-foreground border-border' };
                    const statusMeta = statusMap[r.status] || { label: r.status, cls: 'bg-muted text-foreground border-border' };
                    const turnaroundDisplay = typeof r.turnaroundMs === 'number' ? formatDuration(r.turnaroundMs) : '—';
                    const turnaroundTooltip = typeof r.turnaroundMs === 'number' ? (r.turnaroundMs/3600000).toFixed(2)+' hours' : '';
                    // Dot color helpers similar to main list (approximation)
                    const priorityDotMap: Record<string,string> = { P0:'bg-red-500', P1:'bg-orange-500', P2:'bg-amber-400', P3:'bg-emerald-500' };
                    const statusDotMap: Record<string,string> = { open:'bg-red-500', in_progress:'bg-blue-500', escalated:'bg-fuchsia-600', resolved:'bg-green-500', closed:'bg-gray-500' };
                    return (
                      <tr key={r.ticketId} className="hover:bg-muted/40">
                        <td className="px-3 py-2 font-mono text-[11px] border border-gray-100 whitespace-nowrap" title={r.ticketId}>{r.ticketId}</td>
                        <td className="px-3 py-2 max-w-[260px] truncate border border-gray-100" title={r.title}>{r.title}</td>
                        <td className="px-3 py-2 border border-gray-100">
                          <span className={`inline-flex items-center gap-1.5 h-5 text-[10px] font-medium leading-none px-2 py-0.5 rounded border ${priorityMeta.cls}`} title={r.priority}>
                            <span className={`size-1.5 rounded-full ${priorityDotMap[r.priority] || 'bg-gray-500'}`}></span>
                            {priorityMeta.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 border border-gray-100">
                          <span className={`inline-flex items-center gap-1.5 h-5 text-[10px] font-medium leading-none px-2 py-0.5 rounded border ${statusMeta.cls}`} title={r.status}>
                            <span className={`size-1.5 rounded-full ${statusDotMap[r.status] || 'bg-gray-500'}`}></span>
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs border border-gray-100" title={r.project || ''}>{r.project ?? '—'}</td>
                        <td className="px-3 py-2 text-xs border border-gray-100" title={r.assignedToGroup || ''}>{r.assignedToGroup ?? '—'}</td>
                        <td className="px-3 py-2 text-xs border border-gray-100" title={assignedName}>{assignedName}</td>
                        <td className="px-3 py-2 text-xs border border-gray-100" title={completedName}>{completedName || '—'}</td>
                        <td className="px-3 py-2 text-xs border border-gray-100" title={formatDate(r.createdAt)}>{createdDateStr}</td>
                        <td className="px-3 py-2 text-xs border border-gray-100" title={formatDate(r.updatedAt)}>{updatedDateStr}</td>
                        <td className="px-3 py-2 text-xs border border-gray-100" title={turnaroundTooltip}>{turnaroundDisplay}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={11} className="text-center py-8 text-xs text-muted-foreground border border-gray-100">No tickets in range.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          
          </>
        ) : (
          <p className="text-center text-xs text-muted-foreground">Loading...</p>
        )}
      </CardContent>
    </Card>
  );
}
