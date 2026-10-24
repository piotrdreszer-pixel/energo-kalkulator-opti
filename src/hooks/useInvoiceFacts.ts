import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { InvoicePpeRecord } from '@/lib/invoice-import';
import { buildSettlement, type SettlementDoc, type SettlementItem } from '@/lib/invoice-settlement';
import { planConsumptionEstimate, planCostEstimate, planReplaceEstimates, type ActiveEstimate } from '@/lib/invoice-gaps';

const db = supabase as any;

/** Active (not undone/replaced) estimates of one PPE. */
export function useActiveEstimates(analysisId?: string | null) {
  return useQuery({
    queryKey: ['analysis-estimates', analysisId], enabled: !!analysisId,
    queryFn: async () => {
      const { data, error } = await db.from('analysis_estimates').select('id,field,period_from,period_to,value,base_value,unit,method,basis').eq('analysis_id', analysisId).eq('status', 'active').order('created_at');
      if (error) throw error;
      return (data ?? []) as (ActiveEstimate & { method: string; basis: unknown })[];
    },
  });
}

export async function loadGroupInvoices(groupId: string) {
  const { data: docs, error } = await supabase.from('analysis_documents')
    .select('id,file_name,status,doc_type,issuer,document_number,corrected_document_number,file_hash,created_at').eq('analysis_group_id', groupId);
  if (error) throw error;
  const ids = (docs || []).map(d => d.id);
  if (!ids.length) return { docs: [] as SettlementDoc[], records: [] as InvoicePpeRecord[], items: [] as SettlementItem[] };
  const [r, i] = await Promise.all([
    supabase.from('document_ppe_records').select('*').in('document_id', ids),
    supabase.from('document_line_items').select('id,document_id,ppe_record_id,name,quantity,unit,rate,net_value,category,page').in('document_id', ids),
  ]);
  if (r.error) throw r.error;
  if (i.error) throw i.error;
  return { docs: (docs || []) as SettlementDoc[], records: (r.data || []) as unknown as InvoicePpeRecord[], items: (i.data || []) as SettlementItem[] };
}

/** Period, gaps and app-computed plans for one PPE — computed fresh from approved invoices, never stored as totals. */
export async function computeInvoiceFacts(groupId: string, row: Record<string, unknown>) {
  const [inv, { data: est }] = await Promise.all([
    loadGroupInvoices(groupId),
    db.from('analysis_estimates').select('id,field,period_from,period_to,value,base_value,unit').eq('analysis_id', row.id).eq('status', 'active'),
  ]);
  const s = buildSettlement({ ppeNumber: String(row.ppe_number || ''), analysisId: row.id as string, ...inv });
  const active = (est ?? []) as ActiveEstimate[];
  const gap = s.gaps[0] ?? null;
  const plans: Record<string, ReturnType<typeof planReplaceEstimates>> = {};
  if (gap) { plans.consumption = planConsumptionEstimate(row, s, gap); plans.costs = planCostEstimate(row, s, gap); }
  if (active.length) plans.replace = planReplaceEstimates(row, s, active);
  return {
    settlement: s,
    facts: {
      period: s.proposedPeriod, gaps: s.gaps, gap, plans,
      active_estimates: active.map(a => ({ id: a.id, pole: a.field, od: a.period_from, do: a.period_to, wartosc: a.value, jednostka: a.unit })),
      issues: [...s.issues, ...s.blocked].slice(0, 30),
    },
  };
}

export function useInvoiceFacts(groupId: string | null | undefined, row: Record<string, unknown> | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['invoice-facts', groupId, row?.id, row?.updated_at], enabled: enabled && !!groupId && !!row?.id,
    queryFn: () => computeInvoiceFacts(groupId!, row!),
  });
}
