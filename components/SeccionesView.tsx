'use client'

// ─────────────────────────────────────────────────────────────────────────
//  Vista SECCIONES — histórico de compras por departamento de fábrica.
//  Independiente del asistente: los datos viven en localStorage del navegador.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Factory, Plus, ArrowLeft, Trash2, Pencil, Check, X, Search,
  Download, Upload, Package, Coins, CalendarDays, List, Layers3,
  FileSpreadsheet, Cloud, CloudOff, RefreshCw,
} from 'lucide-react'
import type { Seccion, CompraSeccion, FilaHistorico } from '@/lib/secciones'
import {
  cargarSecciones, guardarSecciones, nuevoId, hoyISO, statsSeccion,
  agruparPorArticulo, fmtEUR, fmtFecha, exportarCSVSeccion,
  exportarBackupJSON, parsearBackupJSON, COLORES_SECCION,
  compraAFila, reconciliarConNube,
} from '@/lib/secciones'
import { listarNube, subirFilas, cargarPendientes } from '@/lib/syncHistorico'
import { EMPRESAS, EMPRESA_DEFAULT, empresaInfo, normalizarEmpresa } from '@/lib/empresas'
import type { SapSearchResult } from '@/lib/types'

type EstadoSync = 'cargando' | 'ok' | 'sin-nube' | 'error'

