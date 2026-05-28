'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/Header'
import InputZone from '@/components/InputZone'
import MaterialCard from '@/components/MaterialCard'
import ExportSAP from '@/components/ExportSAP'
import type { RecomendacionNueva, Material, ItemPedidoUnificado } from '@/lib/types'
import {
  PackageSearch,
  AlertCircle,
  RotateCcw,
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

interface DbStats {
  marcas: number
  proveedores: number
  saps: number
}

export default function HomePage() {
  const [dbStats, setDbStats] = useState<DbStats>({ marcas: 0, proveedores: 0, saps: 0 })
  const [cargando, setCargando] = useState(false)
  const [pasoActual, setPasoActual] = useState<Paso>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [recomendaciones, setRecomendaciones] = useState<RecomendacionNueva[]>([])
  const [pedidoUnificado, setPedidoUnificado] = useState<ItemPedidoUnificado[]>([])
  const [error, setError] = useState<string | null>(null)
  const [consultas, setConsultas] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/dbstats')
      .then((r) => r.json())
      .then((data) => setDbStats(data))
      .catch(() => {})
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
      setPedidoUnificado([])
      setPasoActual(null)

      try {
        // === PASO 1: OCR ===
        let ocrTexto = ''
        if (imagen) {
          setPasoActual('ocr')
          const base64 = await compressImage(imagen)
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

        // === PASO 3: CONSULTA BASE DE DATOS (5 pasos) ===
        setPasoActual('busqueda')
        addLog('busqueda', `Consultando base de datos: ${dbStats.saps.toLocaleString('es-ES')} SAPs · ${dbStats.marcas} marcas · ${dbStats.proveedores} proveedores`, true)

        // === PASO 4: RECOMENDACIÓN IA ===
        setPasoActual('razonamiento')
        const recRes = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ materiales }),
        })
        if (!recRes.ok) throw new Error('Error en recomendación')
        const recData = await recRes.json()
        const recs: RecomendacionNueva[] = (recData.recomendaciones || []).map((r: RecomendacionNueva) => ({
          ...r,
          seleccionado: true,
        }))

        // Pedido unificado por proveedor (viene del nuevo motor)
        const unificado: ItemPedidoUnificado[] = recData.pedidoUnificado || []

        const altos = recs.filter((r) => r.nivel_confianza === 'ALTO').length
        const medios = recs.filter((r) => r.nivel_confianza === 'MEDIO').length
        const bajos = recs.filter((r) => r.nivel_confianza === 'BAJO').length
        addLog('razonamiento', `ALTO: ${altos}  MEDIO: ${medios}  BAJO: ${bajos}`, true)

        setRecomendaciones(recs)
        setPedidoUnificado(unificado)
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
    [cargando, dbStats, pasoActual]
  )

  const handleToggle = (index: number) => {
    setRecomendaciones((prev) =>
      prev.map((r, i) => (i === index ? { ...r, seleccionado: !r.seleccionado } : r))
    )
  }

  const handleReset = () => {
    setRecomendaciones([])
    setPedidoUnificado([])
    setLog([])
    setError(null)
  }

  const PASOS_INFO = {
    ocr: { icon: ScanText, label: 'OCR de imagen' },
    extraccion: { icon: Cpu, label: 'Extrayendo materiales' },
    busqueda: { icon: PackageSearch, label: 'Consultando base de datos' },
    razonamiento: { icon: BrainCircuit, label: 'Analizando con IA' },
  }

  return (
    <div className="min-h-screen bg-[#08080f]">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99,102,241,0.08) 0%, transparent 70%)',
        }}
      />

      <Header marcas={dbStats.marcas} proveedores={dbStats.proveedores} saps={dbStats.saps} />

      <main className="relative max-w-4xl mx-auto px-5 pt-20 pb-20">
        {/* Welcome */}
        {recomendaciones.length === 0 && !cargando && (
          <div className="mb-10 pt-8">
            <h1 className="text-3xl font-bold text-white/93 mb-3 tracking-tight leading-snug">
              Asistente de <span className="gradient-text">Compras</span>
            </h1>
            <p className="text-base text-white/45 leading-relaxed max-w-xl">
              Escribe o pega aquí tu solicitud de compra. Te identifico el proveedor habitual, el código SAP y las alternativas para cada material.
            </p>
            {dbStats.saps > 0 && (
              <p className="mt-4 text-sm text-emerald-400/55 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 inline-block" />
                Base de datos activa — {dbStats.saps.toLocaleString('es-ES')} referencias SAP · {dbStats.marcas} marcas · {dbStats.proveedores} proveedores
              </p>
            )}
          </div>
        )}

        <InputZone onAnalizar={handleAnalizar} cargando={cargando} historicoCargado={dbStats.saps > 0} />

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
              <ExportSAP recomendaciones={recomendaciones} pedidoUnificado={pedidoUnificado} />
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

// Comprime imagen antes de OCR para reducir payload
async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 1200
      let { width, height } = img
      if (width > MAX || height > MAX) {
        const ratio = Math.min(MAX / width, MAX / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1])
    }
    img.onerror = reject
    img.src = url
  })
}
