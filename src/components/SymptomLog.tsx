import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, Plus, Trash2, Pencil, LogOut, Cloud, CloudOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

interface SymptomEntry {
  id: string;
  logged_at: string;
  severity: number;
  symptoms: string[];
  triggers: string[];
  notes: string | null;
}

const SYMPTOM_OPTIONS = [
  { id: "sneezing", label: "Sneezing" },
  { id: "runny_nose", label: "Runny nose" },
  { id: "congestion", label: "Congestion" },
  { id: "itchy_eyes", label: "Itchy eyes" },
  { id: "watery_eyes", label: "Watery eyes" },
  { id: "cough", label: "Cough" },
  { id: "wheeze", label: "Wheezing" },
  { id: "headache", label: "Headache" },
  { id: "fatigue", label: "Fatigue" },
  { id: "skin_rash", label: "Skin / rash" },
];

const SEVERITY_LABEL = ["", "Very mild", "Mild", "Moderate", "Strong", "Severe"];

const LOCAL_KEY = "pollenpath.symptoms";

function readLocal(): SymptomEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(entries: SymptomEntry[]) {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(entries));
  } catch {}
}

export function SymptomLog() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-border bg-card p-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <SymptomLogLocal />;
  return <SymptomLogAuthed userEmail={user.email ?? ""} onSignOut={() => signOut()} />;
}

function SymptomLogLocal() {
  const [entries, setEntries] = useState<SymptomEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SymptomEntry | null>(null);

  useEffect(() => {
    setEntries(readLocal());
  }, []);

  const save = (entry: Omit<SymptomEntry, "id" | "logged_at">) => {
    const next: SymptomEntry = {
      id: crypto.randomUUID(),
      logged_at: new Date().toISOString(),
      ...entry,
    };
    const updated = [next, ...entries];
    setEntries(updated);
    writeLocal(updated);
    toast.success("Logged on this device");
    setOpen(false);
  };

  const update = (id: string, entry: Omit<SymptomEntry, "id" | "logged_at">) => {
    const updated = entries.map((e) => (e.id === id ? { ...e, ...entry } : e));
    setEntries(updated);
    writeLocal(updated);
    toast.success("Entry updated");
    setEditing(null);
  };

  const remove = (id: string) => {
    const updated = entries.filter((e) => e.id !== id);
    setEntries(updated);
    writeLocal(updated);
    toast.success("Entry removed");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-card/50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <CloudOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-[11px] text-muted-foreground">
            Saved on this device only.
          </p>
        </div>
        <Link
          to="/auth"
          className="shrink-0 text-[11px] font-semibold text-primary hover:underline"
        >
          Sign in to sync
        </Link>
      </div>

      <EntryList
        entries={entries}
        onRemove={remove}
        open={open}
        setOpen={setOpen}
        onSave={save}
        editing={editing}
        setEditing={setEditing}
        onUpdate={async (id, entry) => update(id, entry)}
      />
    </div>
  );
}

function SymptomLogAuthed({ userEmail, onSignOut }: { userEmail: string; onSignOut: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SymptomEntry | null>(null);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["symptoms"],
    queryFn: async (): Promise<SymptomEntry[]> => {
      const { data, error } = await supabase
        .from("symptoms")
        .select("id, logged_at, severity, symptoms, triggers, notes")
        .order("logged_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as SymptomEntry[];
    },
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("symptoms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["symptoms"] });
      toast.success("Entry removed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete"),
  });

  // Auto-migrate local entries to cloud on first sign-in.
  useEffect(() => {
    const local = readLocal();
    if (local.length === 0) return;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return;
      const rows = local.map((e) => ({
        user_id: userRes.user!.id,
        logged_at: e.logged_at,
        severity: e.severity,
        symptoms: e.symptoms,
        triggers: e.triggers ?? [],
        notes: e.notes,
      }));
      const { error } = await supabase.from("symptoms").insert(rows);
      if (!error) {
        writeLocal([]);
        toast.success(`Synced ${rows.length} local entries`);
        qc.invalidateQueries({ queryKey: ["symptoms"] });
      }
    })();
  }, [qc]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Cloud className="h-3.5 w-3.5" />
            <span className="truncate">Synced as {userEmail}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-3 w-3" /> Sign out
        </button>
      </div>

      <EntryList
        entries={entries}
        loading={isLoading}
        onRemove={(id) => removeMut.mutate(id)}
        open={open}
        setOpen={setOpen}
        editing={editing}
        setEditing={setEditing}
        onUpdate={async (id, entry) => {
          const { error } = await supabase
            .from("symptoms")
            .update({
              severity: entry.severity,
              symptoms: entry.symptoms,
              triggers: entry.triggers,
              notes: entry.notes,
            })
            .eq("id", id);
          if (error) {
            toast.error(error.message);
            return;
          }
          toast.success("Entry updated");
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["symptoms"] });
        }}
        onSave={async (entry) => {
          const { data: userRes } = await supabase.auth.getUser();
          if (!userRes.user) return;
          const { error } = await supabase.from("symptoms").insert({
            user_id: userRes.user.id,
            severity: entry.severity,
            symptoms: entry.symptoms,
            triggers: entry.triggers,
            notes: entry.notes,
          });
          if (error) {
            toast.error(error.message);
            return;
          }
          toast.success("Logged");
          setOpen(false);
          qc.invalidateQueries({ queryKey: ["symptoms"] });
        }}
      />
    </div>
  );
}

