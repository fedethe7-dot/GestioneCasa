/* Stampa – app per stampare bollette e foto dal telefono.
   Il file non lascia mai il telefono: viene preparato qui e passato alla stampa di Android,
   che usa il plugin della stampante gia' installato. */
const VERSION = '1.0.1';
const $ = id => document.getElementById(id);
const RENDER_WIDTH = 1700; // ~200 dpi su A4: testo nitido, memoria contenuta

pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
$('ver').textContent = VERSION;

let pageUrls = [];

function show(id, on) { $(id).classList.toggle('hidden', !on); }
function busy(text) { show('busy', !!text); if (text) $('busyText').textContent = text; }
function error(msg) { $('error').textContent = msg || ''; show('error', !!msg); }

function reset() {
  pageUrls.forEach(u => URL.revokeObjectURL(u));
  pageUrls = [];
  $('preview').innerHTML = '';
  $('printArea').innerHTML = '';
  $('btnPrint').disabled = true;
  $('file').value = '';
  error('');
  show('stepPreview', false);
  show('stepPick', true);
}

$('btnPick').onclick = () => $('file').click();
$('btnOther').onclick = () => { reset(); $('file').click(); };
$('file').onchange = e => { const f = e.target.files[0]; if (f) load(f); };

async function load(file) {
  reset();
  show('stepPick', false);
  show('stepPreview', true);
  $('fileName').textContent = file.name;
  $('fileInfo').textContent = '';
  busy('Preparo il documento…');
  try {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (isPdf) await loadPdf(file); else await loadImage(file);
    $('btnPrint').disabled = false;
  } catch (err) {
    console.error(err);
    error(err && err.name === 'PasswordException'
      ? 'Questo PDF è protetto da password e non si può stampare da qui.'
      : 'Non riesco ad aprire questo file. Prova con un altro PDF o una foto.');
    show('stepPreview', false); show('stepPick', true);
  } finally { busy(''); }
}

async function loadPdf(file) {
  // isEvalSupported:false = protezione da PDF malevoli (CVE-2024-4367); nessun font o script esterno
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false, disableFontFace: false, enableXfa: false }).promise;
  const n = pdf.numPages;
  $('fileInfo').textContent = n === 1 ? '1 pagina' : n + ' pagine';
  for (let i = 1; i <= n; i++) {
    busy('Preparo la pagina ' + i + ' di ' + n + '…');
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    // pagina orizzontale: ruotata per riempire il foglio verticale
    const rot = base.width > base.height ? (page.rotate + 90) % 360 : page.rotate;
    const vp = page.getViewport({ scale: RENDER_WIDTH / Math.min(base.width, base.height), rotation: rot });
    const c = document.createElement('canvas');
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
    c.width = c.height = 0; // libera memoria
    addPage(URL.createObjectURL(blob), false);
    page.cleanup();
  }
  await pdf.destroy();
}

async function loadImage(file) {
  $('fileInfo').textContent = 'Foto';
  addPage(URL.createObjectURL(file), true);
}

function addPage(url, photo) {
  pageUrls.push(url);
  const a = new Image(); a.src = url; a.alt = 'Anteprima';
  $('preview').appendChild(a);
  const sheet = document.createElement('div'); sheet.className = 'sheet';
  const b = new Image(); b.src = url;
  sheet.appendChild(b);
  $('printArea').appendChild(sheet);
}

$('btnPrint').onclick = async () => {
  // aspetta che tutte le pagine siano pronte, poi apre la stampa di Android
  await Promise.all([...$('printArea').querySelectorAll('img')].map(i => i.decode().catch(() => {})));
  window.print();
};

/* ---- Inchiostro: tasto visibile solo se l'indirizzo della stampante e' stato impostato
   UNA volta aprendo il link  .../Stampa/?stampante=192.168.1.50  (la mamma non vede impostazioni) ---- */
(function () {
  let ip = new URLSearchParams(location.search).get('stampante');
  try {
    if (ip) localStorage.setItem('printer', ip.replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
    ip = localStorage.getItem('printer');
  } catch (e) {}
  if (ip) { $('btnInk').href = 'http://' + ip + '/'; show('inkCard', true); }
})();

/* ---- app installabile e aggiornabile ---- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
