// Abreviaturas estilo SAP: el mismo criterio que usan las descripciones ya
// guardadas en la base de datos (histórico de compras), para poder generar un
// Txt.brv. corto a partir del texto del PEDIDO (no del que trae el código SAP
// encontrado) y que quede listo para copiar y pegar en SAP.
const ABREVIATURAS: Record<string, string> = {
  tornillo: 'torn',
  tornillos: 'torn',
  tuerca: 'tuec',
  tuercas: 'tuec',
  arandela: 'arand',
  arandelas: 'arand',
  esparrago: 'espag',
  esparragos: 'espag',
  abrazadera: 'abraz',
  abrazaderas: 'abraz',
  brazadera: 'abraz',
  galvanizado: 'galv',
  galvanizada: 'galv',
  inoxidable: 'inox',
  rodamiento: 'rodto',
  rodamientos: 'rodto',
  cojinete: 'rodto',
  chumacera: 'rodto',
  valvula: 'val',
  válvula: 'val',
  electrovalvula: 'val solenoide',
  solenoide: 'val solenoide',
  cilindro: 'cil',
  actuador: 'cil',
  piston: 'cil',
  filtro: 'filt',
  filtros: 'filt',
  motor: 'mot',
  motores: 'mot',
  reductor: 'reduc',
  motorreductor: 'mot reduc',
  motoreductor: 'mot reduc',
  contactor: 'cont',
  variador: 'inverter',
  fusible: 'fus',
  bomba: 'bba',
  bombas: 'bba',
  manguera: 'mangu',
  mangueras: 'mangu',
  casquillo: 'buje',
  manguito: 'buje',
  lubricante: 'lubric',
  grasa: 'lubric',
  junta: 'jta',
  juntas: 'jta',
  empaquetadura: 'jta',
  reten: 'ret',
  retén: 'ret',
  sensor: 'sens',
  detector: 'sens',
  plantilla: 'pletina',
  pletina: 'pletina',
}

function limpiarPalabra(p: string): string {
  return p
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// Genera un texto breve estilo SAP a partir de la descripción del pedido:
// sustituye cada palabra conocida por su abreviatura (misma lógica que el
// histórico de compras) y recorta al límite del campo Txt.brv. de SAP (40
// caracteres) sin cortar una palabra por la mitad si se puede evitar.
export function abreviarDescripcionSAP(descripcion: string, maxLen = 40): string {
  const palabras = (descripcion ?? '').trim().split(/\s+/).filter(Boolean)
  const abreviadas = palabras.map((p) => ABREVIATURAS[limpiarPalabra(p)] || p)

  let resultado = abreviadas.join(' ').toUpperCase().replace(/\s+/g, ' ').trim()
  if (resultado.length > maxLen) {
    const corte = resultado.slice(0, maxLen)
    const ultimoEspacio = corte.lastIndexOf(' ')
    resultado = ultimoEspacio > maxLen * 0.6 ? corte.slice(0, ultimoEspacio).trim() : corte.trim()
  }
  return resultado
}
