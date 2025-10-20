# 📁 Estructura del Proyecto

```
Facturador_render/
│
├── 📄 package.json                    # Dependencias del proyecto
├── 📄 .env                            # Variables de entorno (local)
├── 📄 .env.example                    # Ejemplo de variables de entorno
├── 📄 .gitignore                      # Archivos a ignorar en Git
├── 📄 render.yaml                     # Configuración para Render Blueprint
├── 📄 README.md                       # Documentación completa
├── 📄 QUICKSTART.md                   # Guía rápida de inicio
├── 📄 PROJECT_STRUCTURE.md            # Este archivo
├── 📄 test-webhook.js                 # Script para probar webhooks
│
└── src/
    │
    ├── 📄 app.js                      # Aplicación principal Express
    │
    ├── config/                        # Configuración
    │   ├── env.js                     # Variables de entorno centralizadas
    │   ├── logger.js                  # Configuración de Winston logger
    │   ├── database.js                # Configuración de Sequelize/PostgreSQL
    │   └── migrate.js                 # Script de migración de BD
    │
    ├── models/                        # Modelos de base de datos (Sequelize)
    │   ├── index.js                   # Exporta todos los modelos + relaciones
    │   ├── Webhook.js                 # Modelo de webhooks recibidos
    │   ├── WebhookLog.js              # Logs de procesamiento
    │   ├── Contact.js                 # Contactos (cache de CRM)
    │   └── Membership.js              # Membresías creadas
    │
    ├── controllers/                   # Controladores de rutas
    │   └── webhookController.js       # Lógica de endpoints de webhooks
    │
    ├── services/                      # Lógica de negocio
    │   ├── webhookProcessor.js        # Procesador principal de webhooks
    │   ├── fr360Service.js            # Integración con FR360 API
    │   ├── crmService.js              # Integración con ActiveCampaign
    │   ├── membershipService.js       # Creación de membresías (Frapp)
    │   └── notificationService.js     # Notificaciones a Google Chat
    │
    ├── middleware/                    # Middleware de Express
    │   ├── validateWebhook.js         # Validación de webhooks de ePayco
    │   └── errorHandler.js            # Manejo global de errores
    │
    ├── routes/                        # Definición de rutas
    │   └── webhooks.js                # Rutas de API webhooks
    │
    └── utils/                         # Utilidades
        ├── productFilter.js           # Filtro de productos permitidos
        ├── promotions.js              # Configuración de promociones
        └── dateHelpers.js             # Helpers para manejo de fechas
```

---

## 📊 Base de Datos (PostgreSQL)

### Tablas

#### `webhooks`
Almacena todos los webhooks recibidos de ePayco.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | Primary key |
| ref_payco | VARCHAR(255) | Referencia única del webhook |
| transaction_id | VARCHAR(255) | ID de transacción |
| invoice_id | VARCHAR(255) | ID del invoice de FR360 |
| customer_email | VARCHAR(255) | Email del cliente |
| customer_name | VARCHAR(255) | Nombre del cliente |
| product | VARCHAR(255) | Nombre del producto |
| amount | DECIMAL(10,2) | Monto de la transacción |
| currency | VARCHAR(10) | Moneda (COP, USD, etc.) |
| response | VARCHAR(50) | Respuesta (Aceptada, Rechazada) |
| status | VARCHAR(50) | Estado del procesamiento |
| raw_data | JSONB | Datos completos del webhook |
| created_at | TIMESTAMP | Fecha de recepción |
| updated_at | TIMESTAMP | Última actualización |

**Estados posibles**: `pending`, `processing`, `completed`, `error`, `not_processed`

#### `webhook_processing_logs`
Registra cada etapa del procesamiento de un webhook.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | Primary key |
| webhook_id | INTEGER | FK → webhooks.id |
| stage | VARCHAR(100) | Etapa (started, fr360_query, etc.) |
| status | VARCHAR(50) | Estado (processing, success, failed) |
| details | TEXT | Detalles de la etapa |
| error_message | TEXT | Mensaje de error si falló |
| created_at | TIMESTAMP | Timestamp del log |

**Etapas**: `started`, `fr360_query`, `crm_upsert`, `membership_creation`, `completed`, `error`

#### `contacts`
Cache local de contactos de ActiveCampaign.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | Primary key |
| crm_id | VARCHAR(100) | ID en ActiveCampaign |
| email | VARCHAR(255) | Email único |
| name | VARCHAR(255) | Nombre completo |
| phone | VARCHAR(50) | Teléfono |
| identity_document | VARCHAR(50) | Documento de identidad |
| created_at | TIMESTAMP | Fecha de creación |
| updated_at | TIMESTAMP | Última actualización |

#### `memberships`
Registro de membresías creadas.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | Primary key |
| webhook_id | INTEGER | FK → webhooks.id |
| contact_id | INTEGER | FK → contacts.id |
| membership_plan_id | INTEGER | ID del plan en Frapp |
| product | VARCHAR(255) | Producto comprado |
| activation_url | TEXT | URL de activación |
| start_date | TIMESTAMP | Fecha de inicio |
| expiry_date | TIMESTAMP | Fecha de expiración |
| created_at | TIMESTAMP | Fecha de creación |

---

## 🔄 Flujo de Datos

