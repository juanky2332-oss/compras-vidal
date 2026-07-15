'use client'

// ─────────────────────────────────────────────────────────────────────────
//  Vista DASHBOARD — panorámica de las compras del grupo: KPIs, evolución
//  mensual, reparto por empresa y sección, top materiales/proveedores y
//  últimas compras. Se alimenta del mismo histórico que la vista Secciones
//  (localStorage + Google Sheet), con filtros por empresa y periodo.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react'
import {
  Coins, Package, Layers3, Truck, TrendingUp, TrendingDown, Minus,
  Building2, Factory, Clock, FileSpreadsheet, RefreshCw, CloudOff, BarChart3,
  AlertTriangle, BellRing,
} from 'lucide-react'
import type { Seccion, CompraSeccion } from '@/lib/secciones'
import {
  cargarSecciones, guardarSecciones, reconciliarConNube, fmtEUR, fmtFecha, hoyISO,
  agruparPorArticulo,
} from '@/lib/secciones'
import { listarNube } from '@/lib/syncHistorico'
import { EMPRESAS, empresaInfo, normalizarEmpresa } from '@/lib/empresas'

type Periodo = '3m' | '6m' | '12m' | 'todo'

interface CompraPlano extends CompraSeccion {
  seccion: string
  seccionColor: string
  empresaNorm: string
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function labelMes(ym: string): string {
  const [y, m] = ym.split('-')
  return `${MESES[Number(m) - 1]} ${y.slice(2)}`
}

// Primer día del mes situado `atras` meses antes del actual, en ISO 'YYYY-MM-DD'
function inicioMes(atras: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - atras)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function listaMeses(desdeYM: string, hastaYM: string): string[] {
  const out: string[] = []
  let [y, m] = desdeYM.split('-').map(Number)
  const [Y, M] = hastaYM.split('-').map(Number)
  while (y < Y || (y === Y && m <= M)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

export default function DashboardView() {
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'local'>('cargando')
  const [empresaFiltro, setEmpresaFiltro] = useState<string>('TODAS')
  const [periodo, setPeriodo] = useState<Periodo>('12m')
  const [metrica, setMetrica] = useState<'gasto' | 'compras'>('gasto')

  useEffect(() => {
    const local = cargarSecciones()
    setSecciones(local)
    ;(async () => {
      const res = await listarNube()
      if (res === null || !res.configurado) { setEstado('local'); return }
      const { secciones: fusionadas } = reconciliarConNube(local, res.rows)
      guardarSecciones(fusionadas)
      setSecciones(fusionadas)
      setEstado('ok')
    })()
  }, [])

  // Histórico completo aplanado (sección + empresa normalizada por compra)
  const todas = useMemo<CompraPlano[]>(
    () =>
      secciones.flatMap((s) =>
        s.compras.map((c) => ({
          ...c,
          seccion: s.nombre,
          seccionColor: s.color,
          empresaNorm: normalizarEmpresa(c.empresa),
        }))
      ),
    [secciones]
  )

  const fechaDesde = useMemo(() => {
    if (periodo === 'todo') return ''
    return inicioMes(periodo === '3m' ? 2 : periodo === '6m' ? 5 : 11)
  }, [periodo])

  const filtradas = useMemo(
    () =>
      todas.filter(
        (c) =>
          (empresaFiltro === 'TODAS' || c.empresaNorm === empresaFiltro) &&
          (!fechaDesde || c.fecha >= fechaDesde)
      ),
    [todas, empresaFiltro, fechaDesde]
  )

  // ── KPIs ────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    let gasto = 0
    let unidades = 0
    let sinPrecio = 0
    const proveedores = new Set<string>()
    const hoy = hoyISO()
    const mesActual = hoy.slice(0, 7)
    const dAnt = new Date()
    dAnt.setDate(1)
    dAnt.setMonth(dAnt.getMonth() - 1)
    const mesAnterior = `${dAnt.getFullYear()}-${String(dAnt.getMonth() + 1).padStart(2, '0')}`
    let gastoMes = 0
    let gastoMesAnt = 0
    let comprasMes = 0
    for (const c of filtradas) {
      unidades += c.cantidad
      const total = c.precioUnitario != null ? c.precioUnitario * c.cantidad : null
      if (total != null) gasto += total
      else sinPrecio++
      if (c.proveedor.trim()) proveedores.add(c.proveedor.trim().toUpperCase())
      const ym = c.fecha.slice(0, 7)
      if (ym === mesActual) { comprasMes++; if (total != null) gastoMes += total }
      if (ym === mesAnterior && total != null) gastoMesAnt += total
    }
    const delta = gastoMesAnt > 0 ? ((gastoMes - gastoMesAnt) / gastoMesAnt) * 100 : null
    return { gasto, compras: filtradas.length, unidades, proveedores: proveedores.size, sinPrecio, gastoMes, comprasMes, delta }
  }, [filtradas])

  // ── Serie mensual ───────────────────────────────────────────────────────
  const porMes = useMemo(() => {
    const hoyYM = hoyISO().slice(0, 7)
    let desdeYM: string
    if (fechaDesde) desdeYM = fechaDesde.slice(0, 7)
    else {
      const min = filtradas.reduce<string>((acc, c) => (!acc || c.fecha < acc ? c.fecha : acc), '')
      desdeYM = min ? min.slice(0, 7) : hoyYM
    }
    const meses = listaMeses(desdeYM, hoyYM).slice(-24) // máximo 24 barras
    const map = new Map(meses.map((m) => [m, { ym: m, gasto: 0, compras: 0 }]))
    for (const c of filtradas) {
      const b = map.get(c.fecha.slice(0, 7))
      if (!b) continue
      b.compras++
      if (c.precioUnitario != null) b.gasto += c.precioUnitario * c.cantidad
    }
    return meses.map((m) => map.get(m)!)
  }, [filtradas, fechaDesde])

  // ── Reparto por empresa y por sección ───────────────────────────────────
  const porEmpresa = useMemo(() => {
    const map = new Map<string, { gasto: number; compras: number }>()
    for (const c of todas.filter((c) => !fechaDesde || c.fecha >= fechaDesde)) {
      const b = map.get(c.empresaNorm) || { gasto: 0, compras: 0 }
      b.compras++
      if (c.precioUnitario != null) b.gasto += c.precioUnitario * c.cantidad
      map.set(c.empresaNorm, b)
    }
    return Array.from(map.entries())
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => b.gasto - a.gasto || b.compras - a.compras)
  }, [todas, fechaDesde])

