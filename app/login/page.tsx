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

            {/* Golf illustration scene */}
            <div className="relative mt-auto">
              <svg viewBox="0 0 420 180" fill="none" className="w-full" xmlns="http://www.w3.org/2000/svg">
                {/* Putting green surface */}
                <ellipse cx="210" cy="160" rx="190" ry="18" fill="#a3754a" opacity="0.06" />
                <ellipse cx="210" cy="160" rx="140" ry="12" fill="#a3754a" opacity="0.04" />

                {/* Golf hole with shadow */}
                <ellipse cx="280" cy="155" rx="10" ry="4" fill="#a3754a" opacity="0.25" />
                <ellipse cx="280" cy="154" rx="7" ry="2.8" fill="#a3754a" opacity="0.12" />

                {/* Flag pole in hole */}
                <line x1="280" y1="60" x2="280" y2="155" stroke="#a3754a" strokeWidth="1.5" opacity="0.35" />
                {/* Flag */}
                <path d="M280 60 L310 72 L280 84Z" fill="#a3754a" opacity="0.22">
                  <animateTransform attributeName="transform" type="rotate" values="-3 280 72;3 280 72;-3 280 72" dur="3.5s" repeatCount="indefinite" />
                </path>
                {/* Flag pole ball top */}
                <circle cx="280" cy="58" r="2.5" fill="#a3754a" opacity="0.3" />

                {/* Golf club (iron) */}
                <g transform="translate(120, 45) rotate(15)">
                  {/* Shaft */}
                  <line x1="30" y1="0" x2="30" y2="105" stroke="#a3754a" strokeWidth="2" opacity="0.25" />
                  {/* Grip wrapping */}
                  <line x1="28" y1="4" x2="32" y2="8" stroke="#a3754a" strokeWidth="0.8" opacity="0.15" />
                  <line x1="28" y1="10" x2="32" y2="14" stroke="#a3754a" strokeWidth="0.8" opacity="0.15" />
                  <line x1="28" y1="16" x2="32" y2="20" stroke="#a3754a" strokeWidth="0.8" opacity="0.15" />
                  <line x1="28" y1="22" x2="32" y2="26" stroke="#a3754a" strokeWidth="0.8" opacity="0.15" />
                  {/* Club head (iron) */}
                  <path d="M24 105 Q18 108 16 116 Q15 122 20 124 L36 118 Q34 110 30 105Z" fill="#a3754a" opacity="0.2" stroke="#a3754a" strokeWidth="0.8" strokeOpacity="0.15" />
                  {/* Club head groove lines */}
                  <line x1="20" y1="112" x2="30" y2="109" stroke="#a3754a" strokeWidth="0.5" opacity="0.12" />
                  <line x1="19" y1="115" x2="31" y2="112" stroke="#a3754a" strokeWidth="0.5" opacity="0.12" />
                  <line x1="19" y1="118" x2="32" y2="115" stroke="#a3754a" strokeWidth="0.5" opacity="0.12" />
                </g>

                {/* Golf ball on tee */}
                <g className="animate-[golf-bounce_5s_ease-in-out_infinite]">
                  {/* Tee */}
                  <path d="M96 155 L100 140 L104 155" fill="#a3754a" opacity="0.18" />
                  {/* Ball shadow */}
                  <ellipse cx="100" cy="156" rx="8" ry="2.5" fill="#a3754a" opacity="0.08" />
                  {/* Ball */}
                  <circle cx="100" cy="132" r="9" fill="white" opacity="0.9" stroke="#a3754a" strokeWidth="0.5" strokeOpacity="0.15" />
                  {/* Ball dimple pattern */}
                  <circle cx="97" cy="129" r="1.2" fill="none" stroke="#a3754a" strokeWidth="0.4" opacity="0.12" />
                  <circle cx="103" cy="129" r="1.2" fill="none" stroke="#a3754a" strokeWidth="0.4" opacity="0.12" />
                  <circle cx="100" cy="134" r="1.2" fill="none" stroke="#a3754a" strokeWidth="0.4" opacity="0.12" />
                  <circle cx="95" cy="133" r="1" fill="none" stroke="#a3754a" strokeWidth="0.4" opacity="0.1" />
                  <circle cx="105" cy="133" r="1" fill="none" stroke="#a3754a" strokeWidth="0.4" opacity="0.1" />
                  <circle cx="100" cy="127" r="1" fill="none" stroke="#a3754a" strokeWidth="0.4" opacity="0.1" />
                  {/* Ball highlight */}
                  <ellipse cx="97" cy="128" rx="3" ry="2" fill="white" opacity="0.5" />
                </g>

                {/* Second golf ball rolling toward hole */}
                <g>
                  <ellipse cx="200" cy="157" rx="5" ry="1.8" fill="#a3754a" opacity="0.06" />
                  <circle cx="200" cy="150" r="6" fill="white" opacity="0.85" stroke="#a3754a" strokeWidth="0.5" strokeOpacity="0.12" />
                  <circle cx="198" cy="148" r="0.8" fill="none" stroke="#a3754a" strokeWidth="0.3" opacity="0.1" />
                  <circle cx="202" cy="148" r="0.8" fill="none" stroke="#a3754a" strokeWidth="0.3" opacity="0.1" />
                  <circle cx="200" cy="152" r="0.8" fill="none" stroke="#a3754a" strokeWidth="0.3" opacity="0.1" />
                  {/* Dotted path line toward hole */}
                  <line x1="210" y1="153" x2="268" y2="155" stroke="#a3754a" strokeWidth="0.8" strokeDasharray="3 4" opacity="0.1" />
                </g>

                {/* Small grass tufts */}
                <g opacity="0.12">
                  <path d="M50 158 Q52 148 54 158" stroke="#a3754a" strokeWidth="0.8" fill="none" />
                  <path d="M52 158 Q55 146 58 158" stroke="#a3754a" strokeWidth="0.8" fill="none" />
                  <path d="M340 156 Q342 147 344 156" stroke="#a3754a" strokeWidth="0.8" fill="none" />
                  <path d="M342 156 Q345 145 348 156" stroke="#a3754a" strokeWidth="0.8" fill="none" />
                  <path d="M370 158 Q371 150 373 158" stroke="#a3754a" strokeWidth="0.8" fill="none" />
                  <path d="M160 157 Q162 149 164 157" stroke="#a3754a" strokeWidth="0.8" fill="none" />
                </g>
              </svg>
            </div>
          </div>
        </section>

        {/* ─── Right: Sign-in Form ─── */}
        <Card className="justify-center rounded-none border-0 border-l border-border/50 bg-background/95 py-0 shadow-none lg:rounded-r-[1.85rem]">
          <CardHeader className="px-8 pt-10 pb-4 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-[0_14px_36px_color-mix(in_oklab,var(--primary)_33%,transparent)]">
              <User className="h-7 w-7" />
            </div>
            <CardTitle className="text-2xl font-semibold tracking-tight">Connexion</CardTitle>
            <CardDescription className="text-sm">Accedez a votre espace FRMG</CardDescription>
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
