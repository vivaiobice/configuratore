export const CADASTRAL_DWELL_MS = 3000;

export function createCadastralDwellIdentifier({
  delayMs = CADASTRAL_DWELL_MS,
  identify,
  onState = () => {},
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout
} = {}) {
  if (typeof identify !== 'function') throw new TypeError('A cadastral identify function is required');
  let enabled = false;
  let timer = null;
  let requestController = null;
  let generation = 0;

  function clearPending() {
    generation += 1;
    if (timer !== null) clearTimeoutImpl(timer);
    timer = null;
    requestController?.abort?.();
    requestController = null;
  }

  function setEnabled(next) {
    const active = Boolean(next);
    clearPending();
    enabled = active;
    onState(active ? { status:'idle' } : { status:'hidden' });
  }

  function cancel() {
    clearPending();
    if (enabled) onState({ status:'idle' });
  }

  function pointerMoved(point) {
    if (!enabled || !point) return;
    clearPending();
    const scheduledGeneration = generation;
    const target = { x:Number(point.x), y:Number(point.y) };
    onState({ status:'waiting' });
    timer = setTimeoutImpl(async () => {
      const completedTimer = timer;
      timer = null;
      if (completedTimer !== null) clearTimeoutImpl(completedTimer);
      if (!enabled || scheduledGeneration !== generation) return;
      requestController = typeof AbortController === 'function' ? new AbortController() : null;
      onState({ status:'loading' });
      try {
        const result = await identify(target, requestController?.signal);
        if (!enabled || scheduledGeneration !== generation) return;
        if (result?.sheet && result?.parcel) onState({ status:'found', sheet:String(result.sheet), parcel:String(result.parcel) });
        else onState({ status:'empty' });
      } catch (error) {
        if (!enabled || scheduledGeneration !== generation || error?.name === 'AbortError') return;
        onState({ status:'error' });
      } finally {
        if (scheduledGeneration === generation) requestController = null;
      }
    }, Math.max(0, Number(delayMs) || CADASTRAL_DWELL_MS));
  }

  function destroy() {
    clearPending();
    enabled = false;
  }

  return { setEnabled, pointerMoved, cancel, destroy };
}
