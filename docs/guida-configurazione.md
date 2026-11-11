# Guida alla configurazione

[English](guide.md) · **Italiano**

Riferimento completo di Fluxboard: tutto ciò che si può scrivere nei file YAML, con esempi
pronti da copiare. Vale per chi modifica a mano, dall'editor web o tramite un'IA.

**Chiavi in italiano o in inglese.** Ogni chiave e ogni valore di un elenco fisso si può scrivere
in italiano o in inglese (`titolo` o `title`, `tipo: elenco` o `type: list`), anche mescolati
nello stesso file: l'elenco completo delle corrispondenze è in `server/alias.js` e la
[guida inglese](guide.md) usa le chiavi inglesi. I nomi dei campi dei dati non si traducono mai.
L'editor continua a scrivere un file nella lingua in cui è già scritto.

> **Regola d'oro:** una tile = un file. Aggiungere o togliere un'informazione non tocca mai le
> altre tile né il codice. Se un file è sbagliato viene rifiutato e resta in vigore la versione
> precedente: la pagina non si rompe.

---

## 1. Dove sta cosa

```
config/
├── global.yaml           la cornice: titolo, fuso, livello, display
├── sorgenti/<nome>.yaml  DA DOVE si leggono i dati (un database, un'API…)
├── tile/<id>.yaml        COSA si mostra e COME (una tile per file; il nome del file è l'id)
├── layout/<display>.yaml ordine e dimensioni sul display (scritto dalla modalità Modifica)
├── workspace/<nome>/     gli altri workspace: tile/ e layout/ propri (vedi sotto)
├── certificati/          certificati pubblici delle CA (es. per Proxmox)
├── .snapshot/            snapshot della configurazione (ripristinabili)
├── .storico/             ultime 20 versioni di ogni file (ripristinabili dall'editor)
└── .cestino/             file eliminati (ripristinabili)
├── segreti.env           token e password (fuori da git): si cambiano da /config → Segreti
.env                      variabili del server (porta, password dell'editor); anche segreti, in alternativa
```

**Workspace.** Le tile e le disposizioni in `tile/` e `layout/` sono il workspace `default`.
Un workspace nuovo (*Workspace → + Nuovo workspace…* in alto) è una pagina vuota da riempire:
le sue tile stanno in `workspace/<nome>/tile/`, le disposizioni in `workspace/<nome>/layout/`;
sorgenti, segreti e cornice sono in comune. Si apre con `?workspace=<nome>`; eliminandolo
finisce nel cestino.

**Snapshot ed export.** *✎ Modifica → ⟲ Snapshot*: uno snapshot fotografa tutta la
configurazione (non i segreti); prima di una prova se ne crea uno e, se la prova va male,
*Ripristina* riporta tutto com'era, file nuovi compresi (finiscono nel cestino). Anche il
ripristino si annulla: prima ne viene fatto uno automatico. *Esporta* scarica lo stesso
pacchetto come file JSON, *Importa* lo carica (anche su un'altra installazione: lì vanno poi
reimpostati i segreti).

Il flusso di ogni tile è sempre lo stesso:

```
sorgente  ──query/url──▶  righe  ──elabora──▶  righe pulite  ──testo/voci──▶  quello che vedi
```

Una **riga** è un oggetto con dei campi, per esempio `{ stanza: "Sala", live: 21.2, set: 21.5 }`.
Una sorgente restituisce zero, una o più righe; la tile decide come mostrarle.

I file si ricaricano da soli quando cambiano: non serve riavviare.

---

## 2. global.yaml

| Chiave | Valori | Significato |
|---|---|---|
| `titolo` | testo | Titolo in alto a sinistra e della scheda del browser |
| `lingua` | `en` · `it` | Lingua dell'interfaccia, di date e numeri (predefinita `en`) |
| `fuso` | es. `Europe/Rome` | Fuso orario per `{campo:ora}` e `{campo:data}` |
| `livello` | `base` · `intermedia` · `avanzata` | Livello di lettura predefinito |
| `tema` | `auto` · `chiaro` · `scuro` | `auto` segue il sistema |
| `aggiornamento` | durata | Ogni quanto rileggere le sorgenti se la tile non dice `ogni` |
| `editor` | `true` · `false` | `false` disattiva le modifiche dalla pagina |
| `azioni` | `true` · `false` | `false` disattiva tutte le azioni (§5b), anche se le tile le dichiarano |
| `nascondi_vuote` | `true` · `false` | Predefinito `true`: le tile con dati spariscono quando non hanno niente da mostrare (nessuna riga o tutti i valori vuoti). Ogni tile può cambiarlo |
| `sezioni` | `true` · `false` | Predefinito `true`: le tile si raggruppano in **una sezione per etichetta** (vedi sotto) |
| `argomenti` | `{ nome: { colore, icona, sfondo } }` | Le **etichette** delle tile (il nome della chiave è rimasto quello della 0.1) |
| `display.<nome>` | vedi sotto | Profili dei dispositivi |

Le chiavi principali si cambiano anche dalla dashboard: *✎ Modifica → ⚙ Impostazioni*.

**Etichette e sezioni.** Ogni tile ha un'etichetta (`etichetta: temperatura`) e da lei prende
colore, icona e sfondo; cambiando qui il colore di un'etichetta cambiano tutte le sue tile. Con
`sezioni: true` la dashboard è divisa in sezioni, una per etichetta, come la vista "Sections" di
Home Assistant: *Temperatura* con tutte le tile di temperatura, *Infrastruttura* con le sue, e
così via; le tile senza etichetta vanno in *Altro*. Una sezione senza tile visibili sparisce.
Dentro una sezione le tile non ripetono quello che dice già l'intestazione: niente icona
dell'etichetta e niente titolo se è uguale al nome della sezione (una tile "Meteo" nella sezione
Meteo mostra solo i valori).

```yaml
sezioni: true
argomenti:                               # = le etichette, nell'ordine delle sezioni
  allarmi: { colore: rosso, sfondo: true, icona: allarme }
  temperatura: { colore: arancio, icona: termometro }
  statistiche: viola                     # anche solo il colore
```

Colori disponibili: `blu` `azzurro` `verde` `giallo` `arancio` `rosso` `viola` `rosa` `ciano` `indaco` `lime` `ambra` `marrone` `grigio`.
**L'ordine delle etichette è l'ordine delle sezioni** e la priorità di *Riordina le tile*. Si
cambia con ↑ ↓ nelle Impostazioni o trascinando l'intestazione di una sezione in Modifica.

Di solito non serve scrivere niente di tutto questo a mano:
- l'etichetta di una tile si sceglie nel suo editor (pillole in alto, con **+ Nuova**), dal menu
  dell'etichetta sulla tile in Modifica, oppure **trascinando la tile in un'altra sezione**;
