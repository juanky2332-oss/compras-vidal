// Cliente servidor → webhook n8n del histórico (Google Sheet "historico vidal").
// Usado por /api/historico (datos) y /api/salud (diagnóstico sin datos).

const N8N_URL = process.env.N8N_HISTORICO_URL || ''
const N8N_TOKEN = process.env.N8N_HISTORICO_TOKEN || ''

export const nubeConfigurada = () => Boolean(N8N_URL && N8N_TOKEN)

// Errores distinguibles: 'token-rechazado' (n8n responde vacío cuando el token
// no coincide) vs fallo de red/servidor.
export async function llamarN8n(payload: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(N8N_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-historico-token': N8N_TOKEN.trim() },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  const texto = await res.text()
  if (!res.ok) throw new Error(`n8n-${res.status}`)
  if (!texto) throw new Error('token-rechazado')
  return JSON.parse(texto)
}
