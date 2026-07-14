'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import {
  CheckCircle2, AlertTriangle, XCircle,
  CheckSquare, Square, Building2, Hash,
  Layers, Tag, Lightbulb, Search, X, Check,
  Target, GitCompare, Puzzle, HelpCircle,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import type { RecomendacionNueva, SeleccionPedido, ProveedorSimple, SapSearchResult, TipoMatch, PrecioHistorico } from '@/lib/types'
import { fmtEUR, fmtFecha } from '@/lib/secciones'

// ─────────────────────── CONFIG OBJECTS ────────────────────────

const CONFIDENCE_CONFIG = {
  ALTO:  { label: 'ALTO',  Icon: CheckCircle2, color: '#10b981', bg: 'rgba(16,185,129,0.07)',  border: 'rgba(16,185,129,0.22)',  glow: 'rgba(16,185,129,0.14)',  badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  MEDIO: { label: 'MEDIO', Icon: AlertTriangle, color: '#f59e0b', bg: 'rgba(245,158,11,0.06)',  border: 'rgba(245,158,11,0.22)',  glow: 'rgba(245,158,11,0.12)',  badge: 'bg-amber-500/10  text-amber-400  border-amber-500/20'  },
  BAJO:  { label: 'BAJO',  Icon: XCircle,       color: '#ef4444', bg: 'rgba(239,68,68,0.05)',   border: 'rgba(239,68,68,0.2)',    glow: 'rgba(239,68,68,0.1)',    badge: 'bg-red-500/10   text-red-400    border-red-500/20'    },
}

const MATCH_CONFIG: Record<TipoMatch, { label: string; Icon: typeof Target; style: string; title: string }> = {
  EXACTO:     { label: 'Referencia exacta', Icon: Target,     style: 'bg-emerald-500/12 text-emerald-300/90 border-emerald-500/25', title: 'La referencia, código o medida exacta del artículo solicitado existe literalmente en la base de datos SAP' },
  PARCIAL:    { label: 'Ref. cercana',      Icon: GitCompare, style: 'bg-sky-500/12     text-sky-300/90     border-sky-500/25',     title: 'Medida o referencia muy cercana pero no idéntica (ej: 6204-2RS vs 6204-2Z, DN50 PN16 vs DN50 PN10) — verifica antes de pedir' },
  EQUIVALENTE:{ label: 'Equiv. técnico',    Icon: Puzzle,     style: 'bg-violet-500/12  text-violet-300/90  border-violet-500/25',  title: 'Sin código/referencia exacta en BD — se propone equivalente técnico con características funcionales equivalentes' },
  SIN_MATCH:  { label: 'Sin coincidencia',  Icon: HelpCircle, style: 'bg-red-500/10     text-red-300/80     border-red-500/20',     title: 'Sin artículo ni equivalente claro — se necesita más información del solicitante' },
}

const PASO_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Marca reconocida',                       color: 'text-violet-400/60' },
  2: { label: 'Tipo de material identificado',          color: 'text-indigo-400/60' },
  3: { label: 'Código SAP encontrado en historial',     color: 'text-emerald-400/60' },
  4: { label: 'Categoría general — sin SAP específico', color: 'text-amber-400/60'  },
  5: { label: 'Sin coincidencia — solicita más datos',  color: 'text-red-400/60'    },
}

// ─────────────────────── PROPS ──────────────────────────────────

interface Props {
  rec: RecomendacionNueva
  sel: SeleccionPedido
  index: number
  onToggle: (index: number) => void
  onSelChange: (cambios: Partial<SeleccionPedido>) => void
  proveedoresDB?: ProveedorSimple[]
  preciosHistorico?: Map<string, PrecioHistorico>
}

// ─────────────────────── MAIN CARD ──────────────────────────────

