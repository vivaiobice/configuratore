// Sixth-order Krüger transverse Mercator on WGS84; EPSG codes are explicit.
// Formula reference: Karney (2011), Transverse Mercator with an accuracy of a few nanometers.
const DEG = Math.PI / 180,
  A = 6378137,
  F = 1 / 298.257223563,
  N = F / (2 - F),
  E = Math.sqrt(F * (2 - F)),
  K = 0.9996;
const SCALE = (A / (1 + N)) * (1 + N ** 2 / 4 + N ** 4 / 64 + N ** 6 / 256);
const ALPHA = [
  0,
  N / 2 -
    (2 * N ** 2) / 3 +
    (5 * N ** 3) / 16 +
    (41 * N ** 4) / 180 -
    (127 * N ** 5) / 288 +
    (7891 * N ** 6) / 37800,
  (13 * N ** 2) / 48 -
    (3 * N ** 3) / 5 +
    (557 * N ** 4) / 1440 +
    (281 * N ** 5) / 630 -
    (1983433 * N ** 6) / 1935360,
  (61 * N ** 3) / 240 -
    (103 * N ** 4) / 140 +
    (15061 * N ** 5) / 26880 +
    (167603 * N ** 6) / 181440,
  (49561 * N ** 4) / 161280 -
    (179 * N ** 5) / 168 +
    (6601661 * N ** 6) / 7257600,
  (34729 * N ** 5) / 80640 - (3418889 * N ** 6) / 1995840,
  (212378941 * N ** 6) / 319334400,
];
const BETA = [
  0,
  N / 2 -
    (2 * N ** 2) / 3 +
    (37 * N ** 3) / 96 -
    N ** 4 / 360 -
    (81 * N ** 5) / 512 +
    (96199 * N ** 6) / 604800,
  N ** 2 / 48 +
    N ** 3 / 15 -
    (437 * N ** 4) / 1440 +
    (46 * N ** 5) / 105 -
    (1118711 * N ** 6) / 3870720,
  (17 * N ** 3) / 480 -
    (37 * N ** 4) / 840 -
    (209 * N ** 5) / 4480 +
    (5569 * N ** 6) / 90720,
  (4397 * N ** 4) / 161280 - (11 * N ** 5) / 504 - (830251 * N ** 6) / 7257600,
  (4583 * N ** 5) / 161280 - (108847 * N ** 6) / 3991680,
  (20648693 * N ** 6) / 638668800,
];
function zone(epsg) {
  if (![32632, 32633, 32634].includes(epsg))
    throw new RangeError(
      'CRS UTM non supportato: usare EPSG:32632, 32633 o 32634.',
    );
  return epsg - 32600;
}
function pair(point) {
  if (
    !Array.isArray(point) ||
    point.length !== 2 ||
    !point.every(Number.isFinite)
  )
    throw new RangeError('Coordinate finite richieste.');
}
export function toUTM(point, epsg = 32632) {
  const z = zone(epsg);
  pair(point);
  const [lon, lat] = point;
  if (lon < -180 || lon > 180 || lat < 0 || lat > 84)
    throw new RangeError('Coordinate fuori intervallo WGS84 UTM nord.');
  const lambda = (lon - (6 * z - 183)) * DEG;
  if (Math.abs(lambda) > Math.PI / 6 + 1e-12)
    throw new RangeError('Longitudine fuori dal dominio della zona UTM.');
  const tau = Math.tan(lat * DEG),
    sigma = Math.sinh(E * Math.atanh((E * tau) / Math.sqrt(1 + tau * tau)));
  const tauP =
    tau * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + tau * tau);
  const xiP = Math.atan2(tauP, Math.cos(lambda)),
    etaP = Math.asinh(Math.sin(lambda) / Math.hypot(tauP, Math.cos(lambda)));
  let xi = xiP,
    eta = etaP;
  for (let j = 1; j <= 6; j++) {
    xi += ALPHA[j] * Math.sin(2 * j * xiP) * Math.cosh(2 * j * etaP);
    eta += ALPHA[j] * Math.cos(2 * j * xiP) * Math.sinh(2 * j * etaP);
  }
  return [500000 + K * SCALE * eta, K * SCALE * xi];
}
export function fromUTM(point, epsg = 32632) {
  const z = zone(epsg);
  pair(point);
  const [x, y] = point;
  if (Math.abs(x) > 1e7 || y < 0 || y > 1e7)
    throw new RangeError('Coordinate fuori intervallo UTM nord.');
  const xi = y / (K * SCALE),
    eta = (x - 500000) / (K * SCALE);
  let xiP = xi,
    etaP = eta;
  for (let j = 1; j <= 6; j++) {
    xiP -= BETA[j] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etaP -= BETA[j] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const tauP = Math.sin(xiP) / Math.hypot(Math.sinh(etaP), Math.cos(xiP));
  let tau = tauP / (1 - E * E);
  for (let j = 0; j < 10; j++) {
    const sigma = Math.sinh(
      E * Math.atanh((E * tau) / Math.sqrt(1 + tau * tau)),
    );
    const estimate =
      tau * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + tau * tau);
    const delta =
      ((tauP - estimate) * (1 + (1 - E * E) * tau * tau)) /
      ((1 - E * E) *
        Math.sqrt(1 + tau * tau) *
        Math.sqrt(1 + estimate * estimate));
    tau += delta;
    if (Math.abs(delta) < 1e-14 * Math.max(1, Math.abs(tau))) break;
  }
  const lon = 6 * z - 183 + Math.atan2(Math.sinh(etaP), Math.cos(xiP)) / DEG,
    lat = Math.atan(tau) / DEG;
  if (
    !Number.isFinite(lon) ||
    !Number.isFinite(lat) ||
    lat < 0 ||
    lat > 84.000000001 ||
    lon < -180 ||
    lon > 180 ||
    Math.abs((lon - (6 * z - 183)) * DEG) > Math.PI / 6 + 1e-12
  )
    throw new RangeError('Coordinate UTM non valide.');
  return [lon, lat];
}
