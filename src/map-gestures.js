export function gestureRotationDelta(currentRotation, previousRotation = 0) {
  const current = Number(currentRotation);
  const previous = Number(previousRotation);
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
  return current - previous;
}

export function wheelRotationDelta(event) {
  if (!event?.shiftKey) return 0;
  const dx = Number(event.deltaX) || 0;
  const dy = Number(event.deltaY) || 0;
  if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) < 2) return 0;
  return Math.round(dx * 0.18 * 1000) / 1000;
}

export function installTrackpadRotation(map) {
  const container = map?.getCanvasContainer?.() ?? map?.getContainer?.();
  if (!container?.addEventListener) return () => {};

  map.dragRotate?.enable?.();
  map.touchZoomRotate?.enable?.();
  map.touchZoomRotate?.enableRotation?.();

  let previousGestureRotation = 0;
  const onGestureStart = (event) => {
    previousGestureRotation = Number(event.rotation) || 0;
    event.preventDefault?.();
  };
  const onGestureChange = (event) => {
    const current = Number(event.rotation) || 0;
    const delta = gestureRotationDelta(current, previousGestureRotation);
    previousGestureRotation = current;
    if (!delta) return;
    event.preventDefault?.();
    map.setBearing?.(map.getBearing() + delta);
  };
  const onGestureEnd = (event) => {
    previousGestureRotation = 0;
    event.preventDefault?.();
  };
  const onWheel = (event) => {
    const delta = wheelRotationDelta(event);
    if (!delta) return;
    event.preventDefault?.();
    map.setBearing?.(map.getBearing() + delta);
  };

  container.addEventListener('gesturestart', onGestureStart, { passive:false, capture:true });
  container.addEventListener('gesturechange', onGestureChange, { passive:false, capture:true });
  container.addEventListener('gestureend', onGestureEnd, { passive:false, capture:true });
  container.addEventListener('wheel', onWheel, { passive:false, capture:true });

  return () => {
    container.removeEventListener('gesturestart', onGestureStart, true);
    container.removeEventListener('gesturechange', onGestureChange, true);
    container.removeEventListener('gestureend', onGestureEnd, true);
    container.removeEventListener('wheel', onWheel, true);
  };
}
