'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  Calendar,
  Users,
  User,
  Bell,
  LogOut,
  Menu,
  X,
  ClipboardCheck,
} from 'lucide-react'
import { Utilisateur } from '@/lib/types/database'
import { cn } from '@/lib/utils'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user] = useState<Utilisateur | null>(() => {
    if (typeof window === 'undefined') {
      return null
    }
    const userStr = localStorage.getItem('user')
    return userStr ? (JSON.parse(userStr) as Utilisateur) : null
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!user) {
      router.push('/login')
    }
  }, [router, user])

  const handleLogout = () => {
    localStorage.removeItem('user')
    localStorage.removeItem('userId')
    localStorage.removeItem('userRole')
    router.push('/login')
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--shell-bg)] p-4">
        <div className="surface-shell mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1440px] items-center justify-center rounded-[2rem] p-8">
          <div className="text-center">
            <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Chargement de votre espace...</p>
          </div>
        </div>
      </div>
    )
  }

  const managerRoles = ['CHEF_SERVICE', 'RESPONSABLE_PERSONNEL', 'TRESORIER_GENERAL', 'DIRECTEUR_EXECUTIF', 'ADMIN']
  const isManager = user && managerRoles.includes(user.role)

  const navigation = [
    { name: 'Tableau de bord', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Employés', href: '/dashboard/employees', icon: Users },
    ...(isManager ? [{ name: 'Validations', href: '/dashboard/validations', icon: ClipboardCheck }] : []),
    { name: 'Mes demandes', href: '/dashboard/requests', icon: FileText },
    { name: 'Nouvelle demande', href: '/dashboard/new-request', icon: PlusCircle },
    { name: 'Calendrier', href: '/dashboard/calendar', icon: Calendar },
    { name: 'Profil', href: '/dashboard/profile', icon: User },
    { name: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  ]

  const isNavItemActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-[var(--shell-bg)] p-3 md:p-5">
      <div className="surface-shell mx-auto h-[calc(100dvh-1.5rem)] max-w-[1600px] overflow-hidden rounded-[2rem] p-2 md:p-3">
        <div className="flex h-full gap-3 overflow-hidden">
          <header className="fixed inset-x-6 top-6 z-40 lg:hidden">
            <div className="rounded-3xl border border-border bg-background px-4 py-3 shadow-none">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="rounded-2xl border border-border bg-background/90 p-2.5"
                    aria-label="Toggle menu"
                  >
                    {sidebarOpen ? <X className="h-5 w-5 text-foreground" /> : <Menu className="h-5 w-5 text-foreground" />}
                  </button>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground">
                      SF
                    </div>
                    <div>
                      <p className="text-sm font-semibold tracking-tight">SMARTFLOW</p>
                      <p className="text-xs text-muted-foreground">Leave Workspace</p>
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="relative rounded-2xl">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
                </Button>
              </div>
            </div>
          </header>

	          <aside
            className={cn(
              'fixed inset-y-0 left-0 z-50 w-[300px] px-3 py-3 transition-transform duration-200 ease-out lg:relative lg:inset-auto lg:h-full lg:translate-x-0 lg:w-[290px] lg:px-0 lg:py-0',
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            )}
          >
            <div className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-border bg-sidebar p-4 shadow-none">
              <div className="rounded-2xl border border-border bg-background p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-base font-semibold text-primary-foreground">
                    SF
                  </div>
                  <div>
                    <h1 className="text-base font-semibold tracking-tight">SMARTFLOW</h1>
                    <p className="text-xs text-muted-foreground">Soft-Elegance Portal</p>
                  </div>
                </div>
              </div>

              <nav className="mt-5 flex-1 space-y-1.5 overflow-y-auto pr-1 overscroll-contain">
                {navigation.map((item) => {
                  const Icon = item.icon
                  const isActive = isNavItemActive(item.href)
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-sm font-medium transition-all',
                        isActive
                          ? 'border-border bg-background text-foreground'
                          : 'border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground'
                      )}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.name}</span>
                    </Link>
                  )
                })}
              </nav>

              <div className="space-y-3 pt-4">
                <div className="rounded-2xl border border-border bg-muted/55 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                      {user.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{user.full_name}</p>
                      <Badge variant="secondary" className="mt-1 border border-border">
                        {user.role}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
                      onClick={handleLogout}
                      aria-label="Déconnexion"
                      title="Déconnexion"
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-border bg-card p-4 shadow-none md:p-6 lg:mt-0">
            <main className="mt-[5.5rem] h-full overflow-y-auto overscroll-contain pr-1 lg:mt-0">
              <div className="pb-6">{children}</div>
            </main>
          </div>
        </div>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}
