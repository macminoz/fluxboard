# Plugins

**English** · [Italiano](LEGGIMI.md)

Every `.js` file in this folder that exports `tipo` and `leggi()` becomes a new source type,
usable in `config/sorgenti/*.yaml` with `type: <name>`. The contract is described in
`server/connettori/index.js`; `server/connettori/http.js` is a good example to copy.

Only needed for formats the `http` connector (JSON) does not cover: everything else is YAML.
