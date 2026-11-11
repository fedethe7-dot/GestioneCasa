# 🏠 Gestione Casa

Web app (PWA) per tenere traccia delle spese di casa in famiglia, in stile Tricount:

- 🛒 spesa supermercato, 💡 bollette (luce, gas, acqua, internet, TARI) e altre voci con emoji
- chi ha pagato e per chi, con divisione in parti uguali o importi a scelta
- ⚖️ saldi in tempo reale e "come pareggiare" con il minor numero di rimborsi
- 📊 insight: andamento mese per mese, categorie, bollette, chi ha pagato
- più case gestibili
- 🔍 ricerca nelle spese (descrizione, categoria, persone, importo)

In questo repository c'è **solo il codice** dell'app: nessun dato.
I dati vengono salvati in un foglio Google privato e sono visibili solo agli account autorizzati.

Accesso con Google: possono entrare solo gli account autorizzati nello script del foglio.

## Chiave di sistema (hub "Le mie app")

L'app entra da sola con la chiave salvata nell'hub. Se non ci riesce mostra il motivo e un campo
per scrivere la chiave (e scegliere chi sei) direttamente in Gestione Casa.
Nell'app Android "Le mie app" si entra solo con la chiave; nel browser resta anche l'accesso con Google.
Lato script: aggiungere `apps-script/Chiave.gs` come nuovo file, una riga in `gestisci()`
(`if (req.action === 'loginChiave') return loginChiave(req);`), eseguire `impostaChiave`
e pubblicare una nuova versione.

## Novità 1.9.0
- All'apertura non mostra più una casa vuota inventata: finché il foglio non risponde c'è "Carico le spese dal foglio…" (e "Riprova" se non risponde).
- Con la chiave dell'hub entra da sola senza far comparire l'accesso Google; Google compare solo se la chiave non basta.
- Se nel foglio mancano persone, case o categorie l'app si carica lo stesso (prima si bloccava aprendo la casa).
- Lista spese: all'apertura gli ultimi 3 mesi e "Mostra mesi precedenti" (con anni di spese la casa si apre ~8 volte più in fretta); ricerca nelle spese.
- Il pulsante ＋ compare solo nella lista spese e quando i pulsanti rapidi escono dallo schermo: non copre più importi, Insight e "Registra un rimborso".
- Iniziali di due lettere quando due persone iniziano con la stessa (Fe, Fr); righe delle bollette non più tagliate; barra del telefono chiara in modalità chiara.

Nota: lo script principale del foglio (Code.gs) non è in questo repository: ci sono solo il codice dell'app e `apps-script/Chiave.gs`.

## Stampa (app per la mamma)

Nella cartella `stampa/`: app per stampare bollette e foto dal telefono.
Il file resta sul telefono: nessun dato viene inviato o salvato online.
Indirizzo: https://fedethe7-dot.github.io/GestioneCasa/stampa/
