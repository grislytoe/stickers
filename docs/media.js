// Mobile Safari may provide metadata without ever dispatching loadeddata for
// a paused video. Editing only needs dimensions and duration at this stage.
export function loadMetadata(video,url,timeout=15000){
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);video.removeEventListener('loadedmetadata',ready);video.removeEventListener('error',fail);};
    const ready=()=>{if(!Number.isFinite(video.duration)||video.duration<=0)return fail();cleanup();resolve({duration:video.duration,width:video.videoWidth,height:video.videoHeight});};
    const fail=()=>{cleanup();reject(new Error('Браузер не смог открыть предпросмотр.'));};
    const timer=setTimeout(fail,timeout);
    video.addEventListener('loadedmetadata',ready);video.addEventListener('error',fail);
    video.preload='metadata';video.muted=true;video.playsInline=true;video.src=url;video.load();
    if(video.readyState>=1)ready();
  });
}
