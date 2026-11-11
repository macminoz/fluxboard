# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/it/1.1.0/), versioni
[SemVer](https://semver.org/lang/it/).

## [Non rilasciato]

## [1.0.1-CURRENT] - 2026-11-08

### Aggiunto
- **Modalità pannello** (`pannello: true` in un profilo di display, attiva sul profilo `tsw`):
  sola lettura e leggera per i touch a muro. Niente comandi, maniglie, link che aprono schede,
  sfocature né animazioni continue; la telecamera passa a un fotogramma ogni 2 secondi
  (`/api/immagine?id=…&fotogramma=1`, l'ultimo fotogramma intero dello stream MJPEG).
- **Chi si collega**: Fluxboard ricorda gli schermi che aprono la pagina (indirizzo, browser,
  profilo) e con `schermi:` in global.yaml dà a ciascuno un profilo fisso, per indirizzo o per
  browser. In Impostazioni → Schermi si vedono e si sceglie il profilo con un menu.
- Ripieghi per i browser un po' vecchi (`public/compat.js` e un blocco `@supports` in stile.css).
- **Segnale di allerta in testata**: rosso lampeggiante quando una tile di qualunque workspace è in
  allerta grave (`colore_se` rosso o etichetta `allarmi`, oppure `allerta: grave|avviso|no` nella
  tile), giallo per gli avvisi. Click = elenco delle allerte e salto alla tile; suono leggero
  attivabile per browser. Notifiche push verso webhook/Node-RED/ntfy con `notifiche:` in global.yaml.
- **Giro dei workspace** (pulsante ↻): uno dopo l'altro ogni 30 secondi (`giro:` nel display o
  `?giro=45s`), senza ricaricare; si ferma da solo durante la modifica o con il puntatore sulle tile.
- **Storico degli ignorati** in ogni tile (pulsante «Ignorati · N»): da lì si riammette una riga.
- Ack e Ignora anche su «Syslog: error» (per messaggio).
- Giro dei workspace: menu con 15/30/60 secondi (ricordato nel browser), pulsante colorato con i
  secondi mentre gira; si sospende in Modifica e riparte all'uscita.
- **Versione in testata**, accanto al titolo in alto a sinistra (es. `v1.0.1-CURRENT`).
- **Ignora** accanto ad Ack nei Messaggi critici: un messaggio innocuo che non si sa risolvere
  sparisce per sempre, anche quando si ripete, dopo una conferma («Sei davvero sicuro…?»).
- **Ack e Ignora per le righe di qualunque tile** (operazioni `nascondi_riga`, `ignora_riga`,
  `ripristina_righe`, senza password): la riga si riconosce da un campo (es. `host`); Ack la
  nasconde per 24 ore, Ignora per sempre. Le usa «Chi scrive di più nel syslog». Le righe nascoste
  stanno in `cache/nascoste.json` e si tolgono prima di `elabora` (un `limita: 8` mostra sempre 8 righe).
- **Colonne delle tabelle allargabili**: si trascina il bordo destro dell'intestazione (doppio
  click = di nuovo automatica). La larghezza vale per il display in tutte le viste e si salva in
  `layout/<display>.yaml` come `colonne_tabella`; il testo che non ci sta finisce con «…».

### Cambiato
- Ack verde pallido, Ignora grigio scuro; «Righe nell'ultima ora» diventa «Ultima ora».
- Tolta la tile «Software installato»: gli aggiornamenti compaiono solo quando c'è da aggiornare.
- **Tempi compatti**: «20m fa», «3h fa», «2g fa» invece di «20 minuti fa».
- **Intensità dello sfondo indipendente dal gruppo**: se è scritta nella tile vale per tutte le
  sue tinte; 0% = nessuna tinta, nemmeno quella dell'etichetta.

### Corretto
- Pagina che si bloccava sui pannelli touch: a ogni dato nuovo si ridisegnavano tutte le tile
  (80-90 ms ogni pochi secondi anche su un Mac). Ora solo quelle cambiate, una volta per raffica di
  aggiornamenti (al massimo una al secondo in modalità pannello).
- Icone del riepilogo sparite sui browser senza `color-mix()` (Chrome prima della 111): lo sfondo
  diventava trasparente e restava solo il numero.
- Ack/Ignora non escono più dalla tile: colonna dei pulsanti stretta, pulsanti uno sotto l'altro
  quando manca spazio.
- Le disposizioni proprie di Allarmi e Completa perdevano l'altezza delle tile (`altezza` del file
  non diventava `altezza_px` nella pagina).

## [1.0.0-beta.1] - 2026-11-08 (fine della fase alpha)

