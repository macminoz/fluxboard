# Configuration guide

**English** · [Italiano](guida-configurazione.md)

Complete reference of Fluxboard: everything you can write in the YAML files, with examples ready
to copy. For people editing by hand, from the web editor, or through an AI.

> **Golden rule:** one tile = one file. Adding or removing a piece of information never touches
> the other tiles or the code. If a file is wrong it is refused and the previous version stays in
> force: the page does not break.

**Keys in English or Italian.** Every key and every value from a fixed list can be written in
English or in Italian (`title` or `titolo`, `type: list` or `tipo: elenco`), even mixed in the
same file. This guide uses English. Field names chosen by you (the fields of your data) are never
translated. The editor keeps writing a file in the language it is already written in.

---

## 1. Where things are

```
config/
├── global.yaml           the frame: title, language, time zone, level, displays
├── sorgenti/<name>.yaml  WHERE the data is read from (a database, an API…)
├── tile/<id>.yaml        WHAT is shown and HOW (one tile per file; the file name is the id)
├── layout/<display>.yaml order and size on a display (written by Edit mode)
├── workspace/<name>/     the other workspaces: their own tile/ and layout/ (see below)
├── certificati/          public CA certificates (e.g. for Proxmox)
├── generi/               your own kinds of tile (§4b)
├── .snapshot/            configuration snapshots (restorable)
├── .storico/             the last 20 versions of each file (restorable from the editor)
├── .cestino/             deleted files (restorable)
└── segreti.env           tokens and passwords (outside git): changed from /config → Secrets
.env                      server variables (port, editor password); secrets too, as an alternative
```

**Workspaces.** The tiles and layouts in `tile/` and `layout/` are the `default` workspace. A new
workspace (*Workspace → + New workspace…* at the top) is an empty page to fill: its tiles live in
`workspace/<name>/tile/`, its layouts in `workspace/<name>/layout/`; sources, secrets and frame are
shared. Open it with `?workspace=<name>`; deleting it moves it to the trash.

**Snapshots and export.** *✎ Edit → Snapshots*: a snapshot takes a picture of the whole
configuration (not the secrets); take one before an experiment and, if it goes wrong, *Restore*
puts everything back, new files included (they go to the trash). A restore can be undone too: an
automatic snapshot is taken first. *Export* downloads the same package as a JSON file, *Import*
loads it (also on another installation: set the secrets again there).

The flow of every tile is always the same:

```
source  ──query/url──▶  rows  ──process──▶  clean rows  ──text/items──▶  what you see
```

A **row** is an object with fields, for example `{ room: "Living", live: 21.2, set: 21.5 }`. A
source returns zero, one or more rows; the tile decides how to show them.

Files reload by themselves when they change: no restart needed.

---

## 2. global.yaml

| Key | Values | Meaning |
|---|---|---|
| `title` | text | Title at the top left and of the browser tab |
| `language` | `en` · `it` | Interface language, dates and numbers (default `en`) |
| `timezone` | e.g. `Europe/Rome` | Time zone for `{field:time}` and `{field:date}` |
| `level` | `basic` · `intermediate` · `advanced` | Default reading level |
| `theme` | `auto` · `light` · `dark` | `auto` follows the system |
| `refresh` | duration | How often to re-read the sources when a tile does not say `every` |
| `editor` | `true` · `false` | `false` turns off editing from the page |
| `actions` | `true` · `false` | `false` turns off every action (§5b), even if tiles declare them |
| `hide_empty` | `true` · `false` | Default `true`: tiles with data disappear when they have nothing to show. Each tile can change it |
| `sections` | `true` · `false` | Default `true`: tiles are grouped in **one section per label** (see below) |
| `labels` | `{ name: { colour, icon, background } }` | The tile **labels** |
| `display.<name>` | see below | Device profiles |
| `screens` | list | A display profile for each screen that connects (see below) |
| `notifications` | list | Push notifications for critical alerts (§5d) |

The main keys can also be changed from the dashboard: *✎ Edit → ⚙ Settings*.

**Labels and sections.** Every tile has a label (`label: temperature`) and takes colour, icon and
background from it; changing a label's colour here changes all its tiles. With `sections: true`
the dashboard is split in sections, one per label, like the "Sections" view of Home Assistant;
tiles without a label are *Ungrouped*. A section without visible tiles disappears. Inside a
section tiles do not repeat what the heading already says.