  const porSeccion = useMemo(() => {
    const map = new Map<string, { gasto: number; compras: number; color: string }>()
    for (const c of filtradas) {
      const b = map.get(c.seccion) || { gasto: 0, compras: 0, color: c.seccionColor }
      b.compras++
      if (c.precioUnitario != null) b.gasto += c.precioUnitario * c.cantidad
      map.set(c.seccion, b)
    }
    return Array.from(map.entries())
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => b.gasto - a.gasto || b.compras - a.compras)
      .slice(0, 8)
  }, [filtradas])

  // ── Tops y últimas ──────────────────────────────────────────────────────
  const topMateriales = useMemo(() => agruparPorArticulo(filtradas).slice(0, 10), [filtradas])

  const topProveedores = useMemo(() => {
    const map = new Map<string, { pedidos: number; gasto: number; ultima: string }>()
    for (const c of filtradas) {
      const nombre = c.proveedor.trim()
      if (!nombre) continue
      const clave = nombre.toUpperCase()
      const b = map.get(clave) || { pedidos: 0, gasto: 0, ultima: c.fecha }
      b.pedidos++
      if (c.precioUnitario != null) b.gasto += c.precioUnitario * c.cantidad
      if (c.fecha > b.ultima) b.ultima = c.fecha
      map.set(clave, b)
    }
    return Array.from(map.entries())
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => b.gasto - a.gasto || b.pedidos - a.pedidos)
      .slice(0, 8)
  }, [filtradas])

  const ultimas = useMemo(
    () => [...filtradas].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id)).slice(0, 12),
    [filtradas]
  )

  // ── Avisos inteligentes: precios que se mueven, huecos y oportunidades ──
  const avisos = useMemo(() => {
    interface Aviso { tipo: 'subida' | 'ahorro' | 'multiprov' | 'sinprecio'; titulo: string; detalle: string; color: string }
    const out: Aviso[] = []

    const preciosPorSap = new Map<string, Array<{ fecha: string; precio: number; desc: string; proveedor: string }>>()
    const provPorSap = new Map<string, { provs: Set<string>; desc: string }>()
    for (const c of filtradas) {
      if (!c.sapCodigo) continue
      if (c.proveedor.trim()) {
        const e = provPorSap.get(c.sapCodigo) || { provs: new Set<string>(), desc: c.descripcion }
        e.provs.add(c.proveedor.trim().toUpperCase())
        if (c.descripcion) e.desc = c.descripcion
        provPorSap.set(c.sapCodigo, e)
      }
      if (c.precioUnitario != null && c.precioUnitario > 0) {
        const arr = preciosPorSap.get(c.sapCodigo) || []
        arr.push({ fecha: c.fecha, precio: c.precioUnitario, desc: c.descripcion, proveedor: c.proveedor })
        preciosPorSap.set(c.sapCodigo, arr)
      }
    }

    for (const [sap, arr] of Array.from(preciosPorSap.entries())) {
      if (arr.length < 2) continue
      arr.sort((a, b) => a.fecha.localeCompare(b.fecha))
      const ult = arr[arr.length - 1]
      const ant = arr[arr.length - 2]
      if (ult.precio === ant.precio) continue
      const pct = ((ult.precio - ant.precio) / ant.precio) * 100
      const nombre = ult.desc || sap
      if (pct >= 10) {
        out.push({
          tipo: 'subida', color: '#fb7185',
          titulo: `${nombre} — precio +${pct.toFixed(0)}%`,
          detalle: `De ${fmtEUR(ant.precio)} a ${fmtEUR(ult.precio)}/ud el ${fmtFecha(ult.fecha)}${ult.proveedor ? ' · ' + ult.proveedor : ''}. Revisa con el proveedor o busca alternativa.`,
        })
      } else if (pct <= -10) {
        out.push({
          tipo: 'ahorro', color: '#34d399',
          titulo: `${nombre} — precio ${pct.toFixed(0)}%`,
          detalle: `De ${fmtEUR(ant.precio)} a ${fmtEUR(ult.precio)}/ud el ${fmtFecha(ult.fecha)}${ult.proveedor ? ' · ' + ult.proveedor : ''}.`,
        })
      }
    }

    for (const [, e] of Array.from(provPorSap.entries())) {
      if (e.provs.size < 2) continue
      out.push({
        tipo: 'multiprov', color: '#fbbf24',
        titulo: `${e.desc} se compra a ${e.provs.size} proveedores`,
        detalle: `${Array.from(e.provs).slice(0, 3).join(', ')} — compara precios y unifica si conviene.`,
      })
    }

    const sinPrecio = filtradas.filter((c) => c.precioUnitario == null).length
    if (sinPrecio > 0) {
      out.push({
        tipo: 'sinprecio', color: '#a1a1aa',
        titulo: `${sinPrecio} compra${sinPrecio !== 1 ? 's' : ''} sin precio registrado`,
        detalle: 'Complétalo en Secciones: mejora el gasto real del dashboard y activa los avisos de precio.',
      })
    }

    const orden: Record<Aviso['tipo'], number> = { subida: 0, multiprov: 1, ahorro: 2, sinprecio: 3 }
    return out.sort((a, b) => orden[a.tipo] - orden[b.tipo]).slice(0, 6)
  }, [filtradas])

  // ── Export CSV global (filtro aplicado) ─────────────────────────────────
  const exportarCSV = () => {
    const filas = [
      ['Fecha', 'Empresa', 'Sección', 'Código SAP', 'Descripción', 'Cantidad', 'Precio unit. (€)', 'Total (€)', 'Proveedor', 'Notas'].join(';'),
      ...[...filtradas]
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .map((c) =>
          [
            fmtFecha(c.fecha),
            `"${c.empresaNorm.replace(/"/g, '""')}"`,
            `"${c.seccion.replace(/"/g, '""')}"`,
            c.sapCodigo,
            `"${c.descripcion.replace(/"/g, '""')}"`,
            c.cantidad,
            c.precioUnitario != null ? String(c.precioUnitario).replace('.', ',') : '',
            c.precioUnitario != null ? String(c.precioUnitario * c.cantidad).replace('.', ',') : '',
            `"${(c.proveedor || '').replace(/"/g, '""')}"`,
            `"${(c.notas || '').replace(/"/g, '""')}"`,
          ].join(';')
        ),
    ]
    const blob = new Blob(['﻿' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `compras-grupo-vidal-${hoyISO()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const hayDatos = todas.length > 0

  return (
    <div className="pt-8 animate-fade-in">
      {/* Cabecera + filtros */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white/93 mb-2 tracking-tight leading-snug">
            Dashboard de <span className="gradient-text">compras</span>
          </h1>
          <p className="text-base text-white/45 leading-relaxed max-w-xl">
            Panorámica del gasto del grupo VIDAL GOLOSINAS: evolución, empresas, secciones, materiales y proveedores.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {estado === 'cargando' && (
            <span className="flex items-center gap-1.5 text-xs text-white/35 px-3 py-2 rounded-lg border border-white/08">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Sincronizando…
            </span>
          )}
          {estado === 'local' && (
            <span title="No se pudo leer el Google Sheet — se muestran los datos guardados en este navegador" className="flex items-center gap-1.5 text-xs text-amber-400/70 px-3 py-2 rounded-lg border border-amber-500/15 bg-amber-500/05">
              <CloudOff className="w-3.5 h-3.5" /> Datos locales
            </span>
          )}
          <button
            onClick={exportarCSV}
            disabled={filtradas.length === 0}
            title="Descargar todas las compras del filtro actual como CSV (Excel)"
            className="flex items-center gap-1.5 text-xs text-white/35 hover:text-white/60 px-3 py-2 rounded-lg border border-white/08 hover:border-white/15 transition-all disabled:opacity-25"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Filtros: empresa + periodo */}
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-xl border border-white/08 flex-wrap" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <FiltroBtn activo={empresaFiltro === 'TODAS'} onClick={() => setEmpresaFiltro('TODAS')} label="Todo el grupo" color="#a5b4fc" />
          {EMPRESAS.map((e) => (
            <FiltroBtn key={e.nombre} activo={empresaFiltro === e.nombre} onClick={() => setEmpresaFiltro(e.nombre)} label={e.corto} color={e.color} />
          ))}
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl border border-white/08" style={{ background: 'rgba(255,255,255,0.02)' }}>
          {(['3m', '6m', '12m', 'todo'] as Periodo[]).map((p) => (
            <FiltroBtn key={p} activo={periodo === p} onClick={() => setPeriodo(p)} label={p === 'todo' ? 'Todo' : `Últ. ${p.replace('m', ' meses')}`} color="#a5b4fc" />
          ))}
        </div>
      </div>

      {!hayDatos ? (
        <div className="rounded-2xl border border-white/06 p-10 text-center" style={{ background: 'rgba(255,255,255,0.015)' }}>
          <BarChart3 className="w-7 h-7 text-white/15 mx-auto mb-3" />
          <p className="text-sm text-white/40">Aún no hay compras en el histórico.</p>
          <p className="text-xs text-white/25 mt-1.5">
            Regístralas en la pestaña <span className="text-white/45">Secciones</span> o guarda un pedido desde el <span className="text-white/45">Asistente</span> — el dashboard se rellenará solo.
          </p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-6">
            <Kpi icon={Coins} label="Gasto (periodo)" valor={kpis.gasto > 0 ? fmtEUR(kpis.gasto) : '—'}
              nota={kpis.sinPrecio > 0 ? `${kpis.sinPrecio} compra${kpis.sinPrecio !== 1 ? 's' : ''} sin precio` : undefined} acento="#34d399" />
            <Kpi icon={Package} label="Compras" valor={kpis.compras.toLocaleString('es-ES')} acento="#818cf8" />
            <Kpi icon={Layers3} label="Unidades" valor={kpis.unidades.toLocaleString('es-ES')} acento="#38bdf8" />
            <Kpi icon={Truck} label="Proveedores" valor={String(kpis.proveedores)} acento="#fbbf24" />
            <KpiMes gastoMes={kpis.gastoMes} comprasMes={kpis.comprasMes} delta={kpis.delta} />
          </div>

          {/* Avisos inteligentes */}
          {avisos.length > 0 && (
            <div className="mb-4">
              <Panel titulo="Avisos" icono={BellRing}>
                <div className="space-y-2">
                  {avisos.map((a, i) => {
                    const Icono = a.tipo === 'subida' ? TrendingUp : a.tipo === 'ahorro' ? TrendingDown : a.tipo === 'multiprov' ? Truck : AlertTriangle
                    return (
                      <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-xl border"
                        style={{ borderColor: `${a.color}25`, background: `${a.color}08` }}>
                        <Icono className="w-4 h-4 shrink-0 mt-0.5" style={{ color: a.color }} />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate" style={{ color: a.color }} title={a.titulo}>{a.titulo}</p>
                          <p className="text-[11px] text-white/40 leading-relaxed">{a.detalle}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Panel>
            </div>
          )}

          {/* Evolución mensual */}
          <Panel titulo={metrica === 'gasto' ? 'Gasto por mes' : 'Compras por mes'} icono={BarChart3}
            extra={
              <div className="flex rounded-lg border border-white/08 overflow-hidden">
                <FiltroBtn activo={metrica === 'gasto'} onClick={() => setMetrica('gasto')} label="€ Gasto" color="#34d399" compacto />
                <FiltroBtn activo={metrica === 'compras'} onClick={() => setMetrica('compras')} label="Nº compras" color="#818cf8" compacto />
              </div>
            }>
            <BarrasMensuales datos={porMes} metrica={metrica} />
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            {/* Reparto por empresa */}
            <Panel titulo="Por empresa del grupo" icono={Building2}>
              {porEmpresa.length === 0 ? <Vacio /> : (
                <div className="space-y-2.5">
                  {porEmpresa.map((e) => {
                    const info = empresaInfo(e.nombre)
                    const totalRef = porEmpresa.reduce((acc, x) => acc + (x.gasto || 0), 0)
                    const usaGasto = totalRef > 0
                    const totalBase = usaGasto ? totalRef : porEmpresa.reduce((acc, x) => acc + x.compras, 0)
                    const valor = usaGasto ? e.gasto : e.compras
                    const pct = totalBase > 0 ? (valor / totalBase) * 100 : 0
                    return (
                      <BarraH key={e.nombre} etiqueta={info.corto} color={info.color} pct={pct}
                        detalle={`${e.compras} compra${e.compras !== 1 ? 's' : ''}${e.gasto > 0 ? ' · ' + fmtEUR(e.gasto) : ''}`} />
                    )
                  })}
                </div>
              )}
            </Panel>

            {/* Reparto por sección */}
            <Panel titulo="Por sección de fábrica" icono={Factory}>
              {porSeccion.length === 0 ? <Vacio /> : (
                <div className="space-y-2.5">
                  {porSeccion.map((s) => {
                    const totalRef = porSeccion.reduce((acc, x) => acc + (x.gasto || 0), 0)
                    const usaGasto = totalRef > 0
                    const totalBase = usaGasto ? totalRef : porSeccion.reduce((acc, x) => acc + x.compras, 0)
                    const valor = usaGasto ? s.gasto : s.compras
                    const pct = totalBase > 0 ? (valor / totalBase) * 100 : 0
                    return (
                      <BarraH key={s.nombre} etiqueta={s.nombre} color={s.color} pct={pct}
                        detalle={`${s.compras} compra${s.compras !== 1 ? 's' : ''}${s.gasto > 0 ? ' · ' + fmtEUR(s.gasto) : ''}`} />
                    )
                  })}
                </div>
              )}
            </Panel>

            {/* Top materiales */}
            <Panel titulo="Materiales más comprados" icono={Package}>
              {topMateriales.length === 0 ? <Vacio /> : (
                <div className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[9px] text-white/28 uppercase tracking-wider">
                        <th className="pb-2 font-semibold">Artículo</th>
                        <th className="pb-2 font-semibold text-center w-12">Veces</th>
                        <th className="pb-2 font-semibold text-center w-14">Uds.</th>
                        <th className="pb-2 font-semibold text-right w-20">Gasto ≈</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.045]">
                      {topMateriales.map((a) => (
                        <tr key={a.clave}>
                          <td className="py-2 pr-2 min-w-0 max-w-[220px]">
                            <p className="text-xs text-white/70 truncate" title={a.descripcion}>{a.descripcion}</p>
                            <p className="text-[10px] text-white/25 font-mono truncate">{a.sapCodigo || '—'}{a.proveedor ? ` · ${a.proveedor}` : ''}</p>
                          </td>
                          <td className="py-2 text-xs text-white/55 text-center">{a.veces}</td>
                          <td className="py-2 text-xs text-white/55 text-center">{a.unidadesTotal.toLocaleString('es-ES')}</td>
                          <td className="py-2 text-xs text-right" style={{ color: a.gastoAprox > 0 ? 'rgba(52,211,153,0.75)' : 'rgba(255,255,255,0.18)' }}>
                            {a.gastoAprox > 0 ? fmtEUR(a.gastoAprox) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            {/* Top proveedores */}
            <Panel titulo="Proveedores con más gasto" icono={Truck}>
              {topProveedores.length === 0 ? <Vacio texto="Sin proveedores registrados en el filtro actual." /> : (
                <div className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[9px] text-white/28 uppercase tracking-wider">
                        <th className="pb-2 font-semibold">Proveedor</th>
                        <th className="pb-2 font-semibold text-center w-14">Pedidos</th>
                        <th className="pb-2 font-semibold text-right w-20">Gasto ≈</th>
                        <th className="pb-2 font-semibold text-right w-16">Última</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.045]">
                      {topProveedores.map((p) => (
                        <tr key={p.nombre}>
                          <td className="py-2 pr-2 text-xs text-white/70 truncate max-w-[180px]" title={p.nombre}>{p.nombre}</td>
                          <td className="py-2 text-xs text-white/55 text-center">{p.pedidos}</td>
                          <td className="py-2 text-xs text-right" style={{ color: p.gasto > 0 ? 'rgba(52,211,153,0.75)' : 'rgba(255,255,255,0.18)' }}>
                            {p.gasto > 0 ? fmtEUR(p.gasto) : '—'}
                          </td>
                          <td className="py-2 text-[10px] text-white/30 text-right font-mono">{fmtFecha(p.ultima)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          {/* Últimas compras */}
          <div className="mt-4">
            <Panel titulo="Últimas compras" icono={Clock}>
              {ultimas.length === 0 ? <Vacio /> : (
                <div className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[9px] text-white/28 uppercase tracking-wider">
                        <th className="pb-2 font-semibold w-16">Fecha</th>
                        <th className="pb-2 font-semibold w-20">Empresa</th>
                        <th className="pb-2 font-semibold w-24">Sección</th>
                        <th className="pb-2 font-semibold">Artículo</th>
                        <th className="pb-2 font-semibold text-center w-12">Cant.</th>
                        <th className="pb-2 font-semibold text-right w-20">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.045]">
                      {ultimas.map((c) => {
                        const info = empresaInfo(c.empresaNorm)
                        const total = c.precioUnitario != null ? c.precioUnitario * c.cantidad : null
                        return (
                          <tr key={c.id}>
                            <td className="py-2 text-[10px] text-white/35 font-mono">{fmtFecha(c.fecha)}</td>
                            <td className="py-2 pr-2">
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: info.color, background: `${info.color}14`, border: `1px solid ${info.color}30` }}>
                                {info.corto}
                              </span>
                            </td>
                            <td className="py-2 pr-2 text-[10px] truncate max-w-[96px]" style={{ color: c.seccionColor }} title={c.seccion}>{c.seccion}</td>
                            <td className="py-2 pr-2 min-w-0 max-w-[240px]">
                              <p className="text-xs text-white/70 truncate" title={c.descripcion}>{c.descripcion}</p>
                              <p className="text-[10px] text-white/25 font-mono truncate">{c.sapCodigo || '—'}{c.proveedor ? ` · ${c.proveedor}` : ''}</p>
                            </td>
                            <td className="py-2 text-xs text-white/55 text-center">{c.cantidad.toLocaleString('es-ES')}</td>
                            <td className="py-2 text-xs text-right" style={{ color: total != null ? 'rgba(52,211,153,0.75)' : 'rgba(255,255,255,0.18)' }}>
                              {total != null ? fmtEUR(total) : 'sin precio'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  Piezas de UI
// ═══════════════════════════════════════════════════════════════════════════

function FiltroBtn({ activo, onClick, label, color, compacto }: { activo: boolean; onClick: () => void; label: string; color: string; compacto?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`${compacto ? 'text-[10px] px-2.5 py-1.5' : 'text-xs px-3 py-1.5'} font-medium rounded-lg transition-all whitespace-nowrap`}
      style={{
        background: activo ? `${color}1f` : 'transparent',
        color: activo ? color : 'rgba(255,255,255,0.35)',
        border: activo ? `1px solid ${color}40` : '1px solid transparent',
      }}
    >
      {label}
    </button>
  )
}

function Kpi({ icon: Icon, label, valor, nota, acento }: { icon: typeof Coins; label: string; valor: string; nota?: string; acento: string }) {
  return (
    <div className="rounded-xl px-3.5 py-3 border border-white/07" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3 h-3" style={{ color: `${acento}99` }} />
        <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">{label}</p>
      </div>
      <p className="text-base font-bold text-white/85 leading-tight">{valor}</p>
      {nota && <p className="text-[10px] text-amber-400/50 mt-0.5">{nota}</p>}
    </div>
  )
}

function KpiMes({ gastoMes, comprasMes, delta }: { gastoMes: number; comprasMes: number; delta: number | null }) {
  const Icono = delta == null ? Minus : delta >= 0 ? TrendingUp : TrendingDown
  const colorDelta = delta == null ? 'rgba(255,255,255,0.3)' : delta > 0 ? '#fb7185' : '#34d399' // gastar más = rojo
  return (
    <div className="rounded-xl px-3.5 py-3 border border-white/07" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icono className="w-3 h-3" style={{ color: colorDelta }} />
        <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">Este mes</p>
      </div>
      <p className="text-base font-bold text-white/85 leading-tight">{gastoMes > 0 ? fmtEUR(gastoMes) : `${comprasMes} compra${comprasMes !== 1 ? 's' : ''}`}</p>
      <p className="text-[10px] mt-0.5" style={{ color: colorDelta }}>
        {delta == null ? 'sin mes anterior comparable' : `${delta > 0 ? '+' : ''}${delta.toFixed(0)}% vs mes anterior`}
      </p>
    </div>
  )
}

function Panel({ titulo, icono: Icon, extra, children }: { titulo: string; icono: typeof Coins; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/07 p-4" style={{ background: 'rgba(255,255,255,0.015)' }}>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-white/25" />
          <p className="text-[11px] text-white/40 uppercase tracking-widest font-semibold">{titulo}</p>
        </div>
        {extra}
      </div>
      {children}
    </div>
  )
}

function Vacio({ texto = 'Sin datos en el filtro actual.' }: { texto?: string }) {
  return <p className="text-xs text-white/25 italic py-3">{texto}</p>
}

function BarraH({ etiqueta, color, pct, detalle }: { etiqueta: string; color: string; pct: number; detalle: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs text-white/60 font-medium truncate">{etiqueta}</span>
        <span className="text-[10px] text-white/35 whitespace-nowrap">{detalle} · {pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, 1.5)}%`, background: `linear-gradient(90deg, ${color}b0, ${color})` }} />
      </div>
    </div>
  )
}

