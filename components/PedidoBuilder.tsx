'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Settings2,
  ChevronDown,
  Check,
  Building2,
  Hash,
  Layers,
  Search,
  Zap,
  CheckSquare,
  Square,
  X,
} from 'lucide-react'
import type { RecomendacionNueva, SeleccionPedido, ProveedorSimple, SapSearchResult } from '@/lib/types'

interface PedidoBuilderProps {
  recomendaciones: RecomendacionNueva[]
  selecciones: SeleccionPedido[]
  onChange: (selecciones: SeleccionPedido[]) => void
  proveedoresDB?: ProveedorSimple[]
}

export function construirSeleccionInicial(
  recs: RecomendacionNueva[],
  unificado?: Array<{ indice: number; proveedor_asignado: { nombre: string; codigo: string } | null }>
): SeleccionPedido[] {
  return recs.map((r, i) => {
    const saps = r.codigos_sap_sugeridos || []
    const elegido = saps.find((s) => !s.aproximado) || saps[0]
    const u = unificado?.find((x) => x.indice === i)
    const prov = u?.proveedor_asignado || r.proveedor_recomendado || { nombre: '', codigo: '' }
    return {
      indice: i,
      incluido: r.seleccionado !== false,
      sapElegido: elegido?.codigo || '',
      sapDescripcion: elegido?.descripcion || '',
      sapAproximado: elegido?.aproximado === true,
      proveedorNombre: prov.nombre || '',
      proveedorCodigo: prov.codigo || '',
      cantidad: r.cantidad,
    }
  })
}

