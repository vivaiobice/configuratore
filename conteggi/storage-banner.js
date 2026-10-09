export const NOTICE_TEXT='I conteggi e le note sincronizzati sono conservati sui sistemi Vivai Obice e consultabili dagli amministratori autorizzati, anche senza una richiesta di fornitura. Il pulsante “Trasmetti a Vivai Obice” serve a sottoporci volontariamente un riepilogo come richiesta.';

export function storageBannerView({syncEnabled=false,offlineIdentity=false,registered=false,acknowledged=false}={}){
 if(!syncEnabled)return '<p>Salvataggio su questo dispositivo. Per un guest, gli appunti restano legati alla sessione di questo browser.</p>';
 if(offlineIdentity)return '<p>Le letture sono salvate su questo dispositivo. Con connessione, le letture del tuo account vengono sincronizzate nel profilo; gli appunti guest restano locali finché non attivi la sincronizzazione.</p>';
 if(registered)return '<p>Le letture salvate vengono sincronizzate nel tuo profilo, anche senza un campo. Gli appunti sincronizzati sono consultabili dagli amministratori autorizzati Vivai Obice. La trasmissione di una richiesta richiede una tua scelta separata.</p>';
 return `<p>Gli appunti guest sono conservati sul dispositivo. ${NOTICE_TEXT}</p>`+(acknowledged?'':'<button type="button" class="guest-sync-consent" data-action="accept-notice">Attiva sincronizzazione</button>');
}
