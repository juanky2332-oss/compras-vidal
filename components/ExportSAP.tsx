'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Clipboard, Check, Building2, AlertCircle, FileText, ChevronDown, Search, X, Users } from 'lucide-react'
import type { SeleccionPedido, ProveedorSimple } from '@/lib/types'

interface ExportSAPProps {
  selecciones: SeleccionPedido[]
  solicitudCompra?: string
  proveedoresDB?: ProveedorSimple[]
  onSeleccionesChange?: (selecciones: SeleccionPedido[]) => void
}

function cleanSap(sap: string | undefined | null): string {
  if (!sap) return ''
  const s = sap.replace(/\s/g, '')
  if (/^0*599000000$/.test(s)) return ''
  return sap.trim()
}

function buildLine(sel: SeleccionPedido, solicitudCompra?: string): string {
  const sap = cleanSap(sel.sapElegido)
  const desc = (sel.sapDescripcion || '').slice(0, 40)
  const qty = String(sel.cantidad)

  return [
    sap,             // 1  Material
    sap ? '' : desc, // 2  Txt.brv.
    qty,             // 3  Ctd.pedido
    '',              // 4  U...
    '',              // 5  T
    '',              // 6  Fe.entrega
    '',              // 7  Prc.neto
    '',              // 8  Mon...
    '',              // 9  por
    '',              // 10 CPP
    '',              // 11 Grupo art.
    '1001',          // 12 Centro
    '100',           // 13 Almacén
    '',              // 14 Lote
    '',              // 15 Segmento de stock
    '',              // 16 Segm.necesidad
    '',              // 17 Nº nec.
    '',              // 18 Solicitante
    '',              // 19 C...
    '',              // 20 Mat.gest.stock
    '',              // 21 Reg.info
    '',              // 22 Po...
    '',              // 23 Gr...
    '',              // 24 T...
    solicitudCompra || '', // 25 Sol.pedido ✓
  ].join('\t')
}

