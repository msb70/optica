// Especificación OpenAPI 3.1 de la API /v1 de Optilux (se sirve en GET /v1/openapi.json)
const page = { type: 'object', properties: { limite: { type: 'integer' }, hay_mas: { type: 'boolean' }, siguiente_cursor: { type: ['string', 'null'] } } }
const list = (ref: string) => ({ type: 'object', properties: { data: { type: 'array', items: { $ref: `#/components/schemas/${ref}` } }, paginacion: page } })
const ts = { type: 'string', format: 'date-time', description: 'ISO 8601 con zona horaria (-05:00)' }
const nts = { type: ['string', 'null'], format: 'date-time' }
const uuid = { type: 'string', format: 'uuid' }
const incr = [
  { name: 'updated_since', in: 'query', schema: ts, description: 'Devuelve lo modificado después de este momento' },
  { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'Valor de paginacion.siguiente_cursor de la página anterior' },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 } },
]
const idem = { name: 'Idempotency-Key', in: 'header', schema: { type: 'string', maxLength: 200 }, description: 'Reintentar con la misma clave devuelve la misma respuesta sin duplicar' }
const errs = {
  400: { description: 'Petición mal formada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  401: { description: 'Credencial ausente, no válida o revocada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  403: { description: 'Falta un permiso (se indica cuál en permiso_requerido)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  429: { description: 'Límite por minuto superado (cabecera Retry-After)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
}
const ok = (ref: string, isList = false, code = '200') => ({ [code]: { description: 'OK', content: { 'application/json': { schema: isList ? list(ref) : { $ref: `#/components/schemas/${ref}` } } } }, ...errs })
const byId = (tag: string, ref: string, scope: string) => ({ get: { tags: [tag], summary: `Obtener por id`, 'x-permiso': scope, parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }], responses: { ...ok(ref), 404: { description: 'No encontrado' } } } })

