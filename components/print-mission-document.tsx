'use client'

import { MissionRequestWithRelations, Utilisateur } from '@/lib/types/database'
import { TRANSPORT_LABELS } from '@/lib/constants'
import { getCompanyLogo, getCompanyFullName } from '@/lib/company-logos'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface PrintMissionDocumentProps {
  mission: MissionRequestWithRelations
  user: Utilisateur & { department?: { name: string } }
  companyName?: string | null
}

export default function PrintMissionDocument({ mission, user, companyName }: PrintMissionDocumentProps) {
  const currency = mission.currency || 'MAD'
  const companyKey = (companyName || 'FRMG').trim().toUpperCase()
  const companyFullName = getCompanyFullName(companyName)
  const companyLogo = getCompanyLogo(companyName)
  const isInternational = mission.mission_scope === 'INTERNATIONAL'
  const hasExtras = mission.extra_expenses && mission.extra_expenses.length > 0
  const extrasTotal = hasExtras ? mission.extra_expenses.reduce((s, e) => s + (e.amount || 0), 0) : 0
  const grandTotal = (mission.total_allowance || 0) + extrasTotal

  return (
    <>
      {/* ╔══════════════════════════════════════════════════════════════╗ */}
      {/* ║  PAGE 1: Mission details — no prices, no duration           ║ */}
      {/* ╚══════════════════════════════════════════════════════════════╝ */}
      <div className="print-document" style={pageStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5mm' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4mm' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={companyLogo} alt={companyKey} style={{ height: '18mm', objectFit: 'contain' }} />
            <div>
              <div style={{ fontSize: '10pt', fontWeight: 700, color: '#333' }}>{companyFullName}</div>
              <div style={{ fontSize: '8pt', color: '#888' }}>Direction des Ressources Humaines</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '8pt', color: '#999' }}>Ref: {companyKey}-OM-{String(mission.id).padStart(4, '0')}</div>
            <div style={{ fontSize: '8pt', color: '#999' }}>{format(new Date(mission.created_at), 'dd/MM/yyyy')}</div>
          </div>
        </div>

        <h1 style={titleStyle}>Ordre de Mission</h1>

        {/* Missionnaire */}
        <div style={{ marginBottom: '5mm' }}>
          <div style={sectionHeaderStyle}>Renseignements du missionnaire</div>
          <table style={tableStyle}>
            <tbody>
              <tr>
                <td style={{ ...cellStyle, width: '30%' }}>Nom et prenom</td>
                <td style={valueCellStyle}>
                  {mission.request_origin === 'EXTERNAL' && mission.external_person_name
                    ? `${mission.external_person_name} (externe)`
                    : user.full_name}
                </td>
              </tr>
              <tr>
                <td style={cellStyle}>Fonction</td>
                <td style={valueCellStyle}>{user.job_title || '—'}</td>
              </tr>
              <tr>
                <td style={cellStyle}>Pole / Departement</td>
                <td style={valueCellStyle}>{user.department?.name || '—'}</td>
              </tr>
              {mission.request_origin === 'ASSIGNED' && mission.assigner && (
                <tr>
                  <td style={cellStyle}>Demandeur</td>
                  <td style={valueCellStyle}>{mission.assigner.full_name}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mission details — dates, itinerary, country only. No prices, no duration */}
        <div style={{ marginBottom: '5mm' }}>
          <div style={sectionHeaderStyle}>Details de la mission</div>
          <table style={tableStyle}>
            <tbody>
              <tr>
                <td style={{ ...cellStyle, width: '30%' }}>Portee</td>
                <td style={valueCellStyle}>{isInternational ? 'Internationale' : 'Locale (Maroc)'}</td>
              </tr>
              <tr>
                <td style={cellStyle}>Itineraire</td>
                <td style={{ ...valueCellStyle, fontWeight: 600 }}>{mission.departure_city} → {mission.arrival_city}</td>
              </tr>
              {mission.country && (
                <tr>
                  <td style={cellStyle}>Pays / Lieu</td>
                  <td style={valueCellStyle}>{mission.country}{mission.venue ? ` — ${mission.venue}` : ''}</td>
                </tr>
              )}
              <tr>
                <td style={cellStyle}>Objet</td>
                <td style={valueCellStyle}>{mission.mission_object}</td>
              </tr>
              <tr>
                <td style={cellStyle}>Periode</td>
                <td style={{ ...valueCellStyle, fontWeight: 600 }}>
                  Du {format(new Date(mission.start_date), 'dd MMMM yyyy', { locale: fr })} au{' '}
                  {format(new Date(mission.end_date), 'dd MMMM yyyy', { locale: fr })}
                </td>
              </tr>
              <tr>
                <td style={cellStyle}>Transport</td>
                <td style={valueCellStyle}>
                  {mission.transport_type ? (TRANSPORT_LABELS[mission.transport_type] || mission.transport_type) : '—'}
                  {mission.transport_details ? ` (${mission.transport_details})` : ''}
                </td>
              </tr>
              {mission.replacement_user && (
                <tr>
                  <td style={cellStyle}>Interimaire</td>
                  <td style={valueCellStyle}>{mission.replacement_user.full_name}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Vehicle info */}
        {!!mission.vehicle_brand && (
          <div style={{ marginBottom: '5mm' }}>
            <div style={sectionHeaderStyle}>Vehicule personnel</div>
            <table style={tableStyle}>
              <tbody>
                <tr>
                  <td style={{ ...cellStyle, width: '30%' }}>Marque</td>
                  <td style={valueCellStyle}>{mission.vehicle_brand}</td>
                </tr>
                {mission.vehicle_fiscal_power && (
                  <tr><td style={cellStyle}>Puissance fiscale</td><td style={valueCellStyle}>{mission.vehicle_fiscal_power}</td></tr>
                )}
                {mission.vehicle_plate_requested && (
                  <tr><td style={cellStyle}>Immatriculation</td><td style={valueCellStyle}>{mission.vehicle_plate_requested}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Comments */}
        {mission.comments && (
          <div style={{ marginBottom: '5mm' }}>
            <div style={sectionHeaderStyle}>Observations</div>
            <div style={{ padding: '3mm', border: '1px solid #eee', borderRadius: '2mm', fontSize: '9.5pt', color: '#333' }}>
              {mission.comments}
            </div>
          </div>
        )}

        {/* Date line */}
        <div style={{ textAlign: 'right', fontSize: '9pt', marginTop: '10mm', fontStyle: 'italic', color: '#777' }}>
          Rabat, le {format(new Date(mission.created_at), 'dd MMMM yyyy', { locale: fr })}
        </div>

        {/* Footer page 1 */}
        <div style={footerStyle}>
          {companyKey} — {companyFullName} — Page 1/2
        </div>
      </div>

      {/* ╔══════════════════════════════════════════════════════════════╗ */}
      {/* ║  PAGE 2: Total amount + Director signature only             ║ */}
      {/* ╚══════════════════════════════════════════════════════════════╝ */}
      <div className="print-document" style={{ ...pageStyle, pageBreakBefore: 'always' }}>
        {/* Header (repeated for page 2) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5mm' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4mm' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={companyLogo} alt={companyKey} style={{ height: '18mm', objectFit: 'contain' }} />
            <div>
              <div style={{ fontSize: '10pt', fontWeight: 700, color: '#333' }}>{companyFullName}</div>
              <div style={{ fontSize: '8pt', color: '#888' }}>Direction des Ressources Humaines</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '8pt', color: '#999' }}>Ref: {companyKey}-OM-{String(mission.id).padStart(4, '0')}</div>
            <div style={{ fontSize: '8pt', color: '#999' }}>{format(new Date(mission.created_at), 'dd/MM/yyyy')}</div>
          </div>
        </div>

        <h1 style={titleStyle}>Ordre de Mission — Dotation</h1>

        {/* Missionnaire summary */}
        <div style={{ marginBottom: '5mm' }}>
          <table style={tableStyle}>
            <tbody>
              <tr>
                <td style={{ ...cellStyle, width: '30%' }}>Missionnaire</td>
                <td style={{ ...valueCellStyle, fontWeight: 600 }}>
                  {mission.request_origin === 'EXTERNAL' && mission.external_person_name
                    ? mission.external_person_name
                    : user.full_name}
                </td>
              </tr>
              <tr>
                <td style={cellStyle}>Periode</td>
                <td style={valueCellStyle}>
                  Du {format(new Date(mission.start_date), 'dd MMMM yyyy', { locale: fr })} au{' '}
                  {format(new Date(mission.end_date), 'dd MMMM yyyy', { locale: fr })}
                </td>
              </tr>
              <tr>
                <td style={cellStyle}>Destination</td>
                <td style={valueCellStyle}>{mission.departure_city} → {mission.arrival_city}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Total only — no breakdown */}
        <div style={{ marginBottom: '8mm' }}>
          <div style={sectionHeaderStyle}>Dotation financiere</div>
          <table style={tableStyle}>
            <tbody>
              <tr>
                <td style={{ ...cellStyle, width: '30%', fontWeight: 700, fontSize: '11pt', color: '#1a1a1a' }}>Dotation totale</td>
                <td style={{ ...valueCellStyle, fontWeight: 700, fontSize: '14pt', color: '#a3754a' }}>
                  {mission.total_allowance} {currency}
                </td>
              </tr>
              {hasExtras && (
                <tr>
                  <td style={{ ...cellStyle, fontWeight: 600 }}>Frais supplementaires</td>
                  <td style={{ ...valueCellStyle, fontWeight: 600 }}>{extrasTotal} {currency}</td>
                </tr>
              )}
              {hasExtras && (
                <tr>
                  <td style={{ ...cellStyle, fontWeight: 700, fontSize: '11pt', color: '#1a1a1a', borderBottom: '2px solid #a3754a' }}>Total general</td>
                  <td style={{ ...valueCellStyle, fontWeight: 700, fontSize: '14pt', color: '#a3754a', borderBottom: '2px solid #a3754a' }}>
                    {grandTotal} {currency}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Date line */}
        <div style={{ textAlign: 'right', fontSize: '9pt', marginBottom: '15mm', fontStyle: 'italic', color: '#777' }}>
          Rabat, le {format(new Date(mission.created_at), 'dd MMMM yyyy', { locale: fr })}
        </div>

        {/* Director signature ONLY */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10mm' }}>
          <div style={{ textAlign: 'center', width: '40%' }}>
            <div style={{ fontWeight: 600, marginBottom: '2mm', color: '#333', fontSize: '10pt' }}>Le Directeur Executif</div>
            {mission.signature_de ? (
              <div style={{ minHeight: '25mm', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mission.signature_de} alt="Signature Directeur" style={{ maxHeight: '25mm', maxWidth: '100%' }} />
              </div>
            ) : (
              <div style={{ borderBottom: '1px solid #ccc', marginTop: '22mm', paddingTop: '2mm' }} />
            )}
            <div style={{ marginTop: '2mm', fontSize: '8pt', color: '#999' }}>
              {mission.approver_de?.full_name || 'Nom et cachet'}
            </div>
          </div>
        </div>

        {/* Footer page 2 */}
        <div style={footerStyle}>
          {companyKey} — {companyFullName} — Page 2/2
        </div>
      </div>
    </>
  )
}

// ── Styles ──

const pageStyle: React.CSSProperties = {
  width: '210mm',
  minHeight: '297mm',
  margin: '0 auto',
  padding: '12mm 18mm',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '10pt',
  color: '#1a1a1a',
  background: '#fff',
  lineHeight: 1.45,
}

const titleStyle: React.CSSProperties = {
  fontSize: '16pt',
  fontWeight: 700,
  color: '#1a1a1a',
  margin: 0,
  padding: '3mm 0',
  borderTop: '2px solid #a3754a',
  borderBottom: '2px solid #a3754a',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  marginBottom: '5mm',
}

const sectionHeaderStyle: React.CSSProperties = {
  background: '#f5f0eb',
  padding: '2mm 4mm',
  borderLeft: '3px solid #a3754a',
  fontWeight: 600,
  fontSize: '9.5pt',
  marginBottom: '2mm',
  color: '#333',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '9.5pt',
}

const cellStyle: React.CSSProperties = {
  padding: '2mm 3mm',
  borderBottom: '1px solid #eee',
  color: '#666',
  fontWeight: 500,
  verticalAlign: 'top',
}

const valueCellStyle: React.CSSProperties = {
  padding: '2mm 3mm',
  borderBottom: '1px solid #eee',
  fontWeight: 400,
  color: '#1a1a1a',
  verticalAlign: 'top',
}

const footerStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '8mm',
  left: '18mm',
  right: '18mm',
  borderTop: '2px solid #a3754a',
  paddingTop: '2mm',
  textAlign: 'center',
  fontSize: '7pt',
  color: '#aaa',
}