export default function SeccionesView() {
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [cargado, setCargado] = useState(false)
  const [seccionActiva, setSeccionActiva] = useState<string | null>(null)
  const [creandoSeccion, setCreandoSeccion] = useState(false)
  const [nombreNueva, setNombreNueva] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  // ── Sincronización con Google Sheets ────────────────────────────────────
  const [sync, setSync] = useState<EstadoSync>('cargando')
  const pushCola = useRef<Map<string, FilaHistorico>>(new Map())
  const pushTimer = useRef<ReturnType<typeof setTimeout>>()

  // Agrupa cambios (ej. teclear un precio) y los sube en un solo envío
  const programarPush = useCallback((filas: FilaHistorico[]) => {
    for (const f of filas) pushCola.current.set(f.id, f)
    clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(async () => {
      const enviar = Array.from(pushCola.current.values())
      pushCola.current.clear()
      const ok = await subirFilas(enviar)
      setSync((prev) => (prev === 'sin-nube' ? prev : ok ? 'ok' : 'error'))
    }, 1000)
  }, [])

  useEffect(() => {
    const local = cargarSecciones()
    setSecciones(local)
    setCargado(true)
    ;(async () => {
      const res = await listarNube()
      if (res === null) { setSync('error'); return }
      if (!res.configurado) { setSync('sin-nube'); return }
      const { secciones: fusionadas, pendientes } = reconciliarConNube(local, res.rows)
      guardarSecciones(fusionadas)
      setSecciones(fusionadas)
      setSync('ok')
      // subir lo que la nube aún no conoce + reintentos de sesiones anteriores
      const porSubir = [...cargarPendientes(), ...pendientes]
      if (porSubir.length) {
        const ok = await subirFilas(porSubir)
        if (!ok) setSync('error')
      }
    })()
  }, [])

  // Persistir cada cambio
  const actualizar = (fn: (prev: Seccion[]) => Seccion[]) => {
    setSecciones((prev) => {
      const next = fn(prev)
      guardarSecciones(next)
      return next
    })
  }

  const crearSeccion = () => {
    const nombre = nombreNueva.trim()
    if (!nombre) return
    const nueva: Seccion = {
      id: nuevoId(),
      nombre,
      color: COLORES_SECCION[secciones.length % COLORES_SECCION.length],
      compras: [],
      creadaEn: new Date().toISOString(),
    }
    actualizar((prev) => [...prev, nueva])
    setNombreNueva('')
    setCreandoSeccion(false)
    setSeccionActiva(nueva.id)
  }

  const handleImport = async (file: File) => {
    const texto = await file.text()
    const parsed = parsearBackupJSON(texto)
    if (!parsed) {
      alert('El fichero no es un backup válido de secciones.')
      return
    }
    if (!confirm(`El backup contiene ${parsed.length} secciones. ¿Reemplazar TODAS las secciones actuales por las del backup?`)) return
    actualizar(() => parsed)
    setSeccionActiva(null)
    // subir todo el backup a la nube (upsert por id: no duplica)
    programarPush(parsed.flatMap((s) => s.compras.map((c) => compraAFila(s.nombre, c))))
  }

  if (!cargado) return null

  const activa = secciones.find((s) => s.id === seccionActiva) || null

  // ══ DETALLE DE UNA SECCIÓN ══════════════════════════════════════════════
  if (activa) {
    return (
      <SeccionDetalle
        seccion={activa}
        onVolver={() => setSeccionActiva(null)}
        onCambiar={(cambios) =>
          actualizar((prev) => prev.map((s) => (s.id === activa.id ? { ...s, ...cambios } : s)))
        }
        onEliminar={() => {
          // borrado lógico en la nube de todas sus compras
          programarPush(activa.compras.map((c) => compraAFila(activa.nombre, c, 'borrada')))
          actualizar((prev) => prev.filter((s) => s.id !== activa.id))
          setSeccionActiva(null)
        }}
        onSyncPush={programarPush}
      />
    )
  }

  // ══ LISTADO DE SECCIONES ════════════════════════════════════════════════
  const totalGasto = secciones.reduce((acc, s) => acc + statsSeccion(s).gastoAprox, 0)
  const totalCompras = secciones.reduce((acc, s) => acc + s.compras.length, 0)

  return (
    <div className="pt-8 animate-fade-in">
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white/93 mb-2 tracking-tight leading-snug">
            Secciones de <span className="gradient-text">fábrica</span>
          </h1>
          <p className="text-base text-white/45 leading-relaxed max-w-xl">
            Histórico de compras por departamento: artículos, códigos SAP, precios y cantidades.
          </p>
          {totalCompras > 0 && (
            <p className="mt-3 text-sm text-white/35">
              {totalCompras} compra{totalCompras !== 1 ? 's' : ''} registradas
              {totalGasto > 0 && <> · gasto aprox. total <span className="text-emerald-400/70 font-medium">{fmtEUR(totalGasto)}</span></>}
            </p>
          )}
        </div>
        {/* Estado nube + Backup */}
        <div className="flex items-center gap-2">
          {sync === 'ok' && (
            <span title="Histórico sincronizado con Google Sheets (historico vidal)" className="flex items-center gap-1.5 text-xs text-emerald-400/70 px-3 py-2 rounded-lg border border-emerald-500/15 bg-emerald-500/05">
              <Cloud className="w-3.5 h-3.5" /> Nube
            </span>
          )}
          {sync === 'cargando' && (
            <span title="Sincronizando con Google Sheets…" className="flex items-center gap-1.5 text-xs text-white/35 px-3 py-2 rounded-lg border border-white/08">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Sincronizando…
            </span>
          )}
          {sync === 'error' && (
            <span title="No se pudo conectar con Google Sheets — los cambios se guardan en local y se reintentarán" className="flex items-center gap-1.5 text-xs text-amber-400/70 px-3 py-2 rounded-lg border border-amber-500/15 bg-amber-500/05">
              <CloudOff className="w-3.5 h-3.5" /> Sin conexión
            </span>
          )}
          <button
            onClick={() => exportarBackupJSON(secciones)}
            title="Descargar copia de seguridad de todas las secciones (JSON)"
            className="flex items-center gap-1.5 text-xs text-white/35 hover:text-white/60 px-3 py-2 rounded-lg border border-white/08 hover:border-white/15 transition-all"
          >
            <Download className="w-3.5 h-3.5" /> Backup
          </button>
          <input
            ref={importRef} type="file" accept=".json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = '' }}
          />
          <button
            onClick={() => importRef.current?.click()}
            title="Restaurar copia de seguridad (reemplaza lo actual)"
            className="flex items-center gap-1.5 text-xs text-white/35 hover:text-white/60 px-3 py-2 rounded-lg border border-white/08 hover:border-white/15 transition-all"
          >
            <Upload className="w-3.5 h-3.5" /> Restaurar
          </button>
        </div>
      </div>

      {/* Grid de secciones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {secciones.map((s) => {
          const st = statsSeccion(s)
          return (
            <button
              key={s.id}
              onClick={() => setSeccionActiva(s.id)}
              className="text-left rounded-2xl p-4 border transition-all duration-150 hover:scale-[1.015] group"
              style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${s.color}1f`, border: `1px solid ${s.color}40` }}
                >
                  <Factory className="w-4 h-4" style={{ color: s.color }} />
                </div>
                <span className="text-sm font-semibold text-white/85 group-hover:text-white truncate">{s.nombre}</span>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-white/40">
                  {st.articulos === 0
                    ? <span className="text-white/22 italic">Sin compras registradas</span>
                    : <>{st.articulos} compra{st.articulos !== 1 ? 's' : ''} · {st.unidades.toLocaleString('es-ES')} uds.</>}
                </p>
                {st.gastoAprox > 0 && (
                  <p className="text-xs text-emerald-400/60 font-medium">≈ {fmtEUR(st.gastoAprox)}</p>
                )}
                {st.ultimaFecha && (
                  <p className="text-[10px] text-white/25">Última: {fmtFecha(st.ultimaFecha)}</p>
                )}
              </div>
            </button>
          )
        })}

        {/* Nueva sección */}
        {creandoSeccion ? (
          <div
            className="rounded-2xl p-4 border flex flex-col justify-center gap-2"
            style={{ background: 'rgba(99,102,241,0.05)', borderColor: 'rgba(99,102,241,0.3)' }}
          >
            <input
              autoFocus
              value={nombreNueva}
              onChange={(e) => setNombreNueva(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') crearSeccion(); if (e.key === 'Escape') { setCreandoSeccion(false); setNombreNueva('') } }}
              placeholder="Nombre de la sección…"
              className="w-full text-sm bg-transparent text-white/85 placeholder-white/25 outline-none border-b border-white/15 pb-1.5"
            />
            <div className="flex items-center gap-2">
              <button onClick={crearSeccion} className="flex items-center gap-1 text-xs text-emerald-400/80 hover:text-emerald-400 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <Check className="w-3 h-3" /> Crear
              </button>
              <button onClick={() => { setCreandoSeccion(false); setNombreNueva('') }} className="text-xs text-white/30 hover:text-white/55 px-2 py-1">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCreandoSeccion(true)}
            className="rounded-2xl p-4 border border-dashed flex items-center justify-center gap-2 text-white/30 hover:text-white/60 hover:border-white/25 transition-all min-h-[104px]"
            style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'transparent' }}
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">Nueva sección</span>
          </button>
        )}
      </div>

      <p className="mt-6 text-[11px] text-white/22 leading-relaxed max-w-2xl">
        {sync === 'ok'
          ? <>Cada compra se sincroniza automáticamente con el Google Sheet <span className="text-white/40">historico vidal</span> — disponible desde cualquier equipo. <span className="text-white/40">Backup</span> descarga además una copia local.</>
          : <>Los datos se guardan en este navegador. Usa <span className="text-white/40">Backup</span> de vez en cuando para descargar una copia (y <span className="text-white/40">Restaurar</span> para recuperarla o pasarla a otro equipo).</>}
      </p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  DETALLE DE SECCIÓN
// ═══════════════════════════════════════════════════════════════════════════

function SeccionDetalle({
  seccion, onVolver, onCambiar, onEliminar, onSyncPush,
}: {
  seccion: Seccion
  onVolver: () => void
  onCambiar: (cambios: Partial<Seccion>) => void
  onEliminar: () => void
  onSyncPush: (filas: FilaHistorico[]) => void
}) {
  const [renombrando, setRenombrando] = useState(false)
  const [nombreEdit, setNombreEdit] = useState(seccion.nombre)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [modo, setModo] = useState<'historico' | 'articulos'>('historico')

  const st = statsSeccion(seccion)

  const comprasFiltradas = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    const base = [...seccion.compras].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id))
    if (!q) return base
    return base.filter((c) =>
      c.descripcion.toLowerCase().includes(q) || c.sapCodigo.includes(q) ||
      (c.proveedor || '').toLowerCase().includes(q) || normalizarEmpresa(c.empresa).toLowerCase().includes(q)
    )
  }, [seccion.compras, filtro])

  const agrupados = useMemo(() => {
    const todos = agruparPorArticulo(seccion.compras)
    const q = filtro.trim().toLowerCase()
    if (!q) return todos
    return todos.filter((a) => a.descripcion.toLowerCase().includes(q) || a.sapCodigo.includes(q))
  }, [seccion.compras, filtro])

  const añadirCompra = (c: Omit<CompraSeccion, 'id'>) => {
    const nueva: CompraSeccion = { ...c, id: nuevoId() }
    onCambiar({ compras: [...seccion.compras, nueva] })
    onSyncPush([compraAFila(seccion.nombre, nueva)])
  }

  const actualizarCompra = (id: string, cambios: Partial<CompraSeccion>) => {
    const nuevas = seccion.compras.map((c) => (c.id === id ? { ...c, ...cambios } : c))
    onCambiar({ compras: nuevas })
    const modificada = nuevas.find((c) => c.id === id)
    if (modificada) onSyncPush([compraAFila(seccion.nombre, modificada)])
  }

  const eliminarCompra = (id: string) => {
    const borrada = seccion.compras.find((c) => c.id === id)
    onCambiar({ compras: seccion.compras.filter((c) => c.id !== id) })
    if (borrada) onSyncPush([compraAFila(seccion.nombre, borrada, 'borrada')])
  }

  const renombrar = (nuevoNombre: string) => {
    onCambiar({ nombre: nuevoNombre })
    // las filas de la nube llevan el nombre de la sección: reetiquetarlas todas
    onSyncPush(seccion.compras.map((c) => compraAFila(nuevoNombre, c)))
  }

  return (
    <div className="pt-8 animate-fade-in">
      {/* Cabecera */}
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <button onClick={onVolver} className="flex items-center gap-1.5 text-xs text-white/35 hover:text-white/65 px-2 py-1.5 rounded-lg hover:bg-white/05 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Secciones
        </button>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${seccion.color}1f`, border: `1px solid ${seccion.color}40` }}
          >
            <Factory className="w-5 h-5" style={{ color: seccion.color }} />
          </div>
          {renombrando ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nombreEdit}
                onChange={(e) => setNombreEdit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && nombreEdit.trim()) { renombrar(nombreEdit.trim()); setRenombrando(false) }
                  if (e.key === 'Escape') { setNombreEdit(seccion.nombre); setRenombrando(false) }
                }}
                className="text-2xl font-bold bg-transparent text-white/90 outline-none border-b border-white/20"
              />
              <button onClick={() => { if (nombreEdit.trim()) { renombrar(nombreEdit.trim()) }; setRenombrando(false) }} className="text-emerald-400/80 hover:text-emerald-400"><Check className="w-4 h-4" /></button>
              <button onClick={() => { setNombreEdit(seccion.nombre); setRenombrando(false) }} className="text-white/30 hover:text-white/60"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <h1 className="text-2xl font-bold text-white/92 tracking-tight flex items-center gap-2.5">
              {seccion.nombre}
              <button onClick={() => { setNombreEdit(seccion.nombre); setRenombrando(true) }} title="Renombrar sección" className="text-white/20 hover:text-white/55 transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </h1>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => exportarCSVSeccion(seccion)}
            disabled={seccion.compras.length === 0}
            title="Descargar el histórico de esta sección como CSV (Excel)"
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 px-3 py-2 rounded-lg border border-white/08 hover:border-white/15 transition-all disabled:opacity-25"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> CSV
          </button>
          {confirmarBorrado ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/08">
              <span className="text-xs text-red-300/80">¿Eliminar sección y su histórico?</span>
              <button onClick={onEliminar} className="text-xs font-semibold text-red-400 hover:text-red-300">Sí, eliminar</button>
              <button onClick={() => setConfirmarBorrado(false)} className="text-xs text-white/35 hover:text-white/60">No</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmarBorrado(true)}
              title="Eliminar sección"
              className="flex items-center gap-1.5 text-xs text-white/25 hover:text-red-400/80 px-3 py-2 rounded-lg border border-white/08 hover:border-red-500/25 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
        <StatChip icon={Package} label="Compras" valor={String(st.articulos)} />
        <StatChip icon={Layers3} label="Unidades" valor={st.unidades.toLocaleString('es-ES')} />
        <StatChip
          icon={Coins}
          label="Gasto aprox."
          valor={st.gastoAprox > 0 ? fmtEUR(st.gastoAprox) : '—'}
          nota={st.articulos > 0 && st.conPrecio < st.articulos ? `${st.articulos - st.conPrecio} sin precio` : undefined}
        />
        <StatChip icon={CalendarDays} label="Última compra" valor={st.ultimaFecha ? fmtFecha(st.ultimaFecha) : '—'} />
      </div>

      {/* Formulario añadir */}
      <FormNuevaCompra color={seccion.color} onAñadir={añadirCompra} />

      {/* Filtro + modo */}
      {seccion.compras.length > 0 && (
        <div className="flex items-center gap-2 mt-6 mb-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-white/08" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <Search className="w-3.5 h-3.5 text-white/25 shrink-0" />
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar por descripción, SAP o proveedor…"
              className="flex-1 text-xs bg-transparent text-white/75 placeholder-white/22 outline-none"
            />
            {filtro && <button onClick={() => setFiltro('')} className="text-white/25 hover:text-white/55"><X className="w-3 h-3" /></button>}
          </div>
          <div className="flex rounded-xl border border-white/08 overflow-hidden">
            <ModoBtn activo={modo === 'historico'} onClick={() => setModo('historico')} icon={List} label="Histórico" />
            <ModoBtn activo={modo === 'articulos'} onClick={() => setModo('articulos')} icon={Layers3} label="Por artículo" />
          </div>
        </div>
      )}

      {/* Contenido */}
      {seccion.compras.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-white/06 p-8 text-center" style={{ background: 'rgba(255,255,255,0.015)' }}>
          <Package className="w-6 h-6 text-white/15 mx-auto mb-3" />
          <p className="text-sm text-white/35">Aún no hay compras en esta sección.</p>
          <p className="text-xs text-white/22 mt-1.5">
            Añádelas arriba, o desde el asistente: analiza un pedido y usa &ldquo;Guardar en sección&rdquo;.
          </p>
        </div>
      ) : modo === 'historico' ? (
        <ListaHistorico compras={comprasFiltradas} onActualizar={actualizarCompra} onEliminar={eliminarCompra} />
      ) : (
        <ListaAgrupada agrupados={agrupados} />
      )}
    </div>
  )
}

// ── Chips y botones auxiliares ────────────────────────────────────────────

function StatChip({ icon: Icon, label, valor, nota }: { icon: typeof Package; label: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl px-3.5 py-3 border border-white/07" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-white/25" />
        <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">{label}</p>
      </div>
      <p className="text-sm font-semibold text-white/80">{valor}</p>
      {nota && <p className="text-[10px] text-amber-400/50 mt-0.5">{nota}</p>}
    </div>
  )
}

function ModoBtn({ activo, onClick, icon: Icon, label }: { activo: boolean; onClick: () => void; icon: typeof List; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs px-3 py-2 transition-colors"
      style={{
        background: activo ? 'rgba(99,102,241,0.15)' : 'transparent',
        color: activo ? 'rgba(165,180,252,0.9)' : 'rgba(255,255,255,0.35)',
      }}
    >
      <Icon className="w-3 h-3" /> {label}
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  FORMULARIO NUEVA COMPRA (con autocompletado SAP desde la BD)
// ═══════════════════════════════════════════════════════════════════════════

function FormNuevaCompra({ color, onAñadir }: { color: string; onAñadir: (c: Omit<CompraSeccion, 'id'>) => void }) {
  const [fecha, setFecha] = useState(hoyISO())
  const [empresa, setEmpresa] = useState(EMPRESA_DEFAULT)
  const [sap, setSap] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [precio, setPrecio] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [sugerencias, setSugerencias] = useState<SapSearchResult[]>([])
  const [buscando, setBuscando] = useState(false)
  const [mostrarSug, setMostrarSug] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  // Autocompleta SAP + descripción + proveedor buscando en la BD de la app
  const buscarSap = (q: string) => {
    setSap(q)
    clearTimeout(timerRef.current)
    if (q.trim().length < 2) { setSugerencias([]); setMostrarSug(false); return }
    setBuscando(true)
    setMostrarSug(true)
    timerRef.current = setTimeout(async () => {
      try {
        const r = await fetch('/api/sap-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) })
        setSugerencias(await r.json())
      } catch { setSugerencias([]) }
      finally { setBuscando(false) }
    }, 280)
  }

  const elegirSugerencia = (s: SapSearchResult) => {
    setSap(s.codigo)
    if (!descripcion.trim()) setDescripcion(s.descripcion)
    if (!proveedor.trim() && s.proveedor) setProveedor(s.proveedor)
    setMostrarSug(false)
    setSugerencias([])
  }

  const puedeAñadir = descripcion.trim().length >= 2 && Number(cantidad) > 0

  const añadir = () => {
    if (!puedeAñadir) return
    const precioNum = precio.trim() === '' ? null : Number(precio.replace(',', '.'))
    onAñadir({
      fecha,
      sapCodigo: sap.trim(),
      descripcion: descripcion.trim(),
      cantidad: Math.max(1, Math.round(Number(cantidad) || 1)),
      precioUnitario: precioNum != null && !isNaN(precioNum) && precioNum >= 0 ? precioNum : null,
      proveedor: proveedor.trim(),
      empresa,
    })
    // Mantener fecha y empresa, limpiar el resto para encadenar entradas rápidas
    setSap(''); setDescripcion(''); setCantidad('1'); setPrecio(''); setProveedor('')
    setSugerencias([]); setMostrarSug(false)
  }

  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: `${color}30`, background: `${color}08` }}>
      <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: `${color}cc` }}>
        <Plus className="w-3 h-3 inline mr-1 -mt-0.5" />
        Registrar compra en esta sección
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-12 gap-2">
        {/* Fecha */}
        <div className="sm:col-span-2">
          <label className="text-[9px] text-white/28 uppercase tracking-wider block mb-1">Fecha</label>
          <input
            type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
            className="w-full text-xs text-white/75 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-2 outline-none focus:border-white/25 [color-scheme:dark]"
          />
        </div>

        {/* Empresa del grupo */}
        <div className="sm:col-span-2">
          <label className="text-[9px] text-white/28 uppercase tracking-wider block mb-1">Empresa</label>
          <select
            value={empresa} onChange={(e) => setEmpresa(e.target.value)}
            className="w-full text-xs text-white/75 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-2 outline-none focus:border-white/25 [color-scheme:dark]"
          >
            {EMPRESAS.map((e) => <option key={e.nombre} value={e.nombre}>{e.corto}</option>)}
          </select>
        </div>

        {/* SAP con autocompletado */}
        <div className="sm:col-span-2 relative">
          <label className="text-[9px] text-white/28 uppercase tracking-wider block mb-1">Código SAP</label>
          <input
            value={sap}
            onChange={(e) => buscarSap(e.target.value)}
            onFocus={() => { if (sugerencias.length) setMostrarSug(true) }}
            onBlur={() => setTimeout(() => setMostrarSug(false), 180)}
            placeholder="Buscar…"
            className="w-full text-xs font-mono text-white/80 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-2 outline-none focus:border-white/25"
          />
          {mostrarSug && (
            <div className="absolute z-30 top-full left-0 mt-1 w-72 max-h-52 overflow-y-auto rounded-xl border shadow-2xl" style={{ borderColor: 'rgba(255,255,255,0.14)', background: 'rgba(16,16,26,0.98)' }}>
              {buscando && <p className="text-[10px] text-white/30 px-3 py-2 animate-pulse">Buscando en la BD…</p>}
              {!buscando && sugerencias.length === 0 && <p className="text-[10px] text-white/25 px-3 py-2 italic">Sin resultados — puedes dejarlo sin código</p>}
              {sugerencias.map((s) => (
                <button
                  key={s.codigo}
                  onMouseDown={(e) => { e.preventDefault(); elegirSugerencia(s) }}
                  className="w-full text-left px-3 py-2 hover:bg-white/[0.07] transition-colors"
                >
                  <span className="text-[11px] font-mono text-indigo-300/90">{s.codigo}</span>
                  <p className="text-[10px] text-white/55 leading-tight truncate">{s.descripcion}</p>
                  {s.proveedor && <p className="text-[9px] text-white/25 truncate">{s.proveedor}</p>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Descripción */}
        <div className="col-span-2 sm:col-span-6">
          <label className="text-[9px] text-white/28 uppercase tracking-wider block mb-1">Descripción *</label>
          <input
            value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            placeholder="ej: rodamiento 6204-2RS"
            className="w-full text-xs text-white/80 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-2 outline-none focus:border-white/25"
          />
        </div>

        {/* Cantidad */}
        <div className="sm:col-span-2">
          <label className="text-[9px] text-white/28 uppercase tracking-wider block mb-1">Cant.</label>
          <input
            type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)}
            className="w-full text-xs text-white/80 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-2 text-center outline-none focus:border-white/25"
          />
        </div>

        {/* Precio */}
        <div className="sm:col-span-3">
          <label className="text-[9px] text-white/28 uppercase tracking-wider block mb-1">€/ud. aprox</label>
          <input
            value={precio} onChange={(e) => setPrecio(e.target.value)}
            placeholder="opcional"
            inputMode="decimal"
            className="w-full text-xs text-white/80 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-2 outline-none focus:border-white/25"
          />
        </div>

        {/* Proveedor */}
        <div className="sm:col-span-7">
          <label className="text-[9px] text-white/28 uppercase tracking-wider block mb-1">Proveedor</label>
          <input
            value={proveedor} onChange={(e) => setProveedor(e.target.value)}
            placeholder="opcional"
            className="w-full text-xs text-white/80 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-2 outline-none focus:border-white/25"
          />
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          onClick={añadir}
          disabled={!puedeAñadir}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-25"
          style={{ background: `${color}22`, border: `1px solid ${color}45`, color }}
        >
          <Plus className="w-3.5 h-3.5" /> Añadir al histórico
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  LISTA HISTÓRICO (cronológica, editable)
// ═══════════════════════════════════════════════════════════════════════════

function ListaHistorico({
  compras, onActualizar, onEliminar,
}: {
  compras: CompraSeccion[]
  onActualizar: (id: string, cambios: Partial<CompraSeccion>) => void
  onEliminar: (id: string) => void
}) {
  if (compras.length === 0) {
    return <p className="text-xs text-white/25 italic px-2 py-4">Sin resultados para el filtro.</p>
  }
  return (
    <div className="rounded-2xl border border-white/07 overflow-hidden divide-y divide-white/[0.045]" style={{ background: 'rgba(255,255,255,0.015)' }}>
      {compras.map((c) => (
        <FilaCompra key={c.id} compra={c} onActualizar={onActualizar} onEliminar={onEliminar} />
      ))}
    </div>
  )
}

function FilaCompra({
  compra: c, onActualizar, onEliminar,
}: {
  compra: CompraSeccion
  onActualizar: (id: string, cambios: Partial<CompraSeccion>) => void
  onEliminar: (id: string) => void
}) {
  const [confirmar, setConfirmar] = useState(false)
  const total = c.precioUnitario != null ? c.precioUnitario * c.cantidad : null
  const emp = empresaInfo(c.empresa)

  return (
    <div className="px-4 py-2.5 flex items-center gap-3 group">
      <span className="text-[10px] text-white/30 font-mono w-16 shrink-0">{fmtFecha(c.fecha)}</span>
      <span className="text-[11px] font-mono w-20 shrink-0" style={{ color: c.sapCodigo ? '#818cf8' : 'rgba(255,255,255,0.18)' }}>
        {c.sapCodigo || '—'}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/70 truncate" title={c.descripcion}>{c.descripcion}</p>
        {c.proveedor && <p className="text-[10px] text-white/28 truncate">{c.proveedor}</p>}
      </div>

      {/* Empresa del grupo (editable) */}
      <select
        value={emp.nombre}
        onChange={(e) => onActualizar(c.id, { empresa: e.target.value })}
        title={`Empresa: ${emp.nombre}`}
        className="w-[92px] text-[10px] font-semibold bg-transparent rounded-lg px-1.5 py-1 outline-none cursor-pointer shrink-0 transition-colors [color-scheme:dark]"
        style={{ color: emp.color, border: `1px solid ${emp.color}35`, background: `${emp.color}0d` }}
      >
        {EMPRESAS.map((e) => <option key={e.nombre} value={e.nombre}>{e.corto}</option>)}
        {!EMPRESAS.some((e) => e.nombre === emp.nombre) && <option value={emp.nombre}>{emp.corto}</option>}
      </select>

      {/* Cantidad editable */}
      <input
        type="number" min={1} value={c.cantidad}
        onChange={(e) => onActualizar(c.id, { cantidad: Math.max(1, Number(e.target.value) || 1) })}
        title="Cantidad"
        className="w-14 text-xs text-white/70 bg-transparent border border-white/07 hover:border-white/15 focus:border-white/25 rounded-lg px-1.5 py-1 text-center outline-none transition-colors shrink-0"
      />

      {/* Precio editable */}
      <div className="w-24 shrink-0 text-right">
        <div className="flex items-center justify-end gap-1">
          <input
            value={c.precioUnitario != null ? String(c.precioUnitario) : ''}
            onChange={(e) => {
              const v = e.target.value.replace(',', '.')
              onActualizar(c.id, { precioUnitario: v === '' ? null : (isNaN(Number(v)) ? c.precioUnitario : Number(v)) })
            }}
            placeholder="€/ud"
            title="Precio unitario aproximado (€)"
            inputMode="decimal"
            className="w-16 text-xs text-white/70 bg-transparent border border-white/07 hover:border-white/15 focus:border-white/25 rounded-lg px-1.5 py-1 text-right outline-none transition-colors"
          />
          <span className="text-[10px] text-white/25">€</span>
        </div>
        {total != null && <p className="text-[10px] text-emerald-400/55 mt-0.5">= {fmtEUR(total)}</p>}
      </div>

      {/* Eliminar */}
      {confirmar ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => onEliminar(c.id)} className="text-[10px] font-semibold text-red-400 hover:text-red-300">Borrar</button>
          <button onClick={() => setConfirmar(false)} className="text-[10px] text-white/35 hover:text-white/60">No</button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmar(true)}
          title="Eliminar esta compra"
          className="text-white/12 hover:text-red-400/70 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  LISTA AGRUPADA POR ARTÍCULO
// ═══════════════════════════════════════════════════════════════════════════

function ListaAgrupada({ agrupados }: { agrupados: ReturnType<typeof agruparPorArticulo> }) {
  if (agrupados.length === 0) {
    return <p className="text-xs text-white/25 italic px-2 py-4">Sin resultados para el filtro.</p>
  }
  return (
    <div className="rounded-2xl border border-white/07 overflow-hidden" style={{ background: 'rgba(255,255,255,0.015)' }}>
      {/* Cabecera */}
      <div className="px-4 py-2 flex items-center gap-3 border-b border-white/[0.06] text-[9px] text-white/28 uppercase tracking-wider font-semibold">
        <span className="w-20 shrink-0">SAP</span>
        <span className="flex-1">Artículo</span>
        <span className="w-12 text-center shrink-0">Veces</span>
        <span className="w-14 text-center shrink-0">Uds.</span>
        <span className="w-20 text-right shrink-0">Últ. precio</span>
        <span className="w-20 text-right shrink-0">Gasto ≈</span>
      </div>
      <div className="divide-y divide-white/[0.045]">
        {agrupados.map((a) => (
          <div key={a.clave} className="px-4 py-2.5 flex items-center gap-3">
            <span className="text-[11px] font-mono w-20 shrink-0" style={{ color: a.sapCodigo ? '#818cf8' : 'rgba(255,255,255,0.18)' }}>
              {a.sapCodigo || '—'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/70 truncate" title={a.descripcion}>{a.descripcion}</p>
              <p className="text-[10px] text-white/28 truncate">
                {a.proveedor || ''}{a.proveedor ? ' · ' : ''}última {fmtFecha(a.ultimaFecha)}
              </p>
            </div>
            <span className="text-xs text-white/55 w-12 text-center shrink-0">{a.veces}</span>
            <span className="text-xs text-white/55 w-14 text-center shrink-0">{a.unidadesTotal.toLocaleString('es-ES')}</span>
            <span className="text-xs w-20 text-right shrink-0" style={{ color: a.ultimoPrecio != null ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.18)' }}>
              {a.ultimoPrecio != null ? fmtEUR(a.ultimoPrecio) : '—'}
            </span>
            <span className="text-xs w-20 text-right shrink-0" style={{ color: a.gastoAprox > 0 ? 'rgba(52,211,153,0.7)' : 'rgba(255,255,255,0.18)' }}>
              {a.gastoAprox > 0 ? fmtEUR(a.gastoAprox) : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
