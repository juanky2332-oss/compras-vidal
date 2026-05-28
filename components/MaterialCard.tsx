'use client'

import { useState, useRef, useEffect } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Building2,
  Hash,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Lightbulb,
  Tag,
  Layers,
  Pencil,
  Search,
  X,
  Plus,
} from 'lucide-react'
import type { RecomendacionNueva, ProveedorSimple, SapSearchResult } from '@/lib/types'

interface MaterialCardProps {
  rec: RecomendacionNueva
  index: number
  onToggle: (index: number) => void
  proveedoresDB: ProveedorSimple[]
  onUpdate: (updates: Partial<RecomendacionNueva>) => void
}

const CONFIDENCE_CONFIG = {
  ALTO: {
    label: 'ALTO',
    icon: CheckCircle2,
    color: '#10b981',
    bg: 'rgba(16,185,129,0.07)',
    border: 'rgba(16,185,129,0.22)',
    glow: 'rgba(16,185,129,0.14)',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  MEDIO: {
    label: 'MEDIO',
    icon: AlertTriangle,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.06)',
    border: 'rgba(245,158,11,0.22)',
    glow: 'rgba(245,158,11,0.12)',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  BAJO: {
    label: 'BAJO',
    icon: XCircle,
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.05)',
    border: 'rgba(239,68,68,0.2)',
    glow: 'rgba(239,68,68,0.1)',
    badge: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
}

const PASO_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Marca reconocida', color: 'text-violet-400/65' },
  2: { label: 'Tipo de material', color: 'text-indigo-400/65' },
  3: { label: 'Match por código SAP', color: 'text-emerald-400/65' },
  4: { label: 'Categoría general', color: 'text-amber-400/65' },
  5: { label: 'Sin coincidencia — solicita más datos', color: 'text-red-400/65' },
}

