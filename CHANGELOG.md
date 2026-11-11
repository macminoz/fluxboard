# Changelog

**English** · [Italiano](CHANGELOG.it.md) (the Italian file has the full details of every release)

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions
[SemVer](https://semver.org/).

## [Unreleased]

- **English and Italian**, English by default: interface, server messages, Tile market and
  documentation in both languages (`language: en|it` in global.yaml, in Settings or `?lang=`).
  Keys and values of the YAML files work in both languages, even mixed (`server/alias.js`); the
  editor writes in the language of the file; conditions with `and`/`or`/`within`/`over`.
- Example configuration in English; English guide (`docs/guide.md`).

## [1.0.1-CURRENT] - 2026-11-08 … 2026-11-11

- **Panel mode** (`panel: true` on a display profile): read only and lightweight for wall touch
  panels; cameras as a frame every 2 seconds (`/api/immagine?…&fotogramma=1`).
- **Who connects**: Fluxboard remembers the screens that open the page and gives each a profile
  (`screens:` in global.yaml, *Settings → Screens*).
- **Alert signal** in the header (blinking red for critical alerts on any workspace, yellow for
  warnings), optional gentle sound, push notifications to a webhook, Node-RED or ntfy.
- **Workspace tour** every 15/30/60 seconds, paused while editing.
- **Ack and Ignore** on any list tile, with a history of ignored rows to readmit them.
- **Resizable table columns**, compact times (`20m ago`), version shown next to the title.
- Fixed: the page froze on slow touch panels (every update redrew every tile); summary icons
  disappeared on browsers without `color-mix()`; tile intensity now independent from the label.

## [1.0.0-beta.1] - 2026-11-08

- Sections with a position of their own; own layouts for the Alarms and Full views; label
  colours; software inventory; fixes found in the syslog (MJPEG memory, config watcher, temporary
  files).

## [1.0.0] - alpha releases (2026-11-07 … 2026-11-08)

- **Kinds of tile** (models with fields): trend, timeline, measure, data correlation, critical
  messages, stream, note, shell output; the Tile market grouped by kind; redesigned editor and
  edit bar.

## [0.7.x] - 2026-11-07

- Explicit layout (x/y, Grafana-like), per-tile views, label icons, full-window editor; closable
  tiles, quick duplicate, adaptive height.

## [0.4.0 – 0.6.1] - 2026-11-07

- Views Basic/Medium/Advanced/Alarms/Full, Ack for 24 hours, graphical condition editor, named
  snapshots, consumption and disk-space tiles, explicit positions with gravity.

## [0.3.x] - 2026-11-06 … 2026-11-07

- Tile market, service probes (TCP/HTTP/DNS, certificates), critical messages with
  acknowledgement, Node-RED and Uptime Kuma plugins, Palo Alto firewall source.

## [0.1.0 – 0.2.0] - 2026-11-04

- First release: YAML tiles and sources (InfluxDB, VictoriaLogs, HTTP, static), web editor with
  validation and live test, three reading levels, display profiles, workspaces, snapshots,
  sections per label, cameras through Fluxboard, actions with a password.