export default function MaterialCard({ rec, sel, index, onToggle, onSelChange, proveedoresDB = [], preciosHistorico }: Props) {
  const cfg    = CONFIDENCE_CONFIG[rec.nivel_confianza]
  const matchC = rec.tipoMatch ? MATCH_CONFIG[rec.tipoMatch] : null
  const paso   = PASO_LABELS[rec._pasoDeterminante] || PASO_LABELS[5]
  const saps   = rec.codigos_sap_sugeridos || []

  const opcionesIA = useMemo(() => {
    const map = new Map<string, string>()
    if (rec.proveedor_recomendado?.codigo) map.set(rec.proveedor_recomendado.codigo, rec.proveedor_recomendado.nombre)
    for (const a of rec.alternativas || []) { if (a.codigo) map.set(a.codigo, a.nombre) }
    return Array.from(map.entries()).map(([codigo, nombre]) => ({ codigo, nombre }))
  }, [rec])

  return (
    <div
      className="rounded-2xl border transition-all duration-200 overflow-visible animate-slide-up"
      style={{
        background:   sel.incluido ? cfg.bg   : 'rgba(255,255,255,0.018)',
        borderColor:  sel.incluido ? cfg.border: 'rgba(255,255,255,0.07)',
        boxShadow:    sel.incluido ? `0 0 32px ${cfg.glow}` : '0 2px 12px rgba(0,0,0,0.25)',
        animationDelay: `${index * 55}ms`,
        animationFillMode: 'both',
      }}
    >
      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div className="p-5 pb-4">
        <div className="flex items-start gap-3">
          <button onClick={() => onToggle(index)} className="mt-0.5 shrink-0" title="Incluir/excluir en pedido">
            {sel.incluido
              ? <CheckSquare className="w-5 h-5" style={{ color: cfg.color }} />
              : <Square className="w-5 h-5 text-white/20" />
            }
          </button>

          <div className="flex-1 min-w-0">
            {/* Nombre + badges */}
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-white/92 leading-snug">{rec.material_detectado}</h3>
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                {matchC && (
                  <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${matchC.style}`} title={matchC.title}>
                    <matchC.Icon className="w-2.5 h-2.5" />
                    {matchC.label}
                  </span>
                )}
                <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.badge}`}>
                  <cfg.Icon className="w-3 h-3" />
                  {cfg.label}
                </span>
              </div>
            </div>

            {/* Chips técnicos */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
              {rec.tipo_material && rec.tipo_material !== 'No clasificado' && (
                <span className="flex items-center gap-1 text-xs text-white/45">
                  <Layers className="w-3 h-3 text-white/22 shrink-0" />{rec.tipo_material}
                </span>
              )}
              {rec.marca_detectada && rec.marca_detectada !== 'no especificada' && (
                <span className="flex items-center gap-1 text-xs text-violet-300/65 font-medium">
                  <Tag className="w-3 h-3 text-violet-400/45 shrink-0" />{rec.marca_detectada}
                </span>
              )}
              {rec.leyendaMedidas && (
                <span
                  className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: 'rgba(165,180,252,0.85)' }}
                >
                  {rec.leyendaMedidas}
                </span>
              )}
              <span className={`text-[10px] ${paso.color}`}>{paso.label}</span>
            </div>

            {/* Motivo — explicación técnica breve */}
            {rec.motivo && (
              <p className="text-sm text-white/38 leading-relaxed mt-2">{rec.motivo}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── SELECCIÓN (visible cuando está incluido) ────────────── */}
      {sel.incluido && (
        <div className="border-t border-white/[0.06] px-5 py-4 space-y-5">

          {/* PROVEEDOR */}
          <ProveedorSelector
            opcionesIA={opcionesIA}
            selected={sel.proveedorCodigo}
            proveedoresDB={proveedoresDB}
            onChange={(codigo, nombre) => onSelChange({ proveedorCodigo: codigo, proveedorNombre: nombre })}
          />

          {/* CÓDIGO SAP */}
          <SapSelector
            saps={saps}
            selected={sel.sapElegido}
            selectedDescripcion={sel.sapDescripcion}
            preciosHistorico={preciosHistorico}
            onChange={(codigo, descripcion, aproximado) =>
              onSelChange({ sapElegido: codigo, sapDescripcion: descripcion, sapAproximado: aproximado })
            }
          />

          {/* CANTIDAD */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/35 uppercase tracking-widest">Cantidad</span>
            <input
              type="number"
              min={1}
              value={sel.cantidad}
              onChange={(e) => onSelChange({ cantidad: Math.max(1, Number(e.target.value) || 1) })}
              className="w-16 text-sm text-white/80 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1.5 text-center focus:outline-none focus:border-violet-400/40 transition-colors"
            />
            {sel.sapAproximado && (
              <span className="text-xs text-amber-400/70 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Código aproximado — verifica medida
              </span>
            )}
          </div>

          {/* OBSERVACIONES */}
          {rec.observaciones?.trim() && (
            <div className="flex gap-3 p-3 rounded-xl" style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.14)' }}>
              <Lightbulb className="w-4 h-4 text-amber-400/65 shrink-0 mt-0.5" />
              <p className="text-xs text-white/50 leading-relaxed">{rec.observaciones}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────── PROVEEDOR SELECTOR ─────────────────────

function ProveedorSelector({
  opcionesIA,
  selected,
  proveedoresDB,
  onChange,
}: {
  opcionesIA: { codigo: string; nombre: string }[]
  selected: string
  proveedoresDB: ProveedorSimple[]
  onChange: (codigo: string, nombre: string) => void
}) {
  const [buscando, setBuscando] = useState(false)
  const [busq, setBusq] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (buscando) setTimeout(() => inputRef.current?.focus(), 40)
  }, [buscando])

  const filtrados = busq.trim().length >= 2
    ? proveedoresDB.filter(p => {
        const q = busq.toUpperCase()
        return p.nombre.toUpperCase().includes(q) || p.codigo.includes(q)
      }).slice(0, 12)
    : []

  const selectedEsIA = opcionesIA.some(o => o.codigo === selected)
  const selectedExterno = !selectedEsIA && selected
    ? proveedoresDB.find(p => p.codigo === selected)
    : null

  function elegir(codigo: string, nombre: string) {
    onChange(codigo, nombre)
    setBuscando(false)
    setBusq('')
  }

  return (
    <div>
      <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2 font-semibold">Proveedor</p>

      <div className="space-y-1.5">
        {/* Opciones IA */}
        {opcionesIA.map((o, i) => (
          <button
            key={o.codigo}
            onClick={() => elegir(o.codigo, o.nombre)}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-left transition-all duration-150"
            style={{
              background:   selected === o.codigo ? 'rgba(139,92,246,0.10)' : 'rgba(255,255,255,0.025)',
              borderColor:  selected === o.codigo ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.07)',
            }}
          >
            <RadioDot active={selected === o.codigo} color="violet" />
            <Building2 className="w-3.5 h-3.5 text-white/25 shrink-0" />
            <span className="text-sm text-white/85 font-medium flex-1 text-left truncate">{o.nombre}</span>
            <code className="text-[10px] text-white/30 font-mono shrink-0">{o.codigo}</code>
            <span
              className="text-[9px] uppercase tracking-wide shrink-0"
              style={{ color: i === 0 ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.25)' }}
              title={i === 0 ? 'Proveedor principal recomendado por la IA según historial de compras' : 'Proveedor alternativo sugerido por la IA'}
            >
              {i === 0 ? 'IA' : 'alt'}
            </span>
          </button>
        ))}

        {/* Proveedor externo seleccionado (desde búsqueda) */}
        {selectedExterno && !opcionesIA.some(o => o.codigo === selectedExterno.codigo) && (
          <div
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border"
            style={{ background: 'rgba(139,92,246,0.10)', borderColor: 'rgba(139,92,246,0.35)' }}
          >
            <RadioDot active color="violet" />
            <Building2 className="w-3.5 h-3.5 text-white/25 shrink-0" />
            <span className="text-sm text-white/85 font-medium flex-1 truncate">{selectedExterno.nombre}</span>
            <code className="text-[10px] text-white/30 font-mono shrink-0">{selectedExterno.codigo}</code>
            <span
              className="text-[9px] text-white/30 uppercase tracking-wide shrink-0"
              title="Proveedor seleccionado manualmente — no estaba en las sugerencias de la IA"
            >manual</span>
          </div>
        )}

        {/* Búsqueda de otro proveedor */}
        {!buscando ? (
          <button
            onClick={() => setBuscando(true)}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-dashed text-white/30 hover:text-white/55 hover:border-white/20 transition-all"
            style={{ borderColor: 'rgba(255,255,255,0.10)', background: 'transparent' }}
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs">Buscar otro proveedor ({proveedoresDB.length} disponibles)…</span>
          </button>
        ) : (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.15)', background: 'rgba(18,18,28,0.95)' }}>
            {/* Input búsqueda */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07]">
              <Search className="w-3.5 h-3.5 text-white/35 shrink-0" />
              <input
                ref={inputRef}
                value={busq}
                onChange={e => setBusq(e.target.value)}
                placeholder="Escribe nombre o código…"
                className="flex-1 text-sm bg-transparent text-white/85 placeholder-white/25 outline-none"
              />
              <button
                onMouseDown={e => { e.preventDefault(); setBuscando(false); setBusq('') }}
                className="text-white/25 hover:text-white/60 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Resultados */}
            {busq.trim().length >= 2 && (
              <div className="max-h-40 overflow-y-auto py-1">
                {filtrados.length > 0 ? filtrados.map(p => (
                  <button
                    key={p.codigo}
                    onMouseDown={e => { e.preventDefault(); elegir(p.codigo, p.nombre) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.07] active:bg-white/10 transition-colors"
                  >
                    {p.codigo === selected
                      ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      : <span className="w-3.5 shrink-0" />
                    }
                    <span className="text-xs text-white/80 flex-1 truncate">{p.nombre}</span>
                    <code className="text-[10px] text-white/30 font-mono shrink-0">{p.codigo}</code>
                  </button>
                )) : (
                  <p className="text-xs text-white/30 px-4 py-2 italic">Sin resultados para &ldquo;{busq}&rdquo;</p>
                )}
              </div>
            )}
            {busq.trim().length < 2 && (
              <p className="text-xs text-white/20 px-4 py-2">Escribe al menos 2 caracteres para buscar</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────── SAP SELECTOR ───────────────────────────

function SapSelector({
  saps,
  selected,
  selectedDescripcion,
  preciosHistorico,
  onChange,
}: {
  saps: RecomendacionNueva['codigos_sap_sugeridos']
  selected: string
  selectedDescripcion?: string
  preciosHistorico?: Map<string, PrecioHistorico>
  onChange: (codigo: string, descripcion: string, aproximado: boolean) => void
}) {
  const [mostrarTodos, setMostrarTodos] = useState(false)
  const [busqSAP, setBusqSAP] = useState('')
  const [sapResultados, setSapResultados] = useState<SapSearchResult[]>([])
  const [buscandoSAP, setBuscandoSAP] = useState(false)
  const [buscarAbierto, setBuscarAbierto] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (buscarAbierto) setTimeout(() => inputRef.current?.focus(), 40)
  }, [buscarAbierto])

  const visibles = mostrarTodos ? saps : saps.slice(0, 3)
  const ninguno = selected === ''
  // SAP seleccionado desde la búsqueda libre (no está en la lista de sugerencias)
  const selectedEnLista = saps.some(s => s.codigo === selected)
  const selectedExterno = selected && !selectedEnLista && selected !== ''
    ? { codigo: selected, descripcion: selectedDescripcion || '' }
    : null

  function buscarSAP(query: string) {
    setBusqSAP(query)
    clearTimeout(timerRef.current)
    if (query.trim().length < 2) { setSapResultados([]); return }
    setBuscandoSAP(true)
    timerRef.current = setTimeout(async () => {
      try {
        const r = await fetch('/api/sap-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
        setSapResultados(await r.json())
      } finally { setBuscandoSAP(false) }
    }, 280)
  }

  return (
    <div>
      <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2 font-semibold flex items-center gap-2">
        <Hash className="w-3 h-3" />
        Código SAP
        {saps.length > 3 && (
          <button onClick={() => setMostrarTodos(v => !v)} className="text-indigo-400/60 hover:text-indigo-400/90 transition-colors normal-case tracking-normal flex items-center gap-0.5">
            {mostrarTodos ? <><ChevronUp className="w-3 h-3" />ver menos</> : <><ChevronDown className="w-3 h-3" />{saps.length - 3} más</>}
          </button>
        )}
      </p>

      <div className="space-y-1.5">
        {/* SAP seleccionado manualmente (no estaba en la lista de sugerencias) */}
        {selectedExterno && (
          <div
            className="flex items-start gap-3 px-3.5 py-2.5 rounded-xl border"
            style={{ background: 'rgba(99,102,241,0.10)', borderColor: 'rgba(99,102,241,0.35)' }}
          >
            <RadioDot active color="indigo" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-sm font-mono font-medium text-indigo-300/85">{selectedExterno.codigo}</code>
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase"
                  style={{ background: 'rgba(139,92,246,0.15)', color: 'rgba(167,139,250,0.80)', border: '1px solid rgba(139,92,246,0.25)' }}
                  title="Código SAP buscado y seleccionado manualmente — no estaba en la lista de sugerencias"
                >manual</span>
              </div>
              {selectedExterno.descripcion && (
                <p className="text-xs text-white/45 mt-0.5 leading-snug">{selectedExterno.descripcion}</p>
              )}
            </div>
          </div>
        )}

        {visibles.map((sap) => {
          const esCatalogo = !sap.proveedor && !!sap.nota?.includes('sin historial')
          const precio = preciosHistorico?.get(sap.codigo)
          return (
            <button
              key={sap.codigo}
              onClick={() => onChange(sap.codigo, sap.descripcion, sap.aproximado === true)}
              className="w-full flex items-start gap-3 px-3.5 py-2.5 rounded-xl border text-left transition-all duration-150"
              style={{
                background:  selected === sap.codigo
                  ? (esCatalogo ? 'rgba(245,158,11,0.10)' : 'rgba(99,102,241,0.10)')
                  : 'rgba(255,255,255,0.025)',
                borderColor: selected === sap.codigo
                  ? (esCatalogo ? 'rgba(245,158,11,0.35)' : 'rgba(99,102,241,0.35)')
                  : 'rgba(255,255,255,0.07)',
              }}
            >
              <RadioDot active={selected === sap.codigo} color={esCatalogo ? 'amber' : 'indigo'} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className={`text-sm font-mono font-medium ${esCatalogo ? 'text-amber-300/80' : 'text-indigo-300/85'}`}>
                    {sap.codigo}
                  </code>
                  {sap.aproximado && (
                    <span className="text-[10px] text-amber-400/70 font-medium">~ aprox.</span>
                  )}
                  {esCatalogo && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase"
                      style={{ background: 'rgba(245,158,11,0.12)', color: 'rgba(251,191,36,0.75)', border: '1px solid rgba(245,158,11,0.2)' }}>
                      SAP
                    </span>
                  )}
                  {sap.proveedor && !esCatalogo && (
                    <span className="text-[10px] text-white/30">{sap.proveedor}</span>
                  )}
                  {precio && (
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(16,185,129,0.10)', color: 'rgba(52,211,153,0.85)', border: '1px solid rgba(16,185,129,0.22)' }}
                      title={`Último precio pagado según tu histórico de secciones (${fmtFecha(precio.fecha)}${precio.proveedor ? ' · ' + precio.proveedor : ''})`}
                    >
                      {fmtEUR(precio.precio)}/ud · {fmtFecha(precio.fecha)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/45 mt-0.5 leading-snug">{sap.descripcion}</p>
                {esCatalogo && <p className="text-[9px] text-amber-400/40 mt-0.5">Sin historial de compra — existe en SAP</p>}
                {sap.nota && !esCatalogo && <p className="text-xs text-amber-400/55 mt-0.5 leading-tight">{sap.nota}</p>}
              </div>
            </button>
          )
        })}

        {/* Sin código */}
        <button
          onClick={() => onChange('', '', false)}
          className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl border text-left transition-all duration-150"
          style={{
            background:  ninguno ? 'rgba(255,255,255,0.04)'  : 'rgba(255,255,255,0.015)',
            borderColor: ninguno ? 'rgba(255,255,255,0.18)'  : 'rgba(255,255,255,0.06)',
          }}
        >
          <RadioDot active={ninguno} color="white" />
          <span className="text-xs text-white/35 italic">Sin código SAP — texto libre</span>
        </button>

        {/* Buscar en toda la BD */}
        {!buscarAbierto ? (
          <button
            onClick={() => setBuscarAbierto(true)}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-dashed text-white/25 hover:text-white/50 hover:border-white/18 transition-all"
            style={{ borderColor: 'rgba(99,102,241,0.15)', background: 'transparent' }}
          >
            <Search className="w-3.5 h-3.5 text-indigo-400/40 shrink-0" />
            <span className="text-xs">Buscar código SAP en base de datos…</span>
          </button>
        ) : (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(99,102,241,0.25)', background: 'rgba(18,18,28,0.95)' }}>
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.07]">
              <Search className="w-3.5 h-3.5 text-indigo-400/40 shrink-0" />
              <input
                ref={inputRef}
                value={busqSAP}
                onChange={e => buscarSAP(e.target.value)}
                placeholder="Nombre o código SAP…"
                className="flex-1 text-sm bg-transparent text-white/85 placeholder-white/25 outline-none"
              />
              {buscandoSAP && <span className="text-[10px] text-indigo-400/50 animate-pulse">…</span>}
              <button
                onMouseDown={e => { e.preventDefault(); setBuscarAbierto(false); setBusqSAP(''); setSapResultados([]) }}
                className="text-white/25 hover:text-white/60 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="max-h-44 overflow-y-auto py-1">
              {busqSAP.trim().length >= 2 ? (
                sapResultados.length > 0 ? sapResultados.map(s => (
                  <button
                    key={s.codigo}
                    onMouseDown={e => { e.preventDefault(); onChange(s.codigo, s.descripcion, false); setBuscarAbierto(false); setBusqSAP(''); setSapResultados([]) }}
                    className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-white/[0.07] active:bg-white/10 transition-colors"
                  >
                    {s.codigo === selected
                      ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      : <span className="w-3.5 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-mono text-indigo-300/90">{s.codigo}</span>
                        {s.fuente === 'catalogo' && (
                          <span className="text-[9px] px-1 rounded uppercase font-semibold"
                            style={{ background: 'rgba(245,158,11,0.12)', color: 'rgba(251,191,36,0.75)', border: '1px solid rgba(245,158,11,0.2)' }}>SAP</span>
                        )}
                        {s.veces > 0 && <span className="text-[9px] text-white/20">{s.veces}x</span>}
                      </div>
                      <p className="text-[10px] text-white/50 leading-tight">{s.descripcion}</p>
                      {s.proveedor && <p className="text-[10px] text-white/25">{s.proveedor}</p>}
                    </div>
                  </button>
                )) : !buscandoSAP ? (
                  <p className="text-xs text-white/30 px-4 py-2 italic">Sin resultados</p>
                ) : null
              ) : (
                <p className="text-xs text-white/20 px-4 py-2">Escribe al menos 2 caracteres</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────── RADIO DOT ──────────────────────────────

function RadioDot({ active, color = 'indigo' }: { active: boolean; color?: 'indigo' | 'violet' | 'amber' | 'white' }) {
  const colors: Record<string, { border: string; bg: string }> = {
    indigo: { border: active ? '#818cf8' : 'rgba(255,255,255,0.22)', bg: active ? '#818cf8' : 'transparent' },
    violet: { border: active ? '#a78bfa' : 'rgba(255,255,255,0.22)', bg: active ? '#a78bfa' : 'transparent' },
    amber:  { border: active ? '#fbbf24' : 'rgba(255,255,255,0.22)', bg: active ? '#fbbf24' : 'transparent' },
    white:  { border: active ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.22)', bg: active ? 'rgba(255,255,255,0.70)' : 'transparent' },
  }
  const c = colors[color]
  return (
    <div
      className="w-3.5 h-3.5 rounded-full border-2 shrink-0 mt-0.5 transition-all duration-150"
      style={{ borderColor: c.border, background: c.bg }}
    />
  )
}
