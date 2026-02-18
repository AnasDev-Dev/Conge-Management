'use client'

import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

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
}

export function PrintLeaveDocument({ request, approvers }: PrintLeaveDocumentProps) {
  const balanceAfter = (request.balance_before ?? 0) - request.days_count
  const typeLabel = request.request_type === 'CONGE' ? 'Congé annuel' : 'Récupération'
  const refNumber = `FRMG-${new Date(request.created_at).getFullYear()}-${String(request.id).padStart(5, '0')}`
  const fmtDate = (d: string) => format(new Date(d + 'T00:00:00'), 'EEEE d MMMM yyyy', { locale: fr })
  const fmtShort = (d: string) => format(new Date(d), 'dd/MM/yyyy', { locale: fr })

  const approvalSteps = [
    { label: 'RH Personnel', name: request.approved_by_rp ? approvers[request.approved_by_rp]?.full_name : null, date: request.approved_at_rp },
    { label: 'Chef de Service', name: request.approved_by_dc ? approvers[request.approved_by_dc]?.full_name : null, date: request.approved_at_dc },
    { label: 'Directeur Exécutif', name: request.approved_by_de ? approvers[request.approved_by_de]?.full_name : null, date: request.approved_at_de },
  ]

  return (
    <div id="print-document" className="print-document">
      {/* ── Top accent ── */}
      <div className="print-accent-bar" />

      {/* ── Header row: logo + title + badge ── */}
      <div className="print-header">
        <div className="print-header-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/imgi_55_NV_LOGO_FRMG_ANG-AR-1-removebg-preview.png" alt="FRMG" className="print-logo" />
          <div>
            <div className="print-org-name">Fédération Royale Marocaine de Golf</div>
            <div className="print-org-sub">Direction des Ressources Humaines</div>
          </div>
        </div>
        <div className="print-header-right">
          <div className="print-badge-approved">CONGÉ APPROUVÉ</div>
          <div className="print-ref">{refNumber}</div>
        </div>
      </div>

      {/* ── Title bar ── */}
      <div className="print-title-bar">
        <div className="print-title">Attestation de Congé</div>
        <div className="print-subtitle">
          Généré le {format(new Date(), 'd MMMM yyyy', { locale: fr })}
        </div>
      </div>

      {/* ── Row 1: Employee + Leave details side by side ── */}
      <div className="print-row">
        <div className="print-col">
          <div className="print-section-label">EMPLOYÉ</div>
          <div className="print-card">
            <div className="print-field">
              <span className="print-field-label">Nom complet</span>
              <span className="print-field-value print-field-bold">{request.user?.full_name ?? '—'}</span>
            </div>
            <div className="print-field">
              <span className="print-field-label">Poste</span>
              <span className="print-field-value">{request.user?.job_title ?? '—'}</span>
            </div>
            {request.user?.email && (
              <div className="print-field print-field-last">
                <span className="print-field-label">Email</span>
                <span className="print-field-value">{request.user.email}</span>
              </div>
            )}
          </div>
        </div>

        <div className="print-col">
          <div className="print-section-label">DÉTAILS DU CONGÉ</div>
          <div className="print-card">
            <div className="print-field">
              <span className="print-field-label">Type</span>
              <span className="print-field-value">{typeLabel}</span>
            </div>
            <div className="print-field">
              <span className="print-field-label">Début</span>
              <span className="print-field-value print-capitalize">{fmtDate(request.start_date)}</span>
            </div>
            <div className="print-field">
              <span className="print-field-label">Fin</span>
              <span className="print-field-value print-capitalize">{fmtDate(request.end_date)}</span>
            </div>
            <div className="print-field">
              <span className="print-field-label">Durée</span>
              <span className="print-field-value print-field-highlight">
                {request.days_count} jour{request.days_count > 1 ? 's' : ''} ouvrable{request.days_count > 1 ? 's' : ''}
              </span>
            </div>
            {request.return_date && (
              <div className="print-field print-field-last">
                <span className="print-field-label">Reprise</span>
                <span className="print-field-value print-capitalize">{fmtDate(request.return_date)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 2: Replacement + Motif + Balance ── */}
      <div className="print-row print-row-3">
        {/* Replacement */}
        <div className="print-col">
          <div className="print-section-label">REMPLAÇANT</div>
          <div className="print-card print-card-accent">
            {request.replacement_user ? (
              <>
                <div className="print-field">
                  <span className="print-field-label">Nom</span>
                  <span className="print-field-value print-field-bold">{request.replacement_user.full_name}</span>
                </div>
                {request.replacement_user.job_title && (
                  <div className="print-field print-field-last">
                    <span className="print-field-label">Poste</span>
                    <span className="print-field-value">{request.replacement_user.job_title}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="print-field print-field-last">
                <span className="print-field-value print-field-muted">Non spécifié</span>
              </div>
            )}
          </div>
        </div>

        {/* Motif */}
        <div className="print-col">
          <div className="print-section-label">MOTIF</div>
          <div className="print-card">
            <p className="print-reason">{request.reason || 'Non spécifié'}</p>
          </div>
        </div>

        {/* Balance */}
        <div className="print-col">
          <div className="print-section-label">IMPACT SUR LE SOLDE</div>
          <div className="print-card">
            <div className="print-field">
              <span className="print-field-label">Avant</span>
              <span className="print-field-value">{request.balance_before ?? '—'} j</span>
            </div>
            <div className="print-field">
              <span className="print-field-label">Demandé</span>
              <span className="print-field-value" style={{ color: '#dc2626' }}>-{request.days_count} j</span>
            </div>
            <div className="print-field print-field-last print-field-total">
              <span className="print-field-label">Reste</span>
              <span className="print-field-value" style={{ fontWeight: 700, color: balanceAfter >= 0 ? '#16a34a' : '#dc2626' }}>
                {request.balance_before != null ? `${balanceAfter} j` : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Validation chain (full width) ── */}
      <div className="print-section-label">CHAÎNE DE VALIDATION</div>
      <div className="print-card print-validation-card">
        <div className="print-validation-row">
          {approvalSteps.map((step, i) => (
            <div key={i} className="print-validation-item">
              <div className="print-validation-check">&#10003;</div>
              <div className="print-validation-info">
                <div className="print-validation-label">{step.label}</div>
                <div className="print-validation-name">{step.name ?? '—'}</div>
                <div className="print-validation-date">{step.date ? fmtShort(step.date) : '—'}</div>
              </div>
              {i < approvalSteps.length - 1 && <div className="print-validation-arrow">→</div>}
            </div>
          ))}
        </div>
      </div>

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
        FRMG — Fédération Royale Marocaine de Golf · Avenue Ibn Sina, Agdal, Rabat
      </div>
    </div>
  )
}
