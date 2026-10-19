import React, { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { deleteClientObject } from '@/lib/delete-client-object';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  ArrowLeft,
  Plus,
  Loader2,
  Building2,
  MapPin,
  FileText,
  Calendar,
  TrendingDown,
  Trash2,
  Printer,
  Edit,
} from 'lucide-react';
import type { AnalysisGroup, ClientProject, EnergyAnalysis, ProjectStatus } from '@/types/database';
import { formatCurrency, formatPercent } from '@/lib/calculation-utils';
import { summarizeGroupCard } from '@/lib/project-totals';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

const STATUS_LABELS: Record<ProjectStatus, string> = {
  'roboczy': 'Roboczy',
  'wysłany klientowi': 'Wysłany klientowi',
  'zaakceptowany': 'Zaakceptowany',
};

const STATUS_VARIANTS: Record<ProjectStatus, 'default' | 'secondary' | 'outline'> = {
  'roboczy': 'secondary',
  'wysłany klientowi': 'outline',
  'zaakceptowany': 'default',
};

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle();

      if (error) throw error;
      return data as ClientProject | null;
    },
    enabled: !!projectId,
  });

  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ['analysis-groups', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('analysis_groups')
        .select('*')
        .eq('client_project_id', projectId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as AnalysisGroup[];
    },
    enabled: !!projectId,
  });

  const { data: analyses, isLoading: analysesLoading } = useQuery({
    queryKey: ['analyses', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('energy_analyses')
        .select('*')
        .eq('client_project_id', projectId!);
      if (error) throw error;
      return (data || []) as EnergyAnalysis[];
    },
    enabled: !!projectId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: ProjectStatus) => {
      const { error } = await supabase
        .from('client_projects')
        .update({ status })
        .eq('id', projectId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast({ title: 'Status projektu zaktualizowany' });
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Błąd', description: 'Nie udało się zaktualizować statusu' });
    },
  });

  const creatingRef = React.useRef(false);
  const createGroupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('analysis_groups')
        .insert({ client_project_id: projectId!, name: `Analiza ${(groups?.length || 0) + 1}` })
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['analysis-groups', projectId] });
      navigate(`/projects/${projectId}/analyses/${data.id}`);
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Błąd', description: 'Nie udało się utworzyć analizy' });
    },
    onSettled: () => { creatingRef.current = false; },
  });
  const createGroup = () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    createGroupMutation.mutate();
  };

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      await deleteClientObject('group', groupId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysis-groups', projectId] });
      queryClient.invalidateQueries({ queryKey: ['analyses', projectId] });
      toast({ title: 'Analiza została usunięta' });
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Błąd', description: 'Nie udało się usunąć analizy' });
    },
  });

  const ppeByGroup = (groupId: string) => (analyses || []).filter((a) => a.analysis_group_id === groupId);

  if (projectLoading || analysesLoading || groupsLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="content-container text-center py-20">
          <h2 className="text-xl font-semibold mb-2">Projekt nie znaleziony</h2>
          <p className="text-muted-foreground mb-4">Ten projekt nie istnieje lub został usunięty.</p>
          <Button asChild>
            <Link to="/projects">Wróć do projektów</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="content-container">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" asChild>
            <Link to={project.created_by_user_id ? `/projects?user=${project.created_by_user_id}` : '/projects'}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">
              {project.client_name}
            </h1>
            <p className="text-muted-foreground">Szczegóły projektu i analizy</p>
          </div>
        </div>

        {/* Project Info Card */}
        <Card className="mb-6">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="font-display">Dane klienta</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Select
                  value={project.status}
                  onValueChange={(value) => updateStatusMutation.mutate(value as ProjectStatus)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="roboczy">Roboczy</SelectItem>
                    <SelectItem value="wysłany klientowi">Wysłany klientowi</SelectItem>
                    <SelectItem value="zaakceptowany">Zaakceptowany</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-start gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">NIP</p>
                <p className="font-medium">{project.client_nip}</p>
              </div>
            </div>
            {project.client_address && (
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Adres</p>
                  <p className="font-medium">{project.client_address}</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Data utworzenia</p>
                <p className="font-medium">
                  {format(new Date(project.created_at), 'd MMMM yyyy', { locale: pl })}
                </p>
              </div>
            </div>
            {project.description && (
              <div className="flex items-start gap-3 sm:col-span-2 lg:col-span-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Opis / notatki</p>
                  <p className="font-medium">{project.description}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Analyses Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-display font-semibold">Analizy oszczędności</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Każda analiza ma własną listę PPE, wynik zbiorczy i raport. Analizy nie są ze sobą sumowane.
            </p>
          </div>
          <Button onClick={createGroup} disabled={createGroupMutation.isPending}>
            {createGroupMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Nowa analiza
          </Button>
        </div>

        {groups?.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <TrendingDown className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Brak analiz</h3>
              <p className="text-muted-foreground mb-4">
                Utwórz pierwszą analizę oszczędności dla tego klienta.
              </p>
              <Button onClick={createGroup} disabled={createGroupMutation.isPending}>
                <Plus className="mr-2 h-4 w-4" />
                Nowa analiza
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {groups?.map((g) => {
              const items = ppeByGroup(g.id);
              const chosen = items.filter((a) => a.include_in_project_report);
              const summary = summarizeGroupCard(items);
              return (
                <Card key={g.id} className="card-interactive">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg mb-1 break-words">{g.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          Liczba PPE: {items.length}
                          {items.length > 0 && <> • wybrane do raportu: {chosen.length}</>}
                          {' • '}utworzono {format(new Date(g.created_at), 'd MMM yyyy', { locale: pl })}
                        </p>
                      </div>
                      {summary.kind === 'result' ? (
                        <div className="w-full lg:w-auto">
                          <p className="text-xs text-muted-foreground mb-2 text-center lg:text-right">{summary.label}</p>
                          <div className="grid grid-cols-3 gap-2 sm:gap-4 lg:gap-6 text-center">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">PRZED</p>
                              <p className="font-semibold text-sm sm:text-base">{formatCurrency(summary.totals.totalBefore)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">PO</p>
                              <p className="font-semibold text-sm sm:text-base">{formatCurrency(summary.totals.totalAfter)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">OSZCZĘDNOŚĆ</p>
                              <p className={`font-bold text-sm sm:text-base ${summary.totals.savingsValue > 0 ? 'text-success' : summary.totals.savingsValue < 0 ? 'text-destructive' : ''}`}>
                                {formatCurrency(summary.totals.savingsValue)}
                                <span className="text-xs ml-1 block sm:inline">
                                  ({summary.totals.savingsPercent === null ? 'nie dotyczy' : formatPercent(summary.totals.savingsPercent)})
                                </span>
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground lg:text-right">{summary.message}</p>
                      )}
                      <div className="flex items-center gap-2 lg:ml-4">
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/projects/${projectId}/analyses/${g.id}`}>
                            <Edit className="h-4 w-4 mr-1" />
                            Otwórz
                          </Link>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label="Usuń analizę">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Usuń analizę</AlertDialogTitle>
                              <AlertDialogDescription>
                                Usunięcie analizy usunie też wszystkie jej PPE ({items.length}). Tej operacji nie można cofnąć.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Anuluj</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteGroupMutation.mutate(g.id)}
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