```yaml
sections: true
labels:                                  # in the order of the sections
  alarms: { colour: red, background: true, icon: alarm }
  temperature: { colour: orange, icon: thermometer }
  statistics: purple                     # just the colour is fine too
```

Colours: `blue` `azure` `green` `yellow` `orange` `red` `purple` `pink` `cyan` `indigo` `lime`
`amber` `brown` `grey`. **The order of the labels is the order of the sections** and the priority of
*Tidy up the tiles*. Change it with ↑ ↓ in the Settings or by dragging a section heading in Edit.

Display profiles (`?display=<name>` in the address; without it the browser picks `mobile` below
700 px, otherwise the first, or the one given by a `screens` rule):

```yaml
display:
  browser: { columns: 12 }
  panel:   { columns: 6, level: basic, controls: false, panel: true }
  eink:    { columns: 4, level: basic, controls: false, exclude: [entrance-camera] }
```

`controls: false` hides the view selector and the Edit button. `exclude` removes tiles from that
display. `panel: true` makes the display **read only and lightweight**, for wall touch panels:
no editing tools, no links that open tabs, no blur or continuous animations, cameras as a frame
every 2 seconds instead of a continuous stream. `tour: 45s` sets the workspace tour pace (§5e).

**Who connects.** Fluxboard remembers the screens that open the page (address, browser, profile
used): *Settings → Screens* lists them and gives each one a fixed profile. By hand:

```yaml
screens:
  - { address: 192.168.1.60, display: panel }   # exact IP, or its start ("192.168.1.")
  - { browser: "Android", display: panel }      # part of the browser name (User-Agent)
```

A rule applies when the page address does not already say `?display=…`.

**Durations**: `30s`, `5m`, `1h`, `2d`.

---

## 3. Sources (`config/sorgenti/<name>.yaml`)

A source says **how to connect**; the tile says **what to ask for**. Ten tiles can use the same
database without repeating address and token.

**From the dashboard** (recommended): *✎ Edit → Sources*. As in Grafana, first pick the **type**
(HTTP API, InfluxDB, VictoriaLogs, Uptime Kuma, Proxmox…), then fill in its form and use **Test the
connection** before saving. Tokens typed in the form go to the secrets by themselves. **Rename…**
renames a source and updates every tile that uses it, in every workspace.

Secrets are written as `${NAME}` in the source; the value is set from **Advanced settings →
Secrets** (write only: the value is no longer shown, only its last 4 characters) and goes to
`config/segreti.env`, excluded from git. When a token expires just paste the new one: the tiles
that use it are re-read right away. The validator warns about a token written in clear.

Use **IP addresses**, not names: if DNS is down, the dashboard must still work.

### `influx` — InfluxDB 2.x (Flux query)

```yaml
type: influx
url: http://192.168.1.30:8086
org: home
token: ${INFLUX_TOKEN}
timeout: 15s
```

In the tile: `data.query` = a Flux query. **Each record of the answer becomes a row**, with the
columns as fields. Tip: end the query with `pivot` to get one row with all the fields you need.

### `logsql` — VictoriaLogs

```yaml
type: logsql
url: http://192.168.1.35:9428
```

In the tile: `data.query` (LogsQL), `data.limit_rows` (default 100). Each log line is a row.

### `http` — any JSON API

```yaml
type: http
url: http://192.168.1.1/                 # base, optional
authentication:                           # optional
  type: parameter                         # none | bearer | parameter | header | basic
  name: token                             # name of the parameter (?token=…) or of the header
  secret: ${DNS_SECRET}                   # user: … only for basic
parameters: { lang: en }                  # added to every request, optional
headers: { X-Client: fluxboard }          # optional
timeout: 10s
```

In the tile:

| Key | Meaning |
|---|---|
| `data.url` | Path relative to the base (or full URL) |
| `data.method` | `GET` (default) or `POST` for APIs that read with a body; `data.body` for the JSON. A tile re-reads by itself, so it **only reads**: PUT/PATCH/DELETE are done with actions (§5b) |
| `data.parameters` | `{ name: value }` added to the address |
| `data.list` | Where the array is in the answer (e.g. `data.items`): one element = one row |
| `data.fields` | `{ name: path }` to extract only what you need (e.g. `temp: current.temperature_2m`) |

