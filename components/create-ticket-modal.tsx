"use client";

import { useState, useEffect, ChangeEvent, useMemo, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import * as z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// Select is no longer used here; replaced by MultiSelect
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "@/components/ui/form";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Plus, Paperclip, X } from "lucide-react";
import MultiSelect from "@/components/ui/multi-select";

// Reusable modal + button to create a ticket from anywhere (mirrors dashboard form fields)

const formSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  priority: z.enum(["P0", "P1", "P2", "P3"]),
  category: z.string().optional(),
  team: z.array(z.string()).optional(),
  project: z.array(z.string()).optional(),
});
type FormValues = z.infer<typeof formSchema>;

export function CreateTicketModal({ compact = false }: { compact?: boolean }) {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id as string | undefined;
  const email = session?.user?.email as string | undefined;
  const name = (session?.user as { name?: string } | undefined)?.name;

  const me = useQuery(api.users.getByAuthId, { authUserId: userId ?? "" });
  const projectList = (me?.projects ?? []) as string[];
  const teamsQuery = useQuery(api.teams.listAll, {});
  const teamOptions = useMemo(() => {
    // const builtIns = ["IT Support", "IRT", "IRT+Senior", "Exec Escalation"];
    const names = Array.isArray(teamsQuery) ? (teamsQuery as Array<{ name?: string }>).map(t => t.name).filter(Boolean) as string[] : [];
    const set = new Set<string>([...names]);
    return Array.from(set);
  }, [teamsQuery]);

  const create = useMutation(api.myFunctions.createTicket);
  const getUploadUrl = useAction(api.myFunctions.getUploadUrl);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [attachments, setAttachments] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", description: "", priority: "P3", category: "", team: [], project: [] },
  });

  async function uploadSelectedFiles(): Promise<string[]> {
    const storageIds: string[] = [];
    for (const file of files) {
      try {
        const url = await getUploadUrl({});
        const res = await fetch(url, { method: "POST", body: file });
        if (!res.ok) continue;
        const json = (await res.json()) as { storageId: string };
        storageIds.push(json.storageId);
      } catch {
        // ignore individual file errors
      }
    }
    return storageIds;
  }

  async function onSubmit(values: FormValues) {
    setCreating(true);
    setError("");
    setSuccess("");
    try {
      const storageIds = await uploadSelectedFiles();
      await create({
        title: values.title,
        description: values.description,
        priority: values.priority,
        createdBy: userId,
        email,
        name,
        attachments: storageIds,
        category: values.category || undefined,
        // Backend currently supports a single team/project. Use the first selected if multiple.
        team: (values.team && values.team[0]) || undefined,
        project: (values.project && values.project[0]) || undefined,
      });
      form.reset({ title: "", description: "", priority: "P3", category: "", team: [], project: [] });
      setFiles([]);
      setAttachments([]);
      setSuccess("Ticket created successfully");
      setOpen(false);
  } catch {
      setError("Failed to create ticket");
    } finally {
      setCreating(false);
    }
  }

  const triggerButton = (
    <Button size={compact ? "icon" : "sm"} variant={compact ? "secondary" : "default"} onClick={() => setOpen(true)} aria-label="Create ticket">
      {compact ? "+" : "Create ticket"}
    </Button>
  );

  return (
    <>
      {triggerButton}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-6">
          <div className="fixed inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="bg-background rounded-lg border shadow-xl w-full max-w-[520px] z-10">
            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Create ticket</CardTitle>
                  <button className="text-sm underline underline-offset-4" onClick={() => setOpen(false)}>Close</button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                {error && (
                  <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
                )}
                {success && (
                  <Alert><AlertDescription>{success}</AlertDescription></Alert>
                )}
                <div className="max-h-[70vh] overflow-auto p-2">
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3">
                      <FormField name="title" control={form.control} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title</FormLabel>
                          <FormControl><Input placeholder="Summarize the issue" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField name="description" control={form.control} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <textarea
                              className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              placeholder="Add steps, screenshots, and details"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>Provide detail for faster resolution.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField name="priority" control={form.control} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Severity</FormLabel>
                          <FormControl>
                            <select className="border rounded-md px-3 py-2 text-sm bg-background" {...field}>
                              <option value="P3">P3 — Low</option>
                              <option value="P2">P2 — Medium</option>
                              <option value="P1">P1 — High</option>
                              <option value="P0">P0 — Critical</option>
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField name="category" control={form.control} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <FormControl><Input placeholder="e.g. Network, Access" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField name="team" control={form.control} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Team</FormLabel>
                          <MultiSelect
                            placeholder="Select team(s)"
                            options={teamOptions}
                            value={(field.value ?? []) as string[]}
                            onChange={(vals) => field.onChange(vals)}
                          />
                          <FormDescription>Pick one or more teams. The first will be used for routing.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                      {projectList.length > 0 && (
                        <FormField name="project" control={form.control} render={({ field }) => (
                          <FormItem>
                            <FormLabel>Project</FormLabel>
                            <FormControl>
                              <MultiSelect
                                placeholder="Select project(s)"
                                options={projectList}
                                value={(field.value ?? []) as string[]}
                                onChange={(vals) => field.onChange(vals)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      )}
                      <div className="grid gap-2">
                        <Label>Attachments</Label>
                        <div
                          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                          onDragLeave={() => setIsDragging(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setIsDragging(false);
                            const dropped: File[] = [];
                            for (const item of Array.from(e.dataTransfer.items || [])) {
                              if (item.kind === 'file') {
                                const file = item.getAsFile();
                                if (file) dropped.push(file);
                              }
                            }
                            // Fallback for browsers without dataTransfer.items
                            if (!dropped.length && e.dataTransfer.files?.length) {
                              dropped.push(...Array.from(e.dataTransfer.files));
                            }
                            if (dropped.length) setFiles((prev) => [...prev, ...dropped]);
                          }}
                          onClick={() => fileInputRef.current?.click()}
                          className={`flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-sm cursor-pointer ${isDragging ? 'bg-muted' : 'bg-background'}`}
                        >
                          <Paperclip className="w-5 h-5 text-muted-foreground" />
                          <div className="text-muted-foreground">Click to browse or drag and drop files here</div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept="image/*"
                            className="hidden"
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
                          />
                        </div>
                        {files.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {files.map((f, i) => (
                              <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs">
                                {f.name}
                                <button type="button" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} aria-label="Remove file" className="ml-1 text-muted-foreground hover:text-foreground">
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="attachments">Attachment URLs (optional)</Label>
                        <div className="space-y-2">
                          {attachments.map((url, idx) => (
                            <div key={idx} className="flex gap-2">
                              <Input value={url} onChange={(e) => {
                                const next = [...attachments];
                                next[idx] = e.target.value;
                                setAttachments(next);
                              }} />
                              <Button type="button" size="icon" variant="outline" onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))} aria-label="Remove URL">
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                          <Button type="button" size="icon" variant="outline" onClick={() => setAttachments([...attachments, ""])} aria-label="Add URL">
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <Button type="submit" disabled={creating} className="w-full">
                        {creating && <LoadingSpinner size="sm" className="mr-2" />}Create
                      </Button>
                      <p className="text-xs text-muted-foreground">Tip: Provide logs or screenshots for faster resolution.</p>
                    </form>
                  </Form>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
