# Generi di tile (modelli)

Un genere è un modello di tile: dice quali **campi** chiedere nell'editor e com'è fatta la tile
(il **modello**, con `{{campo}}` dove vanno i valori). Questi sono quelli di base, distribuiti con
Fluxboard. I propri vanno in `config/generi/` (un file con lo stesso nome sostituisce quello di
base) e si possono creare da una tile con **Salva come genere** nell'editor.

I generi di base sono **generici**: dicono *come* si mostra un dato, non *quale* dato. Ogni
caso concreto (spazio disco, versioni del software, servizi di casa) è una tile pronta del
catalogo (`catalogo/`, con `mercato.genere:`) o una tile di genere con i suoi campi.

| Genere | Per cosa | Tipo di tile |
|---|---|---|
| `andamento` | come cambia nel tempo, a linee | grafico |
| `cronologia` | quando era acceso cosa, una riga per elemento | cronologia |
| `misura` | valori di adesso, grandi | valori |
| `correlazione` | confronta i valori di ogni elemento, evidenzia quelli che non tornano | elenco |
| `messaggi` | i Messaggi critici raccolti dalle altre tile, con Ack | elenco |
| `stream` | telecamera o immagine | immagine |
| `nota` | testo scritto a mano | testo |
| `shell` | esito di controlli: ok, attenzione, guasto (anche fra i Messaggi critici) | elenco |

```yaml
genere:
  nome: Correlazione dati
  descrizione: …
  icona: confronta
  ordine: 4                 # posizione nell'elenco di "Aggiungi tile"
  campi:
    - { nome: dati, etichetta: Da dove, tipo: dati, preferita: versioni }
    - { nome: colonne, etichetta: Colonne, tipo: query, obbligatorio: true, esempio: "…" }
    - { nome: filtro, etichetta: Mostra solo le righe dove, tipo: testo }
modello:
  tipo: elenco
  dati: "{{dati}}"
  elabora:
    - filtra: "{{filtro}}"  # filtro vuoto: il passo sparisce
  tabella: "{{colonne}}"
```

Una tile di genere:

```yaml
genere: correlazione
titolo: Aggiornamenti disponibili
campi:
  dati: { sorgente: versioni, software: [ … ] }
  colonne: [ … ]
  filtro: da_aggiornare == true
ogni: 2h        # tutto quello che si scrive qui vince sul modello (gli oggetti si fondono)
```
