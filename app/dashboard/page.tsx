"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { useCompanyContext } from "@/lib/hooks/use-company-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  TrendingUp,
  FileText,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Home,
} from "lucide-react";
import Link from "next/link";
import { Utilisateur } from "@/lib/types/database";
import {
  MAX_LEAVE_BALANCE,
  PENDING_STATUSES,
  getStatusClass,
  getStatusLabel,
} from "@/lib/constants";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { calculateSeniority, calculateMonthlyAccrual } from "@/lib/leave-utils";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isToday,
  isSameDay,
  isWithinInterval,
  parseISO,
} from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardRequest {
  id: number;
  user_id: string;
  request_type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  return_date: string | null;
  status: string;
  reason: string | null;
  created_at: string;
  user?: { id: string; full_name: string; job_title: string | null } | null;
}

type Tab = "all" | "pending" | "approved" | "rejected";

const STATUS_DOT_COLORS: Record<string, string> = {
  PENDING: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]",
  VALIDATED_DC: "bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.6)]",
  VALIDATED_RP: "bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]",
  APPROVED: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]",
  REJECTED: "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]",
  CANCELLED: "bg-gray-400 shadow-[0_0_8px_rgba(156,163,175,0.6)]",
};

const STATUS_BAR_COLORS: Record<string, string> = {
  PENDING:
    "bg-gradient-to-r from-amber-400/90 to-amber-500/90 text-amber-950 shadow-sm border border-amber-400/50",
  VALIDATED_DC:
    "bg-gradient-to-r from-purple-400/90 to-purple-500/90 text-white shadow-sm border border-purple-400/50",
  VALIDATED_RP:
    "bg-gradient-to-r from-purple-500/90 to-purple-600/90 text-white shadow-sm border border-purple-500/50",
  APPROVED:
    "bg-gradient-to-r from-emerald-400/90 to-emerald-500/90 text-emerald-950 shadow-sm border border-emerald-400/50",
  REJECTED:
    "bg-gradient-to-r from-red-400/90 to-red-500/90 text-white shadow-sm border border-red-400/50",
  CANCELLED:
    "bg-gradient-to-r from-gray-400/90 to-gray-500/90 text-white shadow-sm border border-gray-400/50",
};

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default function DashboardPage() {
  const { user } = useCurrentUser();
  const { isHome, activeCompany } = useCompanyContext();
  const { can, isManager: isManagerView } = usePermissions(user?.role || 'EMPLOYEE');
  const [requests, setRequests] = useState<DashboardRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [balanceInfo, setBalanceInfo] = useState<{
    annual_entitlement: number;
    days_used_this_year: number;
    days_pending: number;
    monthly_accrued: number;
    monthly_rate: number;
    available_now: number;
  } | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (user) {
      loadRequests(user);
      supabase
        .rpc("calculate_leave_balance", { p_user_id: user.id })
        .then(({ data: balanceData }) => {
          if (balanceData) setBalanceInfo(balanceData);
        });
    }
  }, [user, activeCompany]);

  const loadRequests = async (userData: Utilisateur) => {
    try {

      let query = supabase
        .from("leave_requests")
        .select(
          `
          *,
          user:utilisateurs!leave_requests_user_id_fkey!inner(id, full_name, job_title, company_id)
        `,
        )
        .order("created_at", { ascending: false });

      if (activeCompany) {
        query = query.eq("user.company_id", activeCompany.id);
      }

      if (!isManagerView) {
        query = query.eq("user_id", userData.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error("Error loading requests:", error);
    } finally {
      setLoading(false);
    }
  };

  // Calendar grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const days: Date[] = [];
    let day = gridStart;
    while (day <= gridEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [calendarMonth]);

  // Requests overlapping each calendar day
  const requestsByDay = useMemo(() => {
    const map = new Map<string, DashboardRequest[]>();
    for (const day of calendarDays) {
      const key = format(day, "yyyy-MM-dd");
      const matching = requests.filter((r) => {
        if (r.status === "CANCELLED") return false;
        const start = parseISO(r.start_date);
        const end = parseISO(r.end_date);
        return isWithinInterval(day, { start, end });
      });
      if (matching.length > 0) {
        map.set(key, matching);
      }
    }
    return map;
  }, [calendarDays, requests]);

  if (!user) return null;

  const pendingStatuses = PENDING_STATUSES;
  const pendingCount = requests.filter((r) =>
    pendingStatuses.includes(r.status),
  ).length;
  const approvedCount = requests.filter((r) => r.status === "APPROVED").length;
  const rejectedCount = requests.filter((r) => r.status === "REJECTED").length;

  const filteredRequests = requests.filter((r) => {
    if (activeTab === "all") return true;
    if (activeTab === "pending") return pendingStatuses.includes(r.status);
    if (activeTab === "approved") return r.status === "APPROVED";
    if (activeTab === "rejected") return r.status === "REJECTED";
    return true;
  });

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "Toutes", count: requests.length },
    { key: "pending", label: "En attente", count: pendingCount },
    { key: "approved", label: "Approuvées", count: approvedCount },
    { key: "rejected", label: "Rejetées", count: rejectedCount },
  ];

  return (
    <div className="space-y-5 md:space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Bienvenue, {user.full_name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:mt-1.5 sm:text-base">
          Voici un aperçu de votre gestion des congés
        </p>
      </div>

      {/* Stats */}
      {!isHome && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <Home className="h-3.5 w-3.5 shrink-0" />
          Les soldes affiches sont ceux de votre societe d&apos;origine.
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Card className="border-border/70">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
                Solde Congé
              </p>
              <CalendarIcon className="h-3 w-3 text-muted-foreground sm:h-3.5 sm:w-3.5" />
            </div>
            {(() => {
              const accrual = balanceInfo
                ? { availableNow: balanceInfo.available_now, monthlyRate: balanceInfo.monthly_rate, cumulativeEarned: balanceInfo.monthly_accrued, annualTotal: user.balance_conge }
                : calculateMonthlyAccrual(user.balance_conge)
              return (
                <>
                  <p className={`mt-1.5 text-xl font-bold sm:mt-2 sm:text-2xl ${user.balance_conge >= MAX_LEAVE_BALANCE ? 'text-red-600' : ''}`}>
                    {accrual.availableNow}
                    <span className="ml-1 text-xs font-normal text-muted-foreground sm:text-sm">
                      / {user.balance_conge} jours/an
                    </span>
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground sm:text-xs">
                    {accrual.monthlyRate}j/mois — Cumulé: {accrual.cumulativeEarned}j
                  </p>
                </>
              )
            })()}
            {user.balance_conge >= MAX_LEAVE_BALANCE && (
              <p className="mt-0.5 text-[10px] font-medium text-red-600 sm:text-xs">Maximum atteint (52j)</p>
            )}
            <div className="mt-2.5 h-1.5 w-full rounded-full bg-muted">
              <div
                className={`h-1.5 rounded-full transition-all ${user.balance_conge >= MAX_LEAVE_BALANCE ? 'bg-red-500' : 'bg-foreground/75'}`}
                style={{
                  width: `${Math.min(((balanceInfo?.monthly_accrued ?? calculateMonthlyAccrual(user.balance_conge).cumulativeEarned) / (user.balance_conge || 18)) * 100, 100)}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
                Récupération
              </p>
              <TrendingUp className="h-3 w-3 text-muted-foreground sm:h-3.5 sm:w-3.5" />
            </div>
            <p className="mt-1.5 text-xl font-bold sm:mt-2 sm:text-2xl">
              {user.balance_recuperation}
              <span className="ml-1 text-xs font-normal text-muted-foreground sm:text-sm">
                jours
              </span>
            </p>
            <div className="mt-2.5 h-1.5 w-full rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-foreground/60 transition-all"
                style={{
                  width: `${Math.min((user.balance_recuperation / 10) * 100, 100)}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
                En attente
              </p>
              <Clock className="h-3 w-3 text-muted-foreground sm:h-3.5 sm:w-3.5" />
            </div>
            <p className="mt-1.5 text-xl font-bold sm:mt-2 sm:text-2xl">
              {pendingCount}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
              En cours de validation
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
                Approuvées
              </p>
              <CheckCircle2 className="h-3 w-3 text-muted-foreground sm:h-3.5 sm:w-3.5" />
            </div>
            <p className="mt-1.5 text-xl font-bold sm:mt-2 sm:text-2xl">
              {approvedCount}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
              Cette année
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─── Calendar ─── */}
      <Card className="border-border/70 overflow-hidden">
        {/* Calendar header */}
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5 sm:px-5 sm:py-3.5">
          <h2 className="text-sm font-semibold text-foreground sm:text-base">
            Calendrier
          </h2>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setCalendarMonth(new Date())}
              className="hidden rounded-lg border border-border/70 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:block"
            >
              Aujourd&apos;hui
            </button>
            <button
              onClick={() => setCalendarMonth((prev) => subMonths(prev, 1))}
              className="rounded-lg border border-border/70 p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[100px] text-center text-xs font-semibold capitalize text-foreground sm:min-w-[140px] sm:text-sm">
              {format(calendarMonth, "MMMM yyyy", { locale: fr })}
            </span>
            <button
              onClick={() => setCalendarMonth((prev) => addMonths(prev, 1))}
              className="rounded-lg border border-border/70 p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/40 px-3 py-1.5 sm:gap-x-4 sm:px-5 sm:py-2">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> En
            attente
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-500" /> En
            validation
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />{" "}
            Approuvé
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Rejeté
          </div>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border/40 bg-muted/20">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="py-2.5 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground sm:text-[11px]"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1.5 bg-muted/5 p-1.5 sm:gap-2 sm:p-2">
          {calendarDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const inMonth = isSameMonth(day, calendarMonth);
            const today = isToday(day);
            const dayRequests = requestsByDay.get(key) || [];
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;

            return (
              <div
                key={key}
                className={cn(
                  "group relative flex min-h-[60px] flex-col overflow-hidden rounded-xl border border-border/50 bg-background shadow-sm transition-all sm:min-h-[88px]",
                  !inMonth && "border-transparent bg-transparent opacity-40 shadow-none hover:bg-transparent",
                  isWeekend && inMonth && "bg-muted/20 text-muted-foreground shadow-none",
                  today && "border-primary/40 bg-primary/5 ring-1 ring-primary/20",
                  "hover:border-border/80 hover:shadow-md hover:bg-muted/10"
                )}
              >
                {/* Day number */}
                <div className="m-1.5 flex items-start justify-between sm:m-2">
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold tracking-tight transition-colors sm:h-7 sm:w-7 sm:text-xs",
                      !inMonth ? "text-muted-foreground/50" : "text-muted-foreground",
                      inMonth && !today && "text-foreground group-hover:bg-muted",
                      today && "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {dayRequests.length > 2 && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted/40 text-[9px] font-bold text-muted-foreground/80 sm:h-6 sm:w-6 sm:text-[10px]">
                      +{dayRequests.length - 2}
                    </span>
                  )}
                </div>

                {/* Request bars (max 2 visible) */}
                <div className="flex flex-1 flex-col gap-[2px] pb-1.5 sm:pb-2">
                  {dayRequests.slice(0, 2).map((req) => {
                    const isStart = isSameDay(day, parseISO(req.start_date));
                    const isEnd = isSameDay(day, parseISO(req.end_date));
                    const barColor =
                      STATUS_BAR_COLORS[req.status] ||
                      "bg-gray-300 text-gray-800";
                    const name = req.user?.full_name?.split(" ")[0] || "";

                    return (
                      <Link
                        key={req.id}
                        href={`/dashboard/requests/${req.id}`}
                        className={cn(
                          "relative z-10 block truncate py-0.5 text-[9px] font-bold tracking-wide transition-all hover:brightness-110 sm:py-1 sm:text-[10px]",
                          barColor,
                          isStart && isEnd && "mx-1.5 w-[calc(100%-12px)] rounded-md px-1.5 sm:mx-2 sm:w-[calc(100%-16px)] sm:px-2",
                          isStart && !isEnd && "ml-1.5 mr-0 w-[calc(100%-6px)] rounded-l-md rounded-r-none px-1.5 sm:ml-2 sm:w-[calc(100%-8px)] sm:px-2",
                          !isStart && isEnd && "ml-0 mr-1.5 w-[calc(100%-6px)] rounded-l-none rounded-r-md px-1.5 sm:mr-2 sm:w-[calc(100%-8px)] sm:px-2",
                          !isStart && !isEnd && "mx-0 w-full rounded-none px-1.5 sm:px-2"
                        )}
                        title={`${req.user?.full_name || ""} — ${format(parseISO(req.start_date), "d MMM", { locale: fr })} au ${format(parseISO(req.end_date), "d MMM", { locale: fr })} (${getStatusLabel(req.status)})`}
                      >
                        {isStart || day.getDay() === 1 ? name : "\u00A0"}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ─── Requests with Tab Bar ─── */}
      <Card className="border-border/70">
        <div className="border-b border-border/60 px-3 pt-3 sm:px-5 sm:pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground sm:text-base">
              Demandes
            </h2>
            <Link
              href="/dashboard/requests"
              className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Tout voir
            </Link>
          </div>

          <div className="mt-2 flex gap-1 overflow-x-auto sm:mt-3">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "relative shrink-0 px-2 pb-2 text-xs font-medium transition-colors sm:px-3 sm:pb-2.5 sm:text-sm",
                  activeTab === tab.key
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground/70",
                )}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className={cn(
                      "ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-medium",
                      activeTab === tab.key
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {tab.count}
                  </span>
                )}
                {activeTab === tab.key && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />
                )}
              </button>
            ))}
          </div>
        </div>

        <CardContent className="p-0">
          {loading ? (
            <div className="divide-y divide-border/50">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                  <Skeleton className="h-9 w-9 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-4 w-4 rounded" />
                </div>
              ))}
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="mx-auto mb-2.5 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {activeTab === "all"
                  ? "Aucune demande pour le moment"
                  : "Aucune demande dans cette catégorie"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredRequests.slice(0, 10).map((request) => (
                <Link
                  key={request.id}
                  href={`/dashboard/requests/${request.id}`}
                  className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-accent/40 sm:gap-4 sm:px-5 sm:py-3.5"
                >
                  <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/70 sm:flex">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5">
                      {isManagerView && request.user && (
                        <span className="text-xs font-semibold text-foreground sm:text-sm">
                          {request.user.full_name}
                        </span>
                      )}
                      <span className="text-xs font-medium text-foreground sm:text-sm">
                        {format(new Date(request.start_date), "d MMM", {
                          locale: fr,
                        })}{" "}
                        –{" "}
                        {format(new Date(request.end_date), "d MMM", {
                          locale: fr,
                        })}
                      </span>
                      <Badge
                        className={cn(
                          "text-[10px] sm:text-[11px]",
                          getStatusClass(request.status),
                        )}
                      >
                        {getStatusLabel(request.status)}
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground sm:gap-2 sm:text-xs">
                      <span>
                        {request.request_type === "CONGE" ? "Congé" : "Récup."}
                      </span>
                      <span className="text-border">·</span>
                      <span>{request.days_count}j</span>
                      {isManagerView && request.user?.job_title && (
                        <>
                          <span className="hidden text-border sm:inline">
                            ·
                          </span>
                          <span className="hidden sm:inline">
                            {request.user.job_title}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                </Link>
              ))}

              {filteredRequests.length > 10 && (
                <div className="px-5 py-3 text-center">
                  <Link
                    href="/dashboard/requests"
                    className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    Voir les {filteredRequests.length - 10} demandes restantes
                  </Link>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
