'use client'

import { useRef, useState, useEffect } from 'react'
import { Paperclip, X, Loader2, ImageIcon, Sparkles, Mic, MicOff } from 'lucide-react'
import Image from 'next/image'

interface InputZoneProps {
  onAnalizar: (texto: string, imagen: File | null) => void
  cargando: boolean
  historicoCargado: boolean
}

// Ejemplos reales del día a día para arrancar de un clic
const EJEMPLOS = [
  '2 rodamientos 6204-2RS FAG',
  'Válvula de bola inox GENEBRE DN50',
  '5 m tubo inox A-316 Ø50 SCH-10',
  'Correa trapezoidal SPZ 1250',
]

/* eslint-disable @typescript-eslint/no-explicit-any */
function getSpeechRecognition(): any {
  if (typeof window === 'undefined') return null
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
}

export default function InputZone({ onAnalizar, cargando }: InputZoneProps) {
  const [texto, setTexto] = useState('')
  const [imagen, setImagen] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [escuchando, setEscuchando] = useState(false)
  const [hayVoz, setHayVoz] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recogRef = useRef<any>(null)

  useEffect(() => {
    setHayVoz(!!getSpeechRecognition())
    return () => { try { recogRef.current?.stop() } catch {} }
  }, [])

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
    try { recogRef.current?.stop() } catch {}
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
    autoAlto()
  }

  const autoAlto = () => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'
    }
  }

  const usarEjemplo = (ej: string) => {
    setTexto(ej)
    setTimeout(() => { textareaRef.current?.focus(); autoAlto() }, 0)
  }

  // ── Dictado por voz (es-ES, si el navegador lo soporta) ─────────────────
  const toggleVoz = () => {
    if (escuchando) {
      try { recogRef.current?.stop() } catch {}
      setEscuchando(false)
      return
    }
    const SR = getSpeechRecognition()
    if (!SR) return
    const recog = new SR()
    recog.lang = 'es-ES'
    recog.continuous = true
    recog.interimResults = false
    recog.onresult = (ev: any) => {
      let dictado = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) dictado += ev.results[i][0].transcript
      }
      if (dictado.trim()) {
        setTexto((prev) => (prev.trim() ? prev.trimEnd() + ' ' : '') + dictado.trim())
        setTimeout(autoAlto, 0)
      }
    }
    recog.onend = () => setEscuchando(false)
    recog.onerror = () => setEscuchando(false)
    recogRef.current = recog
    try {
      recog.start()
      setEscuchando(true)
    } catch { setEscuchando(false) }
  }

  return (
    <div>
      {/* Card principal */}
      <div
        onDragOver={(e) => { e.preventDefault(); if (!cargando) setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault()
          setArrastrando(false)
          if (cargando) return
          const f = e.dataTransfer.files?.[0]
          if (f) handleImagen(f)
        }}
        className="relative rounded-2xl overflow-hidden transition-all duration-300"
        style={{
          background: 'rgba(255,255,255,0.028)',
          border: arrastrando
            ? '1px dashed rgba(52,211,153,0.6)'
            : cargando
            ? '1px solid rgba(99,102,241,0.4)'
            : '1px solid rgba(255,255,255,0.09)',
          boxShadow: cargando
            ? '0 0 40px rgba(99,102,241,0.12), inset 0 0 40px rgba(99,102,241,0.03)'
            : '0 4px 24px rgba(0,0,0,0.3)',
        }}
      >
        {/* Overlay al arrastrar imagen */}
        {arrastrando && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none" style={{ background: 'rgba(16,185,129,0.08)', backdropFilter: 'blur(2px)' }}>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl" style={{ background: 'rgba(7,7,16,0.85)', border: '1px solid rgba(52,211,153,0.4)' }}>
              <ImageIcon className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-emerald-300/90 font-medium">Suelta la foto — le paso OCR y saco los materiales</span>
            </div>
          </div>
        )}

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
            placeholder={escuchando
              ? 'Escuchando… dicta tu solicitud de compra'
              : 'Escribe, pega o dicta tu solicitud de compra. También puedes arrastrar una foto del albarán o de la pieza…'}
            rows={3}
            className="w-full bg-transparent text-base text-white/85 placeholder-white/22 resize-none leading-relaxed"
            style={{ minHeight: '80px', maxHeight: '220px' }}
            disabled={cargando}
          />
        </div>

        {/* Divider */}
        <div className="mx-5 h-px bg-white/[0.06]" />

        {/* Toolbar */}
        <div className="px-5 py-3.5 flex items-center justify-between gap-2 flex-wrap">
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
            {hayVoz && (
              <button
                onClick={toggleVoz}
                disabled={cargando}
                title={escuchando ? 'Parar dictado' : 'Dictar la solicitud por voz'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  borderColor: escuchando ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.08)',
                  background: escuchando ? 'rgba(248,113,113,0.08)' : 'transparent',
                  color: escuchando ? '#f87171' : 'rgba(255,255,255,0.4)',
                }}
              >
                {escuchando ? <MicOff className="w-3.5 h-3.5 animate-pulse" /> : <Mic className="w-3.5 h-3.5" />}
                <span>{escuchando ? 'Escuchando…' : 'Dictar'}</span>
              </button>
            )}
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

      {/* Ejemplos de un clic */}
      {!texto && !imagen && !cargando && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-white/20 uppercase tracking-widest font-semibold">Prueba con:</span>
          {EJEMPLOS.map((ej) => (
            <button
              key={ej}
              onClick={() => usarEjemplo(ej)}
              className="text-xs text-white/40 hover:text-white/70 px-2.5 py-1 rounded-full border border-white/08 hover:border-white/20 hover:bg-white/[0.03] transition-all"
            >
              {ej}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
