import { useMemo, useState } from 'react'
import { Upload, Download, AlertTriangle } from 'lucide-react'
import { Modal, Field, Badge } from './ui'
import { gql } from '../lib/nhost'
import { money, CATEGORIES } from '../lib/format'

const COLS = ['sku', 'nombre', 'categoria', 'marca', 'modelo', 'color', 'costo', 'precio', 'cantidad', 'proveedor', 'origen', 'ref_proveedor', 'codigo_barras', 'stock_minimo']
const CAT_ALIAS: Record<string, string> = { armazon: 'armazon', 'armazón': 'armazon', aro: 'armazon', montura: 'armazon', lente: 'lente', cristal: 'lente', lente_contacto: 'lente_contacto', 'lentes de contacto': 'lente_contacto', contacto: 'lente_contacto', solar: 'solar', solares: 'solar', accesorio: 'accesorio', accesorios: 'accesorio', servicio: 'servicio' }
const ORIGIN_ALIAS: Record<string, string> = { china: 'china', 'zona libre': 'zona_libre', zona_libre: 'zona_libre', zl: 'zona_libre', eeuu: 'eeuu', usa: 'eeuu', 'estados unidos': 'eeuu', local: 'local' }
const EXISTING = `query Ex($skus: [String!]!) { products(where:{sku:{_in:$skus}}) { id sku } suppliers { id name } }`
const UPSERT = `mutation Up($objs: [products_insert_input!]!) { insert_products(objects:$objs, on_conflict:{constraint: products_sku_key, update_columns:[name, category, brand, model, color, cost, price, supplier_id, supplier_ref, barcode, min_stock, track_stock]}) { returning { id sku } } }`
const SUP = `mutation S($objs: [suppliers_insert_input!]!) { insert_suppliers(objects:$objs) { returning { id name } } }`
const MOVES = `mutation M($objs: [stock_movements_insert_input!]!) { insert_stock_movements(objects:$objs) { affected_rows } }`

type Row = { sku: string; nombre: string; categoria: string; marca: string; modelo: string; color: string; costo: number; precio: number; cantidad: number; proveedor: string; origen: string; ref_proveedor: string; codigo_barras: string; stock_minimo: number; error?: string }

function parse(text: string): Row[] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim())
  if (!lines.length) return []
  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ';' : (lines[0].includes('\t') ? '\t' : ',')
  const head = lines[0].split(sep).map((h) => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_'))
  const idx = (k: string) => head.indexOf(k)
  const num = (v: string) => Number((v ?? '').replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0
  return lines.slice(1).map((l) => {
    const c = l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ''))
    const g = (k: string) => (idx(k) >= 0 ? c[idx(k)] ?? '' : '')
    const cat = CAT_ALIAS[g('categoria').toLowerCase()] ?? ''
    const r: Row = { sku: g('sku').toUpperCase(), nombre: g('nombre'), categoria: cat, marca: g('marca'), modelo: g('modelo'), color: g('color'), costo: num(g('costo')), precio: num(g('precio')), cantidad: Math.round(num(g('cantidad'))), proveedor: g('proveedor'), origen: ORIGIN_ALIAS[g('origen').toLowerCase()] ?? (g('origen') ? 'otro' : 'local'), ref_proveedor: g('ref_proveedor'), codigo_barras: g('codigo_barras'), stock_minimo: Math.round(num(g('stock_minimo'))) || 2 }
    r.error = !r.sku ? 'Falta SKU' : !r.nombre ? 'Falta nombre' : !r.categoria ? `Categoría no válida (${g('categoria') || 'vacía'})` : r.precio <= 0 ? 'Precio vacío' : undefined
    return r
  })
}

