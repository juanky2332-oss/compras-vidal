# Compras Vidal

Asistente de compras industriales con IA para Vidal Golosinas. Escribes (o pegas una foto de) una solicitud de compra y la app identifica cada material, explica qué es, propone el proveedor habitual y los códigos SAP reales del histórico — todo listo para pegar en SAP ME51N/ME21N.

## Cómo funciona

```
Texto / imagen
   │
   ├─ 1. /api/ocr        → GPT-4o-mini Vision lee la imagen (opcional)
   ├─ 2. /api/extract    → GPT-4o-mini separa los materiales y cantidades
   ├─ 3. /api/recommend  → por cada material:
   │       a) GPT-4o-mini genera variantes de búsqueda estilo SAP
   │       b) Motor determinístico de 5 pasos (lib/algoritmo.ts) busca en la BD
   │       c) GPT-4o redacta la respuesta final (ficha técnica, proveedor, SAPs)
   │       ⚠ Los códigos SAP se validan SIEMPRE contra la BD — nunca se inventan
   └─ 4. UI: tarjetas por material → selección → export TSV por proveedor
```

### Motor de 5 pasos (`lib/algoritmo.ts`)
1. **Marca** → tabla MARCAS_A_PROVEEDOR (+ overrides inox por sub-tipo)
2. **Tipo de material** → palabras clave de GUIA_POR_TIPO_MATERIAL
3. **Código SAP** → lookup directo en SAP_HISTORICO
4. **Categoría** → mejor proveedor por volumen de compras
5. **Sin match** → pedir aclaración (nunca inventar)

### Niveles de confianza y tipo de match
- **ALTO / MEDIO / BAJO**: fiabilidad de la recomendación según el paso determinante.
- **EXACTO / PARCIAL / EQUIVALENTE / SIN_MATCH**: exactitud de la referencia/medida encontrada. Los códigos `~ aprox.` requieren verificar medida antes de pedir.

## Secciones de fábrica

Vista independiente (pestaña **Secciones**) para llevar el histórico de compras por departamento: Producción, Planta Piloto, Empaquetado, Regaliz, Expediciones, Espumoso, Caramelo Blando, Caramelo Duro… (editables, se pueden crear más).

- Cada compra registra: fecha, código SAP (con autocompletado desde la BD), descripción, cantidad, precio aproximado €/ud y proveedor.
- Dos vistas por sección: **Histórico** (cronológico, cantidad y precio editables en línea) y **Por artículo** (agrupado por SAP: veces comprado, unidades, último precio, gasto acumulado).
- Desde el asistente, el botón **"Guardar en sección"** registra las líneas del pedido analizado en el departamento que elijas (el precio se completa después).
- Export CSV por sección + **Backup/Restaurar** JSON de todas las secciones.
- ⚠ Los datos viven en `localStorage` del navegador (clave `cv_secciones_v1`): descarga un backup periódicamente y úsalo para pasar los datos a otro equipo.

## Base de datos (`data/`)

| Fichero | Contenido |
|---|---|
| `marcas_a_proveedor.json` | 85 marcas → proveedor principal + alternativa |
| `guia_por_tipo_material.json` | Tipos de material con palabras clave de detección |
| `proveedores.json` | 245 proveedores con categoría y volumen 2025–2026 |
| `sap_historico.json` | 6.368 SAPs comprados con proveedor habitual |
| `catalogo_sap.json` | *(pendiente)* Catálogo SAP completo, sin historial de compra |
| `fuentes/` | Excel original + históricos (no se usan en runtime) |

Los datos están **fuera de `public/`** a propósito: el histórico de compras no debe ser descargable desde la URL pública. Se cargan server-side (`lib/dbLoader.ts`) con caché en memoria.

### Actualizar la base de datos
1. Actualiza `data/fuentes/BASE_DATOS_COMPRAS_PROVEEDORES_v2.xlsx`.
2. Regenera los JSON con los scripts de parseo (`parse_excel2.py` / `extract_all_data.py`).
3. Para activar el catálogo SAP completo: añade al Excel una pestaña **"codigos sap y material"** (export de SAP con código + descripción de TODOS los materiales) y ejecuta `python scripts/extract_catalogo_sap.py`.

## Desarrollo

```bash
npm install
cp .env.local.example .env.local   # añade tu OPENAI_API_KEY
npm run dev
```

## Deploy (Vercel)

- Variable de entorno obligatoria: `OPENAI_API_KEY`.
- Opcionales: `OPENAI_MODEL_RAZONADOR` (default `gpt-4o`), `OPENAI_MODEL_RAPIDO` (default `gpt-4o-mini`).
- Los JSON de `data/` se incluyen en las funciones serverless vía `outputFileTracingIncludes` (ver `next.config.js`).
- Export SAP: Centro `1001` · Almacén `100`.