Without `list` the whole answer is one row. Paths use dots: `a.b.c`, `list.0.name`.

### `static` — rows written by hand

No source file needed. In the tile:

```yaml
data:
  type: static
  rows:
    - { text: "Change the ventilation filter" }
```

### `proxmox` — cluster VMs and LXCs

```yaml
type: proxmox
url: https://192.168.1.2:8006
token_user: fluxboard@pve!dashboard       # Datacenter → Permissions → API Tokens
secret: ${PROXMOX_SECRET}
ca_certificate: certificati/home-root-ca.pem   # file in config/; empty = system certificates
certificate_name: pve.home.lan            # connect by IP but check the name
protected: [100, 101]                     # guests on which no action is allowed
```

In the tile: `data.resource` = `guests` (VMs and LXCs) or `nodes`. Guest rows: `id`, `nome`
(name), `tipo` (VM/LXC), `nodo`, `codice` (running, stopped…), `stato`, `cpu` (% of the assigned
cores), `core`, `memoria` (%), `memoria_gb`, `memoria_max_gb`, `acceso_da`, `tag`, `protetto`.
Actions: `start`, `shutdown` (clean, 2 minutes to close), `reboot`. **No actions on nodes**, by
design: create the token with a role without `Sys.PowerMgmt`.

`data.resource: space`: used space of nodes, running LXCs and storage (shared ones too, like an
NFS-mounted NAS or PBS). Rows: `nome`, `tipo`, `dove`, `usato_gb`, `totale_gb`, `libero_gb`,
`percentuale`, `codice` (1 ok, 2 from 80%, 0 from 90%).

> The fields of the data (the columns of the rows) keep the names the connectors give them, in
> Italian: `nome` = name, `stato` = status, `codice` = code, `dettaglio` = detail. Use them as
> they are in `{…}` and in conditions.

### `uptime-kuma` — monitor status (plugin)

The source `url` and `data.page` (the slug of a public status page). One row per monitor: `nome`,
`codice` (0 down, 1 ok, 2 pending, 3 maintenance), `stato`, `msg`, `dal`, `uptime`.

### `panos` — Palo Alto firewall (read only)

Management `url`, `key` (API key, from Secrets) and, like Proxmox, `ca_certificate` +
`certificate_name`. `data.resource`: `system` (version, signatures, uptime), `sessions` (active,
usage %, cps, kbps), `interfaces` (one row per port), `globalprotect` (connected users), `ha`. The
connector sends **only** these `show` commands, written in the code: no tile can configure or
reboot the firewall. Create the key for an administrator with a read-only role.

### `versions` — new software versions (GitHub)

One row per program: `nome`, `installata`, `ultima`, `uscita`, `da_aggiornare` (true/false),
`stato`, `link`, `come`. Pre-releases (rc, beta) do not count; `branch` keeps to a series
(InfluxDB `v2.`); `tag: true` for projects that publish only tags; `prefix` filters the tags.

The installed version:

| Written as | When |
|---|---|
| `installed: "2.4.0"` | the service does not say it: written by hand, updated after each upgrade |
| `{ url, field: version }` | JSON API without credentials (`field` is a path: `build.version`) |
| `{ url, search: "tags-(v[0-9.]+)" }` | any text (metrics, pages): the first group |
| `{ source: adguard, url: control/status, field: version }` | through an `http` source, with its credentials |
| `verify_certificate: false` | only to read a number behind an expired certificate |

```yaml
type: versions
software:
  - { name: Grafana, repo: grafana/grafana, installed: { url: "http://192.168.1.31:3000/api/health", field: version } }
  - { name: Uptime Kuma, repo: louislam/uptime-kuma, installed: "2.4.0" }
```

Without a token GitHub allows 60 reads an hour **per public IP**. Answers are remembered for an
hour and then only "has it changed?" is asked, which GitHub does not count: `every: 1h` is fine
even with dozens of programs. If GitHub refuses everything, the tile keeps the last good data.

### `probes` — does the service answer? (ports, sites, DNS)

Fluxboard checks by itself, every time the tile re-reads. The source has no parameters; the
services are in the tile, each with `name`, an optional `group` and one of:

| Check | Example | OK when |
|---|---|---|
| `tcp` | `tcp: "192.168.1.5:5060"` | the port accepts the connection |
| `http` | `http: "http://192.168.1.10/"`, `contains: index.html`, `expect: 200` | code < 400 (or `expect`) and, if given, the text is in the page |
| `dns` | `dns: 192.168.1.1`, `resolves: dns.home.lan` | the server resolves that name |