export default function PedidoBuilder({ recomendaciones, selecciones, onChange, proveedoresDB = [] }: PedidoBuilderProps) {
  const [abierto, setAbierto] = useState(true)

  const proveedoresDisponibles = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of recomendaciones) {
      if (r.proveedor_recomendado?.codigo) {
        map.set(r.proveedor_recomendado.codigo, r.proveedor_recomendado.nombre)
      }
      for (const a of r.alternativas || []) {
        if (a.codigo) map.set(a.codigo, a.nombre)
      }
    }
    return Array.from(map.entries()).map(([codigo, nombre]) => ({ codigo, nombre }))
  }, [recomendaciones])

  const incluidos = selecciones.filter((s) => s.incluido).length

  const actualizar = (indice: number, cambios: Partial<SeleccionPedido>) => {
    onChange(selecciones.map((s) => (s.indice === indice ? { ...s, ...cambios } : s)))
  }

  const unificarTodo = (codigo: string, nombre: string) => {
    onChange(selecciones.map((s) => (s.incluido ? { ...s, proveedorNombre: nombre, proveedorCodigo: codigo } : s)))
  }

  if (recomendaciones.length === 0) return null

  return (
    // ⚠ overflow-visible es crítico: sin él los dropdowns absolutos quedan cortados
    <div className="glass rounded-2xl border border-violet-500/15" style={{ overflow: 'visible' }}>
      <button
        onClick={() => setAbierto(!abierto)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors rounded-t-2xl"
        style={{ borderRadius: abierto ? undefined : '1rem' }}
      >
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-violet-400/70" />
          <div className="text-left">
            <h3 className="text-sm font-semibold text-white/85">Configurar pedido</h3>
            <p className="text-xs text-white/35 mt-0.5">
              Elige SAP y proveedor por línea · {incluidos} incluida{incluidos !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-white/30 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div className="p-4 space-y-3">
          {proveedoresDisponibles.length > 1 && (
            <UnificarBar proveedores={proveedoresDisponibles} onUnificar={unificarTodo} />
          )}
          {recomendaciones.map((rec, i) => {
            const sel = selecciones.find((s) => s.indice === i)
            if (!sel) return null
            return (
              <LineaPedido
                key={i}
                rec={rec}
                sel={sel}
                proveedoresDB={proveedoresDB}
                onActualizar={(cambios) => actualizar(i, cambios)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Barra de unificación rápida ──
function UnificarBar({
  proveedores,
  onUnificar,
}: {
  proveedores: ProveedorSimple[]
  onUnificar: (codigo: string, nombre: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex items-center gap-2 p-3 rounded-xl bg-blue-500/[0.05] border border-blue-500/15">
      <Zap className="w-3.5 h-3.5 text-blue-400/70 shrink-0" />
      <span className="text-xs text-blue-400/60 flex-1">Unificar todas las líneas en un proveedor</span>
      <div className="relative" style={{ zIndex: 60 }}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/15 border border-blue-500/25 text-blue-300 hover:bg-blue-500/25 transition-colors"
        >
          Unificar en…
          <ChevronDown className="w-3 h-3" />
        </button>
        {open && (
          <div
            className="absolute right-0 top-full mt-1 w-64 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[#12121c] shadow-xl py-1"
            style={{ zIndex: 999 }}
          >
            {proveedores.map((p) => (
              <button
                key={p.codigo}
                onClick={() => { onUnificar(p.codigo, p.nombre); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.06] transition-colors"
              >
                <Building2 className="w-3 h-3 text-white/30 shrink-0" />
                <span className="text-xs text-white/70 flex-1 truncate">{p.nombre}</span>
                <span className="text-[10px] text-white/30 font-mono shrink-0">{p.codigo}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Una línea de pedido ──
function LineaPedido({
  rec,
  sel,
  proveedoresDB,
  onActualizar,
}: {
  rec: RecomendacionNueva
  sel: SeleccionPedido
  proveedoresDB: ProveedorSimple[]
  onActualizar: (cambios: Partial<SeleccionPedido>) => void
}) {
  const saps = rec.codigos_sap_sugeridos || []
  const desc = rec.material_detectado.replace(/^\d+x\s*/i, '').trim()

  return (
    <div
      className="rounded-xl border p-3.5 transition-all"
      style={{
        background: sel.incluido ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.008)',
        borderColor: sel.incluido ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.06)',
        opacity: sel.incluido ? 1 : 0.55,
        overflow: 'visible',
      }}
    >
      <div className="flex items-start gap-3 mb-3">
        <button onClick={() => onActualizar({ incluido: !sel.incluido })} className="mt-0.5 shrink-0">
          {sel.incluido
            ? <CheckSquare className="w-5 h-5 text-violet-400" />
            : <Square className="w-5 h-5 text-white/20" />
          }
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/85 leading-snug">{desc}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Layers className="w-3 h-3 text-white/25" />
            <span className="text-xs text-white/40">{rec.tipo_material}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-white/30">Ctd.</span>
          <input
            type="number"
            min={1}
            value={sel.cantidad}
            onChange={(e) => onActualizar({ cantidad: Math.max(1, Number(e.target.value) || 1) })}
            className="w-14 text-sm text-white/80 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1 text-center focus:outline-none focus:border-violet-400/40"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pl-8">
        <SelectorSap
          saps={saps}
          sapElegido={sel.sapElegido}
          onElegir={(codigo, descripcion, aproximado) =>
            onActualizar({ sapElegido: codigo, sapDescripcion: descripcion, sapAproximado: aproximado })
          }
        />
        <SelectorProveedor
          rec={rec}
          proveedorCodigo={sel.proveedorCodigo}
          proveedorNombre={sel.proveedorNombre}
          proveedoresDB={proveedoresDB}
          onElegir={(codigo, nombre) => onActualizar({ proveedorCodigo: codigo, proveedorNombre: nombre })}
        />
      </div>
    </div>
  )
}

// ── Selector de SAP (AI sugeridos + búsqueda manual) ──
function SelectorSap({
  saps,
  sapElegido,
  onElegir,
}: {
  saps: RecomendacionNueva['codigos_sap_sugeridos']
  sapElegido: string
  onElegir: (codigo: string, descripcion: string, aproximado: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [busqSAP, setBusqSAP] = useState('')
  const [sapResultados, setSapResultados] = useState<SapSearchResult[]>([])
  const [buscando, setBuscando] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const actual = saps.find((s) => s.codigo === sapElegido)

  function buscarSAP(query: string) {
    setBusqSAP(query)
    clearTimeout(timerRef.current)
    if (query.trim().length < 2) { setSapResultados([]); return }
    setBuscando(true)
    timerRef.current = setTimeout(async () => {
      try {
        const r = await fetch('/api/sap-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        })
        setSapResultados(await r.json())
      } finally {
        setBuscando(false)
      }
    }, 280)
  }

  return (
    <div className="relative" style={{ overflow: 'visible' }}>
      <label className="text-[10px] text-white/30 uppercase tracking-wide mb-1 block">Código SAP</label>
      <button
        onClick={() => { setOpen(!open); setBusqSAP(''); setSapResultados([]) }}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/[0.06] border border-indigo-500/15 hover:border-indigo-500/30 transition-colors text-left"
      >
        <Hash className="w-3.5 h-3.5 text-indigo-400/50 shrink-0" />
        <div className="flex-1 min-w-0">
          {actual ? (
            <>
              <span className="text-xs font-mono text-indigo-300/90">{actual.codigo}</span>
              {actual.aproximado && <span className="ml-1 text-[10px] text-amber-400/70">~</span>}
              <p className="text-[10px] text-white/35 truncate">{actual.descripcion}</p>
            </>
          ) : (
            <span className="text-xs text-white/40">Sin código (texto libre)</span>
          )}
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 w-full rounded-xl border border-white/10 bg-[#12121c] shadow-xl"
          style={{ zIndex: 999, minWidth: '260px' }}
        >
          {/* Buscador SAP */}
          <div className="p-2 border-b border-white/[0.06]">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
              <Search className="w-3.5 h-3.5 text-indigo-400/50 shrink-0" />
              <input
                autoFocus
                value={busqSAP}
                onChange={(e) => buscarSAP(e.target.value)}
                placeholder="Nombre o código SAP…"
                className="flex-1 text-xs bg-transparent text-white/80 placeholder-white/25 outline-none"
              />
              {buscando && <span className="text-[10px] text-indigo-400/50 animate-pulse">…</span>}
              {busqSAP && !buscando && (
                <button onMouseDown={() => { setBusqSAP(''); setSapResultados([]) }}>
                  <X className="w-3 h-3 text-white/25 hover:text-white/50" />
                </button>
              )}
            </div>
          </div>

          {/* Resultados de búsqueda o sugerencias IA */}
          <div className="max-h-64 overflow-y-auto py-1">
            {busqSAP.trim().length >= 2 ? (
              sapResultados.length > 0 ? (
                sapResultados.map((s) => (
                  <button
                    key={s.codigo}
                    onClick={() => { onElegir(s.codigo, s.descripcion, false); setOpen(false) }}
                    className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-white/[0.06] transition-colors"
                  >
                    {s.codigo === sapElegido
                      ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      : <span className="w-3.5 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-indigo-300/90">{s.codigo}</span>
                      </div>
                      <p className="text-[10px] text-white/55 leading-tight">{s.descripcion}</p>
                      <p className="text-[10px] text-white/25">{s.proveedor}</p>
                    </div>
                  </button>
                ))
              ) : !buscando ? (
                <p className="text-xs text-white/30 px-3 py-2 italic">Sin resultados</p>
              ) : null
            ) : (
              <>
                {saps.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { onElegir(s.codigo, s.descripcion, s.aproximado === true); setOpen(false) }}
                    className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-white/[0.06] transition-colors"
                  >
                    {s.codigo === sapElegido
                      ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      : <span className="w-3.5 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-indigo-300/90">{s.codigo}</span>
                        {s.aproximado && <span className="text-[10px] text-amber-400/70">~ aprox.</span>}
                      </div>
                      <p className="text-[10px] text-white/40 leading-tight">{s.descripcion}</p>
                      <p className="text-[10px] text-white/25">{s.proveedor}</p>
                      {s.nota && <p className="text-[10px] text-amber-400/45 mt-0.5 leading-tight">{s.nota}</p>}
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => { onElegir('', '', false); setOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.06] transition-colors border-t border-white/[0.05]"
                >
                  {sapElegido === ''
                    ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    : <span className="w-3.5 shrink-0" />
                  }
                  <span className="text-xs text-white/40 italic">Sin código — texto libre</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Selector de proveedor: IA sugeridos + búsqueda sobre los 245 proveedores ──
function SelectorProveedor({
  rec,
  proveedorCodigo,
  proveedorNombre,
  proveedoresDB,
  onElegir,
}: {
  rec: RecomendacionNueva
  proveedorCodigo: string
  proveedorNombre: string
  proveedoresDB: ProveedorSimple[]
  onElegir: (codigo: string, nombre: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [busq, setBusq] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Sugerencias de la IA (principal + alternativas)
  const opcionesIA = useMemo(() => {
    const map = new Map<string, string>()
    if (rec.proveedor_recomendado?.codigo) {
      map.set(rec.proveedor_recomendado.codigo, rec.proveedor_recomendado.nombre)
    }
    for (const a of rec.alternativas || []) {
      if (a.codigo) map.set(a.codigo, a.nombre)
    }
    return Array.from(map.entries()).map(([codigo, nombre]) => ({ codigo, nombre }))
  }, [rec])

  // Filtrado client-side sobre todos los proveedores de la BD
  const filtrados: ProveedorSimple[] = busq.trim().length >= 2
    ? proveedoresDB
        .filter((p) => {
          const q = busq.toUpperCase()
          return p.nombre.toUpperCase().includes(q) || p.codigo.includes(q)
        })
        .slice(0, 20)
    : []

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  function elegir(codigo: string, nombre: string) {
    onElegir(codigo, nombre)
    setOpen(false)
    setBusq('')
  }

  return (
    <div className="relative" style={{ overflow: 'visible' }}>
      <label className="text-[10px] text-white/30 uppercase tracking-wide mb-1 block">Proveedor</label>
      <button
        onClick={() => { setOpen(!open); setBusq('') }}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 hover:border-white/20 transition-colors text-left"
      >
        <Building2 className="w-3.5 h-3.5 text-white/30 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-white/80 block truncate">{proveedorNombre || 'Sin proveedor'}</span>
          {proveedorCodigo && <span className="text-[10px] text-white/35 font-mono">{proveedorCodigo}</span>}
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 w-full rounded-xl border border-white/10 bg-[#12121c] shadow-xl"
          style={{ zIndex: 999, minWidth: '260px' }}
        >
          {/* Campo de búsqueda */}
          <div className="p-2 border-b border-white/[0.06]">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
              <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
              <input
                ref={inputRef}
                value={busq}
                onChange={(e) => setBusq(e.target.value)}
                onBlur={() => setTimeout(() => setOpen(false), 180)}
                placeholder="Buscar por nombre o código…"
                className="flex-1 text-xs bg-transparent text-white/85 placeholder-white/25 outline-none"
              />
              {busq && (
                <button onMouseDown={() => setBusq('')}>
                  <X className="w-3 h-3 text-white/25 hover:text-white/50" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {busq.trim().length >= 2 ? (
              /* Resultados del buscador (todos los 245) */
              filtrados.length > 0 ? (
                filtrados.map((p) => (
                  <button
                    key={p.codigo}
                    onMouseDown={() => elegir(p.codigo, p.nombre)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.06] active:bg-white/10 transition-colors"
                  >
                    {p.codigo === proveedorCodigo
                      ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      : <span className="w-3.5 shrink-0" />
                    }
                    <span className="text-xs text-white/78 flex-1 truncate">{p.nombre}</span>
                    <code className="text-[10px] text-white/30 font-mono shrink-0">{p.codigo}</code>
                  </button>
                ))
              ) : (
                <p className="text-xs text-white/30 px-3 py-2 italic">Sin resultados para &ldquo;{busq}&rdquo;</p>
              )
            ) : (
              /* Sugerencias de la IA + separador */
              <>
                {opcionesIA.length > 0 && (
                  <p className="text-[10px] text-white/25 uppercase tracking-widest px-3 pt-1.5 pb-0.5">Sugeridos por IA</p>
                )}
                {opcionesIA.map((o, i) => (
                  <button
                    key={i}
                    onMouseDown={() => elegir(o.codigo, o.nombre)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.06] transition-colors"
                  >
                    {o.codigo === proveedorCodigo
                      ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      : <span className="w-3.5 shrink-0" />
                    }
                    <span className="text-xs text-white/78 flex-1 truncate">{o.nombre}</span>
                    <code className="text-[10px] text-white/30 font-mono shrink-0">{o.codigo}</code>
                  </button>
                ))}
                {proveedoresDB.length > 0 && (
                  <p className="text-[10px] text-white/20 px-3 pt-2 pb-1 border-t border-white/[0.04] mt-1">
                    Escribe para buscar entre {proveedoresDB.length} proveedores
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
