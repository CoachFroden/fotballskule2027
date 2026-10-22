(() => {
  'use strict';

  const originalShowImport = window.showImport;
  const originalStateImportType = window.stateImportType;
  const originalReadImportFile = window.readImportFile;
  const originalSelectImportSheet = window.selectImportSheet;

  if (!originalShowImport || !originalStateImportType || !originalReadImportFile || !originalSelectImportSheet) return;

  let currentFile = null;

  const labels = {
    participants: 'deltakarlista',
    instructors: 'instruktørlista',
    adults: 'vaksenlista'
  };

  const collectionPairs = {
    participants: ['participants', 'participantPrivate'],
    instructors: ['instructors', 'instructorPrivate'],
    adults: ['adults', 'adultPrivate']
  };

  function detectedTypeFromSheet(sheetName = '') {
    const value = String(sheetName).toLowerCase();
    if (value.includes('deltak') || value.includes('participant')) return 'participants';
    if (value.includes('instruk') || value.includes('instructor')) return 'instructors';
    if (value.includes('vaks') || value.includes('voks') || value.includes('adult')) return 'adults';
    return null;
  }

  function currentYear() {
    const text = document.getElementById('currentYearLabel')?.textContent || '';
    return text.match(/\b(20\d{2})\b/)?.[1] || null;
  }

  function injectCleanupControls() {
    const preview = document.getElementById('importPreview');
    const typeSelect = document.getElementById('importType');
    if (!preview || !typeSelect) return;

    let box = document.getElementById('importCleanupBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'importCleanupBox';
      box.className = 'important-box';
      preview.parentNode.insertBefore(box, preview);
    }

    const type = typeSelect.value;
    const year = currentYear() || 'vald årgang';

    if (type === 'participants') {
      box.innerHTML = `
        <strong>Deltakarlista er verna mot massesletting.</strong>
        <p class="muted">Importer ei korrigert fil for å oppdatere deltakarar. Heile deltakarlista kan ikkje lenger tømmast frå denne sida.</p>`;
      return;
    }

    box.innerHTML = `
      <strong>Feilimport eller ny komplett liste?</strong>
      <p class="muted">Du kan tømme berre den valde lista før du importerer på nytt. Andre data blir ikkje rørt.</p>
      <button class="text-button danger-text" type="button" onclick="clearSelectedImportCollection()">Tøm ${labels[type]} for ${year}</button>`;
  }

  window.showImport = function () {
    currentFile = null;
    originalShowImport();
    const typeSelect = document.getElementById('importType');
    if (typeSelect) originalStateImportType(typeSelect.value);
    injectCleanupControls();
  };

  window.stateImportType = function (value) {
    originalStateImportType(value);

    const sheetSelect = document.getElementById('importSheet');
    if (sheetSelect?.value) {
      originalSelectImportSheet(sheetSelect.value);
    } else if (currentFile && currentFile.name.toLowerCase().endsWith('.csv')) {
      originalReadImportFile(currentFile);
    }

    injectCleanupControls();
  };

  window.readImportFile = async function (file) {
    currentFile = file || null;
    return originalReadImportFile(file);
  };

  window.selectImportSheet = function (sheetName) {
    const detected = detectedTypeFromSheet(sheetName);
    const typeSelect = document.getElementById('importType');

    if (detected && typeSelect) {
      typeSelect.value = detected;
      originalStateImportType(detected);
    }

    originalSelectImportSheet(sheetName);
    injectCleanupControls();
  };

  window.clearSelectedImportCollection = async function () {
    const type = document.getElementById('importType')?.value;
    const year = currentYear();
    const pair = collectionPairs[type];

    if (!type || !pair || !year) {
      alert('Kunne ikkje finne vald importtype eller årgang.');
      return;
    }

    if (type === 'participants') {
      alert('Massesletting av deltakarlista er sperra for å hindre tap av data. Importer ei korrigert fil i staden.');
      return;
    }

    const label = labels[type];
    const ok = confirm(`Tømme heile ${label} for ${year}?\n\nDette slettar berre ${label} og tilhøyrande private felt. Bruk dette før du importerer den korrekte komplette lista på nytt.`);
    if (!ok) return;

    try {
      const db = firebase.firestore();
      const refs = [];

      for (const collection of pair) {
        const snapshot = await db.collection('years').doc(year).collection(collection).get();
        snapshot.docs.forEach(doc => refs.push(doc.ref));
      }

      for (let start = 0; start < refs.length; start += 400) {
        const batch = db.batch();
        refs.slice(start, start + 400).forEach(ref => batch.delete(ref));
        await batch.commit();
      }

      const box = document.getElementById('importCleanupBox');
      if (box) box.innerHTML = `<strong>${label} for ${year} er tømd.</strong><p>Vel no riktig ark og importer den komplette lista.</p>`;
    } catch (error) {
      console.error(error);
      alert('Kunne ikkje tømme lista. Kontroller at årgangen er aktiv og at du er administrator.');
    }
  };
})();