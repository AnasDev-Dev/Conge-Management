'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import Link from 'next/link'
import { FileText, PlusCircle, Search, Calendar, Clock } from 'lucide-react'
import { LeaveRequest, Utilisateur } from '@/lib/types/database'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function RequestsPage() {
  const [user, setUser] = useState<Utilisateur | null>(null)
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [filteredRequests, setFilteredRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const supabase = createClient()

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      const userData = JSON.parse(userStr)
      setUser(userData)
      loadRequests(userData.id)
    }
  }, [])

  useEffect(() => {
    filterRequests()
  }, [requests, searchTerm, statusFilter])

  const loadRequests = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setRequests(data || [])
      setFilteredRequests(data || [])
    } catch (error) {
      console.error('Error loading requests:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterRequests = () => {
    let filtered = requests

    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(r => r.status === statusFilter)
    }

    if (searchTerm) {
      filtered = filtered.filter(r => 
        r.reason?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.request_type.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    setFilteredRequests(filtered)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'status-pending'
      case 'VALIDATED_DC':
      case 'VALIDATED_RP':
      case 'VALIDATED_TG':
      case 'VALIDATED_DE':
        return 'status-progress'
      case 'APPROVED':
        return 'status-approved'
      case 'REJECTED':
        return 'status-rejected'
      case 'CANCELLED':
        return 'status-neutral'
      default:
        return 'status-neutral'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'En attente'
      case 'VALIDATED_DC':
        return 'Approuvé par Chef'
      case 'VALIDATED_RP':
        return 'Approuvé par RH'
      case 'VALIDATED_TG':
        return 'Approuvé par Trésorier'
      case 'VALIDATED_DE':
        return 'Approuvé par Directeur'
      case 'APPROVED':
        return 'Approuvé'
      case 'REJECTED':
        return 'Rejeté'
      case 'CANCELLED':
        return 'Annulé'
      default:
        return status
    }
  }

  const getStatusIcon = (status: string) => {
    if (status === 'APPROVED') return '✅'
    if (status === 'REJECTED') return '❌'
    if (status === 'PENDING') return '🟡'
    if (status.startsWith('VALIDATED_')) return '🔵'
    return '⚫'
  }

  if (!user) return null

  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === 'PENDING' || r.status.startsWith('VALIDATED_')).length,
    approved: requests.filter(r => r.status === 'APPROVED').length,
    rejected: requests.filter(r => r.status === 'REJECTED').length,
  }

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Mes demandes de congé</h1>
          <p className="mt-2 text-muted-foreground">Consultez et gérez toutes vos demandes</p>
        </div>
        <Link href="/dashboard/new-request">
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            Nouvelle demande
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="border-border/70">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-foreground">{stats.total}</div>
            <p className="mt-1 text-sm text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-[var(--status-pending-text)]">{stats.pending}</div>
            <p className="mt-1 text-sm text-muted-foreground">En attente</p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-[var(--status-success-text)]">{stats.approved}</div>
            <p className=" mt-1 text-sm text-muted-foreground">Approuvées</p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-[var(--status-alert-text)]">{stats.rejected}</div>
            <p className="mt-1 text-sm text-muted-foreground">Rejetées</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-border/70">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                <Input
                  placeholder="Rechercher par motif, type, statut..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-11"
                />
              </div>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-11 rounded-2xl border border-input bg-background/70 px-4 text-sm outline-none ring-offset-background transition focus:border-ring focus:ring-2 focus:ring-ring/60"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="PENDING">En attente</option>
              <option value="VALIDATED_DC">Approuvé par Chef</option>
              <option value="VALIDATED_RP">Approuvé par RH</option>
              <option value="APPROVED">Approuvé</option>
              <option value="REJECTED">Rejeté</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Requests List */}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Liste des demandes ({filteredRequests.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
              <p className="mt-4 text-muted-foreground">Chargement des demandes...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto mb-4 h-16 w-16 text-muted-foreground/45" />
              <h3 className="mb-2 text-lg font-medium text-foreground">
                {searchTerm || statusFilter !== 'ALL' ? 'Aucune demande trouvée' : 'Aucune demande de congé'}
              </h3>
              <p className="mb-6 text-muted-foreground">
                {searchTerm || statusFilter !== 'ALL' 
                  ? 'Essayez de modifier vos filtres de recherche'
                  : 'Commencez par créer votre première demande de congé'
                }
              </p>
              {!searchTerm && statusFilter === 'ALL' && (
                <Link href="/dashboard/new-request">
                  <Button>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Créer une demande
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRequests.map((request) => (
                <Link 
                  key={request.id} 
                  href={`/dashboard/requests/${request.id}`}
                  className="block"
                >
                  <div className="soft-row cursor-pointer rounded-2xl px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap mb-3">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold text-foreground">
                              {format(new Date(request.start_date), 'dd MMM', { locale: fr })} - {' '}
                              {format(new Date(request.end_date), 'dd MMM yyyy', { locale: fr })}
                            </span>
                          </div>
                          <Badge className={getStatusColor(request.status)}>
                            {getStatusIcon(request.status)} {getStatusLabel(request.status)}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">Type:</span>
                            <span className="ml-2 font-medium text-foreground">{request.request_type}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Durée:</span>
                            <span className="ml-2 font-medium text-foreground">{request.days_count} jours</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Soumis le:</span>
                            <span className="ml-2 font-medium text-foreground">
                              {format(new Date(request.created_at), 'dd/MM/yyyy', { locale: fr })}
                            </span>
                          </div>
                          {request.return_date && (
                            <div>
                              <span className="text-muted-foreground">Reprise:</span>
                              <span className="ml-2 font-medium text-foreground">
                                {format(new Date(request.return_date), 'dd/MM/yyyy', { locale: fr })}
                              </span>
                            </div>
                          )}
                        </div>

                        {request.reason && (
                          <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">
                            <Clock className="inline h-3 w-3 mr-1" />
                            {request.reason}
                          </p>
                        )}
                      </div>

                      <Button variant="ghost" size="sm">
                        Voir détails →
                      </Button>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
