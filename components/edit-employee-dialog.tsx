'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2, Pencil, Plus, Trash2, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Company, Department, UserRole } from '@/lib/types/database'
import { getRoleLabel } from '@/lib/constants'

const ROLE_OPTIONS: UserRole[] = ['EMPLOYEE', 'CHEF_SERVICE', 'RH', 'DIRECTEUR_EXECUTIF', 'ADMIN']

interface CompanyAssignment {
  company_id: number
  role: UserRole
  department_id: number | null
  is_home: boolean
}

interface EditEmployeeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
  employee: {
    id: string
    full_name: string
    email: string | null
    phone?: string | null
    role: UserRole
    job_title?: string | null
    company_id: number | null
    department_id: number | null
    hire_date?: string | null
    birth_date?: string | null
    gender?: string | null
    matricule?: string | null
    cin?: string | null
    cnss?: string | null
    rib?: string | null
    address?: string | null
    city?: string | null
    category_id?: number | null
    mission_category_id?: number | null
    date_anciennete?: string | null
    balance_conge: number
    balance_recuperation: number
  }
}

export function EditEmployeeDialog({ open, onOpenChange, onUpdated, employee }: EditEmployeeDialogProps) {
  const supabase = useMemo(() => createClient(), [])

  const [companies, setCompanies] = useState<Company[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [categories, setCategories] = useState<{ id: number; name: string; company_id: number | null }[]>([])
  const [missionCategories, setMissionCategories] = useState<{ id: number; name: string }[]>([])
  const [saving, setSaving] = useState(false)

  // Form fields
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<UserRole>('EMPLOYEE')
  const [jobTitle, setJobTitle] = useState('')
  const [companyId, setCompanyId] = useState<string>('')
  const [departmentId, setDepartmentId] = useState<string>('')
  const [hireDate, setHireDate] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState('')
  const [matricule, setMatricule] = useState('')
  const [cin, setCin] = useState('')
  const [cnss, setCnss] = useState('')
  const [rib, setRib] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [missionCategoryId, setMissionCategoryId] = useState<string>('')
  const [dateAnciennete, setDateAnciennete] = useState('')

  // Multi-company assignments
  const [companyAssignments, setCompanyAssignments] = useState<CompanyAssignment[]>([])
  const [loadingAssignments, setLoadingAssignments] = useState(false)

  const filteredDepartments = useMemo(
    () => (companyId ? departments.filter((d) => String(d.company_id) === companyId) : departments),
    [departments, companyId]
  )

  const filteredCategories = useMemo(
    () => (companyId ? categories.filter((c) => String(c.company_id) === companyId) : categories),
    [categories, companyId]
  )

  const getDepartmentsForCompany = useCallback(
    (cId: number) => departments.filter((d) => d.company_id === cId),
    [departments]
  )

  const loadReferenceData = useCallback(async () => {
    const [{ data: companyData }, { data: deptData }, { data: catData }, { data: missionCatData }] = await Promise.all([
      supabase.from('companies').select('*').order('name'),
      supabase.from('departments').select('*').order('name'),
      supabase.from('personnel_categories').select('id, name, company_id').order('name'),
      supabase.from('mission_personnel_categories').select('id, name').eq('is_active', true).order('sort_order'),
    ])
    setCompanies((companyData || []) as Company[])
    setDepartments((deptData || []) as Department[])
    setCategories((catData || []) as { id: number; name: string; company_id: number | null }[])
    setMissionCategories((missionCatData || []) as { id: number; name: string }[])
  }, [supabase])

  const loadCompanyAssignments = useCallback(async () => {
    setLoadingAssignments(true)
    const { data } = await supabase
      .from('user_company_roles')
      .select('company_id, role, department_id, is_home')
      .eq('user_id', employee.id)
      .eq('is_active', true)

    if (data && data.length > 0) {
      setCompanyAssignments(data.map(d => ({
        company_id: d.company_id,
        role: d.role as UserRole,
        department_id: d.department_id,
        is_home: d.is_home,
      })))
    } else {
      // Fallback: use utilisateurs fields
      setCompanyAssignments([{
        company_id: employee.company_id!,
        role: employee.role,
        department_id: employee.department_id,
        is_home: true,
      }])
    }
    setLoadingAssignments(false)
  }, [supabase, employee.id, employee.company_id, employee.role, employee.department_id])

  // Populate form when dialog opens
  useEffect(() => {
    if (open) {
      setFullName(employee.full_name || '')
      setPhone(employee.phone || '')
      setRole(employee.role || 'EMPLOYEE')
      setJobTitle(employee.job_title || '')
      setCompanyId(employee.company_id ? String(employee.company_id) : '')
      setDepartmentId(employee.department_id ? String(employee.department_id) : '')
      setHireDate(employee.hire_date || '')
      setBirthDate(employee.birth_date || '')
      setGender(employee.gender || '')
      setMatricule(employee.matricule || '')
      setCin(employee.cin || '')
      setCnss(employee.cnss || '')
      setRib(employee.rib || '')
      setAddress(employee.address || '')
      setCity(employee.city || '')
      setNewPassword('')
      setCategoryId(employee.category_id ? String(employee.category_id) : '')
      setMissionCategoryId(employee.mission_category_id ? String(employee.mission_category_id) : '')
      setDateAnciennete(employee.date_anciennete || '')
      loadReferenceData()
      loadCompanyAssignments()
    }
  }, [open, employee, loadReferenceData, loadCompanyAssignments])

  // Multi-company handlers
  const addCompanyAssignment = () => {
    const usedCompanyIds = new Set(companyAssignments.map(a => a.company_id))
    const available = companies.find(c => !usedCompanyIds.has(c.id))
    if (!available) {
      toast.error('Toutes les societes sont deja assignees')
      return
    }
    setCompanyAssignments(prev => [...prev, {
      company_id: available.id,
      role: 'EMPLOYEE',
      department_id: null,
      is_home: false,
    }])
  }

  const removeCompanyAssignment = (idx: number) => {
    if (companyAssignments.length <= 1) {
      toast.error("L'employe doit avoir au moins une societe")
      return
    }
    const removed = companyAssignments[idx]
    const next = companyAssignments.filter((_, i) => i !== idx)
    // If removing home, make first remaining home
    if (removed.is_home && next.length > 0) {
      next[0].is_home = true
    }
    setCompanyAssignments([...next])
  }

  const updateAssignment = (idx: number, field: keyof CompanyAssignment, value: unknown) => {
    setCompanyAssignments(prev => {
      const next = [...prev]
      if (field === 'is_home') {
        // Only one can be home
        next.forEach((a, i) => { a.is_home = i === idx })
      } else {
        (next[idx] as unknown as Record<string, unknown>)[field] = value
      }
      return [...next]
    })
  }

  async function handleSubmit() {
    if (!fullName.trim()) {
      toast.error('Le nom complet est obligatoire')
      return
    }
    if (!companyId) {
      toast.error('La societe est obligatoire')
      return
    }
    if (!departmentId) {
      toast.error('Le departement est obligatoire')
      return
    }
    if (!hireDate) {
      toast.error("La date d'embauche est obligatoire")
      return
    }
    if (newPassword && newPassword.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caracteres')
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        role,
        job_title: jobTitle.trim() || null,
        company_id: companyId,
        department_id: departmentId,
        hire_date: hireDate,
        birth_date: birthDate || null,
        gender: gender || null,
        matricule: matricule.trim() || null,
        cin: cin.trim() || null,
        cnss: cnss.trim() || null,
        rib: rib.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        category_id: categoryId || null,
        mission_category_id: missionCategoryId ? parseInt(missionCategoryId) : null,
        date_anciennete: dateAnciennete || null,
      }

      if (newPassword) {
        payload.new_password = newPassword
      }

      // Include company assignments
      if (companyAssignments.length > 0) {
        payload.company_assignments = companyAssignments
      }

      const res = await fetch(`/api/employees/${employee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "Erreur lors de la modification de l'employe")
        return
      }

      toast.success(`${fullName.trim()} a ete modifie avec succes`)
      onOpenChange(false)
      onUpdated()
    } catch (err) {
      console.error('Update employee error:', err)
      toast.error('Une erreur inattendue est survenue')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Modifier l&apos;employe
          </DialogTitle>
          <DialogDescription>Modifiez les informations de {employee.full_name}.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Identity */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-fullName">Nom complet *</Label>
              <Input id="edit-fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" type="email" value={employee.email || ''} disabled className="bg-muted" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-password">Nouveau mot de passe</Label>
              <Input id="edit-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Laisser vide pour ne pas changer" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-phone">Telephone</Label>
              <Input id="edit-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-gender">Genre</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger id="edit-gender" className="w-full">
                  <SelectValue placeholder="Selectionner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Homme</SelectItem>
                  <SelectItem value="F">Femme</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-role">Role *</Label>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger id="edit-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {getRoleLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Job */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-jobTitle">Poste</Label>
              <Input id="edit-jobTitle" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-birthDate">Date de naissance</Label>
              <Input id="edit-birthDate" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </div>
          </div>

          {/* Company & Department (home) */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-company">Societe *</Label>
              <Select
                value={companyId}
                onValueChange={(v) => {
                  setCompanyId(v)
                  setDepartmentId('')
                }}
              >
                <SelectTrigger id="edit-company" className="w-full">
                  <SelectValue placeholder="Selectionner" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-department">Departement *</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger id="edit-department" className="w-full">
                  <SelectValue placeholder="Selectionner" />
                </SelectTrigger>
                <SelectContent>
                  {filteredDepartments.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category & Hire Date */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-category">Catégorie</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="edit-category" className="w-full">
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-hireDate">Date d&apos;embauche *</Label>
              <Input id="edit-hireDate" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
            </div>
          </div>

          {/* Mission Category */}
          {missionCategories.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-missionCategory">Catégorie mission (indemnités)</Label>
              <Select value={missionCategoryId} onValueChange={setMissionCategoryId}>
                <SelectTrigger id="edit-missionCategory" className="w-full">
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {missionCategories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Date d'ancienneté & Matricule */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-dateAnciennete">Date d&apos;anciennete</Label>
              <Input id="edit-dateAnciennete" type="date" value={dateAnciennete} onChange={(e) => setDateAnciennete(e.target.value)} />
              <p className="text-muted-foreground text-xs">Si differente de la date d&apos;embauche</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-matricule">Matricule</Label>
              <Input id="edit-matricule" value={matricule} onChange={(e) => setMatricule(e.target.value)} />
            </div>
          </div>

          {/* Administrative */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-cin">CIN</Label>
              <Input id="edit-cin" value={cin} onChange={(e) => setCin(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-cnss">CNSS</Label>
              <Input id="edit-cnss" value={cnss} onChange={(e) => setCnss(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-rib">RIB</Label>
              <Input id="edit-rib" value={rib} onChange={(e) => setRib(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-city">Ville</Label>
              <Input id="edit-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-address">Adresse</Label>
            <Input id="edit-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>


          {/* Multi-company assignments (Req 3) */}
          <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Societes assignees</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCompanyAssignment}
                disabled={companyAssignments.length >= companies.length}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Ajouter
              </Button>
            </div>

            {loadingAssignments ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2">
                {companyAssignments.map((assignment, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-background p-2.5">
                    {/* Company */}
                    <Select
                      value={String(assignment.company_id)}
                      onValueChange={(v) => {
                        updateAssignment(idx, 'company_id', parseInt(v))
                        updateAssignment(idx, 'department_id', null)
                      }}
                    >
                      <SelectTrigger className="h-8 w-[120px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map(c => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Role */}
                    <Select
                      value={assignment.role}
                      onValueChange={(v) => updateAssignment(idx, 'role', v)}
                    >
                      <SelectTrigger className="h-8 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map(r => (
                          <SelectItem key={r} value={r}>{getRoleLabel(r)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Department */}
                    <Select
                      value={assignment.department_id ? String(assignment.department_id) : ''}
                      onValueChange={(v) => updateAssignment(idx, 'department_id', v ? parseInt(v) : null)}
                    >
                      <SelectTrigger className="h-8 min-w-[120px] flex-1 text-xs">
                        <SelectValue placeholder="Dept." />
                      </SelectTrigger>
                      <SelectContent>
                        {getDepartmentsForCompany(assignment.company_id).map(d => (
                          <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Home toggle */}
                    <Button
                      type="button"
                      variant={assignment.is_home ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => updateAssignment(idx, 'is_home', true)}
                      title="Societe principale"
                    >
                      <Home className="h-3.5 w-3.5" />
                    </Button>

                    {/* Remove */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-destructive hover:text-destructive"
                      onClick={() => removeCompanyAssignment(idx)}
                      disabled={companyAssignments.length <= 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              La societe principale (icone maison) est utilisee pour le calcul du solde et des conges.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
