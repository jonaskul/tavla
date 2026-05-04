import { Link } from 'react-router-dom'
import { t } from '../i18n/no'

export default function NotFound() {
  return (
    <div className="text-center py-16">
      <h1 className="text-4xl font-bold text-gray-300 mb-4">404</h1>
      <p className="text-gray-600 mb-6">Siden finnes ikke.</p>
      <Link to="/" className="text-blue-600 hover:underline text-sm">
        &larr; {t.nav.properties}
      </Link>
    </div>
  )
}
