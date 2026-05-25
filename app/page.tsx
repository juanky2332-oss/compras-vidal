'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/Header'
import InputZone from '@/components/InputZone'
import MaterialCard from '@/components/MaterialCard'
import ExportSAP from '@/components/ExportSAP'
import HistoricoSetup from '@/components/HistoricoSetup'
import { getHistorico, saveHistorico, isHistoricoStale } from '@/lib/indexedDB'
import { buscarMateriales } from '@/lib/fuzzySearch'
import type { HistoricoRow, Recomendacion, Material } from '@/lib/types'
import {
  PackageSearch,
  AlertCircle,
  RotateCcw,
  Cpu,
  ScanText,
  BrainCircuit,
  CheckCheck,
  RefreshCw,
} from 'lucide-react'

type Paso = 'ocr' | 'extraccion' | 'busqueda' | 'razonamiento' | null
type DriveStatus = 'idle' | 'syncing' | 'ok' | 'error-private' | 'error'

interface LogEntry {
  paso: Paso
  texto: string
  ok: boolean
}

export default function HomePage() {
  const [historico, setHistorico] = useState<HistoricoRow[]>([])
  const [historicoCargado, setHistoricoCargado] = useState(false)
  const [driveStatus, setDriveStatus] = useState<DriveStatus>('idle')
  const [driveError, setDriveError] = useState('')
  const [setupOpen, setSetupOpen] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [pasoActual, setPasoActual] = useState<Paso>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [recomendaciones, setRecomendaciones] = useState<Recomendacion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [consultas, setConsultas] = useState<string[]>([])

  // Sincroniza el histórico: primero IndexedDB, si está vacío o antiguo tira de Drive
  const syncHistorico = useCallback(async (force = false) => {
    try {
      // 1. Intentar IndexedDB primero
      const cached = await getHistorico()
      const stale = await isHistoricoStale(6) // más de 6h → refrescar

      if (cached.length > 0 && !stale && !force) {
        setHistorico(cached)
        setHistoricoCargado(true)
        return
      }

      // 2. Bajar de Google Drive (misma fuente que el workflow n8n)
      setDriveStatus('syncing')
      const res = await fetch('/api/historico')
      const data = await res.json()

      if (!res.ok) {
        if (data.needsPublicSheet) {
          setDriveStatus('error-private')
          setDriveError(data.error || 'Sheet privado')
        } else {
          setDriveStatus('error')
          setDriveError(data.error || 'Error al conectar con Drive')
        }
        // Si hay cache vieja, usarla igualmente
        if (cached.length > 0) {
          setHistorico(cached)
          setHistoricoCargado(true)
        }
        return
      }

      const rows: HistoricoRow[] = data.rows || []
      if (rows.length === 0) {
        setDriveStatus('error')
        setDriveError('El Sheet está vacío o no tiene datos legibles')
        return
      }

      // 3. Guardar en IndexedDB como cache local
      await saveHistorico(rows, 'drive')
      setHistorico(rows)
      setHistoricoCargado(true)
      setDriveStatus('ok')
    } catch (e) {
      setDriveStatus('error')
      setDriveError(e instanceof Error ? e.message : 'Error desconocido')
      // usar cache vieja si existe
      const cached = await getHistorico()
      if (cached.length > 0) {
        setHistorico(cached)
        setHistoricoCargado(true)
      }
    }
  }, [])

  // Cargar al montar
  useEffect(() => {
    syncHistorico()
  }, [syncHistorico])

  const handleHistoricoLoaded = useCallback((rows: HistoricoRow[], filas: number) => {
    setHistorico(rows)
    setHistoricoCargado(filas > 0)
    setDriveStatus('ok')
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
          addLog('ocr', `OCR: "${ocrTexto.slice(0, 80)}${ocrTexto.length > 80 ? '…' : ''}"`, true)
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
          `${materiales.length} material${materiales.length > 1 ? 'es' : ''}: ${materiales.map((m) => m.descripcion).join(', ')}`,
          true
        )

        // === PASO 3: FUZZY SEARCH (cliente, contra IndexedDB) ===
        setPasoActual('busqueda')
        // Usar estado en memoria primero, si no hay tirar de IndexedDB (por si acaso)
        const historicoActual = historico.length > 0 ? historico : await getHistorico()
        const fuzzyResults = buscarMateriales(materiales, historicoActual)
        const matchesCount = fuzzyResults.reduce((acc, r) => acc + r.matches.historicoCompras.length, 0)

        if (historicoActual.length === 0) {
          addLog('busqueda', 'Histórico vacío — respuesta sin contexto de compras previas', false)
        } else {
          addLog(
            'busqueda',
            `Histórico: ${historicoActual.length.toLocaleString('es-ES')} filas · ${matchesCount} coincidencias`,
            true
          )
        }

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
        addLog('razonamiento', `ALTO:${altos}  MEDIO:${medios}  BAJO:${bajos}`, true)

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
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99,102,241,0.08) 0%, transparent 70%)',
        }}
      />

      <Header
        historicoCargado={historicoCargado}
        filas={historico.length}
        driveStatus={driveStatus}
        onOpenSetup={() => setSetupOpen(true)}
        onSync={() => syncHistorico(true)}
      />

      {setupOpen && (
        <HistoricoSetup
          onClose={() => setSetupOpen(false)}
          onLoaded={handleHistoricoLoaded}
          filasCargadas={historico.length}
        />
      )}

      <main className="relative max-w-3xl mx-auto px-4 pt-20 pb-16">
        {/* Banner Drive error */}
        {(driveStatus === 'error-private' || driveStatus === 'error') && !historicoCargado && (
          <div className="mt-6 mb-4 p-4 glass rounded-xl border border-amber-500/20 bg-amber-500/04 animate-fade-in">
            <p className="text-sm font-medium text-amber-400">No se pudo conectar con el histórico de Drive</p>
            <p className="text-xs text-amber-400/60 mt-1">{driveError}</p>
            {driveStatus === 'error-private' && (
              <p className="text-xs text-white/40 mt-2">
                Ve a Google Drive → abre el fichero → Compartir → «Cualquiera con el enlace puede ver». Luego pulsa{' '}
                <button
                  onClick={() => syncHistorico(true)}
                  className="underline text-indigo-400 hover:text-indigo-300"
                >
                  Reintentar
                </button>
                {' '}o sube el Excel manualmente con el botón del encabezado.
              </p>
            )}
          </div>
        )}

        {/* Welcome */}
        {recomendaciones.length === 0 && !cargando && (
          <div className="mb-8 pt-6">
            <h1 className="text-2xl font-bold text-white/90 mb-2 tracking-tight">
              Asistente de <span className="gradient-text">Compras Vidal</span>
            </h1>
            <p className="text-sm text-white/40 leading-relaxed max-w-lg">
              Pega un aviso iOCC, describe los materiales o sube una foto. La IA busca en el histórico de compras SAP y te recomienda proveedor y código para cada línea.
            </p>
            {driveStatus === 'syncing' && (
              <div className="mt-3 flex items-center gap-2 text-xs text-indigo-400/70">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Sincronizando histórico desde Google Drive…
              </div>
            )}
            {driveStatus === 'ok' && historicoCargado && (
              <p className="mt-3 text-xs text-emerald-400/60">
                ✓ Histórico sincronizado — {historico.length.toLocaleString('es-ES')} registros listos
              </p>
            )}
          </div>
        )}

        <InputZone onAnalizar={handleAnalizar} cargando={cargando} historicoCargado={historicoCargado} />

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

        {error && (
          <div className="mt-6 flex items-start gap-3 p-4 glass rounded-xl border border-red-500/20 bg-red-500/05 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-400">Error</p>
              <p className="text-xs text-red-400/60 mt-1">{error}</p>
            </div>
          </div>
        )}

        {recomendaciones.length > 0 && (
          <div className="mt-8 space-y-3">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-white/80">
                  {recomendaciones.length} material{recomendaciones.length > 1 ? 'es' : ''} analizados
                </h2>
                <p className="text-xs text-white/30 mt-0.5">Selecciona los que incluir en el pedido SAP</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRecomendaciones((prev) => prev.map((r) => ({ ...r, seleccionado: true })))}
                  className="text-xs text-white/35 hover:text-white/60 px-2 py-1 rounded-lg hover:bg-white/04 transition-colors"
                >
                  Todos
                </button>
                <button
                  onClick={() => setRecomendaciones((prev) => prev.map((r) => ({ ...r, seleccionado: false })))}
                  className="text-xs text-white/35 hover:text-white/60 px-2 py-1 rounded-lg hover:bg-white/04 transition-colors"
                >
                  Ninguno
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 text-xs text-white/25 hover:text-white/50 px-2 py-1 rounded-lg hover:bg-white/04 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Nueva consulta
                </button>
              </div>
            </div>

            {recomendaciones.map((rec, i) => (
              <MaterialCard key={i} rec={rec} index={i} onToggle={handleToggle} />
            ))}

            <div className="mt-6">
              <ExportSAP recomendaciones={recomendaciones} />
            </div>
          </div>
        )}

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
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
