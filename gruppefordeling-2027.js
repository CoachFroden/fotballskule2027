// Standardgrupper for fotballskulen 2027. 1 = yngst, 5 = eldst.
// Fødselsår 2013–2022 er tillatne i påmeldinga.
export function standardGruppe(fodselsar) {
  const ar = Number(fodselsar);
  if (!Number.isInteger(ar) || ar < 2013 || ar > 2022) return null;
  if (ar >= 2020) return 1;
  if (ar === 2019) return 2;
  if (ar === 2018) return 3;
  if (ar === 2017) return 4;
  return 5; // 2013–2016; ordinært 2015–2016
}

// Manuell overstyring skal lagrast separat og alltid vinne over standardgruppa.
export function effektivGruppe(fodselsar, manuellGruppe = null) {
  const g = Number(manuellGruppe);
  return Number.isInteger(g) && g >= 1 && g <= 5 ? g : standardGruppe(fodselsar);
}
