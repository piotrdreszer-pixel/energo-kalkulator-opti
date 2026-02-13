import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Users, UserPlus, Trash2, BarChart3, Calendar, FileText, Loader2, Shield } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { pl } from 'date-fns/locale';

interface UserWithStats {
  id: string;
  user_id: string;
  name: string;
  email: string;
  created_at: string;
  last_activity_at: string | null;
  isAdmin: boolean;
  isManager: boolean;
  projectsCount: number;
  analysesCount: number;
}

export default function UsersManagement() {
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');

  // Fetch all users with their statistics
  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch user roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Fetch projects count per user
      const { data: projects, error: projectsError } = await supabase
        .from('client_projects')
        .select('created_by_user_id');

      if (projectsError) throw projectsError;

      // Fetch analyses count per project
      const { data: analyses, error: analysesError } = await supabase
        .from('energy_analyses')
        .select('id, client_project_id');

      if (analysesError) throw analysesError;

      // Get project user mapping for analyses
      const projectUserMap = new Map<string, string>();
      projects?.forEach(p => {
        if (p.created_by_user_id) {
          projectUserMap.set(p.created_by_user_id, p.created_by_user_id);
        }
      });

      // Create user stats map
      const userStats = profiles?.map(profile => {
        const userProjects = projects?.filter(p => p.created_by_user_id === profile.user_id) || [];
        const projectIds = new Set(userProjects.map(p => p.created_by_user_id));
        
        // Count analyses for user's projects
        const userProjectIds = projects
          ?.filter(p => p.created_by_user_id === profile.user_id)
          .map(p => p.created_by_user_id);
        
        const analysesCount = analyses?.filter(a => {
          const project = projects?.find(p => 
            userProjectIds?.includes(p.created_by_user_id)
          );
          return project?.created_by_user_id === profile.user_id;
        }).length || 0;

        const isAdmin = roles?.some(r => r.user_id === profile.user_id && r.role === 'admin') || false;
        const isManager = roles?.some(r => r.user_id === profile.user_id && r.role === 'manager') || false;

        return {
          id: profile.id,
          user_id: profile.user_id,
          name: profile.name,
          email: profile.email,
          created_at: profile.created_at,
          last_activity_at: profile.last_activity_at,
          isAdmin,
          isManager,
          projectsCount: userProjects.length,
          analysesCount,
        } as UserWithStats;
      }) || [];

      return userStats;
    },
  });

  // Recalculate analyses count properly
  const { data: analysesPerUser } = useQuery({
    queryKey: ['admin-analyses-per-user'],
    queryFn: async () => {
      const { data: projects } = await supabase
        .from('client_projects')
        .select('id, created_by_user_id');

      const { data: analyses } = await supabase
        .from('energy_analyses')
        .select('id, client_project_id');

      const countMap = new Map<string, number>();
      
      projects?.forEach(project => {
        if (project.created_by_user_id) {
          const projectAnalyses = analyses?.filter(a => a.client_project_id === project.id).length || 0;
          const current = countMap.get(project.created_by_user_id) || 0;
          countMap.set(project.created_by_user_id, current + projectAnalyses);
        }
      });

      return countMap;
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Delete user roles
      const { error: rolesError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (rolesError) throw rolesError;

      // Delete profile
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('user_id', userId);

      if (profileError) throw profileError;

      // Note: We cannot delete from auth.users directly via client
      // The user will remain in auth but without profile/roles
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Użytkownik został usunięty');
    },
    onError: (error) => {
      console.error('Error deleting user:', error);
      toast.error('Nie udało się usunąć użytkownika');
    },
  });

  // Add user mutation (using edge function for admin signup)
  const addUserMutation = useMutation({
    mutationFn: async ({ email, password, name }: { email: string; password: string; name: string }) => {
      // Create user server-side (admin path creates an active account without sending email)
      const { data, error } = await supabase.functions.invoke('auth-signup', {
        body: {
          email: email.toLowerCase().trim(),
          password,
          name: name.trim(),
        },
      });

      if (error) {
        // Prefer message from function when possible
        const anyErr = error as any;
        const msg =
          anyErr?.context?.body?.error ||
          anyErr?.context?.response?.error ||
          anyErr?.message ||
          'Nie udało się dodać użytkownika';
        console.error('auth-signup invoke error:', error);
        throw new Error(msg);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setIsAddDialogOpen(false);
      setNewUserEmail('');
      setNewUserName('');
      setNewUserPassword('');
      
      if (data?.adminCreated) {
        toast.success('Użytkownik został dodany (konto aktywne, bez maila).');
      } else {
        toast.success('Użytkownik został dodany. E-mail z potwierdzeniem został wysłany.');
      }
    },
    onError: (error: any) => {
      console.error('Error adding user:', error);
      toast.error(error.message || 'Nie udało się dodać użytkownika');
    },
  });

  // Toggle admin role
  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      if (isAdmin) {
        // Remove admin role
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('role', 'admin');
        if (error) throw error;
      } else {
        // Add admin role
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: 'admin' });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Rola użytkownika została zmieniona');
    },
    onError: (error) => {
      console.error('Error toggling admin role:', error);
      toast.error('Nie udało się zmienić roli użytkownika');
    },
  });

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword || !newUserName) {
      toast.error('Wypełnij wszystkie pola');
      return;
    }
    if (newUserPassword.length < 6) {
      toast.error('Hasło musi mieć minimum 6 znaków');
      return;
    }
    addUserMutation.mutate({
      email: newUserEmail,
      password: newUserPassword,
      name: newUserName,
    });
  };

  // Calculate summary stats
  const totalUsers = users?.length || 0;
  const totalProjects = users?.reduce((sum, u) => sum + u.projectsCount, 0) || 0;
  const totalAnalyses = Array.from(analysesPerUser?.values() || []).reduce((sum, count) => sum + count, 0);
  const activeUsersLast7Days = users?.filter(u => {
    if (!u.last_activity_at) return false;
    const lastActivity = new Date(u.last_activity_at);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return lastActivity >= sevenDaysAgo;
  }).length || 0;

  return (
    <AppLayout>
      <div className="content-container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Zarządzanie użytkownikami</h1>
          <p className="text-muted-foreground mt-1">
            Lista użytkowników i statystyki używania narzędzia
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-primary/10">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalUsers}</p>
                  <p className="text-sm text-muted-foreground">Użytkowników</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-green-500/10">
                  <FileText className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalProjects}</p>
                  <p className="text-sm text-muted-foreground">Projektów</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-blue-500/10">
                  <BarChart3 className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalAnalyses}</p>
                  <p className="text-sm text-muted-foreground">Analiz</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-orange-500/10">
                  <Calendar className="h-6 w-6 text-orange-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activeUsersLast7Days}</p>
                  <p className="text-sm text-muted-foreground">Aktywnych (7 dni)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Użytkownicy</CardTitle>
              <CardDescription>Lista wszystkich zarejestrowanych użytkowników</CardDescription>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Dodaj użytkownika
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleAddUser}>
                  <DialogHeader>
                    <DialogTitle>Dodaj nowego użytkownika</DialogTitle>
                    <DialogDescription>
                      Wprowadź dane nowego użytkownika. Otrzyma on e-mail z potwierdzeniem.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Imię i nazwisko</Label>
                      <Input
                        id="name"
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                        placeholder="Jan Kowalski"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Adres e-mail</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        placeholder="jan@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Hasło</Label>
                      <Input
                        id="password"
                        type="password"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        placeholder="Minimum 6 znaków"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Anuluj
                    </Button>
                    <Button type="submit" disabled={addUserMutation.isPending}>
                      {addUserMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Dodaj
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Użytkownik</TableHead>
                    <TableHead>Rola</TableHead>
                    <TableHead className="text-center">Projekty</TableHead>
                    <TableHead className="text-center">Analizy</TableHead>
                    <TableHead>Ostatnia aktywność</TableHead>
                    <TableHead>Data rejestracji</TableHead>
                    <TableHead className="text-right">Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{user.name}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          <Badge variant={user.isAdmin ? 'default' : 'secondary'}>
                            {user.isAdmin ? 'Admin' : 'Użytkownik'}
                          </Badge>
                          {user.isManager && (
                            <Badge variant="outline">Menedżer</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {user.projectsCount}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {analysesPerUser?.get(user.user_id) || 0}
                      </TableCell>
                      <TableCell>
                        {user.last_activity_at ? (
                          <span title={format(new Date(user.last_activity_at), 'dd.MM.yyyy HH:mm')}>
                            {formatDistanceToNow(new Date(user.last_activity_at), { 
                              addSuffix: true, 
                              locale: pl 
                            })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {format(new Date(user.created_at), 'dd.MM.yyyy', { locale: pl })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleAdminMutation.mutate({ 
                              userId: user.user_id, 
                              isAdmin: user.isAdmin 
                            })}
                            disabled={toggleAdminMutation.isPending}
                          >
                            <Shield className="h-4 w-4 mr-1" />
                            {user.isAdmin ? 'Usuń admina' : 'Nadaj admina'}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Czy na pewno chcesz usunąć tego użytkownika?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Ta akcja usunie profil i role użytkownika {user.email}. 
                                  Projekty i analizy utworzone przez tego użytkownika pozostaną w systemie.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Anuluj</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteUserMutation.mutate(user.user_id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Usuń
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
