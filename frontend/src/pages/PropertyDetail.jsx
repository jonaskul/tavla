import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProperty, updateProperty, deleteProperty, getPanels, createPanel, updatePanel, deletePanel, exportProperty } from '../api/client'
import { t } from '../i18n/no'
import PropertyDialog from '../components/PropertyDialog'
import PanelDialog from '../components/PanelDialog'
import ConfirmDialog from '../components/ConfirmDialog'
import PropertyTree from '../components/PropertyTree'

export default function PropertyDetail() {
  const { id } = useParams()
  const propertyId = Number(id)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [tab, setTab] = useState('panels')
  const [propDialog, setPropDialog] = useState(false)
  const [propDeleteConfirm, setPropDeleteConfirm] = useState({ open: false, error: null })
  const [panelDialog, setPanelDialog] = useState({ open: false, item: null })
  const [panelDeleteConfirm, setPanelDeleteConfirm] = useState({ open: false, item: null, error: null })
  const [exporting, setExporting] = useState(false)
  const [toast, setToast] = useState(null)

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

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const data = await exportProperty(propertyId)
      const slug = property.name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
      const date = new Date().toISOString().slice(0, 10)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tavla-${slug}-${date}.json`
      a.click()
      URL.revokeObjectURL(url)
      showToast(t.property.exportSuccess)
    } catch {
      showToast(t.property.exportError, 'error')
    } finally {
      setExporting(false)
    }
  }

  if (loadingProp) return <p className="text-gray-500 text-sm">{t.common.loading}</p>
  if (isError || !property)
    return <p className="text-red-500 text-sm">Anlegg ikke funnet.</p>

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
            onClick={handleExport}
            disabled={exporting}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            {exporting ? t.common.loading : t.property.export}
          </button>
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

      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-gray-200 mb-6">
        <div className="flex">
          {[
            { key: 'panels', label: t.property.tabPanels },
            { key: 'overview', label: t.property.tabOverview },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'panels' && (
          <button
            onClick={() => setPanelDialog({ open: true, item: null })}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors mb-1"
          >
            {t.panel.add}
          </button>
        )}
      </div>

      {/* Tab: Skap */}
      {tab === 'panels' && (
        loadingPanels ? (
          <p className="text-gray-500 text-sm">{t.common.loading}</p>
        ) : panels.length === 0 ? (
          <p className="text-gray-500 text-sm">{t.property.treeNoPanels}</p>
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
        )
      )}

      {/* Tab: Oversikt */}
      {tab === 'overview' && <PropertyTree propertyId={propertyId} />}

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

      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm text-white transition-opacity ${
            toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
