export interface Material {
  descripcion: string
  cantidad: number
}

export interface HistoricoRow {
  [key: string]: string | number | undefined
}

export interface FuzzyMatch {
  proveedor: string
  codigoSAP: string
  sapEsGenerico: boolean
  material: string
  _score: number
}

export interface ProveedorTop {
  nombre: string
  peso: number
  sapEjemplo: string
  sapEjemploEsReal: boolean
  materialEjemplo: string
}

export interface FuzzyResult {
  consultaRaw: string
  cantidad: number
  indice: number
  total: number
  matches: {
    historicoCompras: FuzzyMatch[]
    proveedoresHistoricoTop: ProveedorTop[]
    hayMatchExacto: boolean
    todosLosMatchesExactosSonGenericos: boolean
    hayMatchExactoConSapReal: boolean
    sapsRealesFamilia: FuzzyMatch[]
  }
  sinMaterial: boolean
}

export interface Alternativa {
  proveedor: string
  codigo_sap: string
  material_historico: string
  nota: string
}

export interface RecomendacionPrincipal {
  proveedor: string
  codigo_sap: string
  sap_status: 'confirmado' | 'sin_codificar' | 'aproximado' | 'ninguno'
  material_historico: string
  motivo: string
}

// Legacy type (kept for backward compat)
export interface Recomendacion {
  cantidad: number
  material_detectado: string
  recomendacion_principal: RecomendacionPrincipal
  alternativas: Alternativa[]
  nivel_confianza: 'ALTO' | 'MEDIO' | 'BAJO'
  observaciones: string
  seleccionado?: boolean
  _fuzzyData?: FuzzyResult
  tipo_material?: string
  marca_detectada?: string
  proveedor_recomendado?: { nombre: string; codigo: string }
  alternativas_nuevas?: Array<{ nombre: string; codigo: string; nota?: string }>
  codigos_sap_sugeridos?: SapSugeridoUI[]
  motivo?: string
  _pasoDeterminante?: number
}

// ── Tipos nuevos del motor v2 ──

export interface SapSugeridoUI {
  codigo: string
  descripcion: string
  proveedor: string
  aproximado?: boolean   // true si la medida no es exacta (marcado con ~)
  nota?: string          // "Medida no exacta: pedido 15x15, SAP 20x20. Verificar."
}

export interface RecomendacionNueva {
  cantidad: number
  material_detectado: string
  descripcion: string
  categoria: string
  tipo_material: string
  marca_detectada: string
  proveedor_recomendado: { nombre: string; codigo: string }
  alternativas: Array<{ nombre: string; codigo: string; nota?: string }>
  codigos_sap_sugeridos: SapSugeridoUI[]
  nivel_confianza: 'ALTO' | 'MEDIO' | 'BAJO'
  motivo: string
  observaciones: string
  seleccionado: boolean
  _pasoDeterminante: number
}

export interface ItemPedidoUnificado {
  indice: number
  descripcion: string
  cantidad: number
  proveedor_asignado: { nombre: string; codigo: string } | null
  unificado: boolean
  nota_unificacion: string | null
}
