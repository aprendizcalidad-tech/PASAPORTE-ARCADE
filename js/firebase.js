import {firebaseConfig} from '../firebase-config.js';
let promise;
export function connect() {
  if (Object.values(firebaseConfig).some(v=>String(v).includes('REEMPLAZAR'))) throw new Error('Falta configurar Firebase. Revisa firebase-config.js y la guía de instalación.');
  if (!promise) promise = Promise.all([
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')
  ]).then(([core,auth,store])=>{
    const app=core.initializeApp(firebaseConfig);
    return {auth:auth.getAuth(app), db:store.getFirestore(app), authApi:auth, storeApi:store};
  }).catch(error=>{promise=null;throw error;});
  return promise;
}
