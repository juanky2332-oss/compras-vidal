'use client'

import { useRef, useState } from 'react'
import { Paperclip, X, Send, Loader2, ImageIcon, Sparkles } from 'lucide-react'
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
      ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'
    }
  }

  const ejemplos = [
    '4 rodamientos SKF 6205-2RS',
    'motorreductor Motovario 0,75 kW trifásico',
    '2 contactores Schneider LC1D18 + guardamotor GV2ME10',
    'banda transportadora Habasit FCB azul alimentaria 500mm',
  ]

  const usarEjemplo = (ej: string) => {
    setTexto(ej)
    setTimeout(() => {
      const ta = textareaRef.current
      if (ta) {
        ta.style.height = 'auto'
        ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'
        ta.focus()
      }
    }, 0)
  }

  return (
    <div className="space-y-4">
      {/* Card principal */}
      <div
        className="rounded-2xl overflow-hidden transition-all duration-300"
        style={{
          background: 'rgba(255,255,255,0.028)',
          border: cargando
            ? '1px solid rgba(99,102,241,0.4)'
            : '1px solid rgba(255,255,255,0.09)',
          boxShadow: cargando
            ? '0 0 40px rgba(99,102,241,0.12), inset 0 0 40px rgba(99,102,241,0.03)'
            : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        {/* Preview imagen */}
        {preview && (
          <div className="px-5 pt-5">
            <div className="relative inline-flex">
              <div className="relative w-28 h-28 rounded-xl overflow-hidden border border-white/10">
                <Image src={preview} alt="Preview" fill className="object-cover" />
              </div>
              <button
                onClick={removeImagen}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#070710] border border-white/15 flex items-center justify-center hover:bg-red-500/20 hover:border-red-500/40 transition-colors group shadow-lg"
              >
                <X className="w-3 h-3 text-white/50 group-hover:text-red-400" />
              </button>
              <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/70 rounded-md px-2 py-0.5">
                <ImageIcon className="w-3 h-3 text-white/60" />
                <span className="text-xs text-white/55">OCR</span>
              </div>
            </div>
          </div>
        )}

        {/* Textarea */}
        <div className="px-5 pt-5 pb-3">
          <textarea
            ref={textareaRef}
            value={texto}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Escribe o pega aquí tu solicitud de compra y te busco el proveedor habitual con código SAP…"
            rows={3}
            className="w-full bg-transparent text-base text-white/85 placeholder-white/22 resize-none leading-relaxed"
            style={{ minHeight: '80px', maxHeight: '220px' }}
            disabled={cargando}
          />
        </div>

        {/* Divider */}
        <div className="mx-5 h-px bg-white/[0.06]" />

        {/* Toolbar */}
        <div className="px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/08 hover:border-white/18 hover:bg-white/04 transition-all text-sm text-white/40 hover:text-white/65 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Paperclip className="w-3.5 h-3.5" />
              <span>Imagen</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-white/20 hidden sm:block">
              {typeof navigator !== 'undefined' && navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+↵
            </span>
            <button
              onClick={handleSubmit}
              disabled={(!texto.trim() && !imagen) || cargando}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                boxShadow: cargando ? 'none' : '0 4px 20px rgba(99,102,241,0.35)',
              }}
            >
              {cargando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Buscando…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Buscar proveedor</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Ejemplos rápidos */}
      <div className="space-y-2">
        <p className="text-xs text-white/25 px-1 font-medium uppercase tracking-widest">Ejemplos</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ejemplos.map((ej, i) => (
            <button
              key={i}
              onClick={() => usarEjemplo(ej)}
              disabled={cargando}
              className="text-left text-sm text-white/40 hover:text-white/70 px-3.5 py-2.5 rounded-xl border border-white/06 hover:border-white/14 hover:bg-white/[0.025] transition-all disabled:opacity-30 truncate"
              title={ej}
            >
              {ej}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
