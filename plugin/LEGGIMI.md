# Plugin

[English](README.md) · **Italiano**

Ogni file `.js` in questa cartella che esporta `tipo` e `leggi()` diventa un nuovo tipo di
sorgente, usabile in `config/sorgenti/*.yaml` con `tipo: <nome>`. Il contratto è descritto in
`server/connettori/index.js`; `server/connettori/http.js` è un buon esempio da copiare.

Serve solo per formati che il connettore `http` (JSON) non copre: tutto il resto si fa in YAML.
