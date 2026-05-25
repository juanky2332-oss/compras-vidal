'use client'

import { ShoppingCart, Database, RefreshCw, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'

type DriveStatus = 'idle' | 'syncing' | 'ok' | 'error-private' | 'error'

interface HeaderProps {
  historicoCargado: boolean
  filas: number
  driveStatus: DriveStatus
  onOpenSetup: () => void
  onSync: () => void
}

export default function Header({ historicoCargado, filas, driveStatus, onOpenSetup, onSync }: HeaderProps) {
  const isSyncing = driveStatus === 'syncing'
  const isError = driveStatus === 'error' || driveStatus === 'error-private'

  const statusColor = isSyncing
    ? '#6366f1'
    : isError && !historicoCargado
    ? '#f59e0b'
    : historicoCargado
    ? '#10b981'
    : 'rgba(255,255,255,0.3)'

  const statusBg = isSyncing
    ? 'rgba(99,102,241,0.06)'
    : isError && !historicoCargado
    ? 'rgba(245,158,11,0.06)'
    : historicoCargado
    ? 'rgba(16,185,129,0.06)'
    : 'rgba(255,255,255,0.03)'

  const statusBorder = isSyncing
    ? 'rgba(99,102,241,0.2)'
    : isError && !historicoCargado
    ? 'rgba(245,158,11,0.2)'
    : historicoCargado
    ? 'rgba(16,185,129,0.2)'
    : 'rgba(255,255,255,0.07)'

  const StatusIcon = isSyncing
    ? Loader2
    : isError && !historicoCargado
    ? AlertTriangle
    : historicoCargado
    ? CheckCircle
    : Database

  const label = isSyncing
    ? 'Sincronizando…'
    : isError && !historicoCargado
    ? 'Error al cargar'
    : historicoCargado
    ? `${filas.toLocaleString('es-ES')} filas`
    : 'Sin histórico'

  return (
    <header className="fixed top-0 left-0 right-0 z-40 border-b border-white/[0.06] bg-[#08080f]/80 backdrop-blur-xl">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <ShoppingCart className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold text-white/90 tracking-tight">Compras Vidal</span>
            <span className="text-xs text-white/30 font-medium">IA</span>
          </div>
        </div>

        {/* Histórico status + botones */}
        <div className="flex items-center gap-2">
          {/* Sync button */}
          <button
            onClick={onSync}
            disabled={isSyncing}
            title="Resincronizar histórico desde Google Drive"
            className="p-1.5 rounded-lg border border-white/07 hover:border-white/15 hover:bg-white/03 transition-all text-white/25 hover:text-white/55 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>

          {/* Status badge */}
          <button
            onClick={onOpenSetup}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-200 group"
            style={{ background: statusBg, borderColor: statusBorder }}
          >
            <StatusIcon
              className={`w-3.5 h-3.5 flex-shrink-0 ${isSyncing ? 'animate-spin' : ''}`}
              style={{ color: statusColor }}
            />
            <span className="text-xs font-medium" style={{ color: statusColor }}>
              {label}
            </span>
            <span className="text-xs text-white/20 group-hover:text-white/40 transition-colors hidden sm:inline">
              · Excel
            </span>
          </button>
        </div>
      </div>
    </header>
  )
}
