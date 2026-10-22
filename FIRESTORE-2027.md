# Firestore-kopling for påmelding 2027

## Status
Google Apps Script i `google-forms-oppsett.gs` kan opprette Google Forms, lagre svar i eit privat Google Sheets-ark og ved kvar innsending sende deltakardata til Firestore via autentisert REST API. Oppsettet er **ikkje aktivert eller produksjonstesta**.

## Aktivering
1. Opprett eit **separat Firebase-prosjekt for 2027**, eller avklar særskilt isolering og tilgangar før gamle data blir brukte. Ikkje bruk produksjonsdata til testing.
2. Opprett ein tenestekonto med minst mogleg Firestore-tilgang. Lagre e-post og privatnøkkel **berre** i Apps Script Script Properties, aldri i GitHub.
3. Set `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_EMAIL`, `FIREBASE_PRIVATE_KEY` i Script Properties. Dersom nøkkelen er limt inn med bokstavlege `\\n`, handterer skriptet det.
4. Kopier `google-forms-oppsett.gs` inn i https://script.google.com, køyr `opprettFotballskule2027` éin gong og godkjenn tilgangar. Kvar køyring lagar nytt skjema; ikkje køyr om att ved normal drift.
5. Send inn ei **fiktiv testpåmelding** og kontroller `pameldingar2027` i Firestore. Sjekk feil under Apps Script Executions.
6. Kopier publisert skjemalenkje til den framtidige påmeldingssida.

## Data og grupper
- `pameldingar2027/{formResponseId}` inneheld `standardGruppe` (1–5), fødselsår og øvrige påmeldingsfelt.
- `manuellGruppe` kan setjast til 1–5 av autorisert administrator. Visningsgruppe = `manuellGruppe` dersom gyldig, elles `standardGruppe`.
- Aldersfordeling: 2020–2022 gruppe 1, 2019 gruppe 2, 2018 gruppe 3, 2017 gruppe 4, 2013–2016 gruppe 5.
- Google Forms avgrensar fødselsår til 2013–2022.
- Ved nye svar skjer lagring automatisk. Feila innsendingar må følgjast opp i Apps Script og eventuelt køyrast på nytt.

## Personvern og sikkerheit
Barn sine kontakt- og allergiopplysningar er sensitive i praksis. Ikkje legg inn opne Firestore-reglar. Krev innlogging, minste privilegium og tilgang til helseopplysningar berre for dei som treng det. Informer føresette om formål, behandlingsansvarleg, oppbevaring, sletting og rettar før skjemaet blir publisert. Google Sheets-svararket må ikkje delast offentleg.

## Gjenstår
Kopiere og tilpasse eksisterande app til nytt repo, etablere separate Firebase-reglar, lage adminvisning og manuell gruppeflytting, og leggje skjemalenkja på påmeldingssida. Ingen av desse stega er ferdige.
