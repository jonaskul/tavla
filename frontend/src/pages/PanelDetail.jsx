import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getPanel, getCircuits } from '../api/client'
import { t } from '../i18n/no'
import PanelCanvas from '../components/PanelMockup/PanelCanvas'

export default function PanelDetail() {
  const { id } = useParams()
  const panelId = Number(id)

  const { data: panel, isLoading, isError } = useQuery({
    queryKey: ['panel', panelId],
    queryFn: () => getPanel(panelId),
    retry: false,
  })

  const { data: circuits = [], isLoading: loadingCircuits } = useQuery({
    queryKey: ['circuits', panelId],
    queryFn: () => getCircuits(panelId),
    enabled: !!panel,
  })

  if (isLoading) return <p className="text-gray-500 text-sm">{t.common.loading}</p>
  if (isError || !panel)
    return <p className="text-red-500 text-sm">Sikringsskap ikke funnet.</p>

  return (
    <div>
      <div className="mb-5">
        <Link
          to={`/eiendommer/${panel.property_id}`}
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; {t.common.back}
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{panel.name}</h1>
        <p className="text-gray-500 text-sm mt-1">{panel.location}</p>
        <div className="mt-2 flex gap-4 text-sm text-gray-600">
          <span>
            <span className="font-medium">{t.panel.rows}:</span> {panel.rows}
          </span>
          <span>
            <span className="font-medium">{t.panel.modulesPerRow}:</span>{' '}
            {panel.modules_per_row}
          </span>
        </div>
        {panel.notes && (
          <p className="text-sm text-gray-500 mt-2 italic">{panel.notes}</p>
        )}
      </div>

      <div className="mb-6">
        <PanelCanvas panelId={panelId} />
      </div>

      <h2 className="text-lg font-semibold text-gray-800 mb-3">{t.nav.circuit}</h2>

      {loadingCircuits ? (
        <p className="text-gray-500 text-sm">{t.common.loading}</p>
      ) : circuits.length === 0 ? (
        <p className="text-gray-500 text-sm">Ingen kurser registrert enda.</p>
      ) : (
        <ul className="space-y-2">
          {circuits.map((circuit) => (
            <li
              key={circuit.id}
              className="bg-white border border-gray-200 rounded-lg px-5 py-3 shadow-sm"
            >
              <Link
                to={`/kurs/${circuit.id}`}
                className="font-medium text-blue-700 hover:underline"
              >
                {circuit.designation} — {circuit.name}
              </Link>
              {circuit.room && (
                <p className="text-sm text-gray-500 mt-0.5">{circuit.room}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
