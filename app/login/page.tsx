'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2, Sparkles } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      })

      if (authError) {
        if (authError.message.includes('Invalid')) {
          toast.error('Email ou mot de passe invalide')
        } else {
          toast.error(authError.message)
        }
        setIsLoading(false)
        return
      }

      if (!authData.user) {
        toast.error('Erreur de connexion')
        setIsLoading(false)
        return
      }

      const { data: userData, error: userError } = await supabase
        .from('utilisateurs')
        .select('*')
        .eq('id', authData.user.id)
        .single()

      if (userError || !userData) {
        toast.error('Erreur: Impossible de charger le profil utilisateur')
        console.error('Profile Load Error:', userError)
        await supabase.auth.signOut()
        setIsLoading(false)
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = userData as any
      localStorage.setItem('user', JSON.stringify(user))
      localStorage.setItem('userId', user.id)
      localStorage.setItem('userRole', user.role)

      toast.success('Connexion réussie!')
      router.push('/dashboard')
      router.refresh()
    } catch (error) {
      console.error('Login error:', error)
      toast.error("Une erreur s'est produite lors de la connexion")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,color-mix(in_oklab,var(--primary)_20%,white)_0,transparent_36%),radial-gradient(circle_at_90%_88%,color-mix(in_oklab,var(--status-draft-bg)_65%,white)_0,transparent_42%)]" />

      <div className="surface-shell relative z-10 grid w-full max-w-5xl gap-3 rounded-[2rem] p-3 lg:grid-cols-[1.15fr_0.95fr]">
        <section className="hidden rounded-[1.65rem] border border-border/70 bg-card/88 p-10 lg:flex lg:flex-col lg:justify-between">
          <div>
            <Badge variant="secondary" className="mb-5 border border-border/70">
              Smartflow Conge
            </Badge>
            <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-[-0.02em] text-foreground">
              Une gestion des conges plus douce, plus claire, plus rapide.
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
              Centralisez vos demandes, suivez les validations et gardez un pilotage fluide de votre planning RH.
            </p>
          </div>

          <div className="space-y-3 rounded-2xl border border-border/70 bg-secondary/35 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Design Soft-Elegance SaaS
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Interface aerienne, surfaces arrondies et hierarchie visuelle douce pour les operations quotidiennes.
            </p>
          </div>
        </section>

        <Card className="justify-center rounded-[1.65rem] border-border/70 bg-background/92 py-0 shadow-[0_20px_44px_color-mix(in_oklab,var(--foreground)_10%,transparent)]">
          <CardHeader className="px-8 pt-8 pb-4 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary text-2xl font-bold text-primary-foreground shadow-[0_14px_36px_color-mix(in_oklab,var(--primary)_33%,transparent)]">
              SF
            </div>
            <CardTitle className="text-2xl font-semibold tracking-tight">Connexion</CardTitle>
            <CardDescription className="text-sm">Accedez a votre espace SMARTFLOW</CardDescription>
          </CardHeader>

          <CardContent className="px-8 pb-8">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email professionnel</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john.doe@ath.ma"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="pr-11"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
                    disabled={isLoading}
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                  <input type="checkbox" className="rounded-full border-border" />
                  <span>Se souvenir de moi</span>
                </label>
                <button
                  type="button"
                  className="font-medium text-primary transition-colors hover:text-primary/80"
                  onClick={() => router.push('/reset-password')}
                >
                  Mot de passe oublie ?
                </button>
              </div>

              <Button type="submit" className="mt-2 w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connexion en cours...
                  </>
                ) : (
                  'Se connecter'
                )}
              </Button>
            </form>

            <div className="mt-6 space-y-1 rounded-2xl border border-border/70 bg-secondary/35 p-3.5 text-center">
              <p className="text-sm text-muted-foreground">
                Premiere connexion: <span className="font-mono font-semibold text-foreground">login1A</span>
              </p>
              <p className="text-xs text-muted-foreground">Le mot de passe peut etre modifie depuis le profil.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
