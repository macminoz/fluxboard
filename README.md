# Fluxboard

Fotografia istantanea di casa e dell'homelab: poche informazioni, leggibili da chiunque, che
compaiono quando c'è qualcosa da dire e spariscono quando non c'è. È un **framework**: sorgenti,
query e API stanno nei file YAML, il codice non sa nulla di casa.

Versione **1.0.0-alpha.1** (branch `1.0.0`) · [CHANGELOG](CHANGELOG.md)

- **[Guida alla configurazione](docs/guida-configurazione.md)**: riferimento completo di tutte le
  chiavi, con ricette pronte. È il documento da leggere per creare o modificare una tile.
- [Istruzioni per agenti IA](AGENTS.md): regole per chi modifica il progetto con un'IA.
- [Architettura e motivazioni](docs/architettura.md).

## Avvio

```bash
npm install
cp .env.example .env        # e compilare i segreti (es. INFLUX_TOKEN)
npm start                   # http://localhost:8080 · editor su /config
```

Requisiti: Node.js 20.12 o superiore (quello di Debian 13 va bene). Unica dipendenza: `yaml`.

## Come è fatta la configurazione

```
config/
  global.yaml             la cornice: titolo, tema, livello predefinito, profili dei display
  sorgenti/<nome>.yaml    una connessione riusabile (InfluxDB, VictoriaLogs, un'API HTTP, ...)
  tile/<nome>.yaml        una tile: cosa legge, come elabora i dati, quando compare, come si legge
  layout/<display>.yaml   ordine e dimensioni delle tile su un display (scritto da "Disponi")
  .storico/               copie automatiche delle versioni precedenti (le ultime 20 per file)
  .cestino/               file eliminati dall'editor
```

**Un'informazione = un file.** Aggiungere una tile significa creare un file in `config/tile/`,
dalla dashboard (**✎ Modifica → + Aggiungi tile**), dall'editor avanzato `/config` o a mano. Nessun altro file va toccato: la pagina si
dispone da sola in base a `priorita` e `larghezza`.

L'editor web valida mentre si scrive, rifiuta i file non validi (la dashboard non può rompersi per
un errore di battitura), permette di **provare** la lettura dei dati di una tile prima di salvare
e di recuperare le versioni precedenti. Salvare aggiorna subito tutti i display aperti. Anche le
modifiche fatte a mano ai file vengono riprese da sole.

### Una tile, in breve

```yaml
titolo: Riscaldamento
tipo: elenco                 # valori | valore | elenco | testo | orologio | immagine | iframe
colore: arancio              # facoltativo: blu azzurro verde giallo arancio rosso viola grigio
priorita: 90                 # più alta = più in alto
larghezza: media             # stretta | media | larga
ogni: 1m                     # ogni quanto rileggere
mostra_se: dati              # dati = sparisce se non ci sono righe | sempre
livello_minimo: base         # da quale livello di lettura compare
dati:
  sorgente: influx-ng        # un file in config/sorgenti/
  query: |                   # parametri del tipo di sorgente
    ...
elabora:                     # facoltativo: adatta i dati senza toccare la query
  - filtra: "codice % 2 == 1"
  - ordina: stanza
riga:                        # un testo per livello di lettura
  base: "{stanza}: {live:1}°"
  intermedia: "{stanza} · Set {set:1} · Live {live:1}"
  avanzata: "{stanza} · Set {set:1} · Live {live:1} · aperta {dal:rel}"
```

