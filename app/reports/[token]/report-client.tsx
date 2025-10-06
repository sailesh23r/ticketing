"use client";

import { api } from '@/convex/_generated/api';
import { useQuery } from 'convex/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import React from 'react';

interface SharedReportRow { ticketId: string; title: string; status: string; priority: string; project?: string; assignedToGroup?: string; createdAt?: number; updatedAt?: number }
interface SharedReportData { expired: boolean; report?: { count: number; rows: SharedReportRow[] }; params?: unknown; expiresAt?: number }

export default function SharedReportClient({ token }: { token: string }) {
  const data = useQuery(api.stats.getSharedReport, { token }) as SharedReportData | undefined;
  const report = data?.report;
  const expired = data?.expired;
  const expiresAt = data?.expiresAt;
  function formatDate(ts: number) { return new Date(ts).toLocaleString(); }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Shared Ticket Report</CardTitle>
          <CardDescription>
            {expired ? 'This link has expired.' : expiresAt ? `Link expires: ${formatDate(expiresAt)}` : 'Loading...'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {expired && <p className="text-sm text-red-600">The report is no longer available.</p>}
          {!expired && !report && <p className="text-sm text-muted-foreground">Loading...</p>}
          {!expired && report && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Rows: {report.count}</p>
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-2 py-1 font-medium">Ticket</th>
                      <th className="px-2 py-1 font-medium">Title</th>
                      <th className="px-2 py-1 font-medium">Status</th>
                      <th className="px-2 py-1 font-medium">Priority</th>
                      <th className="px-2 py-1 font-medium">Project</th>
                      <th className="px-2 py-1 font-medium">Team</th>
                      <th className="px-2 py-1 font-medium">Created</th>
                      <th className="px-2 py-1 font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r) => (
                      <tr key={r.ticketId} className="border-t hover:bg-muted/40">
                        <td className="px-2 py-1 font-mono text-[11px]">{r.ticketId}</td>
                        <td className="px-2 py-1 max-w-[220px] truncate" title={r.title}>{r.title}</td>
                        <td className="px-2 py-1">{r.status}</td>
                        <td className="px-2 py-1">{r.priority}</td>
                        <td className="px-2 py-1">{r.project ?? '-'}</td>
                        <td className="px-2 py-1">{r.assignedToGroup ?? '-'}</td>
                        <td className="px-2 py-1">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-'}</td>
                        <td className="px-2 py-1">{r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : '-'}</td>
                      </tr>
                    ))}
                    {report.rows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-2 py-4 text-center text-muted-foreground">No tickets.</td>
                      </tr>
                    )}
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
