import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Properties from './pages/Properties'
import PropertyDetail from './pages/PropertyDetail'
import PanelDetail from './pages/PanelDetail'
import CircuitDetail from './pages/CircuitDetail'
import ModuleTypeAdmin from './pages/ModuleTypeAdmin'
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
          <Route path="/innstillinger/modultyper" element={<ModuleTypeAdmin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </ModuleTypesProvider>
  )
}
