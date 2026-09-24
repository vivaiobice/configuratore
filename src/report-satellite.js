const ATTRIBUTION = 'Imagery © Esri';

const SATELLITE_STYLE = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: ATTRIBUTION
    }
  },
  layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }]
};

export class SatelliteCaptureError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'SatelliteCaptureError';
    this.code = code;
  }
}

function sizeOf(container) {
  const rectangle = container?.getBoundingClientRect?.();
  return {
    width: Number(container?.clientWidth ?? rectangle?.width ?? 0),
    height: Number(container?.clientHeight ?? rectangle?.height ?? 0)
  };
}

function waitForIdle(map, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new SatelliteCaptureError('timeout', 'La mappa satellitare non ha terminato il caricamento in tempo.')), Math.max(1, Number(timeoutMs) || 15000));
    try {
      map.once('idle', () => {
        clearTimeout(timer);
        resolve();
      });
    } catch (error) {
      clearTimeout(timer);
      reject(new SatelliteCaptureError('unavailable', 'Il motore cartografico non è disponibile.', error));
    }
  });
}

export async function captureSatelliteImage({ container, maplibregl, mapModel, timeoutMs = 15000 } = {}) {
  if (!maplibregl || typeof maplibregl.Map !== 'function' || !container || !mapModel?.valid || !Array.isArray(mapModel.captureBounds) || mapModel.captureBounds.length !== 2) {
    throw new SatelliteCaptureError('unavailable', 'La cattura satellitare non è disponibile.');
  }
  const { width, height } = sizeOf(container);
  if (!(width > 0) || !(height > 0)) throw new SatelliteCaptureError('empty', 'Lo spazio destinato alla mappa satellitare è vuoto.');

  let map;
  try {
    map = new maplibregl.Map({
      container,
      style: SATELLITE_STYLE,
      center: [0, 0],
      zoom: 1,
      interactive: false,
      attributionControl: false,
      preserveDrawingBuffer: true,
      fadeDuration: 0
    });
    map.fitBounds(mapModel.captureBounds, { padding: 0, duration: 0 });
    await waitForIdle(map, timeoutMs);
    let dataUrl;
    try {
      dataUrl = map.getCanvas().toDataURL('image/png', 0.92);
    } catch (error) {
      const isSecurityError = error?.name === 'SecurityError' || /insecure|tainted|cross-origin/i.test(String(error?.message ?? ''));
      throw new SatelliteCaptureError(isSecurityError ? 'cors' : 'unavailable', isSecurityError ? 'Le immagini satellitari non consentono la stampa da questo browser.' : 'Impossibile acquisire la mappa satellitare.', error);
    }
    if (!/^data:image\/png;base64,.+/i.test(String(dataUrl))) {
      throw new SatelliteCaptureError('empty', 'La mappa satellitare acquisita è vuota.');
    }
    return { dataUrl, attribution: ATTRIBUTION };
  } catch (error) {
    if (error instanceof SatelliteCaptureError) throw error;
    throw new SatelliteCaptureError('unavailable', 'Impossibile inizializzare la mappa satellitare.', error);
  } finally {
    try { map?.remove?.(); } catch { /* cleanup is best effort */ }
  }
}
