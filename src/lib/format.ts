import { format, formatDistanceToNowStrict, parseISO, isValid } from 'date-fns'
import { es } from 'date-fns/locale'

export const money = (n: number | string | null | undefined, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 2 }).format(Number(n ?? 0))
export const num = (n: number | string | null | undefined, d = 0) => new Intl.NumberFormat('es-PA', { maximumFractionDigits: d, minimumFractionDigits: d }).format(Number(n ?? 0))
export const pct = (n: number | string | null | undefined, d = 1) => `${num(Number(n ?? 0) * 100, d)}%`
const toDate = (d: string | Date | null | undefined) => (!d ? null : d instanceof Date ? d : parseISO(d))
export const fdate = (d: string | Date | null | undefined, f = 'dd MMM yyyy') => { const x = toDate(d); return x && isValid(x) ? format(x, f, { locale: es }) : '—' }
export const fdatetime = (d: string | Date | null | undefined) => fdate(d, "dd MMM yyyy · HH:mm")
export const ftime = (d: string | Date | null | undefined) => fdate(d, 'HH:mm')
export const ago = (d: string | Date | null | undefined) => { const x = toDate(d); return x && isValid(x) ? formatDistanceToNowStrict(x, { locale: es, addSuffix: true }) : '—' }
export const monthLabel = (d: string) => fdate(d, 'MMM yy')
export const todayISO = () => new Date().toISOString().slice(0, 10)
export const monthStartISO = (offset = 0) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - offset); return d.toISOString().slice(0, 10) }
export const rxfmt = (v: number | undefined | null, sign = true) => (v === undefined || v === null || Number.isNaN(Number(v)) ? '—' : `${sign && Number(v) > 0 ? '+' : ''}${Number(v).toFixed(2)}`)
export const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')
export const fullName = (c?: { first_name?: string; last_name?: string } | null) => (c ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() : '—')

export const SOURCES: Record<string, string> = { 'walk-in': 'Walk-in', referido: 'Referido', instagram: 'Instagram', google_ads: 'Google Ads', campania: 'Campaña', empresa: 'Empresa', doctor: 'Doctor', facebook: 'Facebook', web: 'Web' }
export const CATEGORIES: Record<string, string> = { armazon: 'Armazón', lente: 'Lentes', lente_contacto: 'Lentes de contacto', solar: 'Solares', accesorio: 'Accesorios', servicio: 'Servicios' }
export const METHODS: Record<string, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', yappy: 'Yappy', vale: 'Vale', saldo_cliente: 'Saldo cliente', credito: 'Crédito' }
export const ROLES: Record<string, string> = { admin: 'Administrador', gerente: 'Gerente', vendedor: 'Vendedor', optometrista: 'Optometrista', cajero: 'Cajero', almacen: 'Almacén' }
export const STATUS_LABEL: Record<string, string> = {
  completada: 'Completada', parcial: 'Pago parcial', anulada: 'Anulada', devuelta: 'Devuelta',
  pendiente: 'Pendiente', en_laboratorio: 'En laboratorio', listo: 'Listo', entregado: 'Entregado', enviado: 'Enviado', en_proceso: 'En proceso', recibido: 'Recibido', control_calidad: 'Control calidad', cancelado: 'Cancelado',
  abierta: 'Abierta', seguimiento: 'Seguimiento', convertida: 'Convertida', perdida: 'Perdida', vencida: 'Vencida', cerrada: 'Cerrada',
  abierto: 'Abierto', en_revision: 'En revisión', aprobado: 'Aprobado', rechazado: 'Rechazado', en_reparacion: 'En reparación', resuelto: 'Resuelto', cerrado: 'Cerrado',
  borrador: 'Borrador', emitido: 'Emitido', aceptado: 'Aceptado', pagado: 'Pagado', cobrado: 'Cobrado',
  programada: 'Programada', confirmada: 'Confirmada', atendida: 'Atendida', no_show: 'No asistió', cancelada: 'Cancelada',
  sincronizado: 'Sincronizado', error: 'Error', omitido: 'Omitido', ok: 'OK', procesando: 'Procesando', descartado: 'Descartado',
  devolucion: 'Devolución', reparacion: 'Reparación', garantia: 'Garantía', cambio: 'Cambio',
  traspaso: 'Traspaso', orden_lab: 'Orden lab.', servicio: 'Servicio', manual: 'Manual',
}
export const STATUS_TONE: Record<string, string> = {
  completada: 'green', pagado: 'green', cobrado: 'green', entregado: 'green', convertida: 'green', resuelto: 'green', cerrado: 'slate', cerrada: 'slate', ok: 'green', sincronizado: 'green', aceptado: 'green', atendida: 'green', recibido: 'green', listo: 'green',
  parcial: 'amber', pendiente: 'amber', seguimiento: 'amber', abierta: 'blue', abierto: 'blue', en_revision: 'amber', en_reparacion: 'amber', emitido: 'blue', programada: 'blue', confirmada: 'blue', en_laboratorio: 'violet', enviado: 'violet', en_proceso: 'violet', control_calidad: 'violet', procesando: 'violet', aprobado: 'green', borrador: 'slate',
  anulada: 'rose', devuelta: 'rose', perdida: 'rose', vencida: 'rose', rechazado: 'rose', cancelado: 'rose', cancelada: 'rose', error: 'rose', no_show: 'rose', descartado: 'slate', omitido: 'slate',
}
