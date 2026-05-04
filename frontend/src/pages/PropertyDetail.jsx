import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProperty, updateProperty, deleteProperty, getPanels, createPanel, updatePanel, deletePanel } from '../api/client'
import { t } from '../i18n/no'
import PropertyDialog from '../components/PropertyDialog'
import PanelDialog from '../components/PanelDialog'
import ConfirmDialog from '../components/ConfirmDialog'

export default function PropertyDetail() {
  const { id } = useParams()
  const propertyId = Number(id)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [propDialog, setPropDialog] = useState(false)
  const [propDeleteConfirm, setPropDeleteConfirm] = useState({ open: false, error: null })
  const [panelDialog, setPanelDialog] = useState({ open: false, item: null })
  const [panelDeleteConfirm, setPanelDeleteConfirm] = useState({ open: false, item: null, error: null })

  const { data: property, isLoading: loadingProp, isError } = useQuery({
    queryKey: ['property', propertyId],
    queryFn: () => getProperty(propertyId),
    retry: false,
  })

  const { data: panels = [], isLoading: loadingPanels } = useQuery({
    queryKey: ['panels', propertyId],
    queryFn: () => getPanels(propertyId),
    enabled: !!property,
  })

  const updatePropMutation = useMutation({
    mutationFn: (data) => updateProperty(propertyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property', propertyId] })
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      setPropDialog(false)
    },
  })

  const deletePropMutation = useMutation({
    mutationFn: () => deleteProperty(propertyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      navigate('/')
    },
    onError: (err) => {
      const status = err.response?.status
      setPropDeleteConfirm((c) => ({
        ...c,
        error: status === 409 ? t.property.cannotDeleteHasPanels : t.property.deleteError,
      }))
    },
  })

  const createPanelMutation = useMutation({
    mutationFn: (data) => createPanel(propertyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panels', propertyId] })
      setPanelDialog({ open: false, item: null })
    },
  })

  const updatePanelMutation = useMutation({
    mutationFn: ({ id, data }) => updatePanel(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panels', propertyId] })
      setPanelDialog({ open: false, item: null })
    },
  })

  const deletePanelMutation = useMutation({
    mutationFn: (id) => deletePanel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panels', propertyId] })
      setPanelDeleteConfirm({ open: false, item: null, error: null })
    },
    onError: (err) => {
      const status = err.response?.status
      setPanelDeleteConfirm((c) => ({
        ...c,
        error: status === 409 ? t.panel.cannotDeleteHasCircuits : t.panel.deleteError,
      }))
    },
  })

  const handlePanelSave = (payload) => {
    if (panelDialog.item) {
      updatePanelMutation.mutate({ id: panelDialog.item.id, data: payload })
    } else {
      createPanelMutation.mutate(payload)
    }
  }

  if (loadingProp) return <p className="text-gray-500 text-sm">{t.common.loading}</p>
  if (isError || !property)
    return <p className="text-red-500 text-sm">Eiendom ikke funnet.</p>

  return (
    <div>
      <div className="mb-5">
        <Link to="/" className="text-sm text-blue-600 hover:underline">
          &larr; {t.nav.properties}
        </Link>
      </div>

      {/* Property header */}
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{property.name}</h1>
          <p className="text-gray-500 text-sm mt-1">{property.address}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setPropDialog(true)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {t.common.edit}
          </button>
          <button
            onClick={() => setPropDeleteConfirm({ open: true, error: null })}
            className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-md hover:bg-red-700"
          >
            {t.common.delete}
          </button>
        </div>
      </div>

      {/* Panels section */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">{t.property.panels}</h2>
        <button
          onClick={() => setPanelDialog({ open: true, item: null })}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
        >
          {t.panel.add}
        </button>
      </div>

      {loadingPanels ? (
        <p className="text-gray-500 text-sm">{t.common.loading}</p>
      ) : panels.length === 0 ? (
        <p className="text-gray-500 text-sm">Ingen sikringsskap registrert enda.</p>
      ) : (
        <ul className="space-y-2">
          {panels.map((panel) => (
            <li
              key={panel.id}
              className="bg-white border border-gray-200 rounded-lg px-5 py-4 flex items-center justify-between shadow-sm"
            >
              <div>
                <Link
                  to={`/skap/${panel.id}`}
                  className="font-medium text-blue-700 hover:underline"
                >
                  {panel.name}
                </Link>
                <p className="text-sm text-gray-500 mt-0.5">
                  {panel.location} &mdash; {panel.rows}{' '}
                  {t.panel.rows.toLowerCase()}, {panel.modules_per_row}{' '}
                  {t.panel.modulesPerRow.toLowerCase()}
                </p>
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                <button
                  onClick={() => setPanelDialog({ open: true, item: panel })}
                  className="px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  {t.common.edit}
                </button>
                <button
                  onClick={() => setPanelDeleteConfirm({ open: true, item: panel, error: null })}
                  className="px-3 py-1 text-xs text-white bg-red-600 rounded-md hover:bg-red-700"
                >
                  {t.common.delete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Property dialogs */}
      <PropertyDialog
        open={propDialog}
        initial={property}
        onSave={(payload) => updatePropMutation.mutate(payload)}
        onClose={() => setPropDialog(false)}
      />

      <ConfirmDialog
        open={propDeleteConfirm.open}
        message={t.property.deleteConfirm}
        error={propDeleteConfirm.error}
        onConfirm={() => deletePropMutation.mutate()}
        onClose={() => setPropDeleteConfirm({ open: false, error: null })}
      />

      {/* Panel dialogs */}
      <PanelDialog
        open={panelDialog.open}
        initial={panelDialog.item}
        onSave={handlePanelSave}
        onClose={() => setPanelDialog({ open: false, item: null })}
      />

      <ConfirmDialog
        open={panelDeleteConfirm.open}
        message={t.panel.deleteConfirm}
        error={panelDeleteConfirm.error}
        onConfirm={() => deletePanelMutation.mutate(panelDeleteConfirm.item.id)}
        onClose={() => setPanelDeleteConfirm({ open: false, item: null, error: null })}
      />
    </div>
  )
}
