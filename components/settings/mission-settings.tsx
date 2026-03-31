'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Save, Loader2, Layers, Globe, Grid3X3 } from 'lucide-react'
import { toast } from 'sonner'
import { MissionPersonnelCategory, MissionZone, MissionTariffGridEntry } from '@/lib/types/database'

interface MissionSettingsProps {
  companyId: number | null
}

export default function MissionSettings({ companyId }: MissionSettingsProps) {
  // ── Categories state ──
  const [categories, setCategories] = useState<MissionPersonnelCategory[]>([])
  const [catLoading, setCatLoading] = useState(true)
  const [catDialogOpen, setCatDialogOpen] = useState(false)
  const [editingCat, setEditingCat] = useState<MissionPersonnelCategory | null>(null)
  const [catName, setCatName] = useState('')
  const [catDesc, setCatDesc] = useState('')
  const [catOrder, setCatOrder] = useState('0')
  const [catSaving, setCatSaving] = useState(false)

  // ── Zones state ──
  const [zones, setZones] = useState<MissionZone[]>([])
  const [zoneLoading, setZoneLoading] = useState(true)
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false)
  const [editingZone, setEditingZone] = useState<MissionZone | null>(null)
  const [zoneName, setZoneName] = useState('')
  const [zoneDesc, setZoneDesc] = useState('')
  const [zoneOrder, setZoneOrder] = useState('0')
  const [zoneSaving, setZoneSaving] = useState(false)

  // ── Tariff grid state ──
  const [gridEntries, setGridEntries] = useState<MissionTariffGridEntry[]>([])
  const [gridLoading, setGridLoading] = useState(true)
  const [gridEdits, setGridEdits] = useState<Record<string, Partial<MissionTariffGridEntry>>>({})
  const [gridSaving, setGridSaving] = useState(false)

  const [activeSection, setActiveSection] = useState<'categories' | 'zones' | 'grid'>('categories')

  const supabase = createClient()

  // ── Load data ──

  const loadCategories = useCallback(async () => {
    setCatLoading(true)
    try {
      let query = supabase.from('mission_personnel_categories').select('*').order('sort_order')
      if (companyId) query = query.eq('company_id', companyId)
      const { data, error } = await query
      if (error) throw error
      setCategories(data || [])
    } catch (err) {
      console.error('Error loading mission categories:', err)
    } finally {
      setCatLoading(false)
    }
  }, [companyId])

  const loadZones = useCallback(async () => {
    setZoneLoading(true)
    try {
      let query = supabase.from('mission_zones').select('*').order('sort_order')
      if (companyId) query = query.eq('company_id', companyId)
      const { data, error } = await query
      if (error) throw error
      setZones(data || [])
    } catch (err) {
      console.error('Error loading mission zones:', err)
    } finally {
      setZoneLoading(false)
    }
  }, [companyId])

  const loadGrid = useCallback(async () => {
    setGridLoading(true)
    try {
      const { data, error } = await supabase.from('mission_tariff_grid').select('*')
      if (error) throw error
      // Filter by categories belonging to this company
      const catIds = new Set(categories.map(c => c.id))
      setGridEntries((data || []).filter(g => catIds.has(g.category_id)))
    } catch (err) {
      console.error('Error loading tariff grid:', err)
    } finally {
      setGridLoading(false)
    }
  }, [categories])

  useEffect(() => {
    loadCategories()
    loadZones()
  }, [companyId])

  useEffect(() => {
    if (categories.length > 0) loadGrid()
  }, [categories, zones])

  // ── Category CRUD ──

  const openCatDialog = (cat?: MissionPersonnelCategory) => {
    if (cat) {
      setEditingCat(cat)
      setCatName(cat.name)
      setCatDesc(cat.description || '')
      setCatOrder(String(cat.sort_order))
    } else {
      setEditingCat(null)
      setCatName('')
      setCatDesc('')
      setCatOrder(String(categories.length + 1))
    }
    setCatDialogOpen(true)
  }

  const saveCat = async () => {
    if (!catName.trim()) return
    setCatSaving(true)
    try {
      if (editingCat) {
        const res = await fetch('/api/mission-categories', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingCat.id, name: catName, description: catDesc, sort_order: parseInt(catOrder) || 0 }),
        })
        if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Erreur'); return }
        toast.success('Catégorie modifiée')
      } else {
        const res = await fetch('/api/mission-categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: catName, description: catDesc, sort_order: parseInt(catOrder) || 0, company_id: companyId }),
        })
        if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Erreur'); return }
        toast.success('Catégorie créée')
      }
      setCatDialogOpen(false)
      await loadCategories()
      loadGrid()
    } catch { toast.error('Erreur inattendue') } finally { setCatSaving(false) }
  }

  const deleteCat = async (cat: MissionPersonnelCategory) => {
    if (!confirm(`Supprimer la catégorie "${cat.name}" ?`)) return
    try {
      const res = await fetch(`/api/mission-categories?id=${cat.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Erreur'); return }
      toast.success('Catégorie supprimée')
      await loadCategories()
      loadGrid()
    } catch { toast.error('Erreur inattendue') }
  }

  // ── Zone CRUD ──

  const openZoneDialog = (zone?: MissionZone) => {
    if (zone) {
      setEditingZone(zone)
      setZoneName(zone.name)
      setZoneDesc(zone.description || '')
      setZoneOrder(String(zone.sort_order))
    } else {
      setEditingZone(null)
      setZoneName('')
      setZoneDesc('')
      setZoneOrder(String(zones.length + 1))
    }
    setZoneDialogOpen(true)
  }

  const saveZone = async () => {
    if (!zoneName.trim()) return
    setZoneSaving(true)
    try {
      if (editingZone) {
        const res = await fetch('/api/mission-zones', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingZone.id, name: zoneName, description: zoneDesc, sort_order: parseInt(zoneOrder) || 0 }),
        })
        if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Erreur'); return }
        toast.success('Zone modifiée')
      } else {
        const res = await fetch('/api/mission-zones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: zoneName, description: zoneDesc, sort_order: parseInt(zoneOrder) || 0, company_id: companyId }),
        })
        if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Erreur'); return }
        toast.success('Zone créée')
      }
      setZoneDialogOpen(false)
      await loadZones()
      loadGrid()
    } catch { toast.error('Erreur inattendue') } finally { setZoneSaving(false) }
  }

  const deleteZone = async (zone: MissionZone) => {
    if (!confirm(`Supprimer la zone "${zone.name}" ?`)) return
    try {
      const res = await fetch(`/api/mission-zones?id=${zone.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Erreur'); return }
      toast.success('Zone supprimée')
      await loadZones()
      loadGrid()
    } catch { toast.error('Erreur inattendue') }
  }

  // ── Tariff grid editing ──

  const getGridKey = (catId: number, zoneId: number) => `${catId}-${zoneId}`

  const getGridValue = (catId: number, zoneId: number, field: keyof MissionTariffGridEntry): number => {
    const key = getGridKey(catId, zoneId)
    const edit = gridEdits[key]
    if (edit && edit[field] !== undefined) return edit[field] as number
    const entry = gridEntries.find(g => g.category_id === catId && g.zone_id === zoneId)
    return entry ? (entry[field] as number) : 0
  }

  const setGridField = (catId: number, zoneId: number, field: keyof MissionTariffGridEntry, value: string) => {
    const key = getGridKey(catId, zoneId)
    setGridEdits(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        category_id: catId,
        zone_id: zoneId,
        [field]: parseFloat(value) || 0,
      },
    }))
  }

  const hasGridEdits = Object.keys(gridEdits).length > 0

  const saveGrid = async () => {
    setGridSaving(true)
    try {
      const edits = Object.values(gridEdits)
      for (const edit of edits) {
        const existing = gridEntries.find(g => g.category_id === edit.category_id && g.zone_id === edit.zone_id)
        const payload = {
          category_id: edit.category_id,
          zone_id: edit.zone_id,
          petit_dej: edit.petit_dej ?? existing?.petit_dej ?? 0,
          dej: edit.dej ?? existing?.dej ?? 0,
          diner: edit.diner ?? existing?.diner ?? 0,
          indem_avec_pec: edit.indem_avec_pec ?? existing?.indem_avec_pec ?? 0,
          indem_sans_pec: edit.indem_sans_pec ?? existing?.indem_sans_pec ?? 0,
        }
        const res = await fetch('/api/mission-tariff-grid', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Erreur'); return }
      }
      toast.success('Grille tarifaire sauvegardée')
      setGridEdits({})
      loadGrid()
    } catch { toast.error('Erreur inattendue') } finally { setGridSaving(false) }
  }

  // ── Render helpers ──

  const rateFields: { key: keyof MissionTariffGridEntry; label: string; short: string }[] = [
    { key: 'petit_dej', label: 'Petit-déjeuner', short: 'P.déj' },
    { key: 'dej', label: 'Déjeuner', short: 'Déj' },
    { key: 'diner', label: 'Dîner', short: 'Dîner' },
    { key: 'indem_avec_pec', label: 'Indemnité avec PEC', short: 'Avec PEC' },
    { key: 'indem_sans_pec', label: 'Indemnité sans PEC', short: 'Sans PEC' },
  ]

  const sections = [
    { key: 'categories' as const, label: 'Catégories Personnel', icon: Layers },
    { key: 'zones' as const, label: 'Zones Géographiques', icon: Globe },
    { key: 'grid' as const, label: 'Grille Tarifaire', icon: Grid3X3 },
  ]

  const switchSection = (key: typeof activeSection) => {
    setActiveSection(key)
    if (key === 'grid') {
      loadCategories()
      loadZones()
      loadGrid()
    }
  }

  return (
    <div className="space-y-4">
      {/* Section tabs */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border/70 bg-muted/40 p-1">
        {sections.map(s => {
          const Icon = s.icon
          const isActive = activeSection === s.key
          return (
            <button
              key={s.key}
              onClick={() => switchSection(s.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? 'border border-border bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {s.label}
            </button>
          )
        })}
      </div>

      {/* ═══ Categories Section ═══ */}
      {activeSection === 'categories' && (
        <Card className="border-border/70">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Catégories de personnel (missions)</CardTitle>
            <Button size="sm" onClick={() => openCatDialog()}>
              <Plus className="mr-1.5 h-4 w-4" /> Ajouter
            </Button>
          </CardHeader>
          <CardContent>
            {catLoading ? (
              <div className="py-8 text-center text-muted-foreground">Chargement...</div>
            ) : categories.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">Aucune catégorie configurée</div>
            ) : (
              <div className="space-y-2">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">{cat.sort_order}</Badge>
                        <span className="font-medium text-foreground text-sm">{cat.name}</span>
                      </div>
                      {cat.description && <p className="mt-0.5 text-xs text-muted-foreground">{cat.description}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 ml-3">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openCatDialog(cat)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => deleteCat(cat)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ Zones Section ═══ */}
      {activeSection === 'zones' && (
        <Card className="border-border/70">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Zones géographiques</CardTitle>
            <Button size="sm" onClick={() => openZoneDialog()}>
              <Plus className="mr-1.5 h-4 w-4" /> Ajouter
            </Button>
          </CardHeader>
          <CardContent>
            {zoneLoading ? (
              <div className="py-8 text-center text-muted-foreground">Chargement...</div>
            ) : zones.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">Aucune zone configurée</div>
            ) : (
              <div className="space-y-2">
                {zones.map(zone => (
                  <div key={zone.id} className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">{zone.sort_order}</Badge>
                        <span className="font-medium text-foreground text-sm">{zone.name}</span>
                      </div>
                      {zone.description && <p className="mt-0.5 text-xs text-muted-foreground">{zone.description}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 ml-3">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openZoneDialog(zone)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => deleteZone(zone)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ Tariff Grid Section ═══ */}
      {activeSection === 'grid' && (
        <Card className="border-border/70">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Grille tarifaire</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Tarifs par catégorie et zone géographique (en devise locale)</p>
            </div>
            {hasGridEdits && (
              <Button size="sm" onClick={saveGrid} disabled={gridSaving}>
                {gridSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Sauvegarder
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {gridLoading || catLoading || zoneLoading ? (
              <div className="py-8 text-center text-muted-foreground">Chargement...</div>
            ) : categories.length === 0 || zones.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                Configurez d&apos;abord les catégories et les zones pour voir la grille tarifaire.
              </div>
            ) : (
              <div className="space-y-6">
                {categories.map(cat => (
                  <div key={cat.id}>
                    <h4 className="mb-2 text-sm font-semibold text-foreground">
                      <Badge variant="secondary" className="mr-2 text-[10px]">{cat.sort_order}</Badge>
                      {cat.name}
                    </h4>
                    <div className="space-y-3">
                      {zones.map(zone => (
                        <div key={zone.id} className="rounded-xl border border-border/70 p-3">
                          <p className="mb-2 text-xs font-medium text-muted-foreground">
                            <Globe className="mr-1 inline h-3 w-3" />
                            {zone.name}
                          </p>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                            {rateFields.map(f => (
                              <div key={f.key}>
                                <label className="mb-0.5 block text-[10px] text-muted-foreground">{f.short}</label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={getGridValue(cat.id, zone.id, f.key)}
                                  onChange={(e) => setGridField(cat.id, zone.id, f.key, e.target.value)}
                                  className="h-8 text-sm"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ Category Dialog ═══ */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCat ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</DialogTitle>
            <DialogDescription>Catégorie de personnel pour le calcul des indemnités de mission</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Nom</label>
              <Input value={catName} onChange={e => setCatName(e.target.value)} placeholder="Nom de la catégorie" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Description</label>
              <Textarea value={catDesc} onChange={e => setCatDesc(e.target.value)} placeholder="Description (optionnel)" rows={2} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Ordre</label>
              <Input type="number" value={catOrder} onChange={e => setCatOrder(e.target.value)} min="0" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialogOpen(false)}>Annuler</Button>
            <Button onClick={saveCat} disabled={!catName.trim() || catSaving}>
              {catSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editingCat ? 'Modifier' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Zone Dialog ═══ */}
      <Dialog open={zoneDialogOpen} onOpenChange={setZoneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingZone ? 'Modifier la zone' : 'Nouvelle zone'}</DialogTitle>
            <DialogDescription>Zone géographique pour le calcul des indemnités de mission</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Nom</label>
              <Input value={zoneName} onChange={e => setZoneName(e.target.value)} placeholder="Ex: Europe - Maghreb - Afrique du Nord" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Description</label>
              <Textarea value={zoneDesc} onChange={e => setZoneDesc(e.target.value)} placeholder="Description (optionnel)" rows={2} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Ordre</label>
              <Input type="number" value={zoneOrder} onChange={e => setZoneOrder(e.target.value)} min="0" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setZoneDialogOpen(false)}>Annuler</Button>
            <Button onClick={saveZone} disabled={!zoneName.trim() || zoneSaving}>
              {zoneSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editingZone ? 'Modifier' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
