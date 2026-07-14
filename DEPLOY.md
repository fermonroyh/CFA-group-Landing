# Guía de despliegue — Landing "Con Criterio"

Paquete completo para producción en **Cloudflare Pages** con dominio propio, Turnstile anti-bots, captura de correos hacia **Kit (ConvertKit)** y respaldo en **Google Sheets**.

## Contenido del paquete

```
landing-deploy/
├── index.html              → La landing
├── styles.css              → Estilos (externos, para permitir una CSP estricta)
├── app.js                  → Animaciones + envío del formulario
├── _headers                → Security headers (Cloudflare Pages los aplica solo)
├── functions/
│   └── subscribe.js        → Endpoint /subscribe (verifica Turnstile, envía a Kit + Sheets)
└── DEPLOY.md               → Esta guía
```

---

## Paso 1 — Subir a GitHub

1. Crea un repositorio **privado** en GitHub (ej. `landing-comunidad`).
2. Sube todos los archivos de esta carpeta **respetando la estructura** (la carpeta `functions/` debe quedar en la raíz del repo — así Cloudflare la detecta como backend).

## Paso 2 — Desplegar en Cloudflare Pages

1. Crea tu cuenta en [dash.cloudflare.com](https://dash.cloudflare.com) → **activa 2FA de inmediato** (con app tipo Authy/Google Authenticator, no SMS).
2. Menú lateral: **Workers & Pages → Create → Pages → Connect to Git**.
3. Autoriza GitHub y selecciona el repo.
4. Configuración de build: déjala vacía (no hay framework). Build command: *(nada)*. Output directory: `/`.
5. **Save and Deploy**. En ~1 minuto tienes el sitio en `tu-proyecto.pages.dev`.

## Paso 3 — Crear el widget de Turnstile

1. En el dashboard de Cloudflare: **Turnstile → Add widget**.
2. Nombre: el que quieras. Hostname: tu dominio (y agrega también `tu-proyecto.pages.dev` para poder probar).
3. Widget mode: **Managed**. Guarda.
4. Copia las dos llaves:
   - **Site Key** → pégala en `index.html`, en los dos lugares donde dice `TU_SITE_KEY`.
   - **Secret Key** → va en variables de entorno (paso 5). **Nunca** en el HTML/JS.

> Para probar en local antes de tener llaves: la Site Key de prueba `1x00000000000000000000AA` siempre pasa la validación.

## Paso 4 — Configurar Kit (ConvertKit)

1. Crea cuenta en [kit.com](https://kit.com) (plan gratis hasta 10,000 suscriptores).
2. Crea un **Form** (puede ser invisible, solo lo usamos como destino vía API). Copia el **Form ID** (número que aparece en la URL del form).
3. En Settings → Developer, copia tu **API Key**.
4. Crea la automatización: *cuando alguien se suscribe al form → enviar correo de bienvenida*. Ese correo debe reforzar la expectativa (ej. "Tu solicitud está en revisión. Los detalles llegan primero a esta lista.").

## Paso 5 — Variables de entorno en Pages

En tu proyecto de Pages: **Settings → Environment variables → Production**, agrega:

| Variable | Valor | Obligatoria |
|---|---|---|
| `TURNSTILE_SECRET` | Secret Key de Turnstile | Sí |
| `KIT_API_KEY` | API Key de Kit | Sí (para que llegue a tu lista) |
| `KIT_FORM_ID` | ID del form de Kit | Sí |
| `SHEETS_WEBHOOK_URL` | URL del Apps Script (paso 6) | Opcional |
| `LIST_BASE` | Número base de la lista (ej. `200`) | Opcional |

Después de agregar variables, haz **Retry deployment** para que tomen efecto.

## Paso 6 — Respaldo en Google Sheets (opcional pero recomendado)

1. Crea un Google Sheet con encabezados: `email | fecha | pais | referer`.
2. Extensiones → **Apps Script**, pega esto:

```javascript
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  sheet.appendRow([data.email, data.ts, data.ip_country, data.referer]);
  return ContentService.createTextOutput(JSON.stringify({ok: true}))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. **Deploy → New deployment → Web app**. Execute as: *Me*. Who has access: *Anyone*.
4. Copia la URL del deployment y pégala como `SHEETS_WEBHOOK_URL` en el paso 5.

> Nota: "Anyone" solo significa que el endpoint acepta POSTs — nadie puede *leer* el Sheet con esa URL. Aún así, no compartas la URL públicamente.

## Paso 7 — Dominio propio

1. Compra el dominio en **Cloudflare Registrar** (Domain Registration → Register; precio de costo, sin renovaciones infladas). Si el TLD no está, cómpralo en Porkbun/Namecheap y cambia los nameservers a los de Cloudflare.
2. En tu proyecto de Pages: **Custom domains → Set up a custom domain** → escribe tu dominio. Cloudflare crea el DNS y el certificado HTTPS solo (2–5 min).
3. En el dominio, activa:
   - **DNSSEC** (DNS → Settings → Enable DNSSEC).
   - **Transfer lock** (activado por defecto en Registrar — verifica).
4. SSL/TLS → Overview → modo **Full (Strict)**.

## Paso 8 — Verificación de seguridad

1. Corre tu dominio en [securityheaders.com](https://securityheaders.com) → deberías ver **A/A+** gracias al archivo `_headers`.
2. Prueba el formulario: envía tu propio correo → debe aparecer en Kit y en el Sheet, y debe llegarte el correo de bienvenida.
3. Prueba anti-bot: si envías vía `curl` sin token de Turnstile, el endpoint debe responder `403 captcha`. ✔️
4. (Opcional) **Security → WAF → Rate limiting rules**: limita `POST /subscribe` a ~5 solicitudes por minuto por IP.

## Paso 9 — Correo del dominio (cuando actives el envío desde tu dominio)

Cuando configures Kit para enviar desde `hola@tudominio.com`, Kit te dará registros **SPF, DKIM y DMARC** para agregar en el DNS de Cloudflare. Esto evita suplantación de tu dominio y mejora la entregabilidad (que no caigas en spam). No lo saltes.

## Checklist final

- [ ] 2FA activado en Cloudflare, GitHub y Kit (app, no SMS)
- [ ] Site Key de Turnstile reemplazada en `index.html` (2 lugares)
- [ ] Variables de entorno configuradas y redeploy hecho
- [ ] Dominio conectado, DNSSEC y transfer lock activos, SSL Full (Strict)
- [ ] securityheaders.com en A/A+
- [ ] Prueba de suscripción de punta a punta (correo llega a Kit + Sheet + bienvenida)
- [ ] Rate limiting en `/subscribe`
- [ ] Imagen Open Graph agregada cuando tengas el diseño (meta `og:image` en `index.html`)

---

## Arquitectura (resumen)

```
Visitante → Cloudflare CDN (DDoS, WAF, HTTPS)
              → index.html + styles.css + app.js  (estático)
              → POST /subscribe (Pages Function)
                    1. Verifica Turnstile (anti-bot, en servidor)
                    2. Kit API  → lista + correo de bienvenida
                    3. Apps Script → Google Sheet (respaldo propio)
```

Las llaves (Turnstile Secret, Kit API Key) viven **solo en el servidor** como variables de entorno. El navegador nunca las ve. Ese era el punto débil del enfoque "todo en el cliente" y así queda cerrado.
