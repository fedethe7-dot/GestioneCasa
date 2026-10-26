# 🏠 Gestione Casa

Web app (PWA) per tenere traccia delle spese di casa in famiglia, in stile Tricount:

- 🛒 spesa supermercato, 💡 bollette (luce, gas, acqua, internet, TARI) e altre voci con emoji
- chi ha pagato e per chi, con divisione in parti uguali o importi a scelta
- ⚖️ saldi in tempo reale e "come pareggiare" con il minor numero di rimborsi
- 📊 insight: andamento mese per mese, categorie, bollette, chi ha pagato
- più case gestibili

In questo repository c'è **solo il codice** dell'app: nessun dato.
I dati vengono salvati in un foglio Google privato e sono visibili solo agli account autorizzati.

Accesso con Google: possono entrare solo gli account autorizzati nello script del foglio.

## Chiave di sistema (hub "Le mie app")

L'app entra da sola con la chiave salvata nell'hub; l'accesso con Google resta disponibile.
Lato script: aggiungere `apps-script/Chiave.gs` come nuovo file, una riga in `gestisci()`
(`if (req.action === 'loginChiave') return loginChiave(req);`), eseguire `impostaChiave`
e pubblicare una nuova versione.
