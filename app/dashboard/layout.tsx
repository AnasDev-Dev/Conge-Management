'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
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
  ClipboardList,
  Briefcase,
  Settings,
  BadgeCheck,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Sun,
  Map,
} from 'lucide-react'
import { Utilisateur } from '@/lib/types/database'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { CompanySwitcher } from '@/components/company-switcher'
import { CompanyProvider, useCompanyContext } from '@/lib/hooks/use-company-context'
import { DbPermissionsProvider } from '@/lib/hooks/use-db-permissions'
import { usePermissions } from '@/lib/hooks/use-permissions'
import { type SidebarItem } from '@/lib/permissions'
import { getCompanyLogo } from '@/lib/company-logos'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<Utilisateur | null>(() => {
    if (typeof window === 'undefined') {
      return null
    }
    const userStr = localStorage.getItem('user')
    return userStr ? (JSON.parse(userStr) as Utilisateur) : null
  })
  const [sessionChecked, setSessionChecked] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  // Verify Supabase auth session is still valid
  useEffect(() => {
    const supabase = createClient()

    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        // Session expired — clear localStorage and redirect to login
        localStorage.removeItem('user')
        localStorage.removeItem('userId')
        localStorage.removeItem('userRole')
        setUser(null)
        router.push('/login')
        return
      }

      // Session valid — refresh user data from DB if localStorage is stale
      if (user && session.user.id) {
        const { data: freshUser } = await supabase
          .from('utilisateurs')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (freshUser) {
          localStorage.setItem('user', JSON.stringify(freshUser))
          setUser(freshUser as Utilisateur)
        }
      }

      setSessionChecked(true)
    }

    checkSession()

    // Listen for auth state changes (session refresh, logout, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        localStorage.removeItem('user')
        localStorage.removeItem('userId')
        localStorage.removeItem('userRole')
        setUser(null)
        router.push('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [pathname])

  useEffect(() => {
    if (!user && sessionChecked) {
      router.push('/login')
    }
  }, [router, user, sessionChecked])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    localStorage.removeItem('user')
    localStorage.removeItem('userId')
    localStorage.removeItem('userRole')
    router.push('/login')
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--shell-bg)] p-0 md:p-4">
        <div className="surface-shell mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1440px] items-center justify-center rounded-none p-8 md:rounded-[2rem]">
          <div className="text-center">
            <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Chargement de votre espace...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <CompanyProvider userId={user.id}>
      <DbPermissionsProvider>
        <DashboardShell user={user} onLogout={handleLogout}>
          {children}
        </DashboardShell>
      </DbPermissionsProvider>
    </CompanyProvider>
  )
}

