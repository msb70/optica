import type { Rx } from '../lib/types'
import { rxfmt } from '../lib/format'

export default function RxTable({ rx, title, compact }: { rx?: Rx | null; title?: string; compact?: boolean }) {
  if (!rx || (!rx.od && !rx.oi)) return <div className="text-xs text-slate-400">Sin datos</div>
  return (
    <div className={compact ? 'text-xs' : 'text-sm'}>
      {title && <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{title}</div>}
      <table className="w-full text-center">
        <thead><tr className="text-[10px] uppercase text-slate-400"><th className="text-left font-semibold py-1">Ojo</th><th className="font-semibold">ESF</th><th className="font-semibold">CIL</th><th className="font-semibold">EJE</th><th className="font-semibold">ADD</th><th className="font-semibold">AV</th></tr></thead>
        <tbody className="font-mono">
          {(['od', 'oi'] as const).map((eye) => {
            const e = rx[eye]
            return <tr key={eye} className="border-t border-slate-100"><td className="text-left font-sans font-bold text-slate-700 py-1">{eye.toUpperCase()}</td><td>{rxfmt(e?.sph)}</td><td>{rxfmt(e?.cyl)}</td><td>{e?.axis ?? '—'}°</td><td>{e?.add ? rxfmt(e.add) : '—'}</td><td className="font-sans text-slate-500">{e?.va ?? '—'}</td></tr>
          })}
        </tbody>
      </table>
      {rx.pd && <div className="mt-1 text-[11px] text-slate-500">DP: <b>{rx.pd} mm</b></div>}
    </div>
  )
}
