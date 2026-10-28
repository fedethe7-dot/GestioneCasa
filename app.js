'use strict';
/* =========================================================
   Gestione Casa — versione 1
   Per ora i dati restano su questo telefono (localStorage).
   Nel prossimo passo: foglio Google + accesso con Google.
   ========================================================= */

const APP_VERSION = '1.3.0';
const LS_KEY = 'gestioneCasa.v1';
const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const MESI_B = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const COLORI = ['#5b7cfa','#f06595','#2fcf7f','#ffb547','#22b8cf','#a77bff','#ff8a5b'];

/* ===== Collegamento al foglio Google (da compilare) ===== */
const CONFIG = {
  CLIENT_ID: '378542112694-491mbbu198klomqsr9gu67m759t0i485.apps.googleusercontent.com',   // Client ID di Google Cloud (…apps.googleusercontent.com)
  API_URL:   'https://script.google.com/macros/s/AKfycbx_UKlBm4SKEYtPWrUO9bh1MuMBBKSzJbpgFQj1j9pbW5oFF3bkJL5DevaKj1rF537-wA/exec',   // URL dell'App web di Apps Script (…/exec)
};
const ONLINE = !!(CONFIG.CLIENT_ID && CONFIG.API_URL);
const SESS_KEY = 'gestioneCasa.sessione';
const CODA_KEY = 'gestioneCasa.coda';

const CATEGORIE_BASE = [
  { id:'spesa',        name:'Spesa supermercato', emoji:'🛒' },
  { id:'luce',         name:'Luce',               emoji:'⚡', group:'bollette' },
  { id:'gas',          name:'Gas',                emoji:'🔥', group:'bollette' },
  { id:'acqua',        name:'Acqua',              emoji:'💧', group:'bollette' },
  { id:'internet',     name:'Internet',           emoji:'🌐', group:'bollette' },
  { id:'rifiuti',      name:'Rifiuti (TARI)',     emoji:'🗑️', group:'bollette' },
  { id:'manutenzione', name:'Manutenzione',       emoji:'🔧' },
  { id:'elettricista', name:'Elettricista',       emoji:'🔌' },
  { id:'idraulico',    name:'Idraulico',          emoji:'🚿' },
  { id:'giardinaggio', name:'Giardinaggio',       emoji:'🌿' },
  { id:'altro',        name:'Altro',              emoji:'📦' },
];

function statoIniziale(){
  return {
    version: 1,
    people: [
      { id:'p_fede', name:'Federico',  color:COLORI[0] },
      { id:'p_fra',  name:'Francesca', color:COLORI[1] },
      { id:'p_sis',  name:'Beatrice',  color:COLORI[2] },
    ],
    houses: [
      { id:'h_casa', name:'Casa', emoji:'🏠', members:['p_fede','p_fra','p_sis'], defaultPayer:'p_fra' },
    ],
    categories: CATEGORIE_BASE.map(c => ({ ...c, base:true })),
    expenses: [],
    transfers: [],
    settings: { me:'p_fede' },
  };
}

/* ---------- Stato ---------- */
let S;
let ui = { view:'home', houseId:null, tab:'spese', filtro:'tutte', year:null, pareggi:[] };
let ed = null;          // dati del pannello aperto
let sheetOpen = false;
let skipPop = 0;
let SESS = null, coda = [], statoSync = '', inviando = false;
const A = {}; window.A = A;

function carica(){
  try { const raw = localStorage.getItem(LS_KEY); S = raw ? JSON.parse(raw) : statoIniziale(); }
  catch(e){ S = statoIniziale(); }
  // sicurezza: campi mancanti
  const base = statoIniziale();
  for (const k of Object.keys(base)) if (S[k] == null) S[k] = base[k];
  try { SESS = JSON.parse(localStorage.getItem(SESS_KEY) || 'null'); } catch(e){ SESS = null; }
  try { coda = JSON.parse(localStorage.getItem(CODA_KEY) || '[]'); } catch(e){ coda = []; }
  if (!ONLINE) SESS = null;
  if (SESS && SESS.me) S.settings.me = SESS.me;
}
function salva(){ try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch(e){} }
function salvaSess(){ try { SESS ? localStorage.setItem(SESS_KEY, JSON.stringify(SESS)) : localStorage.removeItem(SESS_KEY); } catch(e){} }
function salvaCoda(){ try { localStorage.setItem(CODA_KEY, JSON.stringify(coda)); } catch(e){} }
const puoModificare = () => !ONLINE || !!(SESS && SESS.admin);
const impostazioniAttuali = () => ({ people:S.people, houses:S.houses, categories:S.categories });
function salvaImp(){ salva(); invia('saveSettings', { settings:impostazioniAttuali() }); }

