'use client'

import { useState, useMemo } from 'react'
import {
  Settings2,
  ChevronDown,
  Check,
  Building2,
  Hash,
  Layers,
  Pencil,
  Zap,
  CheckSquare,
  Square,
} from 'lucide-react'
import type { RecomendacionNueva, SeleccionPedido } from '@/lib/types'

interface PedidoBuilderProps {
  recomendaciones: RecomendacionNueva[]
  selecciones: SeleccionPedido[]
  onChange: (selecciones: SeleccionPedido[]) => void
}

// Construye la selección inicial a partir de lo que dio la IA.
// Si el motor sugirió unificación, aplica el proveedor asignado de cada línea.
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

export default function PedidoBuilder({ recomendaciones, selecciones, onChange }: PedidoBuilderProps) {
  const [abierto, setAbierto] = useState(true)

  // Lista de proveedores únicos presentes en todas las recomendaciones (para "unificar todo")
  const proveedoresDisponibles = useMemo(() => {
    const map = new Map<string, string>() // codigo -> nombre
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

  // Unifica todas las líneas incluidas en un proveedor
  const unificarTodo = (codigo: string, nombre: string) => {
    onChange(
      selecciones.map((s) => (s.incluido ? { ...s, proveedorNombre: nombre, proveedorCodigo: codigo } : s))
    )
  }

  if (recomendaciones.length === 0) return null

  return (
    <div className="glass rounded-2xl overflow-hidden border border-violet-500/15">
      {/* Cabecera */}
      <button
        onClick={() => setAbierto(!abierto)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-violet-400/70" />
          <div className="text-left">
            <h3 className="text-sm font-semibold text-white/85">Configurar pedido</h3>
            <p className="text-xs text-white/35 mt-0.5">
              Elige el código SAP y el proveedor de cada línea · {incluidos} incluida{incluidos !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-white/30 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div className="p-4 space-y-3">
          {/* Botón unificar todo */}
          {proveedoresDisponibles.length > 1 && (
            <UnificarBar proveedores={proveedoresDisponibles} onUnificar={unificarTodo} />
          )}

          {/* Una fila por material */}
          {recomendaciones.map((rec, i) => {
            const sel = selecciones.find((s) => s.indice === i)
            if (!sel) return null
            return (
              <LineaPedido
                key={i}
                rec={rec}
                sel={sel}
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
  proveedores: { codigo: string; nombre: string }[]
  onUnificar: (codigo: string, nombre: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex items-center gap-2 p-3 rounded-xl bg-blue-500/[0.05] border border-blue-500/15">
      <Zap className="w-3.5 h-3.5 text-blue-400/70 shrink-0" />
      <span className="text-xs text-blue-400/60 flex-1">Unificar todas las líneas en un proveedor</span>
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/15 border border-blue-500/25 text-blue-300 hover:bg-blue-500/25 transition-colors"
        >
          Unificar en…
          <ChevronDown className="w-3 h-3" />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 z-20 w-56 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[#12121c] shadow-xl py-1">
            {proveedores.map((p) => (
              <button
                key={p.codigo}
                onClick={() => {
                  onUnificar(p.codigo, p.nombre)
                  setOpen(false)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.04] transition-colors"
              >
                <Building2 className="w-3 h-3 text-white/30 shrink-0" />
                <span className="text-xs text-white/70 flex-1 truncate">{p.nombre}</span>
                <span className="text-[10px] text-white/30 font-mono">{p.codigo}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Una línea de pedido (1 material) ──
function LineaPedido({
  rec,
  sel,
  onActualizar,
}: {
  rec: RecomendacionNueva
  sel: SeleccionPedido
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
      }}
    >
      {/* Cabecera línea: check + nombre + cantidad */}
      <div className="flex items-start gap-3 mb-3">
        <button
          onClick={() => onActualizar({ incluido: !sel.incluido })}
          className="mt-0.5 shrink-0"
          title="Incluir en el pedido"
        >
          {sel.incluido ? (
            <CheckSquare className="w-5 h-5 text-violet-400" />
          ) : (
            <Square className="w-5 h-5 text-white/20" />
          )}
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

      {/* Selectores: SAP + Proveedor */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pl-8">
        {/* Selector de SAP */}
        <SelectorSap
          saps={saps}
          sapElegido={sel.sapElegido}
          onElegir={(codigo, descripcion, aproximado) =>
            onActualizar({ sapElegido: codigo, sapDescripcion: descripcion, sapAproximado: aproximado })
          }
        />

        {/* Selector de proveedor */}
        <SelectorProveedor
          rec={rec}
          proveedorCodigo={sel.proveedorCodigo}
          proveedorNombre={sel.proveedorNombre}
          onElegir={(codigo, nombre) => onActualizar({ proveedorCodigo: codigo, proveedorNombre: nombre })}
        />
      </div>
    </div>
  )
}

// ── Desplegable de SAP ──
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
  const actual = saps.find((s) => s.codigo === sapElegido)

  return (
    <div className="relative">
      <label className="text-[10px] text-white/30 uppercase tracking-wide mb-1 block">Código SAP</label>
      <button
        onClick={() => setOpen(!open)}
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
        <div className="absolute left-0 top-full mt-1 z-20 w-full rounded-xl border border-white/10 bg-[#12121c] shadow-xl py-1 max-h-72 overflow-y-auto">
          {saps.map((s, i) => (
            <button
              key={i}
              onClick={() => {
                onElegir(s.codigo, s.descripcion, s.aproximado === true)
                setOpen(false)
              }}
              className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-white/[0.04] transition-colors"
            >
              {s.codigo === sapElegido ? (
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
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
          {/* Opción sin código (texto libre) */}
          <button
            onClick={() => {
              onElegir('', '', false)
              setOpen(false)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.04] transition-colors border-t border-white/[0.05]"
          >
            {sapElegido === '' ? (
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <span className="text-xs text-white/45 italic">Sin código — posición de texto libre</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ── Selector de proveedor: principal + alternativas + manual ──
function SelectorProveedor({
  rec,
  proveedorCodigo,
  proveedorNombre,
  onElegir,
}: {
  rec: RecomendacionNueva
  proveedorCodigo: string
  proveedorNombre: string
  onElegir: (codigo: string, nombre: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [modoManual, setModoManual] = useState(false)
  const [manualCodigo, setManualCodigo] = useState('')
  const [manualNombre, setManualNombre] = useState('')

  // Opciones: principal + alternativas (deduplicadas)
  const opciones = useMemo(() => {
    const map = new Map<string, string>()
    if (rec.proveedor_recomendado?.codigo) {
      map.set(rec.proveedor_recomendado.codigo, rec.proveedor_recomendado.nombre)
    }
    for (const a of rec.alternativas || []) {
      if (a.codigo) map.set(a.codigo, a.nombre)
    }
    return Array.from(map.entries()).map(([codigo, nombre]) => ({ codigo, nombre }))
  }, [rec])

  const aplicarManual = () => {
    if (manualCodigo.trim()) {
      onElegir(manualCodigo.trim(), manualNombre.trim() || `Proveedor ${manualCodigo.trim()}`)
      setModoManual(false)
      setOpen(false)
      setManualCodigo('')
      setManualNombre('')
    }
  }

  return (
    <div className="relative">
      <label className="text-[10px] text-white/30 uppercase tracking-wide mb-1 block">Proveedor</label>
      <button
        onClick={() => setOpen(!open)}
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
        <div className="absolute left-0 top-full mt-1 z-20 w-full rounded-xl border border-white/10 bg-[#12121c] shadow-xl py-1">
          {opciones.map((o, i) => (
            <button
              key={i}
              onClick={() => {
                onElegir(o.codigo, o.nombre)
                setOpen(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.04] transition-colors"
            >
              {o.codigo === proveedorCodigo ? (
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              <span className="text-xs text-white/70 flex-1 truncate">{o.nombre}</span>
              <span className="text-[10px] text-white/30 font-mono">{o.codigo}</span>
            </button>
          ))}

          {/* Modo manual */}
          {!modoManual ? (
            <button
              onClick={() => setModoManual(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.04] transition-colors border-t border-white/[0.05]"
            >
              <Pencil className="w-3 h-3 text-violet-400/60 shrink-0" />
              <span className="text-xs text-violet-300/70">Escribir código manual…</span>
            </button>
          ) : (
            <div className="px-3 py-2 border-t border-white/[0.05] space-y-2">
              <input
                autoFocus
                value={manualCodigo}
                onChange={(e) => setManualCodigo(e.target.value)}
                placeholder="Código (ej. 100025256)"
                className="w-full text-xs text-white/80 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400/40 font-mono"
              />
              <input
                value={manualNombre}
                onChange={(e) => setManualNombre(e.target.value)}
                placeholder="Nombre (opcional)"
                className="w-full text-xs text-white/80 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400/40"
              />
              <div className="flex gap-2">
                <button
                  onClick={aplicarManual}
                  className="flex-1 text-xs font-medium px-2 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-300 hover:bg-violet-500/30 transition-colors"
                >
                  Aplicar
                </button>
                <button
                  onClick={() => setModoManual(false)}
                  className="text-xs px-2 py-1.5 rounded-lg text-white/40 hover:text-white/60 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