`wait` (default 3s) is the time limit of a probe; `verify_certificate: false` for an https site
with a self-signed or expired certificate. Rows: `nome`, `gruppo`, `tipo`, `bersaglio`, `codice`
(1 ok, 2 warning, 0 down), `stato`, `ms`, `dettaglio`, `certificato_scade`, `certificato_giorni`.

**Certificates.** For https sites the probe always reads the certificate expiry: expired or
expiring within `certificate_warning` days (default 14) the service is *warning* (`codice: 2`).

### `node-red` — flows and node status (plugin)

`url` (e.g. `http://192.168.1.40:1880`), `user`/`password` only if Node-RED has `adminAuth`.
`data.resource`: `states` (nodes with a status dot), `nodes` (all), `flows`. Node rows: `id`,
`nome`, `tipo`, `flusso`, `disattivato`, `stato`, `colore`, `codice` (1 green, 2 yellow, 0 red,
3 blue/grey). For a single node: `process: [ { filter: "nome == SolarEdge" } ]`.

### New source types

For formats no type covers (MQTT, SNMP…) add a JavaScript file in `plugin/`. A connector also
declares its form (`moduloSorgente`, `moduloDati`), so it shows up in the source gallery with the
right fields.

---

## 4. Tiles (`config/tile/<id>.yaml`)

### Keys common to every type

| Key | Values | Default | Meaning |
|---|---|---|---|
| `title` | text or per level | id | `""` = no heading |
| `type` | see §5 | — | **required** |
| `label` | a label from `global.yaml` | none | Section, colour, icon and background of the tile. **Without a label the tile is detached**: it sits freely in the page |
| `colour` | a colour | the label's | A colour other than the label's |
| `background` | `true` · `false` | the label's | Tints the tile background too |
| `icon` | `thermometer` `flame` `sun` `cloud` `lightning` `home` `server` `network` `alarm` `chart` `camera` `clock` `note` `package` … | the label's | Icon next to the title |
| `colour_if` | `{ "<condition>": colour }` | — | **The colour follows the data**: when the condition is true (on at least one row) the tile takes that colour and background. The first true one wins. The value can be a colour, a label or `{ colour, background: false }` |
| `alert` | `critical` · `warning` · `no` | — | The header signal (§5d) |
| `views` | `[basic, alarms]` | all | Which views show the tile (Basic, Medium, Advanced, Alarms, Full). From the dashboard: 👁 on hover |
| `intensity` | `10` (percentage, 0–100) | `10` | How strong the tile's tint is. When written, it applies to every tint of the tile: `0` = no tint, not even the label's |
| `priority` | number | 50 | Order of the tiles not yet in the layout (higher = earlier) |
| `width` | `narrow` (¼) · `medium` (½) · `wide` (full) | `narrow` | Initial width; then resize by dragging |
| `every` | duration | `refresh` | How often to re-read the source |
| `stale_after` | duration | 3 × `every` | Past this age the data shows as stale |
| `show_if` | `data` · `always` · `never` · a condition | from `hide_empty` | `never` = reads but is not shown (only to collect alerts, §5c); `data` = **the tile disappears when it has nothing to show**; with a condition (`"valve == on"`) it shows only if at least one row matches |
| `link` | URL | — | The whole tile becomes clickable (not on panels) |
| `active` | `false` | — | Tile saved but excluded: visible only in Edit with "Hidden" |
| `also_in` | list of workspaces | — | **The same tile in other workspaces too** (same file: changing it changes it everywhere) |
| `data` | see §3 | — | What to read and from which source |
| `process` | list of steps | — | Data clean-up (§6) |
| `actions` | list | — | Buttons that do something (§5b) |
| `alerts` | block | — | Send rows to the critical messages (§5c) |

### Text per level

Every text (`title`, `row`, `text`, `label`, `value`) can be a single string or one per level. If
a level is missing the nearest one is used (lower first):

```yaml
text:
  basic: "{temperature:0}°"
  advanced: "{temperature:1}° · updated {when:rel}"
```

---

## 4b. Kinds (tile models)