export default function ImportInventory({ open, onClose, onDone, branchId, branchName, staffId }: { open: boolean; onClose: () => void; onDone: (msg: string) => void; branchId: string; branchName: string; staffId: string | null }) {
  const [text, setText] = useState('')
  const [kind, setKind] = useState<'carga_inicial' | 'compra'>('compra')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const rows = useMemo(() => parse(text), [text])
  const ok = rows.filter((r) => !r.error), bad = rows.filter((r) => r.error)
  const template = () => { const blob = new Blob(['﻿' + COLS.join(';') + '\nRB-2140-NEG;Ray-Ban RB2140 Wayfarer Negro;armazon;Ray-Ban;RB2140;Negro;45.00;129.00;6;Óptica Import ZL;zona libre;RB2140-901;;2\n'], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'plantilla_inventario.csv'; a.click() }
  const file = (f?: File) => { if (!f) return; const rd = new FileReader(); rd.onload = () => setText(String(rd.result ?? '')); rd.readAsText(f) }
  const run = async () => {
    setBusy(true); setErr(null)
    try {
      const ex = await gql<{ products: { id: string; sku: string }[]; suppliers: { id: string; name: string }[] }>(EXISTING, { skus: ok.map((r) => r.sku) })
      const supMap = new Map(ex.suppliers.map((s) => [s.name.toLowerCase(), s.id]))
      const newSup = [...new Map(ok.filter((r) => r.proveedor && !supMap.has(r.proveedor.toLowerCase())).map((r) => [r.proveedor.toLowerCase(), { name: r.proveedor, origin: r.origen }])).values()]
      if (newSup.length) (await gql<{ insert_suppliers: { returning: { id: string; name: string }[] } }>(SUP, { objs: newSup })).insert_suppliers.returning.forEach((s) => supMap.set(s.name.toLowerCase(), s.id))
      const objs = ok.map((r) => ({ sku: r.sku, name: r.nombre, category: r.categoria, brand: r.marca || null, model: r.modelo || null, color: r.color || null, cost: r.costo, price: r.precio, supplier_id: r.proveedor ? supMap.get(r.proveedor.toLowerCase()) : null, supplier_ref: r.ref_proveedor || null, barcode: r.codigo_barras || null, min_stock: r.stock_minimo, track_stock: !['lente', 'servicio'].includes(r.categoria) }))
      const up = await gql<{ insert_products: { returning: { id: string; sku: string }[] } }>(UPSERT, { objs })
      const ids = new Map(up.insert_products.returning.map((p) => [p.sku, p.id]))
      const moves = ok.filter((r) => r.cantidad !== 0 && !['lente', 'servicio'].includes(r.categoria)).map((r) => ({ product_id: ids.get(r.sku), branch_id: branchId, qty: r.cantidad, type: kind, note: kind === 'compra' ? 'Importación de mercancía' : 'Carga inicial de inventario', staff_id: staffId }))
      if (moves.length) await gql(MOVES, { objs: moves })
      const created = ok.length - ex.products.length
      onDone(`${ok.length} artículos importados (${created} nuevos, ${ex.products.length} actualizados) · ${moves.reduce((a, m) => a + m.qty, 0)} unidades a ${branchName}${newSup.length ? ` · ${newSup.length} proveedores nuevos` : ''}`)
      setText('')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error al importar') } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Importar inventario / mercancía" size="xl" footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !ok.length} onClick={run}><Upload size={15} />Importar {ok.length} artículos a {branchName}</button></>}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button className="btn-secondary h-8 text-xs" onClick={template}><Download size={13} />Plantilla CSV</button>
          <label className="btn-secondary h-8 text-xs cursor-pointer"><Upload size={13} />Subir archivo CSV<input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => file(e.target.files?.[0])} /></label>
          <span className="text-xs text-slate-500">o pega aquí las filas copiadas de Excel (con cabecera)</span>
          <Field label="" className="ml-auto"><select className="input h-8 text-xs" value={kind} onChange={(e) => setKind(e.target.value as 'compra' | 'carga_inicial')}><option value="compra">Entrada de mercancía (compra)</option><option value="carga_inicial">Carga inicial de inventario</option></select></Field>
        </div>
        <textarea className="input font-mono text-xs h-32" placeholder={COLS.join(';')} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="text-[11px] text-slate-500">Columnas: {COLS.join(', ')}. Si el SKU ya existe se actualizan datos y precios y se suman las unidades. Los cristales y servicios no mueven stock. Los proveedores que no existan se crean.</div>
        {rows.length > 0 && <div className="max-h-72 overflow-auto rounded-xl border border-slate-200"><table className="table text-xs"><thead><tr><th>SKU</th><th>Nombre</th><th>Categoría</th><th>Marca</th><th className="text-right">Costo</th><th className="text-right">Precio</th><th className="text-right">Cant.</th><th>Proveedor / ref.</th><th /></tr></thead><tbody>
          {rows.slice(0, 300).map((r, i) => <tr key={i} className={r.error ? 'bg-rose-50/60' : ''}><td className="font-mono">{r.sku}</td><td>{r.nombre}</td><td>{CATEGORIES[r.categoria] ?? '—'}</td><td>{r.marca}</td><td className="text-right">{money(r.costo)}</td><td className="text-right">{money(r.precio)}</td><td className="text-right">{r.cantidad}</td><td>{r.proveedor}{r.ref_proveedor && <span className="text-slate-400"> · {r.ref_proveedor}</span>}</td><td>{r.error ? <Badge tone="rose"><AlertTriangle size={10} />{r.error}</Badge> : <Badge tone="green">OK</Badge>}</td></tr>)}
        </tbody></table></div>}
        {rows.length > 0 && <div className="text-xs text-slate-600">{ok.length} filas válidas · {bad.length} con errores (se omiten)</div>}
        {err && <div className="text-xs text-rose-600 font-semibold">{err}</div>}
      </div>
    </Modal>
  )
}
