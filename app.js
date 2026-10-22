// Inneheld berre ikkje-sensitive fagdata. Personopplysningar skal aldri ligge i repoet.
window.exercises = [
  {
    id: 'haien', name: 'Haien kjem', groups: '1-3',
    setup: 'Lag ein firkant på omtrent 20 x 20 meter. Alle spelarane har kvar sin ball. Vel 1–2 haiar som startar utan ball.',
    description: 'Spelarane fører ballen rundt i firkanten. Haiar prøver å sparke ballane ut. Mister ein spelar ballen ut, blir spelaren også hai. Fortset til éin spelar står att med ball.',
    focus: 'Mange små touch. Blikk opp. Vendingar når det blir trongt.',
    tips: 'Start med éin hai og legg til fleire dersom det blir for lett.'
  },
  {
    id: 'trafikklys', name: 'Trafikklys', groups: '1-2',
    setup: 'Lag ein firkant på omtrent 20 x 20 meter. Alle har kvar sin ball.',
    description: 'Grøn = full fart. Gul = roleg. Raud = stopp med sålen. U-sving = vending. Turbo = så fort som mogleg.',
    focus: 'Ballkontroll, reaksjon og bruk av begge bein.',
    tips: 'Byt kommando ofte og varier tempo.'
  },
  {
    id: 'skattejakt', name: 'Skattejakt', groups: '1-2',
    setup: 'Del i lag. Legg mange ballar eller kjegler i midten som skatt. Kvart lag har eige skattekammer.',
    description: 'Ein spelar om gongen hentar éin skatt og tek han tilbake til laget. Når alt er henta, tel de skatten.',
    focus: 'Føring med kontroll og orientering.',
    tips: 'Bruk ballar, kjegler eller vestar.'
  },
  {
    id: 'kongen', name: 'Kongen av ringen', groups: '2-4',
    setup: 'Lag ein firkant. Alle spelarane har kvar sin ball.',
    description: 'Beskytt eigen ball og prøv samtidig å sparke ut dei andre sine ballar. Ein spelar som mister ballen gjer ei kort oppgåve og kjem raskt inn att.',
    focus: 'Skjerming, kropp og vendingar bort frå press.',
    tips: 'Ingen skal stå lenge utanfor.'
  },
  {
    id: 'sjorover', name: 'Sjørøvar', groups: '2-4',
    setup: 'Alle har kvar sin ball inne i ein firkant.',
    description: 'Alle er sjørøvarar som passar på eigen skatt og prøver å stjele frå andre. Mister du ballen, hentar du han og held fram.',
    focus: 'Føring, skjerming og raske vendingar.',
    tips: 'Oppmuntre til å bruke kroppen for å beskytte ballen.'
  },
  {
    id: 'pasningsstafett', name: 'Pasningsstafett', groups: '2-4',
    setup: 'Lag på 3–5. Sett opp tre merke framover med kort avstand.',
    description: 'Første spelar flyttar ballen stegvis utover mellom merka og avsluttar med pasning til neste spelar. Første lag ferdig vinn.',
    focus: 'Presise pasningar, førsteberøring og tempo.',
    tips: 'Auk avstanden dersom det blir for enkelt.'
  },
  {
    id: 'nummerduell', name: 'Nummerduell', groups: '3-5',
    setup: 'To lag på kvar si side av bana, eitt lite mål i kvar ende. Alle får nummer.',
    description: 'Instruktøren ropar nummer og spelar inn ball. Spelarane med nummeret kjem inn og duellerer. Rop fleire nummer for 2 mot 2 eller 3 mot 3.',
    focus: 'Reaksjon, fart og 1 mot 1.',
    tips: 'Varier kor mange nummer du ropar.'
  },
  {
    id: 'portduell', name: '1 mot 1 gjennom port', groups: '3-5',
    setup: 'Lag små baner med portar i kvar ende.',
    description: 'Spel 1 mot 1. Det blir mål når ballen blir ført kontrollert gjennom porten.',
    focus: 'Finter, retningsendring og forsvarsspel.',
    tips: 'Oppmuntre til å utfordre motspelaren.'
  },
  {
    id: 'knockout', name: 'Knockout', groups: '3-5',
    setup: 'Ein keeper i mål. Resten står på rekke. Instruktør har ballar ved sida av målet.',
    description: 'Instruktøren spelar ut, første spelar avsluttar direkte. Scoring betyr at keeper går ut og neste må i mål. Bom/redning betyr at skytaren går i mål.',
    focus: 'Avslutning, presisjon og raske avgjerder.',
    tips: 'Hald køen kort og tempoet høgt.'
  },
  {
    id: 'verdensmester', name: 'Verdsmeister', groups: '4-5',
    setup: 'Fleire små baner ved sida av kvarandre. Spel 1 mot 1 eller 2 mot 2.',
    description: 'Vinnar rykker opp ei bane og tapar rykker ned. Målet er å vinne siste kamp på bane 1.',
    focus: 'Konkurranse, intensitet og meistring.',
    tips: 'Kampar på 2–3 minutt fungerer godt.'
  },
  {
    id: 'innlegg', name: 'Innlegg og avslutning', groups: '4-5',
    setup: 'Ein spelar på kant, ein eller to framfor mål og keeper.',
    description: 'Kantspelaren fører eller tek imot ball og slår innlegg. Angriparane timar løp og avsluttar.',
    focus: 'Timing, innlegg og avslutning.',
    tips: 'Varier mellom låge og høge innlegg.'
  },
  {
    id: 'ti-pasningar', name: 'Ti pasningar', groups: '2-5',
    setup: 'To lag i ein firkant og éin ball.',
    description: 'Laget får poeng når det klarer ti samanhengande pasningar. Ved brot startar tellinga på nytt.',
    focus: 'Pasningsspel, rørsle og samspel.',
    tips: 'Tilpass talet på pasningar og arealet etter nivå.'
  },
  {
    id: 'fire-mal', name: 'Fire mål', groups: '2-5',
    setup: 'Firkant med eitt lite mål i kvart hjørne. To lag.',
    description: 'Laga kan score i alle måla og må heile tida orientere seg etter kvar det er ledig.',
    focus: 'Orientering, val og samspel.',
    tips: 'Gjer bana litt større dersom det blir for tett.'
  },
  {
    id: 'turnering', name: 'Mini-turnering', groups: '1-5',
    setup: 'Fleire små baner. Lag på 3 mot 3 eller 4 mot 4.',
    description: 'Korte kampar på 4–5 minutt og rask rotasjon av motstandarar.',
    focus: 'Speleglede, mange ballberøringar og samspel.',
    tips: 'Unngå lange pausar mellom kampane.'
  }
];
