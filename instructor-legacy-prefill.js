(() => {
  'use strict';

  const db = firebase.firestore();
  const auth = firebase.auth();
  const ROTATION_VERSION = 6;
  const OFFICIAL_2026_DATES = new Set(['2026-06-22', '2026-06-23', '2026-06-24']);
  const FINAL_2026_DATE = '2026-06-24';
  let seededForUid = null;

  function currentYear() {
    const text = document.getElementById('currentYearLabel')?.textContent || '';
    return text.match(/\b(20\d{2})\b/)?.[1] || '';
  }

  function parseGroup(value) {
    const match = String(value ?? '').match(/[1-5]/);
    return match ? Number(match[0]) : null;
  }

  function shiftGroup(group, steps) {
    return ((Number(group) - 1 + Number(steps)) % 5) + 1;
  }

  function dayDate(day = {}) {
    const value = String(day.date || day.id || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  }

  function isSeptemberDay(day = {}) {
    const value = String(day.date || day.id || '');
    if (/^\d{4}-09(?:-|$)/.test(value)) return true;
    const label = `${day.title || ''} ${day.name || ''}`.toLowerCase();
    return label.includes('september');
  }

  function weekdayName(day = {}) {
    const raw = `${day.title || ''} ${day.name || ''}`.toLowerCase();
    if (raw.includes('månd') || raw.includes('mand')) return 'mandag';
    if (raw.includes('tys') || raw.includes('tirs')) return 'tirsdag';
    if (raw.includes('ons')) return 'onsdag';
    if (raw.includes('tors')) return 'torsdag';
    if (raw.includes('fre')) return 'fredag';

    const value = dayDate(day);
    if (value) {
      const date = new Date(`${value}T12:00:00`);
      if (!Number.isNaN(date.getTime())) {
        return ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'][date.getDay()];
      }
    }
    return '';
  }

  function instructorAvailable(instructor, day) {
    const days = String(instructor.days || instructor.dager || 'Alle').trim().toLowerCase();
    if (!days || days === 'alle' || days.includes('alle')) return true;

    const weekday = weekdayName(day);
    if (!weekday) return true;

    const aliases = {
      mandag: ['mandag', 'måndag', 'man'],
      tirsdag: ['tirsdag', 'tysdag', 'tir', 'tys'],
      onsdag: ['onsdag', 'ons'],
      torsdag: ['torsdag', 'tors'],
      fredag: ['fredag', 'fre']
    };
    return (aliases[weekday] || [weekday]).some(alias => days.includes(alias));
  }

  function isOfficial2026Day(day = {}) {
    const value = dayDate(day);
    if (value) return OFFICIAL_2026_DATES.has(value);

    // Fallback for gamle dokument utan date-felt: berre dei tre faktiske
    // fotballskuledagane måndag–onsdag skal inngå i 2026-rotasjonen.
    if (isSeptemberDay(day)) return false;
    return ['mandag', 'tirsdag', 'onsdag'].includes(weekdayName(day));
  }

  async function seedLegacy2026Rotation() {
    const user = auth.currentUser;
    if (!user || currentYear() !== '2026' || seededForUid === user.uid) return;

    const profile = await db.collection('users').doc(user.uid).get();
    if (!profile.exists || profile.data().role !== 'admin') return;

    const yearRef = db.collection('years').doc('2026');
    const yearDoc = await yearRef.get();
    if (Number(yearDoc.data()?.instructorRotationSeedVersion || 0) >= ROTATION_VERSION) {
      seededForUid = user.uid;
      return;
    }

    const [daysSnap, instructorsSnap, plansSnap] = await Promise.all([
      yearRef.collection('days').get(),
      yearRef.collection('instructors').get(),
      yearRef.collection('instructorPlans').get()
    ]);

    const days = daysSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(isOfficial2026Day)
      .sort((a, b) => String(dayDate(a) || a.id).localeCompare(String(dayDate(b) || b.id)));
    const instructors = instructorsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (!days.length || !instructors.length) return;

    const existingPlans = Object.fromEntries(plansSnap.docs.map(doc => [doc.id, doc.data()]));
    const generated = new Map(days.map(day => [day.id, { for: {}, etter: {} }]));
    const explicitFinalDay = days.find(day => dayDate(day) === FINAL_2026_DATE);
    const finalDayId = explicitFinalDay?.id || days[days.length - 1].id;

    instructors.forEach(instructor => {
      const startGroup = parseGroup(instructor.group ?? instructor.gruppe);
      if (!startGroup) return;

      const availableDays = days.filter(day => instructorAvailable(instructor, day));
      availableDays.forEach((day, availableIndex) => {
        const beforeGroup = shiftGroup(startGroup, availableIndex * 2);
        const afterGroup = day.id === finalDayId
          ? beforeGroup
          : shiftGroup(startGroup, availableIndex * 2 + 1);

        generated.get(day.id).for[instructor.id] = beforeGroup;
        generated.get(day.id).etter[instructor.id] = afterGroup;
      });
    });

    const batch = db.batch();
    days.forEach(day => {
      const old = existingPlans[day.id] || {};
      const auto = generated.get(day.id);
      const planRef = yearRef.collection('instructorPlans').doc(day.id);

      // Behald manuelle justeringar før lunsj. Onsdag 24. juni er eksplisitt
      // siste dag, og etter lunsj skal då ALLTID vere identisk med før lunsj.
      const finalFor = { ...auto.for, ...(old.for || {}) };
      const finalEtter = day.id === finalDayId
        ? { ...finalFor }
        : { ...auto.etter, ...(old.etter || {}) };

      batch.set(planRef, {
        for: finalFor,
        etter: finalEtter,
        rotationGenerated: true,
        rotationVersion: ROTATION_VERSION,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: user.uid
      }, { merge: true });
    });

    batch.set(yearRef, {
      instructorRotationSeedVersion: ROTATION_VERSION,
      instructorRotationSeededAt: firebase.firestore.FieldValue.serverTimestamp(),
      instructorRotationSeededBy: user.uid
    }, { merge: true });

    await batch.commit();
    seededForUid = user.uid;
  }

  const previousShowHome = window.showHome;
  if (previousShowHome) {
    window.showHome = function () {
      const result = previousShowHome.apply(this, arguments);
      setTimeout(() => seedLegacy2026Rotation().catch(console.error), 0);
      return result;
    };
    window.goHome = window.showHome;
  }

  const previousAdmin = window.showInstructorScheduleAdmin;
  if (previousAdmin) {
    window.showInstructorScheduleAdmin = async function () {
      await seedLegacy2026Rotation();
      return previousAdmin.apply(this, arguments);
    };
  }
})();
