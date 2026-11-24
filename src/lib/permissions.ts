export type Access = 'ninguno' | 'ver' | 'editar'
export const MODULES: { key: string; label: string; path: string }[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/' },
  { key: 'pos', label: 'POS · Venta', path: '/pos' },
  { key: 'caja', label: 'Caja', path: '/caja' },
  { key: 'clientes', label: 'Clientes', path: '/clientes' },
  { key: 'agenda', label: 'Agenda', path: '/agenda' },
  { key: 'examenes', label: 'Exámenes · RX', path: '/examenes' },
  { key: 'cotizaciones', label: 'Cotizaciones', path: '/cotizaciones' },
  { key: 'ordenes', label: 'Órdenes lab.', path: '/ordenes' },
  { key: 'cajon', label: 'Cajón', path: '/cajon' },
  { key: 'stock', label: 'Stock', path: '/stock' },
  { key: 'rma', label: 'RMA · Reclamos', path: '/rma' },
  { key: 'intercompany', label: 'Intercompany', path: '/intercompany' },
  { key: 'reportes', label: 'Reportes', path: '/reportes' },
  { key: 'zoho', label: 'Sync Zoho', path: '/zoho' },
  { key: 'configuracion', label: 'Configuración', path: '/configuracion' },
]
export const ACCESS_LABEL: Record<Access, string> = { ninguno: 'Sin acceso', ver: 'Solo ver', editar: 'Editar' }
/** Módulo al que pertenece una ruta (/clientes/123 → clientes). */
export const moduleOfPath = (pathname: string) => {
  const seg = pathname.split('/')[1] ?? ''
  return MODULES.find((m) => m.path === '/' + seg)?.key ?? (seg === '' ? 'dashboard' : seg)
}
