'use client'

import { useState } from 'react'
import { Lock, ArrowRight } from 'lucide-react'

export default function AccesoPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  const entrar = async () => {
    if (!password || cargando) return
    setCargando(true)
    setError(null)
    try {
      const r = await fetch('/api/acceso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await r.json()
      if (data?.ok) {
        window.location.href = '/'
        return
      }
      setError(data?.error || 'Contraseña incorrecta')
    } catch {
      setError('No se pudo conectar. Inténtalo de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#08080f] flex items-center justify-center px-5">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99,102,241,0.08) 0%, transparent 70%)' }}
      />
      <div
        className="relative w-full max-w-sm rounded-2xl border p-8"
        style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}
        >
          <Lock className="w-5 h-5 text-indigo-300/80" />
        </div>
        <h1 className="text-xl font-bold text-white/92 mb-1.5">Asistente de Compras</h1>
        <p className="text-sm text-white/40 mb-6">Introduce la contraseña de acceso.</p>

        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') entrar() }}
          placeholder="Contraseña"
          className="w-full text-sm text-white/85 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-indigo-400/40 transition-colors placeholder-white/20"
        />

        {error && <p className="mt-3 text-xs text-red-400/80">{error}</p>}

        <button
          onClick={entrar}
          disabled={!password || cargando}
          className="mt-4 w-full flex items-center justify-center gap-2 text-sm font-semibold px-4 py-3 rounded-xl transition-all disabled:opacity-30"
          style={{ background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.35)', color: 'rgba(165,180,252,0.95)' }}
        >
          {cargando ? 'Comprobando…' : <>Entrar <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  )
}
