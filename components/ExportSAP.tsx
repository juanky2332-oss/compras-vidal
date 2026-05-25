'use client'

import { useState } from 'react'
import { Clipboard, Check, Building2, AlertCircle } from 'lucide-react'
import type { Recomendacion } from '@/lib/types'

interface ExportSAPProps {
  recomendaciones: Recomendacion[]
}

function cleanSap(sap: string | undefined | null): string {
  if (!sap) return ''
  const s = sap.replace(/\s/g, '')
  if (/^0*599000000$/.test(s)) return ''
  return sap.trim()
}

// Para MEDIO/BAJO: busca el mejor SAP disponible en alternativas o familia
function getExportSap(rec: Recomendacion): { sap: string; esAproximado: boolean } {
  const principal = cleanSap(rec.recomendacion_principal.codigo_sap)
  if (principal) return { sap: principal, esAproximado: false }

  for (const alt of rec.alternativas || []) {
    const altSap = cleanSap(alt.codigo_sap)
    if (altSap) return { sap: altSap, esAproximado: true }
  }

  const familia = rec._fuzzyData?.matches?.sapsRealesFamilia || []
  for (const f of familia) {
    const famSap = cleanSap(f.codigoSAP)
    if (famSap) return { sap: famSap, esAproximado: true }
  }

  return { sap: '', esAproximado: false }
}

// TSV para pegar en SAP ME51N — empieza en columna Material (sin Pos/I/P vacíos)
// Columnas: Material | Txt.brv. | Ctd. | UM | T | Fe.entrega | Prc.neto | Mon. | por | CPP | Grp.art. | Centro | Almacén
function buildLine(rec: Recomendacion): string {
  const { sap } = getExportSap(rec)
  const rawDesc = rec.material_detectado.replace(/^\d+x\s*/i, '').trim()
  // SAP acepta máx 40 chars en texto breve
  const desc = rawDesc.slice(0, 40)
  const qty = String(rec.cantidad)

  return [
    sap,            // Material (número SAP)
    sap ? '' : desc, // Txt.brv. — solo si no hay código SAP (posición de texto libre)
    qty,            // Ctd.pedido
    '',             // UM (unidad de medida — el comprador la pone)
    '',             // T (tipo posición)
    '',             // Fe.entrega
    '',             // Prc.neto
    '',             // Mon.
    '',             // por
    '',             // CPP
    '',             // Grp.art.
    '1001',         // Centro
    '100',          // Almacén
  ].join('\t')
}

function groupBySupplier(recs: Recomendacion[]): { proveedor: string; recs: Recomendacion[] }[] {
  const map = new Map<string, Recomendacion[]>()
  for (const rec of recs) {
    const prov = rec.recomendacion_principal.proveedor?.trim() || 'Sin proveedor'
    if (!map.has(prov)) map.set(prov, [])
    map.get(prov)!.push(rec)
  }
  return Array.from(map.entries()).map(([proveedor, items]) => ({ proveedor, recs: items }))
}

async function copyToClipboard(text: string): Promise<void> {
  // Intento 1: API moderna
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // continúa al fallback
    }
  }
  // Fallback: textarea + execCommand
  const ta = document.createElement('textarea')
  ta.value = text
  Object.assign(ta.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none',
  })
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

function ProveedorBlock({ proveedor, recs }: { proveedor: string; recs: Recomendacion[] }) {
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
          <span className="text-xs text-white/30 shrink-0">
            {recs.length} línea{recs.length > 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={handleCopiar}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ml-3 transition-all duration-200"
          style={{
            background: copiado ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.12)',
            border: copiado
              ? '1px solid rgba(16,185,129,0.3)'
              : '1px solid rgba(99,102,241,0.25)',
            color: copiado ? '#34d399' : '#a5b4fc',
          }}
        >
          {copiado ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Clipboard className="w-3.5 h-3.5" />
          )}
          {copiado ? '¡Copiado!' : 'Copiar pedido'}
        </button>
      </div>

      {/* Líneas del pedido */}
      <div className="divide-y divide-white/[0.035]">
        {recs.map((rec, i) => {
          const { sap, esAproximado } = getExportSap(rec)
          const desc = rec.material_detectado.replace(/^\d+x\s*/i, '').trim()
          const sinSap = !sap

          return (
            <div key={i} className="flex items-center gap-3 px-4 py-2">
              {/* SAP code */}
              <div className="w-24 shrink-0">
                <span
                  className="font-mono text-xs"
                  style={{ color: sinSap ? 'rgba(255,255,255,0.2)' : '#818cf8' }}
                >
                  {sap || '—'}
                </span>
                {esAproximado && (
                  <span className="ml-1 text-[10px] text-amber-400/60">~</span>
                )}
              </div>
              {/* Descripción */}
              <div
                className="flex-1 text-xs text-white/55 truncate min-w-0"
                title={desc}
              >
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
                    rec.nivel_confianza === 'ALTO'
                      ? 'rgba(16,185,129,0.1)'
                      : rec.nivel_confianza === 'MEDIO'
                      ? 'rgba(245,158,11,0.1)'
                      : 'rgba(239,68,68,0.1)',
                  color:
                    rec.nivel_confianza === 'ALTO'
                      ? '#34d399'
                      : rec.nivel_confianza === 'MEDIO'
                      ? '#fbbf24'
                      : '#f87171',
                }}
              >
                {rec.nivel_confianza}
              </div>
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

export default function ExportSAP({ recomendaciones }: ExportSAPProps) {
  const seleccionados = recomendaciones.filter((r) => r.seleccionado)
  if (seleccionados.length === 0) return null

  const grupos = groupBySupplier(seleccionados)
  const aproximados = seleccionados.filter((r) => {
    const { esAproximado } = getExportSap(r)
    return esAproximado
  })

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
          <ProveedorBlock key={i} proveedor={g.proveedor} recs={g.recs} />
        ))}

        {/* Aviso SAP aproximados */}
        {aproximados.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/[0.05] border border-amber-500/15 mt-1">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400/70 shrink-0 mt-px" />
            <p className="text-xs text-amber-400/60 leading-relaxed">
              <span className="text-amber-400/80 font-medium">{aproximados.length} código{aproximados.length > 1 ? 's' : ''} aproximado{aproximados.length > 1 ? 's' : ''}</span>{' '}
              (marcados con ~) — son la mejor coincidencia disponible pero no confirmados. Verifica con el proveedor antes de guardar.
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
            ].map((col, i) => (
              <div
                key={i}
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
