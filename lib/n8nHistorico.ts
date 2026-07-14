// Cliente servidor → webhook n8n del histórico (Google Sheet "historico vidal").
// Usado por /api/historico (datos) y /api/salud (diagnóstico sin datos).

// La URL del webhook no es secreta: va fija en el código para que un valor
// mal pegado en Vercel no rompa la sincronización. La env var solo se usa
// si apunta a un webhook válido (por si algún día cambia la instancia n8n).
const URL_WEBHOOK = 'https://paneln8n.transformaconia.com/webhook/historico-vidal'
const urlEnv = (process.env.N8N_HISTORICO_URL || '').trim()
const N8N_URL = urlEnv.startsWith('https://') && urlEnv.includes('/webhook/') ? urlEnv : URL_WEBHOOK

// El token sí es secreto y vive solo en las env vars (trim por si se pegó
// con un espacio o salto de línea final)
const N8N_TOKEN = (process.env.N8N_HISTORICO_TOKEN || '').trim()

export const nubeConfigurada = () => Boolean(N8N_TOKEN)

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
