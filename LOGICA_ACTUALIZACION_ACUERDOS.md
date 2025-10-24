# Lógica de Actualización de Acuerdos Firmados - FR360

## 📋 Resumen Ejecutivo

Este documento explica cómo FR360 actualiza automáticamente el estado de las cuotas en la tabla de **Acuerdos Firmados** (`carteras` en Strapi), cruzando la información de los acuerdos con los datos de facturación real (ventas) para determinar si cada cuota está pagada, en mora o al día.

---

## 🎯 Objetivo

**Mantener sincronizado el estado de cada cuota de cada acuerdo**, comparando:
1. **Lo acordado** (tabla `carteras` en Strapi)
2. **Lo realmente pagado** (tabla `facturaciones` en Strapi, variable `lastFactRows` en frontend)

---

## 📊 Estructura de Datos

### **1. Tabla de Acuerdos (`carteras` en Strapi)**

Cada registro representa **una cuota** de un acuerdo. Campos relevantes:

```javascript
{
  documentId: "xyz123",              // ID único del registro en Strapi
  nro_acuerdo: "12345",              // Número del acuerdo (agrupa varias cuotas)
  cuota_nro: 1,                      // Número de esta cuota (1, 2, 3...)
  nro_cuotas: 6,                     // Total de cuotas del acuerdo
  valor_cuota: 500000,               // Valor de esta cuota en COP
  fecha_limite: "2025-11-15",        // Fecha límite de pago (formato ISO: YYYY-MM-DD)
  producto: { nombre: "Curso PRE" }, // Producto del acuerdo
  comercial: { nombre: "Juan" },     // Comercial que hizo la venta
  estado_firma: "firmado",           // "firmado" o "sin_firmar"

  // Campos que SE ACTUALIZAN automáticamente:
  estado_pago: "pagado",             // "pagado" | "en_mora" | "al_dia"
  fecha_de_pago: "2025-11-10",       // Fecha en que se pagó (formato ISO)
  valor_pagado: 500000,              // Valor realmente pagado

  // Campos opcionales:
  link_pago: "https://...",          // Link de pago normal
  id_pago: "123456",                 // ID del link en ePayco
  link_pago_mora: "https://...",     // Link de pago por mora
  id_pago_mora: "789012"             // ID del link de mora en ePayco
}
```

**Importante**: Un acuerdo de 6 cuotas = 6 registros en la tabla `carteras` con el mismo `nro_acuerdo`.

### **2. Tabla de Facturación (`facturaciones` en Strapi)**

Representa pagos reales recibidos. En frontend se carga como array `lastFactRows`:

```javascript
// Formato de cada fila: [Año, Mes, Día, Transacción, Comercial, Producto, ValorNeto, FechaInicio, PazYSalvo, Acuerdo, ...]
[
  2025,                              // [0] Año
  11,                                // [1] Mes
  10,                                // [2] Día
  "ePayco-12345",                    // [3] ID transacción
  "Juan",                            // [4] Comercial
  "Curso PRE - Cuota 1",             // [5] Producto facturado
  500000,                            // [6] Valor neto pagado
  "2025-01-15",                      // [7] Fecha inicio plataforma
  "",                                // [8] Paz y salvo
  "12345",                           // [9] Número de acuerdo
  // ... más campos
]
```

**Convenciones de nombres de productos en facturación:**
- Cuota normal: `"Curso PRE - Cuota 1"`
- Cuota con mora: `"Curso PRE - Cuota 1 (Mora)"`
- Pago final: `"Curso PRE - Paz y salvo"`

---

## 🔄 Flujo de Actualización

### **Paso 1: Cargar Datos**

Cuando el usuario busca una cédula:

```javascript
// 1. Cargar acuerdos del usuario
api.fetchAcuerdos(uid) → Array de cuotas (cada una es un registro de `carteras`)

// 2. Cargar ventas/facturación del usuario
api.fetchVentas(uid) → Array de pagos reales (se guarda en `lastFactRows`)
```

### **Paso 2: Renderizar Tabla de Acuerdos**

Se llama `renderAcuerdos(data)` que:

1. **Separa acuerdos firmados vs sin firmar**
2. **Agrupa por `nro_acuerdo`** (para mostrar varias cuotas juntas)
3. **Crea tabla HTML** con columnas:
   - Datos del acuerdo (nro, comercial, producto, valor total, nro cuotas)
   - Datos por cuota (cuota nro, valor, fecha límite, **estado**, **fecha pago**, **valor pagado**)

### **Paso 3: Resolución de Estado de Cada Cuota**

Para CADA fila (cuota) de la tabla, se ejecuta en paralelo:

