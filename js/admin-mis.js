/* PETRO Admin MIS — read-only analytics over the existing orders snapshot. */
(function () {
  'use strict';
  let currentOrders = [];
  const el = id => document.getElementById(id);
  const money = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
  const amount = v => { const n = Number(String(v ?? 0).replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
  const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateOf = o => {
    const v = o.orderDate || o.savedAt || o.createdAt;
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    const d = new Date(v); return isNaN(d) ? null : d;
  };
  const person = o => String(o.salesman || o.salesPerson || o.salesperson || o.salesPersonName || o.asmName || o.asm || o.createdByName || o.salesExecutive || '').trim() || 'Unassigned';
  const party = o => String(o.party?.name || o.partyName || o.customerName || 'Unknown').trim();
  const type = o => String(o.party?.type || o.partyType || o.orderType || '').trim().toLowerCase();
  const distributor = o => String(o.party?.distributor || o.distributorName || o.distributor || '').trim();
  const status = o => String(o.status || 'Pending').trim();
  const pending = o => /pending/i.test(status(o));
  const delivered = o => /delivered/i.test(status(o));
  // A missing bill URL is only counted as pending for orders not cancelled.
  const billPending = o => !/cancelled|canceled/i.test(status(o)) && !(
    o.billUrl || o.billURL || o.billFileUrl || o.billFileURL || o.billPdfUrl || o.bill?.url || o.billUploaded === true || o.billStatus === 'Uploaded'
  );
  function range() {
    const mode = el('misPeriod')?.value || 'all';
    if (mode === 'all') return [null,null];
    const now = new Date(), today = new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const plusDay = d => new Date(d.getFullYear(),d.getMonth(),d.getDate()+1);
    if (mode === 'today') return [today,plusDay(today)];
    if (mode === 'yesterday') return [new Date(today.getFullYear(),today.getMonth(),today.getDate()-1),today];
    if (mode === 'week') return [new Date(today.getFullYear(),today.getMonth(),today.getDate()-6),plusDay(today)];
    if (mode === 'year') return [new Date(now.getFullYear(),0,1),new Date(now.getFullYear()+1,0,1)];
    if (mode === 'custom') {
      const a=el('misFrom')?.value,b=el('misTo')?.value;
      return [a?new Date(a+'T00:00:00'):null,b?plusDay(new Date(b+'T00:00:00')):null];
    }
    if (mode === 'last') return [new Date(now.getFullYear(),now.getMonth()-1,1),new Date(now.getFullYear(),now.getMonth(),1)];
    return [new Date(now.getFullYear(),now.getMonth(),1),new Date(now.getFullYear(),now.getMonth()+1,1)];
  }
  const billClass = o => /cancelled|canceled/i.test(status(o)) ? 'cancelled' : billPending(o) ? 'pending' : 'uploaded';
  function updateCustomDates() {
    const show=el('misPeriod')?.value==='custom';
    ['misFrom','misTo'].forEach(id=>{const n=el(id);if(n)n.hidden=!show;});
  }
  function setOptions(id, values, allLabel) {
    const picker=el(id);if(!picker)return;
    const prev=picker.value;
    const valuesSorted=[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    picker.replaceChildren();
    const all=document.createElement('option');all.value='';all.textContent=allLabel;picker.append(all);
    valuesSorted.forEach(v=>{const opt=document.createElement('option');opt.value=v;opt.textContent=v;picker.append(opt);});
    if(valuesSorted.includes(prev))picker.value=prev;
  }
  const codeOf = item => String(item?.code ?? item?.itemCode ?? item?.productCode ?? '').trim();
  const itemsOf = o => Array.isArray(o.items) ? o.items : [];
  const productMaster = () => window.itemMaster || {};
  const normalized = v => String(v ?? '').trim().toLowerCase();
  function selectedProduct() {
    const raw = el('misProductCode')?.value.trim() || '';
    if (!raw) return '';
    const master = productMaster();
    if (master[raw]) return raw;
    const exact = Object.keys(master).find(code => normalized(code) === normalized(raw));
    if (exact) return exact;
    // Allow selecting datalist entry such as "101 — Nylon Sleeve".
    const prefix = raw.split(/\s+[—-]\s+/)[0].trim();
    return master[prefix] ? prefix : raw;
  }
  function matchingItems(o, code) {
    return itemsOf(o).filter(item => normalized(codeOf(item)) === normalized(code));
  }
  function itemValue(item) {
    const direct = item.amount ?? item.total ?? item.totalAmount;
    return direct != null ? amount(direct) : amount(item.qty ?? item.quantity) * amount(item.rate);
  }
  function valueOf(o, code) {
    return code ? matchingItems(o, code).reduce((sum,item) => sum + itemValue(item),0) : amount(o.grandTotal);
  }
  function updateProductHint() {
    const node=el('misProductMatch'); if(!node)return;
    const raw=el('misProductCode')?.value.trim()||'';
    if(!raw){node.textContent='';return;}
    const code=selectedProduct(), product=productMaster()[code];
    node.textContent=product ? `${code} · ${product.name} (${product.category||'Product'})` : 'Code not in product master — checking saved order item codes';
  }
  const palette=['#ff8839','#22c86b','#2588f6','#9a64f3','#10b6b7','#ff526a','#8c9eaf'];
  function summaryRows(target, values, total) {
    const node=el(target);if(!node)return;
    const entries=Object.entries(values).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
    if(!entries.length){node.innerHTML='<div class="mis-empty">No matching orders</div>';return;}
    if(node.classList.contains('mis-donut-container')){
      let cumulative=0;
      const segments=entries.map(([,v],i)=>{const from=cumulative; cumulative+=total?v/total*100:0;return `${palette[i%palette.length]} ${from}% ${cumulative}%`;});
      const legend=entries.map(([name,v],i)=>`<div class="mis-legend-row"><i class="mis-dot" style="background:${palette[i%palette.length]}"></i><span class="mis-legend-name" title="${safe(name)}">${safe(name)}</span><b>${v} (${total?(v/total*100).toFixed(1):0}%)</b></div>`).join('');
      node.innerHTML=`<div class="mis-donut" style="background:conic-gradient(${segments.join(',')})"><div class="mis-donut-center"><b>${total}</b>Total Orders</div></div><div class="mis-donut-legend">${legend}</div>`;
    } else {
      node.innerHTML=entries.map(([name,v],i)=>`<div class="mis-line"><div style="flex:1;min-width:0"><span>${safe(name)}</span><div class="mis-progress"><i style="background:${palette[i%palette.length]};width:${total?v/total*100:0}%"></i></div></div><b>${v}</b></div>`).join('');
    }
  }
  function render() {
    const [from,to] = range();
    const selected = el('misPerson')?.value || '';
    const selectedType=el('misOrderType')?.value || '';
    const selectedDistributor=el('misDistributor')?.value || '';
    const selectedStatus=el('misStatus')?.value || '';
    const selectedBill=el('misBill')?.value || '';
    const productCode = selectedProduct();
    const valid = currentOrders.filter(o=>o && o.orderNo);
    const rows = valid.filter(o=>{const d=dateOf(o);return (!selected || person(o)===selected) && (!selectedType || (type(o)||'unspecified')===selectedType) && (!selectedDistributor || distributor(o)===selectedDistributor) && (!selectedStatus || status(o)===selectedStatus) && (!selectedBill || billClass(o)===selectedBill) && (!from || (d && d>=from)) && (!to || (d && d<to)) && (!productCode || matchingItems(o,productCode).length>0);});
    const value=rows.reduce((s,o)=>s+valueOf(o,productCode),0);
    const kpis={misOrders:rows.length,misSales:money(value),misToday:rows.filter(o=>{const d=dateOf(o),n=new Date();return d&&d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()&&d.getDate()===n.getDate();}).length,misPending:rows.filter(pending).length,misDelivered:rows.filter(delivered).length,misPrimary:rows.filter(o=>type(o)==='primary').length,misSecondary:rows.filter(o=>type(o)==='secondary').length,misBillPending:rows.filter(billPending).length,misAverage:money(rows.length?value/rows.length:0)};
    Object.entries(kpis).forEach(([id,v])=>{if(el(id))el(id).textContent=v;});
    const pct = n => rows.length ? (n / rows.length * 100).toFixed(1) + '% of orders' : '0% of orders';
    ['Pending','Delivered','Primary','Secondary','BillPending'].forEach(k => {const target=el('mis'+k+'Pct');if(target)target.textContent=pct(Number(kpis['mis'+k])||0);});
    summaryRows('misBills',{'Bill Pending':rows.filter(billPending).length,'Bill Uploaded':rows.filter(o=>!billPending(o) && !/cancelled|canceled/i.test(status(o))).length,'Cancelled':rows.filter(o=>/cancelled|canceled/i.test(status(o))).length},rows.length);
    const primaryValue=rows.filter(o=>type(o)==='primary').reduce((s,o)=>s+valueOf(o,productCode),0);
    const secondaryValue=rows.filter(o=>type(o)==='secondary').reduce((s,o)=>s+valueOf(o,productCode),0);
    const valueMax=Math.max(1,primaryValue,secondaryValue);
    const valueTarget=el('misTypeValue');if(valueTarget)valueTarget.innerHTML=[['Primary',primaryValue,'#2588f6'],['Secondary',secondaryValue,'#9362ed']].map(([name,v,color])=>`<div class="mis-line"><div style="flex:1"><span>${name}</span><div class="mis-progress"><i style="background:${color};width:${v/valueMax*100}%"></i></div></div><b>${money(v)}</b></div>`).join('');
    const counts={};rows.forEach(o=>counts[status(o)]=(counts[status(o)]||0)+1);summaryRows('misStatuses',counts,rows.length);
    summaryRows('misTypes',{Primary:rows.filter(o=>type(o)==='primary').length,Secondary:rows.filter(o=>type(o)==='secondary').length,Unspecified:rows.filter(o=>!['primary','secondary'].includes(type(o))).length},rows.length);
    const aging={'0–3 days':0,'4–7 days':0,'8–15 days':0,'16+ days':0};
    rows.filter(pending).forEach(o=>{const d=dateOf(o);if(!d)return;const age=Math.max(0,Math.floor((Date.now()-d.getTime())/86400000));aging[age<=3?'0–3 days':age<=7?'4–7 days':age<=15?'8–15 days':'16+ days']++;});
    summaryRows('misAging',aging,rows.filter(pending).length);
    const byPerson=new Map(),byParty=new Map(),byDistributor=new Map(),byProduct=new Map();
    rows.forEach(o=>{
      const p=person(o), q=party(o), v=valueOf(o,productCode);
      if(!byPerson.has(p))byPerson.set(p,{orders:0,value:0,pending:0,bills:0});
      const a=byPerson.get(p);a.orders++;a.value+=v;a.pending+=+pending(o);a.bills+=+billPending(o);
      if(!byParty.has(q))byParty.set(q,{orders:0,value:0});const b=byParty.get(q);b.orders++;b.value+=v;
      const dist=distributor(o);if(dist){if(!byDistributor.has(dist))byDistributor.set(dist,{orders:0,value:0});const z=byDistributor.get(dist);z.orders++;z.value+=v;}
      itemsOf(o).filter(item=>!productCode || normalized(codeOf(item))===normalized(productCode)).forEach(item=>{const code=codeOf(item);const label=code ? `${code} · ${productMaster()[code]?.name || item.name || item.itemName || item.productName || code}` : String(item.name||item.itemName||item.productName||'').trim();if(!label)return;const qty=amount(item.qty??item.quantity);const lineValue=itemValue(item);if(!byProduct.has(label))byProduct.set(label,{qty:0,value:0});const z=byProduct.get(label);z.qty+=qty;z.value+=lineValue;});
    });
    const people=[...byPerson].sort((a,b)=>b[1].value-a[1].value).slice(0,5);
    el('misSalespeople').innerHTML=people.length?people.map(([name,a])=>`<tr><td>${safe(name)}</td><td>${a.orders}</td><td>${money(a.value)}</td></tr>`).join(''):'<tr><td colspan="3">No data</td></tr>';
    const parties=[...byParty].sort((a,b)=>b[1].value-a[1].value).slice(0,5);
    el('misParties').innerHTML=parties.length?parties.map(([name,a])=>`<tr><td>${safe(name)}</td><td>${a.orders}</td><td>${money(a.value)}</td></tr>`).join(''):'<tr><td colspan="3">No data</td></tr>';
    const renderTop=(id,map,qtyKey)=>{const target=el(id);if(!target)return;const list=[...map].sort((a,b)=>b[1].value-a[1].value).slice(0,5);target.innerHTML=list.length?list.map(([name,a])=>`<tr><td>${safe(name)}</td><td>${a[qtyKey]}</td><td>${money(a.value)}</td></tr>`).join(''):'<tr><td colspan="3">No matching data</td></tr>';};
    renderTop('misDistributors',byDistributor,'orders');renderTop('misProducts',byProduct,'qty');
    const months=[];const now=new Date();for(let i=6;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push({key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,label:d.toLocaleString('en-IN',{month:'short'}),value:0});}
    rows.forEach(o=>{const d=dateOf(o);if(!d)return;const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;const m=months.find(x=>x.key===key);if(m)m.value+=valueOf(o,productCode);});
    const max=Math.max(1,...months.map(x=>x.value));
    el('misTrend').innerHTML=months.map(m=>`<div class="mis-bar-col" title="${safe(m.label)}: ${money(m.value)}"><div class="mis-bar" style="height:${Math.max(2,m.value/max*160)}px"></div><span>${safe(m.label)}</span></div>`).join('');
  }
  window.renderPetroMIS = data => {
    currentOrders=Array.isArray(data)?data:[];
    const valid=currentOrders.filter(o=>o?.orderNo);
    setOptions('misPerson',valid.map(person),'All Salespersons');
    setOptions('misDistributor',valid.map(distributor),'All Distributors');
    setOptions('misStatus',valid.map(status),'All Statuses');
    render();
  };
  document.addEventListener('DOMContentLoaded',()=>{
    const suggestions=el('misProductSuggestions');
    if(suggestions){
      suggestions.innerHTML=Object.entries(productMaster()).map(([code,p])=>`<option value="${safe(code)}" label="${safe(p.name||'')}"></option>`).join('');
    }
    el('misProductCode')?.addEventListener('input',()=>{updateProductHint();render();});
    el('misProductClear')?.addEventListener('click',()=>{el('misProductCode').value='';updateProductHint();render();});
    el('misReset')?.addEventListener('click',()=>{
      el('misPeriod').value='all';['misPerson','misOrderType','misDistributor','misStatus','misBill'].forEach(id=>{if(el(id))el(id).value='';});el('misProductCode').value='';
      el('misFrom').value='';el('misTo').value='';
      updateCustomDates();
      updateProductHint();render();
    });
    ['misPeriod','misPerson','misOrderType','misDistributor','misStatus','misBill','misFrom','misTo'].forEach(id=>el(id)?.addEventListener('change',()=>{
      updateCustomDates();render();
    }));
    updateCustomDates();
  });
})();
