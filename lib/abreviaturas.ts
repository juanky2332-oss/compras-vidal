// Abreviaturas estilo SAP: el mismo criterio que usan las descripciones ya
// guardadas en la base de datos (histórico de compras), para poder generar un
// Txt.brv. corto a partir del texto del PEDIDO (no del que trae el código SAP
// encontrado) y que quede listo para copiar y pegar en SAP.
//
// Regla de oro: las medidas, referencias y códigos (1/2", DN50, 6204-2RS,
// M8, A-316, 45º, 15x15x1.5...) NUNCA se abrevian ni se eliminan, aunque haya
// que recortar el texto para caber en los 40 caracteres del campo Txt.brv. —
// son lo único que permite identificar de qué material se trata.

const ABREVIATURAS: Record<string, string> = {
  tornillo: 'torn', tornillos: 'torn',
  tuerca: 'tuec', tuercas: 'tuec',
  arandela: 'arand', arandelas: 'arand',
  esparrago: 'espag', esparragos: 'espag',
  abrazadera: 'abraz', abrazaderas: 'abraz', brazadera: 'abraz',
  galvanizado: 'galv', galvanizada: 'galv',
  inoxidable: 'inox',
  rodamiento: 'rodto', rodamientos: 'rodto', cojinete: 'rodto', chumacera: 'rodto',
  valvula: 'val', válvula: 'val',
  electrovalvula: 'val solenoide', solenoide: 'val solenoide',
  cilindro: 'cil', actuador: 'cil', piston: 'cil',
  filtro: 'filt', filtros: 'filt',
  motor: 'mot', motores: 'mot',
  reductor: 'reduc', motorreductor: 'mot reduc', motoreductor: 'mot reduc',
  contactor: 'cont',
  variador: 'inverter',
  fusible: 'fus',
  bomba: 'bba', bombas: 'bba',
  manguera: 'mangu', mangueras: 'mangu',
  casquillo: 'buje', manguito: 'buje',
  lubricante: 'lubric', grasa: 'lubric',
  junta: 'jta', juntas: 'jta', empaquetadura: 'jta',
  reten: 'ret', retén: 'ret',
  sensor: 'sens', detector: 'sens',
  plantilla: 'pletina',
  correa: 'correa', banda: 'correa',
  cadena: 'cad',
  pinon: 'piñon',
  interruptor: 'interr',
  transportadora: 'transp', transportador: 'transp',
  hidraulico: 'hidr', hidraulica: 'hidr',
  neumatico: 'neum', neumatica: 'neum',
  electrico: 'elec', electrica: 'elec',
  cuadrado: 'cdo', rectangular: 'rect', redondo: 'red',
  soporte: 'sop',
  conexion: 'conex', conector: 'conex',
}

// Palabras de relleno que un comprador NUNCA teclea en SAP: se eliminan
// siempre (no aportan nada para identificar el material).
const RUIDO = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'para', 'con', 'sin', 'por', 'una', 'uno', 'unos', 'unas',
  'unidad', 'unidades', 'ud', 'uds', 'pza', 'pzas', 'pieza', 'piezas',
  'tipo', 'aprox', 'aproximadamente', 'ref', 'referencia', 'marca', 'modelo', 'y', 'o', 'a', 'en',
])

// Sustantivo principal de la pieza: se conserva el máximo tiempo posible al
// recortar (identifica QUÉ es, aunque el resto del texto se tenga que quitar).
const SUSTANTIVOS_CLAVE = new Set([
  'tubo', 'tuberia', 'codo', 'machon', 'puntera', 'brida', 'varilla', 'perfil', 'angulo',
  'pletina', 'malla', 'rejilla', 'valvula', 'val', 'racor', 'abrazadera', 'abraz',
  'rodamiento', 'rodto', 'correa', 'cadena', 'pinon', 'piñon', 'motor', 'mot', 'reductor', 'reduc',
  'bomba', 'bba', 'cilindro', 'cil', 'sensor', 'sens', 'cable', 'manguera', 'mangu',
  'junta', 'jta', 'reten', 'ret', 'llave', 'vaso', 'tornillo', 'torn', 'tuerca', 'tuec',
  'arandela', 'arand', 'esparrago', 'espag', 'chapa', 'plancha', 'lamina', 'filtro', 'filt',
  'contactor', 'cont', 'variador', 'fusible', 'fus', 'casquillo', 'buje',
])

// Material / composición: identifica DE QUÉ es la pieza (inox, PVC, EPDM...).
// Igual de importante que el sustantivo principal, se conserva el máximo
// tiempo posible al recortar.
const MATERIALES = new Set([
  'inox', 'inoxidable', 'acero', 'pvc', 'epdm', 'viton', 'nbr', 'teflon', 'ptfe',
  'laton', 'bronce', 'aluminio', 'hierro', 'fundicion', 'galv', 'galvanizado', 'galvanizada',
  'nylon', 'poliuretano', 'caucho', 'cobre', 'plastico', 'polipropileno',
])

