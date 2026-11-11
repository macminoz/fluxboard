# Kinds of tile (models)

**English** · [Italiano](LEGGIMI.md)

A kind is a tile model: it says which **fields** the editor asks for and what the tile looks like
(the **model**, with `{{field}}` where the values go). These are the basic ones, shipped with
Fluxboard. Your own go in `config/generi/` (a file with the same name replaces the basic one)
and can be created from a tile with **Save as kind…** in the editor.

The basic kinds are **generic**: they say *how* some data is shown, not *which* data. Each
concrete case (disk space, software versions, home services) is a ready-made tile of the
catalogue (`catalogo/`, with `market.kind:`) or a tile of a kind with its fields.

| Kind (id, English) | Italian id | For | Tile type |
|---|---|---|---|
| `trend` | `andamento` | how it changes over time, as lines | chart |
| `timeline` | `cronologia` | what was on and when, one row per item | timeline |
| `measure` | `misura` | current values, large | values |
| `correlation` | `correlazione` | compares the values of each item, highlights the odd ones | list |
| `messages` | `messaggi` | the Critical messages collected by the other tiles, with Ack | list |
| `stream` | `stream` | camera or image | image |
| `note` | `nota` | hand-written text | text |
| `shell` | `shell` | result of checks: ok, warning, failure (also in Critical messages) | list |

The files are written with Italian keys; English keys work as well (see `server/alias.js`).

```yaml
kind:
  name: Data correlation
  description: …
  icon: compare
  order: 4                  # position in the "Add tile" list
  fields:
    - { name: dati, label: Where from, type: data, preferita: versioni }
    - { name: colonne, label: Columns, type: query, required: true, example: "…" }
    - { name: filtro, label: Show only the rows where, type: text }
model:
  type: list
  data: "{{dati}}"
  process:
    - filter: "{{filtro}}"  # empty filter: the step disappears
  table: "{{colonne}}"
```

A tile of a kind (field names in English work too: `columns`, `filter`, `highlight`, `sort`…):

```yaml
kind: correlation
title: Updates available
fields:
  data: { source: versioni, software: [ … ] }
  columns: [ … ]
  filter: da_aggiornare == true
every: 2h        # anything written here wins over the model (objects merge)
```
