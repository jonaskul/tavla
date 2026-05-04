import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getPanel } from '../api/panels'
import { t } from '../i18n/no'

export default function PanelDetail() {
  const { id } = useParams()
  const panelId = Number(id)

  const { data: panel, isLoading } = useQuery({
    queryKey: ['panel', panelId],
    queryFn: () => getPanel(panelId),
  })

  if (isLoading) return <p className="text-gray-500 text-sm">{t.common.loading}</p>
  if (!panel) return <p className="text-red-500 text-sm">Sikringsskap ikke funnet.</p>

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

      <div className="rounded-lg border border-dashed border-yellow-400 bg-yellow-50 p-6 text-center text-sm text-yellow-800">
        <p className="font-medium mb-1">{t.panel.configure}</p>
        <p className="text-yellow-700">
          Visuell skemontasje og modulkonfigurasjon kjem i fase 2.
        </p>
      </div>
    </div>
  )
}
