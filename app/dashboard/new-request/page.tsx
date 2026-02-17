'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Calendar, Loader2, AlertCircle } from 'lucide-react'
import { Utilisateur } from '@/lib/types/database'
import { format, addDays } from 'date-fns'
import { fr } from 'date-fns/locale'

type Colleague = Pick<Utilisateur, 'id' | 'full_name' | 'job_title'>

export default function NewRequestPage() {
  const [user, setUser] = useState<Utilisateur | null>(null)
  const [requestType, setRequestType] = useState<'CONGE' | 'RECUPERATION'>('CONGE')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [replacementId, setReplacementId] = useState('')
  const [colleagues, setColleagues] = useState<Colleague[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      const userData = JSON.parse(userStr)
      setUser(userData)
      loadColleagues(userData.department_id)
    }
  }, [])

  const loadColleagues = async (departmentId: number | null) => {
    if (!departmentId) return
    
    try {
      const { data, error } = await supabase
        .from('utilisateurs')
        .select('id, full_name, job_title')
        .eq('department_id', departmentId)
        .eq('is_active', true)
        .order('full_name')

      if (error) throw error
      setColleagues(data || [])
    } catch (error) {
      console.error('Error loading colleagues:', error)
    }
  }

  const calculateWorkingDays = () => {
    if (!startDate || !endDate) return 0
    const start = new Date(startDate)
    const end = new Date(endDate)
    
    // Simple working days calculation (excluding weekends)
    let days = 0
    let currentDate = new Date(start)
    
    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay()
      // Exclude Saturday (6) and Sunday (0)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        days++
      }
      currentDate = addDays(currentDate, 1)
    }
    
    return days
  }

  const workingDays = calculateWorkingDays()
  const availableBalance = requestType === 'CONGE' ? user?.balance_conge || 0 : user?.balance_recuperation || 0
  const balanceAfter = availableBalance - workingDays

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!user) return
    
    // Validation
    if (workingDays <= 0) {
      toast.error('La date de fin doit être après la date de début')
      return
    }
    
    if (balanceAfter < 0) {
      toast.error(`Solde insuffisant. Vous n'avez que ${availableBalance} jours disponibles.`)
      return
    }

    setIsSubmitting(true)

    try {
      const returnDate = addDays(new Date(endDate), 1)
      
      const { error } = await supabase
        .from('leave_requests')
        .insert({
          user_id: user.id,
          request_type: requestType,
          start_date: startDate,
          end_date: endDate,
          days_count: workingDays,
          return_date: format(returnDate, 'yyyy-MM-dd'),
          replacement_user_id: replacementId || null,
          status: 'PENDING',
          reason: reason || null,
          balance_before: availableBalance,
          balance_conge_used: requestType === 'CONGE' ? workingDays : 0,
          balance_recuperation_used: requestType === 'RECUPERATION' ? workingDays : 0,
        })
        .select()
        .single()

      if (error) throw error

      toast.success('Demande de congé soumise avec succès !')
      router.push('/dashboard/requests')
    } catch (error) {
      console.error('Error submitting request:', error)
      toast.error('Erreur lors de la soumission de la demande')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!user) return null

  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Nouvelle demande de congé</h1>
        <p className="mt-2 text-muted-foreground">Remplissez le formulaire pour soumettre votre demande</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Request Type */}
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Type de demande *</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setRequestType('CONGE')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  requestType === 'CONGE'
                    ? 'border-primary/40 bg-primary/10'
                    : 'border-border/70 hover:border-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <div className="font-semibold text-lg">CONGÉ</div>
                    <div className="mt-1 text-sm text-muted-foreground">Congé annuel</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Disponible: {user.balance_conge} jours
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 ${
                    requestType === 'CONGE' ? 'border-primary bg-primary' : 'border-border'
                  }`}>
                    {requestType === 'CONGE' && (
                      <svg className="w-full h-full text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRequestType('RECUPERATION')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  requestType === 'RECUPERATION'
                    ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)]'
                    : 'border-border/70 hover:border-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <div className="font-semibold text-lg">RÉCUPÉRATION</div>
                    <div className="mt-1 text-sm text-muted-foreground">Jours de récupération</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Disponible: {user.balance_recuperation} jours
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 ${
                    requestType === 'RECUPERATION' ? 'border-[var(--status-success-text)] bg-[var(--status-success-text)]' : 'border-border'
                  }`}>
                    {requestType === 'RECUPERATION' && (
                      <svg className="w-full h-full text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Dates */}
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Période du congé *</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Date de début</Label>
                <div className="relative">
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    min={format(new Date(), 'yyyy-MM-dd')}
                    className="pl-10"
                  />
                  <Calendar className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate">Date de fin</Label>
                <div className="relative">
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                    min={startDate || format(new Date(), 'yyyy-MM-dd')}
                    className="pl-10"
                  />
                  <Calendar className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
            </div>

            {startDate && endDate && workingDays > 0 && (
              <div className="status-progress rounded-2xl border p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      Durée calculée: {workingDays} jours ouvrables
                    </p>
                    <p className="mt-1 text-sm">
                      Date de reprise: {format(addDays(new Date(endDate), 1), 'EEEE dd MMMM yyyy', { locale: fr })}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Replacement */}
        {colleagues.length > 0 && (
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Remplaçant (Optionnel)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="replacement">Sélectionnez un collègue</Label>
                <select
                  id="replacement"
                  value={replacementId}
                  onChange={(e) => setReplacementId(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-input bg-background/70 px-4 text-sm outline-none ring-offset-background transition focus:border-ring focus:ring-2 focus:ring-ring/60"
                >
                  <option value="">Aucun remplaçant</option>
                  {colleagues
                    .filter(c => c.id !== user.id)
                    .map((colleague) => (
                      <option key={colleague.id} value={colleague.id}>
                        {colleague.full_name} {colleague.job_title && `- ${colleague.job_title}`}
                      </option>
                    ))}
                </select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reason */}
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Motif (Optionnel)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Indiquez le motif de votre demande de congé..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={500}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {reason.length}/500 caractères
            </p>
          </CardContent>
        </Card>

        {/* Summary */}
        <Card className="border-border/70 bg-secondary/35">
          <CardHeader>
            <CardTitle>Récapitulatif</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Type de demande:</span>
              <span className="font-medium">{requestType}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Jours demandés:</span>
              <span className="font-medium">{workingDays} jours</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Solde actuel:</span>
              <span className="font-medium">{availableBalance} jours</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-3">
              <span className="font-medium text-foreground">Solde après demande:</span>
              <span className={`font-bold ${balanceAfter >= 0 ? 'text-[var(--status-success-text)]' : 'text-[var(--status-alert-text)]'}`}>
                {balanceAfter} jours
              </span>
            </div>
            
            {balanceAfter < 0 && (
              <div className="status-rejected rounded-2xl border p-3">
                <p className="text-sm">
                  ⚠️ Solde insuffisant ! Veuillez réduire la durée de votre demande.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={isSubmitting || balanceAfter < 0 || workingDays <= 0}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Soumission en cours...
              </>
            ) : (
              'Soumettre la demande'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
