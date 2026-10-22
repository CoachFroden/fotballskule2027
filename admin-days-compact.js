(() => {
  'use strict';

  const originalShowAdminDays = window.showAdminDays;
  const originalEditDay = window.editDay;
  if (!originalShowAdminDays || !originalEditDay) return;

  function escapeHtml(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function dayIdFromButton(button) {
    const action = button?.getAttribute('onclick') || '';
    return action.match(/editDay\(['"]([^'"]+)['"]\)/)?.[1] || '';
  }

  function isSeptember(id, text) {
    return /^20\d{2}-09(?:-|$)/.test(String(id || '')) || /\bseptember\b/i.test(String(text || ''));
  }

  function markActive(id = '') {
    document.querySelectorAll('.v2-admin-day-pill').forEach(button => {
      button.classList.toggle('is-active', Boolean(id) && button.dataset.dayId === String(id));
    });
  }

  function setEditorTitle(title, subtitle = '') {
    const heading = document.getElementById('v2DayEditorTitle');
    const copy = document.getElementById('v2DayEditorCopy');
    if (heading) heading.textContent = title;
    if (copy) copy.textContent = subtitle;
  }

  function revealEditor(title, subtitle = '') {
    const shell = document.getElementById('v2DayEditor');
    if (!shell) return;
    shell.hidden = false;
    setEditorTitle(title, subtitle);
    window.setTimeout(() => {
      shell.scrollIntoView({ behavior: 'smooth', block: 'start' });
      resizeTextareas(shell);
      updateSectionPreviews(shell);
    }, 30);
  }

  function fieldTitle(label) {
    const textNode = [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    return textNode?.textContent.trim() || '';
  }

  function stripFieldTitle(label) {
    [...label.childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .forEach(node => { node.textContent = ''; });
  }

  function sectionPreview(control) {
    const value = String(control?.value || '').trim();
    if (!value) return 'Ikkje lagt inn';
    const first = value.split(/\r?\n/).map(line => line.trim()).find(Boolean) || value;
    return first.length > 58 ? `${first.slice(0, 58)}…` : first;
  }

  function updateSectionPreviews(root = document) {
    root.querySelectorAll('.v2-day-section').forEach(section => {
      const control = section.querySelector('textarea, input');
      const preview = section.querySelector('.v2-day-section-preview');
      if (preview) preview.textContent = sectionPreview(control);
      section.classList.toggle('has-value', Boolean(String(control?.value || '').trim()));
    });
  }

  function autoResize(textarea) {
    if (!textarea || textarea.tagName !== 'TEXTAREA') return;
    textarea.style.height = 'auto';
    const max = textarea.id === 'dayProgram' ? 240 : 170;
    const min = textarea.id === 'dayProgram' ? 96 : 76;
    textarea.style.height = `${Math.max(min, Math.min(max, textarea.scrollHeight))}px`;
  }

  function resizeTextareas(root = document) {
    root.querySelectorAll('.v2-day-admin-form textarea').forEach(autoResize);
  }

  function makeAccordionSection(label, index) {
    const title = fieldTitle(label) || ['Felt', 'Felt', 'Meny', 'Program', 'Viktig beskjed'][index] || 'Felt';
    const control = label.querySelector('textarea, input');
    if (!control) return null;

    stripFieldTitle(label);
    control.setAttribute('aria-label', title);

    const details = document.createElement('details');
    details.className = `v2-day-section v2-day-section-${control.id || index}`;
    if (control.id === 'dayProgram') details.open = true;

    const summary = document.createElement('summary');
    summary.innerHTML = `
      <span class="v2-day-section-icon" aria-hidden="true">${control.id === 'dayMenu' ? '🍽️' : control.id === 'dayProgram' ? '⚽' : '📌'}</span>
      <span class="v2-day-section-copy">
        <strong>${escapeHtml(title)}</strong>
        <small class="v2-day-section-preview">${escapeHtml(sectionPreview(control))}</small>
      </span>
      <span class="v2-day-section-chevron" aria-hidden="true">⌄</span>`;

    details.appendChild(summary);
    details.appendChild(label);
    label.classList.add('v2-day-section-body');

    control.addEventListener('input', () => {
      autoResize(control);
      updateSectionPreviews(details);
    });

    details.addEventListener('toggle', () => {
      if (details.open) window.setTimeout(() => autoResize(control), 0);
    });

    return details;
  }

  function enhanceAdminDays() {
    const content = document.getElementById('content');
    const box = content?.querySelector('.welcome-box');
    if (!box || box.dataset.compactDayAdmin === '1') return;

    const form = box.querySelector('form[onsubmit*="saveDay"]');
    const grid = box.querySelector('.day-grid');
    if (!grid) return;

    const days = [...grid.querySelectorAll('.day-card')]
      .map(card => {
        const button = card.querySelector('button[onclick*="editDay"]');
        const id = dayIdFromButton(button);
        const date = card.querySelector('h3')?.textContent?.trim() || id;
        const title = card.querySelector('p')?.textContent?.trim() || '';
        return { id, date, title };
      })
      .filter(day => day.id && !isSeptember(day.id, `${day.date} ${day.title}`));

    const picker = document.createElement('section');
    picker.className = 'v2-day-admin-picker';
    picker.innerHTML = `
      <div class="v2-day-admin-picker-head">
        <div>
          <span class="v2-day-admin-kicker">📅 Programdagar</span>
          <strong>Vel dagen du vil jobbe med</strong>
          <small>Berre éin dag er open om gongen.</small>
        </div>
        ${form ? '<button class="v2-day-new" type="button" onclick="v2NewAdminDay()"><span>＋</span> Ny dag</button>' : ''}
      </div>
      <div class="v2-day-pills">
        ${days.length ? days.map(day => `
          <button class="v2-admin-day-pill" type="button" data-day-id="${escapeHtml(day.id)}" onclick="v2OpenAdminDay('${escapeHtml(day.id)}')">
            <span class="v2-admin-day-ball">⚽</span>
            <span><strong>${escapeHtml(day.date)}</strong>${day.title ? `<small>${escapeHtml(day.title)}</small>` : ''}</span>
            <span class="v2-admin-day-arrow">›</span>
          </button>`).join('') : '<p class="v2-day-empty">Ingen programdagar er registrerte enno.</p>'}
      </div>`;

    const oldHeading = [...box.children].find(node => node.tagName === 'H3' && /registrerte dagar/i.test(node.textContent || ''));
    box.insertBefore(picker, form || oldHeading || grid);

    if (form) {
      form.id = 'v2DayAdminForm';
      form.classList.add('v2-day-admin-form');

      const editor = document.createElement('section');
      editor.id = 'v2DayEditor';
      editor.className = 'v2-day-editor';
      editor.hidden = true;

      const header = document.createElement('div');
      header.className = 'v2-day-editor-head';
      header.innerHTML = `
        <div>
          <span class="v2-day-admin-kicker">✏️ Rediger programdag</span>
          <h3 id="v2DayEditorTitle">Programdag</h3>
          <p id="v2DayEditorCopy">Program, mat og beskjedar for denne dagen.</p>
        </div>
        <div class="v2-day-editor-actions">
          <button class="v2-day-close" type="button" onclick="v2CloseAdminDayEditor()">Lukk</button>
          <button class="v2-day-save-top" type="submit" form="v2DayAdminForm">Lagre</button>
        </div>`;

      form.parentNode.insertBefore(editor, form);
      editor.appendChild(header);
      editor.appendChild(form);

      const labels = [...form.querySelectorAll(':scope > label')];
      labels.forEach((label, index) => label.classList.add('v2-day-field'));

      const compactRow = document.createElement('div');
      compactRow.className = 'v2-day-identity-row';
      labels.slice(0, 2).forEach(label => compactRow.appendChild(label));
      form.insertBefore(compactRow, form.firstChild);

      labels.slice(2, 5).forEach((label, index) => {
        const section = makeAccordionSection(label, index + 2);
        if (section) form.insertBefore(section, form.querySelector('button[type="submit"]'));
      });

      const submit = form.querySelector('button[type="submit"]');
      if (submit) {
        submit.textContent = 'Lagre programdagen';
        submit.classList.add('v2-day-save-main');
      }

      resizeTextareas(editor);
      updateSectionPreviews(editor);
    }

    oldHeading?.remove();
    grid.remove();
    box.dataset.compactDayAdmin = '1';
  }

  window.showAdminDays = function () {
    const result = originalShowAdminDays.apply(this, arguments);
    enhanceAdminDays();
    return result;
  };

  window.v2OpenAdminDay = function (id) {
    originalEditDay(id);
    enhanceAdminDays();
    const date = document.getElementById('dayDate')?.value || '';
    const title = document.getElementById('dayTitle')?.value || '';
    markActive(id);
    revealEditor(title || date || 'Programdag', date ? `Rediger ${date}` : 'Rediger programdagen');
  };

  window.v2NewAdminDay = function () {
    window.showAdminDays();
    markActive('');
    revealEditor('Ny programdag', 'Legg inn dato, program, mat og beskjedar.');
    window.setTimeout(() => document.getElementById('dayDate')?.focus(), 80);
  };

  window.v2CloseAdminDayEditor = function () {
    const shell = document.getElementById('v2DayEditor');
    if (shell) shell.hidden = true;
    markActive('');
    document.querySelector('.v2-day-admin-picker')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
})();