#### **3.1. Marcar desde Ventas** (`markAsPaidFromVentas`)

```javascript
function markAsPaidFromVentas(tr) {
  // Extraer datos de la fila
  const cuota = Number(tr.dataset.cuotaNro);           // ej: 1
  const total = Number(tr.dataset.nroCuotas);          // ej: 6
  const acuerdo = tr.dataset.nroAcuerdo;               // ej: "12345"
  const productoBase = tr.dataset.productoNombre;      // ej: "Curso PRE"

  // Buscar TODAS las ventas que pagan esta cuota
  const ventas = findVentasFor(acuerdo, productoBase, cuota, total);

  if (!ventas.length) return false; // No hay pagos para esta cuota

  // CASO ESPECIAL: Última cuota con "Paz y salvo"
  const paz = ventas.find(v => String(v[5]).toLowerCase().includes('paz y salvo'));
  if (paz) {
    // Marcar como PAGADO con datos del paz y salvo
    tr.dataset.estadoPago = 'pagado';
    tr.dataset.fechaPago = formatDate(paz[0], paz[1], paz[2]);
    tr.dataset.valorPagado = paz[6].toString();
    // Actualizar celdas visibles en DOM
    return true;
  }

  // CASO NORMAL: Sumar "Cuota N" + "Cuota N (Mora)"
  return applyEstadoFromVentas(tr, ventas);
}
```

#### **3.2. Buscar Ventas Relacionadas** (`findVentasFor`)

```javascript
function findVentasFor(acuerdo, baseProd, cuota, total) {
  // Construir nombres posibles de productos a buscar
  const targets = [];

  // Si es la última cuota, incluir "Paz y salvo"
  if (cuota === total) {
    targets.push(`${baseProd} - Paz y salvo`);
  }

  // Siempre incluir la cuota normal y la de mora
  targets.push(`${baseProd} - Cuota ${cuota}`);
  targets.push(`${baseProd} - Cuota ${cuota} (Mora)`);

  // Normalizar strings (quitar tildes, minúsculas, espacios)
  const normalize = s => String(s||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  const wanted = new Set(targets.map(normalize));
  const acuerdoNorm = normalize(acuerdo);

  // Filtrar ventas que coincidan con acuerdo Y producto
  const matches = [];
  for (const row of lastFactRows) {
    if (normalize(row[9]) !== acuerdoNorm) continue;  // row[9] = Acuerdo
    if (wanted.has(normalize(row[5]))) {              // row[5] = Producto
      matches.push(row);
    }
  }

  // Ordenar por fecha ascendente (más antigua primero)
  matches.sort((a, b) => {
    const dateA = new Date(`${a[0]}-${a[1]}-${a[2]}`);
    const dateB = new Date(`${b[0]}-${b[1]}-${b[2]}`);
    return dateA - dateB;
  });

  return matches;
}
```

#### **3.3. Calcular Estado desde Ventas** (`applyEstadoFromVentas`)

```javascript
function applyEstadoFromVentas(tr, ventas) {
  const valorCuota = Number(tr.dataset.valorCuota || 0);

  // Sumar TODOS los pagos relacionados (incluyendo pagos parciales y moras)
  let suma = 0;
  let ultimaFecha = { y: 0, m: 0, d: 0 };

  for (const venta of ventas) {
    suma += Number(venta[6] || 0); // venta[6] = Valor neto

    // Actualizar última fecha de pago
    const y = Number(venta[0]);
    const m = Number(venta[1]);
    const d = Number(venta[2]);

    const fechaActual = Date.UTC(y, m - 1, d);
    const fechaPrevia = Date.UTC(ultimaFecha.y || 0, (ultimaFecha.m || 1) - 1, ultimaFecha.d || 1);

    if (!ultimaFecha.y || fechaActual >= fechaPrevia) {
      ultimaFecha = { y, m, d };
    }
  }

  // Tolerancia para centavos/redondeos (1000 COP)
  const TOLERANCIA = 1000;
  const pagadoCompleto = valorCuota ? (suma + TOLERANCIA >= valorCuota) : suma > 0;

  // Actualizar dataset y DOM
  const estado = pagadoCompleto ? 'pagado' : 'en_mora';
  const fecha = ultimaFecha.y ? `${ultimaFecha.d}/${ultimaFecha.m}/${ultimaFecha.y}` : '';
  const valor = suma ? suma.toLocaleString('es-CO') : '';

  tr.dataset.estadoPago = estado;
  tr.dataset.fechaPago = fecha;
  tr.dataset.valorPagado = suma.toString();

  // Actualizar celdas visibles
  tr.querySelector('.estado-cell').textContent = pagadoCompleto ? 'Pagado' : 'En mora';
  tr.querySelector('.fecha-pago-cell').textContent = fecha;
  tr.querySelector('.valor-pagado-cell').textContent = valor;

  return true;
}
```

