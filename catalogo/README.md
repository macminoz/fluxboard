# Tile catalogue (Tile market)

**English** · [Italiano](LEGGIMI.md)

Ready-made tiles to add to the dashboard from the **Tile market** window. Each file has two parts:

```yaml
market:
  name: Critical services               # name in the catalogue
  description: What it shows, in one sentence
  kind: shell                           # the kind (generi/) it is listed under in the market
  icon: server
  source: probes                        # source type required (absent = none)
  address: https://api.open-meteo.com/  # for an external API: only http sources with that address
  parameters:                           # asked when adding; written {{name}} in the model
    - { name: page, label: Status page, example: home, type: text }
    #   type: text (default) · number · duration · yaml (a list, e.g. the services to check)
tile:                                   # the tile, as in config/tile/, with {{source}} and {{parameters}}
  title: …
```

The recipes shipped here are written with Italian keys and text; on an English installation the
added tile is written with English keys and its title, column headings and messages in English.
A placeholder that is the whole value (`services: "{{services}}"`) takes the value with the right
type; inside a text it is replaced as text. The added tile remembers where it comes from with
`from_catalogue: <id>`.

The recipes are generic: no home addresses. Those of your own installation stay in `config/tile/`.
