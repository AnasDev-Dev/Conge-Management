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
import { Eye, EyeOff, Loader2, User } from 'lucide-react'

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

      toast.success('Connexion réussie!', { duration: 2000 })
      router.push('/dashboard')
      router.refresh()
    } catch (error) {
      console.error('Login error:', error)
      const message = error instanceof Error ? error.message : ''
      if (message.includes('fetch') || message.includes('network') || message.includes('Failed')) {
        toast.error("Erreur de connexion au serveur. Veuillez vérifier votre connexion internet et réessayer.")
      } else {
        toast.error("Une erreur s'est produite lors de la connexion")
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-0 sm:p-8">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,color-mix(in_oklab,var(--primary)_20%,white)_0,transparent_36%),radial-gradient(circle_at_90%_88%,color-mix(in_oklab,var(--status-draft-bg)_65%,white)_0,transparent_42%)]" />

      <div className="surface-shell relative z-10 grid w-full max-w-5xl gap-0 overflow-hidden rounded-none sm:rounded-[2rem] lg:grid-cols-[1.15fr_0.95fr]">

        {/* ─── Left: Branding Panel ─── */}
        <section className="relative hidden overflow-hidden rounded-l-[1.85rem] bg-gradient-to-b from-[#faf7f4] via-[#f5f0ea] to-[#eee7df] lg:flex lg:flex-col">

          {/* Background decorations */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#a3754a]/8 blur-[100px]" />
            <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-[#c99b6d]/6 blur-[80px]" />

            {/* Dot grid */}
            <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, #a3754a 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

            {/* Decorative arcs */}
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 500 700" fill="none">
              <circle cx="250" cy="350" r="180" stroke="#a3754a" strokeWidth="0.5" opacity="0.06" />
              <circle cx="250" cy="350" r="240" stroke="#a3754a" strokeWidth="0.3" opacity="0.04" />
              <circle cx="250" cy="350" r="300" stroke="#a3754a" strokeWidth="0.3" opacity="0.03" strokeDasharray="4 8" />
            </svg>
          </div>

          {/* Content */}
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center p-10 text-center">
            {/* Logos */}
            <div className="mb-10 flex items-center gap-5 rounded-2xl border border-[#a3754a]/10 bg-white/60 px-8 py-5 shadow-sm backdrop-blur-sm">
              <Image
                src="/logo/FRMG_LOGO.png"
                alt="FRMG"
                width={120}
                height={100}
                className="h-[80px] w-auto object-contain"
                priority
              />
              <div className="h-12 w-px bg-[#a3754a]/15" />
              <Image
                src="/logo/ATH_LOGO.png"
                alt="ATH"
                width={120}
                height={100}
                className="h-[80px] w-auto object-contain"
              />
            </div>

            {/* Title */}
            <h1 className="text-[2.6rem] font-bold leading-[1.05] tracking-[-0.03em] text-[#2a1f17]">
              Gestion des
              <span className="mt-1 block bg-gradient-to-r from-[#a3754a] to-[#c99b6d] bg-clip-text text-transparent">
                congés.
              </span>
            </h1>

            <p className="mt-5 max-w-[300px] text-sm leading-relaxed text-[#8a7566]">
              Plateforme de gestion des congés.
              <br />
              Simple, fluide, élégant.
            </p>

            {/* Feature pills */}
            <div className="mt-10 flex flex-wrap justify-center gap-2">
              {['Demandes', 'Validations', 'Calendrier', 'Missions'].map((f) => (
                <span key={f} className="rounded-full border border-[#a3754a]/12 bg-white/50 px-3.5 py-1.5 text-[11px] font-medium tracking-wide text-[#a3754a]/70">
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Bottom */}
          <div className="relative z-10 px-10 pb-8">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-[#a3754a]/15 to-transparent" />
            <p className="mt-4 text-center text-[11px] text-[#a3754a]/35">
              Hassan II Golf Trophy Association
            </p>
          </div>
        </section>

        {/* ─── Right: Sign-in Form ─── */}
        <Card className="justify-center rounded-none border-0 border-l border-border/50 bg-background/95 py-0 shadow-none lg:rounded-r-[1.85rem]">
          <CardHeader className="px-8 pt-10 pb-4 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-[0_14px_36px_color-mix(in_oklab,var(--primary)_33%,transparent)]">
              <User className="h-7 w-7" />
            </div>
            <CardTitle className="text-2xl font-semibold tracking-tight">Connexion</CardTitle>
            <CardDescription className="text-sm">Accedez a votre espace</CardDescription>
          </CardHeader>

          <CardContent className="px-8 pb-10">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email professionnel</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@example.com"
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

            <div className="mt-6 rounded-2xl border border-border/70 bg-secondary/35 p-3.5 text-center">
              <p className="text-xs text-muted-foreground">Le mot de passe peut être modifié depuis le profil.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
