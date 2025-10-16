"use client";

import * as React from "react";
import { Bell, Check, Loader2 } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { subscribeUser } from "@/lib/subscribeUser";

interface NotificationRow {
  _id: Id<"notifications">;
  userId: string;
  channel: string;
  title: string;
  body: string;
  read: boolean;
  meta?: { ticketId?: string };
}

export default function GlobalNotifications() {
  const notifications = useQuery(api.notifications.listMyNotifications, {}) as NotificationRow[] | undefined;
  const markRead = useMutation(api.notifications.markRead);
  const unread = (notifications || []).filter(n => !n.read);
  const [open, setOpen] = React.useState(false);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [pushSupported, setPushSupported] = React.useState<boolean>(false);
  const [notifPermission, setNotifPermission] = React.useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = React.useState<boolean>(false);
  const [enableBusy, setEnableBusy] = React.useState<boolean>(false);

  async function markAll() {
    if (!notifications) return;
    setBulkBusy(true);
    try {
      const unreadIds = notifications.filter(n => !n.read).slice(0, 100).map(n => n._id);
      await Promise.all(unreadIds.map(id => markRead({ id })));
    } finally {
      setBulkBusy(false);
    }
  }

  // Detect support, permission, and existing subscription
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const supported = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
      if (!mounted) return;
      setPushSupported(supported);
      if (!supported) return;
      setNotifPermission(Notification.permission);
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const ready = reg || (await navigator.serviceWorker.ready);
        const sub = await ready.pushManager.getSubscription();
        if (!mounted) return;
        setIsSubscribed(!!sub);
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false };
  }, []);

  async function handleEnablePush() {
    if (!pushSupported) return;
    try {
      setEnableBusy(true);
      // Ask notification permission first
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
      if (perm !== 'granted') return;
      const vapid = process.env.NEXT_PUBLIC_WEBPUSH_VAPID;
      if (!vapid) {
        console.warn('Missing NEXT_PUBLIC_WEBPUSH_VAPID');
        return;
      }
      const subscription = await subscribeUser(vapid);
      // Send to server to register
      await fetch('/api/web-push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription }),
      });
      setIsSubscribed(true);
    } catch (e) {
      console.error('Enable push failed', e);
    } finally {
      setEnableBusy(false);
    }
  }

  // Floating bell positioned bottom-right (adjust z-index to sit above content but below modals you might have at 50+)
  return (
    <div className="fixed z-40 bottom-4 right-4 flex flex-col items-end gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label="Notifications"
            className={cn(
              "relative rounded-full shadow-md border bg-background hover:bg-accent transition-colors",
              "h-12 w-12 flex items-center justify-center"
            )}
          >
            <Bell className="h-5 w-5" />
            {unread.length > 0 && (
              <span className="absolute -top-1 -right-1 rounded-full bg-red-600 text-[10px] leading-none text-white px-1 py-[2px] font-medium min-w-[18px] text-center">
                {unread.length > 99 ? "99+" : unread.length}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" side="top" className="w-96 p-0">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="text-xs font-medium">Notifications</div>
            <div className="flex items-center gap-2">
              {pushSupported && !isSubscribed && notifPermission !== 'denied' && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  disabled={enableBusy}
                  onClick={handleEnablePush}
                  title={process.env.NEXT_PUBLIC_WEBPUSH_VAPID ? '' : 'Missing VAPID key'}
                >
                  {enableBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                  <span className="ml-1">Enable push</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={bulkBusy || unread.length === 0}
                onClick={markAll}
                className="h-6 px-2 text-[11px]"
              >
                {bulkBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                <span className="ml-1">Mark all</span>
              </Button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y scrollbar-thin scrollbar-thumb-border/60 scrollbar-track-transparent">
            {!notifications && (
              <div className="p-4 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...
              </div>
            )}
            {notifications && notifications.length === 0 && (
              <div className="p-4 text-xs text-muted-foreground">No notifications</div>
            )}
            {notifications && notifications.map(n => (
              <div key={n._id} className={cn("p-3 text-xs space-y-1", !n.read && "bg-muted/50")}> 
                <div className="font-medium text-[11px] flex items-center gap-2">
                  {n.title}
                  {!n.read && (
                    <button
                      onClick={() => markRead({ id: n._id })}
                      className="ml-auto inline-flex items-center gap-1 rounded border px-1 py-[1px] text-[10px] hover:bg-accent"
                    >
                      <Check className="h-3 w-3" /> Read
                    </button>
                  )}
                </div>
                <div className="text-muted-foreground leading-snug line-clamp-3">{n.body}</div>
                {n.meta?.ticketId && (
                  <div className="text-[10px] text-muted-foreground/80">Ticket: {n.meta.ticketId}</div>
                )}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
