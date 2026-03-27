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
  const hasFinancials = mission.daily_allowance > 0 || mission.hotel_amount > 0 || mission.total_allowance > 0
  const hasVehicle = !!mission.vehicle_brand
  const hasExtras = mission.extra_expenses && mission.extra_expenses.length > 0
  const extrasTotal = hasExtras ? mission.extra_expenses.reduce((s, e) => s + (e.amount || 0), 0) : 0

  return (
    <div className="print-document" style={pageStyle}>
      {/* ═══ Header ═══ */}
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
          <div style={{ fontSize: '8pt', color: '#999' }}>Réf: {companyKey}-OM-{String(mission.id).padStart(4, '0')}</div>
          <div style={{ fontSize: '8pt', color: '#999' }}>{format(new Date(mission.created_at), 'dd/MM/yyyy')}</div>
        </div>
      </div>

      <h1 style={titleStyle}>Ordre de Mission</h1>

      {/* ═══ Missionnaire ═══ */}
      <div style={{ marginBottom: '5mm' }}>
        <div style={sectionHeaderStyle}>Renseignements du missionnaire</div>
        <table style={tableStyle}>
          <tbody>
            <tr>
              <td style={{ ...cellStyle, width: '30%' }}>Nom et prénom</td>
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
              <td style={cellStyle}>Pôle / Département</td>
              <td style={valueCellStyle}>{user.department?.name || '—'}</td>
            </tr>
            {mission.request_origin === 'ASSIGNED' && mission.assigner && (
              <tr>
                <td style={cellStyle}>Assignée par</td>
                <td style={valueCellStyle}>{mission.assigner.full_name}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ═══ Détails de la mission ═══ */}
      <div style={{ marginBottom: '5mm' }}>
        <div style={sectionHeaderStyle}>Détails de la mission</div>
        <table style={tableStyle}>
          <tbody>
            <tr>
              <td style={{ ...cellStyle, width: '30%' }}>Portée</td>
              <td style={valueCellStyle}>{isInternational ? 'Internationale' : 'Locale (Maroc)'}</td>
            </tr>
            <tr>
              <td style={cellStyle}>Itinéraire</td>
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
              <td style={cellStyle}>Période</td>
              <td style={valueCellStyle}>
                Du {format(new Date(mission.start_date), 'dd MMMM yyyy', { locale: fr })} au{' '}
                {format(new Date(mission.end_date), 'dd MMMM yyyy', { locale: fr })}
              </td>
            </tr>
            <tr>
              <td style={cellStyle}>Durée</td>
              <td style={{ ...valueCellStyle, fontWeight: 600 }}>
                {mission.days_count} jour{mission.days_count > 1 ? 's' : ''} ouvrable{mission.days_count > 1 ? 's' : ''}
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
                <td style={cellStyle}>Intérimaire</td>
                <td style={valueCellStyle}>{mission.replacement_user.full_name}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ═══ Véhicule personnel ═══ */}
      {hasVehicle && (
        <div style={{ marginBottom: '5mm' }}>
          <div style={sectionHeaderStyle}>Véhicule personnel</div>
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
              {(mission.vehicle_date_from || mission.vehicle_date_to) && (
                <tr>
                  <td style={cellStyle}>Période véhicule</td>
                  <td style={valueCellStyle}>
                    {mission.vehicle_date_from && format(new Date(mission.vehicle_date_from), 'dd/MM/yyyy')}
                    {mission.vehicle_date_from && mission.vehicle_date_to && ' au '}
                    {mission.vehicle_date_to && format(new Date(mission.vehicle_date_to), 'dd/MM/yyyy')}
                  </td>
                </tr>
              )}
              {mission.persons_transported && (
                <tr><td style={cellStyle}>Personnes transportées</td><td style={valueCellStyle}>{mission.persons_transported}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ Dotation financière ═══ */}
      {(hasFinancials || isInternational) && (
        <div style={{ marginBottom: '5mm' }}>
          <div style={sectionHeaderStyle}>Dotation financière</div>
          <table style={tableStyle}>
            <tbody>
              {mission.mission_category && (
                <tr><td style={{ ...cellStyle, width: '30%' }}>Catégorie</td><td style={valueCellStyle}>{mission.mission_category.name}</td></tr>
              )}
              {mission.mission_zone && (
                <tr><td style={cellStyle}>Zone</td><td style={valueCellStyle}>{mission.mission_zone.name}</td></tr>
              )}
              {isInternational && (
                <tr>
                  <td style={cellStyle}>Prise en charge</td>
                  <td style={{ ...valueCellStyle, fontWeight: 600 }}>{mission.pec ? 'Avec PEC' : 'Sans PEC (tout inclus)'}</td>
                </tr>
              )}
              {mission.pec && (mission.nbr_petit_dej > 0 || mission.nbr_dej > 0 || mission.nbr_diner > 0) && (
                <tr>
                  <td style={cellStyle}>Repas</td>
                  <td style={valueCellStyle}>
                    {mission.nbr_petit_dej > 0 && `${mission.nbr_petit_dej} petit(s)-déj`}
                    {mission.nbr_dej > 0 && `${mission.nbr_petit_dej > 0 ? ', ' : ''}${mission.nbr_dej} déjeuner(s)`}
                    {mission.nbr_diner > 0 && `${(mission.nbr_petit_dej > 0 || mission.nbr_dej > 0) ? ', ' : ''}${mission.nbr_diner} dîner(s)`}
                  </td>
                </tr>
              )}
              <tr>
                <td style={cellStyle}>Hébergement / nuit</td>
                <td style={valueCellStyle}>{mission.hotel_amount} {currency}</td>
              </tr>
              <tr>
                <td style={cellStyle}>Dotation journalière</td>
                <td style={valueCellStyle}>{mission.daily_allowance} {currency}</td>
              </tr>
              <tr>
                <td style={{ ...cellStyle, fontWeight: 700, color: '#1a1a1a', fontSize: '11pt' }}>Dotation totale</td>
                <td style={{ ...valueCellStyle, fontWeight: 700, color: '#a3754a', fontSize: '11pt' }}>{mission.total_allowance} {currency}</td>
              </tr>
              {hasExtras && mission.extra_expenses.map((exp, i) => (
                <tr key={i}>
                  <td style={cellStyle}>{i === 0 ? 'Frais supplémentaires' : ''}</td>
                  <td style={valueCellStyle}>{exp.label}: {exp.amount} {currency}</td>
                </tr>
              ))}
              {hasExtras && (
                <tr>
                  <td style={{ ...cellStyle, fontWeight: 600 }}>Total frais supp.</td>
                  <td style={{ ...valueCellStyle, fontWeight: 600 }}>{extrasTotal} {currency}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ Date line ═══ */}
      <div style={{ textAlign: 'right', fontSize: '9pt', marginBottom: '5mm', fontStyle: 'italic', color: '#777' }}>
        Rabat, le {format(new Date(mission.created_at), 'dd MMMM yyyy', { locale: fr })}
      </div>

      {/* ═══ Avis du supérieur hiérarchique ═══ */}
      <div style={{ marginBottom: '5mm' }}>
        <div style={sectionHeaderStyle}>Avis du supérieur hiérarchique direct</div>
        <div style={boxStyle}>
          <div style={{ display: 'flex', gap: '10mm', marginBottom: '2mm', fontSize: '10pt' }}>
            <label style={checkboxLabelStyle}>
              <span style={checkboxStyle(mission.supervisor_opinion === 'FAVORABLE')} /> Favorable
            </label>
            <label style={checkboxLabelStyle}>
              <span style={checkboxStyle(mission.supervisor_opinion === 'DEFAVORABLE')} /> Défavorable
            </label>
          </div>
          <div style={{ fontSize: '9pt', color: '#777' }}>
            Commentaires: {mission.supervisor_comments || '_______________________________________________'}
          </div>
          {mission.supervisor?.full_name && (
            <div style={{ marginTop: '2mm', fontSize: '9pt', color: '#555' }}>
              Par: {mission.supervisor.full_name}
              {mission.supervisor_at && ` — le ${format(new Date(mission.supervisor_at), 'dd/MM/yyyy')}`}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Décision du Directeur ═══ */}
      <div style={{ marginBottom: '5mm' }}>
        <div style={sectionHeaderStyle}>Décision du Directeur Exécutif</div>
        <div style={boxStyle}>
          <div style={{ display: 'flex', gap: '10mm', fontSize: '10pt' }}>
            <label style={checkboxLabelStyle}>
              <span style={checkboxStyle(mission.director_decision === 'ACCORDEE')} /> Demande accordée
            </label>
            <label style={checkboxLabelStyle}>
              <span style={checkboxStyle(mission.director_decision === 'REFUSEE')} /> Demande refusée
            </label>
          </div>
        </div>
      </div>

      {/* ═══ Signatures ═══ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8mm', fontSize: '9pt', color: '#555' }}>
        {/* Missionnaire */}
        <div style={{ textAlign: 'center', width: '30%' }}>
          <div style={{ fontWeight: 600, marginBottom: '2mm', color: '#333' }}>Le missionnaire</div>
          {mission.signature_employee ? (
            <div style={{ minHeight: '20mm', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mission.signature_employee} alt="Signature missionnaire" style={{ maxHeight: '20mm', maxWidth: '100%' }} />
            </div>
          ) : (
            <div style={{ borderBottom: '1px solid #ccc', marginTop: '18mm', paddingTop: '2mm' }} />
          )}
          <div style={{ marginTop: '2mm', fontSize: '8pt', color: '#999' }}>
            {mission.request_origin === 'EXTERNAL' && mission.external_person_name
              ? mission.external_person_name
              : user.full_name}
          </div>
        </div>

        {/* Responsable Personnel */}
        <div style={{ textAlign: 'center', width: '30%' }}>
          <div style={{ fontWeight: 600, marginBottom: '2mm', color: '#333' }}>Visa RH</div>
          {mission.signature_rp ? (
            <div style={{ minHeight: '20mm', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mission.signature_rp} alt="Signature RH" style={{ maxHeight: '20mm', maxWidth: '100%' }} />
            </div>
          ) : (
            <div style={{ borderBottom: '1px solid #ccc', marginTop: '18mm', paddingTop: '2mm' }} />
          )}
          <div style={{ marginTop: '2mm', fontSize: '8pt', color: '#999' }}>
            {mission.approver_rp?.full_name || 'Nom et cachet'}
          </div>
        </div>

        {/* Directeur */}
        <div style={{ textAlign: 'center', width: '30%' }}>
          <div style={{ fontWeight: 600, marginBottom: '2mm', color: '#333' }}>Le Directeur Exécutif</div>
          {mission.signature_de ? (
            <div style={{ minHeight: '20mm', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mission.signature_de} alt="Signature Directeur" style={{ maxHeight: '20mm', maxWidth: '100%' }} />
            </div>
          ) : (
            <div style={{ borderBottom: '1px solid #ccc', marginTop: '18mm', paddingTop: '2mm' }} />
          )}
          <div style={{ marginTop: '2mm', fontSize: '8pt', color: '#999' }}>
            {mission.approver_de?.full_name || 'Nom et cachet'}
          </div>
        </div>
      </div>

      {/* ═══ Footer ═══ */}
      <div style={{ marginTop: '8mm', borderTop: '2px solid #a3754a', paddingTop: '2mm', textAlign: 'center', fontSize: '7pt', color: '#aaa' }}>
        {companyKey} — {companyFullName}
      </div>
    </div>
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

const boxStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: '2mm',
  padding: '3mm',
  minHeight: '15mm',
}

const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '2mm',
}

const checkboxStyle = (checked: boolean): React.CSSProperties => ({
  display: 'inline-block',
  width: '3.5mm',
  height: '3.5mm',
  border: '1.5px solid #555',
  borderRadius: '0.8mm',
  backgroundColor: checked ? '#a3754a' : 'transparent',
})
