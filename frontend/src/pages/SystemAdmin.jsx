import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSystemStatus, checkSystemUpdate } from '../api/client'
import { t } from '../i18n/no'

const s = t.system

const STEP_NAMES = Object.keys(t.system.steps)

const STATUS_ICON = {
  waiting: <span className="w-5 h-5 rounded-full border-2 border-gray-300 inline-block" />,
  running: (
    <span className="w-5 h-5 inline-flex items-center justify-center">
      <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
    </span>
  ),
  done: <span className="w-5 h-5 text-green-600 inline-flex items-center justify-center font-bold">✓</span>,
  error: <span className="w-5 h-5 text-red-600 inline-flex items-center justify-center font-bold">✗</span>,
}

function VersionCard({ status }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">{s.versionCard}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-gray-500">{s.commit}</dt>
        <dd className="font-mono text-gray-900">{status.current_commit}</dd>
        <dt className="text-gray-500">{s.branch}</dt>
        <dd className="font-mono text-gray-900">{status.current_branch}</dd>
        <dt className="text-gray-500">{s.commitDate}</dt>
        <dd className="text-gray-900">{status.commit_date}</dd>
        <dt className="text-gray-500">{s.commitMessage}</dt>
        <dd className="text-gray-900">{status.commit_message}</dd>
      </dl>
    </div>
  )
}

function ChangelogEntry({ commit }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0 text-sm">
      <span className="font-mono text-xs text-gray-400 shrink-0 pt-0.5">{commit.hash}</span>
      <span className="text-gray-800 flex-1">{commit.message}</span>
      <span className="text-gray-400 text-xs shrink-0">{commit.date?.slice(0, 10)}</span>
    </div>
  )
}

function StepRow({ name, stepState }) {
  const label = s.steps[name] ?? name
  const { status = 'waiting', output = '' } = stepState ?? {}

  return (
    <div className="py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3">
        {STATUS_ICON[status] ?? STATUS_ICON.waiting}
        <span className={`text-sm ${status === 'error' ? 'text-red-700 font-medium' : 'text-gray-800'}`}>
          {label}
        </span>
      </div>
      {output && status !== 'done' && (
        <pre className="mt-1.5 ml-8 text-xs text-gray-500 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
          {output}
        </pre>
      )}
    </div>
  )
}

export default function SystemAdmin() {
  const { data: status, isLoading: loadingStatus } = useQuery({
    queryKey: ['system-status'],
    queryFn: getSystemStatus,
    retry: false,
  })

  const [checking, setChecking] = useState(false)
  const [updateInfo, setUpdateInfo] = useState(null)
  const [checkError, setCheckError] = useState(null)

  const [updateStarted, setUpdateStarted] = useState(false)
  const [stepStates, setStepStates] = useState({})
  const [updateFinished, setUpdateFinished] = useState(false)
  const esRef = useRef(null)

  const handleCheckUpdate = async () => {
    setChecking(true)
    setCheckError(null)
    setUpdateInfo(null)
    try {
      const data = await checkSystemUpdate()
      setUpdateInfo(data)
    } catch (err) {
      setCheckError(err.response?.data?.detail ?? 'Ukjent feil')
    } finally {
      setChecking(false)
    }
  }

  const handleStartUpdate = () => {
    if (esRef.current) return
    setUpdateStarted(true)
    setUpdateFinished(false)
    setStepStates({})

    const es = new EventSource('/api/system/update/stream')
    esRef.current = es

    es.onmessage = (e) => {
      const event = JSON.parse(e.data)
      const { step, status: stepStatus, output = '', dev_mode } = event

      setStepStates((prev) => ({
        ...prev,
        [step]: { status: stepStatus, output, dev_mode },
      }))

      if (stepStatus === 'error') {
        es.close()
        esRef.current = null
        setUpdateFinished(true)
      }

      if (step === 'restarting' && stepStatus === 'done') {
        es.close()
        esRef.current = null
        setUpdateFinished(true)
        if (!dev_mode) {
          setTimeout(() => window.location.reload(), 2000)
        }
      }
    }

    es.onerror = () => {
      es.close()
      esRef.current = null
      setUpdateFinished(true)
    }
  }

  const hasError = Object.values(stepStates).some((s) => s.status === 'error')

  return (
    <div className="max-w-2xl">
      {loadingStatus ? (
        <p className="text-sm text-gray-500">{t.common.loading}</p>
      ) : status ? (
        <VersionCard status={status} />
      ) : null}

      {/* Check for updates */}
      {!updateStarted && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-gray-700">
              {updateInfo === null && !checkError && <span>{s.checkUpdate}</span>}
              {checkError && <span className="text-red-600">{checkError}</span>}
              {updateInfo && !updateInfo.updates_available && (
                <span className="text-green-700">{s.upToDate}</span>
              )}
              {updateInfo?.updates_available && (
                <span className="text-blue-700">
                  {s.updatesAvailable.replace('{n}', updateInfo.commits_behind)}
                </span>
              )}
            </div>
            <button
              onClick={handleCheckUpdate}
              disabled={checking}
              className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md disabled:opacity-50 shrink-0"
            >
              {checking ? s.checking : s.checkUpdate}
            </button>
          </div>

          {updateInfo?.changelog?.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {s.changelog}
              </p>
              {updateInfo.changelog.map((c) => (
                <ChangelogEntry key={c.hash} commit={c} />
              ))}
            </div>
          )}

          {updateInfo?.updates_available && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleStartUpdate}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                {s.startUpdate}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Update progress */}
      {updateStarted && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            {updateFinished
              ? hasError ? s.updateError : s.updateDone
              : s.updating}
          </h2>
          <div>
            {STEP_NAMES.map((name) => (
              <StepRow key={name} name={name} stepState={stepStates[name]} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
