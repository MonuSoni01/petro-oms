/* PETRO OMS V4: signed-in salesman defaults + previous party autocomplete. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
function setSalesman(){const n=localStorage.getItem('user_role')==='sales'?(localStorage.getItem('loggedSalesman')||localStorage.getItem('salesman')||''):'';const select=$('salesman');if(!select||!n||![...select.options].some(o=>o.value===n))return;if(!select.value){select.value=n;select.dispatchEvent(new Event('change',{bubbles:true}));}}
const customers=new Map();
function field(d,...keys){for(const key of keys){const v=key.split('.').reduce((a,k)=>a?.[k],d);if(v!==undefined&&v!==null&&String(v).trim())return String(v).trim();}return '';}
// Remember only the party whose fields we actually auto-filled.
let lastAutofilledParty = '';
const customerDetailIds = ['partyMobile','partyCity','partyType','partyGST'];
function dispatchChange(node){node.dispatchEvent(new Event('change',{bubbles:true}));}
function clearCustomerDetails(){
  customerDetailIds.forEach(id=>{const node=$(id);if(node)node.value='';});
  const type=$('partyType');if(type)dispatchChange(type); // Existing distributor mapping handles Primary/Secondary reset.
  const distributor=$('distributor');if(distributor)distributor.value='';
  lastAutofilledParty='';
}
function updateClearButton(){const btn=$('clearPartyBtn');if(btn)btn.hidden=!($('partyName')?.value.trim());}
function fillExisting(){
  const input=$('partyName');if(!input)return;
  const key=input.value.trim().toLowerCase();
  const c=customers.get(key);if(!c)return;
  if(lastAutofilledParty && lastAutofilledParty!==key)clearCustomerDetails();
  // Blank values must also clear the old customer's detail; never mix two parties.
  [['partyMobile',c.mobile],['partyCity',c.city],['partyGST',c.gst]].forEach(([id,v])=>{const node=$(id);if(node)node.value=v||'';});
  const type=$('partyType');if(type){type.value=c.type||'';dispatchChange(type);}
  const distributor=$('distributor');if(distributor&&c.distributor){
    // The dropdown is rebuilt by the existing app; select only a valid mapped option.
    if([...distributor.options].some(o=>o.value===c.distributor))distributor.value=c.distributor;
  }
  lastAutofilledParty=key;
  const hint=$('partyLookupHint');if(hint)hint.textContent='Previous customer details loaded. Please verify mobile and city.';
  updateClearButton();
}
function onPartyNameInput(){
  const input=$('partyName');if(!input)return;
  const key=input.value.trim().toLowerCase();
  // A correction, deletion, or a new party must not retain the previously selected party's data.
  if(lastAutofilledParty && key!==lastAutofilledParty)clearCustomerDetails();
  if(key && customers.has(key) && key!==lastAutofilledParty)fillExisting();
  else if(!key){const hint=$('partyLookupHint');if(hint)hint.textContent='Enter a new customer or select a previous one.';}
  updateClearButton();
}
function clearPartySelection(){
  const input=$('partyName');if(input){input.value='';clearCustomerDetails();updateClearButton();input.focus();}
  const hint=$('partyLookupHint');if(hint)hint.textContent='Previous customer cleared. Enter a new party name.';
}
async function loadCustomers(){if(typeof firebase==='undefined'||!firebase.firestore)return;try{const db=firebase.firestore();const prefix=localStorage.getItem('salesmanPrefix')||localStorage.getItem('prefix')||'';const who=localStorage.getItem('loggedSalesman')||localStorage.getItem('salesman')||'';const s=await db.collection('orders').orderBy('orderDate','desc').limit(1000).get();s.forEach(doc=>{const d=doc.data()||{};const orderNo=field(d,'orderNo');const recordOwner=field(d,'salesman');if(localStorage.getItem('user_role')==='sales'&&!(recordOwner===who||(prefix&&new RegExp('^'+prefix+'[-/]','i').test(orderNo))))return;const name=field(d,'partyName','party.name','partyDetails.partyName','customerName');if(!name)return;const key=name.toLowerCase();if(!customers.has(key))customers.set(key,{name,mobile:field(d,'partyMobile','party.mobile','partyDetails.partyMobile','mobile'),city:field(d,'partyCity','party.city','partyDetails.partyCity','city'),type:field(d,'partyType','party.type','orderType'),gst:field(d,'partyGST','party.gst','partyDetails.partyGST','gst'),distributor:field(d,'distributor','party.distributor')});});$('knownPartySuggestions').innerHTML='';const fragment=document.createDocumentFragment();for(const c of customers.values()){const option=document.createElement('option');option.value=c.name;fragment.append(option);}$('knownPartySuggestions').append(fragment);$('partyLookupHint').textContent=customers.size?customers.size+' previous customers available. Select a name to auto-fill.':'Enter a new customer name, or continue typing.';}catch(err){console.warn('Customer history lookup unavailable',err);$('partyLookupHint').textContent='You can enter a new party manually.';}}
function boot(){setSalesman();setTimeout(setSalesman,400);setTimeout(setSalesman,1500);$('partyName')?.addEventListener('change',onPartyNameInput);$('partyName')?.addEventListener('input',onPartyNameInput);$('clearPartyBtn')?.addEventListener('click',clearPartySelection);updateClearButton();loadCustomers();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
