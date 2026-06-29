# DispoCal

Petit site de disponibilités partagé, prévu pour être hébergé sur **Netlify**.

## Ce que fait ce MVP

- création de plusieurs événements
- lien partageable par événement
- saisie des disponibilités par plusieurs personnes
- vue créneaux horaires (30 min ou 1 h)
- bouton "tout le jour" pour remplir une journée entière
- vue d'ensemble avec comptage des participants par créneau
- pas de comptes utilisateurs

## Stack

- Frontend statique : `index.html`, `styles.css`, `app.js`
- Backend : **Netlify Functions**
- Stockage partagé : **Netlify Blobs**

## Fichiers importants

- `index.html` : interface
- `app.js` : logique client
- `netlify/functions/create-event.mjs` : création d'événement
- `netlify/functions/event.mjs` : lecture d'un événement + participants
- `netlify/functions/save-availability.mjs` : enregistrement des disponibilités
- `netlify/functions/lib/data.mjs` : couche de stockage et validations

## Déploiement sur Netlify

### Option simple

1. Mets ces fichiers dans un dépôt GitHub.
2. Va sur Netlify.
3. Clique sur **Add new project**.
4. Importe le dépôt.
5. Laisse Netlify détecter automatiquement le projet.
6. Déploie.

Le fichier `netlify.toml` indique déjà :

- `publish = "."`
- `functions = "netlify/functions"`

## Lancement local

```bash
npm install
npx netlify dev
```

Puis ouvre l'URL fournie par Netlify CLI.

## Limitations actuelles du MVP

- pas d'authentification
- pas de permissions avancées
- chaque navigateur garde un identifiant local pour éviter d'écraser la fiche d'un autre participant
- pas encore de suppression d'événement
- plage limitée à 45 jours pour garder une grille lisible

## Idées pour la V2

- comptes utilisateurs
- lien admin et lien participant
- suppression / archivage d'événements
- export CSV / ICS
- commentaires par créneau
- filtres par participant
