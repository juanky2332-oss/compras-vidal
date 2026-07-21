export interface Material {
  descripcion: string
  cantidad: number
}

// ── Tipos del motor v2 ──

export type TipoMatch = 'EXACTO' | 'PARCIAL' | 'EQUIVALENTE' | 'SIN_MATCH'

export interface FichaTecnica {
  descripcion: string   // qué es en 1 frase
  uso: string           // para qué sirve y dónde se monta
  datos_clave: string[] // specs principales (medida, material, potencia…)
}

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
  tipoMatch?: TipoMatch   // calidad del match de búsqueda en BD
  ficha_tecnica?: FichaTecnica
  motivo: string
  observaciones: string
  seleccionado: boolean
  _pasoDeterminante: number
  leyendaMedidas?: string  // p.ej. "NW/DN 50 = 2"  ·  2" = NW/DN 50"
}

export interface ItemPedidoUnificado {
  indice: number
  descripcion: string
  cantidad: number
  proveedor_asignado: { nombre: string; codigo: string } | null
  unificado: boolean
  nota_unificacion: string | null
}

// Selección manual del usuario por cada material (tarjeta MaterialCard).
// Parte de los valores que dio la IA, pero el usuario puede cambiarlos.
export interface SeleccionPedido {
  indice: number              // índice del material en recomendaciones
  incluido: boolean           // si va al pedido final
  sapElegido: string          // código SAP 502... elegido (o '' = texto libre)
  sapDescripcion: string      // descripción del SAP elegido (para mostrar)
  sapAproximado: boolean      // si el SAP elegido era aproximado (~)
  proveedorNombre: string     // proveedor elegido
  proveedorCodigo: string     // código del proveedor elegido
  cantidad: number

  // Precio importado de una oferta de proveedor (ver ImportarOfertaPrecios), en
  // formato SAP listo para pegar en ME21N/ME51N (columnas Prc.neto / Mon. / por).
  precioUnitario?: number     // precio real por unidad, redondeado a 4 decimales
  precioSAP?: string          // valor a escribir en "Prc.neto" (con coma o entero según multiplicador)
  multiplicador?: number      // valor numérico del campo "por" (1, 1000, 10000...)
  moneda?: string             // 'EUR' por defecto
}

// Línea calculada por /api/oferta-precios a partir del texto libre de una oferta.
export interface LineaOfertaPrecio {
  descripcion: string
  cantidad: number
  descuentoPct: number        // 0 si la oferta no menciona descuento
  importeTotal: number        // importe NETO de la línea (con el descuento ya aplicado)
  precioUnitario: number
  precioUnitarioLabel: string
  precioSAP: string
  multiplicador: number
  multiplicadorLabel: string
}

export interface ProveedorSimple {
  codigo: string
  nombre: string
}

// Último precio pagado por un SAP según el histórico de secciones (Google Sheet)
export interface PrecioHistorico {
  precio: number
  fecha: string      // 'YYYY-MM-DD'
  proveedor: string
}

export interface SapSearchResult {
  codigo: string
  descripcion: string
  proveedor: string
  veces: number
  fuente?: 'historico' | 'catalogo'  // catálogo = existe en SAP pero sin historial de compra
}
