'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
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
        <section className="relative hidden overflow-hidden rounded-l-[1.85rem] bg-gradient-to-b from-[#f8f3ed] via-[#f3ece3] to-[#ede4d8] lg:flex lg:flex-col">

          {/* Animated background shapes */}
          <div className="pointer-events-none absolute inset-0">
            {/* Warm radial glow top-right */}
            <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#a3754a]/8 blur-3xl" />
            {/* Warm radial glow bottom-left */}
            <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-[#a3754a]/6 blur-3xl" />

            {/* Subtle golf course landscape - warm tones */}
            <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 600 180" fill="none" preserveAspectRatio="none" style={{ height: '35%' }}>
              <path d="M0 110 C100 70 200 100 300 80 S500 55 600 85 L600 180 L0 180Z" fill="#a3754a" opacity="0.06">
                <animate attributeName="d" dur="8s" repeatCount="indefinite" values="M0 110 C100 70 200 100 300 80 S500 55 600 85 L600 180 L0 180Z;M0 100 C100 85 200 65 300 90 S500 70 600 80 L600 180 L0 180Z;M0 110 C100 70 200 100 300 80 S500 55 600 85 L600 180 L0 180Z" />
              </path>
              <path d="M0 130 C150 90 250 130 350 105 S500 120 600 110 L600 180 L0 180Z" fill="#a3754a" opacity="0.04">
                <animate attributeName="d" dur="10s" repeatCount="indefinite" values="M0 130 C150 90 250 130 350 105 S500 120 600 110 L600 180 L0 180Z;M0 125 C150 115 250 90 350 115 S500 100 600 130 L600 180 L0 180Z;M0 130 C150 90 250 130 350 105 S500 120 600 110 L600 180 L0 180Z" />
              </path>
            </svg>

            {/* Golf flag */}
            <svg className="absolute bottom-[32%] right-[25%] w-14 origin-bottom" viewBox="0 0 60 120" fill="none">
              <line x1="10" y1="8" x2="10" y2="120" stroke="#a3754a" strokeWidth="1.2" opacity="0.3" />
              <path d="M10 8 L40 20 L10 32Z" fill="#a3754a" opacity="0.25">
                <animateTransform attributeName="transform" type="rotate" values="-2 10 20;2 10 20;-2 10 20" dur="3s" repeatCount="indefinite" />
              </path>
              <circle cx="10" cy="120" r="2.5" fill="#a3754a" opacity="0.1" />
            </svg>

            {/* Golf ball */}
            <div className="absolute bottom-[22%] left-[24%] animate-[golf-bounce_4s_ease-in-out_infinite]">
              <div className="absolute -bottom-1 left-1/2 h-1.5 w-5 -translate-x-1/2 rounded-full bg-[#a3754a]/10 blur-sm animate-[golf-shadow_4s_ease-in-out_infinite]" />
              <div className="relative h-5 w-5 rounded-full bg-white shadow-[0_1px_6px_rgba(163,117,74,0.15),inset_-1px_-1px_3px_rgba(0,0,0,0.06)]">
                <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#a3754a]/15" />
              </div>
            </div>

            {/* Floating dots */}
            <div className="absolute left-[18%] top-[35%] h-1.5 w-1.5 rounded-full bg-[#a3754a]/12 animate-[float-up_6s_ease-in-out_infinite]" />
            <div className="absolute left-[50%] top-[50%] h-1 w-1 rounded-full bg-[#a3754a]/10 animate-[float-up_8s_ease-in-out_2s_infinite]" />
            <div className="absolute left-[72%] top-[38%] h-1.5 w-1.5 rounded-full bg-[#a3754a]/12 animate-[float-up_7s_ease-in-out_4s_infinite]" />
            <div className="absolute left-[35%] top-[62%] h-1 w-1 rounded-full bg-[#a3754a]/8 animate-[float-up_9s_ease-in-out_1s_infinite]" />

            {/* Decorative ring lines */}
            <div className="absolute right-8 top-[15%] h-32 w-32 rounded-full border border-[#a3754a]/6 animate-[gentle-spin_30s_linear_infinite]" />
            <div className="absolute right-12 top-[17%] h-24 w-24 rounded-full border border-dashed border-[#a3754a]/5 animate-[gentle-spin_20s_linear_reverse_infinite]" />
          </div>

          {/* Content overlay */}
          <div className="relative z-10 flex flex-1 flex-col justify-between p-10">
            {/* Top: Logo */}
            <div>
              <div className="mb-8">
                <Image
                  src="/logo-frmg.png"
                  alt="Fédération Royale Marocaine de Golf"
                  width={220}
                  height={80}
                  className="h-auto w-[200px]"
                  priority
                />
              </div>

              <h1 className="max-w-[300px] text-[2.4rem] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground">
                Gestion des
                <span className="mt-1 block bg-gradient-to-r from-[#a3754a] to-[#c99b6d] bg-clip-text text-transparent">
                  congés.
                </span>
              </h1>

              <p className="mt-5 max-w-[280px] text-sm leading-relaxed text-muted-foreground">
                Plateforme de gestion des congés de la Fédération Royale Marocaine de Golf. Simple, fluide, élégant.
              </p>
            </div>

            {/* Bottom stats strip */}
            <div className="flex gap-3">
              <div className="flex-1 rounded-2xl border border-[#a3754a]/10 bg-white/50 p-3.5 backdrop-blur-sm">
                <p className="text-2xl font-semibold text-foreground">18</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Jours de congé</p>
              </div>
              <div className="flex-1 rounded-2xl border border-[#a3754a]/10 bg-white/50 p-3.5 backdrop-blur-sm">
                <p className="text-2xl font-semibold text-[#a3754a]">Par</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Validation rapide</p>
              </div>
              <div className="flex-1 rounded-2xl border border-[#a3754a]/10 bg-white/50 p-3.5 backdrop-blur-sm">
                <p className="text-2xl font-semibold text-foreground">4</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Étapes</p>
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
                  placeholder="john.doe@frmg.ma"
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