- un'etichetta nuova creata così prende da sola il primo colore libero; icona e sfondo si
  aggiungono poi nelle Impostazioni.

In alto la riga di **riepilogo** ha una pillola per sezione (con il numero di tile, o di quelle
in evidenza per `colore_se`): il click porta alla sezione. L'intestazione di una sezione la
chiude e la riapre (lo stato resta nel browser).

Profilo di un display (`?display=<nome>` nell'indirizzo; senza, il browser sceglie `mobile`
sotto i 700 px e altrimenti il primo):

```yaml
display:
  browser: { colonne: 12 }
  pannello: { colonne: 6, livello: base, controlli: false, pannello: true }
  eink:    { colonne: 4, livello: base, controlli: false, escludi: [telecamera-ingresso] }
```

`controlli: false` nasconde selettore di livello e pulsante Modifica. `escludi` toglie tile da
quel display. `pannello: true` rende il display **in sola lettura e leggero**, per i touch a muro:
niente comandi di modifica, niente link che aprono schede, niente sfocature né animazioni continue,
telecamere a un fotogramma ogni 2 secondi. In *Impostazioni → Schermi* si vede chi si collega
(indirizzo e browser) e si assegna un profilo a ogni schermo (`schermi:` in `global.yaml`).

**Durate**: `30s`, `5m`, `1h`, `2d`.

---

## 3. Sorgenti (`config/sorgenti/<nome>.yaml`)

Una sorgente dice **come collegarsi**; la tile dice **cosa chiedere**. Così dieci tile possono
usare lo stesso database senza ripetere indirizzo e token.

**Dalla dashboard** (consigliato): *✎ Modifica → Sorgenti* (icona del database), oppure *+ Nuova sorgente* nel
menu della sorgente di una tile. Come in Grafana si sceglie prima il **tipo** (API HTTP,
InfluxDB, VictoriaLogs, Uptime Kuma, Proxmox…), poi si compila il suo modulo e si usa
**Prova connessione** prima di salvare. I token scritti nel modulo finiscono da soli fra i
segreti. **Rinomina…** cambia il nome di una sorgente e aggiorna da sé tutte le tile che la usano,
in ogni workspace. Le chiavi qui sotto servono a chi scrive il YAML a mano.

I segreti si scrivono come `${NOME}` nella sorgente; il valore si imposta da
**Impostazioni avanzate → Segreti** (sola scrittura: il valore non viene più mostrato, solo le
ultime 4 cifre per riconoscerlo) e finisce in `config/segreti.env`, escluso da git. Quando un
token scade basta incollare il nuovo: le tile che lo usano si rileggono subito. Il validatore
avvisa se trova un token scritto in chiaro in una sorgente.

Usare **indirizzi IP**, non nomi: se il DNS è giù, la dashboard deve funzionare lo stesso.

### `influx` — InfluxDB 2.x (query Flux)

```yaml
tipo: influx
url: http://192.168.1.30:8086
org: casa
token: ${INFLUX_TOKEN}
timeout: 15s
```

Nella tile: `dati.query` = una query Flux. **Ogni record della risposta diventa una riga**,
con le colonne come campi. Consiglio: finire la query con `pivot` per avere una riga con tutti
i campi che servono (vedi ricette).

### `logsql` — VictoriaLogs

```yaml
tipo: logsql
url: http://192.168.1.35:9428
```

Nella tile: `dati.query` (LogsQL), `dati.limite` (predefinito 100). Ogni riga di log è una riga.

### `http` — qualunque API JSON

```yaml
tipo: http
url: http://192.168.1.1/                 # base, facoltativa
autenticazione:                           # facoltativa
  tipo: parametro                         # nessuna | bearer | parametro | intestazione | basic
  nome: token                             # nome del parametro (?token=…) o dell'intestazione
  segreto: ${DNS_TECHNITIUM_SEGRETO}      # utente: … solo per basic
parametri: { lingua: it }                 # aggiunti a ogni richiesta, facoltativi
intestazioni: { X-Client: fluxboard }     # facoltative
timeout: 10s
```

Nella tile:

| Chiave | Significato |
|---|---|
| `dati.url` | Percorso relativo alla base (o URL completo) |
| `dati.metodo` | `GET` (predefinito) o `POST` per le API che leggono con un corpo; `dati.corpo` per il JSON. Una tile si rilegge da sola, quindi **legge e basta**: PUT/PATCH/DELETE si fanno con le azioni (§5b) |
| `dati.parametri` | `{ nome: valore }` aggiunti all'indirizzo |
| `dati.elenco` | Dove sta l'array nella risposta (es. `data.items`): un elemento = una riga |
| `dati.campi` | `{ nome: percorso }` per estrarre solo ciò che serve (es. `temp: current.temperature_2m`) |

Senza `elenco` la risposta intera è una riga. I percorsi usano il punto: `a.b.c`, `lista.0.nome`.

### `statico` — righe scritte a mano

Non serve un file sorgente. Nella tile:

```yaml
dati:
  tipo: statico
  righe:
    - { testo: "Cambiare il filtro della VMC" }
```

### `proxmox` — VM e LXC del cluster

```yaml
tipo: proxmox
url: https://192.168.1.2:8006
utente_token: fluxboard@pve!dashboard     # Datacenter → Permessi → Token API
segreto: ${PROXMOX_SEGRETO}
certificato_ca: certificati/home-root-ca.pem   # file in config/; vuoto = certificati di sistema
nome_certificato: pve.casa.lan        # ci si collega per IP ma si verifica il nome
protetti: [100, 101]                     # ospiti su cui nessuna azione è ammessa
```

Nella tile: `dati.risorsa` = `ospiti` (VM e LXC) o `nodi`. Righe degli ospiti: `id`, `nome`,
`tipo` (VM/LXC), `nodo`, `codice` (running, stopped…), `stato` (acceso, spento…), `cpu` (% dei
core assegnati), `core`, `memoria` (%), `memoria_gb`, `memoria_max_gb`, `acceso_da`, `tag`, `protetto` (gli ospiti in `protetti`:
nelle tile conviene `quando: "!protetto"`, così il pulsante non compare nemmeno).
Azioni: `avvia`, `spegni` (pulito, 2 minuti per chiudersi), `riavvia`. **Sui nodi nessuna
azione**, per scelta: il token va creato con un ruolo senza `Sys.PowerMgmt`.