Con `tipo: valori` al posto di `riga`/`testo` si scrivono delle `voci` (etichetta piccola +
valore grande, con un `tono` colorato facoltativo): è il formato più leggibile, vedi la
[guida](docs/guida-configurazione.md#valori--più-numeri-affiancati-con-etichetta-il-più-leggibile-da-preferire).

Passaggi di `elabora`: `rinomina`, `scala`, `traduci`, `filtra`, `ordina`, `limita`, `seleziona`.
Formati nei testi: `{campo}`, `{campo:1}` (decimali), `{campo:rel}`, `{campo:ora}`, `{campo:data}`,
`{campo:%}`.

### Sorgenti disponibili

| `tipo` | Per cosa |
|---|---|
| `influx` | InfluxDB 2.x, query Flux |
| `logsql` | VictoriaLogs, query LogsQL |
| `http` | qualunque API JSON (le API pubbliche, Uptime Kuma, Jellyfin, ...) |
| `statico` | righe scritte nella tile stessa (note, promemoria); si usa con `dati: { tipo: statico }` |

Un formato che `http` non copre si aggiunge con un plugin JS in `plugin/` (vedi `plugin/LEGGIMI.md`).
I segreti si scrivono `${NOME}` nei file delle sorgenti e il valore va in `.env`: non arrivano
mai al browser.

## Modificare la dashboard dalla pagina

Tutto il lavoro quotidiano si fa dalla dashboard, senza aprire file. Lo schema è quello delle
dashboard più diffuse (Home Assistant, Grafana, schermata Home di iOS):

- **Rotella ⚙ su una tile** (compare al passaggio del mouse): apre l'editor di quella tile.
- **✎ Modifica** in alto: attiva la modalità di modifica. Ogni tile mostra i suoi comandi
  **⚙ modifica · ⧉ duplica · ✕ elimina**; si **trascina** per spostarla e si **tira l'angolo ◢**
  per cambiarne larghezza e altezza (doppio click sull'angolo: altezza automatica). Si vedono anche
  le tile nascoste in quel momento, segnate "nascosta adesso". **Fatto** chiude la modalità.
- **+ Aggiungi tile** (il Tile market, nella barra di Modifica o nel "+" di una sezione): diviso per
  genere (Andamento, Cronologia, Misura, Correlazione dati, Messaggi critici, Stream, Nota, Shell
  output). Per ogni genere si parte **da zero** (l'editor chiede solo i campi del genere) o da una
  **tile pronta** del catalogo (servizi critici, log critici, VM spente, aggiornamenti software,
  meteo…), da aggiungere scegliendo la sorgente e pochi parametri; in fondo una tile libera, da
  comporre a mano. Nella scheda **Le tue tile** ogni tile del workspace ha un interruttore per spegnerla
  e riaccenderla senza perderne la configurazione. I modelli stanno in `catalogo/` (vedi
  `catalogo/LEGGIMI.md` per scriverne di nuovi).
- Ogni tile **resta dove la lasci, della misura che le dai** (come in Grafana): spostandone o
  allargandone una, quelle che intralciano scendono sotto; poi tutto risale a chiudere i vuoti.
- **Eliminare non chiede conferma**: compare un avviso in basso con **Annulla** per 8 secondi, e il
  file resta comunque recuperabile in `config/.cestino/`.
- Ogni cambiamento è **salvato subito**.

L'**editor della tile** ha due schede: **Impostazioni** (titolo, sorgente e query, testi per i tre
livelli di lettura, quando compare, link al click) e **Codice** (il YAML completo, per ciò che i
moduli non coprono, come i passaggi di `elabora`). A destra c'è l'**anteprima dal vivo** con i dati
veri della sorgente, nei tre livelli, e l'elenco dei **campi disponibili**: un click inserisce
`{campo}` nel testo. Salvando dalle Impostazioni si toccano solo i campi modificati: commenti e
resto del file restano com'erano.

La disposizione si salva per display in `config/layout/<display>.yaml`: smartphone e browser
possono avere disposizioni diverse; le tile non ancora disposte si accodano per priorità. Per
disporre un display senza controlli (tsw, eink) basta aprirlo con `?display=tsw&controlli`.

**Impostazioni avanzate** (`/config`) resta per il resto: sorgenti, cornice (`global.yaml`),
storico delle versioni.

## Display e viste

- `?display=browser|mobile|tsw|eink` sceglie il profilo definito in `global.yaml` (senza
  parametro: `mobile` sotto i 700 px, altrimenti il primo).
- Le **viste**, dal selettore in alto (ricordato dal browser), da `?vista=` o da `vista:` nel
  profilo del display:
  - **Base**, **Media**, **Avanzata**: quanto dettaglio mostra ogni tile (nei file i livelli si
    chiamano `base`, `intermedia`, `avanzata`);
  - **Allarmi**: solo le tile con un allarme o un'attenzione in corso (una regola `colore_se` che
    accende rosso, arancio o giallo, o righe con tono allarme/attenzione);
  - **Completa**: tutte le tile attive, anche quelle che di solito spariscono senza dati, per
    sezione e priorità, con tutti i dettagli.
  Allarmi e Completa si dispongono da sole e non toccano le posizioni salvate.
- Sulla riga del titolo di ogni tile: ogni quanto si rilegge (`60s`) e, al passaggio del mouse,
  quando l'ha fatto l'ultima volta.

## Resilienza

- Ogni tile legge per conto suo: un timeout o un errore non tocca le altre.
- In caso di errore resta l'ultimo dato buono, marcato con la sua età; oltre la `scadenza` viene
  mostrato come vecchio.
- L'ultimo stato è salvato in `cache/` e sopravvive ai riavvii.
- Se il browser perde il server lo dice esplicitamente.
- Le sorgenti critiche si indicano per IP, così funzionano anche a DNS spento.

## Dove farlo girare

Il progetto non dipende dall'host: tutto lo stato sta in `config/` e `cache/`, i segreti in
variabili d'ambiente.

- **LXC / VM / Raspberry Pi**: `deploy/installa.sh root@<host>` copia il codice, crea l'utente
  `fluxboard` e installa `deploy/fluxboard.service` (systemd, porta 80). La configurazione già
  presente sull'host non viene toccata.
- **Container**: `deploy/Dockerfile`, con `config/` e `cache/` montati in `/data`.

L'editor `/config` può scrivere i file: con `FLUXBOARD_ADMIN_PASSWORD` impostata chiede una
password. Con `editor: false` in `global.yaml` è disattivato.

## Licenza

[MIT](LICENSE).
