import { settlementPlan, type SettlementSnapshot } from './settlement-plan.ts';
import { calculateEnergyCosts, formatCurrency, formatPercent } from './calculation-utils.ts';
import { INCOMPLETE_PO_MESSAGE } from './po-completeness.ts';
import { matchesStored } from './invoice-settlement.ts';

export async function readSettlement(admin: any, userId: string, analysisId: string): Promise<SettlementSnapshot> {
  const {data,error} = await admin.rpc('invoice_summary_snapshot',{_actor:userId,_analysis_id:analysisId});
  if(error || !data) throw new Error(error?.message || 'Nie udało się odczytać podsumowania.');
  return data;
}
export async function applySettlement(admin:any,userId:string,analysisId:string,token:string,requestId:string,replaceManual:string[]=[],command:string='Zastosuj podsumowanie do PRZED') {
  const snapshot = await readSettlement(admin,userId,analysisId);
  const plan = settlementPlan(snapshot,replaceManual);
  // Retry is handled inside the transaction, even if the first write changed the token.
  const {data:previous} = await admin.from('invoice_summary_changes').select('id').eq('request_id',requestId).eq('user_id',userId).eq('analysis_id',analysisId).is('undone_at',null).maybeSingle();
  if (!previous && snapshot.token !== token) return {status:'stale',message:'Podsumowanie zmieniło się od wyświetlenia. Odśwież je i zatwierdź ponownie. Nic nie zapisano.'};
  if (!previous && plan.conflicts.length) return {status:'conflict',conflicts:plan.conflicts,message:'Ręczne korekty wymagają osobnej decyzji. Nic nie zapisano.'};
  const {data,error}=await admin.rpc('invoice_summary_commit',{_actor:userId,_analysis_id:analysisId,_token:token,_request_id:requestId,
    _changes:plan.changes,_sources:plan.sources,_replace:plan.replaced,_command:command,_manual:replaceManual});
  if(error) throw new Error(error.message);
  if(!['applied','already_applied','unchanged'].includes(data.status)) return data;
  const confirmed=await readSettlement(admin,userId,analysisId);
  const fields=data.fields || {};
  for(const [field,value] of Object.entries(fields) as [string,any][]) {
    if(!matchesStored(field,value.after,confirmed.row[field]) || JSON.stringify(confirmed.row.value_sources?.[field]) !== JSON.stringify(value.source_after)) {
      return {...data,message:'Operacja została zapisana, ale dane zmieniły się przed potwierdzeniem. Odśwież analizę; nie podaję niepotwierdzonych wyników.'};
    }
  }
  let result;
  try { result=calculateEnergyCosts(confirmed.row); }
  catch { return {...data,row:confirmed.row,message:'Potwierdzono zapis danych PRZED. Nie udało się przeliczyć wyniku; wariant PO bez zmian.'}; }
  const labels=Object.fromEntries(plan.rows.map(r=>[r.field,r.label]));
  const description=Object.entries(fields).map(([f,v]:[string,any])=>`${labels[f] || f}: ${Number(v.after).toLocaleString('pl-PL',{maximumFractionDigits:4})}`).join('; ');
  const message=(data.status==='unchanged'?'Podsumowanie już odpowiada zapisanym wartościom.':`Zastosowano i potwierdzono odczytem: ${description}.`)+
    ` Wariant PO bez zmian.\n\nAktualny wynik (${confirmed.row.period_from} – ${confirmed.row.period_to}): PRZED **${formatCurrency(result.totalCostBefore)}**, PO **${formatCurrency(result.totalCostAfter)}**. `+
    (result.savingsAvailable?`Oszczędność **${formatCurrency(result.savingsValue)}** (${formatPercent(result.savingsPercent)}).`:INCOMPLETE_PO_MESSAGE)+
    (plan.settlement.issues.length?`\n\nZestawienie niepełne: ${plan.settlement.issues.join(' ')}`:'');
  return {...data,row:confirmed.row,result,message};
}