// Kjør opprettFotballskule2027() én gong i Google Apps Script.
// Set Script Properties: FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT_EMAIL,
// FIREBASE_PRIVATE_KEY (PEM). Del aldri desse verdiane i GitHub.
function standardGruppe2027(year) {
  year = Number(year);
  if (!Number.isInteger(year) || year < 2013 || year > 2022) throw Error('Ugyldig fødselsår');
  return year >= 2020 ? 1 : year === 2019 ? 2 : year === 2018 ? 3 : year === 2017 ? 4 : 5;
}
function opprettFotballskule2027() {
  const form = FormApp.create('Påmelding – TINE Fotballskule 2027');
  form.setDescription('Samnanger IL. Informasjonen blir brukt til å planleggje og gjennomføre fotballskulen. Kontakt arrangøren for informasjon om lagring og sletting.');
  form.addTextItem().setTitle('Namn på deltakar').setRequired(true);
  form.addTextItem().setTitle('Fødselsår').setRequired(true).setValidation(
    FormApp.createTextValidation().requireTextMatchesPattern('^20(1[3-9]|2[0-2])$').setHelpText('Fødselsår 2013–2022.').build());
  form.addListItem().setTitle('Storleik på T-skjorte').setChoiceValues(['110/116','122/128','134/140','146/152','158/164','XS','S','M','L','XL']).setRequired(true);
  form.addTextItem().setTitle('Kontaktperson 1 – namn').setRequired(true);
  form.addTextItem().setTitle('Kontaktperson 1 – telefon').setRequired(true);
  form.addTextItem().setTitle('Kontaktperson 2 – namn (valfritt)');
  form.addTextItem().setTitle('Kontaktperson 2 – telefon (valfritt)');
  form.addMultipleChoiceItem().setTitle('Har deltakaren allergiar?').setChoiceValues(['Nei','Ja']).setRequired(true);
  form.addParagraphTextItem().setTitle('Dersom ja: Kva allergiar må vi ta omsyn til?');
  form.addParagraphTextItem().setTitle('Andre omsyn eller viktig informasjon (valfritt)');
  form.addCheckboxItem().setTitle('Eg stadfestar at eg er føresett eller har løyve frå føresett til å melde på barnet.').setChoiceValues(['Ja']).setRequired(true);
  const sheet = SpreadsheetApp.create('Fotballskule 2027 – påmeldingar (privat)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());
  PropertiesService.getScriptProperties().setProperty('FOTBALLSKULE_2027_SHEET',sheet.getId());
  ScriptApp.newTrigger('registrerPamelding2027').forForm(form).onFormSubmit().create();
  Logger.log('Skjema: '+form.getPublishedUrl());
  Logger.log('Svarark: '+sheet.getUrl());
}
function firestoreToken2027_() {
  const p = PropertiesService.getScriptProperties();
  const email = p.getProperty('FIREBASE_SERVICE_ACCOUNT_EMAIL');
  const key = p.getProperty('FIREBASE_PRIVATE_KEY');
  if (!email || !key) throw Error('Manglar Firebase-tenestekonto i Script Properties');
  const now = Math.floor(Date.now()/1000);
  const encode = o => Utilities.base64EncodeWebSafe(JSON.stringify(o)).replace(/=+$/,'');
  const header = encode({alg:'RS256',typ:'JWT'});
  const payload = encode({iss:email,sub:email,aud:'https://oauth2.googleapis.com/token',scope:'https://www.googleapis.com/auth/datastore',iat:now,exp:now+3600});
  const input=header+'.'+payload;
  const sig=Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(input,key.replace(/\\n/g,'\n'))).replace(/=+$/,'');
  const res=UrlFetchApp.fetch('https://oauth2.googleapis.com/token',{method:'post',payload:{grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:input+'.'+sig},muteHttpExceptions:true});
  if(res.getResponseCode()!==200) throw Error('Firebase-autentisering feila: '+res.getResponseCode());
  return JSON.parse(res.getContentText()).access_token;
}
function registrerPamelding2027(e) {
  const answers={};
  e.response.getItemResponses().forEach(r=>answers[r.getItem().getTitle()]=String(r.getResponse()||'').trim());
  const year=Number(answers['Fødselsår']);
  const group=standardGruppe2027(year);
  const id=e.response.getId().replace(/[^a-zA-Z0-9_-]/g,'_');
  const p=PropertiesService.getScriptProperties();
  const project=p.getProperty('FIREBASE_PROJECT_ID');
  if(!project) throw Error('FIREBASE_PROJECT_ID manglar');
  const url='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(project)+'/databases/(default)/documents/pameldingar2027/'+encodeURIComponent(id);
  const fields={
    namn:{stringValue:answers['Namn på deltakar']},fodselsar:{integerValue:String(year)},
    standardGruppe:{integerValue:String(group)},tSkjorte:{stringValue:answers['Storleik på T-skjorte']},
    kontakt1Namn:{stringValue:answers['Kontaktperson 1 – namn']},kontakt1Telefon:{stringValue:answers['Kontaktperson 1 – telefon']},
    kontakt2Namn:{stringValue:answers['Kontaktperson 2 – namn (valfritt)']||''},kontakt2Telefon:{stringValue:answers['Kontaktperson 2 – telefon (valfritt)']||''},
    harAllergiar:{booleanValue:answers['Har deltakaren allergiar?']==='Ja'},
    allergiar:{stringValue:answers['Dersom ja: Kva allergiar må vi ta omsyn til?']||''},
    andreOmsyn:{stringValue:answers['Andre omsyn eller viktig informasjon (valfritt)']||''},
    utanforOrdinarAlder:{booleanValue:year<2015||year>2020},
    kjelde:{stringValue:'google-forms-2027'}
  };
  // PATCH oppdaterer berre importerte felt: manuellGruppe blir ikkje overskriven.
  const mask=Object.keys(fields).map(k=>'updateMask.fieldPaths='+encodeURIComponent(k)).join('&');
  const res=UrlFetchApp.fetch(url+'?'+mask,{method:'patch',contentType:'application/json',headers:{Authorization:'Bearer '+firestoreToken2027_()},payload:JSON.stringify({fields}),muteHttpExceptions:true});
  if(res.getResponseCode()<200||res.getResponseCode()>=300) throw Error('Firestore-lagring feila: '+res.getResponseCode()+' '+res.getContentText());
}
