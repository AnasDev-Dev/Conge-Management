'use client'

import { MissionRequestWithRelations, Utilisateur } from '@/lib/types/database'
import { TRANSPORT_LABELS } from '@/lib/constants'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface PrintMissionDocumentProps {
  mission: MissionRequestWithRelations
  user: Utilisateur & { department?: { name: string } }
}

export default function PrintMissionDocument({ mission, user }: PrintMissionDocumentProps) {
  return (
    <div
      style={{
        width: '210mm',
        minHeight: '297mm',
        margin: '0 auto',
        padding: '15mm 20mm',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '11pt',
        color: '#1a1a1a',
        background: '#fff',
        lineHeight: 1.5,
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '8mm' }}>
        <div
          style={{
            fontSize: '10pt',
            color: '#555',
            marginBottom: '4mm',
          }}
        >
          Fédération Royale Marocaine de Golf
        </div>
        <h1
          style={{
            fontSize: '18pt',
            fontWeight: 700,
            color: '#1a1a1a',
            margin: 0,
            padding: '4mm 0',
            borderTop: '2px solid #a3754a',
            borderBottom: '2px solid #a3754a',
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}
        >
          Ordre de Mission
        </h1>
        <div
          style={{
            marginTop: '3mm',
            fontSize: '9pt',
            color: '#777',
          }}
        >
          Réf: OM-{mission.id} | {format(new Date(mission.created_at), 'dd/MM/yyyy')}
        </div>
      </div>

      {/* Section: Renseignements du missionnaire */}
      <div style={{ marginBottom: '6mm' }}>
        <div
          style={{
            background: '#f0f4f8',
            padding: '2.5mm 4mm',
            borderLeft: '3px solid #a3754a',
            fontWeight: 600,
            fontSize: '10pt',
            marginBottom: '3mm',
            color: '#333',
          }}
        >
          Renseignements du missionnaire
        </div>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '10pt',
          }}
        >
          <tbody>
            <tr>
              <td style={{ ...cellStyle, width: '35%' }}>Nom et prénom</td>
              <td style={{ ...valueCellStyle }}>{user.full_name}</td>
            </tr>
            <tr>
              <td style={cellStyle}>Fonction</td>
              <td style={valueCellStyle}>{user.job_title || '—'}</td>
            </tr>
            <tr>
              <td style={cellStyle}>Pôle / Département</td>
              <td style={valueCellStyle}>{user.department?.name || '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Section: Détails de la mission */}
      <div style={{ marginBottom: '6mm' }}>
        <div
          style={{
            background: '#f0f4f8',
            padding: '2.5mm 4mm',
            borderLeft: '3px solid #a3754a',
            fontWeight: 600,
            fontSize: '10pt',
            marginBottom: '3mm',
            color: '#333',
          }}
        >
          Détails de la mission
        </div>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '10pt',
          }}
        >
          <tbody>
            <tr>
              <td style={{ ...cellStyle, width: '35%' }}>Portée</td>
              <td style={valueCellStyle}>
                {mission.mission_scope === 'INTERNATIONAL' ? 'Internationale' : 'Locale (Maroc)'}
              </td>
            </tr>
            <tr>
              <td style={cellStyle}>Ville de départ</td>
              <td style={valueCellStyle}>{mission.departure_city}</td>
            </tr>
            <tr>
              <td style={cellStyle}>Ville d&apos;arrivée</td>
              <td style={valueCellStyle}>{mission.arrival_city}</td>
            </tr>
            <tr>
              <td style={cellStyle}>Objet de la mission</td>
              <td style={valueCellStyle}>{mission.mission_object}</td>
            </tr>
            <tr>
              <td style={cellStyle}>Date de début</td>
              <td style={valueCellStyle}>
                {format(new Date(mission.start_date), 'EEEE dd MMMM yyyy', { locale: fr })}
              </td>
            </tr>
            <tr>
              <td style={cellStyle}>Date de fin</td>
              <td style={valueCellStyle}>
                {format(new Date(mission.end_date), 'EEEE dd MMMM yyyy', { locale: fr })}
              </td>
            </tr>
            <tr>
              <td style={cellStyle}>Nombre de jours</td>
              <td style={valueCellStyle}>
                {mission.days_count} jour{mission.days_count > 1 ? 's' : ''} ouvrable{mission.days_count > 1 ? 's' : ''}
              </td>
            </tr>
            <tr>
              <td style={cellStyle}>Moyen de transport</td>
              <td style={valueCellStyle}>
                {mission.transport_type
                  ? TRANSPORT_LABELS[mission.transport_type] || mission.transport_type
                  : '—'}
                {mission.transport_details ? ` (${mission.transport_details})` : ''}
              </td>
            </tr>
            <tr>
              <td style={cellStyle}>Intérimaire</td>
              <td style={valueCellStyle}>
                {mission.replacement_user?.full_name || '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Date line */}
      <div
        style={{
          textAlign: 'right',
          fontSize: '10pt',
          marginBottom: '6mm',
          fontStyle: 'italic',
          color: '#555',
        }}
      >
        Rabat, le {format(new Date(mission.created_at), 'dd MMMM yyyy', { locale: fr })}
      </div>

      {/* Section: Avis du supérieur hiérarchique */}
      <div style={{ marginBottom: '6mm' }}>
        <div
          style={{
            background: '#f0f4f8',
            padding: '2.5mm 4mm',
            borderLeft: '3px solid #a3754a',
            fontWeight: 600,
            fontSize: '10pt',
            marginBottom: '3mm',
            color: '#333',
          }}
        >
          Avis du supérieur hiérarchique direct
        </div>
        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: '2mm',
            padding: '4mm',
            minHeight: '20mm',
          }}
        >
          <div style={{ display: 'flex', gap: '10mm', marginBottom: '3mm', fontSize: '10pt' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '2mm' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '4mm',
                  height: '4mm',
                  border: '1.5px solid #555',
                  borderRadius: '1mm',
                  backgroundColor:
                    mission.supervisor_opinion === 'FAVORABLE' ? '#a3754a' : 'transparent',
                }}
              />
              <span>Favorable</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '2mm' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '4mm',
                  height: '4mm',
                  border: '1.5px solid #555',
                  borderRadius: '1mm',
                  backgroundColor:
                    mission.supervisor_opinion === 'DEFAVORABLE' ? '#a3754a' : 'transparent',
                }}
              />
              <span>Défavorable</span>
            </label>
          </div>
          <div style={{ fontSize: '9pt', color: '#777' }}>
            Commentaires: {mission.supervisor_comments || '_______________________________________________'}
          </div>
          {mission.supervisor?.full_name && (
            <div style={{ marginTop: '2mm', fontSize: '9pt', color: '#555' }}>
              Signé par: {mission.supervisor.full_name}
              {mission.supervisor_at &&
                ` — le ${format(new Date(mission.supervisor_at), 'dd/MM/yyyy')}`}
            </div>
          )}
        </div>
      </div>

      {/* Section: Décision du Directeur Exécutif */}
      <div style={{ marginBottom: '6mm' }}>
        <div
          style={{
            background: '#f0f4f8',
            padding: '2.5mm 4mm',
            borderLeft: '3px solid #a3754a',
            fontWeight: 600,
            fontSize: '10pt',
            marginBottom: '3mm',
            color: '#333',
          }}
        >
          Décision du Directeur Exécutif
        </div>
        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: '2mm',
            padding: '4mm',
            minHeight: '15mm',
          }}
        >
          <div style={{ display: 'flex', gap: '10mm', fontSize: '10pt' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '2mm' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '4mm',
                  height: '4mm',
                  border: '1.5px solid #555',
                  borderRadius: '1mm',
                  backgroundColor:
                    mission.director_decision === 'ACCORDEE' ? '#a3754a' : 'transparent',
                }}
              />
              <span>Demande accordée</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '2mm' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '4mm',
                  height: '4mm',
                  border: '1.5px solid #555',
                  borderRadius: '1mm',
                  backgroundColor:
                    mission.director_decision === 'REFUSEE' ? '#a3754a' : 'transparent',
                }}
              />
              <span>Demande refusée</span>
            </label>
          </div>
        </div>
      </div>

      {/* Signature area */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '10mm',
          fontSize: '9pt',
          color: '#555',
        }}
      >
        <div style={{ textAlign: 'center', width: '40%' }}>
          <div style={{ borderTop: '1px solid #ccc', paddingTop: '2mm', marginTop: '15mm' }}>
            Signature du missionnaire
          </div>
        </div>
        <div style={{ textAlign: 'center', width: '40%' }}>
          <div style={{ borderTop: '1px solid #ccc', paddingTop: '2mm', marginTop: '15mm' }}>
            Signature du Directeur Exécutif
          </div>
        </div>
      </div>
    </div>
  )
}

const cellStyle: React.CSSProperties = {
  padding: '2.5mm 4mm',
  borderBottom: '1px solid #eee',
  color: '#666',
  fontWeight: 500,
  verticalAlign: 'top',
}

const valueCellStyle: React.CSSProperties = {
  padding: '2.5mm 4mm',
  borderBottom: '1px solid #eee',
  fontWeight: 400,
  color: '#1a1a1a',
  verticalAlign: 'top',
}
