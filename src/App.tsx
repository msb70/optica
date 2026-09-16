import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './lib/auth'
import { AppProvider, useApp } from './lib/app'
import Layout from './components/Layout'
import { Loading } from './components/ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import POS from './pages/POS'
import Caja from './pages/Caja'
import Clientes from './pages/Clientes'
import ClienteDetalle from './pages/ClienteDetalle'
import Agenda from './pages/Agenda'
import Examenes, { ExamenNuevo } from './pages/Examenes'
import Cotizaciones from './pages/Cotizaciones'
import Ordenes from './pages/Ordenes'
import Stock from './pages/Stock'
import RMA from './pages/RMA'
import Intercompany from './pages/Intercompany'
import Reportes from './pages/Reportes'
import Zoho from './pages/Zoho'
import Configuracion from './pages/Configuracion'

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000, refetchOnWindowFocus: false } } })

function Gate() {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return <Loading label="Conectando con Nhost…" />
  if (!isAuthenticated) return <Login />
  return <AppProvider><Shell /></AppProvider>
}

function Shell() {
  const { loading, company } = useApp()
  if (loading || !company) return <Loading label="Cargando organización…" />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="pos" element={<POS />} />
        <Route path="caja" element={<Caja />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="clientes/:id" element={<ClienteDetalle />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="examenes" element={<Examenes />} />
        <Route path="examenes/nuevo" element={<ExamenNuevo />} />
        <Route path="cotizaciones" element={<Cotizaciones />} />
        <Route path="ordenes" element={<Ordenes />} />
        <Route path="stock" element={<Stock />} />
        <Route path="rma" element={<RMA />} />
        <Route path="intercompany" element={<Intercompany />} />
        <Route path="reportes" element={<Reportes />} />
        <Route path="zoho" element={<Zoho />} />
        <Route path="configuracion" element={<Configuracion />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter><Gate /></BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
