# Analyse des Exigences Client — Congé Management

> **Date :** 04/03/2026
> **Objectif :** Comparer les 12 nouvelles exigences du client avec l'état actuel du système et identifier ce qui reste à développer.

---

## Légende

| Icône | Signification |
|-------|---------------|
| ✅ | Fonctionnalité entièrement implémentée |
| ⚠️ | Partiellement implémentée (base existante, ajustements nécessaires) |
| ❌ | Non implémentée (à développer entièrement) |

---

## Résumé Exécutif

| # | Exigence | Statut | Effort restant |
|---|----------|--------|----------------|
| 1 | Paramétrage jours de travail par catégorie | ✅ Fait | — |
| 2 | Demi-journées dans le paramétrage | ✅ Fait | — |
| 3 | Nombre de jours de congé annuel par catégorie | ✅ Fait | — |
| 4 | Majoration après 5 ans d'ancienneté | ✅ Fait | — |
| 5 | Calcul mensuel du solde de congé | ✅ Fait | — |
| 6 | Solde initial de congé par employé | ✅ Fait | — |
| 7 | Plafond maximal du solde (52 jours) | ✅ Fait | — |
| 8 | Validation préalable des jours de récupération | ✅ Fait | — |
| 9 | Demande combinée Congé + Récupération | ⚠️ Partiel | Moyen |
| 10 | Limite de validité des jours de récupération | ⚠️ Partiel | Faible |
| 11 | Filtres dynamiques du calendrier | ✅ Fait | — |
| 12 | Gestion multi-sociétés et multi-profils | ⚠️ Partiel | Moyen |

---

## Analyse Détaillée

---

### 1. Paramétrage des jours de travail par catégorie de personnel

**Statut : ✅ ENTIÈREMENT IMPLÉMENTÉ**

#### Ce qui existe

- **Table `personnel_categories`** : Catégories avec `annual_leave_days` (ex: Cadre Supérieur 22j, Agent 18j, Ouvrier 18j)
- **Colonne `category_id`** dans `utilisateurs` : Lien employé → catégorie
- **Page Settings (onglet Catégories)** : CRUD complet des catégories avec nombre de jours annuels
- **`count_working_days()`** (RPC) : Prend en compte la catégorie de l'employé
- **`countWorkingDays()`** (frontend `leave-utils.ts`) : Version frontend avec cache, aware des catégories
- **Seed data** : Catégories par défaut pour ATH et FRMG

---

### 2. Ajout des demi-journées dans le paramétrage

**Statut : ✅ ENTIÈREMENT IMPLÉMENTÉ**

#### Ce qui existe

- **Table `working_days` étendue** : 14 colonnes (matin/après-midi pour chaque jour : `monday_morning`, `monday_afternoon`, etc.)
- **Page Settings (onglet Jours ouvrables)** : 14 toggles (matin + après-midi par jour)
- **`getDayWorkValue()`** dans `leave-utils.ts` : Retourne 0, 0.5 ou 1 selon la config demi-journée
- **`countWorkingDays()`** : Intègre les demi-journées dans le calcul
- **Colonnes `start_half_day`, `end_half_day`** dans `leave_requests` : Support FULL/MORNING/AFTERNOON
- **Constante `HALF_DAY_LABELS`** : Labels français (Journée complète, Matin, Après-midi)

---

### 3. Paramétrage du nombre de jours de congé annuel par catégorie

**Statut : ✅ ENTIÈREMENT IMPLÉMENTÉ**

#### Ce qui existe

- **`annual_leave_days`** dans `personnel_categories` : Configurable par catégorie
- **`calculate_annual_entitlement()`** (RPC) : Utilise le `annual_leave_days` de la catégorie au lieu du fixe 18 jours
- **Page Settings** : Champ de saisie du nombre de jours annuels par catégorie
- **`calculateSeniority()`** (frontend) : Réplique le calcul avec la base catégorielle

---