#### **3.4. Verificar Vencimiento** (`checkIfOverdue`)

```javascript
function checkIfOverdue(tr) {
  const estadoActual = (tr.dataset.estadoPago || '').toLowerCase();

  // Solo recalcular si está "al_dia" (no tocar "pagado" ni "en_mora" ya establecidos)
  if (estadoActual !== 'al_dia') return;

  const fechaLimite = tr.dataset.fechaLimite; // "YYYY-MM-DD"
  if (!fechaLimite || fechaLimite === '1970-01-01') return;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const limite = new Date(fechaLimite + 'T00:00:00');

  // Si la fecha límite ya pasó, cambiar a "En mora"
  if (limite < hoy) {
    tr.dataset.estadoPago = 'en_mora';
    tr.querySelector('.estado-cell').textContent = 'En mora';
  }
}
```

#### **3.5. Actualizar Strapi** (`resolveRow` + backend)

```javascript
function resolveRow(tr, attempt) {
  // 1. Primero marcar desde ventas (ya ejecutado)
  markAsPaidFromVentas(tr);

  // 2. Extraer datos calculados
  const payload = {
    documentId: tr.dataset.documentId,              // ID del registro en Strapi
    nro_acuerdo: tr.dataset.nroAcuerdo,
    cuota_nro: tr.dataset.cuotaNro,

    // Datos YA calculados desde ventas
    estado_pago_calculado: tr.dataset.estadoPago,
    fecha_pago_calculada: tr.dataset.fechaPago,     // Formato: "DD/MM/YYYY"
    valor_pagado_calculado: Number(tr.dataset.valorPagado || 0)
  };

  // 3. Enviar al backend para actualizar Strapi
  api.resolvePagoYActualizarCartera(payload)
    .then(res => {
      // Backend confirma actualización
      // Si el backend calculó algo diferente, hidratar con su respuesta
      if (res && res.estado_pago) {
        hydrateRowFromResponse(tr, res, formatDate);
      }
    });
}
```

**Backend** (`services/fr360Service.js`):

