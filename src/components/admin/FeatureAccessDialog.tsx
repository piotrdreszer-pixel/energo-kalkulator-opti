import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Settings2 } from 'lucide-react';
import { toast } from 'sonner';

export default function FeatureAccessDialog({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ invoice_import: false, multi_ppe: false, ai_assistant: false });
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['admin-feature-access', userId], enabled: open, staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('user_feature_access').select('invoice_import,multi_ppe,ai_assistant').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      const current = { invoice_import: data?.invoice_import === true, multi_ppe: data?.multi_ppe === true, ai_assistant: data?.ai_assistant === true };
      setValues(current);
      return current;
    },
  });
  const save = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.from('user_feature_access').upsert({ user_id: userId, ...values }).select('invoice_import,multi_ppe,ai_assistant').single();
      if (error) throw error;
      if (data.invoice_import !== values.invoice_import || data.multi_ppe !== values.multi_ppe || data.ai_assistant !== values.ai_assistant) throw new Error('Nie udało się potwierdzić zapisu');
      await client.invalidateQueries({ queryKey: ['feature-access'] });
      await client.invalidateQueries({ queryKey: ['admin-feature-access', userId] });
      toast.success('Zapisano dostęp do funkcji');
      setOpen(false);
    } catch { toast.error('Nie udało się zapisać dostępu do funkcji. Spróbuj ponownie.'); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline" size="icon" aria-label={`Edytuj użytkownika ${name}`} title="Edytuj użytkownika"><Settings2 className="h-4 w-4" /></Button></DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>Edytuj użytkownika</DialogTitle><DialogDescription>{name}</DialogDescription></DialogHeader>
      <h3 className="font-semibold">Dostęp do funkcji</h3>
      {query.isFetching ? <p>Wczytywanie uprawnień…</p> : query.error ? <p className="text-destructive">Nie udało się wczytać uprawnień.</p> : <div className="space-y-5">
        <div className="flex items-start justify-between gap-4"><div><Label htmlFor={`invoice-${userId}`}>Import faktur</Label><p className="text-sm text-muted-foreground">Pozwala wgrywać faktury, odczytywać je przez AI i stosować dane z dokumentów w kalkulatorze</p></div><Switch id={`invoice-${userId}`} checked={values.invoice_import} disabled={busy} onCheckedChange={v => setValues(p => ({ ...p, invoice_import: v }))} /></div>
        <div className="flex items-start justify-between gap-4"><div><Label htmlFor={`multi-${userId}`}>Analizy wielu PPE</Label><p className="text-sm text-muted-foreground">Pozwala dodawać więcej niż jeden PPE do jednej analizy oraz wykonywać obliczenia i raporty zbiorcze</p></div><Switch id={`multi-${userId}`} checked={values.multi_ppe} disabled={busy} onCheckedChange={v => setValues(p => ({ ...p, multi_ppe: v }))} /></div>
        <div className="flex items-start justify-between gap-4"><div><Label htmlFor={`ai-${userId}`}>Asystent AI</Label><p className="text-sm text-muted-foreground">Pozwala rozmawiać z asystentem o danych analizy, źródłach sum i brakach danych</p></div><Switch id={`ai-${userId}`} checked={values.ai_assistant} disabled={busy} onCheckedChange={v => setValues(p => ({ ...p, ai_assistant: v }))} /></div>
      </div>}
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Anuluj</Button><Button onClick={save} disabled={busy || query.isFetching || !!query.error || !query.data}>{busy ? 'Zapisywanie…' : 'Zapisz'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}