### 4. Majoration automatique après 5 ans d'ancienneté

**Statut : ✅ ENTIÈREMENT IMPLÉMENTÉ**

#### Ce qui existe

- **`calculate_annual_entitlement()`** (RPC) : `seniority_periods = FLOOR(years / 5)`, `bonus = periods × 1.5`, max 30 total
- **`calculateSeniority()`** dans `leave-utils.ts` : Réplique côté client
- **Affichage** dans le profil et détail employé avec détail du calcul

---

### 5. Calcul mensuel du solde de congé

**Statut : ✅ ENTIÈREMENT IMPLÉMENTÉ**

#### Ce qui existe

- **Table `monthly_balance_accrual`** : Suivi mensuel par user/year/month (accrued_days, cumulative_days)
- **`accrue_monthly_balance()`** (RPC) : Traite tous les employés actifs, divise l'allocation annuelle par 12
- **`calculateMonthlyAccrual()`** dans `leave-utils.ts` : Calcul frontend (taux mensuel × mois courant − utilisé − en attente)
- **Dashboard** : Affichage du solde cumulé mensuel et du taux mensuel
- **Balance-init** : Visualisation de l'acquisition progressive

---

### 6. Ajout d'un solde initial de congé par employé

**Statut : ✅ ENTIÈREMENT IMPLÉMENTÉ**

#### Ce qui existe

- **Page `balance-init`** : Interface complète (recherche, tableau, édition, confirmation)
- **`set_initial_balance()`** (RPC) : Avec traçabilité dans `leave_balance_history`
- **Plafond 52 jours** intégré dans le RPC

---

### 7. Plafond maximal du solde de congé (52 jours)

**Statut : ✅ ENTIÈREMENT IMPLÉMENTÉ**

#### Ce qui existe

- **`MAX_LEAVE_BALANCE = 52`** dans `lib/constants.ts`
- **`set_initial_balance()`** : Plafonne à 52 jours
- **`calculate_leave_balance()`** : Retourne un flag si max atteint
- **Frontend** : Validation et affichage dans balance-init et dashboard

---

### 8. Validation préalable des jours de récupération

**Statut : ✅ ENTIÈREMENT IMPLÉMENTÉ**

#### Ce qui existe

- **Table `recovery_requests`** : user_id, days, date_worked, work_type, reason, status, validated_by, validated_at
- **Types de travail** : JOUR_FERIE, JOUR_REPOS, SAMEDI, DIMANCHE
- **RPCs** :
  - `submit_recovery_request()` : Soumission par l'employé
  - `validate_recovery_request()` : Validation par le chef → crédit automatique du solde récupération
  - `reject_recovery_request()` : Rejet avec motif
- **Page `/dashboard/recovery-requests`** : Interface complète avec :
  - Formulaire de soumission (jours 0.5–5, date travaillée, type, raison)
  - Onglets par statut (Tous, En attente, Validées, Rejetées)
  - KPI cards
  - Validation/rejet par les managers avec dialog
  - Vue responsive (table desktop + cards mobile)
- **RLS policies** : Employé voit les siennes, managers valident

---

### 9. Demande combinée Congé + Récupération

**Statut : ⚠️ PARTIEL**

#### Ce qui est fait

- **Table `leave_request_details`** : `request_id, date, type (CONGE/RECUPERATION), half_day (FULL/MORNING/AFTERNOON)` — prête à l'emploi
- **Colonne `is_mixed`** dans `leave_requests` : Flag pour identifier les demandes mixtes
- **Validation client** : Limite de 5 jours consécutifs de récupération (`MAX_CONSECUTIVE_RECOVERY_DAYS = 5`)
- **Types TypeScript** : `LeaveRequestDetail` défini dans `database.ts`

#### Ce qui reste à développer

