export const OTHER_MATERIAL_VALUE = 'Altro';
export const STANDARD_CLONE = 'Standard';

const rows = [
  ['Favorita B.','I - CVT 14','Kober 5 BB'],
  ['Favorita B.','I - CVT 14','775 Paulsen'],
  ['Favorita B.','I - CVT 14','1103 Paulsen'],
  ['Cortese B.',STANDARD_CLONE,'Kober 5 BB'],
  ['Cortese B.',STANDARD_CLONE,'775 Paulsen'],
  ['Arneis B.','I - CVT CN 32','775 Paulsen'],
  ['Arneis B.','I - CVT CN 15','775 Paulsen'],
  ['Chardonnay B.','I - ISV Conegliano 1','S.O.4'],
  ['Chardonnay B.','I - ISV Conegliano 1','775 Paulsen'],
  ['Chardonnay B.',STANDARD_CLONE,'775 Paulsen'],
  ['Viognier B.',STANDARD_CLONE,'775 Paulsen'],
  ['Sauvignon B.','I - Enotria 565','775 Paulsen'],
  ['Timorasso B.',STANDARD_CLONE,'Kober 5 BB'],
  ['Timorasso B.',STANDARD_CLONE,'S.O.4'],

  ['Moscato Bianco B.','I - CVT AT 57','Kober 5 BB'],
  ['Moscato Bianco B.','I - CVT 190','Kober 5 BB'],
  ['Moscato Bianco B.','I - MartiniRossi CVT G3','Kober 5 BB'],
  ['Moscato Bianco B.','I - Martini Rossi CVT 61','Kober 5 BB'],
  ['Moscato Bianco B.','I - MartiniRossi CVT G9','Kober 5 BB'],
  ['Moscato Bianco B.',STANDARD_CLONE,'Kober 5 BB'],
  ['Moscato Bianco B.','I - CVT 190','775 Paulsen'],
  ['Moscato Bianco B.','I - Martini Rossi CVT 61','775 Paulsen'],
  ['Moscato Bianco B.','I - Martini Rossi CVT 70','775 Paulsen'],
  ['Moscato Bianco B.','I - MartiniRossi CVT G3','775 Paulsen'],
  ['Moscato Bianco B.',STANDARD_CLONE,'775 Paulsen'],
  ['Moscato Bianco B.','I - Martini Rossi CVT 70','779 Paulsen'],
  ['Moscato Bianco B.',STANDARD_CLONE,'779 Paulsen'],
  ['Moscato Bianco B.','I - CVT AT 57','1103 Paulsen'],
  ['Moscato Bianco B.','I - CVT 190','1103 Paulsen'],
  ['Moscato Bianco B.','I - Martini Rossi CVT 61','1103 Paulsen'],
  ['Moscato Bianco B.','I - Martini Rossi CVT 70','1103 Paulsen'],
  ['Moscato Bianco B.',STANDARD_CLONE,'1103 Paulsen'],
  ['Moscato Bianco B.','I - CVT AT 57','S.O.4'],
  ['Moscato Bianco B.','I - MartiniRossi CVT G3','S.O.4'],
  ['Moscato Bianco B.',STANDARD_CLONE,'S.O.4'],
  ['Moscato Bianco B.',STANDARD_CLONE,'157.11 C.'],
  ['Moscato Bianco B.','I - CVT AT 57','110 Richter'],

  ['Barbera N.','I - AT 84','Kober 5 BB'],
  ['Barbera N.','I - CVT 83','Kober 5 BB'],
  ['Barbera N.','I - CVT GJ1','Kober 5 BB'],
  ['Barbera N.','I - CVT MCC 3','Kober 5 BB'],
  ['Barbera N.','I - CVT MCC 3','775 Paulsen'],
  ['Barbera N.','I - AT 84','1103 Paulsen'],
  ['Barbera N.','I - CVT 83','1103 Paulsen'],
  ['Barbera N.','I - CVT GJ1','1103 Paulsen'],
  ['Barbera N.','I - CVT MCC 3','1103 Paulsen'],
  ['Nebbiolo N.','I - CN 36','Kober 5 BB'],
  ['Nebbiolo N.','I - CVT CN 230','Kober 5 BB'],
  ['Nebbiolo N.','I - CVT 71 (Michet)','Kober 5 BB'],
  ['Nebbiolo N.','I - CVT 423 (Picotener)','Kober 5 BB'],
  ['Nebbiolo N.','I - CN 36','775 Paulsen'],
  ['Nebbiolo N.','I - CVT CN 230','775 Paulsen'],
  ['Nebbiolo N.','I - CN 36','1103 Paulsen'],
  ['Nebbiolo N.','I - CVT CN 230','1103 Paulsen'],
  ['Nebbiolo N.','I - CVT 71 (Michet)','1103 Paulsen'],
  ['Nebbiolo N.','I - CVT 308 (Picotener)','1103 Paulsen'],
  ['Dolcetto N.','I - CVT 8','Kober 5 BB'],
  ['Dolcetto N.','I - CVT 8','1103 Paulsen'],
  ['Dolcetto N.','I - CVT CN 22','775 Paulsen'],
  ['Pinot Nero N.',STANDARD_CLONE,'775 Paulsen'],
  ['Freisa N.',STANDARD_CLONE,'775 Paulsen'],
  ['Brachetto N.',STANDARD_CLONE,'775 Paulsen'],
  ['Gamba Rossa N.',STANDARD_CLONE,'775 Paulsen'],
  ['Grignolino N.','I - CVT AT 261','775 Paulsen'],
  ['Cabernet Sauvignon N.','I - ISV-F-V5','775 Paulsen'],
  ['Merlot N.','I - Ampelos TEA 13','775 Paulsen'],

  ['Regina B.',STANDARD_CLONE,'775 Paulsen'],
  ['Italia B.',STANDARD_CLONE,'775 Paulsen'],
  ['Victoria B.',STANDARD_CLONE,'775 Paulsen'],
  ['Pizzutello Bianco B.',STANDARD_CLONE,'775 Paulsen'],
  ['S. Anna di Lipsia B.',STANDARD_CLONE,'775 Paulsen'],
  ['Sultanina Bianca B.',STANDARD_CLONE,'775 Paulsen'],
  ['Cardinal N.',STANDARD_CLONE,'775 Paulsen'],
  ["Moscato d'Amburgo N.",STANDARD_CLONE,'775 Paulsen'],
  ['Isabella N.',STANDARD_CLONE,'775 Paulsen'],
  ['Red Flame N.',STANDARD_CLONE,'775 Paulsen'],
  ['Michele Palieri N.',STANDARD_CLONE,'775 Paulsen'],
  ['Black Magic N.',STANDARD_CLONE,'775 Paulsen']
].map(([variety, clone, rootstock]) => ({ variety, clone, rootstock }));

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function listVarieties() {
  return unique(rows.map((row) => row.variety));
}

export function listClonesForVariety(variety) {
  if (!variety || variety === OTHER_MATERIAL_VALUE) return [];
  return unique(rows.filter((row) => row.variety === variety).map((row) => row.clone));
}

export function listRootstocksForSelection(variety, clone = '') {
  let matching = rows;
  if (variety && variety !== OTHER_MATERIAL_VALUE) matching = matching.filter((row) => row.variety === variety);
  if (clone && clone !== OTHER_MATERIAL_VALUE) matching = matching.filter((row) => row.clone === clone);
  if (!matching.length && variety && variety !== OTHER_MATERIAL_VALUE) matching = rows.filter((row) => row.variety === variety);
  return unique(matching.map((row) => row.rootstock));
}

export function isOtherMaterialSelection(value) {
  return value === OTHER_MATERIAL_VALUE;
}

export function isKnownCloneForVariety(variety, clone) {
  return !clone || clone === OTHER_MATERIAL_VALUE || listClonesForVariety(variety).includes(clone);
}

export function isKnownRootstockForSelection(variety, clone, rootstock) {
  return !rootstock || rootstock === OTHER_MATERIAL_VALUE || listRootstocksForSelection(variety, clone).includes(rootstock);
}

export const PLANT_CATALOG_ROWS = rows;
