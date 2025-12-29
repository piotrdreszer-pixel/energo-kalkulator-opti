import React, { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
import type { ClientProject, EnergyAnalysis, ProjectStatus } from '@/types/database';
import { calculateEnergyCosts, formatCurrency, formatPercent } from '@/lib/calculation-utils';
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

  const { data: analyses, isLoading: analysesLoading } = useQuery({
    queryKey: ['analyses', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('energy_analyses')
        .select('*')
        .eq('client_project_id', projectId)
        .order('created_at', { ascending: false });

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
        .eq('id', projectId);
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

  const createAnalysisMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('energy_analyses')
        .insert({
          client_project_id: projectId,
          name: `Analiza ${(analyses?.length || 0) + 1}`,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      navigate(`/projects/${projectId}/analysis/${data.id}`);
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Błąd', description: 'Nie udało się utworzyć analizy' });
    },
  });

  const deleteAnalysisMutation = useMutation({
    mutationFn: async (analysisId: string) => {
      const { error } = await supabase
        .from('energy_analyses')
        .delete()
        .eq('id', analysisId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analyses', projectId] });
      toast({ title: 'Analiza została usunięta' });
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Błąd', description: 'Nie udało się usunąć analizy' });
    },
  });

  if (projectLoading || analysesLoading) {
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
            <Link to="/projects">
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
          <h2 className="text-xl font-display font-semibold">Analizy oszczędności</h2>
          <Button 
            onClick={() => createAnalysisMutation.mutate()}
            disabled={createAnalysisMutation.isPending}
          >
            {createAnalysisMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Nowa analiza
          </Button>
        </div>

        {analyses?.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <TrendingDown className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Brak analiz</h3>
              <p className="text-muted-foreground mb-4">
                Utwórz pierwszą analizę oszczędności dla tego klienta.
              </p>
              <Button onClick={() => createAnalysisMutation.mutate()}>
                <Plus className="mr-2 h-4 w-4" />
                Utwórz analizę
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {analyses?.map((analysis) => {
              const results = calculateEnergyCosts(analysis);
              return (
                <Card key={analysis.id} className="card-interactive">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg mb-1">{analysis.name}</h3>
                        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                          {analysis.period_from && analysis.period_to && (
                            <span>
                              Okres: {format(new Date(analysis.period_from), 'd MMM yyyy', { locale: pl })} - {format(new Date(analysis.period_to), 'd MMM yyyy', { locale: pl })}
                            </span>
                          )}
                          <span>•</span>
                          <span>Taryfa: {analysis.tariff_code_before} → {analysis.tariff_code_after}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 lg:gap-6 text-center">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">PRZED</p>
                          <p className="font-semibold">{formatCurrency(results.totalCostBefore)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">PO</p>
                          <p className="font-semibold">{formatCurrency(results.totalCostAfter)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">OSZCZĘDNOŚĆ</p>
                          <p className={`font-bold ${results.savingsValue > 0 ? 'text-success' : results.savingsValue < 0 ? 'text-destructive' : ''}`}>
                            {formatCurrency(results.savingsValue)}
                            <span className="text-xs ml-1">({formatPercent(results.savingsPercent)})</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 lg:ml-4">
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/projects/${projectId}/analysis/${analysis.id}`}>
                            <Edit className="h-4 w-4 mr-1" />
                            Edytuj
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/projects/${projectId}/analysis/${analysis.id}/report`}>
                            <Printer className="h-4 w-4 mr-1" />
                            Raport
                          </Link>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Usuń analizę</AlertDialogTitle>
                              <AlertDialogDescription>
                                Czy na pewno chcesz usunąć tę analizę? Tej operacji nie można cofnąć.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Anuluj</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteAnalysisMutation.mutate(analysis.id)}
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
