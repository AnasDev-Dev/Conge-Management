'use client'

import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { getCompanyLogo, getCompanyFullName } from '@/lib/company-logos'

interface PrintRequest {
  id: number
  request_type: string
  start_date: string
  end_date: string
  days_count: number
  return_date: string | null
  reason: string | null
  comments: string | null
  balance_before: number | null
  created_at: string
  approved_at_rp: string | null
  approved_at_dc: string | null
  approved_at_de: string | null
  approved_by_rp: string | null
  approved_by_dc: string | null
  approved_by_de: string | null
  user?: { full_name: string; job_title: string | null; email: string | null } | null
  replacement_user?: { full_name: string; job_title: string | null } | null
}

interface ApproverInfo {
  full_name: string
}

interface PrintLeaveDocumentProps {
  request: PrintRequest
  approvers: Record<string, ApproverInfo>
  companyName?: string | null
}

export function PrintLeaveDocument({ request, approvers, companyName }: PrintLeaveDocumentProps) {
  const balanceAfter = (request.balance_before ?? 0) - request.days_count
  const typeLabel = request.request_type === 'CONGE' ? 'Congé annuel' : 'Récupération'
  const companyShort = companyName?.trim().toUpperCase() || 'FRMG'
  const companyFull = getCompanyFullName(companyName) || 'Fédération Royale Marocaine de Golf'
  const logoSrc = getCompanyLogo(companyName)
  const refNumber = `${companyShort}-${new Date(request.created_at).getFullYear()}-${String(request.id).padStart(5, '0')}`

  const approvalSteps = [
    {
      label: 'RH Personnel',
      name: request.approved_by_rp ? approvers[request.approved_by_rp]?.full_name : null,
      date: request.approved_at_rp,
    },
    {
      label: 'Chef de Service',
      name: request.approved_by_dc ? approvers[request.approved_by_dc]?.full_name : null,
      date: request.approved_at_dc,
    },
    {
      label: 'Directeur Exécutif',
      name: request.approved_by_de ? approvers[request.approved_by_de]?.full_name : null,
      date: request.approved_at_de,
    },
  ]

  return (
    <div id="print-document" className="print-document">
      {/* ── Brand accent bar ── */}
      <div className="print-accent-bar" />

      {/* ── Header ── */}
      <div className="print-header">
        <div className="print-header-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt={companyShort}
            className="print-logo"
          />
          <div>
            <div className="print-org-name">{companyFull}</div>
            <div className="print-org-sub">Direction des Ressources Humaines</div>
          </div>
        </div>
        <div className="print-header-right">
          <div className="print-ref">Réf: {refNumber}</div>
          <div className="print-badge-approved">CONGÉ APPROUVÉ</div>
        </div>
      </div>

      <div className="print-divider" />

      {/* ── Title ── */}
      <div className="print-title">Attestation de Congé</div>
      <div className="print-subtitle">
        Document généré le {format(new Date(), 'd MMMM yyyy', { locale: fr })}
      </div>

      {/* ── Employee card ── */}
      <div className="print-section">
        <div className="print-section-label">EMPLOYÉ</div>
        <div className="print-card">
          <table className="print-table">
            <tbody>
              <tr>
                <td className="print-td-label">Nom complet</td>
                <td className="print-td-value">{request.user?.full_name ?? '—'}</td>
              </tr>
              <tr>
                <td className="print-td-label">Poste</td>
                <td className="print-td-value">{request.user?.job_title ?? '—'}</td>
              </tr>
              {request.user?.email && (
                <tr>
                  <td className="print-td-label">Email</td>
                  <td className="print-td-value">{request.user.email}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Leave details ── */}
      <div className="print-section">
        <div className="print-section-label">DÉTAILS DU CONGÉ</div>
        <div className="print-card">
          <table className="print-table">
            <tbody>
              <tr>
                <td className="print-td-label">Type</td>
                <td className="print-td-value">{typeLabel}</td>
              </tr>
              <tr>
                <td className="print-td-label">Date de début</td>
                <td className="print-td-value" style={{ textTransform: 'capitalize' }}>
                  {format(new Date(request.start_date + 'T00:00:00'), 'EEEE d MMMM yyyy', { locale: fr })}
                </td>
              </tr>
              <tr>
                <td className="print-td-label">Date de fin</td>
                <td className="print-td-value" style={{ textTransform: 'capitalize' }}>
                  {format(new Date(request.end_date + 'T00:00:00'), 'EEEE d MMMM yyyy', { locale: fr })}
                </td>
              </tr>
              <tr>
                <td className="print-td-label">Durée</td>
                <td className="print-td-value print-td-highlight">
                  {request.days_count} jour{request.days_count > 1 ? 's' : ''} ouvrable{request.days_count > 1 ? 's' : ''}
                </td>
              </tr>
              {request.return_date && (
                <tr>
                  <td className="print-td-label">Date de reprise</td>
                  <td className="print-td-value" style={{ textTransform: 'capitalize' }}>
                    {format(new Date(request.return_date + 'T00:00:00'), 'EEEE d MMMM yyyy', { locale: fr })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Replacement person ── */}
      {request.replacement_user && (
        <div className="print-section">
          <div className="print-section-label">PERSONNE DE REMPLACEMENT</div>
          <div className="print-card print-card-accent">
            <table className="print-table">
              <tbody>
                <tr>
                  <td className="print-td-label">Remplaçant</td>
                  <td className="print-td-value">{request.replacement_user.full_name}</td>
                </tr>
                {request.replacement_user.job_title && (
                  <tr>
                    <td className="print-td-label">Poste</td>
                    <td className="print-td-value">{request.replacement_user.job_title}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Reason ── */}
      {request.reason && (
        <div className="print-section">
          <div className="print-section-label">MOTIF</div>
          <div className="print-card">
            <p className="print-reason">{request.reason}</p>
          </div>
        </div>
      )}

      {/* ── Balance + Validations side by side ── */}
      <div className="print-row">
        {/* Balance */}
        <div className="print-section print-col">
          <div className="print-section-label">SOLDE</div>
          <div className="print-card">
            <table className="print-table">
              <tbody>
                <tr>
                  <td className="print-td-label">Avant demande</td>
                  <td className="print-td-value">{request.balance_before ?? '—'} jours</td>
                </tr>
                <tr>
                  <td className="print-td-label">Jours demandés</td>
                  <td className="print-td-value" style={{ color: '#dc2626' }}>
                    -{request.days_count} jours
                  </td>
                </tr>
                <tr className="print-tr-total">
                  <td className="print-td-label" style={{ fontWeight: 600 }}>Solde restant</td>
                  <td className="print-td-value" style={{ fontWeight: 700, color: balanceAfter >= 0 ? '#16a34a' : '#dc2626' }}>
                    {request.balance_before != null ? `${balanceAfter} jours` : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Validation chain */}
        <div className="print-section print-col">
          <div className="print-section-label">CHAÎNE DE VALIDATION</div>
          <div className="print-card">
            {approvalSteps.map((step, i) => (
              <div key={i} className="print-approval-step">
                <div className="print-check">&#10003;</div>
                <span className="print-approval-label">{step.label}</span>
                <span className="print-approval-name">{step.name ?? '—'}</span>
                <span className="print-approval-date">
                  {step.date ? format(new Date(step.date), 'dd/MM/yyyy', { locale: fr }) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="print-divider" />

      {/* ── Signatures ── */}
      <div className="print-signatures">
        <div className="print-signature-block">
          <div className="print-signature-title">Visa RH</div>
          <div className="print-signature-line" />
          <div className="print-signature-sub">Nom et cachet</div>
        </div>
        <div className="print-signature-block">
          <div className="print-signature-title">Visa Direction</div>
          <div className="print-signature-line" />
          <div className="print-signature-sub">Nom et cachet</div>
        </div>
        <div className="print-signature-block">
          <div className="print-signature-title">L&apos;intéressé(e)</div>
          <div className="print-signature-line" />
          <div className="print-signature-sub">Signature</div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="print-accent-bar" />
      <div className="print-footer">
        {companyShort} — {companyFull} · Avenue Ibn Sina, Agdal, Rabat
      </div>
    </div>
  )
}
