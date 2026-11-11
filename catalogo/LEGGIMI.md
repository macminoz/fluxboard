# Catalogo delle tile (tile market)

Tile pronte da aggiungere alla dashboard dalla finestra **Tile market**. Ogni file ha due parti:

```yaml
mercato:
  nome: Servizi critici                 # nome nel catalogo
  descrizione: Cosa mostra, in una frase
  genere: shell                         # il genere (generi/) sotto cui compare nel market
  icona: server
  sorgente: sonde                       # tipo di sorgente richiesto (assente = nessuna)
  indirizzo: https://api.open-meteo.com/  # per un'API esterna: solo le sorgenti http con quell'indirizzo
  parametri:                            # chiesti all'aggiunta; nel modello si scrivono {{nome}}
    - { nome: pagina, etichetta: Pagina di stato, esempio: fluxboard, tipo: testo }
    #   tipo: testo (predefinito) · numero · durata · yaml (un elenco, es. i servizi da controllare)
tile:                                   # la tile, come in config/tile/, con {{sorgente}} e {{parametri}}
  titolo: …
```

Un segnaposto che è tutto il valore (`servizi: "{{servizi}}"`) prende il valore del tipo giusto
(un elenco per `yaml`, un numero per `numero`); dentro un testo (`query: "_time:{{periodo}} …"`)
viene sostituito come testo. La tile aggiunta ricorda da dove viene con `da_catalogo: <id>`.

I modelli sono generici: niente indirizzi di casa. Quelli della propria installazione restano
in `config/tile/`.