### Aggiunto
- **Sezioni con un posto proprio** nella pagina (colonna e riga, come le tile): in Modifica si
  trascinano dall'intestazione dove si vuole, anche lasciando spazio libero a sinistra o sopra.
  Prima si mettevano per forza una dopo l'altra (una tile spostata a destra finiva nel gruppo
  accanto). Salvate nella disposizione (`sezioni: { etichetta: { colonne, x, y } }`).
- **Allarmi e Completa con una disposizione propria**: in Modifica si dispongono loro stesse
  (prima si passava a Media) e Riordina, spostamenti e misure fatti lì non toccano le altre viste
  (`layout/<display>--completa.yaml`). Finché non le si dispone, si ordinano da sole.
- **Colore delle etichette** scelto dalla stessa finestra dell'icona (matita della sezione o
  menu dell'etichetta); sei colori nuovi (rosa, ciano, indaco, lime, ambra, marrone): prima, finiti
  gli otto colori, le etichette nuove restavano grigie.
- **Software installato**: l'inventario completo (anche quello già aggiornato), nelle viste
  Avanzata e Completa. L'elenco dei software ora sta nella sorgente `versioni` ed è condiviso con
  Aggiornamenti disponibili; aggiunti Immich, nginx, lighttpd, Vector, llama.cpp, Node.js
  (Node-RED e Fluxboard), acme.sh, Proxmox VE e il centralino SIP. Nuove opzioni: `campo` come
  elenco (Immich: major, minor, patch) e `prefisso` per i tag.

### Cambiato
- L'editor non chiede più "da quale livello di lettura compare": dove compare una tile lo dice il
  👁 (le viste). Un `livello_minimo` già scritto resta valido.
- In Modifica la griglia rispetta le viste scelte per le tile (quelle fuori vista sono fra le
  Nascoste).

### Corretto
- **Memoria esaurita** (servizio ucciso il 7/11 alle 11:47): lo stream di una telecamera
  accumulava i fotogrammi per uno schermo che non li leggeva (telefono in background); oltre 1 MB
  di coda lo spettatore salta fotogrammi. Due schermi aperti insieme non aprono più due stream.
- **Arresto durante l'installazione**: un file appena copiato e non ancora leggibile fermava il
  controllo dei file della configurazione (errore non gestito): ora è solo un avviso.
- Due salvataggi quasi simultanei della disposizione usavano lo stesso file temporaneo e uno
  falliva ("ENOENT … rename").

## [1.0.0] - in corso (branch `1.0.0`; si torna indietro con il tag `v0.7.1`)

### Aggiunto
- **Generi di tile** (modelli): un genere dice quali **campi** chiedere e com'è fatta la tile
  (**modello**, con `{{campo}}`). Una tile di genere scrive solo `genere:`, i suoi `campi:` e i
  ritocchi, che vincono sul modello (gli oggetti si fondono). I propri in `config/generi/`, anche
  con **Salva come genere** da qualunque tile.
- alpha.2 — **Otto generi generici**, non legati a un dato: Andamento, Cronologia, Misura,
  Correlazione dati, Messaggi critici, Stream, Nota, Shell output. Il campo `tipo: dati` chiede
  sorgente e query di qualunque sorgente (il genere ne propone una con `preferita:`); un campo
  vuoto toglie anche le chiavi e i passi di `elabora` che lo usano; il valore di un campo può
  citarne un altro (`{{guasto}}` nelle colonne di Shell output).
- alpha.2 — **Aggiungi tile = Tile market**, diviso per genere: per ognuno "Da zero" (l'editor
  chiede i campi del genere) e le tile pronte del catalogo (`mercato.genere:`). In fondo "Componi
  una tile libera". Nomi delle sorgenti senza le parentesi.
- alpha.2 — Editor di una tile di genere: prima cosa mostra, poi titolo ed etichetta, il resto in
  "Altre impostazioni" (chiuso). Salvando si scrivono solo i campi cambiati: il file resta com'è.
- alpha.2 — Una sessantina di icone nuove per etichette e tile (casa, meteo, energia, sicurezza,
  homelab, media, tempo).
- alpha.2 — Vista **Completa**: aggiunte, visibili solo lì, le tile del market che mancavano
  (servizi critici, syslog, Node-RED, Proxmox, firewall, orologio), più Meteo e Promemoria.
- Nuove versioni: `link: https://github.com/…` basta al posto di `repo`.

### Cambiato
- alpha.2 — Le sezioni sono larghe quanto le loro tile (fuori da Modifica): niente spazio vuoto.
- alpha.2 — Tabelle ed elenchi senza barra di scorrimento: alti quanto il contenuto; se lunghi,
  "Riduci" (più grande) li comprime. La freccia per chiudere una tile è più grande.
