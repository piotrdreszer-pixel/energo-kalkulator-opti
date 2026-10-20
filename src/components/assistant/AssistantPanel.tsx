import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Bot, Loader2, RotateCcw, Send, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { assistantDraftDiff, assistantResultSummary, AI_MAX_MESSAGE } from '@/lib/assistant-context';
import { calculateEnergyCosts } from '@/lib/calculation-utils';
import { ProposalCard } from './ProposalCard';
import { PROPOSAL_FIELDS } from '@/lib/assistant-proposal';
import { ESTIMATE_FIELD_LABELS } from '@/lib/invoice-gaps';
import { computeInvoiceFacts } from '@/hooks/useInvoiceFacts';

const fieldLabel = (f: string) => PROPOSAL_FIELDS[f as keyof typeof PROPOSAL_FIELDS]?.label ?? ESTIMATE_FIELD_LABELS[f] ?? f;

export interface AssistantPpe { id: string; name: string; ppe_number?: string | null }
export interface AssistantPanelProps {
  groupId: string;
  clientName?: string | null;
  groupName?: string | null;
  ppes: AssistantPpe[];
  currentPpeId?: string | null;
  allowAll: boolean;
  /** Current Import faktur permission: enables period/estimate operations. */
  invoiceImport?: boolean;
  step?: string;
  draft?: Record<string, unknown> | null;
  saved?: Record<string, unknown> | null;
  results?: Record<string, unknown> | null;
  issues?: string[];
  /** Saves the open form; resolves true when saved. */
  onSaveForm?: () => Promise<boolean>;
}

type Msg = { id: string; role: 'user' | 'assistant'; content: string; ppe_label?: string | null; error?: boolean; proposal_id?: string | null };

const OPEN_EVENT = 'ai-assistant:open';
export function openAssistant(prompt?: string) { window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { prompt } })); }

export function AssistantContextButton({ label, prompt }: { label: string; prompt: string }) {
  return <Button type="button" variant="outline" size="sm" onClick={() => openAssistant(prompt)}><Bot className="h-4 w-4 mr-2" />{label}</Button>;
}

