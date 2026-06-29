# DispoCal

Calendrier partagé de disponibilités pour Netlify.

## Fonctionnement

- page d’entrée avec le nom
- calendrier partagé
- navigation par périodes de 14 jours avec les flèches
- enregistrement des disponibilités par personne

## Stack

- Frontend statique : `index.html`, `styles.css`, `app.js`
- Backend : `Netlify Functions`
- Stockage : `Netlify Blobs`

## API

- `GET /.netlify/functions/board`
- `GET /.netlify/functions/board?start=YYYY-MM-DD`
- `POST /.netlify/functions/save-availability`

## Déploiement

1. pousse le projet sur GitHub
2. importe le repo dans Netlify
3. déploie

`netlify.toml` est déjà prêt.

## Local

```bash
npm install
npx netlify dev
```
