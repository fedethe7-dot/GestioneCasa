/**
 * ============================================================
 *  GESTIONE CASA — Accesso con la chiave di sistema
 * ============================================================
 *  File NUOVO da aggiungere al progetto Apps Script (accanto a
 *  Code.gs, che resta com'è). Serve a far entrare l'app con la
 *  stessa chiave delle altre app dell'hub "Le mie app".
 *  L'accesso con Google continua a funzionare come prima.
 *
 *  Sicurezza:
 *  - la chiave non viene mai salvata in chiaro: solo un'impronta
 *    SHA-256 con sale, nelle proprietà dello script
 *  - dopo 8 tentativi sbagliati si blocca per 15 minuti
 *  - si entra solo come una delle persone autorizzate in CONFIG.UTENTI
 *
 *  Una volta sola: esegui la funzione impostaChiave dall'editor.
 */

var CHIAVE_MAX_TENTATIVI = 8;
var CHIAVE_BLOCCO_MINUTI = 15;
// Nomi usati nelle altre app -> nomi usati in Gestione Casa
var CHIAVE_ALIAS = { mamma: 'Francesca', sorella: 'Beatrice', bea: 'Beatrice' };

function impostaChiave() {
  var ui = SpreadsheetApp.getUi();
  var r1 = ui.prompt('🔑 Chiave di sistema',
    'Scrivi la chiave di sistema (la stessa di Lavori, Animali e Home Vault).',
    ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var k = r1.getResponseText().trim();
  if (!/^(?!.*['"`\\])[\x21-\x7E]{8,40}$/.test(k)) {
    ui.alert('La chiave va da 8 a 40 caratteri: lettere, numeri e simboli.\nNiente spazi, accenti, apostrofi o virgolette.');
    return;
  }
  var r2 = ui.prompt('🔑 Conferma', 'Scrivi di nuovo la chiave:', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  if (r2.getResponseText().trim() !== k) { ui.alert('Le due chiavi non coincidono. Riprova.'); return; }

  var sale = Utilities.getUuid();
  var p = PropertiesService.getScriptProperties();
  p.setProperty('CHIAVE_SALE', sale);
  p.setProperty('CHIAVE_IMPRONTA', improntaChiave_(sale + k));
  ui.alert('✅ Chiave impostata', 'Ora pubblica una nuova versione: Esegui il deployment → Gestisci deployment → Modifica → Nuova versione.', ui.ButtonSet.OK);
}

function improntaChiave_(testo) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, testo, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

// Chiamata da gestisci(): { action:'loginChiave', chiave, chi }  (chi = nome o id persona)
function loginChiave(req) {
  var cache = CacheService.getScriptCache();
  var errori = Number(cache.get('CHIAVE_ERRORI') || 0);
  if (errori >= CHIAVE_MAX_TENTATIVI) throw new Error('TROPPI_TENTATIVI');

  var p = PropertiesService.getScriptProperties();
  var sale = p.getProperty('CHIAVE_SALE'), impronta = p.getProperty('CHIAVE_IMPRONTA');
  if (!sale || !impronta) throw new Error('CHIAVE_NON_IMPOSTATA');

  var k = String(req.chiave || '').trim();
  if (!k || k.length > 40 || improntaChiave_(sale + k) !== impronta) {
    cache.put('CHIAVE_ERRORI', String(errori + 1), CHIAVE_BLOCCO_MINUTI * 60);
    Utilities.sleep(800);   // rallenta chi prova a indovinare
    throw new Error('CHIAVE_ERRATA');
  }
  cache.remove('CHIAVE_ERRORI');

  var email = emailDaChi_(req.chi);
  if (!email) throw new Error('NON_AUTORIZZATO');

  var session = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var scad = Date.now() + CONFIG.GIORNI_SESSIONE * 86400000;
  p.setProperty('s_' + session, JSON.stringify({ email: email, scad: scad, via: 'chiave' }));
  pulisciSessioni();
  return Object.assign({ ok: true, session: session }, infoUtente(email));
}

// Trova l'email autorizzata a partire dal nome (o dall'id) della persona
function emailDaChi_(chi) {
  chi = String(chi || '').trim();
  if (!chi) return '';
  var nome = (CHIAVE_ALIAS[chi.toLowerCase()] || chi).toLowerCase();
  var idPersona = chi;
  var imp = leggiImpostazioni();
  if (imp && imp.people) {
    imp.people.forEach(function (x) { if (String(x.name).toLowerCase() === nome) idPersona = x.id; });
  }
  var email = '';
  Object.keys(CONFIG.UTENTI).forEach(function (e) {
    var v = String(CONFIG.UTENTI[e]);
    if (v === idPersona || v.toLowerCase() === nome) email = e;
  });
  return email;
}
