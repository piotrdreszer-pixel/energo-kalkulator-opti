import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { UserPlus, Trash2, Loader2, Users, Shield } from 'lucide-react';

interface Profile {
  user_id: string;
  name: string;
  email: string;
}

interface Assignment {
  id: string;
  manager_user_id: string;
  managed_user_id: string;
  created_at: string;
}

export default function ManagersManagement() {
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedManager, setSelectedManager] = useState('');
  const [selectedUser, setSelectedUser] = useState('');

  // Fetch profiles
  const { data: profiles } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('user_id, name, email');
      if (error) throw error;
      return data as Profile[];
    },
  });

  // Fetch roles
  const { data: roles } = useQuery({
    queryKey: ['admin-roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_roles').select('user_id, role');
      if (error) throw error;
      return data as { user_id: string; role: string }[];
    },
  });

  // Fetch assignments
  const { data: assignments, isLoading } = useQuery({
    queryKey: ['manager-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('manager_assignments').select('*');
      if (error) throw error;
      return data as Assignment[];
    },
  });

  const managers = profiles?.filter(p =>
    roles?.some(r => r.user_id === p.user_id && r.role === 'manager')
  ) || [];

  const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

  // Group assignments by manager
  const assignmentsByManager = new Map<string, Assignment[]>();
  assignments?.forEach(a => {
    const list = assignmentsByManager.get(a.manager_user_id) || [];
    list.push(a);
    assignmentsByManager.set(a.manager_user_id, list);
  });

  // Available users to assign (not the manager themselves, not already assigned to this manager)
  const getAvailableUsers = (managerUserId: string) => {
    const existing = assignments?.filter(a => a.manager_user_id === managerUserId).map(a => a.managed_user_id) || [];
    return profiles?.filter(p => p.user_id !== managerUserId && !existing.includes(p.user_id)) || [];
  };

  // Add assignment
  const addMutation = useMutation({
    mutationFn: async ({ manager_user_id, managed_user_id }: { manager_user_id: string; managed_user_id: string }) => {
      const { error } = await supabase.from('manager_assignments').insert({
        manager_user_id,
        managed_user_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-assignments'] });
      setIsAddDialogOpen(false);
      setSelectedManager('');
      setSelectedUser('');
      toast.success('Podopieczny został przypisany');
    },
    onError: (error: any) => {
      if (error.message?.includes('duplicate')) {
        toast.error('Ten użytkownik jest już przypisany do tego menedżera');
      } else {
        toast.error('Nie udało się przypisać podopiecznego');
      }
    },
  });

  // Remove assignment
  const removeMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from('manager_assignments').delete().eq('id', assignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-assignments'] });
      toast.success('Przypisanie zostało usunięte');
    },
    onError: () => {
      toast.error('Nie udało się usunąć przypisania');
    },
  });

  // Grant manager role
  const grantManagerMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('user_roles').insert({ user_id: userId, role: 'manager' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Nadano rolę menedżera');
    },
    onError: (error: any) => {
      if (error.message?.includes('duplicate')) {
        toast.error('Użytkownik ma już rolę menedżera');
      } else {
        toast.error('Nie udało się nadać roli');
      }
    },
  });

  // Revoke manager role
  const revokeManagerMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Remove role
      const { error: roleErr } = await supabase.from('user_roles').delete()
        .eq('user_id', userId).eq('role', 'manager');
      if (roleErr) throw roleErr;
      // Remove all assignments for this manager
      const { error: assignErr } = await supabase.from('manager_assignments').delete()
        .eq('manager_user_id', userId);
      if (assignErr) throw assignErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      queryClient.invalidateQueries({ queryKey: ['manager-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Rola menedżera została odebrana');
    },
    onError: () => {
      toast.error('Nie udało się odebrać roli');
    },
  });

  const nonManagerUsers = profiles?.filter(p =>
    !roles?.some(r => r.user_id === p.user_id && r.role === 'manager')
  ) || [];

  return (
    <AppLayout>
      <div className="content-container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Zarządzanie menedżerami</h1>
          <p className="text-muted-foreground mt-1">
            Przypisuj podopiecznych do menedżerów i zarządzaj rolami menedżerskimi
          </p>
        </div>

        {/* Grant manager role section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Nadaj rolę menedżera
            </CardTitle>
            <CardDescription>Wybierz użytkownika, któremu chcesz nadać uprawnienia menedżerskie</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <Select value={selectedManager} onValueChange={setSelectedManager}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz użytkownika..." />
                  </SelectTrigger>
                  <SelectContent>
                    {nonManagerUsers.map(u => (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {u.name} ({u.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => {
                  if (selectedManager) {
                    grantManagerMutation.mutate(selectedManager);
                    setSelectedManager('');
                  }
                }}
                disabled={!selectedManager || grantManagerMutation.isPending}
              >
                {grantManagerMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Nadaj rolę
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Managers list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : managers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Brak menedżerów</p>
              <p className="text-muted-foreground">Nadaj rolę menedżera użytkownikowi powyżej, aby zacząć.</p>
            </CardContent>
          </Card>
        ) : (
          managers.map(manager => {
            const managerAssignments = assignmentsByManager.get(manager.user_id) || [];
            const availableUsers = getAvailableUsers(manager.user_id);

            return (
              <Card key={manager.user_id} className="mb-6">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {manager.name}
                      <Badge variant="outline">Menedżer</Badge>
                    </CardTitle>
                    <CardDescription>{manager.email} · {managerAssignments.length} podopiecznych</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Dialog>
                      <Button size="sm" onClick={() => {
                        setSelectedManager(manager.user_id);
                        setSelectedUser('');
                        setIsAddDialogOpen(true);
                      }}>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Dodaj podopiecznego
                      </Button>
                    </Dialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          Odbierz rolę
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Odebrać rolę menedżera?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Użytkownik {manager.name} straci dostęp do projektów podopiecznych. Wszystkie przypisania zostaną usunięte.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Anuluj</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => revokeManagerMutation.mutate(manager.user_id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Odbierz
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {managerAssignments.length === 0 ? (
                    <p className="text-muted-foreground text-sm py-4 text-center">Brak przypisanych podopiecznych</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Podopieczny</TableHead>
                          <TableHead>E-mail</TableHead>
                          <TableHead className="text-right">Akcje</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {managerAssignments.map(a => {
                          const user = profileMap.get(a.managed_user_id);
                          return (
                            <TableRow key={a.id}>
                              <TableCell className="font-medium">{user?.name || '—'}</TableCell>
                              <TableCell>{user?.email || '—'}</TableCell>
                              <TableCell className="text-right">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Usunąć przypisanie?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Menedżer {manager.name} straci dostęp do projektów użytkownika {user?.name}.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Anuluj</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => removeMutation.mutate(a.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Usuń
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}

        {/* Add assignment dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dodaj podopiecznego</DialogTitle>
              <DialogDescription>
                Wybierz użytkownika do przypisania pod menedżera: {profileMap.get(selectedManager)?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz użytkownika..." />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableUsers(selectedManager).map(u => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Anuluj</Button>
              <Button
                onClick={() => {
                  if (selectedManager && selectedUser) {
                    addMutation.mutate({ manager_user_id: selectedManager, managed_user_id: selectedUser });
                  }
                }}
                disabled={!selectedUser || addMutation.isPending}
              >
                {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Przypisz
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
