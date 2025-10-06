"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function NotificationsPage() {
  const notifications = useQuery(api.notifications.listMyNotifications, {});
  const markRead = useMutation(api.notifications.markRead);
  return (
    <div className="max-w-3xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {notifications?.map((n) => (
            <div key={n._id} className="border rounded p-3 flex items-start justify-between">
              <div>
                <div className="font-medium">{n.title}</div>
                <div className="text-sm text-muted-foreground">{n.body}</div>
              </div>
              {!n.read && (
                <Button size="sm" variant="outline" onClick={() => markRead({ id: n._id })}>Mark read</Button>
              )}
            </div>
          )) || <div>No notifications</div>}
        </CardContent>
      </Card>
    </div>
  );
}
