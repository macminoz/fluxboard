# Fluxboard

A snapshot of your home and homelab: a few pieces of information, readable by anyone, that
show up when there is something to say and disappear when there isn't. It is a **framework**:
sources, queries and APIs live in YAML files, the code knows nothing about your home.

**English** · [Italiano](README.it.md)

Version **1.0.1-CURRENT** · [CHANGELOG](CHANGELOG.md)

- **[Configuration guide](docs/guide.md)**: complete reference of every key, with ready-made
  recipes. Read it to create or change a tile. ([Italiano](docs/guida-configurazione.md))

The interface is in English (default) and Italian: `language: it` in `global.yaml`, in Settings,
or `?lang=it` in the address. Keys in the YAML files work in both languages (`title` =
`titolo`), even mixed in the same file.

## Getting started

```bash
npm install
cp .env.example .env        # and fill in the secrets (e.g. INFLUX_TOKEN)
npm start                   # http://localhost:8080 · editor at /config
```

Requirements: Node.js 20.12 or newer (the one in Debian 13 is fine). One dependency: `yaml`.
`config/` holds a small working example (clock, weather, service checks, critical messages,
software updates): change it or replace it with your own.

## How the configuration is organised

```
config/
  global.yaml             the frame: title, language, theme, default level, display profiles
  sorgenti/<name>.yaml    a reusable connection (InfluxDB, VictoriaLogs, an HTTP API, ...)
  tile/<name>.yaml        a tile: what it reads, how it processes the data, when it shows, how it reads
  layout/<display>.yaml   order and size of the tiles on a display (written by Edit)
  .storico/               automatic copies of previous versions (the last 20 per file)
  .cestino/               files deleted from the editor
```

**One piece of information = one file.** Adding a tile means creating a file in `config/tile/`,
from the dashboard (**✎ Edit → + Add tile**), from the advanced editor `/config`, or by hand. No
other file needs touching: the page arranges itself by `priority` and `width`.

The web editor validates while you type, refuses invalid files (the dashboard cannot break
because of a typo), lets you **test** a tile's data before saving and recover previous versions.
Saving updates every open display right away. Changes made by hand to the files are picked up
too.

### A tile, in short

```yaml
title: Heating
type: list                   # values | value | list | chart | timeline | text | clock | image | iframe
colour: orange               # optional: blue azure green yellow orange red purple pink cyan indigo lime amber brown grey
priority: 90                 # higher = further up
width: medium                # narrow | medium | wide
every: 1m                    # how often to re-read
show_if: data                # data = disappears when there are no rows | always
data:
  source: influx             # a file in config/sorgenti/
  query: |                   # parameters of the source type
    ...
process:                     # optional: adapts the data without touching the query
  - filter: "code % 2 == 1"
  - sort: room
row:                         # one text per reading level
  basic: "{room}: {live:1}°"
  intermediate: "{room} · Set {set:1} · Live {live:1}"
  advanced: "{room} · Set {set:1} · Live {live:1} · open {since:rel}"
```

With `type: values`, instead of `row`/`text` you write `items` (small label + big value, with an
optional coloured `tone`): it is the most readable format, see the [guide](docs/guide.md).

Processing steps: `rename`, `scale`, `map`, `filter`, `sort`, `limit`, `select`.
Formats in texts: `{field}`, `{field:1}` (decimals), `{field:rel}`, `{field:duration}`,
`{field:time}`, `{field:date}`, `{field:%}`.

### Available sources

| `type` | For |
|---|---|
| `influx` | InfluxDB 2.x, Flux queries |
| `logsql` | VictoriaLogs, LogsQL queries |
| `http` | any JSON API (public APIs, Uptime Kuma, Jellyfin, ...) |
| `probes` | Fluxboard itself checks TCP ports, web pages and DNS servers |
| `versions` | latest releases on GitHub compared with the installed ones |
| `proxmox`, `panos` | Proxmox VE cluster, Palo Alto firewall (read only) |
| `static` | rows written in the tile itself (notes, reminders); used with `data: { type: static }` |

A format `http` does not cover is added with a JS plugin in `plugin/` (Node-RED and Uptime Kuma
are there). Secrets are written `${NAME}` in the source files and the value goes in `.env` or in
**Settings → Secrets**: they never reach the browser.

## Editing the dashboard from the page

Everyday work happens on the dashboard, without opening files. The pattern is the one of the
most common dashboards (Home Assistant, Grafana, the iOS Home screen):

- **✎ Edit** at the top turns on edit mode. Each tile shows its tools
  **⚙ edit · 👁 views · ⧉ duplicate · ✕ delete**; **drag** it to move it and **pull the corner ◢**
  to change width and height (double click on the corner: automatic height). Sections move by
  their heading. **Done** leaves edit mode.
- **+ Add tile** (the Tile market): split by kind (Trend, Timeline, Measure, Data correlation,
  Critical messages, Stream, Note, Shell output). For each kind start **from scratch** (the editor
  asks only for the kind's fields) or from a **ready-made tile** of the catalogue (critical
  services, critical logs, stopped VMs, software updates, weather…). Recipes live in `catalogo/`.
- Each tile **stays where you leave it, at the size you give it** (as in Grafana).
- **Deleting does not ask for confirmation**: a notice with **Undo** shows for 8 seconds, and the
  file can still be recovered from `config/.cestino/`.
- Every change is **saved right away**.

The **tile editor** has a **Settings** tab and a **Code** tab (the full YAML), with a **live
preview** using the source's real data and the list of available fields.

## Displays, views, screens

- `?display=browser|mobile|panel|eink` picks a profile from `global.yaml`. A profile with
  `panel: true` is read only and lightweight, for wall touch panels.
- **Settings → Screens** lists who opened the page (address and browser) and gives each screen a
  fixed profile.
- **Views**: **Basic**, **Medium**, **Advanced** (how much detail each tile shows), **Alarms**
  (only tiles with an alarm or warning) and **Full** (every active tile).
- **Workspaces**: several pages with their own tiles and layout; the ↻ button tours them every
  15/30/60 seconds.
- **Alert signal**: when a tile on any workspace is in critical alert, a blinking signal shows in
  the header (with an optional gentle sound), and push notifications can go to a webhook,
  Node-RED or ntfy.

## Resilience

- Each tile reads on its own: a timeout or an error does not touch the others.
- On error the last good data stays, marked with its age; past `stale_after` it shows as stale.
- The last state is saved in `cache/` and survives restarts.
- If the browser loses the server it says so.
- Point critical sources at an IP address, so they work even with DNS down.

## Where to run it

The project does not depend on the host: all the state is in `config/` and `cache/`, secrets in
environment variables.

- **LXC / VM / Raspberry Pi**: `deploy/installa.sh root@<host>` copies the code, creates the
  `fluxboard` user and installs `deploy/fluxboard.service` (systemd, port 80). An existing
  configuration on the host is not touched.
- **Container**: `deploy/Dockerfile`, with `config/` and `cache/` mounted in `/data`.

The `/config` editor can write files: with `FLUXBOARD_ADMIN_PASSWORD` set it asks for a password.
With `editor: false` in `global.yaml` it is off.

## Licence

[MIT](LICENSE).