function EntryList({
  entries,
  loading,
  onRemove,
  open,
  setOpen,
  onSave,
  editing,
  setEditing,
  onUpdate,
}: {
  entries: SymptomEntry[];
  loading?: boolean;
  onRemove: (id: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  onSave: (entry: Omit<SymptomEntry, "id" | "logged_at">) => void | Promise<void>;
  editing: SymptomEntry | null;
  setEditing: (v: SymptomEntry | null) => void;
  onUpdate: (id: string, entry: Omit<SymptomEntry, "id" | "logged_at">) => void | Promise<void>;
}) {
  const stats = useMemo(() => {
    if (entries.length === 0) return null;
    const avg = entries.reduce((sum, e) => sum + e.severity, 0) / entries.length;
    const counts: Record<string, number> = {};
    for (const e of entries) for (const s of e.symptoms) counts[s] = (counts[s] ?? 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return { avg, topSymptom: top?.[0], topCount: top?.[1] ?? 0, count: entries.length };
  }, [entries]);

  return (
    <>
      {stats && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Last {stats.count} entries
          </p>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-2xl font-bold text-foreground">{stats.avg.toFixed(1)}</span>
            <span className="text-xs text-muted-foreground">avg severity / 5</span>
          </div>
          {stats.topSymptom && (
            <p className="mt-1 text-xs text-muted-foreground">
              Most reported:{" "}
              <span className="text-foreground">
                {SYMPTOM_OPTIONS.find((o) => o.id === stats.topSymptom)?.label ?? stats.topSymptom}
              </span>{" "}
              · {stats.topCount}×
            </p>
          )}
        </div>
      )}

      {editing ? (
        <NewEntryForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (entry) => {
            await onUpdate(editing.id, entry);
          }}
        />
      ) : open ? (
        <NewEntryForm onClose={() => setOpen(false)} onSave={onSave} />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Log symptoms
        </button>
      )}

      <div className="space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && entries.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border bg-card/50 p-4 text-center text-xs text-muted-foreground">
            No entries yet. Log how you feel today.
          </p>
        )}
        {entries.map((e) => (
          <article key={e.id} className="rounded-2xl border border-border bg-card p-3">
            <header className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {SEVERITY_LABEL[e.severity]} · {e.severity}/5
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(e.logged_at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Edit entry"
                  onClick={() => {
                    setEditing(e);
                    setOpen(false);
                  }}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Delete entry"
                  onClick={() => onRemove(e.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </header>
            {e.symptoms.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {e.symptoms.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground"
                  >
                    {SYMPTOM_OPTIONS.find((o) => o.id === s)?.label ?? s}
                  </span>
                ))}
              </div>
            )}
            {e.triggers.length > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Suspected: <span className="text-foreground">{e.triggers.join(", ")}</span>
              </p>
            )}
            {e.notes && (
              <p className="mt-2 whitespace-pre-wrap text-xs text-foreground">{e.notes}</p>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

function NewEntryForm({
  initial,
  onClose,
  onSave,
}: {
  initial?: SymptomEntry;
  onClose: () => void;
  onSave: (entry: Omit<SymptomEntry, "id" | "logged_at">) => void | Promise<void>;
}) {
  const [severity, setSeverity] = useState(initial?.severity ?? 3);
  const [selected, setSelected] = useState<string[]>(initial?.symptoms ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({
        severity,
        symptoms: selected,
        triggers: [],
        notes: notes.trim() || null,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Severity: {SEVERITY_LABEL[severity]} ({severity}/5)
        </label>
        <input
          type="range"
          min={1}
          max={5}
          value={severity}
          onChange={(e) => setSeverity(Number(e.target.value))}
          className="w-full accent-primary"
        />
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Symptoms
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SYMPTOM_OPTIONS.map((s) => {
            const active = selected.includes(s.id);
            return (
              <button
                type="button"
                key={s.id}
                onClick={() => toggle(s.id)}
                className={
                  "rounded-full border px-3 py-1 text-xs font-medium " +
                  (active
                    ? "border-primary bg-accent text-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground")
                }
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={2}
          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          placeholder="E.g. after a walk in the park"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl border border-border bg-background py-2.5 text-sm font-medium text-foreground hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </button>
      </div>
    </form>
  );
}