export const OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'Optilux API', version: '1.0.0',
    description: 'API de Optilux para el CRM, Zoho Books y los canales de Grupo Optilux.\n\n' +
      '- Autenticación: `Authorization: Bearer opx_test_…` (pruebas) o `opx_live_…` (producción). Credenciales de servicio con permisos por ámbito.\n' +
      '- Lecturas incrementales: `updated_since` + `cursor`; recorra páginas hasta `hay_mas = false`. No hay topes ocultos.\n' +
      '- Fechas: ISO 8601 con zona horaria explícita (-05:00). Identificadores UUID estables que no se reutilizan.\n' +
      '- Anulaciones: las facturas anuladas siguen visibles con `estado = anulada`; los borrados se consultan en `/eliminados`.\n' +
      '- Escrituras: `Idempotency-Key` o `id_externo` para reintentar sin duplicar. Errores de validación: todos a la vez en `campos`.\n' +
      '- Límites: 120 peticiones/minuto por credencial (ampliable para cargas iniciales). Respuesta 429 con `Retry-After`.\n' +
      '- Versionado: cambios incompatibles solo en una nueva versión (/v2) con 6 meses de aviso.',
  },
  servers: [{ url: 'https://dyjhhnplmzhptomwkrxq.supabase.co/functions/v1/api/v1' }],
  security: [{ bearer: [] }],
  tags: [{ name: 'Clientes' }, { name: 'Citas' }, { name: 'Facturación' }, { name: 'Inventario' }, { name: 'General' }],
  paths: {
    '/health': { get: { tags: ['General'], summary: 'Estado del servicio', security: [], responses: { 200: { description: 'OK' } } } },
    '/sucursales': { get: { tags: ['General'], summary: 'Sucursales visibles para la credencial', responses: ok('Sucursal', true) } },
    '/clientes': {
      get: { tags: ['Clientes'], summary: 'Listar / buscar clientes', 'x-permiso': 'clientes:leer', parameters: [...incr, { name: 'telefono', in: 'query', schema: { type: 'string' } }, { name: 'nombre', in: 'query', schema: { type: 'string' } }, { name: 'id_externo', in: 'query', schema: { type: 'string' } }], responses: ok('Cliente', true) },
      post: { tags: ['Clientes'], summary: 'Crear cliente (409 si el teléfono ya existe; con id_externo es idempotente)', 'x-permiso': 'clientes:escribir', parameters: [idem], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ClienteAlta' } } } }, responses: { ...ok('Cliente', false, '201'), 409: { description: 'Teléfono ya registrado (devuelve el cliente existente)' }, 422: { description: 'Errores de validación', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } } },
    },
    '/clientes/{id}': { ...byId('Clientes', 'Cliente', 'clientes:leer'), patch: { tags: ['Clientes'], summary: 'Actualizar cliente', 'x-permiso': 'clientes:escribir', parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }, idem], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/ClienteAlta' } } } }, responses: ok('Cliente') } },
    '/citas': {
      get: { tags: ['Citas'], summary: 'Listar citas (por sucursal y rango, o incremental)', 'x-permiso': 'citas:leer', parameters: [...incr, { name: 'sucursal_id', in: 'query', schema: uuid }, { name: 'desde', in: 'query', schema: ts }, { name: 'hasta', in: 'query', schema: ts }, { name: 'id_externo', in: 'query', schema: { type: 'string' } }], responses: ok('Cita', true) },
      post: { tags: ['Citas'], summary: 'Crear cita (idempotente por id_externo)', 'x-permiso': 'citas:escribir', parameters: [idem], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CitaAlta' } } } }, responses: { ...ok('Cita', false, '201'), 422: { description: 'Errores de validación' } } },
    },
    '/citas/{id}': { ...byId('Citas', 'Cita', 'citas:leer'), patch: { tags: ['Citas'], summary: 'Reagendar, cancelar, cambiar de sucursal o de estado. Cambiar el inicio marca la cita como reagendada.', 'x-permiso': 'citas:escribir', parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }, idem], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CitaCambio' } } } }, responses: ok('Cita') } },
    '/citas/{id}/asistencia': { get: { tags: ['Citas'], summary: 'Saber si el paciente asistió (examen o venta ese día), sin depender de que la sucursal cierre la cita', 'x-permiso': 'citas:leer', parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }], responses: ok('Asistencia') } },
    '/facturas': { get: { tags: ['Facturación'], summary: 'Facturas emitidas y anuladas (incremental)', 'x-permiso': 'facturas:leer', parameters: [...incr, { name: 'sucursal_id', in: 'query', schema: uuid }], responses: ok('Factura', true) } },
    '/facturas/{id}': byId('Facturación', 'Factura', 'facturas:leer'),
    '/notas-credito': { get: { tags: ['Facturación'], summary: 'Notas de crédito (incremental)', 'x-permiso': 'facturas:leer', parameters: incr, responses: ok('NotaCredito', true) } },
    '/cobros': { get: { tags: ['Facturación'], summary: 'Cobros aplicados a facturas (incremental)', 'x-permiso': 'cobros:leer', parameters: incr, responses: ok('Cobro', true) } },
    '/anticipos': { get: { tags: ['Facturación'], summary: 'Anticipos cobrados sobre órdenes de trabajo antes de facturar (incremental)', 'x-permiso': 'cobros:leer', parameters: incr, responses: ok('Anticipo', true) } },
    '/productos': { get: { tags: ['Inventario'], summary: 'Catálogo (incremental o búsqueda por código de barras, SKU o texto)', 'x-permiso': 'inventario:leer', parameters: [...incr, { name: 'codigo_barras', in: 'query', schema: { type: 'string' } }, { name: 'sku', in: 'query', schema: { type: 'string' } }, { name: 'q', in: 'query', schema: { type: 'string' } }], responses: ok('Producto', true) } },
    '/productos/{id}': byId('Inventario', 'Producto', 'inventario:leer'),
    '/existencias': { get: { tags: ['Inventario'], summary: 'Existencias por sucursal: unidades, reservadas y disponibles (se actualizan en cada movimiento)', 'x-permiso': 'inventario:leer', parameters: [...incr, { name: 'sucursal_id', in: 'query', schema: uuid }, { name: 'producto_id', in: 'query', schema: uuid }], responses: ok('Existencia', true) } },
    '/movimientos': { get: { tags: ['Inventario'], summary: 'Entradas, salidas y traslados (incremental por fecha del movimiento)', 'x-permiso': 'inventario:leer', parameters: [...incr, { name: 'sucursal_id', in: 'query', schema: uuid }], responses: ok('Movimiento', true) } },
    '/eliminados': { get: { tags: ['General'], summary: 'Registros eliminados (lápidas) por entidad', parameters: [{ name: 'entidad', in: 'query', required: true, schema: { enum: ['clientes', 'citas', 'facturas', 'cobros', 'productos', 'existencias'] } }, ...incr], responses: ok('Eliminado', true) } },
  },
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', description: 'Credencial de servicio opx_test_… / opx_live_…' } },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' }, campos: { type: 'object', additionalProperties: { type: 'string' } }, permiso_requerido: { type: 'string' } } },
      Sucursal: { type: 'object', properties: { id: uuid, codigo: { type: 'string' }, nombre: { type: 'string' }, compania_id: uuid, direccion: { type: ['string', 'null'] }, telefono: { type: ['string', 'null'] }, activa: { type: 'boolean' } } },
      Cliente: { type: 'object', properties: { id: uuid, codigo: { type: 'string' }, nombre: { type: 'string' }, apellido: { type: 'string' }, telefono: { type: 'string' }, email: { type: ['string', 'null'] }, cedula: { type: ['string', 'null'] }, sucursal_id: uuid, compania_id: uuid, origen: { type: 'string' }, sin_comunicaciones: { type: 'boolean' }, consentimiento_marketing: { type: 'boolean' }, consentimiento_marketing_fecha: nts, origen_externo: { type: ['string', 'null'] }, id_externo: { type: ['string', 'null'] }, creado: ts, modificado: ts } },
      ClienteAlta: { type: 'object', required: ['nombre', 'apellido', 'telefono', 'sucursal_id'], properties: { nombre: { type: 'string' }, apellido: { type: 'string' }, telefono: { type: 'string', example: '+50761234567' }, email: { type: 'string' }, cedula: { type: 'string' }, sucursal_id: uuid, sin_comunicaciones: { type: 'boolean' }, consentimiento_marketing: { type: 'boolean' }, canal: { type: 'string', example: 'whatsapp' }, id_externo: { type: 'string', description: 'Id del cliente en el CRM' } } },
      Cita: { type: 'object', properties: { id: uuid, sucursal_id: uuid, cliente_id: uuid, optometrista_id: { type: ['string', 'null'] }, inicio: ts, fin: ts, estado: { enum: ['agendada', 'confirmada', 'asistio', 'no_asistio', 'cancelada', 'reagendada'] }, canal: { type: ['string', 'null'] }, notas: { type: ['string', 'null'] }, motivo_cancelacion: { type: ['string', 'null'] }, reagendada_desde: { type: ['string', 'null'] }, origen_externo: { type: ['string', 'null'] }, id_externo: { type: ['string', 'null'] }, creado: ts, modificado: ts } },
      CitaAlta: { type: 'object', required: ['sucursal_id', 'cliente_id', 'inicio'], properties: { sucursal_id: uuid, cliente_id: uuid, inicio: ts, fin: ts, notas: { type: 'string' }, canal: { type: 'string', example: 'call_center' }, id_externo: { type: 'string' } } },
      CitaCambio: { type: 'object', properties: { inicio: ts, fin: ts, sucursal_id: uuid, estado: { enum: ['agendada', 'confirmada', 'asistio', 'no_asistio', 'cancelada', 'reagendada'] }, motivo_cancelacion: { type: 'string' }, notas: { type: 'string' } } },
      Asistencia: { type: 'object', properties: { cita_id: uuid, fecha: { type: 'string', format: 'date' }, estado_cita: { type: 'string' }, tuvo_examen: { type: 'boolean' }, tuvo_venta: { type: 'boolean' }, asistio: { type: 'boolean' } } },
      Factura: { type: 'object', properties: { id: uuid, numero: { type: 'string' }, serie: { type: 'string' }, consecutivo: { type: 'integer' }, fecha: ts, sucursal_id: uuid, compania_id: uuid, estado: { enum: ['emitida', 'anulada'] }, anulada_en: nts, estado_pago: { enum: ['pagada', 'parcial', 'devuelta'] }, paciente_id: uuid, facturar_a: { type: 'object', properties: { tipo: { enum: ['cliente', 'aseguradora', 'empresa'] }, nombre: { type: 'string' }, ruc: { type: ['string', 'null'] } } }, subtotal: { type: 'number' }, descuento: { type: 'number' }, impuesto: { type: 'number' }, total: { type: 'number' }, pagado: { type: 'number' }, lineas: { type: 'array', items: { type: 'object', properties: { producto_id: { type: ['string', 'null'] }, descripcion: { type: 'string' }, cantidad: { type: 'integer' }, precio_unitario: { type: 'number' }, descuento_pct: { type: 'number' }, total: { type: 'number' } } } }, orden_trabajo_id: { type: ['string', 'null'] }, ordenes_laboratorio: { type: 'array', items: { type: 'object' } }, fiscal: { type: 'object', description: 'Documento fiscal electrónico (pendiente de definir proveedor PAC)' }, creado: ts, modificado: ts } },
      NotaCredito: { type: 'object', properties: { id: uuid, numero: { type: 'string' }, factura_id: uuid, motivo: { type: 'string' }, total: { type: 'number' }, estado: { type: 'string' }, creado: ts, modificado: ts } },
      Cobro: { type: 'object', properties: { id: uuid, factura_id: uuid, factura_numero: { type: 'string' }, forma_pago: { enum: ['efectivo', 'tarjeta', 'transferencia', 'ach', 'yappy', 'vale', 'saldo_cliente', 'credito', 'anticipo'] }, tarjeta: { type: ['string', 'null'] }, monto: { type: 'number' }, referencia: { type: ['string', 'null'] }, caja_id: { type: ['string', 'null'] }, cuenta_deposito: { type: ['string', 'null'] }, fecha: ts, modificado: ts } },
      Anticipo: { type: 'object', properties: { id: uuid, orden_trabajo_id: uuid, orden_trabajo_numero: { type: 'string' }, forma_pago: { type: 'string' }, monto: { type: 'number' }, fecha: ts, modificado: ts } },
      Producto: { type: 'object', properties: { id: uuid, sku: { type: 'string' }, codigo_barras: { type: ['string', 'null'] }, descripcion: { type: 'string' }, categoria: { enum: ['montura', 'lente', 'lente_contacto', 'solar', 'accesorio', 'servicio'] }, marca: { type: ['string', 'null'] }, modelo: { type: ['string', 'null'] }, color: { type: ['string', 'null'] }, precio: { type: 'number' }, lista_precios: { type: 'string' }, impuesto_pct: { type: 'number' }, controla_stock: { type: 'boolean' }, activo: { type: 'boolean' }, modificado: ts } },
      Existencia: { type: 'object', properties: { id: uuid, producto_id: uuid, sucursal_id: uuid, unidades: { type: 'integer' }, reservadas: { type: 'integer' }, disponibles: { type: 'integer' }, ultimo_conteo: nts, modificado: ts } },
      Movimiento: { type: 'object', properties: { id: uuid, producto_id: uuid, sucursal_id: uuid, unidades: { type: 'integer' }, tipo: { type: 'string' }, documento_tipo: { type: ['string', 'null'] }, documento_id: { type: ['string', 'null'] }, fecha: ts } },
      Eliminado: { type: 'object', properties: { id: uuid, eliminado: ts } },
    },
  },
}
