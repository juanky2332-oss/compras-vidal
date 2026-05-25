import type { HistoricoRow, FuzzyMatch, ProveedorTop, FuzzyResult, Material } from './types'

const ACCENT_MAP: Record<string, string> = {
  'á':'a','à':'a','ä':'a','â':'a','ã':'a',
  'é':'e','è':'e','ë':'e','ê':'e',
  'í':'i','ì':'i','ï':'i','î':'i',
  'ó':'o','ò':'o','ö':'o','ô':'o','õ':'o',
  'ú':'u','ù':'u','ü':'u','û':'u',
  'ñ':'n','ç':'c',
  'Á':'a','À':'a','Ä':'a','Â':'a','Ã':'a',
  'É':'e','È':'e','Ë':'e','Ê':'e',
  'Í':'i','Ì':'i','Ï':'i','Î':'i',
  'Ó':'o','Ò':'o','Ö':'o','Ô':'o','Õ':'o',
  'Ú':'u','Ù':'u','Ü':'u','Û':'u',
  'Ñ':'n','Ç':'c',
}

function removeAccents(s: string): string {
  return s.split('').map((c) => ACCENT_MAP[c] ?? c).join('')
}

function norm(s: string | number | null | undefined): string {
  return removeAccents((s == null ? '' : String(s)).toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getField(row: HistoricoRow, ...names: string[]): string {
  for (const n of names) {
    const val = row[n]
    if (val !== undefined && val !== null && String(val).trim() !== '') return String(val)
  }
  const keys = Object.keys(row)
  const nn = (s: string) => removeAccents(s.toLowerCase()).replace(/\s+/g, '')
  for (const n of names) {
    const k = keys.find((k) => nn(k) === nn(n))
    if (k && row[k] !== undefined && String(row[k] ?? '').trim() !== '') return String(row[k])
  }
  return ''
}

function extractNombreProveedor(prov: string): string {
  const m = String(prov || '').match(/^\d+\s+(.+)$/)
  return m ? m[1].trim() : String(prov || '').trim()
}

function tokenList(s: string): string[] {
  return norm(s)
    .split(' ')
    .filter((t) => t.length >= 2)
}

export function isSapGenerico(sap: string | number | undefined | null): boolean {
  return /^0*599000000$/.test(String(sap || '').replace(/\s/g, ''))
}

interface HistoricoPrep {
  mat: string
  matBlob: string
  tokens: Set<string>
  allBlob: string
  sap: string
  prov: string
}

function scoreRow(p: HistoricoPrep, qTokens: string[], qFull: string): number {
  let score = 0
  if (qFull && p.matBlob === qFull) score += 20
  else if (qFull && p.matBlob.includes(qFull)) score += 10
  for (const t of qTokens) {
    if (!t || t.length < 2) continue
    if (p.tokens.has(t)) { score += 3; continue }
    if (p.matBlob.includes(t)) { score += 2; continue }
    let parcial = false
    for (const mt of p.tokens) {
      if (t.startsWith(mt) || mt.startsWith(t)) { score += 1; parcial = true; break }
    }
    if (!parcial && p.allBlob.includes(t)) score += 0.5
  }
  return score
}

export function buscarMateriales(materiales: Material[], historico: HistoricoRow[]): FuzzyResult[] {
  if (materiales.length === 0) {
    return [
      {
        consultaRaw: '(sin material identificable)',
        cantidad: 0,
        indice: 1,
        total: 1,
        matches: {
          historicoCompras: [],
          proveedoresHistoricoTop: [],
          hayMatchExacto: false,
          todosLosMatchesExactosSonGenericos: false,
          hayMatchExactoConSapReal: false,
          sapsRealesFamilia: [],
        },
        sinMaterial: true,
      },
    ]
  }

  const historicoPrep: HistoricoPrep[] = historico.map((r) => {
    const mat = getField(
      r,
      'Material',
      'material',
      'MATERIAL',
      'Texto breve',
      'Descripcion de material',
      'Descripcion material'
    )
    const matBlob = norm(mat)
    const tokens = new Set(matBlob.split(' ').filter((t) => t.length >= 2))
    const allBlob = norm(Object.values(r).join(' '))
    const sap = getField(
      r,
      'Código sap',
      'Codigo sap',
      'Codigo SAP',
      'codigo sap',
      'CODIGO SAP',
      'Codigo SAP/ Material',
      'Codigo SAP/Material',
      'código sap',
      'CÓDIGO SAP'
    )
    const prov = extractNombreProveedor(
      getField(r, 'Proveedor/Centro suministrador', 'Proveedor', 'proveedor', 'PROVEEDOR')
    )
    return { mat, matBlob, tokens, allBlob, sap, prov }
  })

  function buscarEnHistorico(qTokens: string[], qFull: string, max: number): FuzzyMatch[] {
    return historicoPrep
      .map((p) => ({ p, score: scoreRow(p, qTokens, qFull) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map((x) => ({
        proveedor: x.p.prov,
        codigoSAP: x.p.sap,
        sapEsGenerico: isSapGenerico(x.p.sap),
        material: x.p.mat,
        _score: Math.round(x.score * 10) / 10,
      }))
  }

  const resultados: FuzzyResult[] = []

  for (let i = 0; i < materiales.length; i++) {
    const item = materiales[i]
    const materialRaw = item.descripcion
    const cantidad = item.cantidad
    const qFull = norm(materialRaw)
    const qTokens = tokenList(materialRaw)
    const matchesHistorico = buscarEnHistorico(qTokens, qFull, 12)

    const provData: Record<
      string,
      { peso: number; sapEjemplo: string; sapEjemploEsReal: boolean; materialEjemplo: string }
    > = {}

    for (const h of matchesHistorico) {
      if (!h.proveedor) continue
      if (!provData[h.proveedor]) {
        provData[h.proveedor] = { peso: 0, sapEjemplo: '', sapEjemploEsReal: false, materialEjemplo: '' }
      }
      provData[h.proveedor].peso += h._score
      if (!provData[h.proveedor].sapEjemploEsReal && !h.sapEsGenerico && h.codigoSAP) {
        provData[h.proveedor].sapEjemplo = h.codigoSAP
        provData[h.proveedor].sapEjemploEsReal = true
        provData[h.proveedor].materialEjemplo = h.material
      } else if (!provData[h.proveedor].sapEjemplo) {
        provData[h.proveedor].sapEjemplo = h.codigoSAP || ''
        provData[h.proveedor].materialEjemplo = h.material
      }
    }

    const proveedoresHistoricoTop: ProveedorTop[] = Object.entries(provData)
      .sort((a, b) => b[1].peso - a[1].peso)
      .slice(0, 4)
      .map(([nombre, d]) => ({
        nombre,
        peso: Math.round(d.peso * 10) / 10,
        sapEjemplo: d.sapEjemplo,
        sapEjemploEsReal: d.sapEjemploEsReal,
        materialEjemplo: d.materialEjemplo,
      }))

    const hayMatchExacto = matchesHistorico.some((m) => m._score >= 10)
    const matchesConSapReal = matchesHistorico.filter((m) => !m.sapEsGenerico && m.codigoSAP)
    const todosLosMatchesExactosSonGenericos =
      hayMatchExacto && matchesHistorico.filter((m) => m._score >= 10).every((m) => m.sapEsGenerico)

    resultados.push({
      consultaRaw: materialRaw,
      cantidad,
      indice: i + 1,
      total: materiales.length,
      matches: {
        historicoCompras: matchesHistorico,
        proveedoresHistoricoTop,
        hayMatchExacto,
        todosLosMatchesExactosSonGenericos,
        hayMatchExactoConSapReal: matchesHistorico.some(
          (m) => m._score >= 10 && !m.sapEsGenerico && m.codigoSAP
        ),
        sapsRealesFamilia: matchesConSapReal.slice(0, 5).map((m) => ({
          codigoSAP: m.codigoSAP,
          material: m.material,
          proveedor: m.proveedor,
          _score: m._score,
          sapEsGenerico: m.sapEsGenerico,
        })),
      },
      sinMaterial: false,
    })
  }

  return resultados
}