export function AssistantPanel(p: AssistantPanelProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [scope, setScope] = useState<string>(p.currentPpeId ?? p.ppes[0]?.id ?? 'all');
  const [pending, setPending] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  const qc = useQueryClient();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { document.documentElement.classList.toggle('assistant-open', open); return () => document.documentElement.classList.remove('assistant-open'); }, [open]);
  useEffect(() => { if (p.currentPpeId) setScope(p.currentPpeId); }, [p.currentPpeId]);
  useEffect(() => {
    const h = (e: Event) => { setOpen(true); const prompt = (e as CustomEvent).detail?.prompt; if (prompt) setInput(prompt); };
    window.addEventListener(OPEN_EVENT, h); return () => window.removeEventListener(OPEN_EVENT, h);
  }, []);

  const history = useQuery({
    queryKey: ['ai-messages', p.groupId], enabled: open,
    queryFn: async () => {
      const { data: conv } = await supabase.from('ai_conversations').select('id').eq('analysis_group_id', p.groupId).maybeSingle();
      if (!conv) return [] as Msg[];
      const { data, error } = await supabase.from('ai_messages').select('id,role,content,ppe_label,proposal_id').eq('conversation_id', conv.id).order('created_at').limit(100);
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });
  const changes = useQuery({
    queryKey: ['ai-history', p.groupId], enabled: open,
    queryFn: async () => {
      const { data } = await (supabase as any).from('ai_applied_changes').select('id,analysis_id,fields,source,assumption,created_at,undone_at').eq('analysis_group_id', p.groupId).order('created_at', { ascending: false }).limit(20);
      return (data ?? []) as { id: string; analysis_id: string; fields: Record<string, { before: unknown; after: unknown }>; created_at: string; undone_at: string | null }[];
    },
  });
  const msgs = [...(history.data ?? []), ...pending];
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, pending]);

  const isAll = scope === 'all';
  const ppe = p.ppes.find(x => x.id === scope);
  const dirty = !isAll && scope === p.currentPpeId ? assistantDraftDiff(p.saved, p.draft) : [];

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true); setLastFailed(null); setInput('');
    const label = isAll ? 'Wszystkie PPE' : (ppe?.ppe_number || ppe?.name || 'PPE');
    const aId = crypto.randomUUID();
    setPending([{ id: crypto.randomUUID(), role: 'user', content: message, ppe_label: label }, { id: aId, role: 'assistant', content: '', ppe_label: label }]);
    try {
      const { data: s } = await supabase.auth.getSession();
      const ownPpe = !isAll && scope === p.currentPpeId;
      // Fresh calculator results for the exact rows the server will read (same engine as the UI).
      let q = supabase.from('energy_analyses').select('*').eq('analysis_group_id', p.groupId);
      if (!isAll) q = q.eq('id', scope);
      const { data: rows, error: rowsErr } = await q;
      if (rowsErr) throw new Error('Nie udało się odczytać danych PPE.');
      const results: Record<string, unknown> = {};
      for (const row of (rows ?? []) as Record<string, unknown>[]) {
        const id = row.id as string;
        results[id] = assistantResultSummary(row, calculateEnergyCosts(row as never), 'zapisane');
      }
      let facts = null;
      if (!isAll && p.invoiceImport && rows?.[0]) {
        try { facts = (await computeInvoiceFacts(p.groupId, rows[0] as Record<string, unknown>)).facts; } catch { facts = null; }
      }
      if (ownPpe && dirty.length && p.draft) {
        results[`${scope}__robocze`] = assistantResultSummary(p.draft, calculateEnergyCosts(p.draft as never), 'robocze');
      }
      const res = await fetch(`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/ai-assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ groupId: p.groupId, ppeId: isAll ? null : scope, scope: isAll ? 'all' : 'ppe', step: p.step, message,
          draft: ownPpe && dirty.length ? Object.fromEntries(dirty.map(k => [k, p.draft?.[k] ?? null])) : null, draftDirty: ownPpe && dirty.length > 0,
          results, issues: ownPpe ? p.issues : [], facts }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Asystent AI jest chwilowo niedostępny.');
      }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let acc = '';
      for (;;) { const { done, value } = await reader.read(); if (done) break; acc += dec.decode(value, { stream: true });
        setPending(prev => prev.map(m => m.id === aId ? { ...m, content: acc.split('[[BŁĄD]]')[0] } : m)); }
      if (acc.includes('[[BŁĄD]]')) throw new Error(acc.split('[[BŁĄD]]')[1].trim());
      // A chat command may have saved PO values: reload form, PPE card and summary from the database.
      await Promise.all(['ai-messages', 'ai-proposal', 'analysis', 'ai-group-ppes', 'group-ppe', 'analyses', 'ai-history', 'analysis-estimates', 'invoice-facts']
        .map(k => qc.invalidateQueries({ queryKey: [k] })));
      setPending([]);
    } catch (e) {
      setLastFailed(message);
      setPending(prev => prev.map(m => m.id === aId ? { ...m, content: (e as Error).message, error: true } : m));
    } finally { setBusy(false); }
  };

  if (!open) return null;
  return <aside className="fixed inset-0 sm:inset-auto sm:top-0 sm:right-0 sm:bottom-0 sm:w-[420px] z-50 bg-background border-l shadow-xl flex flex-col" aria-label="Asystent AI">
    <header className="p-4 border-b space-y-2">
      <div className="flex items-center justify-between"><h2 className="font-display font-semibold flex items-center gap-2"><Bot className="h-5 w-5 text-primary" />Asystent AI</h2>
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Zamknij asystenta"><X className="h-4 w-4" /></Button></div>
      <p className="text-xs text-muted-foreground">{p.clientName || 'Klient'} → {p.groupName || 'Analiza'} → {isAll ? 'Wszystkie PPE' : (ppe?.ppe_number || ppe?.name || 'PPE')}</p>
      <select className="w-full border rounded-md bg-background px-2 py-1 text-sm" value={scope} onChange={e => setScope(e.target.value)} aria-label="Zakres rozmowy">
        {p.ppes.map(x => <option key={x.id} value={x.id}>{x.ppe_number ? `PPE ${x.ppe_number}` : x.name}</option>)}
        {p.allowAll && p.ppes.length > 1 && <option value="all">Wszystkie PPE</option>}
      </select>
      {dirty.length > 0 && <p className="text-xs text-muted-foreground">Formularz ma niezapisane zmiany — asystent zobaczy je jako wersję roboczą. Nic nie zostanie zapisane bez Twojej zgody.</p>}
      {(changes.data?.length ?? 0) > 0 && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Historia zmian asystenta ({changes.data!.length})</summary>
        <ul className="mt-1 space-y-1 max-h-40 overflow-y-auto">{changes.data!.map(c => <li key={c.id} className="border-b pb-1">
          {new Date(c.created_at).toLocaleString('pl-PL')} · {p.ppes.find(x => x.id === c.analysis_id)?.ppe_number || p.ppes.find(x => x.id === c.analysis_id)?.name || 'PPE'}{c.undone_at ? ' · cofnięta' : ''}
          <span className="block text-muted-foreground">{Object.entries(c.fields).map(([f, v]) => `${fieldLabel(f)}: ${v.before ?? 'brak'} → ${v.after}`).join('; ')}</span></li>)}</ul></details>}
    </header>
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {history.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : history.error ? <p className="text-sm text-destructive">Nie udało się wczytać rozmowy.</p> :
        msgs.length === 0 && <p className="text-sm text-muted-foreground">Zapytaj o pola, źródła sum, braki danych lub różnice PRZED/PO. Możesz poprosić o wariant PO (np. inna cena energii) — zobaczysz podgląd i sam zdecydujesz o zastosowaniu.</p>}
      {msgs.map(m => <div key={m.id} className={m.role === 'user' ? 'ml-8 rounded-lg bg-primary/10 p-3' : `mr-4 rounded-lg p-3 ${m.error ? 'border border-destructive text-destructive' : 'bg-muted'}`}>
        {m.ppe_label && <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{m.ppe_label}</p>}
        {m.role === 'assistant' && !m.error && m.content
          ? <div className="text-sm break-words space-y-2 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_strong]:font-semibold [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold"><ReactMarkdown skipHtml>{m.content}</ReactMarkdown></div>
          : <p className="text-sm whitespace-pre-wrap break-words">{m.content || (busy ? '…' : '')}</p>}
        {m.proposal_id && <ProposalCard proposalId={m.proposal_id} dirtyFor={p.currentPpeId && assistantDraftDiff(p.saved, p.draft).length ? p.currentPpeId : null} onSaveForm={p.onSaveForm} />}
      </div>)}
      {lastFailed && !busy && <Button variant="outline" size="sm" onClick={() => send(lastFailed)}><RotateCcw className="h-4 w-4 mr-2" />Ponów</Button>}
      <div ref={endRef} />
    </div>
    <form className="p-4 border-t space-y-2" onSubmit={e => { e.preventDefault(); send(input); }}>
      <Textarea value={input} maxLength={AI_MAX_MESSAGE} onChange={e => setInput(e.target.value)} placeholder="Napisz pytanie…" rows={3}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} />
      <div className="flex justify-between items-center"><span className="text-xs text-muted-foreground">{input.length}/{AI_MAX_MESSAGE}</span>
        <Button type="submit" disabled={busy || !input.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}Wyślij</Button></div>
    </form>
  </aside>;
}
