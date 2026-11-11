// Starting models for the new files created by the editor. They are generic on purpose: host names,
// queries and fields must be replaced with the real ones.

export const MODELLI_TILE = {
  elenco: `# Una riga per ogni elemento restituito dalla sorgente.
titolo: Nuovo elenco
tipo: elenco
priorita: 50            # più alta = più in alto nella pagina
larghezza: media        # stretta | media | larga
ogni: 1m                # ogni quanto rileggere la sorgente
mostra_se: dati         # dati = sparisce se non ci sono righe | sempre
dati:
  sorgente: nome-sorgente      # un file in config/sorgenti/
  # ...parametri richiesti dal tipo di sorgente (query, url, ...)
elabora: []             # rinomina, scala, traduci, filtra, ordina, limita, seleziona
riga:
  base: "{nome}"
  intermedia: "{nome} · {valore}"
  avanzata: "{nome} · {valore} · {quando:rel}"
vuoto: Niente da mostrare
`,
  valore: `# Un valore singolo: si usa la prima riga restituita dalla sorgente.
titolo: Nuovo valore
tipo: valore
priorita: 50
larghezza: stretta
ogni: 5m
dati:
  sorgente: nome-sorgente
testo:
  base: "{valore:1}"
  avanzata: "{valore:2} (aggiornato {quando:rel})"
`,
  valori: `# Più valori affiancati dalla prima riga della sorgente: etichetta piccola, valore grande.
titolo: Nuovi valori
tipo: valori
priorita: 50
larghezza: stretta
ogni: 5m
dati:
  sorgente: nome-sorgente
voci:
  - etichetta: Adesso
    valore: "{valore:1}°"
  - etichetta: Stato
    valore: "{stato}"
    tono: { "stato == acceso": ok, "stato == guasto": allarme }   # ok attenzione allarme caldo freddo info spento
  - etichetta: Aggiornato
    valore: "{quando:rel}"
    livello: avanzata    # compare solo da questo livello in su
`,
  cronologia: `# Una riga per elemento (stanza, servizio…) con i tratti di tempo in cui era "acceso".
# La sorgente dà una riga per evento: tempo, nome della riga, stato (vale fino all'evento dopo).
titolo: Nuova cronologia
tipo: cronologia
finestra: 24h                  # quanto tempo indietro
dati:
  sorgente: nome-sorgente
gruppo: nome                   # il campo che dice a quale riga va un dato
se: acceso == 1                # quando la riga è "accesa"
etichetta_se: Acceso
tono: caldo                    # ok, attenzione, allarme, caldo, freddo, info, spento
stato: "[{valore}]"            # in fondo alla riga, com'è adesso
stato_se: "[{valore}][ · da {_da:durata}]"
`,

  testo: `# Testo fisso: note, promemoria, istruzioni.
titolo: Note
tipo: testo
priorita: 10
larghezza: media
testo: |
  Scrivi qui il testo.
`,
  orologio: `titolo: Adesso
tipo: orologio
priorita: 100
larghezza: stretta
`,
  immagine: `# Immagine o stream MJPEG letto direttamente dal browser.
titolo: Telecamera
tipo: immagine
priorita: 40
larghezza: media
url: http://indirizzo/percorso
aggiorna_ogni: 0        # 0 = stream continuo (MJPEG); es. 30s per ricaricare un'immagine fissa
`,
  iframe: `# Una pagina esterna incorporata, per esempio un pannello Grafana in modalità kiosk.
titolo: Pannello
tipo: iframe
priorita: 20
larghezza: larga
altezza: 300
url: http://indirizzo/pagina
`,
};

export const MODELLI_SORGENTE = {
  influx: `tipo: influx
url: http://indirizzo:8086
org: nome-org
token: \${INFLUX_TOKEN}     # il valore sta nel file .env
timeout: 15s
`,
  logsql: `tipo: logsql
url: http://indirizzo:9428
timeout: 10s
`,
  http: `tipo: http
url: https://api.esempio.org/      # base, facoltativa: le tile possono usare URL relativi
intestazioni: {}                     # es. { Authorization: "Bearer \${NOME_TOKEN}" }
timeout: 10s
`,
};

export function modelloGenerico(tipo) {
  return `tipo: ${tipo}\n# parametri richiesti dal connettore "${tipo}"\n`;
}
