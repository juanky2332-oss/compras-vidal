'use client'

import { useState } from 'react'
import { Clipboard, Check, Building2, AlertCircle, ArrowRightLeft } from 'lucide-react'
import type { RecomendacionNueva, SapSugeridoUI, ItemPedidoUnificado } from '@/lib/types'

interface ExportSAPProps {
  recomendaciones: RecomendacionNueva[]
  pedidoUnificado?: ItemPedidoUnificado[]
}

function cleanSap(sap: string | undefined | null): string {
  if (!sap) return ''
  const s = sap.replace(/\s/g, '')
  if (/^0*599000000$/.test(s)) return ''
  return sap.trim()
}

// Obtiene el SAP para la columna Material del pedido.
// REGLA DE ORO: la columna Material solo admite un 502... (código SAP de material).
//   → NUNCA un código de proveedor (1000xxxxx).
//   → Si no hay SAP exacto, usa el mejor aproximado marcado con ~.
//   → Si no hay nada, queda vacío (posición de texto libre).
function getExportSap(rec: RecomendacionNueva): { sap: string; esAproximado: boolean; nota: string } {
  const sugeridos = rec.codigos_sap_sugeridos || []

  // 1) Busca un SAP exacto (no aproximado)
  for (const s of sugeridos) {
    const codigo = cleanSap(s.codigo)
    if (codigo && !s.aproximado) return { sap: codigo, esAproximado: false, nota: '' }
  }

  // 2) Si no hay exacto, usa el mejor aproximado
  for (const s of sugeridos) {
    const codigo = cleanSap(s.codigo)
    if (codigo) return { sap: codigo, esAproximado: true, nota: s.nota || 'Código aproximado — verificar con proveedor.' }
  }

  // 3) Sin SAP: posición de texto libre
  return { sap: '', esAproximado: false, nota: '' }
}

// TSV para pegar en SAP ME51N — empieza en columna Material
// Columnas: Material | Txt.brv. | Ctd. | UM | T | Fe.entrega | Prc.neto | Mon. | por | CPP | Grp.art. | Centro | Almacén
function buildLine(rec: RecomendacionNueva): string {
  const { sap } = getExportSap(rec)
  const rawDesc = rec.material_detectado.replace(/^\d+x\s*/i, '').trim()
  const desc = rawDesc.slice(0, 40)
  const qty = String(rec.cantidad)

  return [
    sap,             // Material (código SAP 502...) — NUNCA código de proveedor
    sap ? '' : desc, // Txt.brv. — solo si no hay código SAP (texto libre)
    qty,             // Ctd.pedido
    '',              // UM
    '',              // T
    '',              // Fe.entrega
    '',              // Prc.neto
    '',              // Mon.
    '',              // por
    '',              // CPP
    '',              // Grp.art.
    '1001',          // Centro
    '100',           // Almacén
  ].join('\t')
}

