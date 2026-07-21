'use client'

import { useMemo, useRef, useState } from 'react'
import {
  Receipt,
  Loader2,
  Clipboard,
  Check,
  AlertCircle,
  Building2,
  Search,
  X,
  Trash2,
  FileText,
  Coins,
  WandSparkles,
  Warehouse,
} from 'lucide-react'
import type { LineaOfertaSAP, ProveedorSimple } from '@/lib/types'
import { fmtEUR } from '@/lib/secciones'
import { abreviarDescripcionSAP } from '@/lib/abreviaturas'

interface FilaEditable extends LineaOfertaSAP {
  id: string
  textoSAP: string
}

interface OfertasSAPProps {
  proveedoresDB: ProveedorSimple[]
}

function nuevoId(): string {
  return Math.random().toString(36).slice(2)
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      /* fallback */
    }
  }
  const ta = document.createElement('textarea')
  ta.value = text
  Object.assign(ta.style, { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' })
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

// Genera la línea TSV en el mismo orden de columnas que usa SAP ME21N/ME51N.
// A diferencia del pedido normal, aquí el Txt.brv. se rellena SIEMPRE (en
// mayúsculas), aunque haya código SAP: es lo que permite reutilizar un código
// parecido para un artículo poco habitual, cambiando la descripción para que
// se entienda qué se ha pedido realmente, sin tener que crear un material nuevo.
function buildLine(fila: FilaEditable, solicitudCompra: string, centro: string, almacen: string): string {
  const qty = String(fila.cantidad)
  return [
    fila.sapCodigo || '',                 // 1  Material
    fila.textoSAP.slice(0, 40),           // 2  Txt.brv.
    qty,                                  // 3  Ctd.pedido
    '',                                   // 4  U...
    '',                                   // 5  T
    '',                                   // 6  Fe.entrega
    fila.tienePrecio ? fila.precioSAP : '',                 // 7  Prc.neto
    fila.tienePrecio ? 'EUR' : '',                           // 8  Mon...
    fila.tienePrecio ? String(fila.multiplicador || 1) : '', // 9  por
    '',                                   // 10 CPP
    '',                                   // 11 Grupo art.
    centro || '1001',                     // 12 Centro
    almacen || '100',                     // 13 Almacén
    '',                                   // 14 Lote
    '',                                   // 15 Segmento de stock
    '',                                   // 16 Segm.necesidad
    '',                                   // 17 Nº nec.
    '',                                   // 18 Solicitante
    '',                                   // 19 C...
    '',                                   // 20 Mat.gest.stock
    '',                                   // 21 Reg.info
    '',                                   // 22 Po...
    '',                                   // 23 Gr...
    '',                                   // 24 T...
    solicitudCompra || '',                // 25 Sol.pedido
  ].join('\t')
}

function ProveedorUnico({
  nombre,
  codigo,
  proveedoresDB,
  onElegir,
  onNombreLibre,
}: {
  nombre: string
  codigo: string
  proveedoresDB: ProveedorSimple[]
  onElegir: (codigo: string, nombre: string) => void
  onNombreLibre: (nombre: string) => void
}) {
  const [busq, setBusq] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtrados = useMemo(() => {
    if (busq.trim().length < 2) return []
    const q = busq.toUpperCase()
    return proveedoresDB.filter((p) => p.nombre.toUpperCase().includes(q) || p.codigo.includes(q)).slice(0, 12)
  }, [busq, proveedoresDB])

  return (
    <div ref={containerRef} className="relative">
      <label className="text-[10px] text-white/30 uppercase tracking-widest font-semibold mb-1 block">
        Proveedor único para todas las líneas
      </label>
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] focus-within:border-indigo-500/30">
        <Building2 className="w-3.5 h-3.5 text-indigo-400/60 shrink-0" />
        <input
          value={open ? busq : nombre}
          onChange={(e) => {
            setBusq(e.target.value)
            onNombreLibre(e.target.value)
            setOpen(true)
          }}
          onFocus={() => { setBusq(nombre); setOpen(true) }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Escribe el proveedor (ej. BERDIN) o déjalo vacío para detectarlo del texto"
          className="flex-1 text-sm text-white/85 bg-transparent placeholder-white/25 outline-none"
        />
        {codigo && <span className="text-xs text-white/30 font-mono shrink-0">{codigo}</span>}
        {nombre && (
          <button onMouseDown={(e) => { e.preventDefault(); onNombreLibre(''); onElegir('', ''); setBusq('') }} className="text-white/25 hover:text-white/50 shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && filtrados.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 rounded-xl border border-white/10 bg-[#12121c] shadow-xl z-50 max-h-52 overflow-y-auto py-1">
          {filtrados.map((p) => (
            <button
              key={p.codigo}
              onMouseDown={(e) => {
                e.preventDefault()
                onElegir(p.codigo, p.nombre)
                setBusq(p.nombre)
                setOpen(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.06] transition-colors"
            >
              <span className="text-xs text-white/78 flex-1 truncate">{p.nombre}</span>
              <code className="text-[10px] text-white/30 font-mono shrink-0">{p.codigo}</code>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function OfertasSAP({ proveedoresDB }: OfertasSAPProps) {
  const [proveedorNombre, setProveedorNombre] = useState('')
  const [proveedorCodigo, setProveedorCodigo] = useState('')
  const [texto, setTexto] = useState('')
  const [solicitudCompra, setSolicitudCompra] = useState('')
  const [centro, setCentro] = useState('1001')
  const [almacen, setAlmacen] = useState('100')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filas, setFilas] = useState<FilaEditable[]>([])
  const [copiado, setCopiado] = useState(false)

  const handleElegirProveedor = (codigo: string, nombre: string) => {
    setProveedorCodigo(codigo)
    setProveedorNombre(nombre)
  }

  const handleNombreLibre = (nombre: string) => {
    setProveedorNombre(nombre)
    setProveedorCodigo('') // texto libre: ya no corresponde necesariamente al código elegido antes
  }

  const handleProcesar = async () => {
    if (!texto.trim() || cargando) return
    setCargando(true)
    setError(null)
    try {
      const res = await fetch('/api/ofertas-sap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, proveedor: proveedorNombre || undefined }),
      })
      if (!res.ok) throw new Error('Error al procesar el texto')
      const data = await res.json()
      const lineas: LineaOfertaSAP[] = data.lineas || []
      if (lineas.length === 0) {
        setError('No se identificó ningún concepto en el texto pegado.')
        setFilas([])
        return
      }
      if (!proveedorNombre.trim() && data.proveedor) {
        setProveedorNombre(data.proveedor)
      }
      setFilas(
        lineas.map((l) => ({
          ...l,
          id: nuevoId(),
          textoSAP: (l.sapDescripcion || l.descripcion).toUpperCase().slice(0, 40),
        }))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setCargando(false)
    }
  }

  const actualizarFila = (id: string, cambios: Partial<FilaEditable>) =>
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...cambios } : f)))

  const eliminarFila = (id: string) => setFilas((prev) => prev.filter((f) => f.id !== id))

  // Sustituye el texto breve de TODAS las líneas por el del PEDIDO (no el de
  // la BD), abreviado con la misma lógica que usan las descripciones ya
  // guardadas en SAP. El código SAP encontrado no se toca.
  const handleConvertirTexto = () =>
    setFilas((prev) => prev.map((f) => ({ ...f, textoSAP: abreviarDescripcionSAP(f.descripcion, 40) })))

  const totalPedido = useMemo(() => filas.reduce((acc, f) => acc + (f.tienePrecio ? f.importeTotal : 0), 0), [filas])
  const conPrecio = filas.filter((f) => f.tienePrecio).length
  const exactos = filas.filter((f) => f.sapCodigo && f.exacto).length
  const aproximados = filas.filter((f) => f.sapCodigo && !f.exacto).length
  const sinCodigo = filas.filter((f) => !f.sapCodigo).length

  const handleCopiarPedido = async () => {
    const tsv = filas.map((f) => buildLine(f, solicitudCompra, centro, almacen)).join('\n')
    await copyToClipboard(tsv)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  return (
    <div className="space-y-5">
      <div className="pt-8 mb-2">
        <h1 className="text-2xl font-bold text-white/93 mb-2 tracking-tight leading-snug flex items-center gap-2">
          <Receipt className="w-5 h-5 text-emerald-400/80" />
          Ofertas / Pedidos <span className="gradient-text">SAP</span>
        </h1>
        <p className="text-sm text-white/45 leading-relaxed max-w-2xl">
          Pega la oferta de un proveedor o un pedido con conceptos (con o sin precio). Todas las líneas se asignan a un único
          proveedor — el que elijas o el que detecte en el texto (ej. &ldquo;empresa BERDIN&rdquo;). Busco el código SAP más
          exacto o parecido de cada línea y puedes editar el texto breve antes de copiarlo directamente a SAP.
        </p>
      </div>

      <div className="glass rounded-2xl border border-white/[0.06] p-4 space-y-3">
        <ProveedorUnico
          nombre={proveedorNombre}
          codigo={proveedorCodigo}
          proveedoresDB={proveedoresDB}
          onElegir={handleElegirProveedor}
          onNombreLibre={handleNombreLibre}
        />

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={7}
          placeholder={'Pega aquí la oferta o el pedido, por ejemplo:\n\nempresa BERDIN\nEngrasadora codo 45º - 5 uds - 19,23€ total\nEngrasador recto - 2 uds - 3,50€/ud\nKit juntas filtro EPDM - 3 uds (sin precio)'}
          className="w-full text-xs text-white/75 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2.5 placeholder-white/20 outline-none focus:border-emerald-500/30 resize-y font-mono"
        />

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleProcesar}
            disabled={!texto.trim() || cargando}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-30"
            style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }}
          >
            {cargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            {cargando ? 'Procesando…' : 'Buscar códigos SAP y procesar'}
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08]">
            <FileText className="w-3.5 h-3.5 text-indigo-400/50" />
            <input
              type="text"
              value={solicitudCompra}
              onChange={(e) => setSolicitudCompra(e.target.value)}
              placeholder="Nº Solicitud de Compra (opcional)"
              className="text-xs text-white/75 bg-transparent placeholder-white/25 outline-none w-56"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-white/[0.04]">
          <span className="text-[10px] text-white/25 uppercase tracking-widest font-semibold">Opcional:</span>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.08]">
            <Warehouse className="w-3.5 h-3.5 text-white/25 shrink-0" />
            <span className="text-[10px] text-white/30">Centro</span>
            <input
              type="text"
              value={centro}
              onChange={(e) => setCentro(e.target.value)}
              className="w-14 text-xs text-white/70 bg-transparent outline-none font-mono"
            />
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.08]">
            <span className="text-[10px] text-white/30">Almacén</span>
            <input
              type="text"
              value={almacen}
              onChange={(e) => setAlmacen(e.target.value)}
              className="w-14 text-xs text-white/70 bg-transparent outline-none font-mono"
            />
          </div>
          <span className="text-[10px] text-white/20">
            Solo si te hace falta cambiarlos (ej. otra empresa del grupo) — por defecto Centro 1001 / Almacén 100.
          </span>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/[0.06] border border-red-500/20">
            <AlertCircle className="w-3.5 h-3.5 text-red-400/70 shrink-0 mt-px" />
            <p className="text-xs text-red-400/70">{error}</p>
          </div>
        )}
      </div>

      {filas.length > 0 && (
        <div className="glass rounded-2xl border border-indigo-500/15" style={{ overflow: 'visible' }}>
          <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-white/85">
                {proveedorNombre || 'Sin proveedor asignado'} {proveedorCodigo && <span className="text-xs text-white/30 font-mono ml-1">{proveedorCodigo}</span>}
              </h3>
              <p className="text-xs text-white/35 mt-0.5">
                {filas.length} línea{filas.length > 1 ? 's' : ''} · {exactos} exacta{exactos !== 1 ? 's' : ''} · {aproximados} aproximada{aproximados !== 1 ? 's' : ''}
                {sinCodigo > 0 && <> · {sinCodigo} sin código</>}
                {' '}· Clic en celda Material fila 1 → Ctrl+V
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {conPrecio > 0 && (
                <span
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.25)', color: 'rgba(110,231,183,0.9)' }}
                  title={`${conPrecio} de ${filas.length} líneas con precio`}
                >
                  <Coins className="w-3.5 h-3.5" />
                  Total: {fmtEUR(totalPedido)}
                </span>
              )}
              <button
                onClick={handleConvertirTexto}
                title="Sustituye el texto breve de todas las líneas por el del pedido, abreviado estilo SAP (el código SAP no cambia)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24' }}
              >
                <WandSparkles className="w-3.5 h-3.5" />
                Convertir texto SAP
              </button>
              <button
                onClick={handleCopiarPedido}
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

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/[0.03] text-white/35">
                  <th className="text-left font-medium px-3 py-2 whitespace-nowrap">Código SAP</th>
                  <th className="text-left font-medium px-3 py-2 min-w-[220px]">Texto (Txt.brv.) — editable</th>
                  <th className="text-right font-medium px-2.5 py-2">Cant.</th>
                  <th className="text-right font-medium px-2.5 py-2">Importe Total</th>
                  <th className="text-right font-medium px-2.5 py-2">Precio Unitario</th>
                  <th className="text-right font-medium px-2.5 py-2">Formato SAP</th>
                  <th className="text-right font-medium px-2.5 py-2 whitespace-nowrap">Multiplicador</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono" style={{ color: f.sapCodigo ? '#818cf8' : 'rgba(255,255,255,0.2)' }}>
                          {f.sapCodigo || '—'}
                        </span>
                      </div>
                      {f.sapCodigo && (
                        <span
                          className="mt-1 inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={
                            f.exacto
                              ? { background: 'rgba(16,185,129,0.12)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.25)' }
                              : { background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }
                          }
                        >
                          {f.exacto ? 'EXACTO' : 'APROXIMADO'}
                        </span>
                      )}
                      {!f.sapCodigo && (
                        <span className="mt-1 inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/35 border border-white/[0.08]">
                          SIN CÓDIGO
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={f.textoSAP}
                        onChange={(e) => actualizarFila(f.id, { textoSAP: e.target.value.toUpperCase().slice(0, 40) })}
                        maxLength={40}
                        className="w-full text-xs text-white/80 bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1 outline-none focus:border-indigo-500/30 font-mono uppercase"
                      />
                      <p className="text-[10px] text-white/20 mt-0.5 truncate" title={f.descripcion}>
                        Pedido: {f.descripcion} {f.sapCodigo && <>· BD: {f.sapDescripcion}</>}
                      </p>
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono text-white/55 align-top">
                      <input
                        type="number"
                        min={1}
                        value={f.cantidad}
                        onChange={(e) => actualizarFila(f.id, { cantidad: Math.max(1, Number(e.target.value) || 1) })}
                        className="w-14 text-right text-xs text-white/70 bg-white/[0.03] border border-white/[0.08] rounded px-1.5 py-1 outline-none focus:border-indigo-500/30"
                      />
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono text-white/70 align-top">{f.tienePrecio ? fmtEUR(f.importeTotal) : '—'}</td>
                    <td className="px-2.5 py-2 text-right font-mono text-white/70 align-top">{f.tienePrecio ? f.precioUnitarioLabel : '—'}</td>
                    <td className="px-2.5 py-2 text-right font-mono text-emerald-400/80 align-top">{f.tienePrecio ? f.precioSAP : '—'}</td>
                    <td className="px-2.5 py-2 text-right font-mono text-white/45 whitespace-nowrap align-top">{f.tienePrecio ? f.multiplicadorLabel : '—'}</td>
                    <td className="px-2 py-2 align-top">
                      <button onClick={() => eliminarFila(f.id)} title="Quitar línea" className="text-white/20 hover:text-red-400/70 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {aproximados > 0 && (
            <div className="flex items-start gap-2 p-3 mx-4 mb-4 rounded-xl bg-amber-500/[0.05] border border-amber-500/15">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400/70 shrink-0 mt-px" />
              <p className="text-xs text-amber-400/60 leading-relaxed">
                <span className="text-amber-400/80 font-medium">{aproximados} código{aproximados > 1 ? 's' : ''} aproximado{aproximados > 1 ? 's' : ''}</span>{' '}
                — se reutiliza un código SAP parecido para no crear material nuevo. Revisa y ajusta el texto breve para que describa lo realmente pedido.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
