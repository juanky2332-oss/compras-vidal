'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/Header'
import InputZone from '@/components/InputZone'
import MaterialCard from '@/components/MaterialCard'
import ExportSAP from '@/components/ExportSAP'
import HistoricoSetup from '@/components/HistoricoSetup'
import { getHistorico } from '@/lib/indexedDB'
import { buscarMateriales } from '@/lib/fuzzySearch'
import type { HistoricoRow, Recomendacion, Material } from '@/lib/types'
import {
  PackageSearch,
  AlertCircle,
  RotateCcw,
  ChevronRight,
  Cpu,
  ScanText,
  BrainCircuit,
  CheckCheck,
} from 'lucide-react'

type Paso = 'ocr' | 'extraccion' | 'busqueda' | 'razonamiento' | null

interface LogEntry {
  paso: Paso
  texto: string
  ok: boolean
}

export default function HomePage() {
  const [historico, setHistorico] = useState<HistoricoRow[]>([])
  const [historicoCargado, setHistoricoCargado] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [pasoActual, setPasoActual] = useState<Paso>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [recomendaciones, setRecomendaciones] = useState<Recomendacion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [consultas, setConsultas] = useState<string[]>([])

  // Cargar histórico desde IndexedDB al montar
  useEffect(() => {
    getHistorico().then((rows) => {
      if (rows.length > 0) {
        setHistorico(rows)
        setHistoricoCargado(true)
      }
    })
  }, [])

  const handleHistoricoLoaded = useCallback((rows: HistoricoRow[], filas: number) => {
    setHistorico(rows)
    setHistoricoCargado(filas > 0)
    setSetupOpen(false)
  }, [])

  const addLog = (paso: Paso, texto: string, ok: boolean) => {
    setLog((prev) => [...prev, { paso, texto, ok }])
  }

  const handleAnalizar = useCallback(
    async (texto: string, imagen: File | null) => {
      if ((!texto && !imagen) || cargando) return

      setCargando(true)
      setError(null)
      setLog([])
      setRecomendaciones([])
      setPasoActual(null)

      try {
        // === PASO 1: OCR ===
        let ocrTexto = ''
        if (imagen) {
          setPasoActual('ocr')
          const base64 = await fileToBase64(imagen)
          const ocrRes = await fetch('/api/ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64, mimeType: imagen.type }),
          })
          if (!ocrRes.ok) throw new Error('Error en OCR de imagen')
          const ocrData = await ocrRes.json()
          ocrTexto = ocrData.text || ''
          addLog('ocr', `OCR completado: "${ocrTexto.slice(0, 80)}${ocrTexto.length > 80 ? '…' : ''}"`, true)
        }

        // === PASO 2: EXTRACCIÓN ===
        setPasoActual('extraccion')
        const consulta = [texto, ocrTexto].filter(Boolean).join('\n').trim()
        if (!consulta) throw new Error('No se pudo extraer texto de la entrada')

        const extRes = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consulta }),
        })
        if (!extRes.ok) throw new Error('Error en extracción de materiales')
        const extData = await extRes.json()
        const materiales: Material[] = extData.materiales || []

        if (materiales.length === 0) {
          addLog('extraccion', 'No se identificaron materiales en el texto', false)
          setError('No se identificaron materiales físicos. Intenta ser más específico o adjunta una imagen.')
          setCargando(false)
          setPasoActual(null)
          return
        }

        addLog(
          'extraccion',
          `${materiales.length} material${materiales.length > 1 ? 'es' : ''} detectado${materiales.length > 1 ? 's' : ''}: ${materiales.map((m) => m.descripcion).join(', ')}`,
          true
        )

        // === PASO 3: FUZZY SEARCH (cliente) ===
        setPasoActual('busqueda')
        const historicoActual = historico.length > 0 ? historico : await getHistorico()
        const fuzzyResults = buscarMateriales(materiales, historicoActual)
        const matchesCount = fuzzyResults.reduce((acc, r) => acc + r.matches.historicoCompras.length, 0)
        addLog(
          'busqueda',
          historicoActual.length === 0
            ? 'Sin histórico cargado — el razonador trabajará sin contexto'
            : `Búsqueda en ${historicoActual.length.toLocaleString('es-ES')} filas — ${matchesCount} coincidencias encontradas`,
          historicoActual.length > 0
        )

        // === PASO 4: RAZONAMIENTO IA ===
        setPasoActual('razonamiento')
        const reasonRes = await fetch('/api/reason', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fuzzyResults }),
        })
        if (!reasonRes.ok) throw new Error('Error en razonamiento IA')
        const reasonData = await reasonRes.json()
        const recs: Recomendacion[] = (reasonData.recomendaciones || []).map((r: Recomendacion) => ({
          ...r,
          seleccionado: true,
        }))

        const altos = recs.filter((r) => r.nivel_confianza === 'ALTO').length
        const medios = recs.filter((r) => r.nivel_confianza === 'MEDIO').length
        const bajos = recs.filter((r) => r.nivel_confianza === 'BAJO').length
        addLog(
          'razonamiento',
          `${recs.length} recomendación${recs.length > 1 ? 'es' : ''} → ALTO:${altos} MEDIO:${medios} BAJO:${bajos}`,
          true
        )

        setRecomendaciones(recs)
        setConsultas((prev) => [consulta.slice(0, 80), ...prev].slice(0, 5))
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error desconocido'
        addLog(pasoActual, msg, false)
        setError(msg)
      } finally {
        setCargando(false)
        setPasoActual(null)
      }
    },
    [cargando, historico, pasoActual]
  )

  const handleToggle = (index: number) => {
    setRecomendaciones((prev) =>
      prev.map((r, i) => (i === index ? { ...r, seleccionado: !r.seleccionado } : r))
    )
  }

  const handleReset = () => {
    setRecomendaciones([])
    setLog([])
    setError(null)
  }

  const PASOS_INFO = {
    ocr: { icon: ScanText, label: 'OCR de imagen' },
    extraccion: { icon: Cpu, label: 'Extrayendo materiales' },
    busqueda: { icon: PackageSearch, label: 'Búsqueda en histórico' },
    razonamiento: { icon: BrainCircuit, label: 'Razonando con IA' },
  }

  return (
    <div className="min-h-screen bg-[#08080f]">
      {/* Background gradient */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99,102,241,0.08) 0%, transparent 70%)',
        }}
      />

      <Header
        historicoCargado={historicoCargado}
        filas={historico.length}
        onOpenSetup={() => setSetupOpen(true)}
      />

      {/* Setup modal */}
      {setupOpen && (
        <HistoricoSetup
          onClose={() => setSetupOpen(false)}
          onLoaded={handleHistoricoLoaded}
          filasCargadas={historico.length}
        />
      )}

      <main className="relative max-w-3xl mx-auto px-4 pt-20 pb-16">
        {/* Welcome banner — solo si no hay resultados */}
        {recomendaciones.length === 0 && !cargando && (
          <div className="mb-8 pt-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Beta
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white/90 mb-2 tracking-tight">
              Asistente de{' '}
              <span className="gradient-text">Compras Vidal</span>
            </h1>
            <p className="text-sm text-white/40 leading-relaxed max-w-lg">
              Pega un aviso iOCC, describe los materiales o sube una foto. La IA analiza el histórico de
              compras y recomienda proveedor y código SAP para cada material.
            </p>

            {!historicoCargado && (
              <button
                onClick={() => setSetupOpen(true)}
                className="mt-4 flex items-center gap-2 text-sm text-amber-400/70 hover:text-amber-400 transition-colors group"
              >
                <span className="w-2 h-2 rounded-full bg-amber-400/60 animate-pulse-slow" />
                Carga el histórico Excel para obtener recomendaciones SAP
                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}
          </div>
        )}

        {/* Input zone */}
        <InputZone
          onAnalizar={handleAnalizar}
          cargando={cargando}
          historicoCargado={historicoCargado}
        />

        {/* Progress log */}
        {(cargando || log.length > 0) && (
          <div className="mt-6 glass rounded-xl p-4 space-y-2">
            {log.map((entry, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <CheckCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-emerald-400/70" />
                <span className="text-xs text-white/50 leading-relaxed">{entry.texto}</span>
              </div>
            ))}
            {cargando && pasoActual && (
              <div className="flex items-center gap-2.5">
                {(() => {
                  const info = PASOS_INFO[pasoActual]
                  const Icon = info.icon
                  return (
                    <>
                      <Icon className="w-3.5 h-3.5 text-indigo-400 animate-pulse flex-shrink-0" />
                      <span className="text-xs text-indigo-400/80">{info.label}…</span>
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-6 flex items-start gap-3 p-4 glass rounded-xl border border-red-500/20 bg-red-500/05 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-400">Error en el análisis</p>
              <p className="text-xs text-red-400/60 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Resultados */}
        {recomendaciones.length > 0 && (
          <div className="mt-8 space-y-3">
            {/* Header resultados */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-white/80">
                  {recomendaciones.length} material{recomendaciones.length > 1 ? 'es' : ''} analizados
                </h2>
                <p className="text-xs text-white/30 mt-0.5">
                  Selecciona los que quieres incluir en el pedido SAP
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setRecomendaciones((prev) => prev.map((r) => ({ ...r, seleccionado: true })))
                  }
                  className="text-xs text-white/35 hover:text-white/60 transition-colors px-2 py-1 rounded-lg hover:bg-white/04"
                >
                  Todos
                </button>
                <button
                  onClick={() =>
                    setRecomendaciones((prev) => prev.map((r) => ({ ...r, seleccionado: false })))
                  }
                  className="text-xs text-white/35 hover:text-white/60 transition-colors px-2 py-1 rounded-lg hover:bg-white/04"
                >
                  Ninguno
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 text-xs text-white/25 hover:text-white/50 transition-colors px-2 py-1 rounded-lg hover:bg-white/04"
                >
                  <RotateCcw className="w-3 h-3" />
                  Nueva consulta
                </button>
              </div>
            </div>

            {/* Cards */}
            {recomendaciones.map((rec, i) => (
              <MaterialCard key={i} rec={rec} index={i} onToggle={handleToggle} />
            ))}

            {/* Export SAP */}
            <div className="mt-6">
              <ExportSAP recomendaciones={recomendaciones} />
            </div>
          </div>
        )}

        {/* Consultas recientes */}
        {consultas.length > 0 && recomendaciones.length === 0 && !cargando && (
          <div className="mt-8">
            <p className="text-xs text-white/20 mb-3 font-medium">Consultas recientes:</p>
            <div className="space-y-1.5">
              {consultas.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleAnalizar(q, null)}
                  disabled={cargando}
                  className="w-full text-left text-xs text-white/35 hover:text-white/55 px-3 py-2 rounded-lg border border-white/05 hover:border-white/10 hover:bg-white/02 transition-all truncate disabled:opacity-30"
                >
                  {q}…
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
