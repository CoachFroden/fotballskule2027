(() => {
  'use strict';

  const originalSave = window.saveInstructorSchedule;
  if (!originalSave) return;

  function safeText(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  window.saveInstructorSchedule = async function (event, dayId, slot) {
    event.preventDefault();

    const form = event.currentTarget;
    const button = form?.querySelector('button[type="submit"]');
    const status = document.getElementById('scheduleSaveStatus');
    const originalLabel = button?.textContent || 'Lagre instruktørplan';

    if (button) {
      button.disabled = true;
      button.textContent = 'Lagrer…';
    }
    if (status) {
      status.innerHTML = '<div class="status-box info">Lagrar instruktørplanen…</div>';
    }

    try {
      await originalSave.call(this, event, dayId, slot);

      if (button) button.textContent = '✓ Lagret';
      if (status) {
        status.innerHTML = '<div class="status-box success">✅ Instruktørplanen er lagra.</div>';
        status.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      window.setTimeout(() => {
        if (button && document.body.contains(button)) {
          button.disabled = false;
          button.textContent = originalLabel;
        }
      }, 1600);
    } catch (error) {
      console.error('Kunne ikkje lagre instruktørplanen:', error);
      if (button) {
        button.disabled = false;
        button.textContent = originalLabel;
      }
      if (status) {
        const code = error?.code ? ` (${safeText(error.code)})` : '';
        const message = error?.message ? safeText(error.message) : 'Ukjend feil';
        status.innerHTML = `<div class="status-box error">❌ Kunne ikkje lagre instruktørplanen${code}.<br><small>${message}</small></div>`;
        status.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  };
})();
