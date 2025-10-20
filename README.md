# Facturador Webhook Processor

Sistema completo de procesamiento de webhooks de ePayco con integración a FR360, ActiveCampaign CRM y creación automatizada de membresías.

## 🏗️ Arquitectura

```
ePayco Webhook → Express/Node.js (Render) → PostgreSQL
                      ↓
                 FR360 API
                      ↓
              ActiveCampaign CRM
                      ↓
          Frapp Membership Platform
                      ↓
              Google Chat Notifications
```

## 📋 Características

- ✅ Recepción de webhooks de ePayco
- ✅ Consulta automática a FR360 API
- ✅ Búsqueda/creación de contactos en ActiveCampaign
- ✅ Creación de membresías con sistema de promociones
- ✅ Filtro inteligente de productos (solo Cuota 1 o base)
- ✅ Logging completo con Winston
- ✅ Base de datos PostgreSQL
- ✅ Notificaciones a Google Chat
- ✅ Modo Testing/Producción
- ✅ Sistema de reintentos para APIs externas
- ✅ Reprocesamiento de webhooks fallidos
- ✅ API REST para consultar webhooks

## 🚀 Deployment en Render

### Paso 1: Crear PostgreSQL Database

1. Ve a [Render Dashboard](https://dashboard.render.com/)
2. Click en **"New +"** → **"PostgreSQL"**
3. Configuración:
   - **Name**: `facturador-db`
   - **Database**: `facturador`
   - **User**: (autogenerado)
   - **Region**: Oregon (US West) o el más cercano
   - **Plan**: Free
4. Click **"Create Database"**
5. **Copia** la URL de conexión (`Internal Database URL`)

### Paso 2: Crear Web Service

1. En Render Dashboard, click **"New +"** → **"Web Service"**
2. Conecta tu repositorio Git (GitHub/GitLab)
3. Configuración:
   - **Name**: `facturador-webhook-processor`
   - **Region**: Mismo que la base de datos
   - **Branch**: `main`
   - **Root Directory**: (vacío)
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

### Paso 3: Variables de Entorno

En la sección **Environment**, agrega estas variables:

```env
NODE_ENV=production
PORT=3000

# Database (usar Internal Database URL de Render)
DATABASE_URL=postgresql://user:pass@host/dbname

# FR360 API
FR360_API_URL=https://fr360-7cwi.onrender.com/api/v1
FR360_BEARER_TOKEN=91f3c19f460cf9ea3f3f00aa8339f2ab

# ActiveCampaign CRM
AC_BASE_URL=https://sentiretaller.api-us1.com/api/3
AC_API_TOKEN=f76eb8ac2287255f012c28f96f48d845dbe51fbb9770209e1fb9a43d86cb3e2d5e513e5a

# Frapp
FRAPP_API_URL=https://admin-appfr-os0a.onrender.com/api/v2/auth/register
FRAPP_API_KEY=dfada71fffda0de7bb562e259bfe1e64
FRAPP_CRM_ACCOUNT=sentiretaller
FRAPP_CRM_API_TOKEN=f76eb8ac2287255f012c28f96f48d845dbe51fbb9770209e1fb9a43d86cb3e2d5e513e5a
FRAPP_MODO_PRODUCCION=false

# Google Chat Webhooks
GCHAT_SUCCESS_WEBHOOK=https://chat.googleapis.com/...
GCHAT_ERROR_WEBHOOK=https://chat.googleapis.com/...
GCHAT_CRM_ERROR_WEBHOOK=https://chat.googleapis.com/...
GCHAT_FRAPP_WEBHOOK=https://chat.googleapis.com/...
```

### Paso 4: Deploy

1. Click **"Create Web Service"**
2. Render automáticamente hará:
   - `npm install`
   - `npm start`
3. Espera que el deploy termine (5-10 minutos primera vez)
4. Verifica que esté corriendo: `https://your-service.onrender.com/health`

### Paso 5: Configurar Webhook en ePayco

1. Ve a tu panel de ePayco
2. En **Webhooks**, configura:
   - **URL**: `https://your-service.onrender.com/api/webhooks`
   - **Method**: POST
3. Guarda la configuración

## 🔧 Desarrollo Local

### Requisitos

- Node.js >= 18
- PostgreSQL >= 14
- npm o yarn

### Instalación

```bash
# Clonar repositorio
git clone <repo-url>
cd Facturador_render

# Instalar dependencias
npm install

# Crear archivo .env
cp .env.example .env

# Editar .env con tus credenciales
nano .env

# Crear base de datos
npm run migrate

# Iniciar servidor en desarrollo
npm run dev
```

El servidor estará corriendo en `http://localhost:3000`

## 📡 API Endpoints

### Webhooks

#### Recibir Webhook
```http
POST /api/webhooks
Content-Type: application/json

{
  "x_ref_payco": "314525019",
  "x_transaction_id": "12345",
  "x_id_invoice": "554149685168e-123",
  "x_response": "Aceptada",
  ...
}
```

#### Listar Webhooks
```http
GET /api/webhooks?status=completed&limit=10
```

#### Obtener Webhook Específico
```http
GET /api/webhooks/:id
```

#### Reprocesar Webhook
```http
POST /api/webhooks/:id/reprocess
```

### Health Check
```http
GET /health
```

## 📊 Base de Datos

### Esquema

```sql
-- Webhooks recibidos
CREATE TABLE webhooks (
  id SERIAL PRIMARY KEY,
  ref_payco VARCHAR(255) UNIQUE,
  transaction_id VARCHAR(255),
  invoice_id VARCHAR(255),
  customer_email VARCHAR(255),
  product VARCHAR(255),
  amount DECIMAL(10, 2),
  currency VARCHAR(10),
  response VARCHAR(50),
  status VARCHAR(50),
  raw_data JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Logs de procesamiento
CREATE TABLE webhook_processing_logs (
  id SERIAL PRIMARY KEY,
  webhook_id INTEGER REFERENCES webhooks(id),
  stage VARCHAR(100),
  status VARCHAR(50),
  details TEXT,
  error_message TEXT,
  created_at TIMESTAMP
);

-- Contactos (cache)
CREATE TABLE contacts (
  id SERIAL PRIMARY KEY,
  crm_id VARCHAR(100) UNIQUE,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  phone VARCHAR(50),
  identity_document VARCHAR(50),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Membresías creadas
CREATE TABLE memberships (
  id SERIAL PRIMARY KEY,
  webhook_id INTEGER REFERENCES webhooks(id),
  contact_id INTEGER REFERENCES contacts(id),
  membership_plan_id INTEGER,
  product VARCHAR(255),
  activation_url TEXT,
  start_date TIMESTAMP,
  expiry_date TIMESTAMP,
  created_at TIMESTAMP
);
```

## 🔍 Monitoreo y Logs

### Ver logs en Render

1. Ve a tu servicio en Render Dashboard
2. Click en pestaña **"Logs"**
3. Verás logs en tiempo real

### Ver logs localmente

```bash
# Logs de errores
tail -f logs/error-YYYY-MM-DD.log

# Logs combinados
tail -f logs/combined-YYYY-MM-DD.log
```

## ⚙️ Configuración de Productos

### Productos Permitidos

Solo estos productos crearán membresías:

- ✅ `Élite - 6 meses`
- ✅ `Élite - 6 meses - Cuota 1`
- ✅ `Élite - 6 meses - Cuota 1 (Mora)`
- ✅ `Élite - 9 meses`
- ✅ `Élite - 9 meses - Cuota 1`
- ✅ `Élite - 9 meses - Cuota 1 (Mora)`

**NO se crean membresías para:**
- ❌ `Élite - 9 meses - Cuota 2`
- ❌ `Élite - 9 meses - Cuota 3`
- ❌ Cualquier otro producto

### Modo Testing vs Producción

**Modo Testing** (`FRAPP_MODO_PRODUCCION=false`):
- ✅ Recibe webhooks
- ✅ Consulta FR360
- ✅ Busca/crea en CRM
- ⚠️ **SIMULA** creación de membresías (no llama API real)
- ✅ Envía notificaciones de simulación

**Modo Producción** (`FRAPP_MODO_PRODUCCION=true`):
- ✅ Todo lo anterior +
- ✅ **CREA** membresías reales en Frapp API

## 🎯 Flujo de Procesamiento

```
1. ePayco envía webhook → POST /api/webhooks
2. Guardar webhook en BD (estado: pending)
3. Si x_response === "Aceptada":
   a. Extraer invoiceId
   b. Consultar FR360 API (con 5 reintentos)
   c. Buscar/crear contacto en ActiveCampaign (con 5 reintentos)
   d. Verificar si producto requiere membresías
   e. Si requiere:
      - Crear membresías (según promoción activa o estándar)
      - Guardar membresías en BD
   f. Actualizar estado a "completed"
   g. Enviar notificación de éxito a Google Chat
4. Si error en cualquier paso:
   - Actualizar estado a "error"
   - Guardar error en logs
   - Enviar notificación de error a Google Chat
```

## 🔧 Troubleshooting

### Webhook no se procesa

1. Verificar que `x_response === "Aceptada"`
2. Revisar logs: `GET /api/webhooks/:id`
3. Reprocesar: `POST /api/webhooks/:id/reprocess`

### Error conectando a FR360

- Verificar `FR360_BEARER_TOKEN`
- Verificar que FR360 API esté online
- Revisar logs de reintentos

### Error conectando a CRM

- Verificar `AC_API_TOKEN`
- Verificar que email sea válido
- Revisar logs de ActiveCampaign

### Membresías no se crean

1. Verificar `FRAPP_MODO_PRODUCCION` (si es `false`, solo simula)
2. Verificar que producto sea permitido
3. Verificar `FRAPP_API_KEY`

## 📞 Soporte

Para dudas o problemas:
1. Revisar logs en Render Dashboard
2. Consultar tabla `webhook_processing_logs`
3. Verificar notificaciones en Google Chat

## 🔐 Seguridad

- ✅ Helmet.js para headers de seguridad
- ✅ CORS configurado
- ✅ Rate limiting (TODO)
- ✅ Validación de webhooks
- ⚠️ TODO: Verificar firma de ePayco

## 📝 Licencia

MIT
