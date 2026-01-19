import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Pencil, Trash2, FileUp, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface OsdOperator {
  id: string;
  code: string;
  name: string;
  region: string | null;
}

interface RateCard {
  id: string;
  osd_id: string;
  name: string;
  valid_from: string;
  valid_to: string | null;
  source_document: string | null;
}

interface RateItem {
  id: string;
  rate_card_id: string;
  tariff_code: string;
  season: string | null;
  rate_type: string;
  unit: string;
  value: number;
  zone_number: number | null;
  description: string | null;
}

const RATE_TYPES = [
  { value: 'SIEC_STALA', label: 'Opłata sieciowa stała' },
  { value: 'SIEC_ZMIENNA_STREFA1', label: 'Opłata sieciowa zmienna - strefa 1' },
  { value: 'SIEC_ZMIENNA_STREFA2', label: 'Opłata sieciowa zmienna - strefa 2' },
  { value: 'SIEC_ZMIENNA_STREFA3', label: 'Opłata sieciowa zmienna - strefa 3' },
  { value: 'OPLATA_MOCOWA', label: 'Opłata mocowa' },
  { value: 'OPLATA_JAKOSCIOWA', label: 'Opłata jakościowa' },
  { value: 'OPLATA_ABONAMENTOWA', label: 'Opłata abonamentowa' },
  { value: 'OPLATA_PRZEJSCIOWA', label: 'Opłata przejściowa' },
  { value: 'ENERGIA_BIERNA', label: 'Energia bierna' },
];

const TARIFF_CODES = ['C11', 'C12a', 'C12b', 'C21', 'C22a', 'C22b', 'C23', 'B11', 'B21', 'B22', 'B23'];
const SEASONS = ['ALL', 'SUMMER', 'WINTER'];