- alpha.2 — Comandi della tile: ⚙ 👁 ⧉ ✕, allineati e uguali dentro e fuori da Modifica. Il 👁
  sceglie le viste e, in fondo, "Esclusa" (prima erano due occhi diversi).
- alpha.2 — Barra di Modifica riordinata: stato, poi Aggiungi tile · Nascoste (con il numero) ·
  Riordina, poi gli strumenti della dashboard e Fatto. Il vassoio "Non visibili adesso" non c'è
  più: "Nascoste" le mostra al loro posto, in trasparenza.
- alpha.2 — Riordina: tutte le tile della stessa misura (un terzo di pagina, due terzi le
  tabelle larghe), sezioni larghe quanto le loro tile.
- Le tile di casa che corrispondono a un genere sono state convertite (Aggiornamenti, Messaggi
  critici, Spazio disco, Telecamera ingresso, Consumi elettrici, Temperatura di una stanza, Valvole): espanse
  risultano identiche a prima.
- I file nuovi si scrivono in blocchi (non più su una riga).

### Corretto
- alpha.2 — Proxmox: "Spazio disco" fra le risorse del modulo (prima salvando dall'editor la
  tile tornava a leggere le VM). Una scelta che il modulo non conosce non si perde salvando.

## [0.7.1] - 2026-11-07

### Aggiunto
- Tile **chiusa** con un click (▾ sulla riga del titolo): resta solo il titolo; si salva nella
  disposizione (`chiusa: true`).
- **Duplica** (⧉) al passaggio del mouse, anche fuori da Modifica.
- Grafico: `tacche: 3h` per scegliere ogni quanto mettere un'ora sull'asse (Temperatura di una stanza).

### Cambiato
- Tile di testo e tabelle: l'altezza scelta è un **massimo**; se il contenuto è più corto la tile
  si stringe da sola. Allargando solo in orizzontale l'altezza resta automatica.
- Le pillole dei gruppi in testata compaiono anche quando c'è un solo gruppo (workspace piccoli).

### Corretto
- *Riduci/Mostra tutto* salvava la disposizione senza le posizioni: le tile si ridisponevano da capo.
- Nelle viste Allarmi e Completa (misure fisse) tirare l'angolo non cambiava niente ma salvava le
  misure: lì spostare e ridimensionare ora non si può.
- Le tacche dell'asse del tempo cadono sulle ore italiane (00, 03, 06…), non su quelle UTC.

## [0.7.0] - 2026-11-07

### Aggiunto
- **Viste per tile** senza aprire l'editor: 👁 al passaggio del mouse, scelta multipla fra Base,
  Media, Avanzata, Allarmi e Completa (`viste:` nel file; assente = in tutte, con le regole di
  sempre). In una vista scelta la tile compare sempre, anche in Allarmi.
- **Icona di un'etichetta** con una griglia di icone: matita accanto al nome della sezione in
  Modifica, e "Icona di «…»" nel menu dell'etichetta di una tile.
- Editor della tile **a tutta finestra** (⤢ nella testata): niente anteprima, codice e query alti
  quanto lo schermo; la scelta resta ricordata.

### Cambiato
- Spazio disco: gli storage sullo stesso disco uno per riga nella cella (le tabelle vanno a capo
  sui valori con più righe).
- Più spazio fra i comandi al passaggio del mouse (⚙ 👁 ✕) e il ritmo/link della tile.

## [0.6.1] - 2026-11-07

