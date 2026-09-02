# Mes Finances

Un site de suivi de dépenses et de simulation d'investissement, **100 % local** : les données de chaque utilisateur restent dans son propre navigateur (localStorage). Aucun compte, aucun serveur, aucune donnée à héberger ou sauvegarder pour vous.

## Fonctionnalités

- **Tableau de bord** : solde, entrées/dépenses par mois ou par année, graphique en anneau des catégories, évolution jour par jour (mois) ou mois par mois (année).
- **Transactions** : liste complète avec recherche, filtres, modification de catégorie et suppression.
- **Catégorisation automatique** : des règles par mot-clé (ex. « migros » → Alimentation) classent les opérations à l'import. Modifier une catégorie propose de créer une règle.
- **Import bancaire** : fichiers **CSV** ou **Excel (.xlsx)** exportés depuis le site de la banque. Détection automatique des colonnes (date, libellé, montant, ou débit/crédit séparés) avec aperçu avant import. Les doublons sont ignorés, donc on peut réimporter le même fichier sans risque.
- **Investissements** : trois sous-pages.
  - *Portefeuille* : montant total investi, valeur actuelle, plus-value brute, nette (après frais et impôts, taux configurable) et en %, avec graphique de la valeur totale et par actif, à la demi-journée près. Les actifs en devises différentes sont convertis via des taux de change réglables.
  - *Mes actifs* : une fiche par investissement (BTC, ETF, fonds…) avec quantité, prix de revient, dernier cours, graphique du cours annoté des achats (▲) et ventes (▼), saisie des opérations (date + matin/après-midi, quantité, prix, frais) et historique des cours importable depuis Excel (`=HISTORIQUE.ACTIONS(...)`) ou CSV, ou saisi à la main, ou récupéré automatiquement par API gratuite :
    - **CoinGecko** (sans clé) pour les cryptos — un an d'historique en un clic ;
    - **Twelve Data** (clé gratuite personnelle, ~800 requêtes/jour) pour les actions et ETF cotés ;
    - **Frankfurter/BCE** (sans clé) pour actualiser les taux de change du portefeuille.
  - *Simulation* : simulateur d'intérêts composés (capital de départ, versement mensuel, rendement, durée) avec projection graphique et étapes clés.
- **Sauvegarde** : export/restauration des données en JSON (utile pour changer d'appareil).

## Mettre en ligne sur GitHub Pages

1. Créez un dépôt sur [github.com](https://github.com) (par exemple `mes-finances`), public.
2. Ajoutez tous les fichiers de ce dossier au dépôt :
   - soit en glissant les fichiers dans l'interface web de GitHub (« Add file » → « Upload files »),
   - soit en ligne de commande :
     ```bash
     git init
     git add .
     git commit -m "Premier commit"
     git branch -M main
     git remote add origin https://github.com/VOTRE_NOM/mes-finances.git
     git push -u origin main
     ```
3. Dans le dépôt : **Settings → Pages → Source : Deploy from a branch → Branch : main / (root) → Save**.
4. Après une ou deux minutes, le site est en ligne à l'adresse :
   `https://VOTRE_NOM.github.io/mes-finances/`

## Tester en local

Ouvrez simplement `index.html` dans un navigateur, ou lancez un petit serveur :

```bash
python3 -m http.server 8000
# puis ouvrez http://localhost:8000
```

Le fichier `exemple-releve.csv` permet de tester l'import sans données réelles.

## Structure

```
index.html          — page unique (4 onglets)
css/style.css       — styles
js/app.js           — toute la logique (import, stockage, graphiques, simulateur)
exemple-releve.csv  — relevé bancaire fictif pour tester
exemple-cours-btc.csv — historique de cours fictif pour tester
```

Bibliothèques chargées par CDN : [Chart.js](https://www.chartjs.org/) (graphiques) et [SheetJS](https://sheetjs.com/) (lecture des fichiers Excel).

API gratuites utilisées à la demande (uniquement quand on clique sur les boutons de mise à jour) : [CoinGecko](https://www.coingecko.com/fr/api) pour les cryptos, [Twelve Data](https://twelvedata.com/) pour les actions/ETF (clé gratuite à créer soi-même), [Frankfurter](https://frankfurter.dev/) pour les taux de change BCE. Seuls des symboles publics sont envoyés — jamais vos données personnelles. La clé Twelve Data est stockée localement dans le navigateur.

## Confidentialité

Les relevés importés sont lus **dans le navigateur** et stockés dans `localStorage`. Rien n'est envoyé à un serveur. Chaque visiteur ne voit que ses propres données, sur son propre appareil. En contrepartie : pas de synchronisation entre appareils — d'où le bouton de sauvegarde JSON.
