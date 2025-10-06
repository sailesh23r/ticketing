"use client";
import React, { createContext, useContext, useCallback, useState, useRef, useEffect } from "react";

type ToastVariant = "default" | "destructive" | "success";
export interface ToastOptions { title: string; description?: string; variant?: ToastVariant; durationMs?: number }
interface ToastInternal extends ToastOptions { id: string; createdAt: number }

interface ToastContextValue {
  push: (opts: ToastOptions) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastInternal[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const push = useCallback((opts: ToastOptions) => {
    const id = Math.random().toString(36).slice(2);
    const toast: ToastInternal = { id, createdAt: Date.now(), variant: "default", durationMs: 4000, ...opts };
    setToasts((t) => [...t, toast]);
    timers.current[id] = setTimeout(() => dismiss(id), toast.durationMs);
  }, [dismiss]);

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      {/* Portal-like inline rendering */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-80 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-md border shadow bg-white text-sm p-3 flex flex-col gap-1 animate-in fade-in slide-in-from-top-2 ${t.variant === 'destructive' ? 'border-red-300 bg-red-50' : t.variant === 'success' ? 'border-green-300 bg-green-50' : 'border-gray-200'} `}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-gray-900 text-sm">{t.title}</div>
              <button onClick={() => dismiss(t.id)} className="text-xs text-gray-500 hover:text-gray-700">✕</button>
            </div>
            {t.description && <div className="text-xs text-gray-600 whitespace-pre-wrap">{t.description}</div>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