export default function MaterialCard({ rec, index, onToggle, proveedoresDB, onUpdate }: MaterialCardProps) {
  const [expandido, setExpandido] = useState(false)

  // --- Buscador de proveedor ---
  const [editandoProv, setEditandoProv] = useState(false)
  const [busqProv, setBusqProv] = useState('')
  const provInputRef = useRef<HTMLInputElement>(null)

  // --- Buscador de SAP ---
  const [mostrarBuscadorSAP, setMostrarBuscadorSAP] = useState(false)
  const [busqSAP, setBusqSAP] = useState('')
  const [sapResultados, setSapResultados] = useState<SapSearchResult[]>([])
  const [sapBuscando, setSapBuscando] = useState(false)
  const sapTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const sapInputRef = useRef<HTMLInputElement>(null)

  const cfg = CONFIDENCE_CONFIG[rec.nivel_confianza]
  const ConfIcon = cfg.icon
  const proveedor = rec.proveedor_recomendado
  const tieneAlternativas = rec.alternativas?.length > 0
  const tieneSAPs = rec.codigos_sap_sugeridos?.length > 0
  const tieneObservaciones = !!rec.observaciones?.trim()
  const paso = PASO_LABELS[rec._pasoDeterminante] || PASO_LABELS[5]
  const hayDetalle = tieneAlternativas || tieneSAPs || tieneObservaciones

  // Filtro de proveedores (client-side, sobre los 245)
  const proveedoresFiltrados: ProveedorSimple[] = busqProv.trim().length >= 2
    ? proveedoresDB
        .filter((p) => {
          const q = busqProv.toUpperCase()
          return p.nombre.toUpperCase().includes(q) || p.codigo.includes(q)
        })
        .slice(0, 20)
    : []

  // Auto-focus al abrir buscador de proveedor
  useEffect(() => {
    if (editandoProv) provInputRef.current?.focus()
  }, [editandoProv])

  // Auto-focus al abrir buscador SAP
  useEffect(() => {
    if (mostrarBuscadorSAP) sapInputRef.current?.focus()
  }, [mostrarBuscadorSAP])

  function seleccionarProveedor(p: ProveedorSimple) {
    onUpdate({ proveedor_recomendado: { codigo: p.codigo, nombre: p.nombre } })
    setEditandoProv(false)
    setBusqProv('')
  }

  function buscarSAP(query: string) {
    setBusqSAP(query)
    clearTimeout(sapTimerRef.current)
    if (query.trim().length < 2) { setSapResultados([]); return }
    setSapBuscando(true)
    sapTimerRef.current = setTimeout(async () => {
      try {
        const r = await fetch('/api/sap-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        })
        const data = await r.json()
        setSapResultados(data)
      } finally {
        setSapBuscando(false)
      }
    }, 280)
  }

  function seleccionarSAP(sap: SapSearchResult) {
    const existe = rec.codigos_sap_sugeridos.some((s) => s.codigo === sap.codigo)
    if (!existe) {
      onUpdate({
        codigos_sap_sugeridos: [
          { codigo: sap.codigo, descripcion: sap.descripcion, proveedor: sap.proveedor },
          ...rec.codigos_sap_sugeridos,
        ],
      })
    }
    setBusqSAP('')
    setSapResultados([])
    setMostrarBuscadorSAP(false)
  }

  return (
    <div
      className="rounded-2xl border transition-all duration-200 overflow-visible animate-slide-up"
      style={{
        background: rec.seleccionado ? cfg.bg : 'rgba(255,255,255,0.018)',
        borderColor: rec.seleccionado ? cfg.border : 'rgba(255,255,255,0.07)',
        boxShadow: rec.seleccionado ? `0 0 32px ${cfg.glow}` : '0 2px 12px rgba(0,0,0,0.25)',
        animationDelay: `${index * 55}ms`,
        animationFillMode: 'both',
      }}
    >
      {/* Card body */}
      <div className="p-5">
        <div className="flex items-start gap-3.5">
          {/* Checkbox */}
          <button
            onClick={() => onToggle(index)}
            className="mt-0.5 flex-shrink-0 transition-colors"
            title="Incluir en exportación SAP"
          >
            {rec.seleccionado ? (
              <CheckSquare className="w-5 h-5" style={{ color: cfg.color }} />
            ) : (
              <Square className="w-5 h-5 text-white/20" />
            )}
          </button>

          <div className="flex-1 min-w-0 space-y-2.5">
            {/* Nombre + badge confianza */}
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-white/92 leading-snug">
                {rec.material_detectado}
              </h3>
              <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${cfg.badge}`}>
                <ConfIcon className="w-3 h-3" />
                {cfg.label}
              </span>
            </div>

            {/* Tipo + Marca */}
            {((rec.tipo_material && rec.tipo_material !== 'No clasificado') || (rec.marca_detectada && rec.marca_detectada !== 'no especificada')) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {rec.tipo_material && rec.tipo_material !== 'No clasificado' && (
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-white/22 flex-shrink-0" />
                    <span className="text-sm text-white/45">{rec.tipo_material}</span>
                  </div>
                )}
                {rec.marca_detectada && rec.marca_detectada !== 'no especificada' && (
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-violet-400/45 flex-shrink-0" />
                    <span className="text-sm text-violet-300/65 font-medium">{rec.marca_detectada}</span>
                  </div>
                )}
              </div>
            )}

            {/* Proveedor recomendado + buscador inline */}
            <div className="relative">
              {!editandoProv ? (
                <div
                  className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <Building2 className="w-4 h-4 text-white/30 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-white/85">
                      {proveedor?.nombre && proveedor.nombre !== 'Sin datos' ? proveedor.nombre : 'Sin proveedor asignado'}
                    </span>
                    {proveedor?.codigo && (
                      <span className="ml-2 text-xs text-white/38 font-mono">{proveedor.codigo}</span>
                    )}
                  </div>
                  <button
                    onClick={() => { setEditandoProv(true); setBusqProv('') }}
                    className="flex-shrink-0 p-1 rounded-lg text-white/20 hover:text-white/55 hover:bg-white/08 transition-colors"
                    title="Cambiar proveedor"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative" style={{ zIndex: 50 }}>
                  <div
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl"
                    style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.30)' }}
                  >
                    <Search className="w-4 h-4 text-indigo-400/60 flex-shrink-0" />
                    <input
                      ref={provInputRef}
                      value={busqProv}
                      onChange={(e) => setBusqProv(e.target.value)}
                      onBlur={() => setTimeout(() => setEditandoProv(false), 200)}
                      placeholder="Buscar por nombre o código SAP..."
                      className="flex-1 text-sm bg-transparent text-white/90 placeholder-white/25 outline-none"
                    />
                    <button
                      onMouseDown={() => { setEditandoProv(false); setBusqProv('') }}
                      className="flex-shrink-0 p-0.5 text-white/25 hover:text-white/55"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Dropdown de proveedores */}
                  {proveedoresFiltrados.length > 0 && (
                    <ul
                      className="absolute left-0 right-0 top-full mt-1 rounded-xl shadow-2xl overflow-hidden"
                      style={{
                        background: '#131320',
                        border: '1px solid rgba(255,255,255,0.12)',
                        maxHeight: '220px',
                        overflowY: 'auto',
                        zIndex: 999,
                      }}
                    >
                      {proveedoresFiltrados.map((p) => (
                        <li
                          key={p.codigo}
                          onMouseDown={() => seleccionarProveedor(p)}
                          className="flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer hover:bg-white/08 active:bg-white/12 transition-colors border-b border-white/04 last:border-0"
                        >
                          <code className="text-xs text-indigo-300/65 font-mono flex-shrink-0 w-24">{p.codigo}</code>
                          <span className="text-sm text-white/82 truncate">{p.nombre}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {busqProv.trim().length >= 2 && proveedoresFiltrados.length === 0 && (
                    <div
                      className="absolute left-0 right-0 top-full mt-1 px-3.5 py-2.5 rounded-xl text-xs text-white/35"
                      style={{ background: '#131320', border: '1px solid rgba(255,255,255,0.10)', zIndex: 999 }}
                    >
                      Sin resultados para &ldquo;{busqProv}&rdquo;
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Motivo */}
            {rec.motivo && (
              <p className="text-sm text-white/38 leading-relaxed">{rec.motivo}</p>
            )}

            {/* Paso determinante */}
            <p className={`text-xs ${paso.color}`}>{paso.label}</p>
          </div>
        </div>
      </div>

      {/* Expandible */}
      {hayDetalle && (
        <>
          <button
            onClick={() => setExpandido(!expandido)}
            className="w-full flex items-center justify-between px-5 py-2.5 border-t border-white/[0.06] hover:bg-white/[0.025] transition-colors rounded-b-2xl"
          >
            <span className="text-sm text-white/32 hover:text-white/55 transition-colors">
              {[
                tieneAlternativas && `${rec.alternativas.length} alternativa${rec.alternativas.length > 1 ? 's' : ''}`,
                tieneSAPs && `${rec.codigos_sap_sugeridos.length} código${rec.codigos_sap_sugeridos.length > 1 ? 's' : ''} SAP`,
                tieneObservaciones && 'Observaciones',
              ].filter(Boolean).join(' · ')}
            </span>
            {expandido
              ? <ChevronUp className="w-4 h-4 text-white/30" />
              : <ChevronDown className="w-4 h-4 text-white/30" />
            }
          </button>

          {expandido && (
            <div className="px-5 pb-5 pt-3 space-y-4 border-t border-white/[0.04]">

              {/* Alternativas — SIN slice, todas visibles */}
              {tieneAlternativas && (
                <div>
                  <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-2.5">Alternativas</p>
                  <div className="space-y-2">
                    {rec.alternativas.map((alt, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg cursor-pointer hover:bg-white/04 transition-colors"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                        title="Click para usar este proveedor"
                        onClick={() => onUpdate({ proveedor_recomendado: { codigo: alt.codigo, nombre: alt.nombre } })}
                      >
                        <Building2 className="w-3.5 h-3.5 text-white/22 flex-shrink-0" />
                        <span className="text-sm text-white/55 font-medium flex-1">{alt.nombre}</span>
                        {alt.codigo && (
                          <code className="text-xs text-white/32 bg-white/04 border border-white/07 px-1.5 py-0.5 rounded-md font-mono flex-shrink-0">
                            {alt.codigo}
                          </code>
                        )}
                        {alt.nota && (
                          <span className="text-xs text-white/22 ml-1 truncate max-w-[120px]" title={alt.nota}>
                            {alt.nota}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SAPs sugeridos — SIN slice, todos visibles */}
              {tieneSAPs && (
                <div>
                  <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-2.5">Códigos SAP</p>
                  <div className="space-y-2">
                    {rec.codigos_sap_sugeridos.map((sap, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 px-3.5 py-2.5 rounded-lg"
                        style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)' }}
                      >
                        <Hash className="w-3.5 h-3.5 text-indigo-400/50 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="text-sm text-indigo-300/85 font-mono font-medium">{sap.codigo}</code>
                            <span className="text-xs text-white/38">{sap.proveedor}</span>
                          </div>
                          <p className="text-xs text-white/28 italic mt-0.5 leading-snug">{sap.descripcion}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Buscador de SAP manual */}
                  {!mostrarBuscadorSAP ? (
                    <button
                      onClick={() => { setMostrarBuscadorSAP(true); setSapResultados([]); setBusqSAP('') }}
                      className="mt-2.5 flex items-center gap-1.5 text-xs text-indigo-400/50 hover:text-indigo-400/80 px-2 py-1 rounded-lg hover:bg-indigo-500/08 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Buscar otro SAP en la base de datos
                    </button>
                  ) : (
                    <BuscadorSAP
                      busqSAP={busqSAP}
                      sapResultados={sapResultados}
                      sapBuscando={sapBuscando}
                      sapInputRef={sapInputRef}
                      onBuscar={buscarSAP}
                      onSeleccionar={seleccionarSAP}
                      onCerrar={() => { setMostrarBuscadorSAP(false); setBusqSAP(''); setSapResultados([]) }}
                    />
                  )}
                </div>
              )}

              {/* Si no hay SAPs, mostrar buscador directamente */}
              {!tieneSAPs && (
                <div>
                  <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-2.5">Buscar código SAP</p>
                  <BuscadorSAP
                    busqSAP={busqSAP}
                    sapResultados={sapResultados}
                    sapBuscando={sapBuscando}
                    sapInputRef={sapInputRef}
                    onBuscar={buscarSAP}
                    onSeleccionar={seleccionarSAP}
                    onCerrar={() => { setBusqSAP(''); setSapResultados([]) }}
                  />
                </div>
              )}

              {/* Observaciones */}
              {tieneObservaciones && (
                <div
                  className="flex gap-3 p-3.5 rounded-xl"
                  style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.14)' }}
                >
                  <Lightbulb className="w-4 h-4 text-amber-400/65 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-white/50 leading-relaxed">{rec.observaciones}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Componente reutilizable de búsqueda de SAP
interface BuscadorSAPProps {
  busqSAP: string
  sapResultados: SapSearchResult[]
  sapBuscando: boolean
  sapInputRef: React.RefObject<HTMLInputElement>
  onBuscar: (q: string) => void
  onSeleccionar: (sap: SapSearchResult) => void
  onCerrar?: () => void
}

function BuscadorSAP({ busqSAP, sapResultados, sapBuscando, sapInputRef, onBuscar, onSeleccionar, onCerrar }: BuscadorSAPProps) {
  return (
    <div className="relative mt-2" style={{ zIndex: 40 }}>
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
        style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.22)' }}
      >
        <Search className="w-3.5 h-3.5 text-indigo-400/60 flex-shrink-0" />
        <input
          ref={sapInputRef}
          value={busqSAP}
          onChange={(e) => onBuscar(e.target.value)}
          placeholder="Nombre del material o código SAP..."
          className="flex-1 text-sm bg-transparent text-white/85 placeholder-white/25 outline-none"
        />
        {sapBuscando && (
          <span className="text-xs text-indigo-400/50 animate-pulse flex-shrink-0">buscando…</span>
        )}
        {onCerrar && (
          <button onMouseDown={onCerrar} className="text-white/20 hover:text-white/50 flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Resultados SAP */}
      {sapResultados.length > 0 && (
        <ul
          className="absolute left-0 right-0 top-full mt-1 rounded-xl shadow-2xl overflow-hidden"
          style={{
            background: '#131320',
            border: '1px solid rgba(99,102,241,0.25)',
            maxHeight: '260px',
            overflowY: 'auto',
            zIndex: 999,
          }}
        >
          {sapResultados.map((sap) => (
            <li
              key={sap.codigo}
              onMouseDown={() => onSeleccionar(sap)}
              className="flex items-start gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-white/08 active:bg-white/12 transition-colors border-b border-white/04 last:border-0"
            >
              <div className="flex-shrink-0 mt-0.5">
                <Hash className="w-3.5 h-3.5 text-indigo-400/50" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-sm text-indigo-300/90 font-mono font-semibold">{sap.codigo}</code>
                  <span className="text-xs text-white/35 truncate">{sap.proveedor}</span>
                </div>
                <p className="text-xs text-white/55 mt-0.5 leading-snug">{sap.descripcion}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {busqSAP.trim().length >= 2 && !sapBuscando && sapResultados.length === 0 && (
        <div
          className="absolute left-0 right-0 top-full mt-1 px-3.5 py-2.5 rounded-xl text-xs text-white/35"
          style={{ background: '#131320', border: '1px solid rgba(99,102,241,0.15)', zIndex: 999 }}
        >
          Sin resultados para &ldquo;{busqSAP}&rdquo;
        </div>
      )}
    </div>
  )
}
