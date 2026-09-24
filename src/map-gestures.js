export function gestureRotationDelta(currentRotation, previousRotation = 0) {
  const current = Number(currentRotation);
  const previous = Number(previousRotation);
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
  return current - previous;
}

export function wheelRotationDelta(event) {
  if (!event?.shiftKey && !event?.altKey) return 0;
  const dx = Number(event.deltaX) || 0;
  const dy = Number(event.deltaY) || 0;
  const axis = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
  if (Math.abs(axis) < 2) return 0;
  return Math.round(axis * 0.18 * 1000) / 1000;
}

export function trackpadPanDelta(event) {
  if (!event || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return null;
  if (Number(event.deltaMode) !== 0) return null;
  const dx=Number(event.deltaX)||0,dy=Number(event.deltaY)||0;
  if (Math.abs(dx)<.01&&Math.abs(dy)<.01) return null;
  return [dx,dy];
}

export function installTrackpadRotation(map, { touchRotation = false } = {}) {
  const container = map?.getCanvasContainer?.() ?? map?.getContainer?.();
  if (!container?.addEventListener) return () => {};

  // Keep native MapLibre pinch zoom on touch devices, but prevent accidental
  // bearing changes while pinching on iOS. Desktop rotation remains available
  // through Shift/Alt + trackpad wheel and MapLibre's native drag rotation.
  map.dragRotate?.disable?.();
  map.touchZoomRotate?.enable?.();
  if (touchRotation) map.touchZoomRotate?.enableRotation?.();
  else map.touchZoomRotate?.disableRotation?.();
  map.touchPitch?.disable?.();

  const onWheel = (event) => {
    const delta = wheelRotationDelta(event);
    if (delta) {
      event.preventDefault?.();
      map.setBearing?.(map.getBearing() + delta);
      return;
    }
    const pan=trackpadPanDelta(event);
    if (!pan) return;
    event.preventDefault?.();
    map.panBy?.(pan,{duration:0});
  };

  container.addEventListener('wheel', onWheel, { passive:false, capture:true });

  return () => {
    container.removeEventListener('wheel', onWheel, true);
  };
}