// Prefijos de norma/estándar que casi siempre van pegados a un número
// (DIN 985, SCH 40, PN 16, DN 50...). Sueltos no dicen nada, así que si van
// justo antes de una medida/referencia se promocionan a prioridad 3 (nunca
// se eliminan) para no perder la norma exacta al recortar.
const PREFIJOS_REFERENCIA = new Set(['din', 'iso', 'ansi', 'asme', 'astm', 'dn', 'nw', 'sch', 'pn', 'aisi', 'sae', 'jis', 'gost'])

function limpiarPalabra(p: string): string {
  return p
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// "1/2 pulgada", "1 1/2 pulgadas", "3/4 pulg" -> 1/2", 1 1/2", 3/4" — así es
// como aparecen las medidas en las descripciones SAP reales de esta BD.
function normalizarPulgadas(texto: string): string {
  return texto.replace(/(\d+(?:\s+\d+\/\d+|\/\d+)?)\s*(pulgadas?|pulg\.?)\b/gi, '$1"')
}

type Prioridad = 0 | 1 | 2 | 3
// 0 = ruido, se elimina siempre.
// 1 = palabra descriptiva normal, se recorta primero si hace falta.
// 2 = sustantivo clave (identifica el tipo de pieza), se recorta en último caso.
// 3 = medida / referencia / código (contiene algún dígito): NUNCA se elimina.
interface Token {
  texto: string
  prioridad: Prioridad
}

function clasificarToken(raw: string): Token {
  const limpio = limpiarPalabra(raw)
  if (!limpio) return { texto: '', prioridad: 0 }
  if (RUIDO.has(limpio)) return { texto: '', prioridad: 0 }
  if (/\d/.test(raw)) return { texto: raw.toUpperCase(), prioridad: 3 }

  const abrev = ABREVIATURAS[limpio]
  if (abrev) {
    const esClave = SUSTANTIVOS_CLAVE.has(limpio) || SUSTANTIVOS_CLAVE.has(abrev) || MATERIALES.has(limpio)
    return { texto: abrev.toUpperCase(), prioridad: esClave ? 2 : 1 }
  }
  const esClave = SUSTANTIVOS_CLAVE.has(limpio) || MATERIALES.has(limpio)
  return { texto: raw.toUpperCase(), prioridad: esClave ? 2 : 1 }
}

function unir(tokens: Token[]): string {
  return tokens
    .map((t) => t.texto)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Genera un texto breve estilo SAP a partir de la descripción del pedido:
// quita palabras de relleno, sustituye palabras conocidas por su abreviatura
// (misma lógica que el histórico de compras) y recorta al límite del campo
// Txt.brv. (40 caracteres). Si hace falta recortar, se eliminan antes las
// palabras descriptivas normales y, en último caso, los sustantivos clave —
// las medidas/referencias/códigos numéricos jamás se tocan.
export function abreviarDescripcionSAP(descripcion: string, maxLen = 40): string {
  const conPulgadas = normalizarPulgadas(descripcion ?? '')
  const palabras = conPulgadas.trim().split(/\s+/).filter(Boolean)
  const clasificados = palabras.map(clasificarToken)

  for (let i = 0; i < clasificados.length - 1; i++) {
    const limpio = limpiarPalabra(palabras[i])
    if (PREFIJOS_REFERENCIA.has(limpio) && clasificados[i + 1].prioridad === 3) {
      clasificados[i] = { texto: palabras[i].toUpperCase(), prioridad: 3 }
    }
  }

  const tokens = clasificados.filter((t) => t.prioridad > 0)

  let resultado = unir(tokens)
  if (resultado.length <= maxLen) return resultado

  for (const nivel of [1, 2] as const) {
    while (resultado.length > maxLen) {
      const idxDesdeElFinal = [...tokens].reverse().findIndex((t) => t.prioridad === nivel)
      if (idxDesdeElFinal === -1) break
      tokens.splice(tokens.length - 1 - idxDesdeElFinal, 1)
      resultado = unir(tokens)
    }
    if (resultado.length <= maxLen) break
  }

  // Último recurso (solo si incluso las medidas/referencias solas superan 40
  // caracteres, algo muy raro): corte duro sin partir una palabra si se puede.
  if (resultado.length > maxLen) {
    const corte = resultado.slice(0, maxLen)
    const ultimoEspacio = corte.lastIndexOf(' ')
    resultado = ultimoEspacio > maxLen * 0.6 ? corte.slice(0, ultimoEspacio).trim() : corte.trim()
  }

  return resultado
}