```
┌─────────────────────────────────────────────────────────────────┐
│                       RECEPCIÓN WEBHOOK                          │
│  POST /api/webhooks (validateWebhook middleware)                │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              CONTROLADOR (webhookController.js)                  │
│  1. Guardar webhook en BD (estado: pending)                     │
│  2. Si x_response === 'Aceptada':                               │
│     → Encolar procesamiento (webhookProcessor.processWebhook)   │
│  3. Responder 200 OK a ePayco inmediatamente                    │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│           PROCESADOR (webhookProcessor.js)                       │
│  → Actualizar estado: processing                                │
│  → Crear log: started                                           │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              SERVICIO FR360 (fr360Service.js)                    │
│  1. Extraer invoiceId del webhook                               │
│  2. Consultar FR360 API (con 5 reintentos)                      │
│  3. Obtener datos del payment link                              │
│  → Crear log: fr360_query (processing → success)                │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              SERVICIO CRM (crmService.js)                        │
│  1. Buscar contacto en BD local por email                       │
│  2. Si no existe localmente:                                    │
│     a. Buscar en ActiveCampaign API (con 5 reintentos)          │
│     b. Si no existe en AC: crear contacto nuevo                 │
│  3. Guardar/actualizar en BD local                              │
│  → Crear log: crm_upsert (processing → success)                 │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│        UTILIDAD (productFilter.js)                               │
│  1. Verificar si producto requiere membresías                   │
│     ✅ Élite 6/9 meses (base, Cuota 1, Cuota 1 Mora)            │
│     ❌ Cualquier Cuota 2+                                        │
│  2. Si NO requiere → saltar a finalización                      │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼ (si requiere membresías)
┌─────────────────────────────────────────────────────────────────┐
│       SERVICIO MEMBERSHIPS (membershipService.js)                │
│  1. Obtener producto base (Élite 6/9 meses)                     │
│  2. Verificar promoción activa (promotions.js)                  │
│  3. Obtener configuración de memberships a crear                │
│  4. Para cada membership:                                       │
│     a. Calcular fechas (inicio, fin, duración)                  │
│     b. Si MODO_PRODUCCION=true:                                 │
│        → Llamar Frapp API para crear membership                 │
│     c. Si MODO_PRODUCCION=false:                                │
│        → Simular creación (no llamar API)                       │
│     d. Guardar membership en BD                                 │
│  → Crear log: membership_creation (processing → success)        │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FINALIZACIÓN                                │
│  1. Actualizar webhook.status = 'completed'                     │
│  2. Crear log: completed (success)                              │
│  3. Enviar notificación de éxito (notificationService)          │
└─────────────────────────────────────────────────────────────────┘

                      ERROR EN CUALQUIER PASO
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MANEJO DE ERRORES                             │
│  1. Actualizar webhook.status = 'error'                         │
│  2. Crear log: error (failed) con error_message                 │
│  3. Enviar notificación de error (notificationService)          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Servicios Externos Integrados

| Servicio | URL | Propósito | Reintentos |
|----------|-----|-----------|------------|
| **FR360 API** | fr360-7cwi.onrender.com | Consultar invoices y payment links | 5 |
| **ActiveCampaign** | sentiretaller.api-us1.com | Gestión de contactos (CRM) | 5 |
| **Frapp API** | admin-appfr-os0a.onrender.com | Creación de membresías | N/A |
| **Google Chat** | chat.googleapis.com | Notificaciones (4 webhooks diferentes) | 1 |

---

## 📡 API Endpoints

### Webhooks

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/webhooks` | Recibir webhook de ePayco |
| GET | `/api/webhooks` | Listar webhooks (con filtros) |
| GET | `/api/webhooks/:id` | Obtener webhook específico |
| POST | `/api/webhooks/:id/reprocess` | Reprocesar webhook |

### Utilidad

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Health check del servidor |
| GET | `/` | Información del API |

---

## 🔐 Variables de Entorno

Ver `.env.example` para la lista completa.

### Críticas
- `DATABASE_URL`: Conexión a PostgreSQL
- `FR360_BEARER_TOKEN`: Token de FR360 API
- `AC_API_TOKEN`: Token de ActiveCampaign
- `FRAPP_API_KEY`: API key de Frapp
- `FRAPP_MODO_PRODUCCION`: `true` para crear membresías reales

### Opcionales
- `NODE_ENV`: `development` o `production`
- `PORT`: Puerto del servidor (default: 3000)
- `LOG_LEVEL`: Nivel de logging (`debug`, `info`, `warn`, `error`)

---

## 📝 Notas de Desarrollo

### Agregar nuevo producto permitido

Editar `src/utils/productFilter.js`:
```javascript
const PRODUCTOS_PERMITIDOS = [
  'Élite - 6 meses',
  'Élite - 9 meses',
  'Nuevo Producto' // ← Agregar aquí
];
```

### Agregar nueva promoción

Editar `src/utils/promotions.js`:
```javascript
const CONFIGURACION_PROMOCIONES = {
  nueva_promo: {
    activa: true,
    inicio: new Date('2025-11-01T00:00:00Z'),
    fin: new Date('2025-11-30T23:59:59Z'),
    descripcion: 'Promoción Noviembre',
    memberships: {
      'Élite - 6 meses': [...]
    }
  }
};
```

### Agregar nuevo endpoint

1. Crear controlador en `src/controllers/`
2. Crear ruta en `src/routes/`
3. Importar en `src/app.js`

---

## 🧪 Testing

```bash
# Test local
node test-webhook.js

# Test en producción
TEST_URL=https://tu-servicio.onrender.com node test-webhook.js
```

---

## 📚 Dependencias Principales

| Dependencia | Versión | Propósito |
|-------------|---------|-----------|
| express | ^4.18 | Framework web |
| sequelize | ^6.35 | ORM para PostgreSQL |
| pg | ^8.11 | Driver PostgreSQL |
| axios | ^1.6 | Cliente HTTP |
| winston | ^3.11 | Logging |
| helmet | ^7.1 | Seguridad HTTP |
| cors | ^2.8 | CORS |
| dotenv | ^16.3 | Variables de entorno |

---

¡Proyecto completo y listo para usar! 🎉
