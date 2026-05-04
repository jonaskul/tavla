import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getCircuit } from '../api/client'
import { t } from '../i18n/no'

export default function CircuitDetail() {
  const { id } = useParams()
  const circuitId = Number(id)

  const { data: circuit, isLoading, isError } = useQuery({
    queryKey: ['circuit', circuitId],
    queryFn: () => getCircuit(circuitId),
    retry: false,
  })

  if (isLoading) return <p className="text-gray-500 text-sm">{t.common.loading}</p>
  if (isError || !circuit)
    return <p className="text-red-500 text-sm">Kurs ikke funnet.</p>

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

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-6 bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
        {circuit.cable_type && (
          <>
            <dt className="font-medium text-gray-600">{t.circuit.cableType}</dt>
            <dd className="text-gray-900">{circuit.cable_type}</dd>
          </>
        )}
        {circuit.cross_section != null && (
          <>
            <dt className="font-medium text-gray-600">{t.circuit.crossSection}</dt>
            <dd className="text-gray-900">{circuit.cross_section} mm²</dd>
          </>
        )}
        {circuit.conductor_count != null && (
          <>
            <dt className="font-medium text-gray-600">{t.circuit.conductorCount}</dt>
            <dd className="text-gray-900">{circuit.conductor_count}</dd>
          </>
        )}
        {circuit.length_m != null && (
          <>
            <dt className="font-medium text-gray-600">{t.circuit.lengthM}</dt>
            <dd className="text-gray-900">{circuit.length_m} m</dd>
          </>
        )}
        {circuit.notes && (
          <>
            <dt className="font-medium text-gray-600">{t.circuit.notes}</dt>
            <dd className="text-gray-900 italic">{circuit.notes}</dd>
          </>
        )}
      </dl>

      <div className="rounded-lg border border-dashed border-yellow-400 bg-yellow-50 p-4 text-sm text-yellow-800">
        <p className="font-medium">Koblingspunkter og utstyr kjem i Fase 3</p>
        <p className="text-yellow-700 text-xs mt-1">
          Koblingspunkter, fastmontert utstyr og endringslogg kjem i fase 3.
        </p>
      </div>
    </div>
  )
}