/* ---------- Utilità ---------- */
const $ = (s, el=document) => el.querySelector(s);
const uid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const somma = arr => arr.reduce((s,e) => s + (e.amount||0), 0);
function oggi(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function dataBreve(iso){ const [, m, d] = iso.split('-'); return Number(d)+' '+MESI_B[Number(m)-1].toLowerCase(); }
function euro(c){ return (c<0?'-':'')+'€ '+(Math.abs(c)/100).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function euroTondo(c){ return '€ '+Math.round(c/100).toLocaleString('it-IT'); }
function parseEuro(s){
  s = String(s ?? '').trim().replace(/[\s€]/g,'');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g,'').replace(',','.');
  const n = Number(s);
  return isFinite(n) ? Math.round(n*100) : NaN;
}
const centsToInput = c => (c/100).toFixed(2).replace('.',',');
const persona = id => S.people.find(p => p.id===id) || { id, name:'?', color:'#888' };
const casa = id => S.houses.find(h => h.id===id);
const cat = id => S.categories.find(c => c.id===id) || { name:'Spesa', emoji:'💸' };
const isBolletta = e => cat(e.cat).group === 'bollette';
function avatar(id){ const p = persona(id); return `<span class="av" style="background:${esc(p.color)}">${esc((p.name||'?')[0].toUpperCase())}</span>`; }

function dividiUguale(tot, ids){
  const out = {}; const n = ids.length; if (!n) return out;
  const base = Math.floor(tot/n); let resto = tot - base*n;
  ids.forEach(id => { out[id] = base + (resto>0 ? 1 : 0); if (resto>0) resto--; });
  return out;
}

/* ---------- Calcoli: saldi e pareggio (come Tricount) ---------- */
function saldi(hid){
  const h = casa(hid); const b = {};
  h.members.forEach(id => b[id] = 0);
  S.expenses.filter(e => e.houseId===hid).forEach(e => {
    b[e.payer] = (b[e.payer]||0) + e.amount;
    for (const k in e.shares) b[k] = (b[k]||0) - e.shares[k];
  });
  S.transfers.filter(t => t.houseId===hid).forEach(t => {
    b[t.from] = (b[t.from]||0) + t.amount;
    b[t.to]   = (b[t.to]||0)   - t.amount;
  });
  return b;
}
function pareggia(b){
  const cr=[], de=[];
  for (const id in b){ if (b[id]>0) cr.push({id, v:b[id]}); else if (b[id]<0) de.push({id, v:-b[id]}); }
  cr.sort((x,y)=>y.v-x.v); de.sort((x,y)=>y.v-x.v);
  const out=[]; let i=0, j=0;
  while (i<de.length && j<cr.length){
    const x = Math.min(de[i].v, cr[j].v);
    if (x>0) out.push({ from:de[i].id, to:cr[j].id, amount:x });
    de[i].v -= x; cr[j].v -= x;
    if (de[i].v===0) i++;
    if (cr[j].v===0) j++;
  }
  return out;
}

/* ---------- Disegno delle schermate ---------- */
function render(){
  const app = $('#app');
  if (ONLINE && !SESS){ app.innerHTML = vLogin(); mostraBottoneGoogle(); return; }
  if (ui.view==='house' && casa(ui.houseId)) app.innerHTML = vCasa();
  else if (ui.view==='settings') app.innerHTML = vImpostazioni();
  else { ui.view='home'; app.innerHTML = vHome(); }
}
function vai(view, extra){
  Object.assign(ui, { view }, extra||{});
  try { history.pushState({ v:view }, ''); } catch(e){}
  render(); window.scrollTo(0,0);
}

function header(titolo, destra='', indietro=false){
  return `<header class="top">${indietro ? `<button class="icon-btn" onclick="A.indietro()" aria-label="Indietro">‹</button>` : '<a class="icon-btn" href="../Casa/" aria-label="Le mie app" title="Le mie app" style="display:grid;place-items:center"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="2.5" fill="#34a373"/><rect x="13" y="3" width="8" height="8" rx="2.5" fill="#e0962f"/><rect x="3" y="13" width="8" height="8" rx="2.5" fill="#9b72ff"/><rect x="13" y="13" width="8" height="8" rx="2.5" fill="#8fa6ff"/></svg></a>'}<h1>${esc(titolo)}</h1>${ONLINE ? `<button class="sync" id="sync" onclick="A.sincronizza()" aria-label="Sincronizza">${testoStato()}</button>` : ''}${destra}</header>`;
}
function banner(){
  if (ONLINE) return '';
  return `<div class="banner">📱 Versione di prova: i dati restano solo su questo telefono. Il collegamento al foglio Google arriva nel prossimo passo.</div>`;
}

/* Home: le finestrelle delle case */
function vHome(){
  const mese = oggi().slice(0,7);
  const cards = S.houses.map(h => {
    const tm = somma(S.expenses.filter(e => e.houseId===h.id && e.date.startsWith(mese)));
    const b = saldi(h.id)[S.settings.me] || 0;
    const st = !h.members.includes(S.settings.me) ? ''
      : b>0 ? `<span class="pos">ti devono ${euro(b)}</span>`
      : b<0 ? `<span class="neg">devi ${euro(-b)}</span>`
      : `<span class="mut">sei in pari ✓</span>`;
    return `<button class="card house" onclick="A.apriCasa('${h.id}')">
      <div class="house-top"><span class="big-emoji">${esc(h.emoji)}</span><div class="avs">${h.members.map(id=>avatar(id)).join('')}</div></div>
      <div class="house-name">${esc(h.name)}</div>
      <div class="house-sub">${MESI[Number(mese.slice(5))-1]}: <b>${euro(tm)}</b></div>
      <div class="house-bal">${st}</div>
    </button>`;
  }).join('');
  const vuoto = (!ONLINE && !S.expenses.length && !S.transfers.length)
    ? `<div class="card hint"><p>👋 Ciao! Tocca la casa e aggiungi la prima spesa.</p><button class="btn ghost full" onclick="A.caricaEsempio()">🧪 Prova con dati di esempio</button></div>` : '';
  return header('Gestione Casa', `<button class="icon-btn" onclick="A.apriImpostazioni()" aria-label="Impostazioni">⚙️</button>`)
    + `<main class="wrap">${banner()}${vuoto}<div class="grid">${cards}
      ${puoModificare() ? `<button class="card house add" onclick="A.modificaCasa()"><span class="big-emoji">➕</span><div class="house-sub">Nuova casa</div></button>` : ''}</div></main>`;
}

/* Dentro una casa */
function vCasa(){
  const h = casa(ui.houseId);
  const corpo = ui.tab==='spese' ? tSpese(h) : ui.tab==='saldi' ? tSaldi(h) : tInsight(h);
  const tab = (k,e,l) => `<button class="${ui.tab===k?'on':''}" onclick="A.tab('${k}')"><span>${e}</span>${l}</button>`;
  return header(h.emoji+' '+h.name, '', true)
    + `<main class="wrap pb">${corpo}</main>
       <button class="fab" onclick="A.nuovaSpesa()" aria-label="Nuova spesa">＋</button>
       <nav class="tabs">${tab('spese','📋','Spese')}${tab('saldi','⚖️','Saldi')}${tab('insight','📊','Insight')}</nav>`;
}

function filtroOk(e){
  switch (ui.filtro){
    case 'spesa': return e.cat==='spesa';
    case 'bollette': return isBolletta(e);
    case 'altre': return e.cat!=='spesa' && !isBolletta(e);
    default: return true;
  }
}

function tSpese(h){
  const mese = oggi().slice(0,7);
  const em = S.expenses.filter(e => e.houseId===h.id && e.date.startsWith(mese));
  const quick = `<div class="quick">
    <button onclick="A.nuovaSpesa('spesa')"><span>🛒</span>Spesa</button>
    <button onclick="A.nuovaSpesa('bollette')"><span>💡</span>Bolletta</button>
    <button onclick="A.nuovaSpesa()"><span>➕</span>Altro</button></div>`;
  const riepilogo = `<div class="card summary"><div class="mut small">Questo mese · ${MESI[Number(mese.slice(5))-1]}</div>
    <div class="big">${euro(somma(em))}</div>
    <div class="chips-inline"><span>🛒 ${euro(somma(em.filter(e=>e.cat==='spesa')))}</span><span>💡 ${euro(somma(em.filter(isBolletta)))}</span><span>🔧 ${euro(somma(em.filter(e=>e.cat!=='spesa'&&!isBolletta(e))))}</span></div></div>`;
  const filtri = [['tutte','Tutte'],['spesa','🛒 Spesa'],['bollette','💡 Bollette'],['altre','🔧 Altre'],['rimborsi','↔️ Rimborsi']]
    .map(([k,l]) => `<button class="chip ${ui.filtro===k?'on':''}" onclick="A.filtro('${k}')">${l}</button>`).join('');

  let items = [];
  if (ui.filtro!=='rimborsi')
    items = S.expenses.filter(e => e.houseId===h.id && filtroOk(e)).map(e => ({ t:'e', d:e.date, c:e.createdAt||0, o:e }));
  if (ui.filtro==='tutte' || ui.filtro==='rimborsi')
    items = items.concat(S.transfers.filter(t => t.houseId===h.id).map(t => ({ t:'t', d:t.date, c:t.createdAt||0, o:t })));
  items.sort((a,b) => a.d<b.d ? 1 : a.d>b.d ? -1 : b.c-a.c);

  let html = '', cur = '';
  items.forEach(it => {
    const m = it.d.slice(0,7);
    if (m!==cur){
      cur = m;
      const mt = somma(items.filter(x => x.t==='e' && x.d.startsWith(m)).map(x => x.o));
      html += `<div class="month"><span>${MESI[Number(m.slice(5))-1]} ${m.slice(0,4)}</span><span>${mt?euro(mt):''}</span></div>`;
    }
    html += it.t==='e' ? rigaSpesa(it.o) : rigaRimborso(it.o);
  });
  if (!items.length) html = `<div class="empty">Ancora niente qui.<br>Usa i pulsanti sopra per aggiungere una spesa.</div>`;
  return quick + riepilogo + `<div class="chips">${filtri}</div><div class="list">${html}</div>`;
}

function etichettaDivisione(e){
  const ids = Object.keys(e.shares).filter(k => e.shares[k]>0);
  const h = casa(e.houseId);
  if (ids.length===1 && ids[0]===e.payer) return 'solo '+persona(e.payer).name;
  if (ids.length===1) return 'per '+persona(ids[0]).name;
  if (h && ids.length===h.members.length) return 'diviso tra tutti';
  return 'diviso tra '+ids.map(i => persona(i).name).join(', ');
}
function rigaSpesa(e){
  const c = cat(e.cat);
  return `<button class="row" onclick="A.modificaSpesa('${e.id}')"><span class="ico">${esc(c.emoji)}</span>
    <span class="mid"><b>${esc(e.desc || c.name)}</b><small>${dataBreve(e.date)} · ${esc(persona(e.payer).name)} · ${esc(etichettaDivisione(e))}</small></span>
    <span class="amt">${euro(e.amount)}</span></button>`;
}
function rigaRimborso(t){
  return `<button class="row rimb" onclick="A.eliminaRimborso('${t.id}')"><span class="ico">↔️</span>
    <span class="mid"><b>Rimborso</b><small>${dataBreve(t.date)} · ${esc(persona(t.from).name)} → ${esc(persona(t.to).name)}</small></span>
    <span class="amt">${euro(t.amount)}</span></button>`;
}

/* Saldi: chi deve a chi */
function tSaldi(h){
  const b = saldi(h.id);
  const righe = h.members.map(id => {
    const v = b[id] || 0;
    const s = v>0 ? `<span class="pos">deve ricevere</span>` : v<0 ? `<span class="neg">deve dare</span>` : `<span class="mut">in pari ✓</span>`;
    return `<div class="row">${avatar(id)}<span class="mid"><b>${esc(persona(id).name)}${id===S.settings.me?' <span class="tag">tu</span>':''}</b><small>${s}</small></span>
      <span class="amt ${v>0?'pos':v<0?'neg':''}">${v?euro(Math.abs(v)):''}</span></div>`;
  }).join('');
  ui.pareggi = pareggia(b);
  const passi = ui.pareggi.length
    ? ui.pareggi.map((t,i) => `<div class="card settle"><div class="settle-line">${avatar(t.from)}<span><b>${esc(persona(t.from).name)}</b> dà <b>${euro(t.amount)}</b> a <b>${esc(persona(t.to).name)}</b></span>${avatar(t.to)}</div>
        <button class="btn small" onclick="A.segnaRimborsato(${i})">✓ Segna come rimborsato</button></div>`).join('')
    : `<div class="card ok-card">🎉 Siete tutti in pari!</div>`;
  return `<h2>Saldi</h2><div class="list">${righe}</div>
    <h2>Come pareggiare</h2>${passi}
    <button class="btn ghost full" onclick="A.nuovoRimborso()">↔️ Registra un rimborso</button>
    <p class="note">I saldi si aggiornano subito a ogni spesa. Le spese "solo …" restano a chi le ha pagate e non creano debiti.</p>`;
}

/* Insight */
function tInsight(h){
  const exps = S.expenses.filter(e => e.houseId===h.id);
  const annoOggi = new Date().getFullYear();
  const anni = [...new Set(exps.map(e => Number(e.date.slice(0,4))).concat([annoOggi]))].sort();
  let y = ui.year;
  if (!y || !anni.includes(y)) y = exps.some(e => e.date.startsWith(annoOggi+'')) || !exps.length ? annoOggi : Math.max(...exps.map(e => Number(e.date.slice(0,4))));
  ui.year = y;
  const chipsAnni = anni.map(a => `<button class="chip ${a===y?'on':''}" onclick="A.anno(${a})">${a}</button>`).join('');
  const ey = exps.filter(e => e.date.startsWith(y+''));
  if (!ey.length) return `<div class="chips">${chipsAnni}</div><div class="empty">Nessuna spesa nel ${y}.</div>`;

  const tot = somma(ey);
  const mesi = Array.from({length:12}, () => ({ spesa:0, boll:0, altro:0 }));
  ey.forEach(e => { const m = mesi[Number(e.date.slice(5,7))-1]; if (e.cat==='spesa') m.spesa+=e.amount; else if (isBolletta(e)) m.boll+=e.amount; else m.altro+=e.amount; });
  const totM = mesi.map(m => m.spesa+m.boll+m.altro);
  const conDati = totM.map((v,i) => v>0 ? i : -1).filter(i => i>=0);
  const inizio = conDati[0];
  let fine = y<annoOggi ? 11 : y===annoOggi ? new Date().getMonth() : conDati[conDati.length-1];
  fine = Math.max(fine, conDati[conDati.length-1]);
  const nMesi = fine - inizio + 1;
  const spesaTot = somma(ey.filter(e => e.cat==='spesa'));
  const bollTot = somma(ey.filter(isBolletta));

  // confronto con lo stesso periodo dell'anno prima
  const prima = somma(exps.filter(e => e.date.startsWith((y-1)+'') && Number(e.date.slice(5,7))-1 >= inizio && Number(e.date.slice(5,7))-1 <= fine));
  const confronto = prima ? (() => { const d = Math.round((tot-prima)/prima*100); return `<em class="${d>0?'neg':'pos'}">${d>0?'▲ +':'▼ '}${d}% sul ${y-1}</em>`; })() : '';

  const kpi = `<div class="kpis">
    <div class="kpi"><small>Totale ${y}</small><b>${euroTondo(tot)}</b>${confronto}</div>
    <div class="kpi"><small>Media al mese</small><b>${euroTondo(tot/nMesi)}</b></div>
    <div class="kpi"><small>🛒 Spesa al mese</small><b>${euroTondo(spesaTot/nMesi)}</b></div>
    <div class="kpi"><small>💡 Bollette nell'anno</small><b>${euroTondo(bollTot)}</b></div></div>`;

  const max = Math.max(...totM, 1);
  const pct = v => (v/max*100).toFixed(1)+'%';
  const barre = mesi.map((m,i) => `<div class="bar-col"><span class="bar-val">${totM[i]?Math.round(totM[i]/100):''}</span>
      <div class="bar-wrap"><i class="seg-altro" style="height:${pct(m.altro)}"></i><i class="seg-boll" style="height:${pct(m.boll)}"></i><i class="seg-spesa" style="height:${pct(m.spesa)}"></i></div>
      <span class="bar-lab">${MESI_B[i][0]}</span></div>`).join('');
  const grafico = `<div class="card"><div class="chart">${barre}</div>
    <div class="legend"><span><i class="seg-spesa"></i>Spesa</span><span><i class="seg-boll"></i>Bollette</span><span><i class="seg-altro"></i>Altro</span></div></div>`;

  const perCat = {};
  ey.forEach(e => perCat[e.cat] = (perCat[e.cat]||0) + e.amount);
  const righeCat = Object.entries(perCat).sort((a,b) => b[1]-a[1]).map(([id,v]) => {
    const c = cat(id); const p = Math.round(v/tot*100);
    return `<div class="hrow"><span class="ico">${esc(c.emoji)}</span><div class="hmid"><div class="hline"><span>${esc(c.name)}</span><b>${euro(v)}</b></div><div class="hbar"><i style="width:${Math.max(p,1)}%"></i></div></div><span class="pc">${p}%</span></div>`;
  }).join('');

  const righeBoll = S.categories.filter(c => c.group==='bollette').map(c => {
    const l = ey.filter(e => e.cat===c.id).sort((a,b) => a.date<b.date ? 1 : -1);
    if (!l.length) return '';
    const t = somma(l);
    return `<div class="row"><span class="ico">${esc(c.emoji)}</span><span class="mid"><b>${esc(c.name)}</b>
      <small>${l.length} bollett${l.length===1?'a':'e'} · media ${euro(Math.round(t/l.length))} · ultima ${euro(l[0].amount)}</small></span><span class="amt">${euro(t)}</span></div>`;
  }).join('');

  const pagato = {}; h.members.forEach(id => pagato[id]=0);
  ey.forEach(e => pagato[e.payer] = (pagato[e.payer]||0) + e.amount);
  const righePag = Object.entries(pagato).sort((a,b) => b[1]-a[1]).map(([id,v]) => {
    const p = Math.round(v/tot*100);
    return `<div class="hrow">${avatar(id)}<div class="hmid"><div class="hline"><span>${esc(persona(id).name)}</span><b>${euro(v)}</b></div><div class="hbar"><i style="width:${Math.max(p,1)}%"></i></div></div><span class="pc">${p}%</span></div>`;
  }).join('');

  return `<div class="chips">${chipsAnni}</div>${kpi}
    <h2>Mese per mese</h2>${grafico}
    <h2>Per categoria</h2><div class="card">${righeCat}</div>
    ${righeBoll ? `<h2>Bollette</h2><div class="list">${righeBoll}</div>` : ''}
    <h2>Chi ha pagato</h2><div class="card">${righePag}</div>`;
}

/* Impostazioni */
function vImpostazioni(){
  const account = ONLINE && SESS ? `<h2>Account</h2>
    <div class="row">${avatar(SESS.me)}<span class="mid"><b>${esc(persona(SESS.me).name)}${SESS.admin?' <span class="tag">admin</span>':''}</b><small>${esc(SESS.email)}</small></span></div>
    ${SESS.admin && SESS.sheetUrl ? `<a class="btn ghost full" href="${esc(SESS.sheetUrl)}" target="_blank" rel="noopener">📄 Apri il foglio Google</a>` : ''}
    <button class="btn ghost danger full" onclick="A.esci()">🚪 Esci</button>` : '';
  if (ONLINE && !puoModificare())
    return header('Impostazioni', '', true) + `<main class="wrap">${account}<p class="note">Persone, case e categorie le gestisce l'amministratore.</p><p class="note center">Gestione Casa v${APP_VERSION}</p></main>`;
  const persone = S.people.map(p => `<div class="row">${avatar(p.id)}
      <input class="inline" value="${esc(p.name)}" onchange="A.rinominaPersona('${p.id}',this.value)">
      <button class="icon-btn sm" onclick="A.coloreP('${p.id}')" aria-label="Cambia colore">🎨</button>
      <button class="icon-btn sm" onclick="A.eliminaPersona('${p.id}')" aria-label="Elimina">🗑️</button></div>`).join('');
  const case_ = S.houses.map(h => `<button class="row" onclick="A.modificaCasa('${h.id}')"><span class="ico">${esc(h.emoji)}</span>
      <span class="mid"><b>${esc(h.name)}</b><small>${esc(h.members.map(id=>persona(id).name).join(', '))} · di solito paga ${esc(persona(h.defaultPayer).name)}</small></span><span class="chev">›</span></button>`).join('');
  const cats = S.categories.map(c => `<div class="row"><span class="ico">${esc(c.emoji)}</span>
      <span class="mid"><b>${esc(c.name)}</b><small>${c.group?'Bolletta':'Categoria'}${c.base?'':' · aggiunta da te'}</small></span>
      ${c.base ? '' : `<button class="icon-btn sm" onclick="A.eliminaCategoria('${c.id}')" aria-label="Elimina">🗑️</button>`}</div>`).join('');
  return header('Impostazioni', '', true) + `<main class="wrap">
    ${ONLINE ? account : `<h2>Chi sono io</h2>
    <div class="chips wrapc">${S.people.map(p => `<button class="chip big ${S.settings.me===p.id?'on':''}" onclick="A.io('${p.id}')">${avatar(p.id)} ${esc(p.name)}</button>`).join('')}</div>
    <p class="note">Serve per mostrarti "ti devono / devi" sulla home. Con l'accesso Google lo capirà da solo.</p>`}
    <h2>Persone</h2><div class="list">${persone}</div>
    <button class="btn ghost full" onclick="A.aggiungiPersona()">➕ Aggiungi persona</button>
    <h2>Case</h2><div class="list">${case_}</div>
    <button class="btn ghost full" onclick="A.modificaCasa()">➕ Nuova casa</button>
    <h2>Categorie</h2><div class="list">${cats}</div>
    <div class="card addcat"><div class="lbl">Nuova categoria</div>
      <div class="two small-first"><input id="nc-emoji" placeholder="🏷️" maxlength="8"><input id="nc-name" placeholder="Nome (es. Pulizie)"></div>
      <label class="checkline"><input type="checkbox" id="nc-boll"> È una bolletta</label>
      <button class="btn full" onclick="A.aggiungiCategoria()">Aggiungi categoria</button></div>
    ${ONLINE ? '' : `<h2>Dati</h2>
    <button class="btn ghost full" onclick="A.caricaEsempio()">🧪 Carica dati di esempio</button>
    <button class="btn ghost danger full" onclick="A.cancellaTutto()">🗑️ Cancella tutti i dati</button>`}
    <p class="note center">Gestione Casa v${APP_VERSION}</p></main>`;
}

/* ---------- Pannello dal basso, conferme, avvisi ---------- */
function apriSheet(html, dopo){
  $('#sheet-body').innerHTML = html;
  $('#sheet-panel').scrollTop = 0;
  $('#sheet').classList.add('open');
  document.body.classList.add('noscroll');
  if (!sheetOpen){ sheetOpen = true; try { history.pushState({ s:1 }, ''); } catch(e){} }
  if (dopo) dopo();
}
function aggiornaSheet(html){
  const p = $('#sheet-panel'); const st = p.scrollTop;
  $('#sheet-body').innerHTML = html; p.scrollTop = st;
}
function chiudiSheet(){
  $('#sheet').classList.remove('open');
  document.body.classList.remove('noscroll');
  sheetOpen = false; ed = null;
}
A.chiudi = () => {
  if (!sheetOpen) return;
  chiudiSheet();
  skipPop++; try { history.back(); } catch(e){ skipPop--; }
};
function chiedi(testo, ok, cb, pericolo){
  const d = $('#dialog');
  d.innerHTML = `<div class="dlg"><p>${testo}</p><div class="dlg-b"><button class="btn ghost" id="d-no">Annulla</button><button class="btn ${pericolo?'danger':''}" id="d-ok">${ok}</button></div></div>`;
  d.classList.add('open');
  $('#d-no').onclick = () => d.classList.remove('open');
  $('#d-ok').onclick = () => { d.classList.remove('open'); cb(); };
}
function toast(t){
  const el = $('#toast'); el.textContent = t; el.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2000);
}

window.addEventListener('popstate', () => {
  if (skipPop){ skipPop--; return; }
  if ($('#dialog').classList.contains('open')){ $('#dialog').classList.remove('open'); return; }
  if (sheetOpen){ chiudiSheet(); return; }
  if (ui.view!=='home'){ ui.view = 'home'; render(); window.scrollTo(0,0); }
});

/* ---------- Navigazione ---------- */
A.apriCasa = id => vai('house', { houseId:id, tab:'spese', filtro:'tutte', year:null });
A.apriImpostazioni = () => vai('settings');
A.indietro = () => { ui.view = 'home'; render(); window.scrollTo(0,0); skipPop++; try { history.back(); } catch(e){ skipPop--; } };
A.tab = k => { ui.tab = k; render(); window.scrollTo(0,0); };
A.filtro = k => { ui.filtro = k; render(); };
A.anno = y => { ui.year = y; render(); };

/* ---------- Nuova spesa / modifica ---------- */
A.nuovaSpesa = pre => {
  const h = casa(ui.houseId);
  ed = { tipo:'e', id:null, houseId:h.id, amount:'', cat:null, group:null, desc:'', date:oggi(),
         payer: h.members.includes(h.defaultPayer) ? h.defaultPayer : h.members[0],
         mode:'solo', sel:{}, custom:{} };
  h.members.forEach(id => ed.sel[id] = true);
  if (pre==='bollette') ed.group = 'bollette';
  else if (pre){ ed.cat = pre; ed.group = cat(pre).group || null; }
  apriSheet(sheetSpesa(), () => setTimeout(() => { const i = $('#f-amount'); if (i) i.focus(); }, 280));
};
A.modificaSpesa = id => {
  const e = S.expenses.find(x => x.id===id); if (!e) return;
  const h = casa(e.houseId);
  const ids = Object.keys(e.shares).filter(k => e.shares[k]>0);
  let mode = 'scegli';
  if (ids.length===1 && ids[0]===e.payer) mode = 'solo';
  else if (ids.length===h.members.length && JSON.stringify(dividiUguale(e.amount, h.members)) === JSON.stringify(Object.fromEntries(h.members.map(m => [m, e.shares[m]||0])))) mode = 'uguale';
  ed = { tipo:'e', id:e.id, houseId:e.houseId, amount:centsToInput(e.amount), cat:e.cat, group:cat(e.cat).group||null, desc:e.desc||'', date:e.date,
         payer:e.payer, mode, sel:{}, custom:{} };
  h.members.forEach(m => { ed.sel[m] = mode!=='scegli' || !!e.shares[m]; if (mode==='scegli' && e.shares[m]) ed.custom[m] = centsToInput(e.shares[m]); });
  apriSheet(sheetSpesa());
};

function sheetSpesa(){
  const h = casa(ed.houseId);
  const tile = (on, click, emoji, nome) => `<button class="tile ${on?'on':''}" onclick="${click}"><span>${esc(emoji)}</span>${esc(nome)}</button>`;
  const tiles = S.categories.filter(c => !c.group).map(c => tile(ed.cat===c.id, `A.edCat('${c.id}')`, c.emoji, c.name));
  tiles.splice(1, 0, tile(ed.group==='bollette', `A.edGruppo('bollette')`, '💡', 'Bollette'));
  const subs = ed.group==='bollette'
    ? `<div class="subtiles">${S.categories.filter(c => c.group==='bollette').map(c => `<button class="chip ${ed.cat===c.id?'on':''}" onclick="A.edCat('${c.id}')">${esc(c.emoji)} ${esc(c.name)}</button>`).join('')}</div>` : '';
  const modi = [['solo','Solo '+persona(ed.payer).name], ['uguale','Tutti uguale'], ['scegli','Scegli']];
  return `<div class="sheet-h"><h2>${ed.id?'Modifica spesa':'Nuova spesa'}</h2><button class="icon-btn" onclick="A.chiudi()" aria-label="Chiudi">✕</button></div>
    <label class="amount"><span>€</span><input id="f-amount" inputmode="decimal" placeholder="0,00" autocomplete="off" value="${esc(ed.amount)}" oninput="A.edAmount(this.value)"></label>
    <div class="lbl">Categoria</div><div class="tiles">${tiles.join('')}</div>${subs}
    <div class="two"><label><div class="lbl">Descrizione</div><input placeholder="Facoltativa" value="${esc(ed.desc)}" oninput="A.edDesc(this.value)"></label>
      <label><div class="lbl">Data</div><input type="date" value="${esc(ed.date)}" onchange="A.edDate(this.value)"></label></div>
    <div class="lbl">Pagato da</div>
    <div class="chips wrapc">${h.members.map(id => `<button class="chip big ${ed.payer===id?'on':''}" onclick="A.edPayer('${id}')">${avatar(id)} ${esc(persona(id).name)}</button>`).join('')}</div>
    <div class="lbl">Per chi</div>
    <div class="seg">${modi.map(([k,l]) => `<button class="${ed.mode===k?'on':''}" onclick="A.edMode('${k}')">${esc(l)}</button>`).join('')}</div>
    <div id="splitBox">${splitBox()}</div>
    <div class="err" id="f-err"></div>
    <button class="btn full" onclick="A.salvaSpesa()">${ed.id?'Salva modifiche':'Aggiungi spesa'}</button>
    ${ed.id ? `<button class="btn ghost danger full" onclick="A.eliminaSpesa()">🗑️ Elimina spesa</button>` : ''}`;
}

function calcolaQuote(){
  const tot = parseEuro(ed.amount); const h = casa(ed.houseId);
  if (!(tot>0)) return { ok:false, tot:0, shares:{}, msg:'' };
  if (ed.mode==='solo') return { ok:true, tot, shares:{ [ed.payer]:tot } };
  if (ed.mode==='uguale') return { ok:true, tot, shares:dividiUguale(tot, h.members) };
  const ids = h.members.filter(id => ed.sel[id]);
  if (!ids.length) return { ok:false, tot, shares:{}, msg:'Scegli almeno una persona' };
  const fissi = {}, auto = []; let s = 0;
  for (const id of ids){
    const v = (ed.custom[id]||'').trim();
    if (v){ const c = parseEuro(v); if (!(c>=0)) return { ok:false, tot, shares:{}, msg:'C\'è un importo non valido' }; fissi[id]=c; s+=c; }
    else auto.push(id);
  }
  const resto = tot - s;
  if (resto<0) return { ok:false, tot, shares:fissi, msg:`Gli importi superano il totale di ${euro(-resto)}` };
  if (auto.length) return { ok:true, tot, shares:{ ...fissi, ...dividiUguale(resto, auto) } };
  if (resto>0) return { ok:false, tot, shares:fissi, msg:`Mancano ${euro(resto)} da assegnare` };
  return { ok:true, tot, shares:fissi };
}
function splitBox(){
  const h = casa(ed.houseId); const q = calcolaQuote();
  if (ed.mode==='solo') return `<p class="note">La spesa resta a ${esc(persona(ed.payer).name)}: nessun debito.</p>`;
  if (ed.mode==='uguale') return `<p class="note">${q.tot ? `${euro(q.shares[h.members[h.members.length-1]])} a testa` : 'In parti uguali'} tra ${h.members.length} persone.</p>`;
  return `<div class="split">${h.members.map(id => {
      const on = !!ed.sel[id];
      const ph = on && q.shares[id]!=null ? centsToInput(q.shares[id]) : '';
      return `<div class="split-row ${on?'':'off'}"><button class="check ${on?'on':''}" onclick="A.edSel('${id}')" aria-label="Includi">${on?'✓':''}</button>${avatar(id)}
        <span class="nm">${esc(persona(id).name)}</span><span class="eur">€</span>
        <input data-id="${id}" inputmode="decimal" ${on?'':'disabled'} value="${esc(on?(ed.custom[id]||''):'')}" placeholder="${ph}" oninput="A.edCustom('${id}',this.value)"></div>`;
    }).join('')}</div>
    <div class="note ${q.ok||!q.msg?'':'neg'}" id="splitMsg">${q.ok||!q.msg ? 'Lascia vuoto per dividere il resto in parti uguali.' : esc(q.msg)}</div>`;
}
function aggiornaSplitLive(){
  const q = calcolaQuote();
  document.querySelectorAll('#splitBox input[data-id]').forEach(inp => {
    const id = inp.dataset.id;
    inp.placeholder = ed.sel[id] && q.shares[id]!=null ? centsToInput(q.shares[id]) : '';
  });
  const m = $('#splitMsg');
  if (m){ m.className = 'note '+(q.ok||!q.msg?'':'neg'); m.textContent = q.ok||!q.msg ? 'Lascia vuoto per dividere il resto in parti uguali.' : q.msg; }
}

A.edAmount = v => { ed.amount = v; if (ed.mode==='uguale') $('#splitBox').innerHTML = splitBox(); else if (ed.mode==='scegli') aggiornaSplitLive(); };
A.edDesc = v => { ed.desc = v; };
A.edDate = v => { ed.date = v; };
A.edCat = id => { ed.cat = id; ed.group = cat(id).group || null; aggiornaSheet(sheetSpesa()); };
A.edGruppo = g => { ed.group = g; if (cat(ed.cat).group!==g) ed.cat = null; aggiornaSheet(sheetSpesa()); };
A.edPayer = id => { ed.payer = id; aggiornaSheet(sheetSpesa()); };
A.edMode = m => { ed.mode = m; aggiornaSheet(sheetSpesa()); };
A.edSel = id => { ed.sel[id] = !ed.sel[id]; if (!ed.sel[id]) delete ed.custom[id]; $('#splitBox').innerHTML = splitBox(); };
A.edCustom = (id, v) => { ed.custom[id] = v; aggiornaSplitLive(); };

A.salvaSpesa = () => {
  const err = m => { $('#f-err').textContent = m; };
  const tot = parseEuro(ed.amount);
  if (!(tot>0)) return err('Scrivi l\'importo');
  if (!ed.cat) return err(ed.group==='bollette' ? 'Scegli il tipo di bolletta' : 'Scegli una categoria');
  const q = calcolaQuote();
  if (!q.ok) return err(q.msg || 'Controlla la divisione');
  const shares = {}; for (const k in q.shares) if (q.shares[k]>0) shares[k] = q.shares[k];
  const now = Date.now(); const eraModifica = !!ed.id;
  const dati = { amount:tot, cat:ed.cat, desc:ed.desc.trim(), date:ed.date||oggi(), payer:ed.payer, shares, updatedAt:now };
  let spesa;
  if (eraModifica){ spesa = S.expenses.find(x => x.id===ed.id); Object.assign(spesa, dati); }
  else { spesa = { id:uid('e'), houseId:ed.houseId, ...dati, createdBy:S.settings.me, createdAt:now }; S.expenses.push(spesa); }
  salva(); invia('saveExpense', { expense:spesa }); A.chiudi(); render();
  toast(eraModifica ? 'Modifiche salvate ✓' : 'Spesa aggiunta ✓');
};
A.eliminaSpesa = () => {
  const id = ed.id;
  chiedi('Eliminare questa spesa?', 'Elimina', () => {
    S.expenses = S.expenses.filter(e => e.id!==id); salva(); invia('deleteExpense', { id }); A.chiudi(); render(); toast('Spesa eliminata');
  }, true);
};

/* ---------- Rimborsi ---------- */
A.segnaRimborsato = i => {
  const t = ui.pareggi[i]; if (!t) return;
  chiedi(`${esc(persona(t.from).name)} ha dato ${euro(t.amount)} a ${esc(persona(t.to).name)}?`, 'Sì, fatto', () => {
    const tr = { id:uid('t'), houseId:ui.houseId, from:t.from, to:t.to, amount:t.amount, date:oggi(), createdBy:S.settings.me, createdAt:Date.now() };
    S.transfers.push(tr); salva(); invia('saveTransfer', { transfer:tr }); render(); toast('Rimborso registrato ✓');
  });
};
A.nuovoRimborso = () => {
  const h = casa(ui.houseId);
  const from = h.members.includes(S.settings.me) ? S.settings.me : h.members[0];
  const to = h.members.includes(h.defaultPayer) && h.defaultPayer!==from ? h.defaultPayer : (h.members.find(x => x!==from) || from);
  ed = { tipo:'r', houseId:h.id, from, to, amount:'', date:oggi() };
  apriSheet(sheetRimborso());
};
function sheetRimborso(){
  const h = casa(ed.houseId);
  const chips = k => h.members.map(id => `<button class="chip big ${ed[k]===id?'on':''}" onclick="A.edR('${k}','${id}')">${avatar(id)} ${esc(persona(id).name)}</button>`).join('');
  return `<div class="sheet-h"><h2>Registra un rimborso</h2><button class="icon-btn" onclick="A.chiudi()" aria-label="Chiudi">✕</button></div>
    <label class="amount"><span>€</span><input inputmode="decimal" placeholder="0,00" value="${esc(ed.amount)}" oninput="A.edRAmount(this.value)"></label>
    <div class="lbl">Chi dà i soldi</div><div class="chips wrapc">${chips('from')}</div>
    <div class="lbl">A chi</div><div class="chips wrapc">${chips('to')}</div>
    <div class="lbl">Data</div><input type="date" value="${esc(ed.date)}" onchange="A.edRDate(this.value)">
    <div class="err" id="f-err"></div>
    <button class="btn full" onclick="A.salvaRimborso()">Salva rimborso</button>`;
}
A.edR = (k, id) => { ed[k] = id; aggiornaSheet(sheetRimborso()); };
A.edRAmount = v => { ed.amount = v; };
A.edRDate = v => { ed.date = v; };
A.salvaRimborso = () => {
  const tot = parseEuro(ed.amount);
  if (!(tot>0)) return $('#f-err').textContent = 'Scrivi l\'importo';
  if (ed.from===ed.to) return $('#f-err').textContent = 'Scegli due persone diverse';
  const tr = { id:uid('t'), houseId:ed.houseId, from:ed.from, to:ed.to, amount:tot, date:ed.date||oggi(), createdBy:S.settings.me, createdAt:Date.now() };
  S.transfers.push(tr); salva(); invia('saveTransfer', { transfer:tr }); A.chiudi(); render(); toast('Rimborso registrato ✓');
};
A.eliminaRimborso = id => {
  const t = S.transfers.find(x => x.id===id); if (!t) return;
  chiedi(`Eliminare il rimborso di ${euro(t.amount)} (${esc(persona(t.from).name)} → ${esc(persona(t.to).name)})?`, 'Elimina', () => {
    S.transfers = S.transfers.filter(x => x.id!==id); salva(); invia('deleteTransfer', { id }); render(); toast('Rimborso eliminato');
  }, true);
};

/* ---------- Case ---------- */
A.modificaCasa = id => {
  const h = id ? casa(id) : null;
  ed = { tipo:'h', id:h?h.id:null, name:h?h.name:'', emoji:h?h.emoji:'🏡',
         members: h ? [...h.members] : S.people.map(p => p.id), defaultPayer: h ? h.defaultPayer : (S.people.find(p => p.id==='p_fra') ? 'p_fra' : S.people[0].id) };
  apriSheet(sheetCasa());
};
function sheetCasa(){
  return `<div class="sheet-h"><h2>${ed.id?'Modifica casa':'Nuova casa'}</h2><button class="icon-btn" onclick="A.chiudi()" aria-label="Chiudi">✕</button></div>
    <div class="two small-first"><label><div class="lbl">Emoji</div><input value="${esc(ed.emoji)}" maxlength="8" oninput="A.edH('emoji',this.value)"></label>
      <label><div class="lbl">Nome</div><input value="${esc(ed.name)}" placeholder="Es. Casa al mare" oninput="A.edH('name',this.value)"></label></div>
    <div class="lbl">Chi ne fa parte</div>
    <div class="chips wrapc">${S.people.map(p => `<button class="chip big ${ed.members.includes(p.id)?'on':''}" onclick="A.edHMem('${p.id}')">${avatar(p.id)} ${esc(p.name)}</button>`).join('')}</div>
    <div class="lbl">Di solito paga</div>
    <div class="chips wrapc">${ed.members.map(id => `<button class="chip big ${ed.defaultPayer===id?'on':''}" onclick="A.edHPay('${id}')">${avatar(id)} ${esc(persona(id).name)}</button>`).join('')}</div>
    <div class="err" id="f-err"></div>
    <button class="btn full" onclick="A.salvaCasa()">${ed.id?'Salva':'Crea casa'}</button>
    ${ed.id ? `<button class="btn ghost danger full" onclick="A.eliminaCasa()">🗑️ Elimina casa</button>` : ''}`;
}
A.edH = (k, v) => { ed[k] = v; };
A.edHMem = id => {
  ed.members = ed.members.includes(id) ? ed.members.filter(x => x!==id) : S.people.map(p => p.id).filter(x => x===id || ed.members.includes(x));
  if (!ed.members.includes(ed.defaultPayer)) ed.defaultPayer = ed.members[0] || null;
  aggiornaSheet(sheetCasa());
};
A.edHPay = id => { ed.defaultPayer = id; aggiornaSheet(sheetCasa()); };
A.salvaCasa = () => {
  const err = m => { $('#f-err').textContent = m; };
  if (!ed.name.trim()) return err('Dai un nome alla casa');
  if (!ed.members.length) return err('Scegli almeno una persona');
  if (ed.id){
    const usati = new Set();
    S.expenses.filter(e => e.houseId===ed.id).forEach(e => { usati.add(e.payer); Object.keys(e.shares).forEach(k => usati.add(k)); });
    S.transfers.filter(t => t.houseId===ed.id).forEach(t => { usati.add(t.from); usati.add(t.to); });
    const tolti = [...usati].filter(id => !ed.members.includes(id));
    if (tolti.length) return err(`${tolti.map(id => persona(id).name).join(', ')} ha già delle spese in questa casa: non si può togliere`);
    Object.assign(casa(ed.id), { name:ed.name.trim(), emoji:ed.emoji.trim()||'🏠', members:ed.members, defaultPayer:ed.defaultPayer });
  } else {
    S.houses.push({ id:uid('h'), name:ed.name.trim(), emoji:ed.emoji.trim()||'🏠', members:ed.members, defaultPayer:ed.defaultPayer });
  }
  salvaImp(); A.chiudi(); render(); toast('Casa salvata ✓');
};
A.eliminaCasa = () => {
  const id = ed.id;
  if (S.expenses.some(e => e.houseId===id) || S.transfers.some(t => t.houseId===id)) return $('#f-err').textContent = 'Questa casa ha delle spese: non si può eliminare';
  if (S.houses.length===1) return $('#f-err').textContent = 'Serve almeno una casa';
  chiedi('Eliminare questa casa?', 'Elimina', () => { S.houses = S.houses.filter(h => h.id!==id); salvaImp(); A.chiudi(); render(); }, true);
};

/* ---------- Persone, categorie, dati ---------- */
A.io = id => { S.settings.me = id; salva(); render(); };
A.rinominaPersona = (id, v) => { v = v.trim(); if (!v){ render(); return; } persona(id).name = v; salvaImp(); render(); toast('Nome salvato ✓'); };
A.coloreP = id => { const p = persona(id); p.color = COLORI[(COLORI.indexOf(p.color)+1) % COLORI.length]; salvaImp(); render(); };
A.aggiungiPersona = () => {
  S.people.push({ id:uid('p'), name:'Nuova persona', color:COLORI[S.people.length % COLORI.length] });
  salvaImp(); render(); toast('Aggiunta: tocca il nome per cambiarlo');
};
A.eliminaPersona = id => {
  const usata = S.expenses.some(e => e.payer===id || e.shares[id]) || S.transfers.some(t => t.from===id || t.to===id);
  if (usata) return toast('Ha già delle spese: non si può eliminare');
  if (S.people.length===1) return toast('Serve almeno una persona');
  chiedi(`Eliminare ${esc(persona(id).name)}?`, 'Elimina', () => {
    S.people = S.people.filter(p => p.id!==id);
    S.houses.forEach(h => { h.members = h.members.filter(m => m!==id); if (!h.members.length) h.members = [S.people[0].id]; if (!h.members.includes(h.defaultPayer)) h.defaultPayer = h.members[0]; });
    if (S.settings.me===id) S.settings.me = S.people[0].id;
    salvaImp(); render();
  }, true);
};
A.aggiungiCategoria = () => {
  const nome = $('#nc-name').value.trim(); const emoji = $('#nc-emoji').value.trim() || '🏷️';
  if (!nome) return toast('Scrivi il nome della categoria');
  const c = { id:uid('c'), name:nome, emoji };
  if ($('#nc-boll').checked) c.group = 'bollette';
  S.categories.push(c); salvaImp(); render(); toast('Categoria aggiunta ✓');
};
A.eliminaCategoria = id => {
  const n = S.expenses.filter(e => e.cat===id).length;
  if (n) return toast(`È usata in ${n} spes${n===1?'a':'e'}: non si può eliminare`);
  chiedi('Eliminare questa categoria?', 'Elimina', () => { S.categories = S.categories.filter(c => c.id!==id); salvaImp(); render(); }, true);
};
A.cancellaTutto = () => chiedi('Cancellare tutte le spese, i rimborsi e le impostazioni da questo telefono?', 'Cancella tutto', () => {
  S = statoIniziale(); salva(); ui.view = 'home'; render(); toast('Dati cancellati');
}, true);
A.caricaEsempio = () => chiedi('Caricare dati di esempio inventati? Sostituiscono quelli attuali.', 'Carica', () => {
  S = datiEsempio(); salva(); ui.view = 'home'; render(); toast('Dati di esempio caricati');
});

function datiEsempio(){
  const st = statoIniziale();
  let seed = 11; const rnd = () => (seed = (seed*16807) % 2147483647) / 2147483647;
  const H='h_casa', F='p_fra', D='p_fede', R='p_sis', tutti=[D,F,R];
  const limite = oggi();
  const add = (date, c, euroVal, payer, perTutti, desc='') => {
    if (date>limite) return;
    const amount = Math.round(euroVal*100);
    st.expenses.push({ id:uid('e'), houseId:H, amount, cat:c, desc, date, payer, shares: perTutti ? dividiUguale(amount, tutti) : { [payer]:amount }, createdBy:D, createdAt:Date.parse(date) });
  };
  const y = new Date().getFullYear();
  for (let m=0; m<12; m++){
    const mm = String(m+1).padStart(2,'0'); const d = g => `${y}-${mm}-${String(g).padStart(2,'0')}`;
    [3,10,17,24].forEach(g => { if (rnd()<0.85) add(d(g),'spesa',55+rnd()*85,F,false); else add(d(g),'spesa',40+rnd()*60,D,true,'Spesa grossa'); });
    const inverno = [0,1,2,10,11].includes(m);
    add(d(12),'luce',45+rnd()*30,F,false);
    if (m%2===0) add(d(14),'gas',(inverno?150:45)+rnd()*40,F,false);
    if (m%3===1) add(d(20),'acqua',70+rnd()*25,F,false);
    add(d(5),'internet',29.90,D,true);
    if (m===3 || m===10) add(d(26),'rifiuti',128,F,false);
    if (m===3) add(d(8),'giardinaggio',120,D,true,'Taglio siepe');
    if (m===5) add(d(22),'idraulico',90,F,false,'Rubinetto cucina');
    if (m===8) add(d(18),'manutenzione',64.5,R,true,'Lampadine e silicone');
  }
  st.transfers.push({ id:uid('t'), houseId:H, from:R, to:D, amount:6000, date:`${y}-06-30`, createdBy:D, createdAt:Date.parse(`${y}-06-30`) });
  st.transfers = st.transfers.filter(t => t.date<=limite);
  return st;
}

/* ---------- Collegamento al foglio Google ---------- */
async function api(action, dati={}){
  let r, j;
  try {
    r = await fetch(CONFIG.API_URL, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...dati, action, session: SESS ? SESS.session : undefined }) });
  } catch(e){ const er = new Error('RETE'); er.code = 'RETE'; throw er; }
  try { j = await r.json(); } catch(e){ const er = new Error('RETE'); er.code = 'RETE'; throw er; }
  if (!j.ok){ const er = new Error(j.error || 'ERRORE'); er.code = j.error || 'ERRORE'; throw er; }
  return j;
}

// Ogni modifica parte subito; se manca la rete resta "in coda" e riparte da sola
function invia(action, dati){
  if (!ONLINE) return;
  coda.push({ ...dati, action });
  salvaCoda(); aggiornaStato(); svuotaCoda();
}
async function svuotaCoda(){
  if (inviando || !SESS || !coda.length) return;
  inviando = true; aggiornaStato();
  let riprova = false;
  try {
    while (coda.length){
      await api(coda[0].action, coda[0]);
      coda.shift(); salvaCoda(); aggiornaStato();
    }
    statoSync = 'ok';
  } catch(e){
    if (e.code==='RETE') statoSync = 'offline';
    else if (e.code==='NO_LOGIN' || e.code==='NON_AUTORIZZATO') sessioneScaduta();
    else { coda.shift(); salvaCoda(); toast('⚠️ Modifica non salvata ('+e.code+')'); riprova = true; }
  } finally {
    inviando = false; aggiornaStato();
    if (riprova) svuotaCoda();
  }
}
async function sincronizza(){
  if (!ONLINE || !SESS) return;
  await svuotaCoda();
  if (coda.length || !SESS) return;            // offline: si riprova più tardi
  statoSync = 'sync'; aggiornaStato();
  try {
    const j = await api('load');
    applicaServer(j);
    statoSync = 'ok';
  } catch(e){
    if (e.code==='NO_LOGIN' || e.code==='NON_AUTORIZZATO') return sessioneScaduta();
    statoSync = 'offline';
  }
  aggiornaStato();
}
function applicaServer(j){
  Object.assign(SESS, { me:j.me, admin:j.admin, email:j.email, sheetUrl:j.sheetUrl }); salvaSess();
  const st = j.state;
  if (st.settings){ S.people = st.settings.people; S.houses = st.settings.houses; S.categories = st.settings.categories; }
  else if (j.admin) invia('saveSettings', { settings:impostazioniAttuali() });   // primo avvio: il foglio prende le impostazioni dell'app
  S.expenses = st.expenses; S.transfers = st.transfers; S.settings.me = j.me;
  if (ui.view==='house' && !casa(ui.houseId)) ui.view = 'home';
  salva(); render();
}
function testoStato(){
  if (inviando || statoSync==='sync') return '⏳';
  if (coda.length) return '⚠️ '+coda.length;
  if (statoSync==='ok') return '☁️';
  return '🔄';
}
function aggiornaStato(){
  const b = $('#sync'); if (!b) return;
  b.textContent = testoStato();
  b.title = coda.length ? `${coda.length} modifiche in attesa di invio` : statoSync==='ok' ? 'Tutto salvato nel foglio' : 'Tocca per aggiornare';
}
A.sincronizza = () => { sincronizza(); if (coda.length && statoSync==='offline') toast('Nessuna connessione: riprovo appena torna'); };

/* Accesso con Google */
let gisPronto = null;
function caricaGIS(){
  if (gisPronto) return gisPronto;
  gisPronto = new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = ok; s.onerror = () => { gisPronto = null; ko(new Error('GIS')); };
    document.head.appendChild(s);
  });
  return gisPronto;
}
function vLogin(){
  const conChiave = IN_APP || chiaveHub();
  const chi = chiHubNome();
  return `<main class="login"><div class="login-box">
    <img src="icon.svg" alt="" class="login-logo">
    <h1>Gestione Casa</h1>
    <p class="mut" id="login-msg">${conChiave ? (chiaveHub() ? 'Entro con la chiave di sistema…' : 'Entra con la <b>chiave di sistema</b> (la stessa delle altre app).') : 'Entra con il tuo account Google.<br>Possono entrare solo le persone autorizzate.'}</p>
    ${conChiave ? `<div id="chiave-box" style="${chiaveHub() ? 'display:none' : ''}">
      <div class="chips wrapc" style="justify-content:center;margin:14px 0 4px">${[['Federico','Federico'],['Mamma','Mamma'],['Sorella','Beatrice']].map(([n,t]) => `<button class="chip${chi===n ? ' on' : ''}" data-n="${n}" onclick="A.sceltaChi('${n}')">${t}</button>`).join('')}</div>
      <input id="chiave-in" type="password" maxlength="40" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off" placeholder="Chiave di sistema" style="margin-top:10px">
      <button class="btn full" onclick="A.entraChiave()">🔑 Entra</button>
    </div>` : ''}
    <div id="gbtn" style="margin-top:14px"></div>
    <p class="err" id="login-err"></p></div></main>`;
}
const IN_APP = /LeMieApp/.test(navigator.userAgent);   // dentro l'app Android "Le mie app"
async function mostraBottoneGoogle(){
  if (IN_APP) return;   // Google non permette l'accesso dentro le app: si entra con la chiave di sistema
  try {
    await caricaGIS();
    google.accounts.id.initialize({ client_id:CONFIG.CLIENT_ID, callback:alLogin, auto_select:false });
    const box = $('#gbtn'); if (!box) return;
    google.accounts.id.renderButton(box, { theme:'filled_blue', size:'large', shape:'pill', text:'signin_with', locale:'it' });
  } catch(e){
    const err = $('#login-err'); if (err) err.textContent = 'Non riesco a caricare l\'accesso Google. Controlla la connessione e riapri l\'app.';
  }
}
async function alLogin(resp){
  const err = $('#login-err'); if (err) err.textContent = 'Accesso in corso…';
  try {
    const j = await api('login', { idToken:resp.credential });
    SESS = { session:j.session, email:j.email, me:j.me, admin:j.admin, sheetUrl:j.sheetUrl };
    salvaSess(); S.settings.me = j.me; ui.view = 'home'; render(); sincronizza();
  } catch(e){
    const m = e.code==='NON_AUTORIZZATO' ? 'Questo account non è autorizzato. Chiedi a Federico di aggiungerti.'
            : e.code==='RETE' ? 'Nessuna connessione, riprova.'
            : 'Accesso non riuscito ('+(e.code||e.message)+').';
    const el = $('#login-err'); if (el) el.textContent = m;
  }
}
/* Accesso con la chiave di sistema dell'hub "Le mie app" (stesso telefono = stessa memoria) */
const ALIAS_CHI = { mamma:'Francesca', sorella:'Beatrice', bea:'Beatrice' };
function chiaveHub(){ try { return localStorage.getItem('eco.chiave') || ''; } catch(e){ return ''; } }
function chiHubNome(){ try { return localStorage.getItem('eco.me') || ''; } catch(e){ return ''; } }
function chiHub(){
  const n = ALIAS_CHI[chiHubNome().toLowerCase()] || chiHubNome();
  const p = S.people.find(x => x.name.toLowerCase() === n.toLowerCase());
  return p ? p.id : n;
}
const conTimeout = (p, ms=20000) => Promise.race([p, new Promise((_, ko) => setTimeout(() => { const e = new Error('RETE'); e.code = 'RETE'; ko(e); }, ms))]);
let entrando = false;
async function entraConChiave(chiave = chiaveHub()){
  if (!ONLINE || !chiave || entrando) return false;
  entrando = true;
  const el = $('#login-err'); if (el) el.textContent = 'Accesso in corso…';
  try {
    const j = await conTimeout(api('loginChiave', { chiave, chi:chiHub() }));
    try { localStorage.setItem('eco.chiave', chiave); } catch(e){}   // vale anche per l'hub e le altre app
    SESS = { session:j.session, email:j.email, me:j.me, admin:j.admin, sheetUrl:j.sheetUrl, via:'chiave' };
    salvaSess(); S.settings.me = j.me; ui.view = 'home'; render(); sincronizza();
    return true;
  } catch(e){
    const m = e.code==='CHIAVE_ERRATA' ? 'Chiave sbagliata: non coincide con quella di Gestione Casa. Riscrivila qui sotto.'
            : e.code==='CHIAVE_NON_IMPOSTATA' ? 'Nello script di Gestione Casa manca la chiave: va eseguita una volta la funzione impostaChiave.'
            : e.code==='AZIONE_SCONOSCIUTA' ? 'Lo script di Gestione Casa non conosce ancora la chiave: manca il file Chiave.gs o la nuova versione pubblicata.'
            : e.code==='TROPPI_TENTATIVI' ? 'Troppi tentativi: riprova tra 15 minuti.'
            : e.code==='NON_AUTORIZZATO' ? 'Scegli chi sei qui sopra e riprova.'
            : e.code==='RETE' ? 'Nessuna risposta dal foglio: controlla la connessione e riprova.'
            : 'Accesso non riuscito ('+(e.code||e.message)+').';
    const box = $('#chiave-box'); if (box) box.style.display = '';
    const msg = $('#login-msg'); if (msg) msg.innerHTML = 'Entra con la <b>chiave di sistema</b> (la stessa delle altre app).';
    const err = $('#login-err'); if (err) err.textContent = m;
    return false;
  } finally { entrando = false; }
}
A.sceltaChi = n => {
  try { localStorage.setItem('eco.me', n); } catch(e){}   // "chi sei" vale per tutte le app
  document.querySelectorAll('#chiave-box .chip').forEach(b => b.classList.toggle('on', b.dataset.n===n));
};
A.entraChiave = () => {
  const k = ($('#chiave-in') || {}).value || '';
  const err = $('#login-err');
  if (!chiHubNome()){ if (err) err.textContent = 'Prima tocca chi sei.'; return; }
  if (k.trim().length < 8){ if (err) err.textContent = 'La chiave ha almeno 8 caratteri.'; return; }
  entraConChiave(k.trim());
};
function sessioneScaduta(){
  SESS = null; salvaSess(); statoSync = '';
  if (sheetOpen) chiudiSheet();
  render();
  if (chiaveHub()) entraConChiave();
  else setTimeout(() => { const el = $('#login-err'); if (el) el.textContent = 'Accedi di nuovo per continuare.'; }, 50);
}
A.esci = () => chiedi(coda.length ? `Ci sono ${coda.length} modifiche non ancora inviate: uscendo si perdono. Uscire lo stesso?` : 'Uscire da Gestione Casa su questo telefono?', 'Esci', async () => {
  const s = SESS && SESS.session;
  SESS = null; salvaSess(); coda = []; salvaCoda();
  S = statoIniziale(); salva(); ui.view = 'home';
  if (sheetOpen) chiudiSheet();
  render();
  if (s) try { await fetch(CONFIG.API_URL, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' }, body:JSON.stringify({ action:'logout', session:s }) }); } catch(e){}
}, true);

/* ---------- Avvio ---------- */
carica();
try { history.replaceState({ v:'home' }, ''); } catch(e){}
render();
if (ONLINE && SESS) sincronizza();
else if (ONLINE) entraConChiave();
document.addEventListener('visibilitychange', () => { if (document.visibilityState==='visible') sincronizza(); });
window.addEventListener('online', () => sincronizza());
if ('serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('sw.js').catch(() => {});
