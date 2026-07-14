// ---------- Reveal on scroll ----------
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.fade').forEach((el, i) => {
  el.style.transitionDelay = (i % 6) * 70 + 'ms';
  io.observe(el);
});

// ---------- Captura de correo ----------
// El formulario envía a /subscribe (Cloudflare Pages Function).
// La función verifica Turnstile en el servidor y reenvía el correo
// a Kit (ConvertKit) y al webhook de Google Sheets. Las llaves viven
// en variables de entorno del servidor — nunca en este archivo.

document.querySelectorAll('form[data-capture]').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Honeypot: si el campo oculto tiene valor, es un bot. Salir en silencio.
    if (form.company.value) return;

    const email = form.email.value.trim();
    if (!email) return;

    // Token de Turnstile (lo inyecta el widget como input oculto)
    const tokenInput = form.querySelector('[name="cf-turnstile-response"]');
    const token = tokenInput ? tokenInput.value : '';

    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Enviando…';

    try {
      const res = await fetch('/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) throw new Error(data.error || 'error');

      const confirm = form.parentElement.querySelector('.confirm');
      form.style.display = 'none';
      confirm.style.display = 'block';
      confirm.innerHTML =
        '<p>Solicitud recibida.<span class="num">Eres el #' +
        data.position +
        ' en la lista.</span></p>';
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Solicitar acceso';
      let msg = form.parentElement.querySelector('.error-msg');
      if (!msg) {
        msg = document.createElement('p');
        msg.className = 'error-msg';
        form.parentElement.insertBefore(msg, form.nextSibling);
      }
      msg.style.display = 'block';
      msg.textContent =
        'No se pudo enviar. Intenta de nuevo en unos segundos.';
      // Reinicia Turnstile para obtener un token nuevo
      if (window.turnstile) window.turnstile.reset();
    }
  });
});
