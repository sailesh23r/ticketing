"use client";

import { useState, ChangeEvent, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { MessageSquare, Send, Paperclip, X, Loader2, File as FileIcon } from "lucide-react";
import hljs from 'highlight.js/lib/common';
import 'highlight.js/styles/github-dark.css';
import { authClient } from "@/lib/auth-client";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";

type Comment = {
  _id: string;
  content: string;
  _creationTime?: number;
  author?: { name?: string; email?: string } | null;
  isInternal?: boolean;
  attachments?: { url?: string; fileName?: string; fileSize?: number; storageId?: string; contentType?: string }[];
};

export default function CommentSection({ ticketId }: { ticketId: string }) {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id as string | undefined;

  const comments = useQuery(api.comments?.list, { ticketId }) as Comment[] | undefined || [];
  const createComment = useMutation(api.comments?.create);
  const getUploadUrl = useAction(api.myFunctions.getUploadUrl);

  const [newComment, setNewComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<{ storageId: string; fileName: string; fileSize?: number; contentType?: string; url?: string }[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState<number>(-1); // position in text where '@' started
  const [cursorPos, setCursorPos] = useState(0);
  const users = useQuery(api.users?.listAll) as Array<{ authUserId?: string; name?: string; email: string }> | undefined;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Live preview always on now (removed write/preview toggle)
  const [filePreviews, setFilePreviews] = useState<Record<string, string>>({});

  const onFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(e.target.files ?? []));
  };

  async function uploadFilesAndGetAttachments(): Promise<{ storageId: string; fileName: string; fileSize?: number; contentType?: string }[]> {
    const results: { storageId: string; fileName: string; fileSize?: number; contentType?: string }[] = [];
    const resolveConvexUrl = () => {
      const envUrl = process.env.NEXT_PUBLIC_CONVEX_URL as string | undefined;
      if (envUrl && !/^(?:http:\/\/)?(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(envUrl)) {
        return envUrl;
      }
      if (typeof window !== "undefined") {
        const proto = window.location.protocol === "https:" ? "https" : "http";
        const host = window.location.hostname;
        const port = (process.env.NEXT_PUBLIC_CONVEX_PORT as string) || "3210";
        return `${proto}://${host}:${port}`;
      }
      return envUrl || "http://127.0.0.1:3210";
    };

    for (const file of files) {
      // Try fast path: Convex pre-signed upload URL
      let stored: string | null = null;
      try {
        const url = await getUploadUrl({});
        try {
          const res = await fetch(url, { method: "POST", body: file });
          if (res.ok) {
            const json = (await res.json()) as { storageId: string };
            stored = json.storageId;
          }
        } catch {
          // fall through to HTTP route
        }
      } catch {
        // fall through
      }

      if (!stored) {
        try {
          const httpUrl = `${resolveConvexUrl()}/sendImage`;
          const httpRes = await fetch(httpUrl, { method: "POST", body: file });
          if (httpRes.ok) {
            const json2 = (await httpRes.json()) as { storageId: string };
            stored = json2.storageId;
          }
        } catch {
          // ignore, we'll skip this file
        }
      }

      if (stored) {
        results.push({ storageId: stored, fileName: file.name, fileSize: file.size, contentType: file.type });
      }
    }
    return results;
  }

  const applyWrap = (prefix: string, suffix: string = prefix) => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const value = newComment;
    if (start !== end) {
      const selected = value.slice(start, end);
      const wrapped = `${prefix}${selected}${suffix}`;
      const next = value.slice(0, start) + wrapped + value.slice(end);
      setNewComment(next);
      // Keep selection inside wrapped text
      queueMicrotask(() => {
        el.selectionStart = start + prefix.length;
        el.selectionEnd = start + prefix.length + selected.length;
      });
    } else {
      const insertion = `${prefix}${suffix}`;
      const cursor = start + prefix.length;
      const next = value.slice(0, start) + insertion + value.slice(end);
      setNewComment(next);
      queueMicrotask(() => {
        el.selectionStart = cursor;
        el.selectionEnd = cursor;
      });
    }
  };

  // Auto-resize textarea
  const autoResize = () => {
    const el = textareaRef.current; if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px';
  };
  useEffect(() => { autoResize(); }, [newComment]);

  // (Deprecated basic onEditorKeyDown removed; enhanced handler defined later supports mentions + shortcuts)

  // Simple markdown-ish rendering (bold/italic/underline/code/blocks/lists). Avoid external dependency.
  const renderMarkdown = (src: string): string => {
    const escape = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    let out = escape(src);
    // Combined emphasis / order matters
    // ***bold+italic*** or ___bold+italic___
    out = out.replace(/[\*|_]{3}(.+?)[\*|_]{3}/g, '<strong><em>$1</em></strong>');
    // **bold** or __bold__ (avoid those already processed)
    out = out.replace(/(\*\*|__)(.+?)\1/g, '<strong>$2</strong>');
    // *italic* or _italic_ (not part of ** or __) ensure boundaries
    out = out.replace(/(^|[\s.,;:!?\-])(?<!\*)\*(?!\*)([^*]+?)\*(?!\*)(?=$|[\s.,;:!?\-])/g, '$1<em>$2</em>');
    out = out.replace(/(^|[\s.,;:!?\-])_(?!_)([^_]+?)_(?=$|[\s.,;:!?\-])/g, '$1<em>$2</em>');
    // Inline code `code`
    out = out.replace(/`([^`]+?)`/g, '<code class="px-1 py-0.5 bg-gray-200 rounded text-xs">$1</code>');
    // Code blocks ```lang?\n ... ```
    out = out.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_m, lang, body) => {
      const raw = body.replace(/^[\n]+|[\n]+$/g,'');
      const highlighted = lang ? (() => { try { return hljs.highlight(raw, { language: lang }).value; } catch { return escape(raw); } })() : escape(raw);
      return `<pre class="bg-gray-900 text-gray-100 text-xs p-3 rounded overflow-auto"><code class="hljs language-${lang}">${highlighted}</code></pre>`;
    });
    // Lists - simple: lines starting with - or *
    out = out.replace(/(^|\n)[-*] (.+?)(?=\n[^-* ]|$)/g, (m) => {
      const items = m.trim().split(/\n/).map(l => l.replace(/^[*-]\s*/,''));
      if (items.length <= 1) return m; return `<ul class="list-disc ms-5">${items.map(i=>`<li>${i}</li>`).join('')}</ul>`;
    });
    // Autolink bare URLs
    out = out.replace(/(https?:\/\/[^\s<]+[^<.,;:!?)\]\s])/g, '<a href="$1" class="text-blue-600 underline" target="_blank" rel="noopener noreferrer">$1</a>');
    // Mentions styling: prefer exact known user names (multi-word) else fallback single token; ensure word boundary
    try {
      if (users && users.length) {
        const names = Array.from(new Set(users.map(u => (u.name || u.email || '').trim()).filter(Boolean)));
        if (names.length) {
          const escaped = names
            .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, r => `\\${r}`))
            .sort((a,b) => b.length - a.length); // longest first
          const mentionRegex = new RegExp(`(^|\\s)@(${escaped.join('|')})(?=\\s|$|[.,!?])`, 'g');
          out = out.replace(mentionRegex, '$1<span class="text-blue-600 font-medium">@$2<\/span>');
        } else {
          out = out.replace(/(^|\s)@([A-Za-z0-9._-]{2,40})(?=\s|$|[.,!?])/g, '$1<span class="text-blue-600 font-medium">@$2<\/span>');
        }
      } else {
        out = out.replace(/(^|\s)@([A-Za-z0-9._-]{2,40})(?=\s|$|[.,!?])/g, '$1<span class="text-blue-600 font-medium">@$2<\/span>');
      }
    } catch {}
    // Underline tags already allowed (<u>) - re-enable by unescaping
    out = out.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, '<u>$1</u>');
    // Line breaks
    out = out.replace(/\n/g, '<br />');
    return out;
  };

  // Editing renderer: preserves original markdown marker widths using hidden spans so caret alignment stays correct.
  const renderEditingMarkdown = (src: string): string => {
    const escape = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    let out = escape(src);
    // Protect code blocks first (store placeholders)
    const codeBlocks: string[] = [];
    out = out.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (m) => { codeBlocks.push(m); return `__CODEBLOCK_${codeBlocks.length-1}__`; });
    // Inline code protect
    const inlineCodes: string[] = [];
    out = out.replace(/`([^`]+?)`/g, (m) => { inlineCodes.push(m); return `__INLINECODE_${inlineCodes.length-1}__`; });

    const hiddenWrap = (marker: string) => `<span class=\"mk-hidden\">${marker}</span>`;
    // Bold+Italic (*** or ___)
    out = out.replace(/(\*\*\*|___)(.+?)(\1)/g, (_m, open, content) => `<strong><em>${hiddenWrap(open)}${content}${hiddenWrap(open)}</em></strong>`);
    // Bold (** or __)
    out = out.replace(/(\*\*|__)(.+?)(\1)/g, (_m, open, content) => `<strong>${hiddenWrap(open)}${content}${hiddenWrap(open)}</strong>`);
    // Italic (* or _)
    out = out.replace(/(^|[^*_])(\*|_)([^*_]+?)(\2)(?=$|[^*_])/g, (_m, pre, mark, inner) => `${pre}<em>${hiddenWrap(mark)}${inner}${hiddenWrap(mark)}</em>`);
    // Underline tags pass-through
    out = out.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, '<u>$1</u>');
    // Mentions (editing) - same logic with boundaries
    try {
      if (users && users.length) {
        const names = Array.from(new Set(users.map(u => (u.name || u.email || '').trim()).filter(Boolean)));
        if (names.length) {
          const escaped = names
            .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, r => `\\${r}`))
            .sort((a,b) => b.length - a.length);
          const mentionRegex = new RegExp(`(^|\\s)@(${escaped.join('|')})(?=\\s|$|[.,!?])`, 'g');
          // Editing overlay: use color only (no padding/weight) to avoid caret width drift
          out = out.replace(mentionRegex, '$1<span class="text-blue-600">@$2</span>');
        } else {
          out = out.replace(/(^|\s)@([A-Za-z0-9._-]{2,40})(?=\s|$|[.,!?])/g, '$1<span class="text-blue-600">@$2</span>');
        }
      } else {
  out = out.replace(/(^|\s)@([A-Za-z0-9._-]{2,40})(?=\s|$|[.,!?])/g, '$1<span class="text-blue-600">@$2</span>');
      }
    } catch {}
    // Autolinks (shown but markers remain exact width because we don't remove chars)
    out = out.replace(/(https?:\/\/[^\s<]+[^<.,;:!?)\]\s])/g, '<span class="text-primary underline">$1</span>');
    // Restore inline code (rendered with preserved backticks)
    out = out.replace(/__INLINECODE_(\d+)__/g, (_m, i) => {
      const original = inlineCodes[Number(i)];
      if (!original) return _m;
      const m = /`([^`]+?)`/.exec(original);
      if (!m) return original;
      return `<code class=\"px-1 py-0.5 bg-gray-200 rounded text-xs\">${escape(m[1])}</code>`;
    });
    // Restore code blocks (syntax highlight but keep markers as hidden spans to preserve width difference)
    out = out.replace(/__CODEBLOCK_(\d+)__/g, (_m, i) => {
      const original = codeBlocks[Number(i)];
      if (!original) return _m;
      const match = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/.exec(original);
      if (!match) return original;
      const lang = match[1];
      const body = match[2].replace(/^[\n]+|[\n]+$/g,'');
      let highlighted: string;
      try { highlighted = lang ? hljs.highlight(body, { language: lang }).value : escape(body); } catch { highlighted = escape(body); }
      const marker = '```';
      return `<pre class=\"bg-gray-900 text-gray-100 text-xs p-3 rounded overflow-auto\"><code class=\"hljs language-${lang}\">${hiddenWrap(marker+lang)}${highlighted}${hiddenWrap(marker)}</code></pre>`;
    });
    // Line breaks
    out = out.replace(/\n/g,'<br />');
    return out;
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!isDragging) setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { if (e.currentTarget === dropRef.current) setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const newFiles = Array.from(e.dataTransfer.files || []);
    if (newFiles.length) setFiles(prev => [...prev, ...newFiles]);
  };

  // Paste images from clipboard
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items; if (!items) return;
    const imgs: File[] = [];
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f && f.type.startsWith('image/')) imgs.push(f);
      }
    }
    if (imgs.length) {
      e.preventDefault();
      setFiles(prev => [...prev, ...imgs]);
    }
  };

  // Mentions detection
  const updateMentions = useCallback((value: string, caret: number) => {
    setCursorPos(caret);
    const upto = value.slice(0, caret);
    const match = /(^|\s)@([a-zA-Z0-9_]{0,30})$/.exec(upto);
    if (match) {
      setMentionQuery(match[2]);
      setMentionOpen(true);
      setMentionIndex(caret - match[2].length - 1); // index of '@'
    } else {
      setMentionOpen(false);
      setMentionQuery("");
      setMentionIndex(-1);
    }
  }, []);

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNewComment(val);
    updateMentions(val, e.target.selectionStart);
  };

  const mentionCandidates = (users || []).map(u => ({
    id: u.authUserId || u.email,
    label: u.name || u.email,
  })).filter(u => !mentionQuery || u.label.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0,8);

  const selectMention = (cand: {id: string; label: string}) => {
    if (mentionIndex < 0) return;
    const before = newComment.slice(0, mentionIndex);
    // mentionIndex points at '@'
    // find after portion by skipping existing partial (mentionQuery length + 1)
    const after = newComment.slice(cursorPos);
    const insertion = `@${cand.label}`;
    const next = before + insertion + ' ' + after;
    setNewComment(next);
    setMentionOpen(false);
    queueMicrotask(() => {
      if (textareaRef.current) {
        const pos = before.length + insertion.length + 1;
        textareaRef.current.selectionStart = pos;
        textareaRef.current.selectionEnd = pos;
        textareaRef.current.focus();
      }
    });
  };

  const onEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape')) {
      e.preventDefault();
      setHighlightIdx(prev => {
        if (e.key === 'Escape') { setMentionOpen(false); return prev; }
        if (e.key === 'Enter' || e.key === 'Tab') {
          const cand = mentionCandidates[prev] || mentionCandidates[0];
          if (cand) selectMention(cand);
          return 0;
        }
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const len = mentionCandidates.length;
        if (!len) return 0;
        return (prev + dir + len) % len;
      });
      return;
    }
    if (!(e.metaKey || e.ctrlKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'b') { e.preventDefault(); applyWrap('**'); }
    else if (key === 'i') { e.preventDefault(); applyWrap('*'); }
    else if (key === 'u') { e.preventDefault(); applyWrap('<u>', '</u>'); }
    else if (key === 'e') { e.preventDefault(); applyWrap('`'); }
  };

  const [highlightIdx, setHighlightIdx] = useState(0);

  // Persist draft (text only) per ticket
  useEffect(() => {
    const key = `draft-comment-${ticketId}`;
    try { const saved = localStorage.getItem(key); if (saved) setNewComment(saved); } catch {}
  }, [ticketId]);
  useEffect(() => {
    const key = `draft-comment-${ticketId}`; try { if (newComment) localStorage.setItem(key, newComment); else localStorage.removeItem(key); } catch {}
  }, [newComment, ticketId]);

  // Build previews for image files awaiting upload
  useEffect(() => {
    const map: Record<string,string> = {};
    files.forEach(f => { if (f.type.startsWith('image/')) { map[f.name + f.lastModified] = URL.createObjectURL(f); } });
    setFilePreviews(prev => {
      // Revoke previous not used
      Object.keys(prev).forEach(k => { if (!map[k]) URL.revokeObjectURL(prev[k]); });
      return map;
    });
    return () => { Object.values(filePreviews).forEach(url => { try { URL.revokeObjectURL(url); } catch {} }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const removePendingFile = (nameKey: string) => {
    setFiles(prev => prev.filter(f => (f.name + f.lastModified) !== nameKey));
  };


  const removeAttachment = (storageId: string) => setAttachments((prev) => prev.filter((a) => a.storageId !== storageId));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newComment.trim() && files.length === 0 && attachments.length === 0) || isSubmitting) return;
    setIsSubmitting(true);
    const allAttachments: { storageId: string; fileName: string; fileSize?: number; contentType?: string }[] = [];
    try {
      // Upload pending files now (auto-upload on submit)
      if (files.length) {
        setUploading(true);
        setUploadProgress({ done: 0, total: files.length });
        const uploaded = await uploadFilesAndGetAttachments();
        allAttachments.push(...uploaded);
        setUploadProgress({ done: files.length, total: files.length });
        setUploading(false);
      }
      if (attachments.length) allAttachments.push(...attachments);
      await createComment({ ticketId, content: newComment.trim(), isInternal, userId, attachments: allAttachments });
      setNewComment(""); setIsInternal(false); setAttachments([]); setFiles([]); setFilePreviews({}); setMentionOpen(false); setUploadProgress({ done: 0, total: 0 });
      try { localStorage.removeItem(`draft-comment-${ticketId}`); } catch {}
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (ts?: number) => (ts ? new Date(ts).toLocaleString() : "");

  return (
    <div className="p-6">
      {/* <div className="flex items-center gap-2 mb-6">
        <MessageSquare className="w-5 h-5 text-gray-400" />
        <h3 className="text-lg font-semibold text-gray-900">Comments ({comments.length})</h3>
      </div> */}

      <div className="space-y-8 mb-8">
        {comments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p>No comments yet. Be the first to comment!</p>
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment._id} className="flex gap-4 border-b border-gray-200 pb-6">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-gray-600">{(comment.author?.name || comment.author?.email || "U").charAt(0).toUpperCase()}</span>
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-gray-900">{comment.author?.name || comment.author?.email || "Unknown User"}</span>
                  <span className="text-sm text-gray-500">{formatDate(comment._creationTime)}</span>
                  {comment.isInternal && (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">Internal</span>
                  )}
                </div>
                <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: renderMarkdown(comment.content) }} />
                {comment.attachments && comment.attachments.length > 0 && (
                  <div className="mt-3">
                    <div className="flex flex-wrap gap-2">
                      {comment.attachments.map((att, i) => (
                        <a key={att.storageId || i} href={att.url || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                          <Paperclip className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-700">{att.fileName}</span>
                          {att.fileSize && <span className="text-xs text-gray-500">({Math.round((att.fileSize / 1024))}KB)</span>}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-gray-200 pt-6">
        {/* Textarea */}
        <div
          ref={dropRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`mb-2 relative rounded-lg border border-gray-300 focus-within:ring-2 focus-within:ring-blue-500 ${isDragging ? 'ring-2 ring-blue-400 ring-offset-2' : ''}`}
        >
          {/* Highlight / preview layer */}
          <div className="absolute inset-0 overflow-auto rounded-lg pointer-events-none select-none px-3 py-2 font-medium text-sm whitespace-pre-wrap break-words text-gray-800">
            <style>{`.mk-hidden{opacity:0;white-space:pre}`}</style>
            <div dangerouslySetInnerHTML={{ __html: renderEditingMarkdown(newComment || '') + (newComment.endsWith('\n') ? '<br />' : '') }} />
          </div>
          <textarea
            ref={textareaRef}
            value={newComment}
            onChange={handleCommentChange}
            onKeyDown={onEditorKeyDown}
            onPaste={onPaste}
            placeholder="Add a comment"
            rows={4}
            className="relative w-full px-3 py-2 bg-transparent rounded-lg resize-none font-medium text-sm text-transparent caret-blue-600 selection:bg-blue-200 outline-none"
            style={{ WebkitTextFillColor: 'transparent' }}
          />
          {isDragging && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-blue-600 bg-blue-50/80 rounded-lg">Drop files to attach</div>
          )}
        </div>
        {/* Live formatting hint */}
        {/* <div className="flex items-center gap-3 mb-2 text-xs font-medium">
          <span className="text-gray-500">Formatting: **bold** *italic* ***bold+italic*** `code` ```block``` - list</span>
        </div> */}
        {/* <div className="mb-4 border rounded-lg p-3 bg-gray-50 text-sm prose prose-sm max-w-none min-h-[60px]" dangerouslySetInnerHTML={{ __html: renderMarkdown(newComment || '*Start typing to see live preview*') }} /> */}
        {/* Mentions dropdown */}
        {mentionOpen && mentionCandidates.length > 0 && textareaRef.current && (
          <div className="relative">
            <ul className="absolute z-20 mt-1 w-56 max-h-56 overflow-auto rounded-md border bg-white shadow-md text-sm">
              {mentionCandidates.map((c, i) => (
                <li
                  key={c.id}
                  onMouseDown={(e) => { e.preventDefault(); selectMention(c); }}
                  className={`px-3 py-1.5 cursor-pointer flex justify-between ${i === highlightIdx ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}
                >
                  <span className="truncate">{c.label}</span>
                  <span className="text-xs opacity-70">{c.id.slice(0,8)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Formatting Toolbar */}
        <div className="flex items-center gap-1 mb-4 flex-wrap">
          {/* <button type="button" onClick={() => applyWrap('**')} title="Bold (wrap selection with **bold**)" className="p-2 rounded-md border bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-900 text-sm inline-flex items-center gap-1">
            <Bold className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => applyWrap('*')} title="Italic (wrap selection with *italic*)" className="p-2 rounded-md border bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-900 text-sm inline-flex items-center gap-1">
            <Italic className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => applyWrap('<u>', '</u>')} title="Underline (wrap selection in <u>)" className="p-2 rounded-md border bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-900 text-sm inline-flex items-center gap-1">
            <Underline className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => applyWrap('`')} title="Inline code (wrap selection with `)" className="p-2 rounded-md border bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-900 inline-flex items-center gap-1">
            <Code className="w-4 h-4" />
          </button> */}
          {/* <div className="h-6 w-px bg-gray-200 mx-1" /> */}
          <input ref={fileInputRef} type="file" multiple onChange={onFileSelect} className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach files"
            className="p-2 rounded-md border bg-white hover:bg-gray-50 text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </button>
          {/* Removed preview toggle button (live preview always visible) */}
        </div>

        {/* Attachments Preview */}
        {(attachments.length > 0 || files.length > 0) && (
          <div className="mb-4 space-y-2">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((att) => (
                  <div key={att.storageId} className="group flex items-center gap-2 px-2 py-1 bg-gray-100 rounded text-xs border">
                    <Paperclip className="w-3 h-3 text-gray-500" />
                    <span className="max-w-[160px] truncate" title={att.fileName}>{att.fileName}</span>
                    {att.fileSize && <span className="text-[10px] text-gray-500">{Math.round(att.fileSize/1024)}KB</span>}
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.storageId!)}
                      className="opacity-60 group-hover:opacity-100 text-gray-500 hover:text-red-600"
                      aria-label="Remove attachment"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((f, idx) => {
                  const key = f.name + f.lastModified;
                  const isImg = f.type.startsWith('image/');
                  const url = filePreviews[key];
                  return (
                    <div
                      key={key}
                      className="relative group border rounded-md p-2 w-24 h-24 flex flex-col items-center justify-center bg-white shadow-sm overflow-hidden"
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(idx)); }}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect='move'; }}
                      onDrop={(e) => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); const to = idx; if (from === to) return; setFiles(prev => { const copy = [...prev]; const [item] = copy.splice(from,1); copy.splice(to,0,item); return copy; }); }}
                    >
                      {isImg && url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt={f.name} className="object-cover absolute inset-0 w-full h-full" />
                      ) : (
                        <div className="flex flex-col items-center text-gray-400 text-[10px]">
                          <FileIcon className="w-5 h-5 mb-1" />
                          <span className="px-1 text-center line-clamp-3 break-all">{f.name}</span>
                        </div>
                      )}
                      <button type="button" onClick={() => removePendingFile(key)} className="absolute top-1 right-1 bg-white/80 hover:bg-white rounded-full p-0.5 shadow opacity-0 group-hover:opacity-100 transition" aria-label="Remove file">
                        <X className="w-3 h-3 text-gray-600" />
                      </button>
                      {isImg && <span className="absolute bottom-1 left-1 bg-black/50 text-white rounded px-1 py-[1px] text-[10px]">{Math.round(f.size/1024)}KB</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          {/* <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Internal comment</span>
          </label> */}

          <div className="flex items-center gap-3">
            {uploading && (
              <div className="text-xs text-gray-500">Uploading {uploadProgress.done}/{uploadProgress.total}</div>
            )}
            <Button
              type="submit"
              disabled={(!newComment.trim() && files.length === 0 && attachments.length === 0) || isSubmitting || uploading}
              className="flex items-center gap-2"
            >
              {isSubmitting || uploading ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />{uploading ? 'Uploading...' : 'Posting...'}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />Post Comment
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
