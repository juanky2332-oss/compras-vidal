'use client'

// ─────────────────────────────────────────────────────────────────────────
//  Stepper visual del análisis del asistente: OCR → Materiales → BD → IA.
//  Sustituye al log plano; el detalle de cada paso se muestra debajo.
// ─────────────────────────────────────────────────────────────────────────

import { ScanText, Cpu, PackageSearch, BrainCircuit, Check, X } from 'lucide-react'

export type Paso = 'ocr' | 'extraccion' | 'busqueda' | 'razonamiento' | null

export interface LogEntry {
  paso: Paso
  texto: string
  ok: boolean
}

const PASOS: Array<{ id: Exclude<Paso, null>; icon: typeof Cpu; label: string }> = [
  { id: 'ocr', icon: ScanText, label: 'Leer imagen' },
  { id: 'extraccion', icon: Cpu, label: 'Materiales' },
  { id: 'busqueda', icon: PackageSearch, label: 'Base de datos' },
  { id: 'razonamiento', icon: BrainCircuit, label: 'Análisis IA' },
]

export default function ProgresoAnalisis({
  pasoActual,
  log,
  cargando,
}: {
  pasoActual: Paso
  log: LogEntry[]
  cargando: boolean
}) {
  // El paso OCR solo aparece si la consulta llevaba imagen
  const usaOcr = pasoActual === 'ocr' || log.some((l) => l.paso === 'ocr')
  const pasos = PASOS.filter((p) => p.id !== 'ocr' || usaOcr)

  const idxActual = pasoActual ? pasos.findIndex((p) => p.id === pasoActual) : -1
  const fallo = log.find((l) => !l.ok)

  const estadoDe = (i: number): 'hecho' | 'activo' | 'error' | 'pendiente' => {
    if (fallo && pasos[i].id === fallo.paso) return 'error'
    if (cargando && i === idxActual) return 'activo'
    if (idxActual >= 0 && i < idxActual) return 'hecho'
    if (!cargando && log.some((l) => l.paso === pasos[i].id && l.ok)) return 'hecho'
    if (!cargando && !fallo && log.length > 0) return 'hecho' // análisis terminado con éxito
    return 'pendiente'
  }

  return (
    <div className="mt-6 glass rounded-2xl p-5 animate-fade-in">
      {/* Stepper */}
      <div className="flex items-center">
        {pasos.map((p, i) => {
          const estado = estadoDe(i)
          const color =
            estado === 'hecho' ? '#34d399'
            : estado === 'activo' ? '#818cf8'
            : estado === 'error' ? '#f87171'
            : 'rgba(255,255,255,0.18)'
          return (
            <div key={p.id} className={`flex items-center ${i < pasos.length - 1 ? 'flex-1' : ''}`}>
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${estado === 'activo' ? 'animate-pulse' : ''}`}
                  style={{
                    background: estado === 'pendiente' ? 'rgba(255,255,255,0.03)' : `${color}1a`,
                    border: `1px solid ${estado === 'pendiente' ? 'rgba(255,255,255,0.08)' : color + '55'}`,
                  }}
                >
                  {estado === 'hecho' ? (
                    <Check className="w-4 h-4" style={{ color }} />
                  ) : estado === 'error' ? (
                    <X className="w-4 h-4" style={{ color }} />
                  ) : (
                    <p.icon className="w-4 h-4" style={{ color }} />
                  )}
                </div>
                <span
                  className="text-[10px] font-medium whitespace-nowrap"
                  style={{ color: estado === 'pendiente' ? 'rgba(255,255,255,0.22)' : color }}
                >
                  {p.label}
                </span>
              </div>
              {i < pasos.length - 1 && (
                <div className="flex-1 h-px mx-2 -mt-5 transition-colors duration-300"
                  style={{ background: estadoDe(i) === 'hecho' ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.07)' }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Detalle */}
      {log.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/[0.05] space-y-1.5">
          {log.map((entry, i) => (
            <div key={i} className="flex items-start gap-2.5">
              {entry.ok
                ? <Check className="w-3 h-3 mt-0.5 flex-shrink-0 text-emerald-400/60" />
                : <X className="w-3 h-3 mt-0.5 flex-shrink-0 text-red-400/70" />}
              <span className="text-xs text-white/45 leading-relaxed">{entry.texto}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
