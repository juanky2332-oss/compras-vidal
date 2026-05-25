'use client'

import { useState } from 'react'
import { Clipboard, Check, Download, AlertCircle } from 'lucide-react'
import type { Recomendacion } from '@/lib/types'

interface ExportSAPProps {
  recomendaciones: Recomendacion[]
}

function cleanSap(sap: string | undefined): string {
  if (!sap) return ''
  if (/^0*599000000$/.test(sap.replace(/\s/g, ''))) return ''
  return sap
}

function buildSapText(recs: Recomendacion[]): string {
  const seleccionados = recs.filter((r) => r.seleccionado)
  if (seleccionados.length === 0) return ''

  const lineas = seleccionados.map((rec) => {
    const principal = rec.recomendacion_principal
    const sapLimpio = cleanSap(principal.codigo_sap)

    // 16 columnas separadas por tabulación:
    // 1.Pos 2.I 3.P 4.Material 5.Txt.brv. 6.Ctd.pedido 7.U... 8.T 9.Fe.entrega 10.Prc.neto 11.Mon... 12.por 13.CPP 14.Grupo art. 15.Centro 16.Almacén
    const descripcion = rec.material_detectado.replace(/^\d+x\s*/i, '').trim()
    const cols = [
      '',         // 1. Pos
      '',         // 2. I
      '',         // 3. P
      sapLimpio,  // 4. Material (SAP real si confirmado)
      descripcion,// 5. Txt.brv.
      String(rec.cantidad), // 6. Ctd.pedido
      '',         // 7. U...
      '',         // 8. T
      '',         // 9. Fe.entrega
      '',         // 10. Prc.neto
      '',         // 11. Mon...
      '',         // 12. por
      '',         // 13. CPP
      '',         // 14. Grupo art.
      '1001',     // 15. Centro (hardcoded)
      '100',      // 16. Almacén (hardcoded)
    ]
    return cols.join('\t')
  })

  return lineas.join('\n')
}

export default function ExportSAP({ recomendaciones }: ExportSAPProps) {
  const [copiado, setCopiado] = useState(false)

  const seleccionados = recomendaciones.filter((r) => r.seleccionado)
  const conSAP = seleccionados.filter((r) => cleanSap(r.recomendacion_principal.codigo_sap))
  const sinSAP = seleccionados.filter((r) => !cleanSap(r.recomendacion_principal.codigo_sap))

  if (seleccionados.length === 0) return null

  const handleCopiar = async () => {
    const text = buildSapText(recomendaciones)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    }
  }

  const handleDescargar = () => {
    const text = buildSapText(recomendaciones)
    if (!text) return
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pedido-sap-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="glass rounded-2xl overflow-hidden border border-indigo-500/15">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white/85">Exportar a SAP ME51N / ME21N</h3>
          <p className="text-xs text-white/35 mt-0.5">
            {seleccionados.length} material{seleccionados.length > 1 ? 'es' : ''} seleccionado{seleccionados.length > 1 ? 's' : ''}
            {' · '}Pega con Ctrl+V directamente en el grid de SAP
          </p>
        </div>
      </div>

      {/* Preview */}
      <div className="p-4">
        {/* Column headers */}
        <div className="mb-2 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {['Pos', 'I', 'P', 'Material', 'Txt.brv.', 'Ctd.', 'U...', 'T', 'Fe.entrega', 'Prc.neto', 'Mon...', 'por', 'CPP', 'Grp.art.', 'Centro', 'Almacén'].map(
              (col, i) => (
                <div
                  key={i}
                  className="text-xs text-white/25 font-mono truncate"
                  style={{ width: i === 4 ? '180px' : i === 3 ? '90px' : '48px', flexShrink: 0 }}
                >
                  {col}
                </div>
              )
            )}
          </div>
        </div>

        {/* Rows preview */}
        <div className="space-y-1 overflow-x-auto">
          {seleccionados.slice(0, 6).map((rec, i) => {
            const sapLimpio = cleanSap(rec.recomendacion_principal.codigo_sap)
            const descripcion = rec.material_detectado.replace(/^\d+x\s*/i, '').trim()
            return (
              <div key={i} className="flex gap-1 min-w-max py-1 border-b border-white/[0.04]">
                <div className="text-xs text-white/20 font-mono" style={{ width: '48px' }} />
                <div className="text-xs text-white/20 font-mono" style={{ width: '48px' }} />
                <div className="text-xs text-white/20 font-mono" style={{ width: '48px' }} />
                <div
                  className="text-xs font-mono truncate"
                  style={{ width: '90px', color: sapLimpio ? '#818cf8' : 'rgba(255,255,255,0.2)' }}
                >
                  {sapLimpio || '—'}
                </div>
                <div
                  className="text-xs text-white/65 truncate"
                  style={{ width: '180px' }}
                  title={descripcion}
                >
                  {descripcion}
                </div>
                <div className="text-xs text-white/65 font-mono" style={{ width: '48px' }}>
                  {rec.cantidad}
                </div>
                <div className="text-xs text-white/20 font-mono" style={{ width: '48px' }} />
                <div className="text-xs text-white/20 font-mono" style={{ width: '48px' }} />
                <div className="text-xs text-white/20 font-mono" style={{ width: '72px' }} />
                <div className="text-xs text-white/20 font-mono" style={{ width: '72px' }} />
                <div className="text-xs text-white/20 font-mono" style={{ width: '48px' }} />
                <div className="text-xs text-white/20 font-mono" style={{ width: '48px' }} />
                <div className="text-xs text-white/20 font-mono" style={{ width: '48px' }} />
                <div className="text-xs text-white/20 font-mono" style={{ width: '60px' }} />
                <div className="text-xs text-white/45 font-mono" style={{ width: '48px' }}>1001</div>
                <div className="text-xs text-white/45 font-mono" style={{ width: '48px' }}>100</div>
              </div>
            )
          })}
          {seleccionados.length > 6 && (
            <p className="text-xs text-white/25 pt-1">…y {seleccionados.length - 6} más</p>
          )}
        </div>

        {/* Warning sin SAP */}
        {sinSAP.length > 0 && (
          <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/05 border border-amber-500/15">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400/70 flex-shrink-0 mt-px" />
            <p className="text-xs text-amber-400/60">
              {sinSAP.length} material{sinSAP.length > 1 ? 'es' : ''} sin SAP confirmado — se pegarán sin código de material. Revisa antes de guardar el pedido.
            </p>
          </div>
        )}

        {/* Buttons */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={handleCopiar}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
            style={{
              background: copiado
                ? 'rgba(16,185,129,0.15)'
                : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              borderColor: copiado ? 'rgba(16,185,129,0.3)' : 'transparent',
              border: copiado ? '1px solid rgba(16,185,129,0.3)' : 'none',
              boxShadow: copiado ? 'none' : '0 0 20px rgba(99,102,241,0.2)',
              color: copiado ? '#34d399' : 'white',
            }}
          >
            {copiado ? (
              <>
                <Check className="w-4 h-4" />
                <span>¡Copiado al portapapeles!</span>
              </>
            ) : (
              <>
                <Clipboard className="w-4 h-4" />
                <span>Copiar para SAP (Ctrl+V)</span>
              </>
            )}
          </button>

          <button
            onClick={handleDescargar}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium border border-white/10 hover:border-white/20 hover:bg-white/03 transition-all text-white/50 hover:text-white/70"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Descargar .txt</span>
          </button>
        </div>
      </div>
    </div>
  )
}
