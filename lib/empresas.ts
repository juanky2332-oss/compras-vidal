// ─────────────────────────────────────────────────────────────────────────
//  Empresas del grupo VIDAL GOLOSINAS para las que compra el departamento.
//  Cada compra del histórico lleva una empresa; si falta, se asume la matriz
//  (VIDAL GOLOSINAS) porque es la principal y la más frecuente.
// ─────────────────────────────────────────────────────────────────────────

export interface Empresa {
  nombre: string   // nombre completo (tal como se guarda en el sheet)
  corto: string    // etiqueta corta para chips y gráficas
  color: string    // acento visual
}

export const EMPRESAS: Empresa[] = [
  { nombre: 'VIDAL GOLOSINAS',       corto: 'VIDAL',      color: '#818cf8' },
  { nombre: 'CANDY SPAIN',           corto: 'CANDY',      color: '#fb7185' },
  { nombre: 'SWEET PACKING COMPANY', corto: 'SWEET PACK', color: '#fbbf24' },
  { nombre: 'VIDAL STORAGE',         corto: 'STORAGE',    color: '#38bdf8' },
  { nombre: 'MAINCO',                corto: 'MAINCO',     color: '#34d399' },
]

export const EMPRESA_DEFAULT = 'VIDAL GOLOSINAS'

// Vacío → empresa matriz; conocido con otra grafía → nombre canónico;
// desconocido → se conserva tal cual (no perder datos escritos a mano).
export function normalizarEmpresa(e?: string | null): string {
  const v = (e || '').trim()
  if (!v) return EMPRESA_DEFAULT
  const canon = EMPRESAS.find((x) => x.nombre === v.toUpperCase())
  return canon ? canon.nombre : v
}

export function empresaInfo(nombre?: string | null): Empresa {
  const n = normalizarEmpresa(nombre)
  return (
    EMPRESAS.find((x) => x.nombre === n) || { nombre: n, corto: n.slice(0, 12), color: '#a1a1aa' }
  )
}
