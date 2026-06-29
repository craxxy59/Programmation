# DispoCal

Site de disponibilités partagé, prévu pour être hébergé sur **Netlify**.

## Nouveau fonctionnement

- on arrive directement sur une page qui demande **le nom**
- après validation, on accède tout de suite au **calendrier partagé**
- il n’y a **plus de création d’événement**
- le calendrier affiche les **14 prochains jours**
- plusieurs personnes peuvent remplir leurs disponibilités sur le même planning
- vue d’ensemble avec comptage des participants par créneau

## Stack

- Frontend statique : `index.html`, `styles.css`, `app.js`
- Backend : **Netlify Functions**
- Stockage partagé : **Netlify Blobs**

## API utilisée

- `GET /.netlify/functions/board` : récupère le calendrier partagé courant + les participants
- `POST /.netlify/functions/save-availability` : enregistre les disponibilités d’une personne

## Déploiement sur Netlify

1. Mets ces fichiers dans un dépôt GitHub.
2. Va sur Netlify.
3. Clique sur **Add new project**.
4. Importe le dépôt.
5. Déploie.

Le fichier `netlify.toml` indique déjà :

- `publish = "."`
- `functions = "netlify/functions"`

## Lancement local

```bash
npm install
npx netlify dev
```

## Notes

- pas de comptes utilisateurs
- chaque navigateur garde un identifiant local pour éviter que tout le monde écrase la même fiche
- le planning est un **calendrier partagé unique**
- la fenêtre affichée est **glissante sur 14 jours**

## Évolutions possibles

- page admin pour régler les horaires et le nombre de jours
- vue mensuelle
- export CSV / ICS
- suppression d’un participant
- code d’accès privé pour protéger le planning
