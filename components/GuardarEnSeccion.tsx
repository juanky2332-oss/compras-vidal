'use client'

// ─────────────────────────────────────────────────────────────────────────
//  Widget opcional bajo el export SAP: guarda las líneas incluidas del
//  pedido actual en el histórico de una sección de fábrica.
//  No interfiere con el flujo del asistente — es solo un registro adicional.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { Factory, Check, ChevronDown } from 'lucide-react'
import type { SeleccionPedido } from '@/lib/types'
import type { Seccion } from '@/lib/secciones'
import { cargarSecciones, guardarSecciones, nuevoId, hoyISO, compraAFila } from '@/lib/secciones'
import { EMPRESAS, EMPRESA_DEFAULT, empresaInfo } from '@/lib/empresas'
import { subirFilas } from '@/lib/syncHistorico'

export default function GuardarEnSeccion({ selecciones }: { selecciones: SeleccionPedido[] }) {
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [abierto, setAbierto] = useState(false)
  const [empresa, setEmpresa] = useState(EMPRESA_DEFAULT)
  const [guardadoEn, setGuardadoEn] = useState<string | null>(null)

  useEffect(() => {
    setSecciones(cargarSecciones())
  }, [])

  const incluidas = selecciones.filter((s) => s.incluido)
  if (incluidas.length === 0 || secciones.length === 0) return null

  const guardar = (seccionId: string) => {
    // Releer para no pisar cambios hechos en la otra vista
    const actuales = cargarSecciones()
    const seccion = actuales.find((s) => s.id === seccionId)
    if (!seccion) return
    const fecha = hoyISO()
    const nuevas = incluidas.map((sel) => ({
      id: nuevoId(),
      fecha,
      sapCodigo: sel.sapElegido || '',
      descripcion: sel.sapDescripcion || '(sin descripción)',
      cantidad: sel.cantidad,
      precioUnitario: null, // el precio aproximado se completa después en la vista Secciones
      proveedor: sel.proveedorNombre || '',
      empresa,
    }))
    const actualizadas = actuales.map((s) =>
      s.id === seccionId ? { ...s, compras: [...s.compras, ...nuevas] } : s
    )
    guardarSecciones(actualizadas)
    setSecciones(actualizadas)
    // sincronizar con el Google Sheet (si falla, queda en cola de reintento)
    void subirFilas(nuevas.map((c) => compraAFila(seccion.nombre, c)))
    setGuardadoEn(seccion.nombre)
    setAbierto(false)
    setTimeout(() => setGuardadoEn(null), 4000)
  }

  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{ background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.15)' }}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <Factory className="w-4 h-4 text-emerald-400/60 shrink-0" />
        <div className="flex-1 min-w-[180px]">
          <p className="text-[10px] text-emerald-300/50 uppercase tracking-widest font-semibold">
            Guardar en sección de fábrica
          </p>
          <p className="text-xs text-white/35 mt-0.5">
            Registra {incluidas.length} línea{incluidas.length !== 1 ? 's' : ''} en el histórico del departamento (el precio se completa después)
          </p>
        </div>

        {/* Empresa del grupo a la que va la compra */}
        {!guardadoEn && (
          <select
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            title="Empresa del grupo para la que se compra"
            className="text-xs font-semibold bg-transparent rounded-lg px-2 py-2 outline-none cursor-pointer [color-scheme:dark]"
            style={{ color: empresaInfo(empresa).color, border: `1px solid ${empresaInfo(empresa).color}40`, background: `${empresaInfo(empresa).color}0d` }}
          >
            {EMPRESAS.map((e) => <option key={e.nombre} value={e.nombre}>{e.corto}</option>)}
          </select>
        )}

        {guardadoEn ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
            <Check className="w-3.5 h-3.5" /> Guardado en {guardadoEn}
          </span>
        ) : (
          <div className="relative">
            <button
              onClick={() => setAbierto((v) => !v)}
              className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg transition-all"
              style={{ background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.28)', color: '#34d399' }}
            >
              Elegir sección <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {abierto && (
              <div
                className="absolute z-30 right-0 top-full mt-1 w-56 max-h-64 overflow-y-auto rounded-xl border shadow-2xl py-1"
                style={{ borderColor: 'rgba(255,255,255,0.14)', background: 'rgba(16,16,26,0.98)' }}
              >
                {secciones.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => guardar(s.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.07] transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-xs text-white/75 flex-1 truncate">{s.nombre}</span>
                    <span className="text-[10px] text-white/25">{s.compras.length}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