function DashboardShell({ user, onLogout, children }: { user: Utilisateur; onLogout: () => void; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const { activeCompany } = useCompanyContext()
  const { canSee } = usePermissions(user.role)

  // Full nav definition — filtered by permissions below
  type NavItem = {
    name: string
    href: string
    icon: typeof LayoutDashboard
    key: SidebarItem
  }

  type NavGroup = {
    title: string
    icon: typeof LayoutDashboard
    items: NavItem[]
  }

  const navStructure: (NavItem | NavGroup)[] = [
    { name: 'Tableau de bord', href: '/dashboard', icon: LayoutDashboard, key: 'dashboard' },
    { name: 'Employes', href: '/dashboard/employees', icon: Users, key: 'employees' },
    { name: 'Init. Soldes', href: '/dashboard/balance-init', icon: BadgeCheck, key: 'balance-init' },
    {
      title: 'Congé',
      icon: Sun,
      items: [
        { name: 'Demandes', href: '/dashboard/requests', icon: FileText, key: 'requests' },
        { name: 'Validations', href: '/dashboard/validations', icon: ClipboardCheck, key: 'validations' },
        { name: 'Credit Recup.', href: '/dashboard/recovery-requests', icon: RotateCcw, key: 'recovery-requests' },
      ]
    },
    {
      title: 'Ordre de mission',
      icon: Map,
      items: [
        { name: 'Missions', href: '/dashboard/missions', icon: Briefcase, key: 'missions' },
        { name: 'Valid. Missions', href: '/dashboard/mission-validations', icon: ClipboardList, key: 'mission-validations' },
      ]
    },
    { name: 'Calendrier', href: '/dashboard/calendar', icon: Calendar, key: 'calendar' },
    { name: 'Parametres', href: '/dashboard/settings', icon: Settings, key: 'settings' },
    { name: 'Profil', href: '/dashboard/profile', icon: User, key: 'profile' },
    { name: 'Notifications', href: '/dashboard/notifications', icon: Bell, key: 'notifications' },
  ]

  const isNavItemActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  const [openGroups, setOpenGroups] = useState<string[]>([])

  useEffect(() => {
    const activeGroup = navStructure.find(item =>
      'items' in item && item.items.some(sub => isNavItemActive(sub.href))
    )
    if (activeGroup && 'title' in activeGroup) {
      setOpenGroups(prev => {
        if (!prev.includes(activeGroup.title)) {
          return [...prev, activeGroup.title]
        }
        return prev
      })
    }
  }, [pathname])

  const toggleGroup = (title: string) => {
    setOpenGroups(prev =>
      prev.includes(title)
        ? prev.filter(t => t !== title)
        : [...prev, title]
    )
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--shell-bg)] p-0 md:h-[100dvh] md:overflow-hidden md:p-5">
      <div className="surface-shell mx-auto min-h-[100dvh] max-w-[1600px] rounded-none p-0 md:h-[calc(100dvh-2.5rem)] md:overflow-hidden md:rounded-[2rem] md:p-3">
        <div className="flex min-h-full gap-0 md:h-full md:overflow-hidden md:gap-3">
          <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 lg:hidden">
            <div className="rounded-2xl border border-border bg-background/95 px-4 py-3 shadow-sm backdrop-blur-sm">
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
                    <Image
                      src={getCompanyLogo(activeCompany?.name)}
                      alt={activeCompany?.name || 'FRMG'}
                      width={36}
                      height={36}
                      className="h-9 w-9 object-contain"
                    />
                    <div>
                      <p className="text-sm font-semibold tracking-tight">{activeCompany?.name || 'FRMG'}</p>
                      <p className="text-xs text-muted-foreground">Gestion des conges</p>
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
              <CompanySwitcher />

              <Link
                href="/dashboard/new-request"
                onClick={() => setSidebarOpen(false)}
                className="mt-3 flex items-center gap-2.5 rounded-2xl bg-foreground px-4 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90"
              >
                <PlusCircle className="h-4.5 w-4.5" />
                Nouvelle demande
              </Link>

              <nav className="mt-4 flex-1 space-y-1.5 overflow-y-auto pr-1 overscroll-contain">
                {navStructure.map((item, index) => {
                  if ('items' in item) {
                    // Group
                    const filteredItems = item.items.filter(subItem => canSee(subItem.key))
                    if (filteredItems.length === 0) return null

                    const isOpen = openGroups.includes(item.title)
                    const GroupIcon = item.icon

                    return (
                      <div key={`group-${index}`} className="py-1">
                        <button
                          onClick={() => toggleGroup(item.title)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-2xl border border-transparent px-3.5 py-3 text-sm font-medium transition-all hover:border-border hover:bg-accent hover:text-foreground',
                            isOpen ? 'text-foreground' : 'text-muted-foreground'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <GroupIcon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </div>
                          {isOpen ? <ChevronDown className="h-4 w-4 opacity-50" /> : <ChevronRight className="h-4 w-4 opacity-50" />}
                        </button>
                        
                        {isOpen && (
                          <div className="mt-1 space-y-1 pl-4 animate-in slide-in-from-top-1 duration-200">
                            {filteredItems.map(subItem => {
                              const Icon = subItem.icon
                              const isActive = isNavItemActive(subItem.href)
                              return (
                                <Link
                                  key={subItem.name}
                                  href={subItem.href}
                                  className={cn(
                                    'flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-sm font-medium transition-all relative',
                                    isActive
                                      ? 'border-border bg-background text-foreground'
                                      : 'border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground'
                                  )}
                                  onClick={() => setSidebarOpen(false)}
                                >
                                  {/* Add a vertical line connector visual if needed, but keeping it simple for now */}
                                  <Icon className="h-4 w-4" />
                                  <span>{subItem.name}</span>
                                </Link>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  } else {
                    // Single Item
                    if (!canSee(item.key)) return null
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
                  }
                })}
              </nav>

              <div className="border-t border-border/60 pt-3 mt-2">
                <div className="flex items-center gap-3 px-1 mb-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted border border-border">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground leading-tight">{user.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground mt-0.5">{user.email || user.role}</p>
                  </div>
                </div>
                <button
                  onClick={onLogout}
                  className="flex w-full items-center gap-2.5 rounded-2xl border border-transparent px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:border-border hover:bg-accent hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Deconnexion</span>
                </button>
              </div>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col rounded-none border-0 bg-card px-3 pb-3 shadow-none md:h-full md:overflow-hidden md:rounded-[1.75rem] md:border md:border-border md:p-6 lg:mt-0">
            <main className="pt-[4.5rem] flex min-h-0 flex-1 flex-col lg:pt-0 md:overflow-hidden">
              <div className="flex min-h-0 flex-1 flex-col pb-6 md:overflow-y-auto md:overscroll-contain md:pr-1">
                {children}
              </div>
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