export default function RatesManagement() {
  const [operators, setOperators] = useState<OsdOperator[]>([]);
  const [rateCards, setRateCards] = useState<RateCard[]>([]);
  const [rateItems, setRateItems] = useState<RateItem[]>([]);
  const [selectedOperator, setSelectedOperator] = useState<string | null>(null);
  const [selectedRateCard, setSelectedRateCard] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialogs state
  const [rateCardDialogOpen, setRateCardDialogOpen] = useState(false);
  const [rateItemDialogOpen, setRateItemDialogOpen] = useState(false);
  const [editingRateCard, setEditingRateCard] = useState<RateCard | null>(null);
  const [editingRateItem, setEditingRateItem] = useState<RateItem | null>(null);

  // Form state for rate card
  const [rateCardForm, setRateCardForm] = useState({
    name: '',
    valid_from: '',
    valid_to: '',
    source_document: '',
  });

  // Form state for rate item
  const [rateItemForm, setRateItemForm] = useState({
    tariff_code: 'C11',
    season: 'ALL',
    rate_type: 'SIEC_STALA',
    unit: 'zł/kW/mies',
    value: '',
    zone_number: '',
    description: '',
  });

  useEffect(() => {
    fetchOperators();
  }, []);

  useEffect(() => {
    if (selectedOperator) {
      fetchRateCards(selectedOperator);
    } else {
      setRateCards([]);
      setSelectedRateCard(null);
    }
  }, [selectedOperator]);

  useEffect(() => {
    if (selectedRateCard) {
      fetchRateItems(selectedRateCard);
    } else {
      setRateItems([]);
    }
  }, [selectedRateCard]);

  const fetchOperators = async () => {
    try {
      const { data, error } = await supabase
        .from('osd_operators')
        .select('*')
        .order('name');

      if (error) throw error;
      setOperators(data || []);
    } catch (error) {
      console.error('Error fetching operators:', error);
      toast.error('Błąd podczas pobierania operatorów');
    } finally {
      setLoading(false);
    }
  };

  const fetchRateCards = async (osdId: string) => {
    try {
      const { data, error } = await supabase
        .from('rate_cards')
        .select('*')
        .eq('osd_id', osdId)
        .order('valid_from', { ascending: false });

      if (error) throw error;
      setRateCards(data || []);
    } catch (error) {
      console.error('Error fetching rate cards:', error);
      toast.error('Błąd podczas pobierania taryf');
    }
  };

  const fetchRateItems = async (rateCardId: string) => {
    try {
      const { data, error } = await supabase
        .from('rate_items')
        .select('*')
        .eq('rate_card_id', rateCardId)
        .order('tariff_code')
        .order('rate_type');

      if (error) throw error;
      setRateItems(data || []);
    } catch (error) {
      console.error('Error fetching rate items:', error);
      toast.error('Błąd podczas pobierania stawek');
    }
  };

  const handleSaveRateCard = async () => {
    if (!selectedOperator) return;
    
    setSaving(true);
    try {
      const payload = {
        osd_id: selectedOperator,
        name: rateCardForm.name,
        valid_from: rateCardForm.valid_from,
        valid_to: rateCardForm.valid_to || null,
        source_document: rateCardForm.source_document || null,
      };

      if (editingRateCard) {
        const { error } = await supabase
          .from('rate_cards')
          .update(payload)
          .eq('id', editingRateCard.id);

        if (error) throw error;
        toast.success('Taryfa zaktualizowana');
      } else {
        const { error } = await supabase
          .from('rate_cards')
          .insert(payload);

        if (error) throw error;
        toast.success('Taryfa dodana');
      }

      setRateCardDialogOpen(false);
      setEditingRateCard(null);
      setRateCardForm({ name: '', valid_from: '', valid_to: '', source_document: '' });
      fetchRateCards(selectedOperator);
    } catch (error) {
      console.error('Error saving rate card:', error);
      toast.error('Błąd podczas zapisywania taryfy');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRateCard = async (rateCard: RateCard) => {
    if (!confirm('Czy na pewno chcesz usunąć tę taryfę wraz ze wszystkimi stawkami?')) return;

    try {
      const { error } = await supabase
        .from('rate_cards')
        .delete()
        .eq('id', rateCard.id);

      if (error) throw error;
      toast.success('Taryfa usunięta');
      if (selectedOperator) fetchRateCards(selectedOperator);
      if (selectedRateCard === rateCard.id) setSelectedRateCard(null);
    } catch (error) {
      console.error('Error deleting rate card:', error);
      toast.error('Błąd podczas usuwania taryfy');
    }
  };

  const handleSaveRateItem = async () => {
    if (!selectedRateCard) return;

    setSaving(true);
    try {
      const payload = {
        rate_card_id: selectedRateCard,
        tariff_code: rateItemForm.tariff_code,
        season: rateItemForm.season,
        rate_type: rateItemForm.rate_type,
        unit: rateItemForm.unit,
        value: parseFloat(rateItemForm.value.replace(',', '.')),
        zone_number: rateItemForm.zone_number ? parseInt(rateItemForm.zone_number) : null,
        description: rateItemForm.description || null,
      };

      if (editingRateItem) {
        const { error } = await supabase
          .from('rate_items')
          .update(payload)
          .eq('id', editingRateItem.id);

        if (error) throw error;
        toast.success('Stawka zaktualizowana');
      } else {
        const { error } = await supabase
          .from('rate_items')
          .insert(payload);

        if (error) throw error;
        toast.success('Stawka dodana');
      }

      setRateItemDialogOpen(false);
      setEditingRateItem(null);
      setRateItemForm({
        tariff_code: 'C11',
        season: 'ALL',
        rate_type: 'SIEC_STALA',
        unit: 'zł/kW/mies',
        value: '',
        zone_number: '',
        description: '',
      });
      fetchRateItems(selectedRateCard);
    } catch (error) {
      console.error('Error saving rate item:', error);
      toast.error('Błąd podczas zapisywania stawki');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRateItem = async (rateItem: RateItem) => {
    if (!confirm('Czy na pewno chcesz usunąć tę stawkę?')) return;

    try {
      const { error } = await supabase
        .from('rate_items')
        .delete()
        .eq('id', rateItem.id);

      if (error) throw error;
      toast.success('Stawka usunięta');
      if (selectedRateCard) fetchRateItems(selectedRateCard);
    } catch (error) {
      console.error('Error deleting rate item:', error);
      toast.error('Błąd podczas usuwania stawki');
    }
  };

  const openEditRateCard = (rateCard: RateCard) => {
    setEditingRateCard(rateCard);
    setRateCardForm({
      name: rateCard.name,
      valid_from: rateCard.valid_from,
      valid_to: rateCard.valid_to || '',
      source_document: rateCard.source_document || '',
    });
    setRateCardDialogOpen(true);
  };

  const openEditRateItem = (rateItem: RateItem) => {
    setEditingRateItem(rateItem);
    setRateItemForm({
      tariff_code: rateItem.tariff_code,
      season: rateItem.season || 'ALL',
      rate_type: rateItem.rate_type,
      unit: rateItem.unit,
      value: rateItem.value.toString(),
      zone_number: rateItem.zone_number?.toString() || '',
      description: rateItem.description || '',
    });
    setRateItemDialogOpen(true);
  };

  const selectedOperatorName = operators.find(o => o.id === selectedOperator)?.name || '';
  const selectedRateCardName = rateCards.find(r => r.id === selectedRateCard)?.name || '';

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="content-container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Zarządzanie stawkami OSD</h1>
          <p className="text-muted-foreground mt-2">
            Dodawaj i edytuj taryfy oraz stawki dla poszczególnych operatorów sieci dystrybucyjnej.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Operators Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Operatorzy OSD</CardTitle>
              <CardDescription>Wybierz operatora</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {operators.map((operator) => (
                <Button
                  key={operator.id}
                  variant={selectedOperator === operator.id ? 'default' : 'outline'}
                  className="w-full justify-start"
                  onClick={() => {
                    setSelectedOperator(operator.id);
                    setSelectedRateCard(null);
                  }}
                >
                  <span className="font-medium">{operator.code}</span>
                  <span className="ml-2 text-muted-foreground truncate">{operator.name}</span>
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* Rate Cards Panel */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Taryfy</CardTitle>
                <CardDescription>
                  {selectedOperatorName || 'Wybierz operatora'}
                </CardDescription>
              </div>
              {selectedOperator && (
                <Dialog open={rateCardDialogOpen} onOpenChange={setRateCardDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" onClick={() => {
                      setEditingRateCard(null);
                      setRateCardForm({ name: '', valid_from: '', valid_to: '', source_document: '' });
                    }}>
                      <Plus className="h-4 w-4 mr-1" />
                      Dodaj
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingRateCard ? 'Edytuj taryfę' : 'Nowa taryfa'}</DialogTitle>
                      <DialogDescription>
                        {selectedOperatorName}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Nazwa taryfy</Label>
                        <Input
                          value={rateCardForm.name}
                          onChange={(e) => setRateCardForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="np. Taryfa 2024"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Obowiązuje od</Label>
                          <Input
                            type="date"
                            value={rateCardForm.valid_from}
                            onChange={(e) => setRateCardForm(f => ({ ...f, valid_from: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Obowiązuje do</Label>
                          <Input
                            type="date"
                            value={rateCardForm.valid_to}
                            onChange={(e) => setRateCardForm(f => ({ ...f, valid_to: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Dokument źródłowy</Label>
                        <Input
                          value={rateCardForm.source_document}
                          onChange={(e) => setRateCardForm(f => ({ ...f, source_document: e.target.value }))}
                          placeholder="np. Decyzja URE z dnia..."
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleSaveRateCard} disabled={saving || !rateCardForm.name || !rateCardForm.valid_from}>
                        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        <Save className="h-4 w-4 mr-2" />
                        Zapisz
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {rateCards.length === 0 && selectedOperator && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Brak taryf dla tego operatora
                </p>
              )}
              {rateCards.map((rateCard) => (
                <div
                  key={rateCard.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedRateCard === rateCard.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => setSelectedRateCard(rateCard.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{rateCard.name}</p>
                      <p className="text-xs text-muted-foreground">
                        od {rateCard.valid_from}
                        {rateCard.valid_to && ` do ${rateCard.valid_to}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditRateCard(rateCard);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRateCard(rateCard);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Rate Items Panel */}
          <Card className="md:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Stawki</CardTitle>
                <CardDescription>
                  {selectedRateCardName || 'Wybierz taryfę'}
                </CardDescription>
              </div>
              {selectedRateCard && (
                <Dialog open={rateItemDialogOpen} onOpenChange={setRateItemDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" onClick={() => {
                      setEditingRateItem(null);
                      setRateItemForm({
                        tariff_code: 'C11',
                        season: 'ALL',
                        rate_type: 'SIEC_STALA',
                        unit: 'zł/kW/mies',
                        value: '',
                        zone_number: '',
                        description: '',
                      });
                    }}>
                      <Plus className="h-4 w-4 mr-1" />
                      Dodaj
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>{editingRateItem ? 'Edytuj stawkę' : 'Nowa stawka'}</DialogTitle>
                      <DialogDescription>
                        {selectedRateCardName}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Taryfa</Label>
                          <Select
                            value={rateItemForm.tariff_code}
                            onValueChange={(v) => setRateItemForm(f => ({ ...f, tariff_code: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TARIFF_CODES.map((code) => (
                                <SelectItem key={code} value={code}>{code}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Sezon</Label>
                          <Select
                            value={rateItemForm.season}
                            onValueChange={(v) => setRateItemForm(f => ({ ...f, season: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SEASONS.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s === 'ALL' ? 'Cały rok' : s === 'SUMMER' ? 'Lato' : 'Zima'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Rodzaj stawki</Label>
                        <Select
                          value={rateItemForm.rate_type}
                          onValueChange={(v) => setRateItemForm(f => ({ ...f, rate_type: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RATE_TYPES.map((rt) => (
                              <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Wartość</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={rateItemForm.value}
                            onChange={(e) => setRateItemForm(f => ({ ...f, value: e.target.value }))}
                            placeholder="0,00"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Jednostka</Label>
                          <Input
                            value={rateItemForm.unit}
                            onChange={(e) => setRateItemForm(f => ({ ...f, unit: e.target.value }))}
                            placeholder="zł/kWh"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Strefa</Label>
                          <Input
                            type="number"
                            value={rateItemForm.zone_number}
                            onChange={(e) => setRateItemForm(f => ({ ...f, zone_number: e.target.value }))}
                            placeholder="1-3"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Opis (opcjonalnie)</Label>
                        <Input
                          value={rateItemForm.description}
                          onChange={(e) => setRateItemForm(f => ({ ...f, description: e.target.value }))}
                          placeholder="Dodatkowy opis stawki"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleSaveRateItem} disabled={saving || !rateItemForm.value}>
                        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        <Save className="h-4 w-4 mr-2" />
                        Zapisz
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {rateItems.length === 0 && selectedRateCard && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Brak stawek w tej taryfie
                </p>
              )}
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {rateItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-2 rounded border text-sm flex items-center justify-between hover:bg-muted"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{item.tariff_code}</Badge>
                        <span className="font-medium truncate">
                          {RATE_TYPES.find(r => r.value === item.rate_type)?.label || item.rate_type}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.value.toFixed(6)} {item.unit}
                        {item.zone_number && ` (strefa ${item.zone_number})`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEditRateItem(item)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDeleteRateItem(item)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
