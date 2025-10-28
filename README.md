# Facturador Webhook Processor

Sistema de procesamiento automático de webhooks de ePayco con integración a FR360, ActiveCampaign CRM y Frapp.

## Arquitectura

```
ePayco → Webhook Processor (Render) → PostgreSQL
              ↓
         FR360 API → ActiveCampaign CRM → Frapp API → Google Chat
```

## Características

- ⚡ **Procesamiento asíncrono**: Respuesta inmediata (< 100ms) al webhook
- 🔐 **Autenticación Bearer Token**: Endpoints de consulta protegidos
- 📊 **Sistema de logs detallado**: Seguimiento paso a paso de cada webhook
- 🔄 **Reprocesamiento**: Reintentar webhooks que fallaron
- 🎯 Recepción y procesamiento de webhooks de ePayco
- 📡 Consulta automática a FR360 API para obtener datos de payment links
- 👥 Sincronización con ActiveCampaign CRM
- 🎓 Creación automática de membresías en Frapp
- 🎁 Sistema de promociones configurable
- ✅ Filtro de productos (solo Cuota 1 o base)
- 💬 Notificaciones a Google Chat
- 📝 Logging completo y sistema de reintentos
- 🧪 Modo Testing/Producción

## Requisitos

- Node.js >= 18
- PostgreSQL >= 14
- Cuenta en Render.com (para deployment)

## Variables de Entorno

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/facturador

FR360_API_URL=https://fr360-7cwi.onrender.com/api/v1
FR360_BEARER_TOKEN=tu_token

AC_BASE_URL=https://tuaccount.api-us1.com/api/3
AC_API_TOKEN=tu_token

FRAPP_API_URL=https://admin-appfr-os0a.onrender.com/api/v2/auth/register
FRAPP_API_KEY=tu_api_key
FRAPP_MODO_PRODUCCION=false

GCHAT_SUCCESS_WEBHOOK=https://chat.googleapis.com/...
GCHAT_ERROR_WEBHOOK=https://chat.googleapis.com/...
GCHAT_CRM_ERROR_WEBHOOK=https://chat.googleapis.com/...
GCHAT_FRAPP_WEBHOOK=https://chat.googleapis.com/...

# API Security (IMPORTANTE)
API_BEARER_TOKEN=generar_con_crypto_randomBytes_32
```

Ver [.env.example](.env.example) para referencia completa.

## 🔐 Configuración de Seguridad

**IMPORTANTE:** Todos los endpoints de consulta requieren autenticación Bearer Token.

### Generar token seguro:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Ver [SEGURIDAD.md](SEGURIDAD.md) para instrucciones completas de configuración.

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

## Producción

```bash
npm start
```

## 📡 Endpoints

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/health` | GET | ❌ No | Health check |
| `/` | GET | ❌ No | Información del API |
| `/api/webhooks` | POST | ❌ No* | Recibir webhook de ePayco |
| `/api/webhooks` | GET | ✅ Sí | Listar webhooks |
| `/api/webhooks/stats` | GET | ✅ Sí | Estadísticas de webhooks |
| `/api/webhooks/:id` | GET | ✅ Sí | Detalles de un webhook |
| `/api/webhooks/:id/logs` | GET | ✅ Sí | Logs paso a paso |
| `/api/webhooks/:id/reprocess` | POST | ✅ Sí | Reprocesar webhook |

*Validado por ePayco (no requiere Bearer Token)

**Ver documentación completa de endpoints:** [API_ENDPOINTS.md](API_ENDPOINTS.md)

## Testing

```bash
node scripts/test-webhook.js
```

## Productos Soportados

Solo se crean membresías para:
- Élite - 6 meses (base o Cuota 1)
- Élite - 9 meses (base o Cuota 1)

Las Cuotas 2+ y otros productos se procesan pero NO crean membresías.

## Modo Testing vs Producción

- `FRAPP_MODO_PRODUCCION=false`: Simula la creación de membresías
- `FRAPP_MODO_PRODUCCION=true`: Crea membresías reales en Frapp

## Licencia

MIT