| Composant | Tâche |
|-----------|-------|
| **Frontend** | Formulaire de demande : permettre la sélection du type (congé/récupération) par jour dans la période |
| **Backend RPC** | `approve_leave_request()` : interroger `leave_request_details` et déduire séparément de `balance_conge` et `balance_recuperation` |
| **Backend RPC** | Validation serveur de la règle des 5 jours consécutifs de récupération |
| **Frontend** | Vue détail : distinction visuelle congé vs récupération par jour |

---

### 10. Limite de validité des jours de récupération

**Statut : ⚠️ PARTIEL (~85%)**

#### Ce qui est fait

- **Table `recovery_balance_lots`** : Suivi des lots avec `expires_at` (30 juin N+1)
- **`validate_recovery_request()`** : Crée automatiquement un lot avec date d'expiration
- **`expire_recovery_days()`** (RPC) : Remet à zéro les récupérations expirées, enregistre dans l'historique
- **`calculate_leave_balance()`** : Retourne `recup_expires_at`
- **Types TypeScript** : `RecoveryBalanceLot` défini

#### Ce qui reste à développer

| Composant | Tâche |
|-----------|-------|
| **Backend** | Mettre en place un cron (pg_cron ou Edge Function) pour appeler `expire_recovery_days()` le 30 juin |
| **Frontend** | Afficher la date d'expiration des jours de récupération dans le dashboard/profil |
| **Frontend** | Alerte visuelle quand des récupérations approchent de l'expiration |

---

### 11. Mise à jour du calendrier – Filtres dynamiques

**Statut : ✅ ENTIÈREMENT IMPLÉMENTÉ**

#### Ce qui existe

- **Cases à cocher** de filtrage par statut : En cours, Refusé, Validé Chef, Validé RH, Approuvé
- **Filtrage dynamique** instantané côté client
- **Indicateurs de jours fériés** sur le calendrier
- **Constante `CALENDAR_STATUS_FILTERS`** dans `lib/constants.ts`

---

### 12. Gestion multi-sociétés et multi-profils

**Statut : ⚠️ PARTIEL**

#### Ce qui est fait

- **Table `companies`** : FRMG et ATH créées avec seed data
- **Table `user_company_roles`** : `user_id, company_id, role` — permet un rôle différent par société
- **`get_role_for_company()`** (RPC) : Résolution du rôle selon la société
- **`departments`** : Liés à une société via `company_id`
- **`working_days`** et `holidays`** : Configuration par société
- **`count_working_days()`** : Accepte un `company_id`
- **RLS policies** pour `user_company_roles`

#### Ce qui reste à développer

| Composant | Tâche |
|-----------|-------|
| **Frontend** | Sélecteur de société dans le header/sidebar (switch ATH ↔ FRMG) |
| **Frontend** | Stocker la société active (localStorage + React context) |
| **Frontend** | Adapter dynamiquement : logo, nom de société selon la sélection |
| **Frontend** | Filtrer toutes les requêtes Supabase par `company_id` actif |
| **Backend** | Mettre à jour `is_manager()` et `can_manage_user()` pour être contextuels à la société |

---

## Fonctionnalités Additionnelles (hors exigences)

| Fonctionnalité | Statut |
|----------------|--------|
| Ordres de mission (CRUD + validation 3 étapes) | ✅ Fait |
| Impression demande de congé (PDF A4) | ✅ Fait |
| Création d'employés (dialog avec tous les champs) | ✅ Fait |
| Calcul ancienneté droit marocain | ✅ Fait |
| Notification lors de création pour le compte d'autrui | ✅ Fait |
| Undo validation / undo rejet | ✅ Fait |

---

## Priorités Restantes

### Haute priorité
1. **Req #9** — Formulaire per-day type + split deduction dans approve RPC

### Moyenne priorité
2. **Req #12** — Sélecteur de société UI + filtrage par company
3. **Req #10** — Cron pour expiration automatique

### Basse priorité
4. **Req #10** — UI warnings d'expiration
5. Notifications temps réel (Supabase subscriptions)
6. Export rapports (PDF/CSV)
7. Notifications email
