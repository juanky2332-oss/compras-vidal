// Cliente servidor → webhook n8n del histórico (Google Sheet "historico vidal").
// Usado por /api/historico (datos) y /api/salud (diagnóstico sin datos).

// trim: al pegar valores en el panel de Vercel es fácil colar un espacio o
// salto de línea final, y eso convierte la URL/token en inválidos (404/401)
const N8N_URL = (process.env.N8N_HISTORICO_URL || '').trim()
const N8N_TOKEN = (process.env.N8N_HISTORICO_TOKEN || '').trim()

export const nubeConfigurada = () => Boolean(N8N_URL && N8N_TOKEN)

// Errores distinguibles: 'token-rechazado' (n8n responde vacío cuando el token
// no coincide) vs fallo de red/servidor.
export async function llamarN8n(payload: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(N8N_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-historico-token': N8N_TOKEN },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  const texto = await res.text()
  if (!res.ok) throw new Error(`n8n-${res.status}`)
  if (!texto) throw new Error('token-rechazado')
  return JSON.parse(texto)
}
