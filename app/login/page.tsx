'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

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
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,color-mix(in_oklab,var(--primary)_20%,white)_0,transparent_36%),radial-gradient(circle_at_90%_88%,color-mix(in_oklab,var(--status-draft-bg)_65%,white)_0,transparent_42%)]" />

      <div className="surface-shell relative z-10 grid w-full max-w-5xl gap-0 overflow-hidden rounded-[2rem] lg:grid-cols-[1.15fr_0.95fr]">

        {/* ─── Left: Golf Illustration Panel ─── */}
        <section className="relative hidden overflow-hidden rounded-l-[1.85rem] bg-gradient-to-br from-[#2d5a3d] via-[#3a7a52] to-[#2d5a3d] lg:flex lg:flex-col lg:justify-between">

          {/* Animated background shapes */}
          <div className="pointer-events-none absolute inset-0">
            {/* Sky gradient overlay */}
            <div className="absolute inset-x-0 top-0 h-[45%] bg-gradient-to-b from-[#1a3a28]/60 to-transparent" />

            {/* Rolling hills */}
            <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 600 200" fill="none" preserveAspectRatio="none" style={{ height: '45%' }}>
              <path d="M0 120 C100 60 200 100 300 80 S500 50 600 90 L600 200 L0 200Z" fill="#245a38" opacity="0.5">
                <animate attributeName="d" dur="8s" repeatCount="indefinite" values="M0 120 C100 60 200 100 300 80 S500 50 600 90 L600 200 L0 200Z;M0 110 C100 80 200 60 300 90 S500 70 600 80 L600 200 L0 200Z;M0 120 C100 60 200 100 300 80 S500 50 600 90 L600 200 L0 200Z" />
              </path>
              <path d="M0 150 C150 100 250 140 350 110 S500 130 600 120 L600 200 L0 200Z" fill="#1e4d30" opacity="0.4">
                <animate attributeName="d" dur="10s" repeatCount="indefinite" values="M0 150 C150 100 250 140 350 110 S500 130 600 120 L600 200 L0 200Z;M0 140 C150 130 250 100 350 130 S500 110 600 140 L600 200 L0 200Z;M0 150 C150 100 250 140 350 110 S500 130 600 120 L600 200 L0 200Z" />
              </path>
            </svg>

            {/* Golf flag with gentle sway */}
            <svg className="absolute bottom-[38%] right-[28%] w-16 origin-bottom" viewBox="0 0 60 120" fill="none">
              <line x1="10" y1="0" x2="10" y2="120" stroke="white" strokeWidth="1.5" opacity="0.8" />
              <path d="M10 0 L45 15 L10 30Z" fill="#a3754a" opacity="0.9">
                <animateTransform attributeName="transform" type="rotate" values="-2 10 15;2 10 15;-2 10 15" dur="3s" repeatCount="indefinite" />
              </path>
              <circle cx="10" cy="120" r="3" fill="white" opacity="0.3" />
            </svg>

            {/* Golf ball with shadow */}
            <div className="absolute bottom-[26%] left-[22%] animate-[golf-bounce_4s_ease-in-out_infinite]">
              {/* Shadow */}
              <div className="absolute -bottom-1 left-1/2 h-2 w-6 -translate-x-1/2 rounded-full bg-black/15 blur-sm animate-[golf-shadow_4s_ease-in-out_infinite]" />
              {/* Ball */}
              <div className="relative h-6 w-6 rounded-full bg-white shadow-[inset_-2px_-2px_4px_rgba(0,0,0,0.1),0_2px_8px_rgba(0,0,0,0.2)]">
                <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40" />
              </div>
            </div>

            {/* Floating particles (like grass/leaves) */}
            <div className="absolute left-[15%] top-[30%] h-1.5 w-1.5 rounded-full bg-white/20 animate-[float-up_6s_ease-in-out_infinite]" />
            <div className="absolute left-[45%] top-[50%] h-1 w-1 rounded-full bg-white/15 animate-[float-up_8s_ease-in-out_2s_infinite]" />
            <div className="absolute left-[70%] top-[40%] h-1.5 w-1.5 rounded-full bg-white/20 animate-[float-up_7s_ease-in-out_4s_infinite]" />
            <div className="absolute left-[30%] top-[60%] h-1 w-1 rounded-full bg-white/10 animate-[float-up_9s_ease-in-out_1s_infinite]" />

            {/* Tee and ground detail */}
            <svg className="absolute bottom-[22%] left-[18%] w-20" viewBox="0 0 80 30" fill="none">
              <ellipse cx="40" cy="25" rx="35" ry="5" fill="#1a4d2e" opacity="0.4" />
            </svg>
          </div>

          {/* Content overlay */}
          <div className="relative z-10 flex flex-1 flex-col justify-between p-10">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-medium tracking-wide text-white/80 backdrop-blur-sm">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#a3754a] animate-pulse" />
                SMARTFLOW CONGE
              </div>

              <h1 className="max-w-[280px] text-[2.5rem] font-semibold leading-[1.1] tracking-[-0.03em] text-white">
                Where work meets
                <span className="mt-1 block bg-gradient-to-r from-[#a3754a] to-[#d4a574] bg-clip-text text-transparent">
                  the green.
                </span>
              </h1>

              <p className="mt-5 max-w-[260px] text-sm leading-relaxed text-white/55">
                Gérez vos congés avec la précision d&apos;un putt parfait. Simple, fluide, élégant.
              </p>
            </div>

            {/* Bottom stats strip */}
            <div className="flex gap-3">
              <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm">
                <p className="text-2xl font-semibold text-white">18</p>
                <p className="mt-0.5 text-[11px] text-white/45">Jours de congé</p>
              </div>
              <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm">
                <p className="text-2xl font-semibold text-[#a3754a]">Par</p>
                <p className="mt-0.5 text-[11px] text-white/45">Validation rapide</p>
              </div>
              <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm">
                <p className="text-2xl font-semibold text-white">4</p>
                <p className="mt-0.5 text-[11px] text-white/45">Étapes d&apos;approbation</p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Right: Sign-in Form ─── */}
        <Card className="justify-center rounded-none border-0 border-l border-border/50 bg-background/95 py-0 shadow-none lg:rounded-r-[1.85rem]">
          <CardHeader className="px-8 pt-10 pb-4 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary text-2xl font-bold text-primary-foreground shadow-[0_14px_36px_color-mix(in_oklab,var(--primary)_33%,transparent)]">
              SF
            </div>
            <CardTitle className="text-2xl font-semibold tracking-tight">Connexion</CardTitle>
            <CardDescription className="text-sm">Accédez à votre espace SMARTFLOW</CardDescription>
          </CardHeader>

          <CardContent className="px-8 pb-10">
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
                  Mot de passe oublié ?
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
                Première connexion: <span className="font-mono font-semibold text-foreground">login1A</span>
              </p>
              <p className="text-xs text-muted-foreground">Le mot de passe peut être modifié depuis le profil.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
