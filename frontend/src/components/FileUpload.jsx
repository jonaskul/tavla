import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getConnectionPointFiles, uploadFile, deleteFile, getFileContentUrl } from '../api/client'
import { t } from '../i18n/no'

const ACCEPT_MIMES = new Set(['image/jpeg', 'image/png', 'application/pdf'])
const MAX_SIZE = 20 * 1024 * 1024

export default function FileUpload({ connectionPointId, onUploaded }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [lightboxId, setLightboxId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const qc = useQueryClient()

  const { data: files = [] } = useQuery({
    queryKey: ['files', connectionPointId],
    queryFn: () => getConnectionPointFiles(connectionPointId),
  })

  const uploadMutation = useMutation({
    mutationFn: (file) => uploadFile(connectionPointId, file),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['files', connectionPointId] })
      setUploadError(null)
      onUploaded?.(data)
    },
    onError: (err) => {
      setUploadError(err.response?.data?.detail || t.files.uploadError)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteFile(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files', connectionPointId] })
      setConfirmDeleteId(null)
    },
  })

  const validateAndUpload = (fileList) => {
    setUploadError(null)
    for (const file of fileList) {
      if (!ACCEPT_MIMES.has(file.type)) {
        setUploadError(t.files.invalidType)
        return
      }
      if (file.size > MAX_SIZE) {
        setUploadError(t.files.tooLarge)
        return
      }
      uploadMutation.mutate(file)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    validateAndUpload(e.dataTransfer.files)
  }

  const isImage = (f) => f.mimetype?.startsWith('image/')
  const isPdf = (f) => f.mimetype === 'application/pdf'

  return (
    <div>
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <p className="text-sm text-gray-500">{t.files.uploadHint}</p>
        <p className="text-xs text-gray-400 mt-1">{t.files.acceptedTypes}</p>
        <input
          ref={inputRef}
          type="file"
          data-testid="file-input"
          className="hidden"
          onChange={(e) => validateAndUpload(e.target.files)}
          multiple
        />
      </div>

      {uploadError && (
        <p className="text-red-500 text-sm mt-2" data-testid="upload-error">
          {uploadError}
        </p>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {files.map((f) => (
            <div key={f.id} className="relative group w-20 h-20">
              {isImage(f) ? (
                <img
                  src={getFileContentUrl(f.id)}
                  alt={f.filename}
                  className="w-20 h-20 object-cover rounded border border-gray-200 cursor-pointer"
                  onClick={() => setLightboxId(f.id)}
                />
              ) : isPdf(f) ? (
                <a
                  href={getFileContentUrl(f.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-20 h-20 flex flex-col items-center justify-center rounded border border-gray-200 bg-red-50 hover:bg-red-100 no-underline"
                  title={f.filename}
                >
                  <span className="text-red-600 text-2xl">📄</span>
                  <span className="text-xs text-gray-600 text-center mt-1 truncate w-full px-1">
                    {f.filename}
                  </span>
                </a>
              ) : null}
              <button
                className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(f.id) }}
                aria-label={t.common.delete}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {lightboxId && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 cursor-pointer"
          onClick={() => setLightboxId(null)}
        >
          <img
            src={getFileContentUrl(lightboxId)}
            alt=""
            className="max-h-screen max-w-screen-lg object-contain"
          />
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm">
            <p className="text-sm text-gray-700 mb-4">{t.files.deleteConfirm}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={() => deleteMutation.mutate(confirmDeleteId)}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700"
              >
                {t.common.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