function groupBySupplier(
  selecciones: SeleccionPedido[]
): { proveedor: string; codigo: string; lineas: SeleccionPedido[] }[] {
  const map = new Map<string, { nombre: string; codigo: string; lineas: SeleccionPedido[] }>()
  for (const sel of selecciones) {
    const key = sel.proveedorCodigo || sel.proveedorNombre || '__sin__'
    if (!map.has(key)) {
      map.set(key, { nombre: sel.proveedorNombre || 'Sin proveedor', codigo: sel.proveedorCodigo || '', lineas: [] })
    }
    map.get(key)!.lineas.push(sel)
  }
  return Array.from(map.values()).map((v) => ({ proveedor: v.nombre, codigo: v.codigo, lineas: v.lineas }))
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return } catch { /* fallback */ }
  }
  const ta = document.createElement('textarea')
  ta.value = text
  Object.assign(ta.style, { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' })
  document.body.appendChild(ta)
  ta.focus(); ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

function MiniSelectorProveedor({
  proveedorActual,
  codigoActual,
  proveedoresDB,
  onElegir,
}: {
  proveedorActual: string
  codigoActual: string
  proveedoresDB: ProveedorSimple[]
  onElegir: (codigo: string, nombre: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [busq, setBusq] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtrados = useMemo(() => {
    if (busq.trim().length < 2) return []
    const q = busq.toUpperCase()
    return proveedoresDB
      .filter((p) => p.nombre.toUpperCase().includes(q) || p.codigo.includes(q))
      .slice(0, 15)
  }, [busq, proveedoresDB])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setBusq('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  return (
    <div ref={containerRef} className="relative" style={{ zIndex: 80 }}>
      <button
        onClick={() => { setOpen(!open); setBusq('') }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors"
        style={{
          background: 'rgba(99,102,241,0.10)',
          border: '1px solid rgba(99,102,241,0.22)',
          color: 'rgba(165,180,252,0.85)',
        }}
        title="Reasignar todos los materiales de este grupo a otro proveedor"
      >
        <Users className="w-3 h-3" />
        Cambiar proveedor
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 rounded-xl border border-white/10 bg-[#12121c] shadow-xl"
          style={{ zIndex: 999, width: '280px' }}
        >
          <div className="p-2 border-b border-white/[0.06]">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
              <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
              <input
                ref={inputRef}
                value={busq}
                onChange={(e) => setBusq(e.target.value)}
                placeholder="Buscar proveedor por nombre o código…"
                className="flex-1 text-xs bg-transparent text-white/85 placeholder-white/25 outline-none"
              />
              {busq && (
                <button onMouseDown={(e) => { e.preventDefault(); setBusq('') }}>
                  <X className="w-3 h-3 text-white/25 hover:text-white/50" />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filtrados.length > 0 ? (
              filtrados.map((p) => (
                <button
                  key={p.codigo}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onElegir(p.codigo, p.nombre)
                    setOpen(false)
                    setBusq('')
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.06] transition-colors"
                >
                  {p.codigo === codigoActual
                    ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    : <span className="w-3.5 shrink-0" />}
                  <span className="text-xs text-white/78 flex-1 truncate">{p.nombre}</span>
                  <code className="text-[10px] text-white/30 font-mono shrink-0">{p.codigo}</code>
                </button>
              ))
            ) : busq.trim().length >= 2 ? (
              <p className="text-xs text-white/30 px-3 py-2 italic">Sin resultados para &ldquo;{busq}&rdquo;</p>
            ) : (
              <p className="text-[10px] text-white/25 px-3 py-2">
                Escribe para buscar entre {proveedoresDB.length} proveedores
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ProveedorBlock({
  proveedor,
  codigo,
  lineas,
  solicitudCompra,
  proveedoresDB,
  onReasignarProveedor,
}: {
  proveedor: string
  codigo: string
  lineas: SeleccionPedido[]
  solicitudCompra?: string
  proveedoresDB: ProveedorSimple[]
  onReasignarProveedor?: (codigo: string, nombre: string) => void
}) {
  const [copiado, setCopiado] = useState(false)

  const handleCopiar = async () => {
    const text = lineas.map((sel) => buildLine(sel, solicitudCompra)).join('\n')
    await copyToClipboard(text)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  const sinProveedor = proveedor === 'Sin proveedor' || proveedor === 'Sin datos'

  return (
    <div className="rounded-xl border border-white/[0.08] overflow-visible">
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] rounded-t-xl"
        style={{ background: 'rgba(255,255,255,0.02)', overflow: 'visible' }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-wrap flex-1">
          <Building2 className="w-3.5 h-3.5 text-indigo-400/60 shrink-0" />
          <span className="text-sm font-semibold text-white/85 truncate">{proveedor}</span>
          {codigo && <span className="text-xs text-white/30 font-mono shrink-0">{codigo}</span>}
          <span className="text-xs text-white/30 shrink-0">{lineas.length} línea{lineas.length > 1 ? 's' : ''}</span>
          {solicitudCompra && (
            <span
              className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0"
              style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: 'rgba(165,180,252,0.85)' }}
            >
              <FileText className="w-2.5 h-2.5" />
              SC {solicitudCompra}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3" style={{ overflow: 'visible' }}>
          {onReasignarProveedor && proveedoresDB.length > 0 && (
            <MiniSelectorProveedor
              proveedorActual={proveedor}
              codigoActual={codigo}
              proveedoresDB={proveedoresDB}
              onElegir={onReasignarProveedor}
            />
          )}
          <button
            onClick={handleCopiar}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
            style={{
              background: copiado ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.12)',
              border: copiado ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(99,102,241,0.25)',
              color: copiado ? '#34d399' : '#a5b4fc',
            }}
          >
            {copiado ? <Check className="w-3.5 h-3.5" /> : <Clipboard className="w-3.5 h-3.5" />}
            {copiado ? '¡Copiado!' : 'Copiar pedido'}
          </button>
        </div>
      </div>

      <div className="divide-y divide-white/[0.035]">
        {lineas.map((sel, i) => {
          const sap = cleanSap(sel.sapElegido)
          const sinSap = !sap
          return (
            <div key={i} className="px-4 py-2">
              <div className="flex items-center gap-3">
                <div className="w-24 shrink-0">
                  <span className="font-mono text-xs" style={{ color: sinSap ? 'rgba(255,255,255,0.2)' : '#818cf8' }}>
                    {sap || '—'}
                  </span>
                  {sel.sapAproximado && <span className="ml-1 text-[10px] text-amber-400/60">~</span>}
                </div>
                <div className="flex-1 text-xs text-white/55 truncate min-w-0" title={sel.sapDescripcion}>
                  {sel.sapDescripcion || '(texto libre)'}
                </div>
                <div className="text-xs font-mono text-white/50 w-8 text-right shrink-0">{sel.cantidad}</div>
              </div>
            </div>
          )
        })}
      </div>

      {sinProveedor && (
        <div className="flex items-start gap-2 px-4 py-2.5 border-t border-white/[0.04] bg-amber-500/[0.03] rounded-b-xl">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400/60 shrink-0 mt-px" />
          <p className="text-xs text-amber-400/50">Sin proveedor asignado. Usa &quot;Cambiar proveedor&quot; para asignar uno.</p>
        </div>
      )}
    </div>
  )
}

export default function ExportSAP({
  selecciones,
  solicitudCompra,
  proveedoresDB = [],
  onSeleccionesChange,
}: ExportSAPProps) {
  const incluidas = selecciones.filter((s) => s.incluido)
  if (incluidas.length === 0) {
    return (
      <div className="glass rounded-2xl border border-white/[0.06] p-6 text-center">
        <p className="text-sm text-white/40">Selecciona al menos un material en &quot;Configurar pedido&quot; para generar el pedido SAP.</p>
      </div>
    )
  }

  const grupos = groupBySupplier(incluidas)
  const aproximados = incluidas.filter((s) => s.sapAproximado).length

  const handleReasignarGrupo = (indicesDelGrupo: number[], nuevoCodigo: string, nuevoNombre: string) => {
    if (!onSeleccionesChange) return
    const nuevas = selecciones.map((s) =>
      indicesDelGrupo.includes(s.indice)
        ? { ...s, proveedorCodigo: nuevoCodigo, proveedorNombre: nuevoNombre }
        : s
    )
    onSeleccionesChange(nuevas)
  }

  return (
    <div className="glass rounded-2xl border border-indigo-500/15" style={{ overflow: 'visible' }}>
      <div className="px-4 py-3 border-b border-white/[0.05]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-white/85">Pedidos SAP — agrupados por proveedor</h3>
            <p className="text-xs text-white/35 mt-0.5">
              {grupos.length} pedido{grupos.length > 1 ? 's' : ''} · {incluidas.length} línea{incluidas.length > 1 ? 's' : ''} · Clic en celda Material fila 1 → Ctrl+V
            </p>
          </div>
          {solicitudCompra && (
            <span
              className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg shrink-0"
              style={{ background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.22)', color: 'rgba(165,180,252,0.9)' }}
            >
              <FileText className="w-3.5 h-3.5" />
              SC {solicitudCompra}
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3" style={{ overflow: 'visible' }}>
        {grupos.map((g, i) => {
          const indicesDelGrupo = g.lineas.map((l) => l.indice)
          return (
            <ProveedorBlock
              key={i}
              proveedor={g.proveedor}
              codigo={g.codigo}
              lineas={g.lineas}
              solicitudCompra={solicitudCompra}
              proveedoresDB={proveedoresDB}
              onReasignarProveedor={
                onSeleccionesChange
                  ? (nuevoCodigo, nuevoNombre) => handleReasignarGrupo(indicesDelGrupo, nuevoCodigo, nuevoNombre)
                  : undefined
              }
            />
          )
        })}

        {aproximados > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/[0.05] border border-amber-500/15 mt-1">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400/70 shrink-0 mt-px" />
            <p className="text-xs text-amber-400/60 leading-relaxed">
              <span className="text-amber-400/80 font-medium">{aproximados} código{aproximados > 1 ? 's' : ''} aproximado{aproximados > 1 ? 's' : ''}</span>{' '}
              (marcados con ~) — verifica la medida con el proveedor antes de guardar.
            </p>
          </div>
        )}

        <div className="pt-1 border-t border-white/[0.04]">
          <p className="text-[10px] text-white/20 mb-1.5">Columnas pegadas (desde celda Material):</p>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {[
              { label: 'Material', w: 72 },
              { label: 'Txt.brv.*', w: 56 },
              { label: 'Ctd.', w: 36 },
              { label: 'UM', w: 28 },
              { label: 'T', w: 20 },
              { label: 'F.ent.', w: 44 },
              { label: 'Prc.', w: 36 },
              { label: 'Mon.', w: 36 },
              { label: 'por', w: 28 },
              { label: 'CPP', w: 32 },
              { label: 'Grp.', w: 32 },
              { label: 'Centro', w: 44 },
              { label: 'Alm.', w: 36 },
              { label: 'Lote', w: 36 },
              { label: 'Seg.stock', w: 56 },
              { label: 'Seg.nec.', w: 52 },
              { label: 'Nº nec.', w: 48 },
              { label: 'Solicit.', w: 48 },
              { label: 'C...', w: 28 },
              { label: 'Mat.g.', w: 40 },
              { label: 'Reg.', w: 32 },
              { label: 'Po...', w: 32 },
              { label: 'Gr...', w: 32 },
              { label: 'T...', w: 28 },
              { label: 'Sol.ped.**', w: 60, highlight: !!solicitudCompra },
            ].map((col, ci) => (
              <div
                key={ci}
                className="text-[10px] font-mono shrink-0 border-r border-white/[0.04] pr-1"
                style={{
                  width: col.w,
                  color: (col as { highlight?: boolean }).highlight ? 'rgba(165,180,252,0.6)' : 'rgba(255,255,255,0.2)',
                }}
              >
                {col.label}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-white/15 mt-1">
            * Txt.brv. solo si no hay código SAP · ** Sol.ped. = columna 25 (correcta en ME21N)
          </p>
        </div>
      </div>
    </div>
  )
}
