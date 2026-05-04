import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getCircuit } from '../api/circuits'
import { t } from '../i18n/no'

export default function CircuitDetail() {
  const { id } = useParams()
  const circuitId = Number(id)

  const { data: circuit, isLoading } = useQuery({
    queryKey: ['circuit', circuitId],
    queryFn: () => getCircuit(circuitId),
  })

  if (isLoading) return <p className="text-gray-500 text-sm">{t.common.loading}</p>
  if (!circuit) return <p className="text-red-500 text-sm">Kurs ikke funnet.</p>

  return (
    <div>
      <div className="mb-5">
        <Link
          to={`/skap/${circuit.panel_id}`}
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; {t.common.back}
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {circuit.designation} — {circuit.name}
        </h1>
        {circuit.room && (
          <p className="text-gray-500 text-sm mt-1">{circuit.room}</p>
        )}
      </div>

      <div className="rounded-lg border border-dashed border-yellow-400 bg-yellow-50 p-6 text-center text-sm text-yellow-800">
        <p className="font-medium mb-1">{t.circuit.title}</p>
        <p className="text-yellow-700">
          Koblingspunkter, fastmontert utstyr og endringslogg kjem i fase 3.
        </p>
      </div>
    </div>
  )
}
