"use client";
import { useEffect } from "react";
import { registerWebPush } from "@/components/use-web-push";

export function WebPushInit() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_WEBPUSH_VAPID || process.env.NEXT_PUBLIC_WEBPUSH_VAPID_PUBLIC;
    if (!key) {
      console.warn("WebPushInit: NEXT_PUBLIC_WEBPUSH_VAPID not set; skipping registration");
      return;
    }
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) {
      console.warn('WebPushInit: Notifications API not supported');
      return;
    }
    if (localStorage.getItem('wp_registered') === '1') {
      return;
    }
    (async () => {
      try {
        console.log('WebPushInit: registering for push');
  const sub: PushSubscription = await registerWebPush(key) as PushSubscription;
  console.log('WebPushInit: subscription endpoint', sub.endpoint);
        localStorage.setItem('wp_registered', '1');
      } catch (e) {
        console.warn('WebPushInit: registration failed', e);
      }
    })();
  }, []);
  return null;
}
