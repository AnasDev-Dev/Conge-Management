# Analyse des Exigences Client — Congé Management

> **Date :** 01/03/2026
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

| # | Exigence | Statut | Effort |
|---|----------|--------|--------|
| 1 | Paramétrage jours de travail par catégorie | ✅ Fait | Élevé |
| 2 | Demi-journées dans le paramétrage | ✅ Fait | Moyen |
| 3 | Nombre de jours de congé annuel par catégorie | ✅ Fait | Moyen |
| 4 | Majoration après 5 ans d'ancienneté | ✅ Fait | Faible |
| 5 | Calcul mensuel du solde de congé | ✅ Fait | Élevé |
| 6 | Solde initial de congé par employé | ✅ Fait | — |
| 7 | Plafond maximal du solde (52 jours) | ✅ Fait | Faible |
| 8 | Validation préalable des jours de récupération | ✅ Fait | Élevé |
| 9 | Demande combinée Congé + Récupération | ✅ Fait | Élevé |
| 10 | Limite de validité des jours de récupération | ✅ Fait | Moyen |
| 11 | Filtres dynamiques du calendrier | ✅ Fait | Faible |
| 12 | Gestion multi-sociétés et multi-profils | ✅ Fait | Élevé |

---

## Analyse Détaillée

---

### 1. Paramétrage des jours de travail par catégorie de personnel

**Statut : ⚠️ PARTIEL**

#### Ce qui existe déjà

- **Table `working_days`** : Configuration des 7 jours (lundi → dimanche) avec des booléens — mais uniquement **par société** (`company_id`), pas par catégorie de personnel.
- **Page Settings** (`settings/page.tsx`) : Interface de configuration des jours travaillés avec 7 boutons toggle.
- **Fonction `count_working_days()`** (RPC SQL) : Calcul des jours ouvrés en excluant jours de repos et jours fériés — mais utilise une seule config par société.
- **Fonction `countWorkingDays()`** (frontend `leave-utils.ts`) : Version frontend du même calcul, utilise un cache `cachedWorkingDays`.

#### Ce qui reste à développer

| Composant | Tâche | Fichiers impactés |
|-----------|-------|-------------------|
| **Base de données** | Créer une table `personnel_categories` (id, name, company_id, description) | `01_tables.sql` |
| **Base de données** | Modifier `working_days` pour ajouter une colonne `category_id` (FK vers `personnel_categories`) en remplacement ou complément de `company_id` | `01_tables.sql` |
| **Base de données** | Ajouter une colonne `category_id` dans `utilisateurs` pour lier chaque employé à sa catégorie | `01_tables.sql` |
| **Backend RPC** | Mettre à jour `count_working_days()` pour accepter un `user_id` ou `category_id` et utiliser la config de jours correspondante | `03_rpcs.sql` |
| **Frontend** | Page d'administration des catégories de personnel (CRUD) | Nouveau composant |
| **Frontend** | Modifier la page Settings pour configurer les jours de travail **par catégorie** au lieu de par société uniquement | `settings/page.tsx` |
| **Frontend** | Mettre à jour `leave-utils.ts` pour passer la catégorie de l'employé au calcul des jours ouvrés | `leave-utils.ts` |
| **Frontend** | Formulaire de création/édition employé : sélecteur de catégorie | `employees/page.tsx` ou formulaire dédié |

---

### 2. Ajout des demi-journées dans le paramétrage

**Statut : ⚠️ PARTIEL**

#### Ce qui existe déjà

- **`days_count`** : Stocké en `FLOAT` dans `leave_requests`, ce qui permet des valeurs décimales (0.5 = demi-journée).
- **Page balance-init** : Champ numérique avec `step="0.5"` pour le solde de congé.
- **Crédit récupération** (Settings) : Accepte des valeurs en 0.5.
- Le backend supporte les valeurs fractionnaires dans les calculs de solde.

#### Ce qui reste à développer

