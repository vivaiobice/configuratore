import { cadastralOverlayPolicy } from './cadastre.js?v=53.1';

export const CADASTRAL_SOURCE_ID = 'cadastre-image';
export const CADASTRAL_LAYER_ID = 'cadastre-image-layer';

export function createCadastralOverlay({
  map,
  requestForViewport,
  beforeLayerId = () => undefined,
  onState = () => {}
} = {}) {
  if (!map || typeof requestForViewport !== 'function') throw new TypeError('Map and cadastral viewport request are required');
  let visible = false;
  let opacity = 0.6;
  let styleReady = typeof map.loaded === 'function' ? Boolean(map.loaded()) : true;
  let state = { visible:false, renderable:false, loading:false, error:false, reason:'off' };

  function emit(patch) {
    state = { ...state, ...patch };
    onState({ ...state });
  }

  function setLayerVisibility(value) {
    if (map.getLayer(CADASTRAL_LAYER_ID)) map.setLayoutProperty(CADASTRAL_LAYER_ID, 'visibility', value);
  }

  function refresh() {
    const policy = cadastralOverlayPolicy({ visible, zoom:map.getZoom?.() });
    if (!policy.renderable) {
      setLayerVisibility('none');
      emit({ ...policy, loading:false, error:false });
      return policy;
    }
    if (!styleReady) {
      const waiting = { visible:true, renderable:false, reason:'loading' };
      emit({ ...waiting, loading:true, error:false });
      return waiting;
    }

    const request = requestForViewport();
    const source = map.getSource(CADASTRAL_SOURCE_ID);
    if (source?.updateImage) source.updateImage(request);
    else if (!source) map.addSource(CADASTRAL_SOURCE_ID, { type:'image', ...request });

    if (!map.getLayer(CADASTRAL_LAYER_ID)) {
      map.addLayer({
        id:CADASTRAL_LAYER_ID,
        type:'raster',
        source:CADASTRAL_SOURCE_ID,
        layout:{ visibility:'visible' },
        paint:{ 'raster-opacity':opacity, 'raster-fade-duration':0 }
      }, beforeLayerId() || undefined);
    } else setLayerVisibility('visible');

    emit({ ...policy, loading:true, error:false });
    return policy;
  }

  function setVisible(next) {
    visible = Boolean(next);
    return refresh();
  }

  function setOpacity(next) {
    const parsed = Number(next);
    opacity = Math.min(1, Math.max(0.1, Number.isFinite(parsed) ? parsed : 0.6));
    if (map.getLayer(CADASTRAL_LAYER_ID)) map.setPaintProperty?.(CADASTRAL_LAYER_ID, 'raster-opacity', opacity);
    return opacity;
  }

  function handleLoad() {
    styleReady = true;
    if (visible) refresh();
  }

  function handleSourceData(event) {
    if (!visible || event?.sourceId !== CADASTRAL_SOURCE_ID || event?.isSourceLoaded !== true) return;
    const policy = cadastralOverlayPolicy({ visible, zoom:map.getZoom?.() });
    if (policy.renderable) emit({ ...policy, loading:false, error:false });
  }

  function handleError(event) {
    if (!visible || event?.sourceId !== CADASTRAL_SOURCE_ID) return;
    emit({ visible:true, renderable:false, loading:false, error:true, reason:'error' });
  }

  function destroy() {
    visible = false;
    setLayerVisibility('none');
    map.off?.('load', handleLoad);
    map.off?.('sourcedata', handleSourceData);
    map.off?.('error', handleError);
  }

  map.on?.('load', handleLoad);
  map.on?.('sourcedata', handleSourceData);
  map.on?.('error', handleError);

  return { setVisible, setOpacity, refresh, destroy, state:() => ({ ...state }) };
}
