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
    if (!delta) return;
    event.preventDefault?.();
    map.setBearing?.(map.getBearing() + delta);
  };

  container.addEventListener('wheel', onWheel, { passive:false, capture:true });

  return () => {
    container.removeEventListener('wheel', onWheel, true);
  };
}