A **kind** is a generic model: it says *how* some data is shown (Trend, Timeline, Measure, Data
correlation, Critical messages, Stream, Note, Shell output). *Add tile* is split by kind: "From
scratch" opens the editor with only the kind's fields (where from, columns, filter…), or pick a
ready-made tile of that kind from the catalogue.

```yaml
# config/tile/updates.yaml
kind: correlation
title: Updates available
fields:
  data:
    source: versioni
  columns:
    - { label: Software, value: "{nome}" }
    - { label: Installed, value: "{installata}" }
  filter: da_aggiornare == true
  highlight: da_aggiornare == true
every: 2h          # a tweak: wins over the model (objects merge, lists replace)
```

Kind ids in English: `trend`, `timeline`, `measure`, `correlation`, `messages`, `stream`, `note`,
`shell`. The basic kinds live in `generi/` (with the program); your own in `config/generi/`, where
a file with the same name replaces the basic one. The format is in `generi/LEGGIMI.md`. From any
tile, in the editor, **Save as kind…** creates a kind with that tile as its model.

## 5. Tile types

### `values` — several numbers side by side, with labels *(the most readable, prefer it)*

Uses the **first row** of the data. Each item: small label above, big value below, in equal
columns (at most 4 per row, 2 when the tile is narrow).

```yaml
type: values
items:
  - label: Now
    value: "{live:1}°"
  - label: Heating
    value: "{valve}"
    tone: hot
    show_if: "valve == on"      # the item shows only while heating
  - label: Today's bands
    value: "{f1:1}° · {f2:1}°"
    level: advanced             # only from "advanced"
```

| Item key | Meaning |
|---|---|
| `label` | Small text; takes `{field}` |
| `value` | Big text; takes `{field}` |
| `level` | Minimum level to show the item |
| `tone` | Colour of the value: a fixed name (`tone: ok`) or `{ "<condition>": <name> }`, the first true wins |
| `show_if` | Condition on the row: the item shows only when true |
| `group` | Title of a secondary block: items with the same `group` go below, separated, with smaller values |

Tones: `ok` (green), `warning` (amber), `alarm` (red), `hot` (orange), `cold` (blue), `info`
(accent), `off` (grey). Conditions are the ones in §7.

### `chart` — lines over time

Drawn by Fluxboard (no iframe, no credentials): one axis, a legend with two or more lines, the
last value next to each line, a crosshair on hover. The query must give **one row per instant**
with the time field and one field per line (in Flux: `pivot` on `_time`).

```yaml
type: chart
axis: _time            # time field (default _time)
unit: "°"
decimals: 1
series:                # at most 3 lines per chart
  - { field: live, label: Temperature }
  - { field: set, label: Target, step: true }   # step: changes in steps (setpoint)
```

A chart can also have `items` (read from the **most recent point**: how it is now and how it went,
in one tile), `bands` (the stretches of time when a condition was true, as coloured bands behind
the lines), `ticks: 3h` (one hour on the axis every 3 h) and `thresholds` (horizontal reference
lines):

```yaml
items:
  - { label: Now, value: "{live:1}°" }
  - { label: Heating for, value: "{since:duration}", tone: hot, show_if: valve == on }
bands:
  - { if: valve == on, label: Heating, tone: hot }
thresholds:
  - { value: 5500, label: "Meter limit 5.5 kW", tone: alarm }
```

`colour_if` on a chart looks only at the most recent point.

### `timeline` — one row per item, with the stretches when it was on

Like Grafana's *state timeline*, but compact: a thin row per item (room, service…), a band for
each stretch in which the `if` condition was true, and at the end of each row how it is **now**.
The source gives one row per event with the time, the `group` field and the status fields.

```yaml
type: timeline
window: 24h                      # default 24h; also 12h, 7d…
windows: [6h, 12h, 24h]          # optional: the viewer picks the period
group: room                      # the field naming the row
order: [Living, Study, Kitchen]  # optional: order and rows always present
if: open == 1
label_if: Heating                # in the hover box
tone: hot
footer:                          # columns at the end of each row, with their heading
  - { label: Now, value: "[{live:1}°]" }
  - { label: Target, value: "[{set:1}°]", faint: true }
status_if: "[{live:1}° → {set:1}°][ · for {_da:duration}]"   # below the chart, per row that is on
```

### `value` — a sentence with a value inside

```yaml
type: value
text: "1 € = {usd:3} $"
```

### `list` — one row per item

