/* PETRO OMS shared admin mobile navigation. No order data changed. */
(()=>{'use strict';
const main=document.getElementById('main'),sidebar=document.getElementById('sidebar');
if(!main||!sidebar)return;
const locationName=document.body.dataset.petroPage||document.title.replace('PETRO OMS','').replace(/[|—-]/g,' ').trim()||'Admin';
const toolbar=document.createElement('div');toolbar.className='petro-admin-toolbar';
toolbar.innerHTML='<div class="title-area"><button type="button" class="petro-nav-toggle" id="petroMenuToggle" aria-label="Open navigation" aria-expanded="false"><i class="fa-solid fa-bars"></i></button><strong></strong></div><button type="button" class="petro-role-switch" id="petroChangeRole"><i class="fa-solid fa-arrow-right-arrow-left"></i> Change Role</button>';
toolbar.querySelector('strong').textContent=locationName;
main.insertBefore(toolbar,main.firstChild);
const scrim=document.createElement('div');scrim.className='petro-admin-scrim';document.body.appendChild(scrim);
const menuBtn=toolbar.querySelector('#petroMenuToggle');
const close=()=>{document.body.classList.remove('petro-sidebar-open');menuBtn.setAttribute('aria-expanded','false');};
menuBtn.addEventListener('click',()=>{const opened=document.body.classList.toggle('petro-sidebar-open');menuBtn.setAttribute('aria-expanded',String(opened));});
scrim.addEventListener('click',close);document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
window.addEventListener('resize',()=>{if(innerWidth>768)close();});
toolbar.querySelector('#petroChangeRole').addEventListener('click',async()=>{
 if(!confirm('Switch role? You will need to sign in again.'))return;
 try{if(window.firebase?.auth && firebase.apps?.length && firebase.auth().currentUser)await firebase.auth().signOut();}catch(e){console.warn('Admin sign out',e);}
 ['adminUid','adminEmail','adminName','adminRole','adminRawRole','adminStatus','adminDocId','loggedAdmin','user_email','firebaseAuthLogin','erp_role','user_role','user_name','salesman','loggedSalesman','prefix','salesmanPrefix','loginTime','sessionExpiresAt'].forEach(k=>localStorage.removeItem(k));
 location.href='/index.html';
});
})();
