export function requireSecureConnection(isSecureContext) {
  if (isSecureContext === false) {
    throw new Error('Per salvare online apri https://progettaimpianto.vivaiobice.com: la connessione attuale non è sicura. La bozza resta su questo dispositivo.');
  }
}
