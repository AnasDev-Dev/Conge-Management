'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2, UserPlus } from 'lucide-react'
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

interface AddEmployeeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function AddEmployeeDialog({ open, onOpenChange, onCreated }: AddEmployeeDialogProps) {
  const supabase = useMemo(() => createClient(), [])

  const [companies, setCompanies] = useState<Company[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([])
  const [saving, setSaving] = useState(false)

  // Form fields
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
  const [categoryId, setCategoryId] = useState<string>('')

  const filteredDepartments = useMemo(
    () => (companyId ? departments.filter((d) => String(d.company_id) === companyId) : departments),
    [departments, companyId]
  )

  const loadReferenceData = useCallback(async () => {
    const [{ data: companyData }, { data: deptData }, { data: catData }] = await Promise.all([
      supabase.from('companies').select('*').order('name'),
      supabase.from('departments').select('*').order('name'),
      supabase.from('personnel_categories').select('id, name').order('name'),
    ])
    setCompanies((companyData || []) as Company[])
    setDepartments((deptData || []) as Department[])
    setCategories((catData || []) as { id: number; name: string }[])
  }, [supabase])

  useEffect(() => {
    if (open) loadReferenceData()
  }, [open, loadReferenceData])

  function resetForm() {
    setFullName('')
    setEmail('')
    setPassword('')
    setPhone('')
    setRole('EMPLOYEE')
    setJobTitle('')
    setCompanyId('')
    setDepartmentId('')
    setHireDate('')
    setBirthDate('')
    setGender('')
    setMatricule('')
    setCin('')
    setCnss('')
    setRib('')
    setAddress('')
    setCity('')
    setBalanceConge('0')
    setBalanceRecuperation('0')
    setCategoryId('')
  }

  async function handleSubmit() {
    if (!fullName.trim()) {
      toast.error('Le nom complet est obligatoire')
      return
    }
    if (!email.trim()) {
      toast.error("L'email est obligatoire")
      return
    }
    if (!password || password.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères')
      return
    }
    if (!companyId) {
      toast.error('La société est obligatoire')
      return
    }
    if (!departmentId) {
      toast.error('Le département est obligatoire')
      return
    }
    if (!hireDate) {
      toast.error("La date d'embauche est obligatoire")
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        role,
        company_id: companyId,
        department_id: departmentId,
        hire_date: hireDate,
      }
      if (categoryId) payload.category_id = categoryId
      if (phone.trim()) payload.phone = phone.trim()
      if (jobTitle.trim()) payload.job_title = jobTitle.trim()
      if (birthDate) payload.birth_date = birthDate
      if (gender) payload.gender = gender
      if (matricule.trim()) payload.matricule = matricule.trim()
      if (cin.trim()) payload.cin = cin.trim()
      if (cnss.trim()) payload.cnss = cnss.trim()
      if (rib.trim()) payload.rib = rib.trim()
      if (address.trim()) payload.address = address.trim()
      if (city.trim()) payload.city = city.trim()

      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.code === '23505') {
          toast.error('Un employé avec cet email existe déjà')
        } else {
          toast.error(data.error || "Erreur lors de la création de l'employé")
        }
        return
      }

      toast.success(`${fullName.trim()} a été ajouté avec succès`)
      resetForm()
      onOpenChange(false)
      onCreated()
    } catch (err) {
      console.error('Create employee error:', err)
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
            <UserPlus className="h-5 w-5 text-primary" />
            Nouvel employé
          </DialogTitle>
          <DialogDescription>Remplissez les informations pour créer un nouveau compte employé.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Identity */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Nom complet *</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Prénom Nom" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="password">Mot de passe *</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 6 caractères" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Téléphone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 XX XX XX XX" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gender">Genre</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger id="gender" className="w-full">
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Homme</SelectItem>
                  <SelectItem value="F">Femme</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Rôle *</Label>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger id="role" className="w-full">
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

          {/* Role & Job */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="jobTitle">Poste</Label>
              <Input id="jobTitle" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Intitulé du poste" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="birthDate">Date de naissance</Label>
              <Input id="birthDate" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </div>
          </div>

          {/* Company & Department */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="company">Société *</Label>
              <Select
                value={companyId}
                onValueChange={(v) => {
                  setCompanyId(v)
                  setDepartmentId('')
                }}
              >
                <SelectTrigger id="company" className="w-full">
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="department">Département *</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger id="department" className="w-full">
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {filteredDepartments.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category & Hire Date */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="category">Catégorie</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="category" className="w-full">
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hireDate">Date d&apos;embauche *</Label>
              <Input id="hireDate" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
            </div>
          </div>

          {/* Matricule */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="matricule">Matricule</Label>
              <Input id="matricule" value={matricule} onChange={(e) => setMatricule(e.target.value)} />
            </div>
            <div className="space-y-1.5" />
          </div>

          {/* Administrative */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cin">CIN</Label>
              <Input id="cin" value={cin} onChange={(e) => setCin(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cnss">CNSS</Label>
              <Input id="cnss" value={cnss} onChange={(e) => setCnss(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rib">RIB</Label>
              <Input id="rib" value={rib} onChange={(e) => setRib(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Ville</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>

          {/* Address */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="address">Adresse</Label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-1.5" />
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Créer l&apos;employé
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
