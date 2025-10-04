# Importer des contenus générés par IA

Ce guide explique comment enrichir la base (blagues, facts, quotes) avec un lot généré via l’interface ChatGPT, sans utiliser d’API payante.

## 1. Générer le JSON dans ChatGPT

Copier/coller le prompt ci-dessous dans ChatGPT :

```
Génère 20 éléments mêlant blagues, facts et citations. Répond STRICTEMENT avec un tableau JSON.
Chaque entrée doit respecter le format suivant :
{
  "type": "joke" | "fact" | "quote",
  "lang": "fr" (ou "en", "de", ...),
  "text": "texte",
  "author": "auteur" (uniquement pour type quote),
  "tags": ["mot-clé", ...],
  "source": "ChatGPT",
  "model": "gpt-5-pro"
}
Pas d'autres champs, pas de commentaires hors du JSON.
```

Télécharger la réponse JSON ou la copier telle quelle.

## 2. Importer via l’interface admin

1. Ouvrir `/admin/import-ai` en local.
2. Saisir la valeur de `ADMIN_INGEST_KEY`.
3. Coller le JSON dans la zone de texte.
4. Cliquer sur **Analyser (dry-run)** pour vérifier : le résultat affiche combien d’éléments seraient importés/mis à jour et les éventuelles erreurs.
5. Cliquer sur **Importer** pour stocker les contenus en base.

## 3. Résultat côté application

- Chaque élément importé est marqué comme `variant: 'ai'`, avec les métadonnées (`ai.source`, `ai.model`, `lang`, `hash`).
- Un disclaimer “Généré par IA” apparaît automatiquement sur les jokes/facts/quotes correspondants.
- Les contenus existants ne sont pas modifiés (upsert par hash, aucune suppression).

## 4. Bonnes pratiques

- Traiter les lots par langue (ex. 50 blagues FR, puis 50 EN).
- Vérifier que le JSON ne contient pas de texte vide ou de format incorrect (la page affiche les erreurs exactes).
- Vous pouvez regénérer autant de fois que nécessaire : un contenu identique sera reconnu comme doublon grâce au hash.

Ainsi, vous remplissez la base depuis ChatGPT sans avoir besoin d’un modèle tournant en continu ni d’appels API payants.
