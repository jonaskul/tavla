import { Link, useLocation } from 'react-router-dom'
import { t } from '../i18n/no'

export default function Layout({ children }) {
  const { pathname } = useLocation()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-0 flex items-center h-14 gap-8">
          <Link
            to="/"
            className="text-lg font-bold text-blue-700 tracking-tight shrink-0"
          >
            Tavla
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link
              to="/"
              className={
                pathname === '/'
                  ? 'text-blue-700 font-medium'
                  : 'text-gray-600 hover:text-blue-600'
              }
            >
              {t.nav.properties}
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
