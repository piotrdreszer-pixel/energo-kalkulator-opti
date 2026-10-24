import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { readSettlement, applySettlement } from '../_shared/settlement-service.ts';
import { settlementPlan } from '../_shared/settlement-plan.ts';

const schema=z.object({analysisId:z.string().uuid(),action:z.enum(['preview','apply']),token:z.string().max(64).optional(),requestId:z.string().uuid().optional(),replaceManual:z.array(z.string().max(80)).max(9).default([])});
const json=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST')return json(405,{error:'Metoda niedozwolona'});
  try {
    const auth=req.headers.get('Authorization');if(!auth?.startsWith('Bearer '))return json(401,{error:'Brak autoryzacji'});
    const url=Deno.env.get('SUPABASE_URL');const anon=Deno.env.get('SUPABASE_ANON_KEY');const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url||!anon||!key)return json(500,{error:'Usługa nie jest dostępna'});
    const client=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const {data:u,error}=await client.auth.getUser(auth.slice(7));if(error||!u.user)return json(401,{error:'Brak autoryzacji'});
    const parsed=schema.safeParse(await req.json());if(!parsed.success)return json(400,{error:'Nieprawidłowe dane'});
    const b=parsed.data;const admin=createClient(url,key);
    if(b.action==='preview') {const snapshot=await readSettlement(admin,u.user.id,b.analysisId);return json(200,{token:snapshot.token,...settlementPlan(snapshot)});}
    if(!b.token||!b.requestId)return json(400,{error:'Brak zatwierdzonego podglądu'});
    return json(200,await applySettlement(admin,u.user.id,b.analysisId,b.token,b.requestId,b.replaceManual));
  }catch(e){return json(400,{error:e instanceof Error?e.message:'Operacja nie powiodła się'});}
});