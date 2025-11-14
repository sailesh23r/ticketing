"use client";

import React, { useEffect, useState, useRef } from 'react';
import { api } from '@/convex/_generated/api';
import { useQuery } from 'convex/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface SharedReportRow { ticketId: string; title: string; status: string; priority: string; project?: string; assignedToGroup?: string; assignedToUser?: string; assignedToUserName?: string; completedByUserId?: string; completedByUserName?: string; createdAt?: number; updatedAt?: number; turnaroundMs?: number }
interface SharedReportParams { project?: string; team?: string; days?: number; start?: number; end?: number }
interface SharedReportData { expired: boolean; report?: { count: number; rows: SharedReportRow[]; start?: number; end?: number }; params?: SharedReportParams; expiresAt?: number }

export default function SharedReportClient({ token }: { token: string }) {
  const data = useQuery(api.stats.getSharedReport, { token }) as SharedReportData | undefined;
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(()=>{ setMounted(true); },[]);
  const report = data?.report;
  const expired = data?.expired;
  const expiresAt = data?.expiresAt;
  const params = data?.params;
  function formatDate(ts: number) { return new Date(ts).toLocaleString(); }

  function formatDateRange(p?: SharedReportParams) {
    if (!p) return '';
    if (p.start && p.end) {
      const start = new Date(p.start);
      const end = new Date(p.end);
      const sameDay = start.toDateString() === end.toDateString();
      const f = (d: Date) => d.toLocaleDateString();
      return sameDay ? f(start) : `${f(start)} - ${f(end)}`;
    }
    if (p.days) return `Last ${p.days} day${p.days === 1 ? '' : 's'}`;
    return '';
  }

  const filterSummary = (() => {
    if (!params) return '';
    const parts: string[] = [];
    if (params.project) parts.push(`Project: ${params.project}`);
    if (params.team && params.team !== 'all') parts.push(`Team: ${params.team}`);
    const dr = formatDateRange(params);
    if (dr) parts.push(dr);
    if (!parts.length) return 'All projects · All teams';
    return parts.join(' · ');
  })();

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
  // Align styling with main reports page
  const priorityMap: Record<string, { label: string; cls: string }> = {
    P0: { label: 'Critical', cls: 'bg-red-400/20 text-red-700 border border-red-300' },
    P1: { label: 'High', cls: 'bg-orange-400/20 text-orange-700 border border-orange-300' },
    P2: { label: 'Medium', cls: 'bg-amber-400/20 text-amber-700 border border-amber-300' },
    P3: { label: 'Low', cls: 'bg-emerald-500/15 text-emerald-700 border border-emerald-300' },
  };
  const statusMap: Record<string, { label: string; cls: string }> = {
    open: { label: 'Open', cls: 'bg-red-500/15 text-red-700 border border-red-300' },
    in_progress: { label: 'In progress', cls: 'bg-blue-500/15 text-blue-700 border border-blue-300' },
    escalated: { label: 'Escalated', cls: 'bg-fuchsia-600/80 text-white' },
  in_development: { label: 'In development', cls: 'bg-indigo-500/15 text-indigo-700 border border-indigo-300' },
  missing_information: { label: 'Missing information', cls: 'bg-orange-500/15 text-orange-700 border border-orange-300' },
  resolved: { label: 'Resolved', cls: 'bg-green-500/15 text-green-700 border border-green-300' },
  closed: { label: 'Closed', cls: 'bg-gray-500/20 text-gray-700 border border-gray-300' },
  };
  const priorityDotMap: Record<string,string> = { P0:'bg-red-500', P1:'bg-orange-500', P2:'bg-amber-400', P3:'bg-emerald-500' };
  const statusDotMap: Record<string,string> = { open:'bg-red-500', in_progress:'bg-blue-500', escalated:'bg-fuchsia-600', resolved:'bg-green-500', closed:'bg-gray-500' };
  async function exportReport() {
    if (!report || !report.rows.length) return;
    const rows = report.rows;
    const dataset = rows.map(r => {
      const createdDate = r.createdAt ? new Date(r.createdAt) : undefined;
      const updatedDate = r.updatedAt ? new Date(r.updatedAt) : undefined;
      const turnaroundHoursNum = typeof r.turnaroundMs === 'number' ? (r.turnaroundMs / 3600000) : undefined;
      const humanTurnaround = typeof r.turnaroundMs === 'number' ? formatDuration(r.turnaroundMs) : '';
      return {
        ticket: r.ticketId,
        title: r.title,
        status: r.status,
        statusLabel: statusMap[r.status]?.label || r.status,
        priority: r.priority,
        priorityLabel: priorityMap[r.priority]?.label || r.priority,
        project: r.project || '',
        team: r.assignedToGroup || '',
        assignedTo: r.assignedToUserName || r.assignedToUser || '',
        completedBy: r.completedByUserName || r.completedByUserId || '',
        created: createdDate,
        updated: updatedDate,
        turnaroundHours: turnaroundHoursNum,
        turnaroundHuman: humanTurnaround,
      };
    });
    // Attempt exceljs styled export
  let workbook: unknown = null;
    try {
      const exceljs: unknown = await import('exceljs');
      if (exceljs && typeof (exceljs as any).Workbook === 'function') { // eslint-disable-line @typescript-eslint/no-explicit-any
        workbook = new (exceljs as any).Workbook(); // eslint-disable-line @typescript-eslint/no-explicit-any
      }
    } catch { /* ignore */ }
  if (!workbook || typeof (workbook as any).addWorksheet !== 'function') { // eslint-disable-line @typescript-eslint/no-explicit-any
      // CSV fallback (human labels only)
  const header = [ 'Ticket','Title','Status','Priority','Project','Team','Assigned To','Completed By','Created','Updated','Turnaround Hours','Turnaround (Human)' ];
      const csv = [
        header.join(','),
        ...dataset.map(d => header.map(h => {
          switch (h) {
            case 'Ticket': return JSON.stringify(d.ticket);
            case 'Title': return JSON.stringify(d.title);
            case 'Status': return JSON.stringify(d.statusLabel);
            case 'Priority': return JSON.stringify(d.priorityLabel);
            case 'Project': return JSON.stringify(d.project);
            case 'Team': return JSON.stringify(d.team);
            case 'Assigned To': return JSON.stringify(d.assignedTo);
            case 'Completed By': return JSON.stringify(d.completedBy);
            case 'Created': return JSON.stringify(d.created);
            case 'Updated': return JSON.stringify(d.updated);
            case 'Turnaround Hours': return JSON.stringify(d.turnaroundHours);
            default: return '""';
          }
        }).join(',')),
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'shared-ticket-report.csv';
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
  const ws = (workbook as any).addWorksheet('Shared Report'); // eslint-disable-line @typescript-eslint/no-explicit-any
    ws.columns = [
      { header: 'Ticket', key: 'ticket', width: 16 },
      { header: 'Title', key: 'title', width: 42 },
      { header: 'Status', key: 'statusLabel', width: 14 },
      { header: 'Priority', key: 'priorityLabel', width: 14 },
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
    const priorityColor: Record<string, { fg?: string; bg?: string }> = {
      P0: { bg: 'FFFEE2E2', fg: 'FF991B1B' },
      P1: { bg: 'FFFFEDD5', fg: 'FF9A3412' },
      P2: { bg: 'FFFEF9C3', fg: 'FF854D0E' },
      P3: { bg: 'FFD1FAE5', fg: 'FF065F46' },
    };
    dataset.forEach(d => {
      const row = ws.addRow(d);
      const sMeta = statusColor[d.status];
      if (sMeta) {
        const cell = row.getCell('statusLabel');
        cell.fill = sMeta.bg ? { type: 'pattern', pattern: 'solid', fgColor: { argb: sMeta.bg } } : undefined;
        cell.font = sMeta.fg ? { color: { argb: sMeta.fg }, bold: true } : { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      }
      const pMeta = priorityColor[d.priority];
      if (pMeta) {
        const cell = row.getCell('priorityLabel');
        cell.fill = pMeta.bg ? { type: 'pattern', pattern: 'solid', fgColor: { argb: pMeta.bg } } : undefined;
        cell.font = pMeta.fg ? { color: { argb: pMeta.fg }, bold: true } : { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      }
      const cCell = row.getCell('created');
      if (cCell.value instanceof Date) cCell.numFmt = 'yyyy-mm-dd hh:mm:ss';
      const uCell = row.getCell('updated');
      if (uCell.value instanceof Date) uCell.numFmt = 'yyyy-mm-dd hh:mm:ss';
      const taCell = row.getCell('turnaroundHours');
      if (typeof taCell.value === 'number') taCell.numFmt = '0.00';
    });
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { horizontal: 'center' };
    const wbAny = workbook as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (wbAny && wbAny.xlsx && typeof wbAny.xlsx.writeBuffer === 'function') {
      try {
        const buf: ArrayBuffer = await wbAny.xlsx.writeBuffer();
        const blobX = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const urlX = URL.createObjectURL(blobX);
        const aX = document.createElement('a');
        aX.href = urlX;
        aX.download = 'shared-ticket-report.xlsx';
        aX.click();
        URL.revokeObjectURL(urlX);
        return;
      } catch { /* ignore, fallback */ }
    }
    // fallback CSV if writeBuffer missing
  const header = [ 'Ticket','Title','Status','Priority','Project','Team','Assigned To','Completed By','Created','Updated','Turnaround Hours','Turnaround (Human)' ];
    const csv = [
      header.join(','),
      ...dataset.map(d => header.map(h => {
        switch (h) {
          case 'Ticket': return JSON.stringify(d.ticket);
          case 'Title': return JSON.stringify(d.title);
          case 'Status': return JSON.stringify(d.statusLabel);
          case 'Priority': return JSON.stringify(d.priorityLabel);
          case 'Project': return JSON.stringify(d.project);
          case 'Team': return JSON.stringify(d.team);
          case 'Assigned To': return JSON.stringify(d.assignedTo);
          case 'Completed By': return JSON.stringify(d.completedBy);
          case 'Created': return JSON.stringify(d.created);
          case 'Updated': return JSON.stringify(d.updated);
          case 'Turnaround Hours': return JSON.stringify(d.turnaroundHours);
          case 'Turnaround (Human)': return JSON.stringify(d.turnaroundHuman);
          default: return '""';
        }
      }).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shared-ticket-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    const el = rootRef.current; if (!el) return;
    el.classList.add('pdf-safe');
    const canvas = await html2canvas(el, { scale: 2, windowWidth: el.scrollWidth, windowHeight: el.scrollHeight });
    el.classList.remove('pdf-safe');
    const pdf = new jsPDF('p','pt','a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 40; const ratio = imgWidth / canvas.width; const imgHeight = canvas.height * ratio;
    if (imgHeight <= pageHeight - 40) {
      pdf.addImage(canvas.toDataURL('image/png'),'PNG',20,20,imgWidth,imgHeight);
    } else {
      let remaining = imgHeight; let srcY = 0; const sliceHeight = (pageHeight - 60) / ratio;
      while (remaining > 0) {
        const c = document.createElement('canvas'); c.width = canvas.width; c.height = Math.min(sliceHeight, canvas.height - srcY);
        const ctx = c.getContext('2d'); if (!ctx) break;
        ctx.drawImage(canvas,0,srcY,canvas.width,c.height,0,0,canvas.width,c.height);
        pdf.addImage(c.toDataURL('image/png'),'PNG',20,20,imgWidth,c.height*ratio);
        srcY += c.height; remaining -= c.height*ratio; if (srcY < canvas.height) pdf.addPage();
      }
    }
    pdf.save('shared-report.pdf');
  }

  if (!mounted) return null;

  return (
    <div ref={rootRef} className="mx-auto max-w-[1600px] p-6 flex flex-col gap-6">
      <Card className="order-1">
        <CardHeader className="flex flex-col gap-2 space-y-0 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Shared Ticket Report</CardTitle>
            <CardDescription>
              {expired ? 'This link has expired.' : expiresAt ? `Link expires: ${formatDate(expiresAt)}` : 'Loading...'}
            </CardDescription>
            {!expired && filterSummary && (
              <p className="text-[11px] text-muted-foreground leading-tight">{filterSummary}</p>
            )}
          </div>
          {!expired && report && (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="icon" variant="outline" aria-label="Export report" className="size-8">
                  <FileSpreadsheet className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-2" align="end">
                <div className="flex flex-col gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!report.rows.length}
                    onClick={exportReport}
                    className="flex items-center gap-1"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" /> Export
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!report.rows.length}
                    onClick={exportPdf}
                    className="flex items-center gap-1"
                  >
                    <FileText className="h-3.5 w-3.5" /> PDF
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </CardHeader>
        <CardContent>
          {expired && <p className="text-sm text-red-600">The report is no longer available.</p>}
          {!expired && !report && <p className="text-sm text-muted-foreground">Loading...</p>}
          {!expired && report && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Rows: {report.count}</p>
              <div className="overflow-auto rounded border">
                <table className="w-full text-xs table-fixed border-collapse [&_th]:text-[10px] [&_th]:uppercase [&_th]:tracking-wide" aria-label="Shared ticket report table">
                  <thead className="text-muted-foreground select-none">
                    <tr className="bg-muted/30">
                      <th className="sticky top-0 z-10 text-left px-2 py-2 font-medium w-8" aria-hidden></th>
                      <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Project</th>
                      <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Ticket ID & Subject</th>
                      <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Priority (High / Medium / Low)</th>
                      <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Assigned Agent / Team</th>
                      <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Status (Open, In Progress, Resolved, Closed)</th>
                      <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Resolved By (Agent)</th>
                      <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Created Date & Time</th>
                      <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Last Updated</th>
                      <th className="sticky top-0 z-10 text-left px-3 py-2 font-medium">Turnaround Time (TAT)</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr]:transition-colors">
                    {report.rows.map(r => {
                      const priorityMeta = priorityMap[r.priority] || { label: r.priority, cls: 'bg-muted text-foreground border border-border' };
                      const statusMeta = statusMap[r.status] || { label: r.status, cls: 'bg-muted text-foreground border border-border' };
                      const createdStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString(undefined, { month:'short', day:'numeric' }) : '—';
                      const updatedStr = r.updatedAt ? new Date(r.updatedAt).toLocaleDateString(undefined, { month:'short', day:'numeric' }) : '—';
                      const turnaroundDisplay = typeof r.turnaroundMs==='number'? formatDuration(r.turnaroundMs) : '—';
                      const turnaroundTooltip = typeof r.turnaroundMs==='number'? (r.turnaroundMs/3600000).toFixed(2)+' hours' : '';
                      const isOpen = !!expanded[r.ticketId];
                      return (
                        <React.Fragment key={r.ticketId}>
                          <tr className="hover:bg-muted/40">
                            <td className="px-2 py-2 border border-border/50">
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
                            <td className="px-3 py-2 text-xs border border-gray-100" title={`${r.assignedToUserName || r.assignedToUser || '—'} / ${r.assignedToGroup || '—'}`}>{(r.assignedToUserName || r.assignedToUser || '—')}{' '}/{' '}{r.assignedToGroup ?? '—'}</td>
                            <td className="px-3 py-2 border border-gray-100">
                              <span className={`inline-flex items-center gap-1.5 h-5 text-[10px] font-medium leading-none px-2 py-0.5 rounded border ${statusMeta.cls}`} title={r.status}>
                                <span className={`size-1.5 rounded-full ${statusDotMap[r.status] || 'bg-gray-500'}`}></span>
                                {statusMeta.label}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs border border-gray-100" title={r.completedByUserName || r.completedByUserId || ''}>{r.completedByUserName || r.completedByUserId || ((r.status === 'resolved' || r.status === 'closed') ? '—' : '')}</td>
                            <td className="px-3 py-2 text-xs border border-gray-100" title={r.createdAt ? formatDate(r.createdAt) : ''}>{createdStr}</td>
                            <td className="px-3 py-2 text-xs border border-gray-100" title={r.updatedAt ? formatDate(r.updatedAt) : ''}>{updatedStr}</td>
                            <td className="px-3 py-2 text-xs border border-gray-100" title={turnaroundTooltip}>{turnaroundDisplay}</td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td colSpan={10} className="bg-muted/20 border border-gray-100 p-3">
                                <div className="grid gap-3 md:grid-cols-4 text-xs">
                                  <div>
                                    <div className="text-muted-foreground">Assigned By</div>
                                    <div className="font-medium">—</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground">Assigned To</div>
                                    <div className="font-medium">{r.assignedToUserName || r.assignedToUser || '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground">Team</div>
                                    <div className="font-medium">{r.assignedToGroup || '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground">Project</div>
                                    <div className="font-medium">{r.project || '—'}</div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