With **`table`** (recommended) each item is a row of a table with aligned columns: numbers go
right by themselves, headings are small. Without it each row is a sentence (`row`).

```yaml
type: list
table:
  - { label: Room, value: "{room}" }
  - { label: Now, value: "{live:1}°" }
  - { label: Until, value: "{off_at:time}", align: right }
  - { label: Open for, value: "{since:duration}", level: advanced }
empty: No room is heating       # shown only with show_if: always
```

Each column takes `label`, `value`, `align` (`left`/`right`), `level`, `tone` and `show_if`.
**Column widths**: drag the right edge of a heading to widen or narrow it (double click: back to
automatic); the width is saved per display.

### `text` — fixed text

```yaml
type: text
text: |
  Two lines
  of notes.
```

### `clock` — time and date

No extra keys.

### `image` — image or camera

```yaml
type: image
url: http://192.168.1.22/getimage   # MJPEG (stream) or JPEG
refresh_every: 0                    # 0 = continuous stream; e.g. 30s to reload a JPEG
```

The image **goes through Fluxboard** (`/api/immagine`): it is visible from networks that cannot
reach the camera, and an MJPEG stream opens a single connection to the camera whatever the number
of screens. With `direct: true` the browser asks the address directly. `rtsp://` does not work in
any browser.

### `iframe` — embedded page (e.g. a Grafana panel)

```yaml
type: iframe
url: http://grafana.home.lan:3000/d-solo/<uid>/<name>?panelId=17&theme=light
height: 300
```

---

## 5b. Actions

A tile can have buttons that **do something**: start a VM, add a DNS record. The browser sends only
*which* action and *which* row; what to run is in the tile's file and the row's data is the one
read by the server.

**A password is required** (`FLUXBOARD_ADMIN_PASSWORD`, from *Advanced settings → Secrets*):
without it, every action is refused. Each action asks for confirmation and is written to the
service log.

```yaml
actions:
  - id: shutdown              # per row: a button next to each row matching "when"
    label: Shut down
    operation: shutdown       # one of the source's operations (proxmox: start, shutdown, reboot)
    when: "codice == running"
    tone: alarm               # red button
    level: intermediate       # from which reading level (default intermediate)
    key: id                   # field that identifies the row (default id)
    confirm: "Shut down {nome}?"

  - id: add-record            # global: a button at the bottom of the tile, with fields to fill in
    label: + A record
    global: true
    operation: richiesta      # http source: a call that writes
    method: POST
    url: api/zones/records/add
    parameters: { zone: "{zone}", domain: "{name}.{zone}", type: A, ipAddress: "{ip}" }
    error_if: "status != ok"
    fields:
      - { name: name, label: Host name, format: "^[a-z0-9-]+$" }
      - { name: zone, label: Zone, values: [home.lan, services.lan] }
      - { name: ip, label: IP address, format: "^(\\d{1,3}\\.){3}\\d{1,3}$" }
    confirm: "Create {name}.{zone} → {ip}?"
```

`fields` are checked on the server (`format` is a regular expression, `values` a closed list)
before going into `parameters`. Actions do not show on displays with `controls: false`.
`immediate: true` skips the confirmation window (for harmless actions).

## 5c. Critical messages (alert centre)

Important messages **stay until you mark them as seen**, instead of scrolling away.

**Who produces them**: any tile that reads data, with an `alerts` block. Each row matching `when`
becomes an alert; rows with the same `key` are the same alert, which is counted instead of
repeated.

```yaml
alerts:
  when: "codice != 1"                  # optional: without it, every row
  message: "{nome}: {dettaglio}"
  host: "{nome}"                       # optional
  key: "{nome}"                        # what makes two alerts the same (default: the message)
  severity: { "codice == 0": critical, "codice == 2": warning }   # or just critical / warning
  time: ultimo                         # optional: the field with the event time
  count: volte                         # optional: the field with how many times it happened
```

A tile that only collects alerts has `show_if: never`. **Who shows them**: a tile with
`data: { type: alerts }` (or `kind: messages`). Rows: `messaggio`, `host`, `gravita`, `primo`,
`ultimo`, `volte`, `attivo`, `da_vedere`, `chiave`, `origine`.

**Ack** snoozes an alert for **24 hours**; **Ignore** removes it for good, after a confirmation.
Ignored alerts stay in the tile's history (**Ignored · N** button), from which they are readmitted
one by one. Alerts live in `cache/avvisi.json`.

