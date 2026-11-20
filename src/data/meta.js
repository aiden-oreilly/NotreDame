// Curated knowledge layered on top of OpenStreetMap footprints.
// built/demolished years drive the Time Machine; h overrides estimated heights (meters);
// codes are the short names students and calendars use. Years are opening years, rounded where sources differ.
export const META = [
  { m: /^Main Building$/, built: 1879, h: 26, cat: 'landmark', style: 'brick', codes: ['main building', 'golden dome', 'dome', 'main bldg', 'admin building'], blurb: 'Rebuilt in a single summer after the fire of April 1879. The dome was finished in 1882 and gilded in 1886; Mary stands on top.' },
  { m: /^Basilica of the Sacred Heart$/, built: 1871, h: 21, cat: 'landmark', style: 'brick', codes: ['basilica', 'sacred heart', 'basilica of the sacred heart'], blurb: 'Begun in 1871 and consecrated in 1888. Its spire is the tallest point on campus.' },
  { m: /^Log Chapel$/, built: 1906, h: 7, cat: 'landmark', style: 'log', codes: ['log chapel'], blurb: 'A 1906 replica of the 1831 chapel Fr. Sorin found when he arrived in 1842.' },
  { m: /^Old College$/, built: 1843, h: 10, cat: 'landmark', style: 'brick', codes: ['old college'], blurb: 'The oldest building on campus, built by Fr. Sorin and the Brothers of Holy Cross in 1843.' },
  { m: /^Sorin Hall$/, built: 1888, h: 16, cat: 'residence', style: 'brick', codes: ['sorin'] },
  { m: /^Washington Hall$/, built: 1881, h: 19, cat: 'academic', style: 'brick', codes: ['washington hall'] },
  { m: /^LaFortune Student Center$/, built: 1883, h: 14, cat: 'student', style: 'brick', codes: ['lafortune', 'lafun', 'science hall'], blurb: 'Built as Science Hall in 1883; the student center since 1953.' },
  { m: /^Corby Hall$/, built: 1893, h: 16, cat: 'admin', style: 'brick', codes: ['corby'] },
  { m: /^Crowley Hall/, built: 1893, h: 14, cat: 'academic', style: 'brick', codes: ['crowley'] },
  { m: /^Badin Hall$/, built: 1897, h: 15, cat: 'residence', style: 'brick', codes: ['badin'] },
  { m: /^St\.? Edward'?s Hall$/, built: 1882, h: 16, cat: 'residence', style: 'brick', codes: ['st eds', 'st. ed', 'st edward'] },
  { m: /^Walsh Hall$/, built: 1909, h: 16, cat: 'residence', style: 'brick', codes: ['walsh hall'] },
  { m: /^Brownson Hall$/, built: 1855, h: 14, cat: 'admin', style: 'brick', codes: ['brownson'] },
  { m: /^Columba Hall$/, built: 1898, h: 15, cat: 'admin', style: 'brick' },
  { m: /^Carroll Hall$/, built: 1906, h: 15, cat: 'residence', style: 'brick', codes: ['carroll'] },
  { m: /^Bond Hall$/, built: 1917, h: 16, cat: 'academic', style: 'limestone', codes: ['bond'], blurb: 'Opened in 1917 as the university library; home to Architecture until 2019.' },
  { m: /^South Dining Hall$/, built: 1927, h: 17, cat: 'dining', style: 'brick', codes: ['sdh', 'south dining'] },
  { m: /^Howard Hall$/, built: 1925, h: 15, cat: 'residence', style: 'brick', codes: ['howard'] },
  { m: /^Lyons Hall$/, built: 1925, h: 15, cat: 'residence', style: 'brick', codes: ['lyons'] },
  { m: /^Morr?is?sey (Manor|Hall)$/, built: 1925, h: 16, cat: 'residence', style: 'brick', codes: ['morrissey'] },
  { m: /^Alumni Hall$/, built: 1931, h: 15, cat: 'residence', style: 'brick', codes: ['alumni'] },
  { m: /^Dillon Hall$/, built: 1931, h: 15, cat: 'residence', style: 'brick', codes: ['dillon'] },
  { m: /^Notre Dame Stadium$/, built: 1930, h: 33, cat: 'athletic', style: 'brick', codes: ['stadium', 'notre dame stadium', 'nd stadium'], blurb: 'Opened in October 1930 with Knute Rockne as coach. Campus Crossroads wrapped it in 2017.' },
  { m: /^Hurley Hall/, built: 1932, h: 15, cat: 'academic', style: 'brick', codes: ['hurley'] },
  { m: /^Cushing Hall/, built: 1933, h: 16, cat: 'academic', style: 'brick', codes: ['cushing', 'chem'] },
  { m: /^Rockne Memorial$/, built: 1937, h: 17, cat: 'athletic', style: 'brick', codes: ['rockne', 'rock'] },
  { m: /^Cavanaugh Hall$/, built: 1936, h: 15, cat: 'residence', style: 'brick', codes: ['cavanaugh'] },
  { m: /^Zahm (House|Hall)$/, built: 1937, h: 15, cat: 'residence', style: 'brick', codes: ['zahm'] },
  { m: /^Haggar Hall$/, built: 1937, h: 15, cat: 'academic', style: 'brick', codes: ['haggar'] },
  { m: /^Breen-Phillips Hall$/, built: 1939, h: 15, cat: 'residence', style: 'brick', codes: ['bp', 'breen-phillips', 'breen phillips'] },
  { m: /^Farley Hall$/, built: 1947, h: 15, cat: 'residence', style: 'brick', codes: ['farley'] },
  { m: /^Nieuwland Science Hall$/, built: 1952, h: 16, cat: 'academic', style: 'brick', codes: ['nieuwland', 'nsh'] },
  { m: /^Fisher Hall$/, built: 1952, h: 15, cat: 'residence', style: 'brick', codes: ['fisher'] },
  { m: /^Morris Inn$/, built: 1952, h: 18, cat: 'admin', style: 'brick', codes: ['morris inn'] },
  { m: /^O'Shaughnessy Hall$/, built: 1953, h: 20, cat: 'academic', style: 'limestone', codes: ["o'shaughnessy", 'oshag', "o'shag", 'o shag', 'osh'] },
  { m: /^Pangborn Hall$/, built: 1955, h: 15, cat: 'residence', style: 'brick', codes: ['pangborn'] },
  { m: /^Keenan Hall$/, built: 1957, h: 15, cat: 'residence', style: 'brick', codes: ['keenan'] },
  { m: /^Stanford Hall$/, built: 1957, h: 15, cat: 'residence', style: 'brick', codes: ['stanford'] },
  { m: /^North Dining Hall$/, built: 1957, h: 13, cat: 'dining', style: 'brick', codes: ['ndh', 'north dining'] },
  { m: /^Stepan Center$/, built: 1962, h: 15, cat: 'student', style: 'dome', codes: ['stepan center'] },
  { m: /^Hesburgh Library$/, built: 1963, h: 20, cat: 'landmark', style: 'limestone', codes: ['hesburgh library', 'hesburgh', 'library', 'hesb', 'touchdown jesus'], blurb: 'Opened in 1963 as Memorial Library. The granite Word of Life mural on its south face looks toward the stadium.' },
  { m: /^Lewis Hall$/, built: 1965, h: 16, cat: 'residence', style: 'brick', codes: ['lewis'] },
  { m: /^McKenna Hall$/, built: 1966, h: 14, cat: 'academic', style: 'limestone', codes: ['mckenna'] },
  { m: /^Hayes-Healy Center$/, built: 1968, h: 15, cat: 'academic', style: 'limestone', codes: ['hayes-healy', 'hayes healy'] },
  { m: /^Joyce (Athletic )?Center/, built: 1968, h: 20, cat: 'athletic', style: 'concrete', codes: ['joyce', 'jacc', 'purcell', 'joyce center'] },
  { m: /^Grace Hall$/, built: 1969, cat: 'admin', style: 'modern', codes: ['grace'] },
  { m: /^Flanner Hall$/, built: 1969, cat: 'admin', style: 'modern', codes: ['flanner'] },
  { m: /^Galvin Life Science/, built: 1972, h: 16, cat: 'academic', style: 'brick', codes: ['galvin'] },
  { m: /^Fitzpatrick Hall/, built: 1979, h: 18, cat: 'academic', style: 'modern', codes: ['fitzpatrick', 'fitz'] },
  { m: /^Snite Museum$/, built: 1980, demolished: 2025, h: 12, cat: 'academic', style: 'brick', codes: ['snite'] },
  { m: /^Pasquerilla East Hall$/, built: 1981, h: 16, cat: 'residence', style: 'brick', codes: ['pe', 'pasquerilla east'] },
  { m: /^Pasquerilla West Hall$/, built: 1981, h: 16, cat: 'residence', style: 'brick', codes: ['pw', 'pasquerilla west'] },
  { m: /^Stepan Chemistry Hall$/, built: 1982, cat: 'academic', style: 'brick', codes: ['stepan chem', 'stepan chemistry'] },
  { m: /^Rolfs Aquatic Center$/, built: 1985, cat: 'athletic', style: 'brick', codes: ['rolfs aquatic'] },
  { m: /^Siegfried Hall$/, built: 1988, h: 16, cat: 'residence', style: 'brick', codes: ['siegfried'] },
  { m: /^Knott Hall$/, built: 1988, h: 16, cat: 'residence', style: 'brick', codes: ['knott'] },
  { m: /^Loftus Sports Center$/, built: 1988, cat: 'athletic', style: 'concrete', codes: ['loftus'] },
  { m: /^Hesburgh Center for International Studies$/, built: 1991, h: 13, cat: 'academic', style: 'brick', codes: ['hesburgh center', 'keough school', 'hcis'] },
  { m: /^DeBartolo Hall$/, built: 1992, h: 14, cat: 'academic', style: 'brick', codes: ['debartolo', 'debart', 'dbrt', 'deb'] },
  { m: /^Decio Faculty Hall$/, built: 1993, cat: 'academic', style: 'brick', codes: ['decio'] },
  { m: /^Mendoza College of Business$/, built: 1995, h: 18, cat: 'academic', style: 'brick', codes: ['mendoza', 'mcob', 'business', 'mendoza college of business'] },
  { m: /^Keough Hall$/, built: 1996, h: 17, cat: 'residence', style: 'brick', codes: ['keough hall'] },
  { m: /^O'Neill (Family )?Hall$/, built: 1996, h: 17, cat: 'residence', style: 'brick', codes: ["o'neill family"] },
  { m: /^McGlinn Hall$/, built: 1997, h: 17, cat: 'residence', style: 'brick', codes: ['mcglinn'] },
  { m: /^Welsh Family Hall$/, built: 1997, h: 17, cat: 'residence', style: 'brick', codes: ['welsh family', 'welsh fam'] },
  { m: /^Malloy Hall$/, built: 1997, cat: 'academic', style: 'brick', codes: ['malloy'] },
  { m: /^Eck Visitors Center$/, built: 1999, cat: 'student', style: 'brick', codes: ['eck visitors'] },
  { m: /^Hammes Bookstore/, built: 1999, cat: 'student', style: 'brick', codes: ['bookstore', 'hammes'] },
  { m: /^Coleman.Morse Center$/, built: 2001, cat: 'student', style: 'brick', codes: ['coleman-morse', 'coleman morse', 'como'] },
  { m: /^DeBartolo Performing Arts Center$/, built: 2004, h: 22, cat: 'academic', style: 'brick', codes: ['dpac', 'performing arts', 'debartolo performing arts center'] },
  { m: /^Jordan Hall of Science$/, built: 2006, h: 20, cat: 'academic', style: 'brick', codes: ['jordan', 'jordan hall', 'jhos'] },
  { m: /^Duncan Hall$/, built: 2008, h: 17, cat: 'residence', style: 'brick', codes: ['duncan hall'] },
  { m: /^Ryan Hall$/, built: 2009, h: 17, cat: 'residence', style: 'brick', codes: ['ryan hall'] },
  { m: /^(Eck Hall of Law|Biolchini Hall)/, built: 2009, h: 20, cat: 'academic', style: 'limestone', codes: ['eck hall of law', 'law school', 'law', 'biolchini'] },
  { m: /^Geddes Hall$/, built: 2009, cat: 'academic', style: 'brick', codes: ['geddes'] },
  { m: /^Stinson-Remick Hall$/, built: 2010, h: 18, cat: 'academic', style: 'brick', codes: ['stinson', 'stinson-remick', 'srh'] },
  { m: /^Compton Family Ice Arena$/, built: 2011, h: 20, cat: 'athletic', style: 'brick', codes: ['compton', 'ice arena'] },
  { m: /^McCourtney Hall/, built: 2016, h: 18, cat: 'academic', style: 'brick', codes: ['mccourtney'] },
  { m: /^Dunne Hall$/, built: 2016, h: 17, cat: 'residence', style: 'brick', codes: ['dunne'] },
  { m: /^Flaherty Hall$/, built: 2016, h: 17, cat: 'residence', style: 'brick', codes: ['flaherty'] },
  { m: /^Jenkins.Nanovic Hall/, built: 2017, h: 20, cat: 'academic', style: 'limestone', codes: ['jenkins', 'nanovic', 'jenkins nanovic'] },
  { m: /^Duncan Student Center$/, built: 2017, h: 40, cat: 'student', style: 'limestone', codes: ['duncan student center', 'duncan', 'dsc'] },
  { m: /^Corbett Family Hall$/, built: 2017, h: 40, cat: 'academic', style: 'limestone', codes: ['corbett'] },
  { m: /^O'Neill Hall( of Music)?$/, built: 2017, h: 30, cat: 'academic', style: 'limestone', codes: ["o'neill hall of music", 'oneill music', 'music'] },
  { m: /^Walsh Family Hall of Architecture$/, built: 2019, h: 17, cat: 'academic', style: 'limestone', codes: ['architecture', 'walsh family hall', 'walsh arch'] },
  { m: /^Baumer Hall$/, built: 2019, h: 17, cat: 'residence', style: 'brick', codes: ['baumer'] },
  { m: /^Johnson Family Hall$/, built: 2020, h: 17, cat: 'residence', style: 'brick', codes: ['johnson family'] },
  { m: /^Graham Family Hall$/, built: 2023, h: 17, cat: 'residence', style: 'brick', codes: ['graham'] },
  { m: /^Raclin Murphy Museum of Art$/, built: 2024, h: 17, cat: 'landmark', style: 'limestone', codes: ['raclin', 'raclin murphy', 'museum'] },
  { m: /^Riley Hall/, built: 1983, cat: 'academic', style: 'brick', codes: ['riley'] },
  { m: /^Information Technology Center$/, built: 2008, cat: 'admin', style: 'brick', codes: ['itc'] },
  { m: /^Innovation Park/, built: 2009, cat: 'academic', style: 'modern' },
  { m: /^Stayer Center/, built: 2013, cat: 'academic', style: 'limestone', codes: ['stayer'] },
  { m: /^(Hammes )?Mowbray|^Mason Support/, built: 2008, cat: 'admin', style: 'brick' },
];

// Structures that no longer exist, shown only in the eras they stood in (meters, local frame)
export const LOST = [
  { name: 'Cartier Field', kind: 'field', x: 470, z: 70, w: 120, d: 70, rot: 0, built: 1900, demolished: 1962, blurb: 'Varsity football field until the stadium opened, then a practice field; Hesburgh Library rose on its site.' },
  { name: 'Old Fieldhouse', kind: 'hall', x: 168, z: 150, w: 70, d: 42, h: 19, rot: 0, built: 1899, demolished: 1983, blurb: 'Home of basketball and indoor track for most of a century. The Fieldhouse Mall marks its footprint.' },
];

export const ERAS = [
  { year: 1888, label: '1888', title: 'The Golden Dome era', grade: 'albumen', text: 'The rebuilt Main Building and its new dome anchor a small campus of brick halls between two lakes. The Basilica is consecrated this year and Sorin Hall opens as a residence hall with private rooms.' },
  { year: 1931, label: '1931', title: "Rockne's campus", grade: 'silver', text: "Notre Dame Stadium opened the previous October. South Quad is filling in with Howard, Lyons, Morrissey, Alumni and Dillon, and the varsity teams still practice on Cartier Field." },
  { year: 1964, label: '1964', title: 'The Hesburgh years', grade: 'kodachrome', text: 'Memorial Library, now Hesburgh Library, opened in 1963 on the old Cartier Field. North Quad is complete and the campus is expanding east toward the new athletic center.' },
  { year: 2026, label: 'Today', title: 'Notre Dame today', grade: 'none', text: 'Campus Crossroads wraps the stadium, the arts district rises on the south edge, and new residence halls line East Quad.' },
];

export const SEASONS = ['spring', 'summer', 'fall', 'winter'];

// The President's Tour: target building names, camera azimuth (deg from north, clockwise), elevation (deg), distance (m), caption
export const TOUR = [
  { name: 'Main Building', az: 200, el: 22, dist: 230, hold: 7, caption: 'The Golden Dome. Rebuilt in 1879, gilded in 1886.' },
  { name: 'Basilica of the Sacred Heart', az: 150, el: 16, dist: 190, hold: 6, caption: 'The Basilica of the Sacred Heart, consecrated 1888.' },
  { poi: 'Grotto of Our Lady of Lourdes', az: 120, el: 25, dist: 120, hold: 6, caption: 'The Grotto, a one-seventh scale replica of Lourdes, dedicated in 1896.' },
  { name: 'Hesburgh Library', az: 185, el: 14, dist: 280, hold: 7, caption: 'Hesburgh Library and the Word of Life mural, facing the stadium.' },
  { name: 'Notre Dame Stadium', az: 330, el: 38, dist: 420, hold: 7, caption: 'Notre Dame Stadium, 1930, and Campus Crossroads, 2017.' },
  { name: 'Raclin Murphy Museum of Art', az: 200, el: 24, dist: 260, hold: 6, caption: 'The arts district: Raclin Murphy Museum and Walsh Family Hall of Architecture.' },
  { name: 'Main Building', az: 20, el: 42, dist: 1300, hold: 8, caption: 'Notre Dame, Indiana. 1,261 acres, two lakes, one dome.' },
];

const cache = new Map();
export function metaFor(name) {
  if (!name) return null;
  if (cache.has(name)) return cache.get(name);
  const r = META.find(e => e.m.test(name)) || null; cache.set(name, r); return r;
}
export const slug = s => s.toLowerCase().replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
