'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/Header'
import InputZone from '@/components/InputZone'
import MaterialCard from '@/components/MaterialCard'
import ExportSAP from '@/components/ExportSAP'
import type { RecomendacionNueva, Material, ItemPedidoUnificado, SeleccionPedido, ProveedorSimple } from '@/lib/types'
import {
  PackageSearch,
  AlertCircle,
  RotateCcw,
  Cpu,
  ScanText,
  BrainCircuit,
  CheckCheck,
  FileText,
  X,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

type Paso = 'ocr' | 'extraccion' | 'busqueda' | 'razonamiento' | null

interface LogEntry { paso: Paso; texto: string; ok: boolean }
interface DbStats { marcas: number; proveedores: number; saps: number }

// ─── Construye el estado inicial de selecciones desde las recomendaciones ───
function construirSeleccionInicial(
  recs: RecomendacionNueva[],
  unificado?: Array<{ indice: number; proveedor_asignado: { nombre: string; codigo: string } | null }>
): SeleccionPedido[] {
  return recs.map((r, i) => {
    const saps = r.codigos_sap_sugeridos || []
    const elegido = saps.find((s) => !s.aproximado) || saps[0]
    const u = unificado?.find((x) => x.indice === i)
    const prov = u?.proveedor_asignado || r.proveedor_recomendado || { nombre: '', codigo: '' }
    return {
      indice: i,
      incluido: r.seleccionado !== false,
      sapElegido: elegido?.codigo || '',
      sapDescripcion: elegido?.descripcion || '',
      sapAproximado: elegido?.aproximado === true,
      proveedorNombre: prov.nombre || '',
      proveedorCodigo: prov.codigo || '',
      cantidad: r.cantidad,
    }
  })
}

export default function HomePage() {
  const [dbStats, setDbStats] = useState<DbStats>({ marcas: 0, proveedores: 0, saps: 0 })
  const [proveedoresDB, setProveedoresDB] = useState<ProveedorSimple[]>([])
  const [cargando, setCargando] = useState(false)
  const [pasoActual, setPasoActual] = useState<Paso>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [recomendaciones, setRecomendaciones] = useState<RecomendacionNueva[]>([])
  const [selecciones, setSelecciones] = useState<SeleccionPedido[]>([])
  const [solicitudCompra, setSolicitudCompra] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [consultas, setConsultas] = useState<string[]>([])
  const [consultaActual, setConsultaActual] = useState<string>('')
  const [solicitudExpandida, setSolicitudExpandida] = useState(false)

  useEffect(() => {
    fetch('/api/dbstats').then(r => r.json()).then(setDbStats).catch(() => {})
    fetch('/api/proveedores').then(r => r.json()).then(setProveedoresDB).catch(() => {})
  }, [])

  const addLog = (paso: Paso, texto: string, ok: boolean) =>
    setLog(prev => [...prev, { paso, texto, ok }])

  // Actualiza una línea de selección por índice
  const actualizarSeleccion = (indice: number, cambios: Partial<SeleccionPedido>) =>
    setSelecciones(prev => prev.map(s => s.indice === indice ? { ...s, ...cambios } : s))

  const handleAnalizar = useCallback(
    async (texto: string, imagen: File | null) => {
      if ((!texto && !imagen) || cargando) return

      setCargando(true)
      setError(null)
      setLog([])
      setRecomendaciones([])
      setSelecciones([])
      setPasoActual(null)

      try {
        // PASO 1: OCR
        let ocrTexto = ''
        if (imagen) {
          setPasoActual('ocr')
          const base64 = await compressImage(imagen)
          const ocrRes = await fetch('/api/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: base64, mimeType: imagen.type }) })
          if (!ocrRes.ok) throw new Error('Error en OCR de imagen')
          const ocrData = await ocrRes.json()
          ocrTexto = ocrData.text || ''
          addLog('ocr', `OCR: "${ocrTexto.slice(0, 80)}${ocrTexto.length > 80 ? '…' : ''}"`, true)
        }

        // PASO 2: EXTRACCIÓN
        setPasoActual('extraccion')
        const consulta = [texto, ocrTexto].filter(Boolean).join('\n').trim()
        if (!consulta) throw new Error('No se pudo extraer texto de la entrada')

        setConsultaActual(consulta)
        const extRes = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consulta }) })
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
        addLog('extraccion', `${materiales.length} material${materiales.length > 1 ? 'es' : ''}: ${materiales.map(m => m.descripcion).join(', ')}`, true)

        // PASO 3: BD
        setPasoActual('busqueda')
        addLog('busqueda', `Consultando base de datos: ${dbStats.saps.toLocaleString('es-ES')} SAPs · ${dbStats.marcas} marcas · ${dbStats.proveedores} proveedores`, true)

        // PASO 4: IA
        setPasoActual('razonamiento')
        const recRes = await fetch('/api/recommend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ materiales }) })
        if (!recRes.ok) throw new Error('Error en recomendación')
        const recData = await recRes.json()
        const recs: RecomendacionNueva[] = (recData.recomendaciones || []).map((r: RecomendacionNueva) => ({ ...r, seleccionado: true }))
        const unificado: ItemPedidoUnificado[] = recData.pedidoUnificado || []

        const altos  = recs.filter(r => r.nivel_confianza === 'ALTO').length
        const medios = recs.filter(r => r.nivel_confianza === 'MEDIO').length
        const bajos  = recs.filter(r => r.nivel_confianza === 'BAJO').length
        addLog('razonamiento', `ALTO: ${altos}  MEDIO: ${medios}  BAJO: ${bajos}`, true)

        setRecomendaciones(recs)
        setSelecciones(construirSeleccionInicial(recs, unificado))
        setConsultas(prev => [consulta.slice(0, 80), ...prev].slice(0, 5))
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
    setRecomendaciones(prev => prev.map((r, i) => i === index ? { ...r, seleccionado: !r.seleccionado } : r))
    setSelecciones(prev => prev.map(s => s.indice === index ? { ...s, incluido: !s.incluido } : s))
  }

  const handleReset = () => {
    setRecomendaciones([])
    setSelecciones([])
    setLog([])
    setError(null)
    setConsultaActual('')
    setSolicitudExpandida(false)
  }

  const PASOS_INFO = {
    ocr:         { icon: ScanText,      label: 'OCR de imagen' },
    extraccion:  { icon: Cpu,           label: 'Extrayendo materiales' },
    busqueda:    { icon: PackageSearch, label: 'Consultando base de datos' },
    razonamiento:{ icon: BrainCircuit,  label: 'Analizando con IA' },
  }

  const incluidas = selecciones.filter(s => s.incluido)

  return (
    <div className="min-h-screen bg-[#08080f]">
      <div className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99,102,241,0.08) 0%, transparent 70%)' }}
      />

      <Header marcas={dbStats.marcas} proveedores={dbStats.proveedores} saps={dbStats.saps} />

      <main className="relative max-w-4xl lg:max-w-[1160px] mx-auto px-5 pt-20 pb-20">

        {/* Welcome */}
        {recomendaciones.length === 0 && !cargando && (
          <div className="mb-10 pt-8">
            <h1 className="text-3xl font-bold text-white/93 mb-3 tracking-tight leading-snug">
              Asistente de <span className="gradient-text">Compras</span>
            </h1>
            <p className="text-base text-white/45 leading-relaxed max-w-xl">
              Escribe o pega tu solicitud de compra. Identifico proveedor, código SAP y alternativas para cada material — todo listo para pegar en SAP.
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

        {/* Log de progreso */}
        {(cargando || log.length > 0) && (
          <div className="mt-6 glass rounded-xl p-4 space-y-2">
            {log.map((entry, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <CheckCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-emerald-400/70" />
                <span className="text-xs text-white/50 leading-relaxed">{entry.texto}</span>
              </div>
            ))}
            {cargando && pasoActual && (() => {
              const info = PASOS_INFO[pasoActual]
              const Icon = info.icon
              return (
                <div className="flex items-center gap-2.5">
                  <Icon className="w-3.5 h-3.5 text-indigo-400 animate-pulse flex-shrink-0" />
                  <span className="text-xs text-indigo-400/80">{info.label}…</span>
                </div>
              )
            })()}
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

        {/* ── RESULTADOS ─────────────────────────────────────────── */}
        {recomendaciones.length > 0 && (
          <div className="mt-8">

            {/* Solicitud original — persiste para no perder el contexto */}
            {consultaActual && (
              <div
                className="mb-5 rounded-xl overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <button
                  onClick={() => setSolicitudExpandida(v => !v)}
                  className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1 font-semibold">Solicitud analizada</p>
                    {/* Chips de artículos identificados */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {recomendaciones.map((rec, i) => {
                        const label = rec.tipo_material && rec.tipo_material !== 'No clasificado'
                          ? rec.tipo_material
                          : rec.material_detectado.replace(/^\d+x\s*/, '')
                        return (
                          <span key={i}
                            className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                            style={{ background: 'rgba(99,102,241,0.12)', color: 'rgba(165,180,252,0.85)', border: '1px solid rgba(99,102,241,0.20)' }}
                          >{label}</span>
                        )
                      })}
                    </div>
                    <p className={`text-xs text-white/40 leading-relaxed ${solicitudExpandida ? '' : 'line-clamp-2'}`}>
                      {consultaActual}
                    </p>
                  </div>
                  <span className="text-white/20 shrink-0 mt-1">
                    {solicitudExpandida ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </span>
                </button>
              </div>
            )}

            {/* Barra de resumen */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-white/80">
                  {recomendaciones.length} material{recomendaciones.length > 1 ? 'es' : ''} analizados
                </h2>
                <p className="text-xs text-white/30 mt-0.5">
                  Elige proveedor y código SAP en cada tarjeta · {incluidas.length} incluida{incluidas.length !== 1 ? 's' : ''} en el pedido
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setRecomendaciones(prev => prev.map(r => ({ ...r, seleccionado: true }))); setSelecciones(prev => prev.map(s => ({ ...s, incluido: true }))) }}
                  className="text-xs text-white/35 hover:text-white/60 px-2 py-1 rounded-lg hover:bg-white/04 transition-colors"
                >Todos</button>
                <button
                  onClick={() => { setRecomendaciones(prev => prev.map(r => ({ ...r, seleccionado: false }))); setSelecciones(prev => prev.map(s => ({ ...s, incluido: false }))) }}
                  className="text-xs text-white/35 hover:text-white/60 px-2 py-1 rounded-lg hover:bg-white/04 transition-colors"
                >Ninguno</button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 text-xs text-white/25 hover:text-white/50 px-2 py-1 rounded-lg hover:bg-white/04 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Nueva consulta
                </button>
              </div>
            </div>

            {/* Layout: tarjetas (izq) + fichas técnicas (der) */}
            <div className="lg:flex lg:gap-5 lg:items-start">

              {/* ── Columna izquierda: tarjetas + export ─────────── */}
              <div className="flex-1 min-w-0 space-y-4">
                {recomendaciones.map((rec, i) => {
                  const sel = selecciones.find(s => s.indice === i)
                  if (!sel) return null
                  return (
                    <MaterialCard
                      key={i}
                      rec={rec}
                      sel={sel}
                      index={i}
                      onToggle={handleToggle}
                      onSelChange={(cambios) => actualizarSeleccion(i, cambios)}
                      proveedoresDB={proveedoresDB}
                    />
                  )
                })}

                {/* ── Nº Solicitud de Compra + Export ────────── */}
                {incluidas.length > 0 && (
                  <div className="mt-6 space-y-3">
                    <div
                      className="flex items-center gap-3 px-4 py-3 rounded-xl"
                      style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}
                    >
                      <FileText className="w-4 h-4 text-indigo-400/60 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-indigo-300/50 uppercase tracking-widest mb-0.5">Nº Solicitud de Compra (SC)</p>
                        <input
                          type="text"
                          value={solicitudCompra}
                          onChange={e => setSolicitudCompra(e.target.value)}
                          placeholder="Pega aquí el nº de solicitud SAP… ej: 1000012345"
                          className="w-full text-sm text-white/80 bg-transparent placeholder-white/20 outline-none"
                        />
                      </div>
                      {solicitudCompra && (
                        <button onClick={() => setSolicitudCompra('')} className="text-white/25 hover:text-white/50 shrink-0 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <ExportSAP selecciones={selecciones} solicitudCompra={solicitudCompra} />
                  </div>
                )}
              </div>

              {/* ── Columna derecha: fichas técnicas (sticky) ─────── */}
              <div className="hidden lg:block w-56 shrink-0">
                <div className="sticky top-24 space-y-3">
                  <div className="flex items-center gap-2 px-1 mb-1">
                    <BookOpen className="w-3 h-3 text-white/20" />
                    <p className="text-[10px] text-white/25 uppercase tracking-widest font-semibold">Fichas técnicas</p>
                  </div>
                  {recomendaciones.map((rec, i) => (
                    <div
                      key={i}
                      className="rounded-xl p-3 space-y-2"
                      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
                    >
                      {/* Nombre / tipo */}
                      <p className="text-[11px] font-semibold text-white/70 leading-snug">
                        {rec.tipo_material && rec.tipo_material !== 'No clasificado'
                          ? rec.tipo_material
                          : rec.material_detectado.replace(/^\d+x\s*/, '')}
                      </p>

                      {rec.ficha_tecnica ? (
                        <>
                          <p className="text-[11px] text-white/48 leading-relaxed">{rec.ficha_tecnica.descripcion}</p>
                          <p className="text-[10px] text-white/32 leading-relaxed italic">{rec.ficha_tecnica.uso}</p>
                          {rec.ficha_tecnica.datos_clave.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {rec.ficha_tecnica.datos_clave.map((d, di) => (
                                <span key={di}
                                  className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                                  style={{ background: 'rgba(99,102,241,0.10)', color: 'rgba(165,180,252,0.65)', border: '1px solid rgba(99,102,241,0.15)' }}
                                >{d}</span>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-[10px] text-white/22 italic">{rec.motivo?.slice(0, 100) || 'Analizando…'}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Consultas recientes */}
        {consultas.length > 0 && recomendaciones.length === 0 && !cargando && (
          <div className="mt-8">
            <p className="text-xs text-white/20 mb-3 font-medium">Consultas recientes:</p>
            <div className="space-y-1.5">
              {consultas.map((q, i) => (
                <button key={i} onClick={() => handleAnalizar(q, null)} disabled={cargando}
                  className="w-full text-left text-xs text-white/35 hover:text-white/55 px-3 py-2 rounded-lg border border-white/05 hover:border-white/10 hover:bg-white/02 transition-all truncate disabled:opacity-30">
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
      canvas.width = width; canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1])
    }
    img.onerror = reject
    img.src = url
  })
}
