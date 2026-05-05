import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import SettingsLayout from './components/SettingsLayout'
import Properties from './pages/Properties'
import PropertyDetail from './pages/PropertyDetail'
import PanelDetail from './pages/PanelDetail'
import CircuitDetail from './pages/CircuitDetail'
import ModuleTypeAdmin from './pages/ModuleTypeAdmin'
import SystemAdmin from './pages/SystemAdmin'
import NotFound from './pages/NotFound'
import { ModuleTypesProvider } from './contexts/ModuleTypesContext'

export default function App() {
  return (
    <ModuleTypesProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Properties />} />
          <Route path="/eiendommer/:id" element={<PropertyDetail />} />
          <Route path="/skap/:id" element={<PanelDetail />} />
          <Route path="/kurs/:id" element={<CircuitDetail />} />
          <Route path="/innstillinger" element={<SettingsLayout />}>
            <Route index element={<Navigate to="modultyper" replace />} />
            <Route path="modultyper" element={<ModuleTypeAdmin />} />
            <Route path="system" element={<SystemAdmin />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </ModuleTypesProvider>
  )
}