---

## 5d. Ack, Ignore and the alert signal

**Ack and Ignore on any tile.** Besides the alert centre, any list tile can hide a row,
recognising it by one of its fields (`key`):

```yaml
actions:
  - { id: ack, label: Ack, tone: ack, operation: hide_row, key: host, immediate: true }
  - { id: ignore, label: Ignore, tone: ignore, operation: ignore_row, key: host,
      confirm: "Are you sure you want to ignore this event?" }
```

Ack hides it for 24 hours, Ignore for good. No password needed. Hidden rows stay in the tile's
history (**Ignored · N**), from which a click readmits a row. Hidden rows are removed before
`process`, so a `limit: 8` still shows eight rows. `tone: ack` is pale green, `tone: ignore`
dark grey.

**Header signal.** When a tile, on any workspace, is in alert, a signal shows next to the title:
red and blinking for critical alerts, yellow for warnings. A click lists the alerts and takes you
to the tile; the same menu turns on a gentle sound (per browser). A tile is in critical alert when
`colour_if` lights it up `red` (or with the `alarms` label); a label that happens to be red does
not count. Decide by hand in the tile with `alert: critical`, `alert: warning` or `alert: no`.

**Push notifications** (optional, in `global.yaml`): on every new critical alert Fluxboard calls
an address. With Node-RED an `http in` node is enough; with ntfy it reaches your phone.

```yaml
notifications:
  - url: http://192.168.1.40:1880/fluxboard/alert   # receives JSON { evento, livello, titolo, messaggio, tile, workspace, ... }
  - url: https://ntfy.sh/home-fluxboard
    format: ntfy
    also_resolved: true      # notifies when it goes back to normal too
    repeat_after: 30m        # an alert that comes and goes: at most one notification every 30 minutes
```

After a restart no notifications are sent for alerts already in progress.

## 5e. Workspace tour

The ↻ button next to the workspace tours the workspaces one after the other; its menu picks 15,
30 or 60 seconds (remembered by the browser). It pauses by itself while editing, with a menu or a
window open, or with the pointer over the tiles. Tiles present in several workspaces (`also_in`,
e.g. a camera) stay where they are without interruption, if they have the same place in each
workspace. The pace can also be set in the display profile (`tour: 45s`) or in the address
(`?giro=45s`, handy for a wall panel without a keyboard; `?giro=0` turns it off).

## 6. Processing the data (`process`)

Steps run in order on the rows, after reading:

| Step | Example | Effect |
|---|---|---|
| `rename` | `{ temperature_inlet: air }` | Renames fields |
| `scale` | `{ air: 0.1 }` | Multiplies (e.g. SNMP values ×10) |
| `map` | `{ status: { "true": on, "false": off } }` | Replaces values with words |
| `filter` | `"code % 2 == 1"` | Keeps only the rows matching the condition |
| `sort` | `room`, `"-usage"` or `"-alarm, name"` | Sorts (`-` = descending); several keys separated by commas |
| `limit` | `5` | Keeps the first N rows |
| `select` | `[room, live]` | Keeps only these fields |
| `append` | `[ { name: test, code: 0 } ]` | Rows written by hand at the end: to see how the tile looks in a situation that is not happening now |

```yaml
process:
  - rename: { outside_temperature: outside }
  - scale: { outside: 0.1 }
  - filter: "outside < 5"
```

---

## 7. Conditions (in `filter`, `tone`, `show_if`, `when`, `error_if`)

```
field == value        field != value
field > n   >=   <   <=
field ~ text          contains / regular expression (case insensitive)
field !~ text         does not contain
field % 2 == 1        remainder of the division (e.g. odd)
field                 the field is "true" (present, not zero, not empty)
!field                the field is empty or false
field within 5m       the date in the field is from the last 5 minutes (s, m, h, d)
field over 1h         the date in the field is older than an hour
cond1 and cond2       all true
cond1 or cond2        at least one true
```

(`e`, `o`, `entro`, `oltre` are the Italian spellings and work too.) On the right you can quote
**another field** in braces: `band1 == {set}`. Time conditions are recomputed even without new
data. A **missing field is not zero**: `code >= 0` excludes the rows without a code. Text can be
written with or without quotes: `status == "on line"`, `status == on`.

---

## 8. Placeholders in texts

