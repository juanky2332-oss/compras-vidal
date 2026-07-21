// Conversión de precio unitario a formato SAP (campos Prc.neto / Mon. / por de ME21N-ME51N).
//
// Reglas (definidas por el usuario):
// 1) Precio unitario = Importe total ÷ Cantidad, redondeado a 4 decimales.
// 2) Si el precio unitario tiene <= 2 decimales reales -> se deja tal cual, multiplicador ×1.
// 3) Si tiene 3 decimales -> precio SAP = precio×1.000 (entero), multiplicador ×1.000.
// 4) Si tiene 4 decimales -> precio SAP = precio×10.000 (entero), multiplicador ×10.000.
// 5) Se eliminan los decimales sobrantes cuando el precio es un entero (6,0 -> 6).
// Verificación: Precio SAP ÷ Multiplicador == Precio unitario (dentro del redondeo a 4 decimales).

export interface FormatoSAP {
  precioUnitario: number      // valor real por unidad, redondeado a 4 decimales
  precioUnitarioLabel: string // p.ej. "3,846" o "3,50" (con coma, solo los decimales reales)
  decimales: number           // nº de decimales reales del precio unitario (0-4)
  precioSAP: string           // valor a escribir en el campo "Prc.neto" de SAP
  precioSAPNumero: number     // mismo valor pero numérico
  multiplicador: number       // valor numérico del campo "por" (1, 1000, 10000...)
  multiplicadorLabel: string  // p.ej. "×1", "×1.000 (3 ceros)", "×10.000 (4 ceros)"
}

function redondear4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000
}

// Cuenta los decimales "reales" de un número ya redondeado a 4 decimales,
// ignorando ceros de cola (6,50 -> 2 decimales; 6,00 -> 0 decimales), pero
// respetando el formato monetario habitual: un precio no entero siempre se
// muestra con un mínimo de 2 decimales (3,5 -> 3,50, nunca 3,5).
function decimalesReales(n: number): number {
  if (Number.isInteger(n)) return 0
  const str = n.toFixed(4) // ej "3.8460" / "3.5000"
  const sinCerosCola = str.replace(/0+$/, '').replace(/\.$/, '')
  const punto = sinCerosCola.indexOf('.')
  const d = punto === -1 ? 0 : sinCerosCola.length - punto - 1
  return d > 0 && d < 2 ? 2 : d
}

function conComa(n: number, decimales: number): string {
  return n.toFixed(decimales).replace('.', ',')
}

// Separador de miles manual: no depende de Intl/toLocaleString, cuyo soporte de
// agrupación varía entre versiones de Node (p.ej. 1000 -> "1000" sin punto en
// algunos runtimes si no se fuerza useGrouping). Solo para enteros positivos.
export function agruparMiles(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function calcularFormatoSAP(importeTotal: number, cantidad: number): FormatoSAP {
  const cant = cantidad > 0 ? cantidad : 1
  const precioUnitario = redondear4(importeTotal / cant)
  const decimales = decimalesReales(precioUnitario)

  let multiplicador = 1
  let precioSAPNumero = precioUnitario

  if (decimales > 2) {
    multiplicador = Math.pow(10, decimales)
    precioSAPNumero = Math.round(precioUnitario * multiplicador)
  }

  const precioSAP = multiplicador === 1 ? conComa(precioSAPNumero, decimales) : String(precioSAPNumero)

  const multiplicadorLabel =
    multiplicador === 1
      ? '×1'
      : `×${agruparMiles(multiplicador)} (${decimales} cero${decimales > 1 ? 's' : ''})`

  return {
    precioUnitario,
    precioUnitarioLabel: conComa(precioUnitario, decimales),
    decimales,
    precioSAP,
    precioSAPNumero,
    multiplicador,
    multiplicadorLabel,
  }
}

// Importe neto de una línea cuando la oferta da precio de tarifa (bruto) + % descuento.
// Si no hay descuento (0 o undefined), devuelve el bruto tal cual.
export function importeNetoConDescuento(precioUnitarioBruto: number, cantidad: number, descuentoPct?: number): number {
  const pct = descuentoPct && descuentoPct > 0 ? descuentoPct : 0
  const bruto = precioUnitarioBruto * cantidad
  return redondear4(bruto * (1 - pct / 100))
}
