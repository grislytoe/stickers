// Wait for activation before reloading, so the first navigation is actually
// controlled by the service worker and receives its COOP/COEP headers.
window.coi={
  quiet:true,
  coepCredentialless:()=>false,
  doReload:async()=>{
    await window.stickerBoot?.pickerDone;
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller) await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
    try{await window.stickerBoot?.saveForReload();}catch{if(window.stickerBoot?.file)return;}
    window.location.reload();
  }
};
