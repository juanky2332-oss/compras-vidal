'use client'

import { useRef, useState } from 'react'
import { Paperclip, X, Send, Loader2, ImageIcon } from 'lucide-react'
import Image from 'next/image'

interface InputZoneProps {
  onAnalizar: (texto: string, imagen: File | null) => void
  cargando: boolean
  historicoCargado: boolean
}

export default function InputZone({ onAnalizar, cargando, historicoCargado }: InputZoneProps) {
  const [texto, setTexto] = useState('')
  const [imagen, setImagen] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleImagen = (file: File) => {
    if (!file.type.startsWith('image/')) return
    setImagen(file)
    const url = URL.createObjectURL(file)
    setPreview(url)
  }

  const removeImagen = () => {
    setImagen(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleSubmit = () => {
    if ((!texto.trim() && !imagen) || cargando) return
    onAnalizar(texto.trim(), imagen)
    setTexto('')
    removeImagen()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imgItem = items.find((i) => i.type.startsWith('image/'))
    if (imgItem) {
      const file = imgItem.getAsFile()
      if (file) handleImagen(file)
    }
  }

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTexto(e.target.value)
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
    }
  }

  const ejemplos = [
    'OCC 88320 - punteras cónicas 1/2" inox - 8 - machones cónicos 1/2" inox - 8',
    'Necesito 4 rodamientos SKF 6204-2RS y 2 contactores Schneider LC1D18',
    'codo 90 NW65 inox - 2 und urgente',
  ]

  return (
    <div className="space-y-4">
      {/* Main input card */}
      <div
        className="glass rounded-2xl overflow-hidden transition-all duration-200"
        style={{
          borderColor: cargando ? 'rgba(99,102,241,0.3)' : undefined,
          boxShadow: cargando ? '0 0 30px rgba(99,102,241,0.1)' : undefined,
        }}
      >
        {/* Image preview */}
        {preview && (
          <div className="px-4 pt-4">
            <div className="relative inline-flex">
              <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-white/10">
                <Image src={preview} alt="Preview" fill className="object-cover" />
              </div>
              <button
                onClick={removeImagen}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#08080f] border border-white/15 flex items-center justify-center hover:bg-red-500/20 hover:border-red-500/40 transition-colors group"
              >
                <X className="w-2.5 h-2.5 text-white/50 group-hover:text-red-400" />
              </button>
              <div className="absolute bottom-1 left-1 flex items-center gap-1 bg-black/60 rounded-md px-1.5 py-0.5">
                <ImageIcon className="w-2.5 h-2.5 text-white/60" />
                <span className="text-xs text-white/50">OCR</span>
              </div>
            </div>
          </div>
        )}

        {/* Textarea */}
        <div className="p-4">
          <textarea
            ref={textareaRef}
            value={texto}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Pega un aviso iOCC, describe los materiales o adjunta una foto del componente/etiqueta…"
            rows={3}
            className="w-full bg-transparent text-sm text-white/80 placeholder-white/20 resize-none leading-relaxed"
            style={{ minHeight: '72px', maxHeight: '200px' }}
            disabled={cargando}
          />
        </div>

        {/* Toolbar */}
        <div className="px-4 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleImagen(f)
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={cargando || !!imagen}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/08 hover:border-white/15 hover:bg-white/03 transition-all text-xs text-white/40 hover:text-white/60 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Paperclip className="w-3.5 h-3.5" />
              <span>Imagen</span>
            </button>

            {!historicoCargado && (
              <span className="text-xs text-amber-400/60 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 animate-pulse-slow inline-block" />
                Sin histórico
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-white/20 hidden sm:block">
              {navigator?.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+↵ para enviar
            </span>
            <button
              onClick={handleSubmit}
              disabled={(!texto.trim() && !imagen) || cargando}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                boxShadow: '0 0 20px rgba(99,102,241,0.25)',
              }}
            >
              {cargando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analizando…</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Analizar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Ejemplos rápidos */}
      <div className="space-y-1.5">
        <p className="text-xs text-white/20 px-1">Ejemplos rápidos:</p>
        <div className="flex flex-wrap gap-2">
          {ejemplos.map((ej, i) => (
            <button
              key={i}
              onClick={() => {
                setTexto(ej)
                setTimeout(() => {
                  const ta = textareaRef.current
                  if (ta) {
                    ta.style.height = 'auto'
                    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
                  }
                }, 0)
              }}
              disabled={cargando}
              className="text-xs px-3 py-1.5 rounded-lg border border-white/06 text-white/30 hover:text-white/55 hover:border-white/12 hover:bg-white/02 transition-all truncate max-w-xs disabled:opacity-30"
              title={ej}
            >
              {ej.length > 55 ? ej.slice(0, 55) + '…' : ej}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
