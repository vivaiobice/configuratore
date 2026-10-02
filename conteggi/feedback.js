export function createCountsFeedback({storage=globalThis.localStorage,navigator=globalThis.navigator,AudioContext=globalThis.AudioContext??globalThis.webkitAudioContext}={}){
 const key='vivai-obice:counts:feedback';let preferences={sound:false,haptic:true},audio;
 try{preferences={...preferences,...JSON.parse(storage?.getItem(key)||'{}')};}catch{}
 // Resume during the gesture; emit the pulse only after the local transaction commits.
 function prepare(){if(preferences.sound&&AudioContext)try{audio??=new AudioContext();void audio.resume().catch(()=>{});}catch{}}
 return {
  capabilities:{sound:Boolean(AudioContext),haptic:typeof navigator?.vibrate==='function'},
  getPreferences:()=>({...preferences}),
  setPreferences(value){preferences={...preferences,...value};try{storage?.setItem(key,JSON.stringify(preferences));}catch{}},
  prepare,
  pulse(action='increment'){
   if(preferences.haptic&&typeof navigator?.vibrate==='function')try{navigator.vibrate(action==='decrement'?[8,30,8]:15);}catch{}
   if(preferences.sound&&AudioContext)try{
    audio??=new AudioContext();void audio.resume().then(()=>{
     const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.frequency.value=action==='decrement'?460:760;
     gain.gain.setValueAtTime(.04,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.045);
     oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+.05);
    }).catch(()=>{});
   }catch{}
  }
 };
}
