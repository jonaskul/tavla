import { Link, Outlet, useLocation } from 'react-router-dom'
import { t } from '../i18n/no'

const TABS = [
  { key: 'modultyper', label: t.settings.tabModuleTypes, to: '/innstillinger/modultyper' },
  { key: 'system', label: t.settings.tabSystem, to: '/innstillinger/system' },
]

export default function SettingsLayout() {
  const { pathname } = useLocation()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t.settings.title}</h1>
      </div>

      <div className="flex border-b border-gray-200 mb-6">
        {TABS.map(({ key, label, to }) => (
          <Link
            key={key}
            to={to}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              pathname.startsWith(to)
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <Outlet />
    </div>
  )
}
