function validPoint(point) {
  return Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
}

export function renderProjectDiagramSvg({ polygon, rows = [] } = {}) {
  const points = Array.isArray(polygon) ? polygon.filter(validPoint).map(([lon, lat]) => [Number(lon), Number(lat)]) : [];
  if (points.length < 4) {
    return '<svg viewBox="0 0 760 360" role="img" aria-label="Schema vigneto"><rect width="760" height="360" rx="18" fill="#f4f6f3"/><text x="380" y="185" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#68736b">Perimetro non disponibile</text></svg>';
  }

  const averageLat = points.reduce((sum, [, lat]) => sum + lat, 0) / points.length;
  const cosLat = Math.max(0.1, Math.cos(averageLat * Math.PI / 180));
  const projected = points.map(([lon, lat]) => [lon * cosLat, lat]);
  const xs = projected.map(([x]) => x);
  const ys = projected.map(([, y]) => y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const width = 760; const height = 360; const padding = 34;
  const spanX = Math.max(maxX - minX, 1e-9); const spanY = Math.max(maxY - minY, 1e-9);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const contentW = spanX * scale; const contentH = spanY * scale;
  const offsetX = (width - contentW) / 2;
  const offsetY = (height - contentH) / 2;

  const project = ([lon, lat]) => {
    const x = ((lon * cosLat) - minX) * scale + offsetX;
    const y = height - (((lat - minY) * scale) + offsetY);
    return [x, y];
  };
  const path = points.map((point, index) => {
    const [x, y] = project(point);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ') + ' Z';

  const rowLines = (rows ?? []).filter((row) => validPoint(row?.start) && validPoint(row?.end)).map((row) => {
    const [x1, y1] = project(row.start); const [x2, y2] = project(row.end);
    return `<line class="vine-row" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"/>`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Schema del progetto vigneto" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="18" fill="#eef2ed"/><path class="parcel" d="${path}" fill="#dce8d7" stroke="#183f28" stroke-width="3"/>${rowLines}<g class="north" font-family="Arial,sans-serif" fill="#183f28"><path d="M712 52 L724 82 L712 75 L700 82 Z"/><text x="712" y="44" text-anchor="middle" font-weight="700" font-size="16">N</text></g><style>.vine-row{stroke:#8b7d45;stroke-width:1.35;opacity:.92}</style></svg>`;
}