`dati.risorsa: spazio`: lo spazio occupato di nodi, LXC accesi e storage (anche quelli condivisi,
come un NAS montato in NFS o PBS: gli storage sullo stesso disco diventano una riga sola). Righe:
`nome`, `tipo` (Nodo, LXC, Storage, Storage condiviso), `dove`, `usato_gb`, `totale_gb`,
`libero_gb`, `percentuale`, `codice` (1 ok, 2 dall'80%, 0 dal 90%). Le VM non ci sono: Proxmox ne
conosce l'occupazione solo con il *guest agent*.

### `uptime-kuma` — stato dei monitor

`url` della sorgente e `dati.pagina` (slug di una pagina di stato pubblica). Una riga per
monitor: `nome`, `codice` (0 giù, 1 ok, 2 in attesa, 3 manutenzione), `stato`, `msg`, `dal`,
`uptime`.

### `panos` — firewall Palo Alto (sola lettura)

`url` di gestione, `chiave` (chiave API, da Segreti) e, come Proxmox, `certificato_ca` +
`nome_certificato`. `dati.risorsa`: `sistema` (versione, firme, uptime), `sessioni` (attive,
occupazione %, cps, kbps), `interfacce` (una riga per porta: `nome`, `stato` up/down, `velocita`),
`globalprotect` (utenti collegati), `ha`. Il connettore manda **solo** questi comandi `show`,
scritti nel codice: nessuna tile può configurare o riavviare il firewall. La chiave va creata per
un amministratore con ruolo di sola lettura (XML API: solo *Operational Requests*).

### `versioni` — nuove versioni dei software (GitHub)

Una riga per software: `nome`, `installata`, `ultima`, `uscita`, `da_aggiornare` (true/false),
`stato` (*aggiornato*, *da aggiornare*, *installata sconosciuta*…), `link`, `come` (*letta* dal
servizio o *scritta a mano*). Le anteprime (rc, beta) non contano; `ramo` tiene su una serie
(InfluxDB `v2.`); `tag: true` per i progetti che pubblicano solo tag e non release (Mosquitto).

La versione installata:

| Scrittura | Quando |
|---|---|
| `installata: "2.4.0"` | il servizio non la dice: scritta a mano, da aggiornare dopo ogni upgrade |
| `{ url, campo: version }` | API JSON senza credenziali (`campo` è un percorso: `build.version`) |
| `{ url, cerca: "tags-(v[0-9.]+)" }` | testo qualsiasi (metriche, pagine): il primo gruppo |
| `{ sorgente: adguard, url: control/status, campo: version }` | attraverso una sorgente `http`, con le sue credenziali |
| `{ url, cerca: …, decodifica: base64, campo: release }` | valore in base64 dentro una pagina (n8n) |
| `certificato_ca: certificati/home-root-ca.pem`, `nome_certificato: …` | https con la CA di casa |
| `verifica_certificato: false` | solo per leggere un numero da un certificato scaduto |

```yaml
dati:
  sorgente: versioni
  software:
    - { nome: Grafana, repo: grafana/grafana, installata: { url: "http://192.168.1.31:3000/api/health", campo: version } }
    - { nome: AdGuard Home, repo: AdguardTeam/AdGuardHome, installata: { sorgente: adguard, url: control/status, campo: version } }
    - { nome: Uptime Kuma, repo: louislam/uptime-kuma, installata: "2.4.0" }
```

Senza token GitHub concede 60 letture l'ora **per IP pubblico** (tutta la casa). Le risposte si
ricordano per un'ora e poi si chiede solo "è cambiato?", che GitHub non conta: `ogni: 1h` va
bene anche con decine di software. Se GitHub rifiuta tutto, la tile tiene l'ultimo dato buono.

### `sonde` — il servizio risponde? (porte, siti, DNS)

Fluxboard controlla da sé, ogni volta che la tile si rilegge. La sorgente non ha parametri; i
servizi stanno nella tile, ognuno con `nome`, `gruppo` facoltativo e uno fra:

| Controllo | Esempio | Va bene se |
|---|---|---|
| `tcp` | `tcp: "192.168.1.5:5060"` | la porta accetta la connessione |
| `http` | `http: "http://192.168.1.10/"`, `contiene: current.mp4`, `atteso: 200` | codice < 400 (o `atteso`) e, se c'è, il testo nella pagina |
| `dns` | `dns: 192.168.1.1`, `risolve: dns.casa.lan` | il server risolve quel nome |

`attesa` (predefinita 3s) è il tempo massimo di una sonda; `verifica_certificato: false` per un
sito https con certificato autofirmato o scaduto. Righe: `nome`, `gruppo`, `tipo`, `bersaglio`,
`codice` (1 ok, 2 attenzione, 0 giù), `stato`, `ms`, `dettaglio` (*porta chiusa*, *nessuna
risposta*…), `certificato_scade`, `certificato_giorni`.

**Certificati.** Per i siti https la sonda legge sempre la scadenza del certificato, anche con
`verifica_certificato: false`: scaduto o in scadenza entro `avviso_certificato` giorni (predefinito
14) il servizio è *attenzione* (`codice: 2`), con la data nel dettaglio.

### `node-red` — flussi e stato dei nodi (plugin)

`url` (es. `http://192.168.1.40:1880`), `utente`/`password` solo se Node-RED ha `adminAuth`.
`dati.risorsa`: `stati` (i nodi con un pallino di stato), `nodi` (tutti), `flussi`. Righe dei nodi:
`id`, `nome`, `tipo`, `flusso`, `disattivato`, `stato` (*connesso*, *in connessione*, testo del
nodo…), `colore`, `codice` (1 verde, 2 giallo, 0 rosso, 3 blu/grigio). Per un nodo solo:
`elabora: [ { filtra: "nome == SolarEdge" } ]`.

### Categorie nella galleria

Nella galleria delle sorgenti i tipi sono raggruppati per **cosa si legge** (*Syslog e log*,
*Metriche e sensori*, *Monitoraggio*, *Firewall e rete*, *Virtualizzazione*, *Software e
aggiornamenti*, *Web e API*) e dentro ogni categoria c'è il prodotto che lo fornisce: il syslog
di casa sta in VictoriaLogs, quindi *Syslog e log → VictoriaLogs*. L'elenco di cosa c'è in casa e
con quale connettore si legge è in `docs/inventario-sorgenti.md`.

### Nuovi tipi di sorgente

Per formati che nessun tipo copre (MQTT, SNMP…) si aggiunge un file JavaScript in `plugin/`:
vedi `plugin/LEGGIMI.md`. Un connettore dichiara anche il proprio modulo (`moduloSorgente`,
`moduloDati`), così compare da solo nella galleria delle sorgenti con i campi giusti.

---

## 4. Tile (`config/tile/<id>.yaml`)

### Chiavi comuni a tutti i tipi

| Chiave | Valori | Predefinito | Significato |
|---|---|---|---|
| `titolo` | testo o per livelli | id | `""` = nessuna intestazione |
| `tipo` | vedi §5 | — | **obbligatorio** |
| `etichetta` | un'etichetta di `global.yaml` | nessuna | Sezione, colore, icona e sfondo della tile (§2). Le tile 0.1 con `colore: <etichetta>` valgono ancora come etichetta |
| `colore` | un colore | quello dell'etichetta | Un colore diverso da quello dell'etichetta |
| `sfondo` | `true` · `false` | quello dell'etichetta | Tinge anche il fondo della tile |
| `icona` | `termometro` `fiamma` `sole` `nuvola` `fulmine` `casa` `server` `rete` `allarme` `grafico` `telecamera` `dns` `orologio` `nota` | quella dell'argomento | Icona accanto al titolo, nel colore della tile |
| `colore_se` | `{ "<condizione>": colore }` | — | **Il colore segue i dati**: quando la condizione è vera (su almeno una riga) la tile prende quel colore e lo sfondo, es. `"valvola == acceso": riscaldamento`. Vince la prima vera. Il valore può essere un colore, un argomento o `{ colore, sfondo: false }` |
| `viste` | `[base, allarmi]` | tutte | In quali viste compare la tile (Base, Media, Avanzata, Allarmi, Completa): fuori da quelle no, in quelle sempre. Dalla dashboard: 👁 al passaggio del mouse |
| `intensita` | `10` (percentuale, 0–100) | `10` | Quanto è forte il colore quando la tile si accende per `colore_se`: tinta di fondo, anello e alone. Dall'editor: cursore *Intensità del colore quando si accende* |
| `etichetta` | nome di un'etichetta o assente | — | La sezione della tile. **Senza etichetta la tile è sganciata**: sta libera nella pagina, senza riquadro (in Modifica: area *Senza gruppo*) |
| `priorita` | numero | 50 | Ordine per le tile non ancora nella disposizione (più alto = prima) |
| `larghezza` | `stretta` (¼) · `media` (½) · `larga` (intera) | `stretta` | Larghezza iniziale; poi si regola trascinando |
| `ogni` | durata | `aggiornamento` | Ogni quanto rileggere la sorgente |
| `scadenza` | durata | 3 × `ogni` | Oltre questa età i dati appaiono sbiaditi |
| `mostra_se` | `dati` · `sempre` · `mai` · una condizione | da `nascondi_vuote` | `mai` = legge ma non compare (solo per raccogliere avvisi, §5c); `dati` = **la tile sparisce se non ha niente da mostrare** (nessuna riga, tutti i valori vuoti; per un'immagine: stream che non arriva, e ricompare da sola); con una condizione (`"valvola == acceso"`) compare solo se almeno una riga la rispetta. Nell'editor: "Sparisce quando non ha niente da mostrare" |
| `livello_minimo` | `base` · `intermedia` · `avanzata` | `base` | Sotto questo livello la tile non compare |
| `link` | URL | — | Tutta la tile diventa cliccabile (es. la dashboard Grafana completa) |
| `attiva` | `false` | — | Tile salvata ma esclusa: si vede solo in Modifica con "Nascoste" (👁 sulla tile → Esclusa) |
| `anche_in` | elenco di workspace | — | **La stessa tile anche in altri workspace** (stesso file: modificarla la cambia ovunque). Dall'editor: "Mostra anche nei workspace"; dalla galleria: "Da un altro workspace" |
| `dati` | vedi §3 | — | Cosa leggere e da quale sorgente |
| `elabora` | elenco di passaggi | — | Pulizia dei dati (§6) |
| `azioni` | elenco | — | Pulsanti che fanno qualcosa (§5b) |

### Testi per livello

Ogni testo (`titolo`, `riga`, `testo`, `etichetta`, `valore`) può essere una stringa sola
oppure uno per livello. Se un livello manca si usa il più vicino (prima verso il basso):

```yaml
testo:
  base: "{temperatura:0}°"
  avanzata: "{temperatura:1}° · aggiornato {quando:rel}"
```

---

## 4b. Generi (modelli di tile)

Un **genere** è un modello generico: dice *come* si mostra un dato (Andamento, Cronologia,
Misura, Correlazione dati, Messaggi critici, Stream, Nota, Shell output). *Aggiungi tile* è diviso
per genere: "Da zero" apre l'editor con i soli campi del genere (da dove, colonne, filtro…),
oppure si sceglie una tile pronta del catalogo di quel genere.

```yaml
# config/tile/aggiornamenti.yaml
genere: correlazione
titolo: Aggiornamenti disponibili
campi:
  dati:
    sorgente: versioni
    software:
      - { nome: Grafana, link: "https://github.com/grafana/grafana", installata: { url: "http://…/api/health", campo: version } }
  colonne:
    - { etichetta: Software, valore: "{nome}" }
    - { etichetta: Installata, valore: "{installata}" }
  filtro: da_aggiornare == true
  evidenzia: da_aggiornare == true
ogni: 2h          # un ritocco: vince sul modello (gli oggetti si fondono, gli elenchi si sostituiscono)
```

I generi di base stanno in `generi/` (con il programma); i propri in `config/generi/`, dove un file
con lo stesso nome sostituisce quello di base. Il formato è in `generi/LEGGIMI.md`. Da qualunque
tile, nell'editor, **Salva come genere…** crea un genere con quella tile come modello: poi si
aggiungono i campi da chiedere e si scrive `{{nome}}` nel modello dove vanno.

## 5. Tipi di tile

### `valori` — più numeri affiancati con etichetta *(il più leggibile, da preferire)*

Usa la **prima riga** dei dati. Ogni voce: etichetta piccola sopra, valore grande sotto, in
colonne tutte uguali (al massimo 4 per riga, 2 se la tile è stretta). In un valore come `840 W`
l'unità è più piccola del numero; un valore che non è un numero ("pioggia debole") si scrive
più piccolo, per non pesare quanto una misura.

```yaml
tipo: valori
voci:
  - etichetta: Adesso
    valore: "{live:1}°"
  - etichetta: Riscaldamento
    valore: "{valvola}"
    tono: caldo
    mostra_se: "valvola == acceso"   # la voce compare solo quando scalda
  - etichetta: Fasce di oggi
    valore: "{f1:1}° · {f2:1}°"
    livello: avanzata          # questa voce compare solo da "avanzata"
```

| Chiave della voce | Significato |
|---|---|
| `etichetta` | Testo piccolo; accetta `{campo}` |
| `valore` | Testo grande; accetta `{campo}` |
| `livello` | Livello minimo per mostrare la voce |
| `tono` | Colore del valore: un nome fisso (`tono: ok`) oppure `{ "<condizione>": <nome> }`, vince la prima vera |
| `mostra_se` | Condizione sulla riga: la voce compare solo se è vera (es. non dire "spento") |
| `gruppo` | Titolo di un blocco secondario: le voci con lo stesso `gruppo` vanno sotto, separate, con valori più piccoli (es. le fasce del riscaldamento) |

Nell'editor *+ Aggiungi un valore* aggiunge una voce, *✕* la toglie.

Toni: `ok` (verde), `attenzione` (ambra), `allarme` (rosso), `caldo` (arancio), `freddo` (blu),
`info` (accento), `spento` (grigio). Le condizioni sono quelle di §7.

### `grafico` — linee nel tempo

Disegnato da Fluxboard (nessun iframe, nessuna credenziale): un solo asse, legenda con due o più
linee, valore finale accanto a ogni linea, mirino al passaggio del mouse. La query deve dare
**una riga per istante** con il campo del tempo e un campo per linea (in Flux: `pivot` su `_time`).

```yaml
tipo: grafico
asse: _time            # campo del tempo (predefinito _time)
unita: "°"
decimali: 1
serie:                 # al massimo 3 linee per grafico
  - { campo: live, etichetta: Temperatura }
  - { campo: set, etichetta: Obiettivo, gradino: true }   # gradino: cambia a scatti (setpoint)
```

**Tutto in una tile.** Un grafico può avere anche:

- `voci` — le stesse di una tile `valori` (con `mostra_se`, `tono`, `livello`), mostrate sopra
  il grafico e lette dal **punto più recente**: com'è adesso e com'è andata, in una tile sola;
- `fasce` — i tratti di tempo in cui una condizione era vera, come bande colorate dietro alle
  linee (in legenda e nel riquadro del mirino). Ogni punto vale fino al successivo; servono
  quindi campi "di stato" su ogni riga (in Flux: `fill(usePrevious: true)` dopo il `pivot`).

Anche `colore_se`, su un grafico, guarda solo il punto più recente. La legenda sta sulla riga
del titolo e il disegno si adatta allo spazio della tile: con un'altezza fissa prende quella che
resta, senza barre di scorrimento. I valori in fondo alle linee sono già "com'è adesso": di
solito basta una voce per lo stato (es. da quanto scalda), non serve ripeterli in testa.

```yaml
voci:
  - { etichetta: Adesso, valore: "{live:1}°" }
  - { etichetta: Scalda da, valore: "{dal:durata}", tono: caldo, mostra_se: valvola == acceso }
fasce:
  - { se: valvola == acceso, etichetta: Scalda, tono: caldo }   # tono: ok, attenzione, allarme, caldo, freddo, info, spento
colore_se:
  "valvola == acceso": riscaldamento
```

Esempio completo: `config/tile/grafico-margherita.yaml`.

`tacche: 3h` fissa ogni quanto compare un'ora sull'asse del tempo (senza: quante ne stanno).

Soglie (linee orizzontali di riferimento, es. il limite del contatore):

```yaml
soglie:
  - { valore: 5500, etichetta: "Soglia contatore 5,5 kW", tono: allarme }   # tono: allarme, attenzione, info
```

### `cronologia` — una riga per elemento, con i tratti in cui era acceso

Come la *state timeline* di Grafana, ma compatta: una riga sottile per elemento (stanza,
servizio…), una banda per ogni tratto in cui la condizione `se` era vera, e in fondo a ogni riga
com'è **adesso**. La sorgente dà una riga per evento con il tempo, il campo `gruppo` e i campi di
stato: un evento vale finché non ne arriva un altro per la stessa riga, e i campi vuoti tengono il
valore precedente (si può aggiungere una riga "di adesso" con solo la temperatura).

```yaml
tipo: cronologia
finestra: 24h                    # predefinito 24h; anche 12h, 7d…
gruppo: stanza                   # il campo che dice la riga
ordine: [Sala, Studio, Cucina]   # facoltativo: ordine e righe sempre presenti
se: aperta == 1
etichetta_se: Scalda             # nel riquadro al passaggio del mouse
tono: caldo
in_fondo:                         # colonne in fondo a ogni riga, con la loro intestazione
  - { etichetta: Adesso, valore: "[{live:1}°]" }
  - { etichetta: Obiettivo, valore: "[{set:1}°]", tenue: true }   # tenue = in grigio
stato_se: "[{live:1}° → {set:1}°][ · da {_da:durata}]"   # sotto il grafico, per ogni riga accesa
```

Senza `in_fondo` c'è una colonna sola, `stato` (es. `"[{live:1}°]"`). `stato_se` non sta più in
fondo alla riga ma **sotto il grafico**, una riga per elemento acceso (nome + testo), così le
colonne restano allineate; `_da` è da quando è acceso.

Lo stato all'inizio della finestra va dato dalla query (in Flux: l'ultimo evento precedente,
spostato all'inizio). Esempio completo: `config/tile/valvole-24h.yaml`.

Con `finestre: [6h, 12h, 24h]` chi guarda sceglie il periodo con dei pulsanti sulla riga del
titolo (la scelta resta in quel browser). La query deve leggere la finestra più lunga.

### `valore` — una frase con un valore dentro

```yaml
tipo: valore
testo: "1 € = {usd:3} $"
```

### `elenco` — una riga per elemento

Con **`tabella`** (consigliato) ogni elemento è una riga di una tabella con le colonne allineate:
i numeri vanno da soli a destra, le intestazioni sono piccole. Senza, ogni riga è una frase
(`riga`).

```yaml
tipo: elenco
tabella:
  - { etichetta: Stanza, valore: "{stanza}" }
  - { etichetta: Adesso, valore: "{live:1}°" }
  - { etichetta: Fino alle, valore: "{spegnimento:ora}", allinea: destra }
  - { etichetta: Aperta da, valore: "{dal:durata}", livello: avanzata }   # solo in avanzata
vuoto: Nessuna stanza sta scaldando     # mostrato solo con mostra_se: sempre
```

Ogni colonna accetta `etichetta`, `valore`, `allinea` (`sinistra`/`destra`), `livello`, `tono`
(colore del valore, come nelle voci) e `mostra_se`. In alternativa, la frase:

```yaml
riga:
  base: "{stanza}: {live:1}°"
  avanzata: "{stanza} · {live:1}° → {set:1}° · {dal:rel}"
```

### `testo` — testo fisso

```yaml
tipo: testo
testo: |
  Due righe
  di note.
```

### `orologio` — ora e data

Nessuna chiave in più.

### `immagine` — immagine o telecamera

```yaml
tipo: immagine
url: http://192.168.1.22/getimage   # MJPEG (stream) o JPEG
aggiorna_ogni: 0                    # 0 = stream continuo; es. 30s per ricaricare un JPEG
```

L'immagine **passa da Fluxboard** (`/api/immagine`): si vede anche da reti che non raggiungono la
telecamera (client, VPN, telefono) e uno stream MJPEG apre una sola connessione verso la
telecamera, qualunque sia il numero di schermi. Con `diretto: true` il browser la chiede
direttamente all'indirizzo. `rtsp://` non funziona in nessun browser: su molte telecamere usare
`/getimage` (MJPEG).

### `iframe` — pagina incorporata (es. pannello Grafana)

```yaml
tipo: iframe
url: http://grafana.casa.lan:3000/d-solo/<uid>/<nome>?panelId=17&theme=light
altezza: 300
```

Il sito incorporato deve permetterlo (in Grafana `allow_embedding = true`). Per un pannello
singolo usare l'URL `d-solo/…&panelId=N`; per una dashboard intera aggiungere `&kiosk`.
Grafana chiede comunque di aver fatto l'accesso nello stesso browser: per evitarlo meglio una
tile `grafico` sugli stessi dati.

---

## 5b. Azioni

Una tile può avere dei pulsanti che **fanno qualcosa**: accendere una VM, aggiungere un record
DNS. Il browser manda solo *quale* azione e *quale* riga; cosa eseguire sta nel file della tile
e i dati della riga sono quelli letti dal server, quindi dalla pagina non si può chiedere altro.

**Servono una password** (`FLUXBOARD_ADMIN_PASSWORD`, da *Impostazioni avanzate → Segreti*):
senza, ogni azione viene rifiutata. La stessa password protegge l'editor, perché chi può
modificare le tile può anche definire azioni. Ogni azione chiede conferma e viene annotata nel
log del servizio.

```yaml
azioni:
  - id: spegni                 # per riga: un pulsante accanto a ogni riga che rispetta "quando"
    etichetta: Spegni
    operazione: spegni         # una delle operazioni della sorgente (proxmox: avvia, spegni, riavvia)
    quando: "codice == running"
    tono: allarme              # pulsante rosso
    livello: intermedia        # da quale livello di lettura (predefinito intermedia)
    chiave: id                 # campo che identifica la riga (predefinito id)
    conferma: "Spegnere {nome}?"

  - id: aggiungi-record        # globale: un pulsante in fondo alla tile, con dei campi da compilare
    etichetta: + Record A
    globale: true
    operazione: richiesta      # sorgente http: una chiamata che scrive
    metodo: POST
    url: api/zones/records/add
    parametri: { zone: "{zona}", domain: "{nome}.{zona}", type: A, ipAddress: "{ip}" }
    errore_se: "status != ok"  # condizione sulla risposta JSON per le API che rispondono 200 anche se falliscono
    campi:
      - { nome: nome, etichetta: Nome host, formato: "^[a-z0-9-]+$" }
      - { nome: zona, etichetta: Zona, valori: [casa.lan, servizi.lan] }
      - { nome: ip, etichetta: Indirizzo IP, formato: "^(\\d{1,3}\\.){3}\\d{1,3}$" }
    conferma: "Creare {nome}.{zona} → {ip}?"
```

I `campi` vengono controllati sul server (`formato` è un'espressione regolare, `valori` un
elenco chiuso) prima di finire nei `parametri`. Le azioni non compaiono sui display con
`controlli: false` (touch panel, e-ink). `subito: true` salta la finestra di conferma (per azioni
innocue, come segnare un avviso come visto).

## 5c. Messaggi critici (centro avvisi)

I messaggi importanti **restano finché non li segni come visti**, invece di scorrere via.

**Chi li produce**: qualunque tile che legge dati, con un blocco `avvisi`. Ogni riga che rispetta
`quando` diventa un avviso; righe con la stessa `chiave` sono lo stesso avviso, che si conta
(`volte`) invece di ripetersi.

```yaml
avvisi:
  quando: "codice != 1"                # facoltativo: senza, ogni riga
  messaggio: "{nome}: {dettaglio}"
  host: "{nome}"                       # facoltativo
  chiave: "{nome}"                     # cosa rende uguali due avvisi (predefinita: il messaggio)
  gravita: { "codice == 0": critico, "codice == 2": attenzione }   # o solo critico / attenzione
  ora: ultimo                          # facoltativo: il campo con l'ora dell'evento
  volte: volte                         # facoltativo: il campo con quante volte è successo
```

Una tile che serve **solo** a raccogliere avvisi ha `mostra_se: mai`: legge e non compare (in
Modifica sta fra le non visibili, "raccoglie avvisi"). Per il syslog conviene raggruppare già
nella query: `| stats by (host, origine_ip, _msg) count() volte, max(_time) ultimo`.

**Chi li mostra**: una tile con `dati: { tipo: avvisi }`. Righe: `messaggio`, `host`, `gravita`,
`primo`, `ultimo`, `volte`, `attivo` (il problema c'è ancora), `da_vedere`, `chiave`, `origine`.
Due azioni senza password (non cambiano niente fuori da Fluxboard): `conferma` (una riga, con
`parametri: { chiave: "{chiave}" }`) e `conferma_tutti`. Vedi `config/tile/log-critici.yaml`.

Un Ack sospende l'avviso per **24 ore**: passate quelle torna fra quelli da vedere se il problema c'è ancora, e torna comunque se il problema finisce e poi si ripresenta (un
messaggio che si ripete ogni 3 minuti resta zitto dopo la conferma). Gli avvisi stanno in
`cache/avvisi.json`; quelli confermati e risolti si dimenticano dopo 7 giorni.

---

## 5d. Ack, Ignora e segnale di allerta

**Ack e Ignora su qualunque tile.** Oltre al centro avvisi, ogni tile con un elenco può nascondere
una riga riconoscendola da un suo campo (`chiave`):

```yaml
azioni:
  - { id: ack, etichetta: Ack, tono: ack, operazione: nascondi_riga, chiave: host, subito: true }
  - { id: ignora, etichetta: Ignora, tono: ignora, operazione: ignora_riga, chiave: host,
      conferma: "Sei davvero sicuro di ignorare questo evento?" }
```

Ack la nasconde per 24 ore, Ignora per sempre. Non serve password. Quello che è nascosto resta
nello storico della tile: il pulsante **Ignorati · N** in fondo alla tile lo elenca, e un click
riammette la riga (quando il problema è risolto). Le righe nascoste si tolgono prima di `elabora`,
quindi un `limita: 8` mostra comunque otto righe. `tono: ack` è verde pallido, `tono: ignora` grigio scuro.

**Segnale in testata.** Quando una tile, in qualunque workspace, è in allerta, accanto al titolo
compare un segnale: rosso che lampeggia per le allerte gravi, giallo per gli avvisi. Un click elenca
le allerte e porta alla tile; dallo stesso menu si accende un suono leggero (per browser).
Una tile è in allerta grave quando `colore_se` la accende di `rosso` (o con l'etichetta `allarmi`);
un'etichetta che è rossa per caso non conta. Si decide anche a mano, nella tile:

```yaml
allerta: grave    # ogni volta che colore_se la accende, di qualunque colore
allerta: avviso   # idem, ma segnale giallo, senza suono né notifiche
allerta: no       # mai
```

Un Ack spegne anche il segnale (la riga non c'è più).

**Notifiche push** (facoltative, in `global.yaml`): a ogni allerta grave nuova Fluxboard chiama un
indirizzo. Con Node-RED basta un nodo `http in`; con ntfy arriva sul telefono.

```yaml
notifiche:
  - url: http://192.168.1.40:1880/fluxboard/allerta   # riceve un JSON { evento, livello, titolo, messaggio, tile, workspace, ... }
  - url: https://ntfy.sh/casa-fluxboard              # formato ntfy: titolo, messaggio e priorità
    formato: ntfy
    anche_risolte: true      # avvisa anche quando torna normale
    ripeti_dopo: 30m         # un'allerta che va e viene: al massimo una notifica ogni 30 minuti
```

Dopo un riavvio non partono notifiche per le allerte già in corso.

## 5e. Giro dei workspace

Il pulsante ↻ accanto al workspace fa girare i workspace uno dopo l'altro, ogni 30 secondi (una
linea sotto la testata mostra quanto manca). Si ferma da solo mentre si modifica, con un menu o una
finestra aperti, o con il puntatore sopra le tile. Le tile presenti in più workspace (`anche_in`,
es. la telecamera) restano dove sono senza interrompersi, se hanno lo stesso posto nei workspace.
Il ritmo si cambia nel profilo del display (`giro: 45s`) o nell'indirizzo (`?giro=45s`, comodo per
un pannello a muro senza tastiera; `?giro=0` lo spegne).

## 6. Elaborazione dei dati (`elabora`)

Passaggi eseguiti in ordine sulle righe, dopo la lettura:

| Passaggio | Esempio | Effetto |
|---|---|---|
| `rinomina` | `{ temperatura_inlet: aria }` | Cambia il nome dei campi |
| `scala` | `{ aria: 0.1 }` | Moltiplica (es. valori SNMP ×10) |
| `traduci` | `{ stato: { "true": acceso, "false": spento } }` | Sostituisce valori con parole |
| `filtra` | `"codice % 2 == 1"` | Tiene solo le righe che rispettano la condizione |
| `ordina` | `stanza`, `"-consumo"` oppure `"-allarme, nome"` | Ordina (`-` = decrescente); più chiavi separate da virgola |
| `limita` | `5` | Tiene le prime N righe |
| `seleziona` | `[stanza, live]` | Tiene solo questi campi |
| `aggiungi` | `[ { nome: prova, codice: 0 } ]` | Righe scritte a mano in coda: per vedere com'è la tile in una situazione che adesso non c'è. Da togliere dopo la prova |

```yaml
elabora:
  - rinomina: { temperatura_esterna: fuori }
  - scala: { fuori: 0.1 }
  - filtra: "fuori < 5"
```

---

## 7. Condizioni (in `filtra`, `tono`, `mostra_se`, `quando`, `errore_se`)

```
campo == valore       campo != valore
campo > n   >=   <   <=
campo ~ testo         contiene / espressione regolare (senza maiuscole/minuscole)
campo !~ testo        non contiene
campo % 2 == 1        resto della divisione (es. dispari)
campo                 il campo è "vero" (presente, non zero, non vuoto)
!campo                il campo è vuoto o falso
campo entro 5m        la data nel campo è degli ultimi 5 minuti (s, m, h, d)
campo oltre 1h        la data nel campo è più vecchia di un'ora
cond1 e cond2         tutte vere
cond1 o cond2         almeno una vera
```

A destra si può citare **un altro campo** fra graffe: `fascia1 == {set}` è vera quando la fascia 1
vale quanto il setpoint in vigore (utile per evidenziare la voce giusta).

Le condizioni di tempo si ricalcolano anche senza dati nuovi: con `colore_se: { "quando entro 2m": … }`
una tile si accende allo scatto e si spegne da sola due minuti dopo (vedi
`config/tile/allarme-pavimento.yaml`).

Un campo **assente non vale zero**: `codice >= 0` esclude le righe senza codice. I testi si
possono scrivere con o senza virgolette: `stato == "in linea"`, `stato == acceso`.

---

## 8. Segnaposto nei testi

| Scrittura | Risultato con `v = 21.456` / una data |
|---|---|
| `{v}` | `21,456` |
| `{v:1}` | `21,5` (cifre decimali da 0 a 9) |
| `{v:%}` | da `0.42` → `42%` |
| `{t:ora}` | `16:00` |
| `{t:data}` | `3 novembre` |
| `{t:rel}` | `5m fa` / `fra 2h` |
| `{t:durata}` | `5m` (tempo passato, senza "fa": "giù da {dal:durata}") |
| `{h:nome}` | da `nas.casa.lan` → `nas` (nome host breve; un IP resta intero) |
| `{e:casella}` | da `mario@posta.lan` → `mario` (indirizzi email senza dominio, anche dentro un testo) |
| `{a.b}` | campo dentro un oggetto |
| `{a\|b}` | il primo dei due campi che ha un valore (es. `{host\|origine_ip:nome}`) |
| `[ … {x} … ]` | parte **facoltativa**: sparisce se `x` manca |

Le date possono essere testo ISO, secondi o millisecondi dal 1970. Un campo mancante si vede
come `—`.

---

## 9. Disposizione (`config/layout/<display>.yaml`)

**Riduci / espandi.** Le tile lunghe hanno un pulsante sul bordo in basso (al passaggio del
mouse): *Riduci* le accorcia mostrando solo l'inizio; su una tile ridotta, passando sopra a
*Mostra tutto* la si vede intera sopra le altre, il click la lascia aperta. Lo stato si salva
nella disposizione (`ridotta: true`); se l'editor chiede la password e non si è entrati, resta
salvato nel browser.


La scrive la modalità **✎ Modifica** (trascina per spostare, angolo ◢ per ridimensionare,
doppio click sull'angolo = altezza automatica). **Anche fuori da Modifica**, al passaggio del mouse,
l'angolo ◢ ridimensiona e la presa ⠿ in alto al centro sposta la tile (anche in un'altra
sezione): così si lavora sulla disposizione vera.

In Modifica la griglia resta quella di adesso: le tile che in questo momento non si vedono
(nessun dato, livello, escluse) non occupano posto; il pulsante **Nascoste** della barra (con il
loro numero) le mostra al loro posto, in trasparenza, per spostarle o modificarle.
Anche le sezioni si spostano liberamente: trascinandone l'intestazione si mettono dove si vuole
nella pagina (anche lasciando spazio libero), e restano lì. Le viste Allarmi e Completa, se le si
dispone in Modifica, hanno una disposizione tutta loro (`layout/<display>--completa.yaml`): quello
che si fa lì (Riordina compreso) non tocca le altre viste.
Le sezioni senza tile compaiono in fondo, per trascinarci una tile e darle quell'etichetta; il
pulsante ↔ sul bordo di una sezione ne cambia la larghezza, l'intestazione si trascina per
cambiarne l'ordine, il **+** aggiunge una tile già con quell'etichetta.

Si può anche scrivere a mano:

```yaml
tile:
  - { id: meteo, colonne: 6 }               # 6 colonne su 12, altezza automatica, primo posto libero
  - { id: telecamera-ingresso, colonne: 3, altezza: 440, x: 6, y: 0 }   # colonna 7, in cima
sezioni:                                    # larghezza delle sezioni, in colonne della pagina
  temperatura: { colonne: 6 }
```

**Posizione esplicita** (come in Grafana e Home Assistant). Ogni tile ha una colonna `x` e una
riga `y` dentro la sua sezione, oltre a `colonne` e `altezza`, e **resta dove la lasci, della
misura che le dai**: nessuna tile si allarga o si stringe da sola. Spostando o ridimensionando una
tile, quelle che finirebbero sotto scendono di quanto serve; trascinandola oltre il centro di
un'altra, le due si scambiano. Poi tutto sale a chiudere i vuoti verso l'alto. Per portare una tile
in un'altra sezione, tienila un attimo sopra quella sezione (si evidenzia): passandoci sopra e
basta non cambia sezione. Le righe `y` sono da 8 px. Una tile senza `x`/`y` (nuova, o disposizione
di prima della 0.4) va nel primo posto libero dall'alto; *Riordina* le ridispone da capo. Sugli
schermi stretti la griglia è a una colonna e le posizioni salvate non vengono toccate.

Le colonne di una tile sono sempre colonne della pagina: in una sezione più stretta la tile si
ferma alla larghezza della sezione. Una sezione senza larghezza scelta prende quanto basta alle
sue tile, fino a mezza pagina: le sezioni piccole si affiancano come quadranti.

Le tile non elencate seguono, ordinate per `priorita`.

---

## 10. Ricette

### Un valore da InfluxDB con più campi (pivot)

```yaml
titolo: Server pve
tipo: valori
colore: grigio
ogni: 5m
dati:
  sorgente: influx-ng
  query: |
    from(bucket: "casa")
      |> range(start: -30m)
      |> filter(fn: (r) => r._measurement == "Dell_R440")
      |> last()
      |> map(fn: (r) => ({r with _value: float(v: r._value)}))   // tipi uguali per il pivot
      |> group()
      |> pivot(rowKey: ["_measurement"], columnKey: ["_field"], valueColumn: "_value")
elabora:
  - rinomina: { power_consumption_w: watt, Temperatura_cpu1: cpu }
  - scala: { cpu: 0.1 }
voci:
  - { etichetta: Consumo, valore: "{watt:0} W" }
  - { etichetta: CPU, valore: "{cpu:0}°", tono: { "cpu >= 80": allarme } }
```

### Un elenco che compare solo quando c'è un problema

```yaml
titolo: Spazio ZFS
tipo: elenco
mostra_se: dati            # nessuna riga = tile nascosta
dati:
  sorgente: influx-ng
  query: |
    from(bucket: "casa")
      |> range(start: -2h)
      |> filter(fn: (r) => r._measurement == "zpool_health" and (r._field == "capacity_pct" or r._field == "health"))
      |> last()
      |> map(fn: (r) => ({r with _value: string(v: r._value)}))
      |> group()
      |> pivot(rowKey: ["host", "pool"], columnKey: ["_field"], valueColumn: "_value")
elabora:
  - filtra: "capacity_pct >= 80 o health != ONLINE"
riga: "{pool} su {host}: pieno al {capacity_pct:0}%"
```

### Un'API pubblica senza chiave

`config/sorgenti/frankfurter.yaml`:

```yaml
tipo: http
url: https://api.frankfurter.dev/
```

`config/tile/cambio.yaml`:

```yaml
titolo: Euro / dollaro
tipo: valore
ogni: 1h
dati:
  sorgente: frankfurter
  url: "v1/latest?base=EUR&symbols=USD"
  campi: { usd: rates.USD }
testo: "1 € = {usd:3} $"
```

### Solo i servizi in errore da Uptime Kuma

Sorgente (`tipo: uptime-kuma`, plugin in `plugin/uptime-kuma.js`) che legge una pagina di stato
pubblica di Kuma; una riga per monitor con `nome`, `codice` (0 giù, 1 ok, 2 in attesa,
3 manutenzione), `stato`, `msg`, `dal`, `uptime`.

```yaml
titolo: Servizi con problemi
tipo: elenco
mostra_se: dati                  # tutto ok = tile nascosta
dati:
  sorgente: uptime-kuma
  pagina: fluxboard              # slug della pagina di stato
elabora:
  - filtra: "codice != 1"
riga: "{nome} · {stato} da {dal:durata}"
```

---

## 11. Provare senza salvare

- **Dall'editor della tile** (⚙ sulla tile, o *+ Aggiungi tile*): l'anteprima a destra usa i
  dati veri nei tre livelli e mostra i campi disponibili, cliccabili.
- **Da riga di comando** (utile per un'IA):

```bash
curl -s -X POST http://<host>:8080/api/config/prova -H 'Content-Type: application/json' \
  -d "{\"percorso\":\"tile/prova.yaml\",\"testo\":$(jq -Rs . < config/tile/prova.yaml)}"
```

Risponde `{ righe: [...], totale, ms }` o `{ errore }`. `POST /api/config/valida` con lo stesso
corpo restituisce `{ errori, avvisi }` senza eseguire la lettura.

## 12. Quando qualcosa non va

| Sintomo | Causa probabile |
|---|---|
| La tile non compare | `mostra_se: dati` e nessuna riga; `livello_minimo` più alto del livello scelto; `attiva: false`; esclusa dal display |
| Valori `—` | Il nome del campo nel testo non corrisponde: guardare i "campi disponibili" nell'editor |
| Tile sbiadita | Dati più vecchi di `scadenza`: la sorgente non risponde, si mostrano gli ultimi buoni |
| File rifiutato | Il motivo è nell'editor avanzato (*Impostazioni avanzate*); resta in vigore la versione precedente |
| Immagine nera | `rtsp://` o un indirizzo che il browser non raggiunge |
| iframe con "rifiutato" | Il sito non permette l'incorporamento (Grafana: `allow_embedding`) |
