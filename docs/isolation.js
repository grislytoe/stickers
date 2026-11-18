// Wait for activation before reloading, so the first navigation is actually
// controlled by the service worker and receives its COOP/COEP headers.
window.coi={
  quiet:true,
  coepCredentialless:()=>false,
  doReload:async()=>{
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller) await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
    window.location.reload();
  }
};
