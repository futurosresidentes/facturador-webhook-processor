# 🚀 Flujo Optimizado V2 - Pasos 1-3 Implementados

## ✅ Lo que Hemos Implementado

### 1. Sistema de Reintentos Global

✅ **Archivo:** `src/utils/retryHelper.js`

- Helper reutilizable para todas las operaciones
- 5 intentos por defecto
- 1 segundo de delay entre intentos
- Logs detallados de cada intento

**Uso:**
```javascript
const { retryOperation } = require('../utils/retryHelper');

await retryOperation(async () => {
  // Tu código aquí
}, {
  maxRetries: 5,
  delayMs: 1000,
  operationName: 'Mi Operación'
});
```

---

### 2. Captura de Nuevos Campos del Webhook

✅ **Modelo actualizado:** `src/models/Webhook.js`

**Nuevos campos agregados:**
- `customer_city` - Ciudad del cliente
- `customer_address` - Dirección del cliente

**Normalización automática:**
- "N/A" → `null`
- Strings vacíos → `null`
- Trim automático de espacios

---

### 3. Validación Anti-Duplicados

✅ **Controlador:** `src/controllers/webhookController.js`

**Protección implementada:**
- Verifica si existe un webhook con el mismo `ref_payco` en estado `processing`
- Si existe, marca el nuevo como `duplicate` y NO lo procesa
- Retorna referencia al webhook original que está procesándose

**Nuevo status:** `duplicate`

---

### 4. FR360 Service Mejorado

✅ **Archivo:** `src/services/fr360Service.js`

**Campos capturados:**
- `salesRep` / `comercial`
- `identityDocument` / `cedula`
- `givenName` / `nombres`
- `familyName` / `apellidos`
- `email` / `correo`
- `phone` / `telefono`
- `product`
- `amount`
- `agreementId` / `nroAcuerdo`
- `accessDate` / `fechaInicio`

**Aliases:** Cada campo tiene un alias en español para facilitar uso.

---

### 5. CRM Service V2 - Estrategia Create-First

✅ **Archivo:** `src/services/crmService.v2.js`

**Nueva estrategia:**
1. ✅ Intenta **CREAR** el contacto primero
2. ✅ Si retorna error de duplicado → **BUSCA** el contacto
3. ✅ **ACTUALIZA** el contacto existente

**Funciones:**
- `createContact(data)` - Intenta crear
- `findContactByEmail(email)` - Busca por email
- `updateContact(contactId, data)` - Actualiza existente
- `createOrUpdateContact(paymentData, webhookData)` - **Función principal**
- `normalizePhone(telefono)` - Normaliza teléfono (+57)

**Normalización de teléfono:**
```javascript
// Si es 3001234567 → +573001234567
// Si ya tiene +57 → Sin cambios
```

**Campos personalizados en ActiveCampaign:**
- Field 2: Cédula
- Field 5: Ciudad (solo si no es null)
- Field 6: Dirección (solo si no es null)

---

## 📋 Flujo Implementado (Pasos 1-3)

```
┌─────────────────────────────────────────────────────────────┐
│ PASO 1: Recepción del Webhook                              │ ✅ COMPLETO
│ - Captura x_id_invoice, x_response, x_customer_city, etc   │
│ - Normaliza "N/A" → null                                    │
│ - Guarda en BD con nuevos campos                            │
│ - Valida anti-duplicados                                    │
│ - Responde 200 OK inmediatamente                            │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ PASO 2: Consulta FR360                                     │ ✅ COMPLETO
│ - Extrae invoice_id hasta antes del guion                   │
│ - Consulta FR360 con reintentos (5x, 1s delay)             │
│ - Captura: salesRep, identityDocument, givenName,          │
│   familyName, email, phone, product, amount,               │
│   agreementId, accessDate                                   │
│ - Aliases en español disponibles                            │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ PASO 3: CRM - Create-First Strategy                        │ ✅ COMPLETO
│ POST /contacts                                              │
│ Body: { email, firstName, lastName, phone, fieldValues }   │
│                                                             │
│ ┌─ Si se crea exitosamente → DONE                         │
│ │                                                           │
│ └─ Si retorna "duplicate" →                               │
│     GET /contacts?email=xxx                                │
│     PUT /contacts/{id}                                     │
│     Body: { firstName, lastName, phone, fieldValues }     │
│                                                            │
│ - Reintentos: 5 intentos, 1s delay                        │
│ - Normaliza teléfono: 3001234567 → +573001234567         │
│ - Solo envía ciudad/dirección si NO son null               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Próximos Pasos (Pendientes)

Ahora que tenemos los pasos 1-3 implementados, necesitamos que me digas:

**PASO 4:** ¿Qué sigue después del CRM?

Mencionaste que hay más pasos después. Por favor, indícame:

1. ¿Crear membresías? (ya lo tienes implementado)
2. ¿Notificar Callbell?
3. ¿Facturación World Office?
4. ¿Guardar en Strapi?

Y para cada paso necesito:
- ✏️ URL del API
- ✏️ Método (GET/POST/PUT)
- ✏️ Headers necesarios
- ✏️ Body esperado
- ✏️ Qué hacer si falla

---

## 📝 Archivos Creados/Modificados

### Nuevos:
- ✅ `src/utils/retryHelper.js` - Helper de reintentos
- ✅ `src/services/crmService.v2.js` - CRM con create-first

### Modificados:
- ✅ `src/models/Webhook.js` - Agregados customer_city, customer_address
- ✅ `src/controllers/webhookController.js` - Anti-duplicados + normalización
- ✅ `src/services/fr360Service.js` - Aliases en español

---

## 🧪 Testing Recomendado

Antes de continuar, deberías probar:

### 1. Enviar un webhook de prueba

```bash
curl -X POST https://facturador-webhook-processor.onrender.com/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "x_ref_payco": "TEST123",
    "x_response": "Aceptada",
    "x_id_invoice": "55414968f6442544f3a-123",
    "x_customer_email": "test@test.com",
    "x_customer_name": "Test",
    "x_customer_lastname": "User",
    "x_customer_city": "Bogotá",
    "x_customer_address": "Calle 123",
    "x_description": "Producto Test",
    "x_amount": "100000",
    "x_currency_code": "COP"
  }'
```

### 2. Verificar que se guardó con ciudad y dirección

```bash
curl -H "Authorization: Bearer tu_token" \
  https://facturador-webhook-processor.onrender.com/api/webhooks/{id}
```

### 3. Probar anti-duplicados

Envía el mismo webhook 2 veces seguidas. El segundo debe marcar como `duplicate`.

---

## ⏭️ ¿Qué Sigue?

**Opción A:** Deployar lo que tenemos y probar

**Opción B:** Continuar con los siguientes pasos del flujo (dime cuáles son)

¿Qué prefieres hacer? 🚀