```javascript
async function resolvePagoYActualizarCartera(payload) {
  // Extraer datos calculados del frontend
  const estadoCalculado = payload.estado_pago_calculado || '';
  const fechaCalculada = payload.fecha_pago_calculada || '';
  const valorCalculado = payload.valor_pagado_calculado;

  if (!estadoCalculado) return { estado_pago: '', fecha_de_pago: '', valor_pagado: null };

  // Convertir fecha de "DD/MM/YYYY" a "YYYY-MM-DD" (formato ISO)
  let fechaISO = null;
  if (fechaCalculada && fechaCalculada.includes('/')) {
    const [dia, mes, año] = fechaCalculada.split('/');
    fechaISO = `${año}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }

  // Actualizar en Strapi
  const url = `${STRAPI_BASE_URL}/api/carteras/${payload.documentId}`;
  await axios.put(url, {
    data: {
      estado_pago: estadoCalculado,      // "pagado" | "en_mora" | "al_dia"
      fecha_de_pago: fechaISO,           // "2025-11-10" o null
      valor_pagado: valorCalculado       // 500000 o null
    }
  }, {
    headers: {
      'Authorization': `Bearer ${STRAPI_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  // Retornar los valores actualizados
  return {
    estado_pago: estadoCalculado,
    fecha_de_pago: fechaISO || '',
    valor_pagado: valorCalculado
  };
}
```

---

## 🎨 Estilos Visuales de Acuerdo al Estado

Después de resolver todas las cuotas, se aplican estilos CSS:

```javascript
function applyGroupStyles() {
  const rows = tableDiv.querySelectorAll('tr[data-document-id]');
  const byAcuerdo = {}; // Agrupar filas por nro_acuerdo

  rows.forEach(tr => {
    // Verificar si está vencida
    checkIfOverdue(tr);

    const acuerdo = tr.dataset.nroAcuerdo;
    (byAcuerdo[acuerdo] = byAcuerdo[acuerdo] || []).push(tr);

    const estado = (tr.dataset.estadoPago || '').toLowerCase();

    // Estilos por fila
    if (estado === 'pagado')  tr.classList.add('row-paid');   // Verde claro
    if (estado === 'en_mora') tr.classList.add('row-mora');   // Rojo/Rosa claro
  });

  // Estilos por grupo de acuerdo
  Object.values(byAcuerdo).forEach(grupo => {
    const estados = grupo.map(tr => (tr.dataset.estadoPago || '').toLowerCase());
    const todosPagados = estados.every(s => s === 'pagado');
    const tieneMora = estados.some(s => s === 'en_mora');

    if (todosPagados) {
      grupo.forEach(tr => tr.classList.add('group-all-paid')); // Verde más intenso

      // Mostrar botón de "Paz y salvo" solo si TODO está pagado
      const psCell = grupo[0].querySelector('.paz-salvo-cell');
      if (psCell) {
        psCell.innerHTML = `<button class="ps-btn" title="Expedir paz y salvo">🔖</button>`;
      }
    }

    if (tieneMora) {
      grupo[0].classList.add('group-has-mora'); // Marca roja en celdas de cabecera
    }
  });
}
```

---

## 📝 Casos Especiales

### **Caso 1: Pago "Paz y Salvo"**

Si es la **última cuota** (`cuota_nro === nro_cuotas`) y existe una venta con producto que contiene "Paz y salvo":

- ✅ Se marca como **PAGADO** automáticamente
- ✅ Se usa la fecha y valor del pago "Paz y salvo"
- ✅ Ignora si la cuota normal fue pagada o no

### **Caso 2: Pagos Parciales + Moras**

Si una cuota tiene múltiples pagos:
- `"Curso PRE - Cuota 1"` → 300,000 COP
- `"Curso PRE - Cuota 1 (Mora)"` → 200,000 COP

Se **suman TODOS** los pagos relacionados:
- Total pagado: 500,000 COP
- Si `valor_cuota = 500,000` → Estado: **PAGADO** ✅

### **Caso 3: Cuota Vencida sin Pago**

Si:
- `fecha_limite = "2025-10-15"`
- Hoy es `2025-10-24`
- No hay pagos en ventas

Estado calculado: **EN MORA** ❌

### **Caso 4: Tolerancia de Centavos**

Se usa una tolerancia de **1000 COP** para manejar redondeos:

```javascript
const TOLERANCIA = 1000;
const pagadoCompleto = suma + TOLERANCIA >= valorCuota;
```

Ejemplo:
- `valor_cuota = 500,000`
- `suma pagos = 499,500`
- Diferencia: 500 COP < 1000 → Se considera **PAGADO** ✅

---

## 🔄 Flujo de Actualización (Diagrama de Secuencia)

```
Usuario busca cédula
    ↓
fetchAcuerdos(uid) → Obtiene cuotas del acuerdo desde Strapi
    ↓
fetchVentas(uid) → Obtiene pagos reales desde Strapi
    ↓
renderAcuerdos(data) → Construye tabla HTML
    ↓
Para cada fila (cuota):
    ↓
    markAsPaidFromVentas(tr)
        ↓
        findVentasFor(acuerdo, producto, cuota) → Busca pagos en lastFactRows
        ↓
        ¿Es última cuota con "Paz y salvo"?
            Sí → Marcar PAGADO con datos del paz y salvo
            No → applyEstadoFromVentas(tr, ventas)
                    ↓
                    Sumar todos los pagos relacionados
                    ↓
                    ¿Suma >= valor_cuota (con tolerancia)?
                        Sí → Estado: PAGADO
                        No → Estado: EN MORA
    ↓
    checkIfOverdue(tr) → Verificar si fecha_limite < hoy
    ↓
    resolveRow(tr) → Enviar datos calculados al backend
        ↓
        Backend actualiza Strapi (tabla carteras)
        ↓
        Retorna confirmación
    ↓
Cuando todas las filas terminan:
    ↓
    applyGroupStyles() → Aplicar estilos CSS según estados
```

---

## 🛠️ Implementación en Otro Script

Para implementar esta lógica en otro script (por ejemplo, un webhook que recibe notificaciones de pagos), necesitas:

### **1. Obtener Datos de Strapi**

```javascript
// Cargar todas las cuotas de un acuerdo
const acuerdos = await axios.get(
  `${STRAPI_BASE_URL}/api/carteras?filters[cedula][$eq]=${cedula}&populate=*`,
  { headers: { 'Authorization': `Bearer ${STRAPI_TOKEN}` } }
);

// Cargar todas las ventas del usuario
const ventas = await axios.get(
  `${STRAPI_BASE_URL}/api/facturaciones?filters[cedula][$eq]=${cedula}`,
  { headers: { 'Authorization': `Bearer ${STRAPI_TOKEN}` } }
);
```

### **2. Convertir Ventas al Formato de Array**

```javascript
const ventasArray = ventas.data.data.map(v => [
  v.attributes.año,
  v.attributes.mes,
  v.attributes.día,
  v.attributes.transaccion,
  v.attributes.comercial,
  v.attributes.producto,
  v.attributes.valor_neto,
  v.attributes.fecha_inicio,
  v.attributes.paz_y_salvo,
  v.attributes.nro_acuerdo,
  // ... más campos
]);
```

### **3. Para Cada Cuota, Buscar Pagos**

```javascript
for (const cuota of acuerdos.data.data) {
  const { nro_acuerdo, cuota_nro, nro_cuotas, producto, valor_cuota } = cuota.attributes;

  // Construir nombres posibles
  const targets = [];
  if (cuota_nro === nro_cuotas) {
    targets.push(`${producto.nombre} - Paz y salvo`);
  }
  targets.push(`${producto.nombre} - Cuota ${cuota_nro}`);
  targets.push(`${producto.nombre} - Cuota ${cuota_nro} (Mora)`);

  // Buscar en ventas
  const pagosRelacionados = ventasArray.filter(v =>
    String(v[9]) === String(nro_acuerdo) &&
    targets.some(t => normalize(v[5]) === normalize(t))
  );

  // Sumar pagos
  let suma = 0;
  let ultimaFecha = null;
  for (const pago of pagosRelacionados) {
    suma += Number(pago[6] || 0);
    const fecha = `${pago[0]}-${String(pago[1]).padStart(2,'0')}-${String(pago[2]).padStart(2,'0')}`;
    if (!ultimaFecha || fecha > ultimaFecha) ultimaFecha = fecha;
  }

  // Calcular estado
  const TOLERANCIA = 1000;
  const pagado = suma + TOLERANCIA >= valor_cuota;
  const estado = pagado ? 'pagado' : 'en_mora';

  // Actualizar Strapi
  await axios.put(
    `${STRAPI_BASE_URL}/api/carteras/${cuota.id}`,
    {
      data: {
        estado_pago: estado,
        fecha_de_pago: ultimaFecha,
        valor_pagado: suma
      }
    },
    { headers: { 'Authorization': `Bearer ${STRAPI_TOKEN}` } }
  );
}
```

### **4. Función de Normalización**

```javascript
function normalize(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}
```

---

## 📌 Puntos Clave para Recordar

1. **Un acuerdo = múltiples registros en `carteras`** (uno por cuota)
2. **Productos en facturación tienen convenciones de nombres**:
   - `"Producto - Cuota N"`
   - `"Producto - Cuota N (Mora)"`
   - `"Producto - Paz y salvo"`
3. **Se suman TODOS los pagos relacionados** (incluso parciales y moras)
4. **Tolerancia de 1000 COP** para redondeos
5. **"Paz y salvo" marca la última cuota como pagada** automáticamente
6. **Fechas se convierten entre formatos**:
   - Strapi: `"YYYY-MM-DD"`
   - Frontend display: `"DD/MM/YYYY"`
   - Ventas: `[Año, Mes, Día]`
7. **Estados posibles**: `"pagado"`, `"en_mora"`, `"al_dia"`

---

## 🔗 Archivos Relacionados

- **Frontend**: `public/js/app.js` → funciones `renderAcuerdos`, `findVentasFor`, `applyEstadoFromVentas`, `markAsPaidFromVentas`
- **Backend**: `services/fr360Service.js` → función `resolvePagoYActualizarCartera`
- **API Client**: `public/js/api-client.js` → método `resolvePagoYActualizarCartera`
- **Endpoint**: `index.js` → case `'resolvePagoYActualizarCartera'`

---

## ✅ Checklist de Implementación

Cuando implementes esto en otro script, asegúrate de:

- [ ] Conectar a Strapi con las credenciales correctas
- [ ] Cargar acuerdos filtrando por `cedula` o `nro_acuerdo`
- [ ] Cargar ventas del mismo usuario
- [ ] Implementar la función `normalize()` para comparar strings
- [ ] Construir los nombres posibles de productos (Cuota N, Cuota N (Mora), Paz y salvo)
- [ ] Sumar TODOS los pagos relacionados con cada cuota
- [ ] Aplicar tolerancia de 1000 COP
- [ ] Actualizar Strapi con `estado_pago`, `fecha_de_pago`, `valor_pagado`
- [ ] Manejar conversión de formatos de fecha correctamente
- [ ] Considerar el caso especial de "Paz y salvo" para última cuota
- [ ] Agregar logging para debugging

---

**Documento creado**: 2025-10-24
**Versión**: 1.0
**Autor**: FR360 Team
