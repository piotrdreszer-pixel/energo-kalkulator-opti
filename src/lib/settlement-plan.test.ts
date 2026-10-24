import { describe,it,expect } from 'vitest';
import { settlementPlan,intervalCovered,type SettlementSnapshot } from '../../supabase/functions/_shared/settlement-plan';
const fixture=():SettlementSnapshot=>({token:'t',row:{id:'a',ppe_number:'PL1',value_sources:{},consumption_before_zone1_mwh:0,capacity_charge_before:0},
 docs:[{id:'d',file_name:'lipiec.pdf',status:'approved',doc_type:'kompleksowa',document_number:'1',issuer:'X'}],
 records:[{id:'r',document_id:'d',ppe_number:'PL1',matched_analysis_id:'a',tariff_code:'C11',period_from:'2026-07-01',period_to:'2026-07-31',consumption:[{zone_name:'całodobowa',value:3100,unit:'kWh'}],review_state:{lineSelected:['i']}}],
 items:[{id:'i',document_id:'d',ppe_record_id:'r',name:'Opłata mocowa',net_value:310,category:'mocowa'}],estimates:[]});
describe('server settlement application',()=>{
 it('applies 3.1 MWh and 310 zł to PRZED only',()=>{const p=settlementPlan(fixture());expect(p.changes).toEqual([{field:'consumption_before_zone1_mwh',value:3.1},{field:'capacity_charge_before',value:310}]);});
 it('unapproved document does not contribute',()=>{const s=fixture();s.docs[0].status='needs_review';expect(settlementPlan(s).changes).toEqual([]);});
 it('unselected cost does not contribute',()=>{const s=fixture();s.records[0].review_state.lineSelected=[];expect(settlementPlan(s).changes.some(c=>c.field==='capacity_charge_before')).toBe(false);});
 it('manual zero is protected unless this field was approved',()=>{const s=fixture();s.row.value_sources={capacity_charge_before:{source:'manual'}};expect(settlementPlan(s).conflicts.map(c=>c.field)).toEqual(['capacity_charge_before']);expect(settlementPlan(s,['capacity_charge_before']).conflicts).toEqual([]);});
 it('retry recomputes same totals, never adds them to current row',()=>{const s=fixture();s.row.consumption_before_zone1_mwh=3.1;s.row.capacity_charge_before=310;expect(settlementPlan(s).changes).toEqual([]);});
 it('accepted August estimate remains separate and sums once',()=>{const s=fixture();s.estimates=[{id:'e',field:'consumption_before_zone1_mwh',period_from:'2026-08-01',period_to:'2026-08-31',value:3.1}];expect(settlementPlan(s).rows[0].value).toBe(6.2);expect(settlementPlan(s).replaced).toEqual([]);});
 it('invoice covering estimate replaces it, never adds twice',()=>{const s=fixture();s.estimates=[{id:'e',field:'consumption_before_zone1_mwh',period_from:'2026-07-01',period_to:'2026-07-31',value:3.1}];expect(settlementPlan(s).rows[0].value).toBe(3.1);expect(settlementPlan(s).replaced).toEqual(['e']);});
 it('actual date gaps are not hidden by monthly document presence',()=>{expect(intervalCovered({from:'2026-07-01',to:'2026-08-31'},[{from:'2026-07-01',to:'2026-07-30'},{from:'2026-08-01',to:'2026-08-31'}])).toBe(false);});
 it('adjacent intervals together cover a replacement',()=>{expect(intervalCovered({from:'2026-07-01',to:'2026-07-31'},[{from:'2026-07-01',to:'2026-07-15'},{from:'2026-07-16',to:'2026-07-31'}])).toBe(true);});
});