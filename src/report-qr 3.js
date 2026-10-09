import qrcode from '../vendor/qrcode-generator-esm.js';

function validatedDestination(value) {
  const input = String(value ?? '').trim();
  if (!input) throw new TypeError('Il link del progetto è obbligatorio.');
  let url;
  try { url = new URL(input); } catch { throw new TypeError('Il link del progetto non è valido.'); }
  const localTest = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]');
  if (url.protocol !== 'https:' && !localTest) throw new TypeError('Il QR richiede un link HTTPS, salvo gli indirizzi TEST locali.');
  return url.href;
}

function positiveInteger(value, label, { min, max }) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new RangeError(`${label} non valida.`);
  return number;
}

export function renderReportQrSvg(url, { size = 168, margin = 4 } = {}) {
  const destination = validatedDestination(url);
  const outputSize = positiveInteger(size, 'Dimensione', { min: 32, max: 2048 });
  const quietZone = positiveInteger(margin, 'Margine', { min: 0, max: 32 });
  const qr = qrcode(0, 'M');
  try {
    qr.addData(destination, 'Byte');
    qr.make();
  } catch (error) {
    throw new RangeError(`Il link è troppo lungo per il QR: ${error?.message ?? 'dati non codificabili'}`);
  }
  const modules = qr.getModuleCount();
  const viewSize = modules + (quietZone * 2);
  const commands = [];
  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      if (qr.isDark(row, column)) commands.push(`M${column + quietZone} ${row + quietZone}h1v1h-1z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR code del progetto" width="${outputSize}" height="${outputSize}" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges"><title>QR code del progetto</title><rect class="qr-background" width="${viewSize}" height="${viewSize}" fill="#fff"/><path class="qr-modules" d="${commands.join('')}" fill="#122d1d"/></svg>`;
}
