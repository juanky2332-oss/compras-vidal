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

export interface Recomendacion {
  cantidad: number
  material_detectado: string
  recomendacion_principal: RecomendacionPrincipal
  alternativas: Alternativa[]
  nivel_confianza: 'ALTO' | 'MEDIO' | 'BAJO'
  observaciones: string
  seleccionado?: boolean
  _fuzzyData?: FuzzyResult
}