// ── Gráfica de barras mensual (SVG, sin dependencias) ─────────────────────

function BarrasMensuales({ datos, metrica }: { datos: Array<{ ym: string; gasto: number; compras: number }>; metrica: 'gasto' | 'compras' }) {
  const valores = datos.map((d) => (metrica === 'gasto' ? d.gasto : d.compras))
  const max = Math.max(...valores, 1)
  const todoCero = valores.every((v) => v === 0)
  const H = 190
  const zonaBarras = 130
  const anchoCol = 56
  const W = Math.max(datos.length * anchoCol, 300)
  const color = metrica === 'gasto' ? '#34d399' : '#818cf8'
  const mesActual = new Date()
  const ymActual = `${mesActual.getFullYear()}-${String(mesActual.getMonth() + 1).padStart(2, '0')}`

  const fmtValor = (v: number) =>
    metrica === 'gasto'
      ? v >= 1000 ? `${(v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}k€` : `${v.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€`
      : String(v)

  if (todoCero) {
    return (
      <p className="text-xs text-white/25 italic py-4">
        {metrica === 'gasto'
          ? 'Sin precios registrados en el periodo — añade el €/ud. en la vista Secciones y la gráfica cobrará vida.'
          : 'Sin compras en el periodo.'}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label={`Gráfica mensual de ${metrica}`}>
        {datos.map((d, i) => {
          const v = metrica === 'gasto' ? d.gasto : d.compras
          const h = v > 0 ? Math.max((v / max) * zonaBarras, 3) : 0
          const x = i * anchoCol + 10
          const barW = anchoCol - 20
          const y = 30 + (zonaBarras - h)
          const esActual = d.ym === ymActual
          return (
            <g key={d.ym}>
              {/* guía */}
              <line x1={x - 10 + anchoCol / 2} y1={30} x2={x - 10 + anchoCol / 2} y2={30 + zonaBarras} stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
              {v > 0 && (
                <>
                  <rect x={x} y={y} width={barW} height={h} rx={5}
                    fill={esActual ? color : `${color}77`} opacity={0.9} />
                  <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.55)" fontWeight={esActual ? 700 : 400}>
                    {fmtValor(v)}
                  </text>
                </>
              )}
              {v === 0 && (
                <rect x={x} y={30 + zonaBarras - 2} width={barW} height={2} rx={1} fill="rgba(255,255,255,0.07)" />
              )}
              <text x={x + barW / 2} y={30 + zonaBarras + 16} textAnchor="middle" fontSize={9.5}
                fill={esActual ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)'} fontWeight={esActual ? 700 : 400}>
                {labelMes(d.ym)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
