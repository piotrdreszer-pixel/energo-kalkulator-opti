import React, { useState, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useUserRoles } from '@/hooks/useUserRoles';
import { ArrowLeft, User as UserIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  Plus,
  Search,
  Building2,
  Calendar,
  Loader2,
  FolderOpen,
  Trash2,
  Users,
} from 'lucide-react';
import type { ClientProject, ProjectStatus } from '@/types/database';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { NipLookupField } from '@/components/company/NipLookupField';
import { CompanyData } from '@/hooks/useCompanyLookup';

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

export default function Projects() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<ClientProject | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [newProject, setNewProject] = useState({
    client_name: '',
    client_nip: '',
    client_address: '',
    description: '',
    regon: '',
    krs: '',
    status_company: '',
    pkd_main: '',
  });

  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin, isManager, loading: rolesLoading } = useUserRoles();
  const showUserGrouping = isAdmin || isManager;
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedUserId = searchParams.get('user');

  const { data: projects, isLoading, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_projects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      
      return (data || []) as ClientProject[];
    },
  });

  // Fetch creator profiles for admin/manager grouping
  const { data: creatorProfiles } = useQuery({
    queryKey: ['projects-creator-profiles', showUserGrouping],
    enabled: showUserGrouping,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, name, email');
      if (error) throw error;
      return data as { user_id: string; name: string; email: string }[];
    },
  });

  const profileMap = useMemo(
    () => new Map((creatorProfiles || []).map(p => [p.user_id, p])),
    [creatorProfiles]
  );

  // Group projects by creator
  const userGroups = useMemo(() => {
    if (!projects) return [];
    const groups = new Map<string, { user_id: string; name: string; email: string; count: number; lastUpdate: string }>();
    for (const p of projects) {
      const uid = p.created_by_user_id || 'unknown';
      const profile = profileMap.get(uid);
      const existing = groups.get(uid);
      if (existing) {
        existing.count += 1;
        if (p.updated_at > existing.lastUpdate) existing.lastUpdate = p.updated_at;
      } else {
        groups.set(uid, {
          user_id: uid,
          name: profile?.name || 'Nieznany użytkownik',
          email: profile?.email || '',
          count: 1,
          lastUpdate: p.updated_at,
        });
      }
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, profileMap]);

  const showingUserList = showUserGrouping && !selectedUserId;

  const filteredProjects = projects?.filter((project) => {
    if (showUserGrouping && selectedUserId) {
      if ((project.created_by_user_id || 'unknown') !== selectedUserId) return false;
    }
    const query = searchQuery.toLowerCase();
    return (
      project.client_name.toLowerCase().includes(query) ||
      project.client_nip.toLowerCase().includes(query)
    );
  });

  const filteredUserGroups = userGroups.filter(g => {
    const q = searchQuery.toLowerCase();
    return !q || g.name.toLowerCase().includes(q) || g.email.toLowerCase().includes(q);
  });

  const handleCreateProject = async () => {
    if (!newProject.client_name.trim() || !newProject.client_nip.trim()) {
      toast({
        variant: 'destructive',
        title: 'Błąd',
        description: 'Nazwa klienta i NIP są wymagane.',
      });
      return;
    }

    setIsCreating(true);

    try {
      const { error } = await supabase.from('client_projects').insert({
        client_name: newProject.client_name.trim(),
        client_nip: newProject.client_nip.trim(),
        client_address: newProject.client_address.trim() || null,
        description: newProject.description.trim() || null,
        created_by_user_id: user?.id,
        status: 'roboczy' as ProjectStatus,
      });

      if (error) throw error;

      toast({
        title: 'Sukces',
        description: 'Projekt został utworzony.',
      });

      setNewProject({ 
        client_name: '', 
        client_nip: '', 
        client_address: '', 
        description: '',
        regon: '',
        krs: '',
        status_company: '',
        pkd_main: '',
      });
      setIsCreateDialogOpen(false);
      refetch();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Błąd',
        description: 'Nie udało się utworzyć projektu.',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('client_projects')
        .delete()
        .eq('id', projectToDelete.id);

      if (error) throw error;

      toast({
        title: 'Sukces',
        description: 'Projekt został usunięty.',
      });

      setProjectToDelete(null);
      refetch();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Błąd',
        description: 'Nie udało się usunąć projektu.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AppLayout>
      <div className="content-container">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">
              Projekty
            </h1>
            <p className="text-muted-foreground mt-1">
              Zarządzaj projektami klientów i analizami oszczędności
            </p>
          </div>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="hero" size="lg">
                <Plus className="h-5 w-5" />
                <span className="hidden sm:inline">Nowy projekt</span>
                <span className="sm:hidden">Nowy</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-display">Nowy projekt</DialogTitle>
                <DialogDescription>
                  Utwórz nowy projekt dla klienta. Dane te będą widoczne w raportach.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* NIP with auto-lookup */}
                <NipLookupField
                  value={newProject.client_nip}
                  onChange={(value) => setNewProject({ ...newProject, client_nip: value })}
                  onCompanyFound={(data) => {
                    const fullAddress = [data.addressLine, data.postalCode, data.city]
                      .filter(Boolean)
                      .join(', ');
                    setNewProject({
                      ...newProject,
                      client_nip: data.nip,
                      client_name: data.companyName,
                      client_address: fullAddress,
                      regon: data.regon || '',
                      krs: data.krs || '',
                      status_company: data.status,
                      pkd_main: data.pkdMain || '',
                    });
                    toast({
                      title: 'Dane pobrane',
                      description: `Źródło: ${data.source}`,
                    });
                  }}
                  onClear={() => {
                    setNewProject({
                      client_name: '',
                      client_nip: '',
                      client_address: '',
                      description: '',
                      regon: '',
                      krs: '',
                      status_company: '',
                      pkd_main: '',
                    });
                  }}
                />

                <div className="space-y-2">
                  <Label htmlFor="client_name">Nazwa klienta *</Label>
                  <Input
                    id="client_name"
                    placeholder="np. Firma XYZ Sp. z o.o."
                    value={newProject.client_name}
                    onChange={(e) => setNewProject({ ...newProject, client_name: e.target.value })}
                  />
                </div>

                {/* Additional fields from registry */}
                {(newProject.regon || newProject.krs) && (
                  <div className="grid grid-cols-2 gap-4">
                    {newProject.regon && (
                      <div className="space-y-2">
                        <Label htmlFor="regon">REGON</Label>
                        <Input
                          id="regon"
                          value={newProject.regon}
                          onChange={(e) => setNewProject({ ...newProject, regon: e.target.value })}
                        />
                      </div>
                    )}
                    {newProject.krs && (
                      <div className="space-y-2">
                        <Label htmlFor="krs">KRS</Label>
                        <Input
                          id="krs"
                          value={newProject.krs}
                          onChange={(e) => setNewProject({ ...newProject, krs: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                )}

                {newProject.pkd_main && (
                  <div className="space-y-2">
                    <Label htmlFor="pkd_main">PKD główne</Label>
                    <Input
                      id="pkd_main"
                      value={newProject.pkd_main}
                      onChange={(e) => setNewProject({ ...newProject, pkd_main: e.target.value })}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="client_address">Adres (opcjonalnie)</Label>
                  <Input
                    id="client_address"
                    placeholder="np. ul. Przykładowa 1, 00-001 Warszawa"
                    value={newProject.client_address}
                    onChange={(e) => setNewProject({ ...newProject, client_address: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Opis / notatki (opcjonalnie)</Label>
                  <Textarea
                    id="description"
                    placeholder="Dodatkowe informacje o kliencie..."
                    value={newProject.description}
                    onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                    rows={3}
                  />
                </div>

                {/* Clear button */}
                {(newProject.client_name || newProject.client_address) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setNewProject({
                        client_name: '',
                        client_nip: '',
                        client_address: '',
                        description: '',
                        regon: '',
                        krs: '',
                        status_company: '',
                        pkd_main: '',
                      });
                    }}
                    className="text-muted-foreground"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Wyczyść dane klienta
                  </Button>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Anuluj
                </Button>
                <Button onClick={handleCreateProject} disabled={isCreating}>
                  {isCreating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Tworzenie...
                    </>
                  ) : (
                    'Utwórz projekt'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Back button when viewing a user's projects */}
        {showUserGrouping && selectedUserId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('user');
              setSearchParams(next);
              setSearchQuery('');
            }}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Wróć do listy użytkowników
          </Button>
        )}

        {showUserGrouping && selectedUserId && (
          <div className="mb-4">
            <h2 className="text-xl font-display font-semibold">
              Projekty: {profileMap.get(selectedUserId)?.name || 'Nieznany użytkownik'}
            </h2>
            {profileMap.get(selectedUserId)?.email && (
              <p className="text-sm text-muted-foreground">{profileMap.get(selectedUserId)?.email}</p>
            )}
          </div>
        )}

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={showingUserList ? 'Szukaj użytkownika...' : 'Szukaj po nazwie klienta lub NIP...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 max-w-md"
          />
        </div>

        {showingUserList && (
          isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredUserGroups.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  {searchQuery ? 'Brak wyników' : 'Brak projektów'}
                </h3>
                <p className="text-muted-foreground">
                  {searchQuery
                    ? 'Nie znaleziono użytkowników pasujących do wyszukiwania.'
                    : 'Żaden użytkownik nie posiada jeszcze projektów.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredUserGroups.map((g) => (
                <Card
                  key={g.user_id}
                  className="card-interactive h-full cursor-pointer"
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.set('user', g.user_id);
                    setSearchParams(next);
                    setSearchQuery('');
                  }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <UserIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base font-display truncate">
                            {g.name}
                          </CardTitle>
                          {g.email && (
                            <p className="text-xs text-muted-foreground truncate">{g.email}</p>
                          )}
                        </div>
                      </div>
                      <Badge variant="secondary">{g.count}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>
                        Ostatnia aktualizacja: {format(new Date(g.lastUpdate), 'd MMM yyyy', { locale: pl })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        )}

        {/* Projects List */}
        {!showingUserList && (
          isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredProjects?.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  {searchQuery ? 'Brak wyników' : 'Brak projektów'}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {searchQuery
                    ? 'Nie znaleziono projektów pasujących do wyszukiwania.'
                    : 'Utwórz pierwszy projekt, aby rozpocząć.'}
                </p>
                {!searchQuery && (
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Utwórz projekt
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProjects?.map((project) => (
                <Card key={project.id} className="card-interactive h-full relative group">
                  <Link to={`/projects/${project.id}`} className="block">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg font-display line-clamp-2">
                          {project.client_name}
                        </CardTitle>
                        <Badge variant={STATUS_VARIANTS[project.status]}>
                          {STATUS_LABELS[project.status]}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Building2 className="h-4 w-4" />
                        <span>NIP: {project.client_nip}</span>
                      </div>
                      
                      {project.client_address && (
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {project.client_address}
                        </p>
                      )}

                      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                        <Calendar className="h-3 w-3" />
                        <span>
                          Aktualizacja: {format(new Date(project.updated_at), 'd MMM yyyy', { locale: pl })}
                        </span>
                      </div>
                    </CardContent>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setProjectToDelete(project);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </Card>
              ))}
            </div>
          )
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Czy na pewno chcesz usunąć ten projekt?</AlertDialogTitle>
              <AlertDialogDescription>
                Projekt <strong>{projectToDelete?.client_name}</strong> zostanie trwale usunięty wraz ze wszystkimi powiązanymi analizami. Tej operacji nie można cofnąć.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Anuluj</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteProject}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Usuwanie...
                  </>
                ) : (
                  'Usuń projekt'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
