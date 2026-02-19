'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Mail, Phone, Calendar, Lock, Eye, EyeOff, Loader2, User } from 'lucide-react'
import { Utilisateur } from '@/lib/types/database'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import Image from 'next/image'
import { calculateSeniority } from '@/lib/leave-utils'

export default function ProfilePage() {
  const [user, setUser] = useState<Utilisateur | null>(null)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      setUser(JSON.parse(userStr))
    }
  }, [])

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (newPassword !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas')
      return
    }

    if (newPassword.length < 8) {
      toast.error('Le mot de passe doit contenir au moins 8 caractères')
      return
    }

    setIsChangingPassword(true)

    try {
      // Update password using Supabase Auth
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) throw error

      toast.success('Mot de passe changé avec succès!')
      setShowPasswordForm(false)
      setNewPassword('')
      setConfirmPassword('')
    } catch (error) {
      console.error('Password change error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors du changement de mot de passe'
      toast.error(errorMessage)
    } finally {
      setIsChangingPassword(false)
    }
  }

  if (!user) return null

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Mon Profil</h1>
        <p className="mt-2 text-muted-foreground">Gérez vos informations personnelles et sécurité</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <Card className="border-border/70 lg:col-span-1">
          <CardContent className="pt-6">
            <div className="text-center">
              {/* Avatar + FRMG logo */}
              <div className="relative mx-auto w-fit">
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-border bg-muted/60">
                  <User className="h-11 w-11 text-muted-foreground/70" />
                </div>
                <div className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-background bg-white shadow-sm">
                  <Image
                    src="/logo/imgi_57_NV_LOGO_FRMG_ANG-AR-3-removebg-preview.png"
                    alt="FRMG"
                    width={28}
                    height={28}
                    className="h-7 w-7 object-contain"
                  />
                </div>
              </div>
              <h2 className="text-xl font-bold mt-4">{user.full_name}</h2>
              <p className="text-muted-foreground">{user.job_title}</p>
              <Badge className="mt-3">{user.role}</Badge>
            </div>

            <Separator className="my-6" />

            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">{user.email || 'Non renseigné'}</span>
              </div>
              {user.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground">{user.phone}</span>
                </div>
              )}
            </div>

            <Separator className="my-6" />

            <Button
              onClick={() => setShowPasswordForm(!showPasswordForm)}
              variant={showPasswordForm ? "secondary" : "outline"}
              className="w-full"
            >
              <Lock className="mr-2 h-4 w-4" />
              {showPasswordForm ? 'Annuler' : 'Changer le mot de passe'}
            </Button>
          </CardContent>
        </Card>

        {/* Details */}
        <Card className="border-border/70 lg:col-span-2">
          <CardHeader>
            <CardTitle>Informations personnelles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-muted-foreground">Nom complet</p>
                <p className="font-medium mt-1">{user.full_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Nom d&apos;utilisateur</p>
                <p className="font-medium mt-1">{user.username || 'Non renseigné'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium mt-1">{user.email || 'Non renseigné'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Téléphone</p>
                <p className="font-medium mt-1">{user.phone || 'Non renseigné'}</p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-muted-foreground">Fonction</p>
                <p className="font-medium mt-1">{user.job_title || 'Non renseigné'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Rôle</p>
                <p className="font-medium mt-1">{user.role}</p>
              </div>
              {user.matricule && (
                <div>
                  <p className="text-sm text-muted-foreground">Matricule</p>
                  <p className="font-medium mt-1">{user.matricule}</p>
                </div>
              )}
              {user.hire_date && (
                <div>
                  <p className="text-sm text-muted-foreground">Date d&apos;embauche</p>
                  <p className="font-medium mt-1">
                    {format(new Date(user.hire_date), 'dd MMMM yyyy', { locale: fr })}
                  </p>
                </div>
              )}
              {user.hire_date && (() => {
                const seniority = calculateSeniority(user.hire_date)
                return (
                  <div>
                    <p className="text-sm text-muted-foreground">Ancienneté</p>
                    <p className="font-medium mt-1">
                      {Math.floor(seniority.yearsOfService)} an(s)
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Droit annuel: {seniority.totalEntitlement} jours
                      {seniority.bonusDays > 0 && (
                        <span> (dont {seniority.bonusDays} bonus ancienneté)</span>
                      )}
                    </p>
                  </div>
                )
              })()}
            </div>

            {(user.cin || user.cnss || user.rib) && (
              <>
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {user.cin && (
                    <div>
                      <p className="text-sm text-muted-foreground">CIN</p>
                      <p className="font-medium mt-1">{user.cin}</p>
                    </div>
                  )}
                  {user.cnss && (
                    <div>
                      <p className="text-sm text-muted-foreground">CNSS</p>
                      <p className="font-medium mt-1">{user.cnss}</p>
                    </div>
                  )}
                  {user.rib && (
                    <div>
                      <p className="text-sm text-muted-foreground">RIB</p>
                      <p className="font-medium mt-1">{user.rib}</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {(user.address || user.city) && (
              <>
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {user.address && (
                    <div>
                      <p className="text-sm text-muted-foreground">Adresse</p>
                      <p className="font-medium mt-1">{user.address}</p>
                    </div>
                  )}
                  {user.city && (
                    <div>
                      <p className="text-sm text-muted-foreground">Ville</p>
                      <p className="font-medium mt-1">{user.city}</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Password Change Form */}
      {showPasswordForm && (
        <Card className="status-progress border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Changer le mot de passe
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nouveau mot de passe</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="Minimum 8 caractères"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    disabled={isChangingPassword}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Retapez le nouveau mot de passe"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={isChangingPassword}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowPasswordForm(false)
                    setNewPassword('')
                    setConfirmPassword('')
                  }}
                  disabled={isChangingPassword}
                  className="flex-1"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={isChangingPassword}
                  className="flex-1"
                >
                  {isChangingPassword ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Changement...
                    </>
                  ) : (
                    'Changer le mot de passe'
                  )}
                </Button>
              </div>
            </form>

            <div className="status-progress mt-4 rounded-2xl border p-3">
              <p className="text-sm">
                💡 <strong>Conseil :</strong> Utilisez un mot de passe fort avec au moins 8 caractères, incluant des lettres, chiffres et symboles.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leave Balance */}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Solde de congés</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-primary/25 bg-primary/9 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">CONGÉ Annuel</p>
                  <p className="mt-2 text-3xl font-bold text-primary">{user.balance_conge}</p>
                  <p className="mt-1 text-sm text-muted-foreground">jours disponibles</p>
                </div>
                <Calendar className="h-12 w-12 text-primary/30" />
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">RÉCUPÉRATION</p>
                  <p className="mt-2 text-3xl font-bold text-[var(--status-success-text)]">{user.balance_recuperation}</p>
                  <p className="mt-1 text-sm text-muted-foreground">jours disponibles</p>
                </div>
                <Calendar className="h-12 w-12 text-[var(--status-success-text)]/35" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
