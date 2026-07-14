// Cloudflare Pages Function — POST /subscribe
//
// Flujo:
//   1. Valida el correo y verifica el token de Turnstile con la API de Cloudflare.
//   2. Suscribe el correo en Kit (ConvertKit) → dispara tu correo de bienvenida.
//   3. (Opcional) Envía copia al webhook de Google Apps Script → tu Sheet de respaldo.
//
// Variables de entorno (Pages → Settings → Environment variables):
//   TURNSTILE_SECRET   → Secret Key de tu widget de Turnstile (obligatoria)
//   KIT_API_KEY        → API Key de tu cuenta de Kit
//   KIT_FORM_ID        → ID numérico del formulario en Kit
//   SHEETS_WEBHOOK_URL → URL del Apps Script desplegado como Web App (opcional)
//   LIST_BASE          → Número base de la lista de espera (opcional, default 200)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  const email = (payload.email || '').trim().toLowerCase();
  const token = payload.token || '';

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ ok: false, error: 'email_invalido' }, 400);
  }

  // ---- 1. Verificar Turnstile (servidor) ----
  if (!env.TURNSTILE_SECRET) {
    return json({ ok: false, error: 'config' }, 500);
  }
  const verifyRes = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET,
        response: token,
        remoteip: request.headers.get('CF-Connecting-IP'),
      }),
    }
  );
  const verify = await verifyRes.json();
  if (!verify.success) {
    return json({ ok: false, error: 'captcha' }, 403);
  }

  // ---- 2. Suscribir en Kit (ConvertKit) ----
  if (env.KIT_API_KEY && env.KIT_FORM_ID) {
    try {
      await fetch(
        `https://api.convertkit.com/v3/forms/${env.KIT_FORM_ID}/subscribe`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: env.KIT_API_KEY, email }),
        }
      );
    } catch (e) {
      // No romper la experiencia del usuario si Kit falla;
      // el respaldo en Sheets aún puede registrarlo.
      console.log('kit_error', e.message);
    }
  }

  // ---- 3. Respaldo en Google Sheets (opcional) ----
  if (env.SHEETS_WEBHOOK_URL) {
    try {
      await fetch(env.SHEETS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          ts: new Date().toISOString(),
          ip_country: request.headers.get('CF-IPCountry') || '',
          referer: request.headers.get('Referer') || '',
        }),
      });
    } catch (e) {
      console.log('sheets_error', e.message);
    }
  }

  // ---- 4. Número de lista (estético) ----
  const base = parseInt(env.LIST_BASE || '200', 10);
  const position = base + Math.floor(Math.random() * 40);

  return json({ ok: true, position });
}

// Cualquier otro método → 405
export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return json({ ok: false, error: 'method' }, 405);
}
