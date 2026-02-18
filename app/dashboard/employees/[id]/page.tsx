'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LeaveRequest, Utilisateur } from '@/lib/types/database'
import { ArrowLeft, Calendar, Clock, FileText, User } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { getStatusClass, getStatusLabel } from '@/lib/constants'

type EmployeeDetails = Pick<
  Utilisateur,
  'id' | 'full_name' | 'email' | 'job_title' | 'role' | 'is_active' | 'phone' | 'balance_conge' | 'balance_recuperation'
>

type RequestDetails = Pick<
  LeaveRequest,
  'id' | 'request_type' | 'start_date' | 'end_date' | 'days_count' | 'status' | 'reason' | 'created_at' | 'return_date'
>

const approvedStatuses = new Set(['APPROVED', 'VALIDATED_DE'])
const pendingStatuses = new Set(['PENDING', 'VALIDATED_DC', 'VALIDATED_RP'])

export default function EmployeeDetailsPage() {
  const params = useParams<{ id: string }>()
  const [employee, setEmployee] = useState<EmployeeDetails | null>(null)
  const [requests, setRequests] = useState<RequestDetails[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const loadData = useCallback(async (employeeId: string) => {
    try {
      const [{ data: employeeData, error: employeeError }, { data: requestData, error: requestError }] =
        await Promise.all([
          supabase
            .from('utilisateurs')
            .select('id, full_name, email, job_title, role, is_active, phone, balance_conge, balance_recuperation')
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
    const requestedDays = requests.reduce((sum, req) => sum + (req.days_count || 0), 0)
    const approvedDays = requests
      .filter((req) => approvedStatuses.has(req.status))
      .reduce((sum, req) => sum + (req.days_count || 0), 0)
    const pendingRequests = requests.filter((req) => pendingStatuses.has(req.status)).length
    const rejectedRequests = requests.filter((req) => req.status === 'REJECTED').length

    return {
      totalRequests,
      requestedDays,
      approvedDays,
      pendingRequests,
      rejectedRequests,
    }
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

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/employees">
            <Button variant="ghost" size="sm" className="mb-2">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour aux employés
            </Button>
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{employee.full_name}</h1>
          <p className="mt-2 text-muted-foreground">Historique et détails des demandes de congé</p>
        </div>
        <Badge variant="secondary" className="border border-border/70">
          {employee.role}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border-border/70">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Demandes</p>
            <p className="mt-2 text-2xl font-semibold">{summary.totalRequests}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Jours demandés</p>
            <p className="mt-2 text-2xl font-semibold">{summary.requestedDays}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Congé pris</p>
            <p className="mt-2 text-2xl font-semibold text-primary">{summary.approvedDays}</p>
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

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Informations employé
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
              <p className="mt-1 text-sm text-foreground">{employee.email || 'Non renseigné'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Poste</p>
              <p className="mt-1 text-sm text-foreground">{employee.job_title || 'Non renseigné'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Téléphone</p>
              <p className="mt-1 text-sm text-foreground">{employee.phone || 'Non renseigné'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Soldes</p>
              <p className="mt-1 text-sm text-foreground">
                {employee.balance_conge} congé / {employee.balance_recuperation} récupération
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Détails des congés
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
    </div>
  )
}
