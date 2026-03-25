'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { LeaveRequest, Utilisateur } from '@/lib/types/database'
import { ArrowLeft, Calendar, Clock, FileText, Mail, Pencil, Phone, Trash2, User } from 'lucide-react'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { PageGuard } from '@/components/role-gate'
import { usePermissions } from '@/lib/hooks/use-permissions'
import { EditEmployeeDialog } from '@/components/edit-employee-dialog'
import { DeleteEmployeeDialog } from '@/components/delete-employee-dialog'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { getStatusClass, getStatusLabel } from '@/lib/constants'
import { calculateSeniority, calculateMonthlyAccrual, roundHalf } from '@/lib/leave-utils'
import Image from 'next/image'
import { useCompanyContext } from '@/lib/hooks/use-company-context'
import { getCompanyLogo } from '@/lib/company-logos'

type EmployeeDetails = Pick<
  Utilisateur,
  'id' | 'full_name' | 'email' | 'job_title' | 'role' | 'is_active' | 'phone' | 'balance_conge' | 'balance_recuperation' | 'hire_date' | 'birth_date' | 'gender' | 'matricule' | 'company_id' | 'department_id' | 'category_id'
> & {
  cin?: string | null
  cnss?: string | null
  rib?: string | null
  address?: string | null
  city?: string | null
  date_anciennete?: string | null
  annual_leave_days?: number | null
  departments?: { annual_leave_days: number }[] | { annual_leave_days: number } | null
}

type RequestDetails = Pick<
  LeaveRequest,
  'id' | 'request_type' | 'start_date' | 'end_date' | 'days_count' | 'status' | 'reason' | 'created_at' | 'return_date'
>

const approvedStatuses = new Set(['APPROVED'])
const pendingStatuses = new Set(['PENDING', 'VALIDATED_DC', 'VALIDATED_RP'])