| Composant | Tâche | Fichiers impactés |
|-----------|-------|-------------------|
| **Base de données** | Modifier `working_days` : remplacer les 7 booléens par 14 colonnes (ex: `monday_morning`, `monday_afternoon`, `tuesday_morning`, `tuesday_afternoon`, etc.) ou un champ JSONB par jour | `01_tables.sql` |
| **Backend RPC** | Mettre à jour `count_working_days()` pour comptabiliser les demi-journées (un jour avec seulement le matin = 0.5 jour ouvré) | `03_rpcs.sql` |
| **Frontend** | Modifier la page Settings : au lieu de 7 toggles simples, afficher 14 toggles (matin/après-midi pour chaque jour) | `settings/page.tsx` |
| **Frontend** | Formulaire de demande de congé : ajouter un sélecteur demi-journée (matin/après-midi) pour le premier et le dernier jour de la période | `new-request/page.tsx` |
| **Frontend** | Mettre à jour `countWorkingDays()` dans `leave-utils.ts` pour gérer les demi-journées | `leave-utils.ts` |
| **Base de données** | Ajouter des colonnes `start_half_day` et `end_half_day` dans `leave_requests` (ex: `'MORNING'`, `'AFTERNOON'`, `'FULL'`) | `01_tables.sql` |

---

### 3. Paramétrage du nombre de jours de congé annuel par catégorie

**Statut : ⚠️ PARTIEL**

#### Ce qui existe déjà

- **RPC `calculate_annual_entitlement()`** : Calcule l'allocation annuelle selon le droit marocain (18 jours ouvrables de base, 24 pour les mineurs).
- **Bonus d'ancienneté** : +1.5 jour par tranche de 5 ans, plafond à 30 jours.
- **Frontend** : Affichage du droit annuel dans le profil employé et le détail employé.

#### Ce qui reste à développer

