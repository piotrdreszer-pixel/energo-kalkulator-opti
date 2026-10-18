import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Loader2, TrendingDown, Trash2, Printer, Edit } from 'lucide-react';
import type { AnalysisGroup, ClientProject, EnergyAnalysis } from '@/types/database';
import { calculateEnergyCosts, formatCurrency, formatPercent } from '@/lib/calculation-utils';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import ProjectAggregatePanel from '@/components/project/ProjectAggregatePanel';
import ImportInvoicesDialog from '@/components/analysis/ImportInvoicesDialog';

export default function AnalysisGroupDetail() {
  const { projectId, groupId } = useParams<{ projectId: string; groupId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const creatingRef = useRef(false);

  const { data: project, isLoading: l1 } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_projects').select('*').eq('id', projectId!).maybeSingle();
      if (error) throw error;
      return data as ClientProject | null;
    },
    enabled: !!projectId,
  });

  const { data: group, isLoading: l2 } = useQuery({
    queryKey: ['analysis-group', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('analysis_groups')
        .select('*')
        .eq('id', groupId!)
        .eq('client_project_id', projectId!)
        .maybeSingle();
      if (error) throw error;
      return data as AnalysisGroup | null;
    },
    enabled: !!projectId && !!groupId,
  });

  const { data: ppes, isLoading: l3 } = useQuery({
    queryKey: ['group-ppe', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('energy_analyses')
        .select('*')
        .eq('client_project_id', projectId!)
        .eq('analysis_group_id', groupId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as EnergyAnalysis[];
    },
    enabled: !!projectId && !!groupId,
  });

  const [name, setName] = useState('');
  useEffect(() => { if (group) setName(group.name); }, [group]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['group-ppe', groupId] });
    queryClient.invalidateQueries({ queryKey: ['analysis-groups', projectId] });
    queryClient.invalidateQueries({ queryKey: ['analyses', projectId] });
  };

  const renameMutation = useMutation({
    mutationFn: async (newName: string) => {
      const { error } = await supabase.from('analysis_groups').update({ name: newName }).eq('id', groupId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysis-group', groupId] });
      queryClient.invalidateQueries({ queryKey: ['analysis-groups', projectId] });
    },
    onError: () => toast({ variant: 'destructive', title: 'Błąd', description: 'Nie udało się zmienić nazwy analizy' }),
  });

  const addPpeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('energy_analyses')
        .insert({ client_project_id: projectId!, analysis_group_id: groupId!, name: `PPE ${(ppes?.length || 0) + 1}` })
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      invalidate();
      navigate(`/projects/${projectId}/analysis/${data.id}`);
    },
    onError: () => toast({ variant: 'destructive', title: 'Błąd', description: 'Nie udało się dodać PPE' }),
    onSettled: () => { creatingRef.current = false; },
  });
  const addPpe = () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    addPpeMutation.mutate();
  };

  const deletePpeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('energy_analyses').delete().eq('id', id).eq('analysis_group_id', groupId!);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: 'PPE zostało usunięte' }); },
    onError: () => toast({ variant: 'destructive', title: 'Błąd', description: 'Nie udało się usunąć PPE' }),
  });

  const toggleIncludeMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from('energy_analyses')
        .update({ include_in_project_report: value })
        .eq('id', id)
        .eq('analysis_group_id', groupId!);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => toast({ variant: 'destructive', title: 'Błąd', description: 'Nie udało się zapisać wyboru' }),
  });

  if (l1 || l2 || l3) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!project || !group) {
    return (
      <AppLayout>
        <div className="content-container text-center py-20">
          <h2 className="text-xl font-semibold mb-2">Analiza nie znaleziona</h2>
          <p className="text-muted-foreground mb-4">Ta analiza nie istnieje lub nie masz do niej dostępu.</p>
          <Button asChild>
            <Link to={projectId ? `/projects/${projectId}` : '/projects'}>Wróć do listy analiz</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const selected = (ppes || []).filter((a) => a.include_in_project_report);
  const commitName = () => {
    const n = name.trim();
    if (!n) { setName(group.name); return; }
    if (n !== group.name) renameMutation.mutate(n);
  };

  return (
    <AppLayout>
      <div className="content-container">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" asChild aria-label="Wróć do listy analiz klienta">
            <Link to={`/projects/${projectId}`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground">
              <Link to={`/projects/${projectId}`} className="hover:underline">{project.client_name}</Link> › Analiza
            </p>
            <Input
              aria-label="Nazwa analizy"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="text-2xl font-display font-bold h-auto py-1 px-2 -ml-2 border-transparent hover:border-input focus:border-input"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-display font-semibold">Punkty poboru (PPE)</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Dodaj każdy punkt poboru tej analizy. Zaznacz punkty, które chcesz uwzględnić w raporcie analizy.
            </p>
          </div>
          <div className="flex gap-2">
            <ImportInvoicesDialog projectId={projectId!} groupId={groupId!} ppes={ppes || []} onApplied={invalidate} />
            <Button onClick={addPpe} disabled={addPpeMutation.isPending}>
              {addPpeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Dodaj PPE
            </Button>
          </div>
        </div>

        {selected.length > 0 && (
          <ProjectAggregatePanel
            scopeId={groupId!}
            reportPath={`/projects/${projectId}/analyses/${groupId}/report`}
            analyses={selected}
          />
        )}

        {ppes?.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <TrendingDown className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Brak punktów poboru</h3>
              <p className="text-muted-foreground mb-4">Dodaj pierwszy punkt poboru (PPE) do tej analizy.</p>
              <Button onClick={addPpe} disabled={addPpeMutation.isPending}>
                <Plus className="mr-2 h-4 w-4" />
                Dodaj PPE
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {ppes?.map((a) => {
              const r = calculateEnergyCosts(a);
              return (
                <Card key={a.id} className="card-interactive">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg mb-1 break-words">{a.name}</h3>
                        {(a.ppe_number || a.ppe_address) && (
                          <p className="text-sm text-muted-foreground break-words mb-1">
                            {a.ppe_number && <>PPE: <span className="font-medium text-foreground">{a.ppe_number}</span></>}
                            {a.ppe_number && a.ppe_address && ' • '}
                            {a.ppe_address}
                          </p>
                        )}
                        <label className="flex items-center gap-2 text-sm mb-1 cursor-pointer">
                          <Checkbox
                            checked={!!a.include_in_project_report}
                            onCheckedChange={(v) => toggleIncludeMutation.mutate({ id: a.id, value: v === true })}
                          />
                          Uwzględnij w raporcie analizy
                        </label>
                        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                          {a.period_from && a.period_to && (
                            <span>
                              Okres: {format(new Date(a.period_from), 'd MMM yyyy', { locale: pl })} - {format(new Date(a.period_to), 'd MMM yyyy', { locale: pl })}
                            </span>
                          )}
                          <span>•</span>
                          <span>Taryfa: {a.tariff_code_before} → {a.tariff_code_after}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 lg:gap-6 text-center">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">PRZED</p>
                          <p className="font-semibold">{formatCurrency(r.totalCostBefore)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">PO</p>
                          <p className="font-semibold">{formatCurrency(r.totalCostAfter)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">OSZCZĘDNOŚĆ</p>
                          <p className={`font-bold ${r.savingsValue > 0 ? 'text-success' : r.savingsValue < 0 ? 'text-destructive' : ''}`}>
                            {formatCurrency(r.savingsValue)}
                            <span className="text-xs ml-1">({formatPercent(r.savingsPercent)})</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 lg:ml-4">
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/projects/${projectId}/analysis/${a.id}`}>
                            <Edit className="h-4 w-4 mr-1" />
                            Edytuj
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/projects/${projectId}/analysis/${a.id}/report`}>
                            <Printer className="h-4 w-4 mr-1" />
                            Raport PPE
                          </Link>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label="Usuń PPE">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Usuń PPE</AlertDialogTitle>
                              <AlertDialogDescription>
                                Czy na pewno chcesz usunąć ten punkt z analizy? Tej operacji nie można cofnąć.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Anuluj</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deletePpeMutation.mutate(a.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Usuń
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
