# 🔐 Configuración de Seguridad

## Bearer Token para API

### ¿Por qué es necesario?

Los endpoints de consulta (`GET /api/webhooks`, `GET /api/webhooks/:id/logs`, etc.) contienen información sensible de tus clientes y transacciones. **Sin autenticación, cualquier persona con la URL de tu API podría ver todos tus webhooks y datos.**

### ✅ Endpoints Protegidos (Requieren Token)

Estos endpoints **REQUIEREN** el header `Authorization: Bearer <token>`:

- `GET /api/webhooks` - Listar webhooks
- `GET /api/webhooks/stats` - Estadísticas
- `GET /api/webhooks/:id` - Detalles de webhook
- `GET /api/webhooks/:id/logs` - Logs de procesamiento
- `POST /api/webhooks/:id/reprocess` - Reprocesar webhook

### ❌ Endpoints NO Protegidos

- `POST /api/webhooks` - Recibe webhooks de ePayco (validado por ePayco, no requiere Bearer Token)

---

## Generar un Token Seguro

### Opción 1: Usando Node.js (Recomendado)

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Ejemplo de salida:**
```
a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

### Opción 2: Usando OpenSSL

```bash
openssl rand -hex 32
```

### Opción 3: Generador Online

Solo si no tienes acceso a las opciones anteriores:
- https://www.uuidgenerator.net/api/guid
- https://randomkeygen.com/ (usar "Fort Knox Passwords")

---

## Configurar el Token

### 1. En Desarrollo Local

Agrega a tu archivo `.env`:

```env
API_BEARER_TOKEN=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

### 2. En Producción (Render)

1. Ve a tu servicio en Render Dashboard
2. Settings → Environment
3. Agrega la variable:
   - **Key:** `API_BEARER_TOKEN`
   - **Value:** `tu_token_generado_aqui`
4. Guarda y espera que el servicio se reinicie

---

## Usar el Token en Requests

### CURL

```bash
curl -H "Authorization: Bearer a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456" \
  https://tu-api.onrender.com/api/webhooks
```

### JavaScript/Fetch

```javascript
const response = await fetch('https://tu-api.onrender.com/api/webhooks', {
  headers: {
    'Authorization': 'Bearer a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456'
  }
});
```

### Axios

```javascript
const axios = require('axios');

const response = await axios.get('https://tu-api.onrender.com/api/webhooks', {
  headers: {
    'Authorization': 'Bearer a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456'
  }
});
```

### Postman

1. Selecciona tu request
2. Ve a la pestaña **Authorization**
3. Type: **Bearer Token**
4. Token: Pega tu token

---

## Respuestas de Error

### Sin Token

**Request:**
```bash
curl https://tu-api.onrender.com/api/webhooks
```

**Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": "No se proporcionó token de autenticación",
  "message": "Header Authorization requerido"
}
```

### Formato Incorrecto

**Request:**
```bash
curl -H "Authorization: a1b2c3..." https://tu-api.onrender.com/api/webhooks
```

**Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": "Formato de token inválido",
  "message": "Use: Authorization: Bearer <token>"
}
```

### Token Inválido

**Request:**
```bash
curl -H "Authorization: Bearer token_incorrecto" https://tu-api.onrender.com/api/webhooks
```

**Response (403 Forbidden):**
```json
{
  "success": false,
  "error": "Token de autenticación inválido"
}
```

---

## Mejores Prácticas

### ✅ SI

- **Usa tokens largos** (mínimo 32 caracteres, recomendado 64)
- **Genera tokens aleatorios** con herramientas criptográficas
- **Guarda el token en variables de entorno**, NUNCA en el código
- **Rota el token periódicamente** (cada 3-6 meses)
- **Usa HTTPS** en producción (Render lo hace automáticamente)
- **Limita el acceso** al token solo a personal autorizado

### ❌ NO

- ❌ NO uses tokens simples como "123456" o "mytoken"
- ❌ NO compartas el token en repositorios públicos de GitHub
- ❌ NO envíes el token por email sin encriptar
- ❌ NO uses el mismo token para múltiples ambientes
- ❌ NO ignores los logs de autenticación fallida

---

## Rotar el Token

Si tu token fue comprometido o quieres cambiarlo:

### 1. Genera un nuevo token

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Actualiza en Render

Settings → Environment → Edita `API_BEARER_TOKEN` → Guarda

### 3. Actualiza en tus aplicaciones

Actualiza el token en todos los lugares donde lo uses (scripts, aplicaciones, etc.)

---

## Verificar que Funciona

### Test 1: Sin token (debe fallar)

```bash
curl https://tu-api.onrender.com/api/webhooks
# Debe retornar 401
```

### Test 2: Con token (debe funcionar)

```bash
curl -H "Authorization: Bearer TU_TOKEN" https://tu-api.onrender.com/api/webhooks
# Debe retornar la lista de webhooks
```

---

## Logs de Seguridad

El sistema registra todos los intentos de autenticación:

```
[Auth] Intento de acceso sin header Authorization
[Auth] Formato de token inválido
[Auth] Token inválido proporcionado
[Auth] Autenticación exitosa
```

Revisa los logs regularmente en Render para detectar intentos de acceso no autorizados.

---

## Soporte

Si necesitas ayuda con la configuración de seguridad, consulta:
- [API_ENDPOINTS.md](API_ENDPOINTS.md) - Documentación de endpoints
- [README.md](README.md) - Documentación general
