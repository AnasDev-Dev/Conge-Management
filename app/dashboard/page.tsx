'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Calendar,
  Clock,
  CheckCircle2,
  PlusCircle,
  TrendingUp,
  FileText
} from 'lucide-react'
import Link from 'next/link'
import { LeaveRequest, Utilisateur } from '@/lib/types/database'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function DashboardPage() {
  const [user, setUser] = useState<Utilisateur | null>(null)
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      const userData = JSON.parse(userStr)
      setUser(userData)
      loadRequests(userData.id)
    }
  }, [])

  const loadRequests = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5)

      if (error) throw error
      setRequests(data || [])
    } catch (error) {
      console.error('Error loading requests:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

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
      default:
        return status
    }
  }

  return (
    <div className="space-y-9">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Bienvenue, {user.full_name.split(' ')[0]}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Voici un aperçu de votre gestion des congés
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Solde CONGÉ</CardTitle>
            <Calendar className="h-4 w-4 text-foreground/60" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{user.balance_conge} jours</div>
            <p className="mt-1 text-xs text-muted-foreground">Congé annuel restant</p>
            <div className="mt-3 h-2 w-full rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-foreground/80 transition-all"
                style={{ width: `${Math.min((user.balance_conge / 30) * 100, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">RÉCUPÉRATION</CardTitle>
            <TrendingUp className="h-4 w-4 text-foreground/60" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{user.balance_recuperation} jours</div>
            <p className="mt-1 text-xs text-muted-foreground">Jours de récupération disponibles</p>
            <div className="mt-3 h-2 w-full rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-foreground/65 transition-all"
                style={{ width: `${Math.min((user.balance_recuperation / 10) * 100, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Demandes en attente</CardTitle>
            <Clock className="h-4 w-4 text-foreground/60" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {requests.filter(r => r.status === 'PENDING' || r.status.startsWith('VALIDATED_')).length}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">En attente d&apos;approbation</p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Demandes approuvées</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-foreground/60" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {requests.filter(r => r.status === 'APPROVED').length}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Cette année</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Actions rapides</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/dashboard/new-request">
              <Button className="h-auto w-full py-6" size="lg">
                <PlusCircle className="mr-2 h-5 w-5" />
                <div className="text-left">
                  <div className="font-semibold">Nouvelle demande</div>
                  <div className="text-xs opacity-95">Soumettre une nouvelle demande</div>
                </div>
              </Button>
            </Link>
            
            <Link href="/dashboard/requests">
              <Button variant="outline" className="h-auto w-full border-border py-6 text-foreground" size="lg">
                <Clock className="mr-2 h-5 w-5" />
                <div className="text-left">
                  <div className="font-semibold">Voir toutes les demandes</div>
                  <div className="text-xs opacity-80">Vérifier le statut des demandes</div>
                </div>
              </Button>
            </Link>

            <Link href="/dashboard/calendar">
              <Button variant="outline" className="h-auto w-full border-border py-6 text-foreground" size="lg">
                <Calendar className="mr-2 h-5 w-5" />
                <div className="text-left">
                  <div className="font-semibold">Calendrier d&apos;équipe</div>
                  <div className="text-xs opacity-80">Voir les absences de l&apos;équipe</div>
                </div>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Recent Requests */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Demandes de congé récentes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-9 text-center text-muted-foreground">Chargement...</div>
          ) : requests.length === 0 ? (
            <div className="py-9 text-center text-muted-foreground">
              <FileText className="mx-auto mb-3 h-12 w-12 text-muted-foreground/60" />
              <p>Aucune demande de congé pour le moment</p>
              <Link href="/dashboard/new-request">
                <Button className="mt-4">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Créer votre première demande
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="soft-row flex items-center justify-between rounded-2xl px-5 py-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-medium">
                        {format(new Date(request.start_date), 'dd MMM', { locale: fr })} - {format(new Date(request.end_date), 'dd MMM yyyy', { locale: fr })}
                      </span>
                      <Badge className={getStatusColor(request.status)}>
                        {getStatusLabel(request.status)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{request.days_count} jours</span>
                      <span>•</span>
                      <span>{request.request_type}</span>
                      {request.reason && (
                        <>
                          <span>•</span>
                          <span className="text-muted-foreground">{request.reason}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Link href={`/dashboard/requests/${request.id}`}>
                    <Button variant="ghost" size="sm">
                      Voir détails
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