| Composant | Tâche | Fichiers impactés |
|-----------|-------|-------------------|
| **Base de données** | Ajouter une colonne `annual_leave_days` dans `personnel_categories` (ex: 22 jours/an) | `01_tables.sql` (nouvelle table de l'exigence 1) |
| **Backend RPC** | Modifier `calculate_annual_entitlement()` pour utiliser le `annual_leave_days` de la catégorie de l'employé au lieu du fixe 18 jours | `03_rpcs.sql` |
| **Frontend** | Page d'administration : champ de saisie du nombre de jours annuels par catégorie | Page catégories (nouveau) |
| **Frontend** | Affichage dans le profil : montrer que le droit annuel vient de la catégorie de l'employé | `profile/page.tsx`, `employees/[id]/page.tsx` |

---

### 4. Majoration automatique après 5 ans d'ancienneté

**Statut : ✅ ENTIÈREMENT IMPLÉMENTÉ**

#### Ce qui existe

- **RPC `calculate_annual_entitlement()`** :
  - Calcule `years_of_service` à partir de `date_embauche`
  - `seniority_periods` = `FLOOR(years / 5)`
  - `bonus_days` = `seniority_periods * 1.5`
  - Plafond de 30 jours total (base + bonus)
- **Frontend** : Affichage dans le profil employé avec détail du calcul (années de service, périodes d'ancienneté, jours bonus).
- **`calculateSeniority()`** dans `leave-utils.ts` : Réplique le calcul côté client.

#### Ajustement mineur possible

| Composant | Tâche | Fichiers impactés |
|-----------|-------|-------------------|
| **Backend** | Si l'exigence 3 est implémentée, s'assurer que le bonus d'ancienneté s'applique correctement sur le nouveau `annual_leave_days` par catégorie (au lieu du fixe 18) | `03_rpcs.sql` |

---

### 5. Calcul mensuel du solde de congé

**Statut : ❌ NON IMPLÉMENTÉ**

#### Ce qui existe déjà

- Le solde est stocké directement dans `utilisateurs.balance_conge` comme valeur absolue.
- `set_initial_balance()` permet de définir manuellement le solde.
- Le calcul d'allocation annuelle existe mais n'est pas distribué mensuellement.

#### Ce qui reste à développer

| Composant | Tâche | Fichiers impactés |
|-----------|-------|-------------------|
| **Base de données** | Créer une table `monthly_balance_accrual` (user_id, year, month, accrued_days, cumulative_days) pour tracer l'acquisition progressive | `01_tables.sql` |
| **Backend RPC** | Créer `accrue_monthly_balance()` : divise l'allocation annuelle par 12, crédite chaque mois (ex: 22j/an → 1.83j/mois), met à jour `balance_conge` | `03_rpcs.sql` |
| **Backend** | Mettre en place un **cron job** (Supabase pg_cron ou Edge Function) qui s'exécute le 1er de chaque mois pour créditer automatiquement | Nouveau : cron/edge function |
| **Backend RPC** | Modifier `calculate_leave_balance()` pour inclure le solde cumulé mensuel dans le retour | `03_rpcs.sql` |
| **Frontend** | Dashboard : afficher le solde cumulé du mois en cours (ex: "Février : 3.66 jours cumulés") | `dashboard/page.tsx` |
| **Frontend** | Page profil/employé : historique d'acquisition mensuelle | `profile/page.tsx`, `employees/[id]/page.tsx` |
| **Frontend** | Page balance-init : prendre en compte l'acquisition progressive dans l'initialisation | `balance-init/page.tsx` |

---

### 6. Ajout d'un solde initial de congé par employé

**Statut : ✅ ENTIÈREMENT IMPLÉMENTÉ**

#### Ce qui existe

- **Page `balance-init`** : Interface complète avec :
  - Recherche d'employés
  - Tableau avec colonnes : Département, Date d'embauche, Ancienneté, Droit annuel, Solde actuel, Nouveau solde
  - Champ numérique avec step 0.5
  - Indicateur visuel des modifications
  - Dialogue de confirmation avant enregistrement
  - Vue mobile adaptée (cards)
- **RPC `set_initial_balance()`** : Définit le solde avec traçabilité (ancien solde, nouveau solde, raison, année).
- **Table `leave_balance_history`** : Audit trail complet de chaque modification.

#### Rien à ajouter — fonctionnalité complète.

---

### 7. Plafond maximal du solde de congé (52 jours)

**Statut : ❌ NON IMPLÉMENTÉ**

#### Ce qui existe déjà

- Le solde est stocké sans aucune limite supérieure.
- Aucune validation de plafond n'existe côté backend ni frontend.

#### Ce qui reste à développer

| Composant | Tâche | Fichiers impactés |
|-----------|-------|-------------------|
| **Constantes** | Ajouter `MAX_LEAVE_BALANCE = 52` dans les constantes | `lib/constants.ts` |
| **Backend RPC** | Modifier `set_initial_balance()` : plafonner à 52 jours, retourner un avertissement si dépassement | `03_rpcs.sql` |
| **Backend RPC** | Modifier `accrue_monthly_balance()` (exigence 5) : ne pas créditer au-delà de 52 jours | `03_rpcs.sql` |
| **Backend RPC** | Modifier `calculate_leave_balance()` : retourner un flag `is_max_reached` si solde >= 52 | `03_rpcs.sql` |
| **Frontend** | Dashboard : afficher le solde en **rouge** avec mention "Maximum atteint" si >= 52 jours | `dashboard/page.tsx` |
| **Frontend** | Balance-init : empêcher la saisie au-delà de 52, afficher un avertissement | `balance-init/page.tsx` |
| **Frontend** | Profil employé : indicateur visuel du plafond atteint | `profile/page.tsx` |

---

### 8. Validation préalable des jours de récupération

**Statut : ⚠️ PARTIEL**

#### Ce qui existe déjà

- **RPC `credit_recuperation()`** : Permet à un RH/Admin de créditer des jours de récupération directement (sans demande préalable de l'employé).
- **Page Settings (onglet Récupération)** : Formulaire pour créditer des récupérations (sélection employé, nombre de jours, période travaillée, raison).
- **Type `RECUPERATION`** : Les demandes de congé supportent le type récupération dans le workflow existant.

#### Ce qui reste à développer

| Composant | Tâche | Fichiers impactés |
|-----------|-------|-------------------|
| **Base de données** | Créer une table `recovery_requests` (user_id, days, date_worked, reason, type_of_work [JOUR_FERIE, JOUR_REPOS, SAMEDI, DIMANCHE], status, validated_by, validated_at) | `01_tables.sql` |
| **Backend RPC** | Créer `submit_recovery_request()` : l'employé soumet une demande de récupération avec justification | `03_rpcs.sql` |
| **Backend RPC** | Créer `validate_recovery_request()` : le chef de service valide → crédite automatiquement le solde via `credit_recuperation()` | `03_rpcs.sql` |
| **Backend RPC** | Créer `reject_recovery_request()` : refus avec motif | `03_rpcs.sql` |
| **Base de données** | RLS policies pour `recovery_requests` (employé voit les siennes, chef valide celles de son service) | `02_rls_triggers.sql` |
| **Frontend** | Formulaire de demande de récupération pour l'employé (type de travail, date travaillée, nombre de jours, raison) | Nouveau composant |
| **Frontend** | Page de validation des demandes de récupération pour le chef de service | Nouveau composant ou onglet dans validations |
| **Frontend** | Notification au chef de service à la soumission d'une demande | Intégration notifications |

---

### 9. Demande combinée Congé + Récupération

**Statut : ❌ NON IMPLÉMENTÉ**

#### Ce qui existe déjà

- Les demandes sont soit `CONGE` soit `RECUPERATION` — jamais les deux dans une même demande.
- Les deux balances sont gérées séparément (`balance_conge`, `balance_recuperation`).
- Le formulaire de nouvelle demande permet de choisir un seul type.

#### Ce qui reste à développer

| Composant | Tâche | Fichiers impactés |
|-----------|-------|-------------------|
| **Base de données** | Modifier `leave_requests` : ajouter la possibilité de type `MIXTE` ou lier plusieurs lignes de détail à une même demande | `01_tables.sql` |
| **Base de données** | Créer une table `leave_request_details` (request_id, date, type [CONGE/RECUPERATION], half_day [FULL/MORNING/AFTERNOON]) pour le détail jour par jour | `01_tables.sql` |
| **Backend RPC** | Modifier `approve_leave_request()` : déduire les jours de congé et de récupération séparément selon les détails | `03_rpcs.sql` |
| **Backend** | Ajouter la règle de validation : une récupération ne peut pas dépasser 5 jours consécutifs ; au-delà, obligation de combiner avec des jours de congé | `03_rpcs.sql` |
| **Backend** | Retourner un message d'erreur explicite si la règle des 5 jours est violée | `03_rpcs.sql` |
| **Frontend** | Refonte du formulaire de demande : permettre de sélectionner plusieurs dates avec type différent (congé ou récupération) par date | `new-request/page.tsx` |
| **Frontend** | Validation côté client de la règle des 5 jours consécutifs de récupération | `new-request/page.tsx` |
| **Frontend** | Affichage détaillé dans la vue demande : distinction visuelle entre jours congé et jours récupération | `requests/[id]/page.tsx` |

---

### 10. Limite de validité des jours de récupération

**Statut : ❌ NON IMPLÉMENTÉ**

#### Ce qui existe déjà

- **`leave_balance_history`** : Enregistre l'année de chaque modification de solde.
- **`balance_recuperation`** : Solde stocké comme valeur unique sans notion d'expiration.

#### Ce qui reste à développer

| Composant | Tâche | Fichiers impactés |
|-----------|-------|-------------------|
| **Base de données** | Ajouter une colonne `expires_at` dans `leave_balance_history` (pour les lignes de type RECUPERATION) — date limite = 30/06/N+1 | `01_tables.sql` |
| **Base de données** | Ou créer une table `recovery_balance_details` (user_id, year_acquired, days, expires_at, expired) pour un suivi fin des lots de récupération | `01_tables.sql` |
| **Backend RPC** | Créer `expire_recovery_days()` : appelée par cron le 30/06, remet à zéro les récupérations de l'année N-1, enregistre dans l'historique | `03_rpcs.sql` |
| **Backend** | Mettre en place un **cron job** (pg_cron ou Edge Function) exécuté le 30 juin de chaque année | Nouveau : cron/edge function |
| **Backend RPC** | Modifier `calculate_leave_balance()` pour afficher séparément les récupérations valides vs expirées | `03_rpcs.sql` |
| **Frontend** | Dashboard/Profil : afficher la date d'expiration des jours de récupération | `dashboard/page.tsx`, `profile/page.tsx` |
| **Frontend** | Alerte visuelle quand des récupérations approchent de l'expiration (ex: 30 jours avant) | Composant notification ou banner |

---

### 11. Mise à jour du calendrier – Filtres dynamiques

**Statut : ⚠️ PARTIEL**

#### Ce qui existe déjà

- **Page Calendrier** (`calendar/page.tsx`) : Vue mensuelle complète avec :
  - Grille 7 colonnes (Lun–Dim)
  - Points de couleur par statut (amber=PENDING, purple=VALIDATED, green=APPROVED, red=REJECTED)
  - Modal de détail au clic sur un jour
  - Légende des couleurs
  - Statistiques (demandes approuvées, en cours, jours pris, employés)
  - Filtrage par rôle (manager voit tout, employé voit les siennes)

#### Ce qui reste à développer

| Composant | Tâche | Fichiers impactés |
|-----------|-------|-------------------|
| **Frontend** | Ajouter des **cases à cocher** de filtrage par statut au-dessus du calendrier : En cours, Refusé, Validé Chef, Validé RH, Approuvé, Tous | `calendar/page.tsx` |
| **Frontend** | Implémenter le filtrage dynamique : quand une case est cochée/décochée, le calendrier se met à jour instantanément (filtrage côté client sur les données déjà chargées) | `calendar/page.tsx` |
| **Frontend** | Ajouter un état React pour les filtres sélectionnés (par défaut : tous cochés) | `calendar/page.tsx` |
| **Frontend** | Appliquer les filtres aux `filteredLeaves` utilisé dans le rendu du calendrier | `calendar/page.tsx` |

> **Note :** C'est l'exigence la plus simple à implémenter — il s'agit uniquement d'ajouter du filtrage côté client sur des données déjà présentes.

---

### 12. Gestion multi-sociétés et multi-profils

**Statut : ⚠️ PARTIEL**

#### Ce qui existe déjà

- **Table `companies`** : Support multi-sociétés avec noms uniques.
- **`departments`** : Liés à une société via `company_id`.
- **`working_days`** et `holidays`** : Configuration par société.
- **`count_working_days()`** : Accepte un `company_id` optionnel.
- **Utilisateurs** : Liés à une société via leur département.
- **Logo** : Le profil affiche un logo de société (basé sur le nom de l'entreprise).

#### Ce qui reste à développer

| Composant | Tâche | Fichiers impactés |
|-----------|-------|-------------------|
| **Base de données** | S'assurer que les deux sociétés **ATH** et **FRMG** existent dans la table `companies` | `04_grants_seed.sql` |
| **Base de données** | Créer une table `user_company_roles` (user_id, company_id, role) pour permettre à un utilisateur d'avoir un rôle différent par société | `01_tables.sql` |
| **Backend RPC** | Modifier `get_my_role()` pour accepter un `company_id` et retourner le rôle correspondant | `03_rpcs.sql` |
| **Backend RPC** | Modifier `is_manager()` et `can_manage_user()` pour être contextuels à la société | `03_rpcs.sql` |
| **Backend** | Mettre à jour les RLS policies pour filtrer par société active | `02_rls_triggers.sql` |
| **Frontend** | Ajouter un **sélecteur de société** dans le header/sidebar (switch ATH ↔ FRMG) | `layout.tsx` ou composant de navigation |
| **Frontend** | Stocker la société active dans le state (localStorage + React context) | Nouveau context/provider |
| **Frontend** | Adapter dynamiquement : logo, couleurs, nom de société selon la sélection | Layout, CSS variables |
| **Frontend** | Adapter les menus et fonctionnalités visibles selon le rôle dans la société sélectionnée | Navigation, pages conditionnelles |
| **Frontend** | Filtrer toutes les requêtes Supabase par `company_id` de la société active | Tous les composants de données |

---

## Priorités de Développement Recommandées

### Phase 1 — Fondations (Prérequis pour les autres exigences)
1. **Exigence 1** — Catégories de personnel → crée la structure de base utilisée par les exigences 2, 3, 4
2. **Exigence 12** — Multi-sociétés → impacte toute l'architecture des données

### Phase 2 — Logique métier congé
3. **Exigence 3** — Jours de congé annuel par catégorie
4. **Exigence 2** — Demi-journées
5. **Exigence 5** — Calcul mensuel du solde
6. **Exigence 7** — Plafond 52 jours

### Phase 3 — Récupération
7. **Exigence 8** — Validation préalable des récupérations
8. **Exigence 9** — Demande combinée Congé + Récupération
9. **Exigence 10** — Limite de validité des récupérations

### Phase 4 — Interface utilisateur
10. **Exigence 11** — Filtres calendrier (rapide à faire)

### Déjà fait
- **Exigence 4** — Majoration ancienneté ✅
- **Exigence 6** — Solde initial ✅

---

## Dépendances entre Exigences

```
Exigence 1 (Catégories)
    ├── Exigence 2 (Demi-journées par catégorie)
    ├── Exigence 3 (Jours annuels par catégorie)
    │       └── Exigence 4 (Ancienneté — déjà fait, ajustement mineur)
    └── Exigence 5 (Calcul mensuel — utilise le nb jours par catégorie)
            └── Exigence 7 (Plafond 52j — appliqué au calcul mensuel)

Exigence 8 (Validation récupérations)
    ├── Exigence 9 (Demande combinée — nécessite un workflow récup validé)
    └── Exigence 10 (Expiration récupérations — nécessite un suivi des récup validées)

Exigence 11 (Filtres calendrier) — Indépendant
Exigence 12 (Multi-sociétés) — Indépendant mais impacte tout
```

---

## Estimation de Complexité

| Exigence | Backend | Frontend | Total |
|----------|---------|----------|-------|
| 1. Catégories personnel | Élevé | Moyen | **Élevé** |
| 2. Demi-journées | Moyen | Moyen | **Moyen** |
| 3. Jours annuels/catégorie | Faible | Faible | **Faible-Moyen** |
| 4. Ancienneté | — | — | **Fait** |
| 5. Calcul mensuel | Élevé | Moyen | **Élevé** |
| 6. Solde initial | — | — | **Fait** |
| 7. Plafond 52 jours | Faible | Faible | **Faible** |
| 8. Validation récupérations | Élevé | Élevé | **Élevé** |
| 9. Combinée Congé+Récup | Élevé | Élevé | **Élevé** |
| 10. Expiration récupérations | Moyen | Faible | **Moyen** |
| 11. Filtres calendrier | — | Faible | **Faible** |
| 12. Multi-sociétés/profils | Élevé | Élevé | **Élevé** |