// Agrupa por proveedor asignado (del pedido unificado si existe, o del recomendado)
function groupBySupplier(
  recs: RecomendacionNueva[],
  unificado?: ItemPedidoUnificado[]
): { proveedor: string; codigo: string; recs: Array<RecomendacionNueva & { _unificado?: boolean; _notaUnificacion?: string }> }[] {
  const map = new Map<string, Array<RecomendacionNueva & { _unificado?: boolean; _notaUnificacion?: string }>>()

  for (let i = 0; i < recs.length; i++) {
    const rec = recs[i]
    const u = unificado?.[i]

    // Proveedor: si hay unificado, usa el asignado; si no, el recomendado
    const provNombre = u?.proveedor_asignado?.nombre || rec.proveedor_recomendado?.nombre || 'Sin proveedor'
    const provCodigo = u?.proveedor_asignado?.codigo || rec.proveedor_recomendado?.codigo || ''

    const key = provNombre
    if (!map.has(key)) map.set(key, [])

    map.get(key)!.push({
      ...rec,
      _unificado: u?.unificado ?? false,
      _notaUnificacion: u?.nota_unificacion ?? undefined,
    })
  }

  return Array.from(map.entries()).map(([proveedor, items]) => ({
    proveedor,
    codigo: items[0]?._unificado
      ? (unificado?.find((u) => u.proveedor_asignado?.nombre === proveedor)?.proveedor_asignado?.codigo || '')
      : (items[0]?.proveedor_recomendado?.codigo || ''),
    recs: items,
  }))
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

function ProveedorBlock({
  proveedor,
  codigo,
  recs,
}: {
  proveedor: string
  codigo: string
  recs: Array<RecomendacionNueva & { _unificado?: boolean; _notaUnificacion?: string }>
}) {
  const [copiado, setCopiado] = useState(false)

  const handleCopiar = async () => {
    const text = recs.map(buildLine).join('\n')
    await copyToClipboard(text)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  const hasSinProveedor = proveedor === 'Sin datos' || proveedor === 'Sin proveedor'

  return (
    <div className="rounded-xl border border-white/[0.08] overflow-hidden">
      {/* Cabecera proveedor */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05]"
        style={{ background: 'rgba(255,255,255,0.02)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="w-3.5 h-3.5 text-indigo-400/60 shrink-0" />
          <span className="text-sm font-semibold text-white/85 truncate">{proveedor}</span>
          {codigo && (
            <span className="text-xs text-white/30 font-mono shrink-0">{codigo}</span>
          )}
          <span className="text-xs text-white/30 shrink-0">
            {recs.length} línea{recs.length > 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={handleCopiar}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ml-3 transition-all duration-200"
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

      {/* Líneas del pedido */}
      <div className="divide-y divide-white/[0.035]">
        {recs.map((rec, i) => {
          const { sap, esAproximado, nota } = getExportSap(rec)
          const desc = rec.material_detectado.replace(/^\d+x\s*/i, '').trim()
          const sinSap = !sap

          return (
            <div key={i} className="px-4 py-2">
              <div className="flex items-center gap-3">
                {/* SAP code — siempre 502... o vacío, NUNCA código proveedor */}
                <div className="w-24 shrink-0">
                  <span
                    className="font-mono text-xs"
                    style={{ color: sinSap ? 'rgba(255,255,255,0.2)' : '#818cf8' }}
                  >
                    {sap || '—'}
                  </span>
                  {esAproximado && (
                    <span className="ml-1 text-[10px] text-amber-400/60" title={nota}>~</span>
                  )}
                </div>
                {/* Descripción */}
                <div className="flex-1 text-xs text-white/55 truncate min-w-0" title={desc}>
                  {desc}
                </div>
                {/* Cantidad */}
                <div className="text-xs font-mono text-white/50 w-8 text-right shrink-0">
                  {rec.cantidad}
                </div>
                {/* Badge nivel */}
                <div
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
                  style={{
                    background:
                      rec.nivel_confianza === 'ALTO' ? 'rgba(16,185,129,0.1)'
                      : rec.nivel_confianza === 'MEDIO' ? 'rgba(245,158,11,0.1)'
                      : 'rgba(239,68,68,0.1)',
                    color:
                      rec.nivel_confianza === 'ALTO' ? '#34d399'
                      : rec.nivel_confianza === 'MEDIO' ? '#fbbf24'
                      : '#f87171',
                  }}
                >
                  {rec.nivel_confianza}
                </div>
              </div>

              {/* Nota de unificación (si se movió de proveedor) */}
              {rec._unificado && rec._notaUnificacion && (
                <div className="flex items-center gap-1.5 mt-1.5 pl-[108px]">
                  <ArrowRightLeft className="w-3 h-3 text-blue-400/50 shrink-0" />
                  <span className="text-[10px] text-blue-400/50 leading-tight">
                    {rec._notaUnificacion}
                  </span>
                </div>
              )}

              {/* Nota de SAP aproximado */}
              {esAproximado && nota && !rec._unificado && (
                <div className="flex items-center gap-1.5 mt-1 pl-[108px]">
                  <AlertCircle className="w-3 h-3 text-amber-400/50 shrink-0" />
                  <span className="text-[10px] text-amber-400/45 leading-tight">{nota}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {hasSinProveedor && (
        <div className="flex items-start gap-2 px-4 py-2.5 border-t border-white/[0.04] bg-amber-500/[0.03]">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400/60 shrink-0 mt-px" />
          <p className="text-xs text-amber-400/50">
            Sin proveedor identificado. Asigna manualmente antes de crear el pedido.
          </p>
        </div>
      )}
    </div>
  )
}

export default function ExportSAP({ recomendaciones, pedidoUnificado }: ExportSAPProps) {
  const seleccionados = recomendaciones.filter((r) => r.seleccionado)
  if (seleccionados.length === 0) return null

  const grupos = groupBySupplier(seleccionados, pedidoUnificado)
  const aproximados = seleccionados.filter((r) => {
    const { esAproximado } = getExportSap(r)
    return esAproximado
  })
  const unificados = pedidoUnificado?.filter((u) => u.unificado) || []

  return (
    <div className="glass rounded-2xl overflow-hidden border border-indigo-500/15">
      {/* Cabecera */}
      <div className="px-4 py-3 border-b border-white/[0.05]">
        <h3 className="text-sm font-semibold text-white/85">Pedidos SAP — por proveedor</h3>
        <p className="text-xs text-white/35 mt-0.5">
          {grupos.length} pedido{grupos.length > 1 ? 's' : ''} · {seleccionados.length} línea{seleccionados.length > 1 ? 's' : ''} ·{' '}
          Clic en celda Material fila 1 → Ctrl+V
        </p>
      </div>

      {/* Bloques por proveedor */}
      <div className="p-4 space-y-3">
        {grupos.map((g, i) => (
          <ProveedorBlock key={i} proveedor={g.proveedor} codigo={g.codigo} recs={g.recs} />
        ))}

        {/* Aviso SAP aproximados */}
        {aproximados.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/[0.05] border border-amber-500/15 mt-1">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400/70 shrink-0 mt-px" />
            <p className="text-xs text-amber-400/60 leading-relaxed">
              <span className="text-amber-400/80 font-medium">
                {aproximados.length} código{aproximados.length > 1 ? 's' : ''} aproximado{aproximados.length > 1 ? 's' : ''}
              </span>{' '}
              (marcados con ~) — son la mejor coincidencia disponible pero no confirmados. Verifica con el proveedor antes de guardar.
            </p>
          </div>
        )}

        {/* Aviso materiales unificados */}
        {unificados.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/[0.05] border border-blue-500/15 mt-1">
            <ArrowRightLeft className="w-3.5 h-3.5 text-blue-400/70 shrink-0 mt-px" />
            <p className="text-xs text-blue-400/60 leading-relaxed">
              <span className="text-blue-400/80 font-medium">
                {unificados.length} material{unificados.length > 1 ? 'es' : ''} unificado{unificados.length > 1 ? 's' : ''}
              </span>{' '}
              — se agrupan en el proveedor mayoritario para un solo pedido. Confirma que ese proveedor puede servirlos.
            </p>
          </div>
        )}

        {/* Guía de columnas */}
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
            ].map((col, ci) => (
              <div
                key={ci}
                className="text-[10px] text-white/20 font-mono shrink-0 border-r border-white/[0.04] pr-1"
                style={{ width: col.w }}
              >
                {col.label}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-white/15 mt-1">
            * Txt.brv. se incluye solo si no hay código SAP (posición texto libre)
          </p>
        </div>
      </div>
    </div>
  )
}