### Corretto
- Allarme pavimento: un messaggio con più zone ("Pavimento Ingresso" a riposo insieme a "Porta
  Blu" in allarme) veniva letto a metà e l'allarme restava acceso; ora ogni zona è una riga (unroll).
- In alto a destra della tile i comandi (rotella, ✕) non coprono più il ritmo e il link: questi
  si spostano accanto.
- Campi con un elenco (es. i software da controllare) mostrati in YAML come nel file, non in JSON.

### Cambiato
- Una tile si elimina anche fuori da Modifica: ✕ accanto alla rotella al passaggio del mouse
  (con Annulla nell'avviso).
- Editor della tile riordinato: ogni parte è una scheda, etichette e campi allineati; operatori
  come simboli (=, ≠, >, ≥, <, ≤); colori a pallini e "o come un'etichetta" in un menu.
- Consumi elettrici in kW (soglia 5,5 kW).

## [0.6.0] - 2026-11-07

### Aggiunto
- Tile **Consumi elettrici**: consumo di casa e produzione solare quasi in tempo reale (un punto
  al minuto, 6 ore) con la soglia del contatore a 5,5 kW; rossa sopra la soglia, gialla da 4,5 kW.
- Tile **Spazio disco**: nodi Proxmox, LXC accesi e storage (anche il NAS montato in Proxmox)
  sopra l'80% (giallo) e il 90% (rosso). Proxmox: risorsa `spazio`. Anche nel Tile market.
- Grafico: `soglie`, linee orizzontali di riferimento.
- Editor delle tile: le condizioni di "Colora la tile quando…" si compongono a righe (campo ·
  operatore · valore, unite da tutte/almeno una), con i campi dei dati veri; il colore si sceglie
  da campioni. Una condizione complessa resta modificabile come testo.
- Snapshot con nome obbligatorio, al massimo 5 (lo stesso nome sostituisce); automatici: gli ultimi 5.

### Cambiato
- Viste come icone nella testata, con il nome che si apre al passaggio del mouse; in Modifica
  restano solo Base/Media/Avanzata (entrando da Allarmi o Completa si passa a Media).
- Allarmi e Completa: gruppi affiancati, tile di misura fissa (un terzo di pagina, due terzi le
  "larghe"; stessa altezza, il contenuto scorre).
- *Riordina* rimette anche le misure standard delle tile (si può annullare).
- Messaggi critici: **Ack** al posto di Visto; un Ack sospende l'avviso per 24 ore, poi torna se
  il problema c'è ancora.
- Aggiornamenti disponibili: colonne *Installata qui* e *Online*; tolta la colonna *Come*.
- Una tile aggiunta dal Tile market si vede subito: la pagina entra in Modifica con le nascoste
  visibili e la evidenzia.
- Testata larga quanto la griglia delle tile; tolto il suggerimento nella barra di Modifica.
- Editor: anteprima allargabile con il divisore (larghezza ricordata), finestra più larga, il
  codice si allunga solo in verticale, lo scorrimento non passa più alla pagina sotto.

## [0.5.1] - 2026-11-07

### Cambiato
- Testata fissa: titolo, viste, workspace e Modifica restano in alto mentre si scorre (sfondo
  sfocato, bordo quando la pagina è scorsa); la barra di Modifica si aggancia subito sotto.

## [0.5.0] - 2026-11-07

### Aggiunto
- **Viste** al posto dei livelli: *Base*, *Media*, *Avanzata* (il dettaglio, come prima), più
  *Allarmi* (solo le tile con un allarme o un'attenzione in corso) e *Completa* (tutte le tile
  attive, per sezione e priorità). Allarmi e Completa si dispongono da sole senza toccare le
  posizioni salvate. `?vista=` nell'indirizzo, `vista:` nel profilo del display.
- **Tile sganciate**: una tile senza etichetta sta libera nella pagina, senza riquadro né
  intestazione (in Modifica: area tratteggiata *Senza gruppo*, dove trascinarla).
- **Intensità del colore** per tile (`intensita`, cursore nell'editor): quanto è forte il colore
  quando la tile si accende; predefinita 10%.
- `{campo:casella}`: un indirizzo email senza dominio (Node-RED: `mario@posta.lan` → `mario`).

### Corretto
- Una tile *ridotta* non si poteva ridimensionare (restava solo *Mostra tutto*): tirandone
  l'angolo smette di essere ridotta e prende l'altezza scelta.
- L'editor riconosce le tile senza sorgente di tipo interno (il centro avvisi) e non assegna
  più loro una sorgente a caso.

## [0.4.1] - 2026-11-07

### Cambiato
- Riga del titolo di ogni tile: a destra i periodi (6h · 12h · 24h, se la tile li ha), il **ritmo
  di lettura** in breve (`60s`, `5m`, `1h`; giallo se il dato è vecchio, al passaggio del mouse
  anche quando è stata letta) e la freccia del link. Tolti la riga "aggiornato … · si rilegge
  ogni …" e il fumetto che compariva in basso.
- Cronologia: colonne in fondo alle righe con intestazione (`in_fondo`), e lo `stato_se` degli
  elementi accesi sotto il grafico invece che in fondo alla riga.
- Valvole: per ogni stanza temperatura **Adesso** e **Obiettivo** (Heatpoint in vigore).

## [0.4.0] - 2026-11-07

### Cambiato
- **Disposizione rifatta da capo** (modello Grafana/Home Assistant): ogni tile ha una posizione
  esplicita (`x`, `y` nella disposizione) e la sua misura, e resta come la lasci. Spostando o
  ridimensionando, le tile urtate scendono (o si scambiano, oltre il loro centro) e poi tutto sale a
  chiudere i vuoti; nessuna tile cambia larghezza da sola. Algoritmo in `public/disposizione.js`,
  con i test (`npm test`). Le disposizioni senza posizioni si convertono da sole la prima
  volta, com'erano.
- Spostare in un'altra sezione: serve una breve sosta sopra la sezione (evidenziata), così
  attraversarne una non le cambia etichetta.
- Rosso degli allarmi più leggero (tinta, anello e battito), riquadri delle sezioni più tenui.

### Tolto
- Tile adattive (0.3.0): allargavano da sole le tile nello spazio libero e impedivano di
  stringerle; ridimensionando, toglievano colonne alle vicine.

### Corretto
- Avvisi di una tile eliminata o spenta: diventano "risolti" invece di restare attivi.

## [0.3.1] - 2026-11-07

### Aggiunto
- **Messaggi critici con conferma** (centro avvisi): le tile con un blocco `avvisi` vi mandano i
  loro problemi; la tile *Messaggi critici* li mostra finché non premi **Visto** (o *Visti
  tutti*). Lo stesso messaggio ripetuto è una riga sola con il numero di volte; un avviso
  confermato torna solo se il problema finisce e si ripresenta. Ci arrivano i messaggi gravi del
  syslog (tile `syslog-critici`, che non compare) e i servizi giù o con il certificato scaduto.
- Sonde: scadenza del certificato dei siti https; scaduto o entro 14 giorni = *attenzione*.
- `mostra_se: mai` (tile che raccoglie solo avvisi), azioni `subito: true` (senza conferma).
- Tile market: *Messaggi critici* e *Avvisi dal syslog*; log raggruppati anche negli altri modelli.

### Cambiato
- *Aggiornamenti disponibili* mostra solo i software con una versione nuova (sparisce se è
  tutto aggiornato).
- Tile market: gli esempi sono suggerimenti, non valori già scritti (*Usa l'esempio* per gli
  elenchi).

### Corretto
- Sezioni: le tile non prendono più lo sfondo pieno dall'etichetta (in *Allarmi* sembravano
  tutte in allarme) e hanno una superficie piena; lo sfondo resta per gli allarmi veri.
- La misura che segue il puntatore resta dentro la finestra anche sulla tile all'estrema destra.

## [0.3.0] - 2026-11-06

### Aggiunto
- **Tile market**: catalogo di 17 tile pronte (`catalogo/`), per categoria, da aggiungere
  scegliendo la sorgente e pochi parametri (validati prima di scrivere); scheda **Le tue tile** con
  un interruttore per accendere e spegnere ogni tile del workspace. Un modello per un'API esterna
  propone solo le sorgenti con quell'indirizzo, mai una con le credenziali di un altro servizio.
- **Grafico all-in-one**: una tile `grafico` può avere in testa le `voci` di una tile `valori`
  (lette dal punto più recente) e `fasce`, bande colorate nei tratti in cui una condizione era
  vera (es. valvola aperta), anche in legenda e nel mirino. `colore_se` su un grafico guarda
  solo il punto più recente.
- Temperatura di una stanza: valori e grafico delle 24 ore uniti in una tile sola, con i tratti in cui
  scaldava.

- Grafico più compatto: si disegna sui pixel veri della tile (scritte della loro misura anche in
  una tile stretta, tacche degli assi in base allo spazio); in una tile ad altezza fissa occupa
  l'altezza che resta invece di scorrere; la legenda sta sulla riga del titolo; i valori finali
  di due linee vicine non si sovrappongono più.

- **Tile `cronologia`**: una riga per elemento con le bande dei tratti in cui era acceso e lo
  stato di adesso in fondo (come la state timeline di Grafana, ma compatta). Prima tile:
  **Valvole, ultime 24 ore**, il pannello "Riscaldamento" della dashboard Elettrovalvole con
  temperatura, obiettivo e da quanto scalda per le stanze accese.

- **Sorgente Palo Alto (`panos`)**, in sola lettura: versione e firme, sessioni, porte,
  utenti GlobalProtect, HA. Solo comandi `show` scritti nel connettore.
- **Sorgente Nuove versioni (`versioni`)**: versione installata (letta dal servizio) contro
  l'ultima uscita su GitHub. Tile **Aggiornamenti software**.
- **Inventario delle sorgenti di casa** (`docs/inventario-sorgenti.md`): cosa c'è, cosa si
  legge già, cosa manca.
- Cronologia: `finestre` per scegliere il periodo (6h · 12h · 24h) dalla tile.
- Condizioni di tempo: `campo entro 5m`, `campo oltre 1h`. Passaggio `aggiungi` per righe di prova.
- Tile **Allarme pavimento** (Ksenia, dal syslog, ogni 5 s: rossa e pulsante per 2 minuti dallo
  scatto), **Host che non rispondono al ping**, **Ultimi log critici**, **Telecamera ingresso**.
- Indicatore di aggiornamento: al passaggio del mouse ogni tile dice ogni quanto si rilegge e
  quando l'ha fatto l'ultima volta (in avanzata anche nel piede).

- **Sorgente Node-RED** (plugin `node-red`): flussi e stato dei nodi come nell'editor, in sola
  lettura. Tile **Node-RED, nodi con problemi** e **MQTT SolarEdge** (un nodo solo).

- **Sorgente Sonde (`sonde`)**: Fluxboard controlla da sé se un servizio risponde (porta TCP,
  pagina web, server DNS), non solo se la macchina è accesa. Tile **Servizi critici**: DNS,
  firewall, centralino SIP, httpd, MQTT, Node-RED, Vaultwarden, CA, Proxmox, PBS, mail,
  VictoriaLogs, InfluxDB, Grafana.
- Aggiornamenti software: inventario completo (15 software, fra cui Node-RED, AdGuard Home,
  Inbucket, Technitium, Vaultwarden, n8n, Homebox). La versione installata si può leggere anche
  attraverso una sorgente con credenziali, da una pagina in base64, con la CA di casa; colonna
  *Come* (letta / scritta a mano).
- Tile **adattive**: una tile occupa lo spazio vuoto alla sua destra; ridimensionandone una, le
  vicine alla stessa altezza cedono o riprendono colonne invece di andare a capo o sovrapporsi.
- Testi: `{campo:nome}` (nome host breve, IP intatti) e `{a|b}` (il primo campo con un valore).
- `ordina` con più chiavi: `"-da_aggiornare, nome"`.

### Cambiato
- Testata su una riga: logo, una pillola-icona per sezione (il nome si apre al passaggio del
  mouse, il numero di avvisi sull'angolo), comandi a icona.
- Sezioni senza riga di intestazione: il nome è un'etichetta appoggiata sul bordo del riquadro.
- Trascinamento: la tile si solleva e segue il puntatore, al suo posto resta una sagoma
  tratteggiata, le altre scivolano al loro posto e al rilascio la tile si posa con un'animazione.
- Allarme pavimento: niente storico, compare solo quando un sensore è in allarme (per 1 minuto
  dall'ultimo scatto, per non perdere gli scatti brevi fra due letture) e poi sparisce.
- Sezioni compatte: nome della sezione piccolo, margini e spazi fra le tile ridotti.
- Tile allargabili oltre la sezione: tirando l'angolo la sezione si allarga con la tile.
- "Aggiungi una tile": due colonne affiancate (dati / contenuto fisso) con righe uguali; la
  cronologia sta fra le tile con dati.
- Sorgenti: finestra di misura fissa; galleria per categoria (*Syslog e log → VictoriaLogs*,
  *Firewall e rete → Palo Alto*…). La sorgente `victorialogs` si chiama ora `syslog`.
- Una tile accesa da `colore_se` con sfondo ora si vede da lontano: fondo pieno, bordo spesso,
  battito lento (fermo se il sistema chiede meno animazioni).

### Corretto
- Grafico: un campo vuoto non viene più disegnato come zero.
- Tabelle: l'allineamento si decide per colonna (prima `13.1.0` andava a destra e `v2.9.1` a
  sinistra nella stessa colonna).
- Ridimensionando una tile le altre si spostano subito (prima la tile si allargava sopra le
  vicine fino al rilascio).
- Ultimi log critici: solo il nome dell'host, o l'IP se manca.
- Nuove versioni: GitHub ricordato per un'ora e interrogato con ETag (non consuma il limite);
  `n8n@2.8.4` non viene più letto come "8"; una tile lenta in errore riprova dopo 5 minuti.

## [0.2.0] - 2026-11-04

### Aggiunto
- **Sezioni per etichetta** (`sezioni: true`): un riquadro sfumato del colore dell'etichetta (Temperatura,
  Infrastruttura…), nell'ordine delle etichette; si chiudono con un click, in Modifica si
  allargano (↔), si riordinano trascinandone l'intestazione e hanno un **+** per aggiungere una
  tile già etichettata. Le sezioni piccole si affiancano come quadranti.
- **Etichetta della tile** (`etichetta:`): pillole nell'editor con **+ Nuova**, menu sulla tile in
  Modifica, oppure trascinando la tile in un'altra sezione.
- **Riepilogo** in alto: una pillola per sezione, con il numero di tile in evidenza; il click
  porta alla sezione.
- **Spostare e ridimensionare senza entrare in Modifica**: al passaggio del mouse la presa ⠿ in
  alto sposta la tile, l'angolo ◢ la ridimensiona (con la misura vicino al puntatore).
- In Modifica il riquadro **Non visibili adesso** e l'interruttore *Mostra le nascoste*.

### Cambiato
- In Modifica la griglia resta quella vera: le tile nascoste non occupano posto, le tile hanno le
  stesse misure di sempre (comandi ed etichetta compaiono sopra al passaggio del mouse) e le
  sezioni vuote vanno in fondo.
- Dentro una sezione le tile non ripetono icona e nome dell'etichetta: l'icona sparisce (resta solo
  un'icona propria diversa), il titolo uguale al nome della sezione pure (resta la freccia ↗).
- Grafica: fondo con aloni di colore, superfici a vetro, alone del colore dell'etichetta
  nell'angolo di ogni tile, numeri che si adattano alla larghezza, tema scuro più profondo.
- "Argomenti" si chiamano **etichette** nella pagina; nei file `colore: <etichetta>` diventa
  `etichetta: <etichetta>` (il vecchio modo funziona ancora).

### Corretto
- Un indirizzo malformato (es. `//`) faceva cadere il server: ora risponde normalmente.

## [0.1.4] - 2026-11-04

### Aggiunto
- **Impostazioni della dashboard** (⚙ in modalità Modifica): titolo, livello e tema predefiniti,
  aggiornamento, "le tile senza niente da mostrare spariscono" (`nascondi_vuote`), argomenti con
  colore, icona, sfondo e ordine.
- "Sparisce quando non ha niente da mostrare" per ogni tile: vale anche per tile con righe ma tutti
  i valori vuoti e per le telecamere che non trasmettono (ricompaiono da sole).
- **Una tile in più workspace** (`anche_in`): dall'editor o dalla galleria "Da un altro workspace".
- **Includi / escludi** una tile con l'occhio in modalità Modifica (le escluse restano visibili,
  sbiadite, solo lì).
- **Rinomina** una sorgente, con aggiornamento automatico delle tile che la usano.
- **Priorità degli argomenti** e pulsante **Riordina le tile**, con Annulla.
- Barra a icone con il nome al passaggio del mouse; Workspace e Livello come menu a comparsa.
- Data e ora sotto il titolo.

### Cambiato
- Grafica: icone piene nel colore dell'argomento, fondo sfumato, tile cliccabili che si sollevano,
  tile in allerta con sfondo sfumato e icona pulsante, primo valore più grande.
- Argomenti predefiniti con gli allarmi in cima.

### Corretto
- "Spegni" (e ogni pulsante dentro una tile) apriva prima il link della tile.
- Mancava lo spazio fra le tile nel livello avanzato.
- In Impostazioni avanzate i nomi lunghi dei segreti sconfinavano sull'editor.
- Salvando dal modulo gli indirizzi lunghi venivano spezzati su due righe.
- Avviso inutile sulle tile elenco con `tabella`.

## [0.1.3] - 2026-11-04

### Aggiunto
- **Colore dai dati** (`colore_se`): la tile cambia colore e sfondo quando una condizione è vera,
  configurabile anche dall'editor ("Colora la tile quando…"). Temperatura di una stanza diventa rossa
  quando scalda.
- Condizioni che confrontano due campi (`fascia1 == {set}`).
- Voci raggruppate (`gruppo`) in un blocco secondario: le fasce del riscaldamento con il loro titolo
  e la fascia in vigore evidenziata; "Scalda da" quando la valvola è aperta.
- **Riduci / espandi** per le tile lunghe, con anteprima al passaggio del mouse che non sposta
  le altre tile; salvato nella disposizione.
- **Immagini attraverso Fluxboard** (`/api/immagine`): la telecamera si vede da qualunque rete e
  riceve una sola connessione; messaggio e nuovo tentativo se lo stream cade.
- Icone per argomento o per tile (`icona`).

### Cambiato
- Nuova grafica: carte più morbide, titoli leggibili con icona colorata al posto di strisce e
  maiuscole colorate, numeri più grandi, fondo pulito.

## [0.1.2] - 2026-11-04

### Aggiunto
- **Workspace**: `default` più quanti se ne vogliono, ognuno con tile e disposizioni proprie
  (`config/workspace/<nome>/`), sorgenti e segreti in comune. Uno nuovo è una pagina vuota con
  "+ Aggiungi la prima tile". Selettore in alto; eliminare un workspace lo mette nel cestino.
- **Snapshot ed export** (*✎ Modifica → ⟲ Snapshot*): fotografia di tutta la configurazione,
  ripristino completo (con snapshot automatico prima, quindi annullabile), download, import da
  file. Nessun segreto nei pacchetti, solo i loro nomi.
- Elenco come **tabella** (`tabella:`): colonne allineate, numeri a destra, toni per cella;
  editor con "+ Aggiungi una colonna". Riscaldamento, Proxmox e Servizi ora sono tabelle.
- Ruoli Proxmox generici `ReadOnly` e `PowerUser`, riusabili da altri strumenti; token di
  Fluxboard su `PowerUser`. Utente Technitium `fluxboard` con token.

### Cambiato
- Valori in colonne uguali e allineate; unità più piccole del numero, testi più leggeri delle
  misure; titoli delle tile e piè di pagina più ordinati.
- Logo, titolo e "/ Impostazioni avanzate" allineati sulla stessa riga.
- `deploy/installa.sh --anche-config` aggiorna anche tile, sorgenti, certificati e global.yaml
  (con copia di sicurezza), senza toccare disposizioni e segreti.

### Corretto
- Le righe Proxmox protette (firewall, DNS…) non mostrano più i pulsanti delle azioni.
- Il mirino del grafico restava visibile a sinistra (`hidden` non vale sugli elementi SVG).

## [0.1.1] - 2026-11-04

Configurazione più semplice e prime azioni.

### Aggiunto
- **Sorgenti come in Grafana**: *✎ Modifica → ⛁ Sorgenti* con galleria dei tipi, modulo generato
  per ogni tipo, **Prova connessione**, segreti salvati da soli fra i segreti. Nell'editor della
  tile la sorgente si sceglie raggruppata per tipo, con *+ Nuova sorgente*.
- Sorgente `http`: autenticazione (token Bearer, nell'indirizzo, in un'intestazione, utente e
  password), parametri fissi, metodo GET/POST.
- Connettore `proxmox` (VM/LXC e nodi; avvia, spegni, riavvia sugli ospiti, mai sui nodi) con
  verifica del certificato della CA di casa; tile *Chi consuma di più* e *VM e LXC spenti*.
- Tile *DNS, ultima ora* (Technitium) con modulo per aggiungere un record A con PTR.
- **Azioni** nelle tile: pulsanti per riga o per tile, con conferma, campi controllati sul
  server, password obbligatoria e registro nel log.
- Tipo di tile **grafico** (linee nel tempo in SVG, mirino, legenda, colori verificati per i
  daltonici): la temperatura di una stanza nelle 24 ore senza iframe e senza credenziali Grafana.
- **Colori per argomento** in `global.yaml` (`colore: temperatura`) e sfondo colorato.
- Condizioni in `mostra_se` di tile e voci: la stanza dice "acceso" solo quando scalda.
- *+ Aggiungi un valore* e *✕* nell'editor delle tile "valori"; mappe chiave → valore nei moduli.
- Galleria delle tile divisa in "Dati da una sorgente" e "Contenuto fisso".

### Cambiato
- "clic" → "click" nell'interfaccia.
- Salvare dal modulo non scrive più i valori predefiniti né riscrive le parti non toccate.
- La password dell'editor si può impostare da *Segreti* (vale anche per le azioni).

## [0.1.0] - 2026-11-04

Prima versione utilizzabile.

### Aggiunto
- Server Node.js senza build, con una sola dipendenza (`yaml`), aggiornamenti in tempo reale
  alla pagina (SSE) e ultimi dati buoni in cache se una sorgente non risponde.
- Configurazione divisa in file: `global.yaml`, una sorgente per file, una tile per file,
  disposizione per display. Validazione con rifiuto dei file errati, storico delle ultime 20
  versioni, cestino ripristinabile.
- Sorgenti: InfluxDB (Flux), VictoriaLogs (LogsQL), API HTTP/JSON, righe statiche; plugin in
  `plugin/`, fra cui `uptime-kuma` (stato dei monitor da una pagina di stato pubblica).
- Elaborazione dati: rinomina, scala, traduci, filtra, ordina, limita, seleziona.
- Tipi di tile: valori, valore, elenco, testo, orologio, immagine/telecamera, iframe.
- Tre livelli di lettura (base, intermedia, avanzata), profili display (browser, mobile, pannello touch,
  e-ink), tile che spariscono quando non hanno nulla da dire.
- Modalità Modifica sulla pagina: sposta, ridimensiona, duplica, elimina con annulla, crea da
  una galleria di tipi; editor della tile con anteprima dal vivo sui dati veri.
- Segreti modificabili da /config in sola scrittura (`config/segreti.env`, fuori da git).
- Colori per tile e toni per singolo valore; tema chiaro/scuro; icona.
- Installazione su LXC con `deploy/installa.sh` (aggiorna il codice senza toccare la
  configurazione viva) e unità systemd sulla porta 80.
- Guida di configurazione (`docs/guida-configurazione.md`) e istruzioni per agenti (`AGENTS.md`).
