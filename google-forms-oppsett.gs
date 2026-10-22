function opprettFotballskule2027() {
  const form = FormApp.create('Påmelding – TINE Fotballskule 2027');
  form.setDescription('Samnanger IL. Opplysningane blir berre brukte til å planleggje og gjennomføre fotballskulen. Kontakt arrangøren ved spørsmål om personvern.');
  form.addTextItem().setTitle('Namn på deltakar').setRequired(true);
  const year = form.addTextItem().setTitle('Fødselsår').setRequired(true);
  year.setValidation(FormApp.createTextValidation().requireTextMatchesPattern('^20[0-2][0-9]$').setHelpText('Skriv fire siffer, til dømes 2017.').build());
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
  const oversikt = sheet.insertSheet('Gruppeoversikt');
  oversikt.getRange('A1:D1').setValues([['Namn','Fødselsår','Gruppe','T-skjorte']]);
  oversikt.setFrozenRows(1);
  PropertiesService.getScriptProperties().setProperty('FOTBALLSKULE_2027_SHEET',sheet.getId());
  ScriptApp.newTrigger('oppdaterGrupper').forSpreadsheet(sheet).onFormSubmit().create();
  Logger.log('Skjema: '+form.getPublishedUrl());
  Logger.log('Svarark: '+sheet.getUrl());
}

function oppdaterGrupper() {
  const id=PropertiesService.getScriptProperties().getProperty('FOTBALLSKULE_2027_SHEET');
  const ss=SpreadsheetApp.openById(id);
  const response=ss.getSheets().find(s=>s.getName()!=='Gruppeoversikt');
  const out=ss.getSheetByName('Gruppeoversikt');
  const rows=response.getDataRange().getValues();
  const headers=rows.shift().map(String);
  const idx=(name)=>headers.indexOf(name);
  const data=rows.filter(r=>r[idx('Namn på deltakar')] && /^\\d{4}$/.test(String(r[idx('Fødselsår')]))).map(r=>({
    name:String(r[idx('Namn på deltakar')]),year:Number(r[idx('Fødselsår')]),shirt:String(r[idx('Storleik på T-skjorte')])
  })).sort((a,b)=>b.year-a.year||a.name.localeCompare(b.name,'no'));
  // Fordel årskull samla, med fem alderssorterte grupper og omtrent likt deltakartal.
  const years=[...new Set(data.map(d=>d.year))];
  let group=1,count=0;
  const yearGroups={};
  for(const y of years) {
    const n=data.filter(d=>d.year===y).length;
    if(group<5 && count>0 && count+n/2>data.length/5*group) group++;
    yearGroups[y]=group;count+=n;
  }
  if(out.getLastRow()>1) out.getRange(2,1,out.getLastRow()-1,4).clearContent();
  if(data.length) out.getRange(2,1,data.length,4).setValues(data.map(d=>[d.name,d.year,yearGroups[d.year],d.shirt]));
}