export default function EmployeeDetailsPage() {
  const { user: currentUser } = useCurrentUser()
  const { activeCompany } = useCompanyContext()
  const { can } = usePermissions(currentUser?.role || 'EMPLOYEE')
  const params = useParams<{ id: string }>()
  const [employee, setEmployee] = useState<EmployeeDetails | null>(null)
  const [requests, setRequests] = useState<RequestDetails[]>([])
  const [chefService, setChefService] = useState<{ full_name: string; job_title: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const loadData = useCallback(async (employeeId: string) => {
    try {
      const [{ data: employeeData, error: employeeError }, { data: requestData, error: requestError }] =
        await Promise.all([
          supabase
            .from('utilisateurs')
            .select('id, full_name, email, job_title, role, is_active, phone, balance_conge, balance_recuperation, hire_date, birth_date, gender, matricule, company_id, department_id, category_id, cin, cnss, rib, address, city, date_anciennete, annual_leave_days, departments(annual_leave_days)')
            .eq('id', employeeId)
            .single(),
          supabase
            .from('leave_requests')
            .select('id, request_type, start_date, end_date, days_count, status, reason, created_at, return_date')
            .eq('user_id', employeeId)
            .order('created_at', { ascending: false }),
        ])

      if (employeeError) throw employeeError
      if (requestError) throw requestError

      setEmployee(employeeData as EmployeeDetails)
      setRequests((requestData || []) as RequestDetails[])

      // Fetch CHEF_SERVICE of the same department as the superior
      if (employeeData?.department_id) {
        const { data: chefData } = await supabase
          .from('utilisateurs')
          .select('full_name, job_title')
          .eq('department_id', employeeData.department_id)
          .eq('role', 'CHEF_SERVICE')
          .eq('is_active', true)
          .neq('id', employeeId)
          .limit(1)
          .single()
        if (chefData) setChefService(chefData)
      }
    } catch (error) {
      console.error('Error loading employee details:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    if (params.id) {
      loadData(params.id)
    }
  }, [params.id, loadData])

  const summary = useMemo(() => {
    const totalRequests = requests.length
    const approvedDays = requests
      .filter((req) => approvedStatuses.has(req.status))
      .reduce((sum, req) => sum + (req.days_count || 0), 0)
    const pendingRequests = requests.filter((req) => pendingStatuses.has(req.status)).length
    const rejectedRequests = requests.filter((req) => req.status === 'REJECTED').length

    return { totalRequests, approvedDays, pendingRequests, rejectedRequests }
  }, [requests])

  if (loading) {
    return (
      <div className="py-14 text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        <p className="mt-4 text-muted-foreground">Chargement des informations employé...</p>
      </div>
    )
  }

  if (!employee) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-lg font-medium text-foreground">Employé introuvable</p>
        <Link href="/dashboard/employees">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour à la liste
          </Button>
        </Link>
      </div>
    )
  }

  const deptDays = Array.isArray(employee.departments)
    ? (employee.departments as unknown as { annual_leave_days: number }[])[0]?.annual_leave_days
    : employee.departments?.annual_leave_days
  const seniority = calculateSeniority(employee.hire_date ?? null, deptDays)
  const currentYear = new Date().getFullYear()
  const congeUsed = requests
    .filter(r => r.request_type === 'CONGE' && r.status === 'APPROVED' && new Date(r.start_date).getFullYear() === currentYear)
    .reduce((sum, r) => sum + (r.days_count || 0), 0)
  const congePending = requests
    .filter(r => r.request_type === 'CONGE' && pendingStatuses.has(r.status) && new Date(r.start_date).getFullYear() === currentYear)
    .reduce((sum, r) => sum + (r.days_count || 0), 0)
  const accrual = calculateMonthlyAccrual(seniority.totalEntitlement, employee.balance_conge, congeUsed, congePending)

  return (
    <PageGuard userRole={currentUser?.role || 'EMPLOYEE'} page="employee-detail">
    <div className="mx-auto max-w-5xl space-y-7">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/employees">
            <Button variant="ghost" size="sm" className="mb-2">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour aux employés
            </Button>
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{employee.full_name}</h1>
          <p className="mt-1 text-muted-foreground">Fiche employé et historique des congés</p>
        </div>
        <div className="flex items-center gap-2">
          {can('employees.edit') && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Modifier
            </Button>
          )}
          {can('employees.delete') && (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Désactiver
            </Button>
          )}
        </div>
      </div>

      {/* Profile-like layout: sidebar + details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left sidebar card */}
        <Card className="border-border/70 lg:col-span-1">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="relative mx-auto w-fit">
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-border bg-muted/60">
                  <User className="h-11 w-11 text-muted-foreground/70" />
                </div>
                <div className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-background bg-white shadow-sm">
                  <Image
                    src={getCompanyLogo(activeCompany?.name)}
                    alt={activeCompany?.name || 'Logo'}
                    width={28}
                    height={28}
                    className="h-7 w-7 object-contain"
                  />
                </div>
              </div>
              <h2 className="mt-4 text-xl font-bold">{employee.full_name}</h2>
              <p className="text-muted-foreground">{employee.job_title || 'Non renseigné'}</p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <Badge>{employee.role}</Badge>
                {!employee.is_active && (
                  <Badge variant="destructive">Inactif</Badge>
                )}
              </div>
            </div>

            <Separator className="my-6" />

            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">{employee.email || 'Non renseigné'}</span>
              </div>
              {employee.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground">{employee.phone}</span>
                </div>
              )}
            </div>

            <Separator className="my-6" />

            {/* Leave balance summary */}
            {can('employees.viewBalances') && (
              <div className="space-y-3">
                <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                  <p className="text-xs text-muted-foreground">Solde congé</p>
                  <p className={`mt-1 text-2xl font-bold ${accrual.availableNow < 0 ? 'text-red-500' : 'text-primary'}`}>{accrual.availableNow}j</p>
                  {(congeUsed > 0 || congePending > 0) && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Consommé: {roundHalf(congeUsed + congePending)}j
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-4">
                  <p className="text-xs text-muted-foreground">Récupération</p>
                  <p className="mt-1 text-2xl font-bold text-[var(--status-success-text)]">{roundHalf(employee.balance_recuperation)}j</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right details card */}
        <Card className="border-border/70 lg:col-span-2">
          <CardHeader>
            <CardTitle>Informations personnelles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-muted-foreground">Nom complet</p>
                <p className="font-medium mt-1">{employee.full_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium mt-1">{employee.email || 'Non renseigné'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Téléphone</p>
                <p className="font-medium mt-1">{employee.phone || 'Non renseigné'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Genre</p>
                <p className="font-medium mt-1">{employee.gender === 'M' ? 'Homme' : employee.gender === 'F' ? 'Femme' : 'Non renseigné'}</p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-muted-foreground">Fonction</p>
                <p className="font-medium mt-1">{employee.job_title || 'Non renseigné'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Rôle</p>
                <p className="font-medium mt-1">{employee.role}</p>
              </div>
              {employee.matricule && (
                <div>
                  <p className="text-sm text-muted-foreground">Matricule</p>
                  <p className="font-medium mt-1">{employee.matricule}</p>
                </div>
              )}
              {employee.hire_date && (
                <div>
                  <p className="text-sm text-muted-foreground">Date d&apos;embauche</p>
                  <p className="font-medium mt-1">
                    {format(new Date(employee.hire_date), 'dd MMMM yyyy', { locale: fr })}
                  </p>
                </div>
              )}
              {employee.date_anciennete && (
                <div>
                  <p className="text-sm text-muted-foreground">Date d&apos;ancienneté</p>
                  <p className="font-medium mt-1">
                    {format(new Date(employee.date_anciennete), 'dd MMMM yyyy', { locale: fr })}
                  </p>
                </div>
              )}
              {employee.birth_date && (
                <div>
                  <p className="text-sm text-muted-foreground">Date de naissance</p>
                  <p className="font-medium mt-1">
                    {format(new Date(employee.birth_date), 'dd MMMM yyyy', { locale: fr })}
                  </p>
                </div>
              )}
              {employee.hire_date && (
                <div>
                  <p className="text-sm text-muted-foreground">Ancienneté</p>
                  <p className="font-medium mt-1">{Math.floor(seniority.yearsOfService)} an(s)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Dotation annuelle: {seniority.totalEntitlement} jours
                    {seniority.bonusDays > 0 && ` (dont ${seniority.bonusDays} bonus ancienneté)`}
                  </p>
                </div>
              )}
              {chefService && (
                <div>
                  <p className="text-sm text-muted-foreground">Responsable (N+1)</p>
                  <p className="font-medium mt-1">{chefService.full_name}</p>
                  {chefService.job_title && (
                    <p className="text-xs text-muted-foreground mt-0.5">{chefService.job_title}</p>
                  )}
                </div>
              )}
            </div>

            {(employee.cin || employee.cnss || employee.rib) && (
              <>
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {employee.cin && (
                    <div>
                      <p className="text-sm text-muted-foreground">CIN</p>
                      <p className="font-medium mt-1">{employee.cin}</p>
                    </div>
                  )}
                  {employee.cnss && (
                    <div>
                      <p className="text-sm text-muted-foreground">CNSS</p>
                      <p className="font-medium mt-1">{employee.cnss}</p>
                    </div>
                  )}
                  {employee.rib && (
                    <div>
                      <p className="text-sm text-muted-foreground">RIB</p>
                      <p className="font-medium mt-1">{employee.rib}</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {(employee.address || employee.city) && (
              <>
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {employee.city && (
                    <div>
                      <p className="text-sm text-muted-foreground">Ville</p>
                      <p className="font-medium mt-1">{employee.city}</p>
                    </div>
                  )}
                  {employee.address && (
                    <div>
                      <p className="text-sm text-muted-foreground">Adresse</p>
                      <p className="font-medium mt-1">{employee.address}</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="border-border/70">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Demandes</p>
            <p className="mt-2 text-2xl font-semibold">{summary.totalRequests}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Congé pris</p>
            <p className="mt-2 text-2xl font-semibold text-primary">{summary.approvedDays}j</p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">En attente</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--status-pending-text)]">{summary.pendingRequests}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Rejetées</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--status-alert-text)]">{summary.rejectedRequests}</p>
          </CardContent>
        </Card>
      </div>

      {/* Leave requests history */}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Historique des congés
          </CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">Aucune demande de congé trouvée.</div>
          ) : (
            <div className="space-y-2">
              {requests.map((request) => (
                <div key={request.id} className="soft-row rounded-2xl px-4 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={getStatusClass(request.status)}>{getStatusLabel(request.status)}</Badge>
                        <Badge variant="secondary" className="border border-border/70">
                          {request.request_type}
                        </Badge>
                        <span className="text-sm font-medium text-foreground">{request.days_count} jours</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {format(new Date(request.start_date), 'dd MMM yyyy', { locale: fr })} -{' '}
                          {format(new Date(request.end_date), 'dd MMM yyyy', { locale: fr })}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          Soumise le {format(new Date(request.created_at), 'dd MMM yyyy', { locale: fr })}
                        </span>
                      </div>

                      {request.return_date && (
                        <p className="text-sm text-muted-foreground">
                          Reprise prévue: {format(new Date(request.return_date), 'dd MMM yyyy', { locale: fr })}
                        </p>
                      )}

                      {request.reason && <p className="text-sm text-foreground/90">{request.reason}</p>}
                    </div>

                    <Link href={`/dashboard/requests/${request.id}`}>
                      <Button variant="outline" size="sm">
                        Ouvrir la demande
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit / Delete dialogs */}
      {can('employees.edit') && (
        <EditEmployeeDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          onUpdated={() => { loadData(params.id); }}
          employee={employee}
        />
      )}
      {can('employees.delete') && (
        <DeleteEmployeeDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={() => { window.location.href = '/dashboard/employees'; }}
          employee={employee}
        />
      )}
    </div>
    </PageGuard>
  )
}
