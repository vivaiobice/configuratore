export function mergeCloudSnapshot(state, snapshot = {}) {
  const current = state?.cloud ?? {};
  const nextCloud = { ...current };
  for (const key of ['projectId', 'publicCode', 'contactId', 'resumeToken', 'resumeUrl']) {
    if (snapshot[key] !== undefined && snapshot[key] !== null) nextCloud[key] = snapshot[key];
  }
  return { ...state, cloud: nextCloud };
}
