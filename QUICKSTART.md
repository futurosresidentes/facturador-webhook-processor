# 🚀 Quick Start Guide

## Desarrollo Local (5 minutos)

### 1. Instalar dependencias
```bash
cd c:\Sitios\Facturador_render
npm install
```

### 2. Configurar base de datos local (PostgreSQL)

**Opción A: Usar PostgreSQL local**
```bash
# Instalar PostgreSQL si no lo tienes
# Windows: https://www.postgresql.org/download/windows/
# Mac: brew install postgresql

# Crear base de datos
createdb facturador_dev

# Editar .env con tus credenciales de PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/facturador_dev
```

**Opción B: Usar base de datos de Render (recomendado)**
```bash
# 1. Crear PostgreSQL en Render (gratis)
# 2. Copiar "Internal Database URL"
# 3. Pegar en .env:
DATABASE_URL=postgresql://user:pass@host/dbname
```

### 3. Migrar base de datos
```bash
npm run migrate
```

### 4. Iniciar servidor
```bash
npm run dev
```

Servidor corriendo en: http://localhost:3000

### 5. Probar
```bash
# En otra terminal
node test-webhook.js
```

---

## Deployment en Render (10 minutos)

### 1. Crear cuenta en Render
https://dashboard.render.com/register

### 2. Crear PostgreSQL Database
1. Click "New +" → "PostgreSQL"
2. Name: `facturador-db`
3. Plan: Free
4. Click "Create Database"
5. **Copiar Internal Database URL**

### 3. Preparar repositorio Git
```bash
cd c:\Sitios\Facturador_render

# Inicializar git
git init
git add .
git commit -m "Initial commit"

# Subir a GitHub/GitLab
# (crear repo en GitHub primero)
git remote add origin https://github.com/tu-usuario/facturador-webhook.git
git branch -M main
git push -u origin main
```

### 4. Crear Web Service en Render
1. Click "New +" → "Web Service"
2. Conectar repositorio Git
3. Configuración:
   - **Name**: `facturador-webhook-processor`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

### 5. Agregar Variables de Entorno
En "Environment", agregar:

```env
NODE_ENV=production
DATABASE_URL=[Pegar Internal Database URL del paso 2]
FR360_API_URL=https://fr360-7cwi.onrender.com/api/v1
FR360_BEARER_TOKEN=91f3c19f460cf9ea3f3f00aa8339f2ab
AC_BASE_URL=https://sentiretaller.api-us1.com/api/3
AC_API_TOKEN=f76eb8ac2287255f012c28f96f48d845dbe51fbb9770209e1fb9a43d86cb3e2d5e513e5a
FRAPP_API_URL=https://admin-appfr-os0a.onrender.com/api/v2/auth/register
FRAPP_API_KEY=dfada71fffda0de7bb562e259bfe1e64
FRAPP_CRM_ACCOUNT=sentiretaller
FRAPP_CRM_API_TOKEN=f76eb8ac2287255f012c28f96f48d845dbe51fbb9770209e1fb9a43d86cb3e2d5e513e5a
FRAPP_MODO_PRODUCCION=false
GCHAT_SUCCESS_WEBHOOK=[tu-webhook-de-google-chat]
GCHAT_ERROR_WEBHOOK=[tu-webhook-de-google-chat]
GCHAT_CRM_ERROR_WEBHOOK=[tu-webhook-de-google-chat]
GCHAT_FRAPP_WEBHOOK=[tu-webhook-de-google-chat]
```

### 6. Deploy
1. Click "Create Web Service"
2. Esperar 5-10 minutos
3. Tu URL será: `https://facturador-webhook-processor.onrender.com`

### 7. Verificar
Visita: `https://tu-servicio.onrender.com/health`

Deberías ver:
```json
{
  "status": "ok",
  "timestamp": "2025-...",
  "environment": "production",
  "mode": "TESTING"
}
```

### 8. Configurar en ePayco
1. Ve a tu panel de ePayco
2. Configurar webhook: `https://tu-servicio.onrender.com/api/webhooks`
3. ¡Listo!

---

## Migrar Webhooks de Google Sheets

Si tienes webhooks antiguos en Google Sheets, puedes migrarlos:

```javascript
// Crear un script para leer de Sheets e insertar en PostgreSQL
// TODO: Implementar script de migración
```

---

## Comandos Útiles

```bash
# Desarrollo
npm run dev          # Iniciar con nodemon (auto-reload)

# Producción
npm start            # Iniciar servidor

# Database
npm run migrate      # Crear/actualizar tablas

# Testing
node test-webhook.js # Enviar webhook de prueba
```

---

## URLs Importantes

- **Health Check**: `/health`
- **Recibir Webhook**: `POST /api/webhooks`
- **Listar Webhooks**: `GET /api/webhooks`
- **Ver Webhook**: `GET /api/webhooks/:id`
- **Reprocesar**: `POST /api/webhooks/:id/reprocess`

---

## Solución de Problemas

### Error: Cannot connect to database
```bash
# Verificar que DATABASE_URL esté correcta
echo $DATABASE_URL

# Verificar que PostgreSQL esté corriendo (local)
pg_isready
```

### Error: Module not found
```bash
# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install
```

### Webhooks no se procesan
1. Verificar logs en Render Dashboard
2. Consultar webhook: `GET /api/webhooks/:id`
3. Revisar tabla `webhook_processing_logs`

---

## Próximos Pasos

1. ✅ Servidor corriendo
2. ⏭️ Activar modo producción: `FRAPP_MODO_PRODUCCION=true`
3. ⏭️ Configurar monitoreo y alertas
4. ⏭️ Crear dashboard web (opcional)

¡Éxito! 🎉