| Written | Result with `v = 21.456` / a date |
|---|---|
| `{v}` | `21.456` |
| `{v:1}` | `21.5` (decimal digits from 0 to 9) |
| `{v:%}` | from `0.42` → `42%` |
| `{t:time}` | `16:00` |
| `{t:date}` | `3 November` |
| `{t:rel}` | `5m ago` / `in 2h` |
| `{t:duration}` | `5m` (time passed, without "ago": "down for {since:duration}") |
| `{h:name}` | from `nas.home.lan` → `nas` (short host name; an IP stays whole) |
| `{e:mailbox}` | from `mario@mail.lan` → `mario` (email addresses without the domain) |
| `{a.b}` | a field inside an object |
| `{a\|b}` | the first of the two fields that has a value |
| `[ … {x} … ]` | **optional** part: disappears when `x` is missing |

Numbers and dates follow the interface language. Dates can be ISO text, seconds or milliseconds
since 1970. A missing field shows as `—`.

---

## 9. Layout (`config/layout/<display>.yaml`)

Written by **✎ Edit** mode (drag to move, corner ◢ to resize, double click on the corner =
automatic height). Sections move too: drag their heading anywhere in the page. The Alarms and
Full views, once arranged in Edit, have a layout of their own (`layout/<display>--completa.yaml`).

```yaml
tile:
  - { id: weather, columns: 6 }                 # 6 columns out of 12, automatic height, first free place
  - { id: entrance-camera, columns: 3, height: 440, x: 6, y: 0 }   # column 7, at the top
    # table_columns: { Host: 160 }              # column widths of a table, by heading
sections:
  temperature: { columns: 6 }
```

Each tile has a column `x` and a row `y` inside its section, besides `columns` and `height`, and
**stays where you leave it, at the size you give it**. Rows `y` are 8 px each. Tiles not listed
follow, sorted by `priority`.

---

## 10. Recipes

### A public API without a key

`config/sorgenti/frankfurter.yaml`:

```yaml
type: http
url: https://api.frankfurter.dev/
```

`config/tile/exchange.yaml`:

```yaml
title: Euro / dollar
type: value
every: 1h
data:
  source: frankfurter
  url: "v1/latest?base=EUR&symbols=USD"
  fields: { usd: rates.USD }
text: "1 € = {usd:3} $"
```

### A list that shows only when there is a problem

```yaml
title: ZFS space
type: list
show_if: data              # no rows = hidden tile
data:
  source: influx
  query: |
    from(bucket: "home")
      |> range(start: -2h)
      |> filter(fn: (r) => r._measurement == "zpool_health")
      |> last()
      |> group()
      |> pivot(rowKey: ["host", "pool"], columnKey: ["_field"], valueColumn: "_value")
process:
  - filter: "capacity_pct >= 80 or health != ONLINE"
row: "{pool} on {host}: {capacity_pct:0}% full"
```

### Only the services that are down, from Uptime Kuma

```yaml
title: Services with problems
type: list
show_if: data                    # all fine = hidden tile
data:
  source: uptime-kuma
  page: home                     # slug of the status page
process:
  - filter: "codice != 1"
row: "{nome} · {stato} for {dal:duration}"
```

---

## 11. Testing without saving

- **From the tile editor**: the preview on the right uses the real data in the three levels and
  shows the available fields, clickable.
- **From the command line** (handy for an AI):

```bash
curl -s -X POST http://<host>:8080/api/config/prova -H 'Content-Type: application/json' \
  -d "{\"percorso\":\"tile/test.yaml\",\"testo\":$(jq -Rs . < config/tile/test.yaml)}"
```

It answers `{ righe: [...], totale, ms }` or `{ errore }`. `POST /api/config/valida` with the same
body returns `{ errori, avvisi }` without reading the data.

## 12. When something goes wrong

| Symptom | Likely cause |
|---|---|
| The tile does not show | `show_if: data` and no rows; `views` without the current view; `active: false`; excluded from the display |
| Values `—` | The field name in the text does not match: look at the "available fields" in the editor |
| Faded tile | Data older than `stale_after`: the source does not answer, the last good data is shown |
| File refused | The reason is in the advanced editor (*Advanced settings*); the previous version stays in force |
| Black image | `rtsp://` or an address the server cannot reach |
| iframe "refused" | The site does not allow embedding (Grafana: `allow_embedding`) |
