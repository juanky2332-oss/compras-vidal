'use client'

import { useRef, useState, useCallback } from 'react'
import { X, Upload, FileSpreadsheet, Trash2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { saveHistorico, clearHistorico } from '@/lib/indexedDB'
import type { HistoricoRow } from '@/lib/types'

interface HistoricoSetupProps {
  onClose: () => void
  onLoaded: (rows: HistoricoRow[], filas: number) => void
  filasCargadas: number
}

type Estado = 'idle' | 'leyendo' | 'guardando' | 'ok' | 'error'

export default function HistoricoSetup({ onClose, onLoaded, filasCargadas }: HistoricoSetupProps) {
  const [dragging, setDragging] = useState(false)
  const [estado, setEstado] = useState<Estado>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [filas, setFilas] = useState(filasCargadas)
  const inputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setErrorMsg('Formato no soportado. Usa .xlsx, .xls o .csv')
      setEstado('error')
      return
    }
    try {
      setEstado('leyendo')
      setErrorMsg('')

      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<HistoricoRow>(sheet, { defval: '' })

      if (rows.length === 0) {
        setErrorMsg('El archivo no contiene filas de datos.')
        setEstado('error')
        return
      }

      setEstado('guardando')
      await saveHistorico(rows)
      setFilas(rows.length)
      setEstado('ok')
      onLoaded(rows, rows.length)
    } catch (e) {
      console.error(e)
      setErrorMsg('Error al leer el archivo. Comprueba que no esté protegido.')
      setEstado('error')
    }
  }, [onLoaded])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleClear = async () => {
    await clearHistorico()
    setFilas(0)
    setEstado('idle')
    onLoaded([], 0)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-md glass rounded-2xl p-6 animate-slide-up shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/5 transition-colors text-white/40 hover:text-white/70"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <FileSpreadsheet className="w-4.5 h-4.5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white/90">Histórico de Compras</h2>
            <p className="text-xs text-white/40 mt-0.5">Sube el Excel con el histórico de compras SAP</p>
          </div>
        </div>

        {/* Drop zone */}
        <div
          className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
            dragging
              ? 'border-indigo-400/60 bg-indigo-500/08'
              : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={onFileChange}
          />

          {estado === 'leyendo' || estado === 'guardando' ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              <p className="text-sm text-white/50">
                {estado === 'leyendo' ? 'Leyendo archivo…' : 'Guardando en caché…'}
              </p>
            </div>
          ) : estado === 'ok' ? (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
              <div>
                <p className="text-sm font-medium text-emerald-400">¡Histórico cargado!</p>
                <p className="text-xs text-white/40 mt-1">{filas.toLocaleString('es-ES')} filas guardadas en caché local</p>
              </div>
            </div>
          ) : estado === 'error' ? (
            <div className="flex flex-col items-center gap-3">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <div>
                <p className="text-sm font-medium text-red-400">Error al cargar</p>
                <p className="text-xs text-white/40 mt-1">{errorMsg}</p>
                <p className="text-xs text-white/30 mt-1">Haz clic para intentarlo de nuevo</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="w-8 h-8 text-white/20" />
              <div>
                <p className="text-sm font-medium text-white/60">Arrastra el Excel aquí</p>
                <p className="text-xs text-white/30 mt-1">o haz clic para seleccionar · .xlsx, .xls, .csv</p>
              </div>
            </div>
          )}
        </div>

        {/* Columnas esperadas */}
        <div className="mt-4 p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
          <p className="text-xs text-white/30 mb-2 font-medium">Columnas esperadas en el Excel:</p>
          <div className="flex flex-wrap gap-1">
            {['Material', 'Texto breve', 'Codigo SAP', 'Proveedor'].map((col) => (
              <span
                key={col}
                className="text-xs px-2 py-0.5 rounded-md bg-white/[0.04] text-white/40 font-mono"
              >
                {col}
              </span>
            ))}
          </div>
        </div>

        {/* Clear */}
        {filas > 0 && (
          <button
            onClick={handleClear}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs text-red-400/60 hover:text-red-400 hover:bg-red-400/05 border border-red-400/10 hover:border-red-400/20 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpiar caché del histórico
          </button>
        )}
      </div>
    </div>
  )
}
