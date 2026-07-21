'use client'

import { useMemo, useState } from 'react'
import {
  Receipt,
  Loader2,
  Clipboard,
  Check,
  X,
  AlertCircle,
  Link2,
  Wand2,
} from 'lucide-react'
import type { LineaOfertaPrecio, SeleccionPedido } from '@/lib/types'
import { fmtEUR } from '@/lib/secciones'

interface MaterialRef {
  indice: number
  descripcion: string
}

interface ImportarOfertaPreciosProps {
  selecciones: SeleccionPedido[]
  materiales: MaterialRef[]
  onAplicar: (cambios: Array<{ indice: number; cambios: Partial<SeleccionPedido> }>) => void
}

interface FilaResultado extends LineaOfertaPrecio {
  matchIndice: number | null
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos (normalize NFD los separa en marcas combinantes)
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenScore(a: string, b: string): number {
  const ta = new Set(normalizar(a).split(' ').filter((t) => t.length > 2))
  const tb = new Set(normalizar(b).split(' ').filter((t) => t.length > 2))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / Math.max(ta.size, tb.size)
}

// Empareja cada línea de la oferta con el material del pedido más parecido
// (por solapamiento de palabras). Heurística simple: el usuario siempre revisa
// visualmente la tabla resultante antes de aplicar nada al pedido.
function emparejar(filas: LineaOfertaPrecio[], materiales: MaterialRef[]): FilaResultado[] {
  const usados = new Set<number>()
  return filas.map((fila) => {
    let mejor: { indice: number; score: number } | null = null
    for (const m of materiales) {
      if (usados.has(m.indice)) continue
      const score = tokenScore(fila.descripcion, m.descripcion)
      if (score > 0.34 && (!mejor || score > mejor.score)) mejor = { indice: m.indice, score }
    }
    if (mejor) usados.add(mejor.indice)
    return { ...fila, matchIndice: mejor?.indice ?? null }
  })
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      /* fallback */
    }
  }
  const ta = document.createElement('textarea')
  ta.value = text
  Object.assign(ta.style, { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' })
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

export default function ImportarOfertaPrecios({ selecciones, materiales, onAplicar }: ImportarOfertaPreciosProps) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [proveedorTexto, setProveedorTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filas, setFilas] = useState<FilaResultado[]>([])
  const [proveedorDetectado, setProveedorDetectado] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [aplicadas, setAplicadas] = useState<Set<number>>(new Set())

  // Solo se cruza contra materiales que siguen incluidos en el pedido y que
  // todavía no tienen un precio ya aplicado desde una importación anterior.
  const materialesLibres = useMemo(() => {
    const incluidos = new Set(selecciones.filter((s) => s.incluido).map((s) => s.indice))
    return materiales.filter((m) => incluidos.has(m.indice) && !aplicadas.has(m.indice))
  }, [materiales, selecciones, aplicadas])

  const handleCalcular = async () => {
    if (!texto.trim() || cargando) return
    setCargando(true)
    setError(null)
    try {
      const res = await fetch('/api/oferta-precios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, proveedor: proveedorTexto || undefined }),
      })
      if (!res.ok) throw new Error('Error al procesar la oferta')
      const data = await res.json()
      const lineas: LineaOfertaPrecio[] = data.lineas || []
      if (lineas.length === 0) {
        setError('No se identificó ningún concepto con importe en el texto pegado.')
        setFilas([])
        return
      }
      setProveedorDetectado(data.proveedor || null)
      setFilas(emparejar(lineas, materialesLibres))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setCargando(false)
    }
  }

  const totalOferta = useMemo(() => filas.reduce((acc, f) => acc + f.importeTotal, 0), [filas])
  const coincidencias = useMemo(() => filas.filter((f) => f.matchIndice !== null).length, [filas])
  const conDescuento = useMemo(() => filas.filter((f) => f.descuentoPct > 0).length, [filas])

  const handleCopiarTabla = async () => {
    const cabecera = ['Descripción', 'Cantidad', 'Importe Total', 'Formato SAP', 'Multiplicador', 'Precio Unitario'].join('\t')
    const filasTexto = filas.map((f) =>
      [f.descripcion, f.cantidad, f.importeTotal.toFixed(2).replace('.', ','), f.precioSAP, f.multiplicadorLabel, f.precioUnitarioLabel].join('\t')
    )
    await copyToClipboard([cabecera, ...filasTexto].join('\n'))
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  const handleAplicar = () => {
    const cambios = filas
      .filter((f) => f.matchIndice !== null)
      .map((f) => ({
        indice: f.matchIndice as number,
        cambios: {
          precioUnitario: f.precioUnitario,
          precioSAP: f.precioSAP,
          multiplicador: f.multiplicador,
          moneda: 'EUR',
        },
      }))
    if (cambios.length === 0) return
    onAplicar(cambios)
    setAplicadas((prev) => {
      const next = new Set(prev)
      for (const c of cambios) next.add(c.indice)
      return next
    })
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.25)', color: 'rgba(110,231,183,0.9)' }}
        title="Pegar una oferta de proveedor y calcular el precio unitario en formato SAP"
      >
        <Receipt className="w-3.5 h-3.5" />
        Importar precios de oferta
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-emerald-500/20 overflow-hidden" style={{ background: 'rgba(16,185,129,0.03)' }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-emerald-500/10">
        <div className="flex items-center gap-2">
          <Receipt className="w-3.5 h-3.5 text-emerald-400/70" />
          <h4 className="text-sm font-semibold text-white/85">Importar precios de oferta</h4>
        </div>
        <button
          onClick={() => setAbierto(false)}
          className="text-white/25 hover:text-white/50 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-xs text-white/40 leading-relaxed">
          Pega los conceptos y precios de la oferta (con o sin descuento, tal cual te los pasa el proveedor — ej. &ldquo;empresa BERDIN&rdquo;). Calculo el precio unitario y el
          formato SAP (Prc.neto / por) de cada línea, y los cruzo con los materiales de este pedido para que puedas comprobarlo antes de aplicarlo.
        </p>

        <input
          type="text"
          value={proveedorTexto}
          onChange={(e) => setProveedorTexto(e.target.value)}
          placeholder="Proveedor / empresa de la oferta (opcional, ej. BERDIN)"
          className="w-full text-sm text-white/80 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 placeholder-white/25 outline-none focus:border-emerald-500/30"
        />

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={6}
          placeholder={'Ejemplo:\nEngrasadora codo 45º - 5 uds - 19,23€ total\nEngrasador recto - 2 uds - 3,50€/ud\nKit juntas filtro EPDM - 3 uds - precio 20€/ud, descuento 18%'}
          className="w-full text-xs text-white/75 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2.5 placeholder-white/20 outline-none focus:border-emerald-500/30 resize-y font-mono"
        />

        <div className="flex items-center gap-2">
          <button
            onClick={handleCalcular}
            disabled={!texto.trim() || cargando}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-30"
            style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }}
          >
            {cargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            {cargando ? 'Calculando…' : 'Calcular precios SAP'}
          </button>
          {proveedorDetectado && (
            <span className="text-xs text-white/35">Proveedor detectado: <span className="text-white/60 font-medium">{proveedorDetectado}</span></span>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/[0.06] border border-red-500/20">
            <AlertCircle className="w-3.5 h-3.5 text-red-400/70 shrink-0 mt-px" />
            <p className="text-xs text-red-400/70">{error}</p>
          </div>
        )}

        {filas.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2 px-1">
              <p className="text-xs text-white/40">
                {filas.length} línea{filas.length > 1 ? 's' : ''} · {coincidencias} coincidencia{coincidencias !== 1 ? 's' : ''} con el pedido
                {conDescuento > 0 && <> · {conDescuento} con descuento</>}
              </p>
              <p className="text-sm font-semibold text-emerald-400/85">Total oferta: {fmtEUR(totalOferta)}</p>
            </div>

            <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.03] text-white/35">
                    <th className="text-left font-medium px-2.5 py-2">Descripción</th>
                    <th className="text-right font-medium px-2.5 py-2">Cant.</th>
                    <th className="text-right font-medium px-2.5 py-2">Importe Total</th>
                    <th className="text-right font-medium px-2.5 py-2">Desc.</th>
                    <th className="text-right font-medium px-2.5 py-2">Precio Unitario</th>
                    <th className="text-right font-medium px-2.5 py-2">Formato SAP</th>
                    <th className="text-right font-medium px-2.5 py-2">Multiplicador</th>
                    <th className="text-center font-medium px-2.5 py-2">Pedido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {filas.map((f, i) => (
                    <tr key={i} className={f.matchIndice !== null ? '' : 'bg-amber-500/[0.03]'}>
                      <td className="px-2.5 py-2 text-white/70 max-w-[220px] truncate" title={f.descripcion}>{f.descripcion}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-white/55">{f.cantidad}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-white/70">{fmtEUR(f.importeTotal)}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-white/40">{f.descuentoPct > 0 ? `${f.descuentoPct}%` : '—'}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-white/70">{f.precioUnitarioLabel}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-emerald-400/80">{f.precioSAP}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-white/45 whitespace-nowrap">{f.multiplicadorLabel}</td>
                      <td className="px-2.5 py-2 text-center">
                        {f.matchIndice !== null ? (
                          <span title="Se aplicará a esta línea del pedido"><Link2 className="w-3.5 h-3.5 text-emerald-400/70 inline" /></span>
                        ) : (
                          <span title="Sin coincidencia en el pedido actual" className="text-[10px] text-amber-400/60">sin match</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleCopiarTabla}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: copiado ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                  border: copiado ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.1)',
                  color: copiado ? '#34d399' : 'rgba(255,255,255,0.6)',
                }}
              >
                {copiado ? <Check className="w-3.5 h-3.5" /> : <Clipboard className="w-3.5 h-3.5" />}
                {copiado ? '¡Copiado!' : 'Copiar tabla'}
              </button>
              <button
                onClick={handleAplicar}
                disabled={coincidencias === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-30"
                style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}
              >
                <Link2 className="w-3.5 h-3.5" />
                Aplicar al pedido ({coincidencias})
              </button>
            </div>
            {conDescuento !== filas.length && conDescuento > 0 && (
              <p className="text-[10px] text-white/25">Algunas líneas no tenían descuento explícito en el texto pegado — se han calculado sobre el importe indicado tal cual.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
