# 🖼 WikiMasters Images

Extension de navigateur **non officielle** pour [WikiMasters](https://www.wiki-masters.com) : elle ajoute des images aux cartes qui n'en ont pas, améliore les images de mauvaise qualité, et te laisse choisir, recadrer ou animer (GIF) l'image de n'importe quelle carte.

> Tout se passe **uniquement dans ton navigateur**. Rien n'est envoyé à WikiMasters, les autres joueurs ne voient pas tes changements, et l'extension n'agit jamais sur ton compte (pas d'achat, pas de vente, pas de clic automatique).

Fonctionne sur **Chrome, Brave, Edge** et **Firefox**.

👤 Créée par **Le Vagicien** (mon pseudo sur WikiMasters) — n'hésite pas à me faire signe en jeu !

---

## ✨ Ce que fait l'extension

| Fonction | Détail |
|---|---|
| **Remplit les cartes sans image** | Cherche automatiquement une image pour chaque carte affichant le logo WikiMasters. |
| **Plusieurs banques d'images** | Wikipédia (FR et EN), Wikidata, Deezer (chanteurs), TMDB (films, séries, acteurs — clé gratuite), Openverse, Google Images. |
| **Affiches de films** | Pour les films et séries, l'extension privilégie la vraie affiche. |
| **Images de mauvaise qualité** | Remplace aussi les images trop petites ou en bandeau étiré (réglable). |
| **Choisir l'image soi-même** | Ouvre une carte → **« 🖼 Changer l'image »** : propositions de toutes les banques + 3 images Google + possibilité de coller n'importe quel lien. |
| **GIF animés** 🎞 | Bouton « Proposer des GIF » dans la même fenêtre, ou colle un lien Giphy / Tenor. |
| **Recadrage** ✂ | Après chaque choix : glisse l'image et zoome pour un cadrage parfait. Marche aussi sur les images d'origine du jeu. |
| **Retouches** 🎨 | Luminosité, contraste, saturation, noir et blanc, sépia, miroir et vignette, dans la même fenêtre. |
| **Menu en bas de page** | Nombre de cartes modifiées, liste cliquable (la page défile jusqu'à la carte), choix du mode, affichage des boutons, compteur des images choisies à la main (avec la place restante dans la synchro). |
| **Choix des raretés** | Désactive les modifications automatiques pour certaines raretés (ex. les Communes) en un clic dans le menu du bas. Tes choix faits à la main restent appliqués. |
| **Synchro entre tes PC** | Tes choix manuels, recadrages et réglages suivent ton compte du navigateur. |
| **Sauvegarde** | Export / import d'un fichier depuis la page de réglages. |

### Les 3 modes (menu du bas ou réglages)
- **Seulement les cartes sans image**
- **Sans image + images de mauvaise qualité** *(par défaut, conseillé)*
- **Toutes les cartes** : remplace chaque image quand une meilleure est trouvée ailleurs (affiche, TMDB…).

Les images que tu choisis à la main sont **toujours prioritaires**.

---

## 📥 Installation

D'abord, télécharge le fichier qui correspond à ton navigateur, dans le dossier [`telechargements/`](telechargements/) :

| Navigateur | Fichier |
|---|---|
| Chrome, Brave, Edge | `wikimasters-images-chrome-brave-edge.zip` |
| Firefox | `wikimasters-images-firefox.zip` |

> Sur GitHub : clique sur le fichier, puis sur le bouton **« Download raw file »** (flèche vers le bas, à droite).

### Chrome / Brave / Edge

1. Fais un clic droit sur le zip téléchargé → **« Extraire tout »**. Range le dossier obtenu à un endroit où tu ne le supprimeras pas (par ex. *Documents*) : le navigateur en a besoin en permanence.
2. Ouvre la page des extensions en tapant dans la barre d'adresse :
   - Chrome : `chrome://extensions`
   - Brave : `brave://extensions`
   - Edge : `edge://extensions`
3. Active le **Mode développeur** (interrupteur en haut à droite ; sur Edge, en bas à gauche).
4. Clique sur **« Charger l'extension non empaquetée »** et choisis le dossier extrait (celui qui contient `manifest.json`).
5. Recharge ta page WikiMasters. C'est prêt !

> Chrome peut afficher au démarrage un message sur les « extensions en mode développeur » : c'est normal pour une extension installée à la main, tu peux le fermer.

### Firefox

1. Tape dans la barre d'adresse : `about:debugging#/runtime/this-firefox`
2. Clique sur **« Charger un module complémentaire temporaire… »** et choisis directement le fichier **zip** (pas besoin de l'extraire).
3. La page de réglages s'ouvre avec un bandeau jaune : clique sur **« Autoriser l'accès aux sites »** (Firefox demande cette autorisation à part).
4. Recharge ta page WikiMasters.

> ⚠ **Limite de Firefox** : une extension chargée de cette façon est **retirée quand tu fermes Firefox** (il faut refaire l'étape 2 à chaque fois). Pour l'installer de façon permanente, elle doit être signée par Mozilla (gratuit) — prévu pour une prochaine étape.

---

## 🔄 Mettre à jour

**Chrome / Brave / Edge** : télécharge le nouveau zip, remplace le contenu de ton dossier par les nouveaux fichiers, puis sur la page des extensions clique sur la **flèche ronde ↻** de « WikiMasters Images » et recharge WikiMasters.

**Firefox** : recharge le nouveau zip depuis `about:debugging` (bouton « Recharger » ou « Charger un module complémentaire temporaire »).

Tes choix, recadrages et réglages sont conservés.

---

## ⚙ Premiers pas

- **Réglages** : clique sur l'icône de l'extension (pièce de puzzle → *WikiMasters Images*).
- **Changer l'image d'une carte** : ouvre la carte sur WikiMasters → **« 🖼 Changer l'image »**.
  Tu peux aussi afficher un petit bouton 🖼 directement sur les cartes de la collection (case à cocher dans le menu du bas).
- **Clé TMDB (facultative, gratuite)** : donne les affiches de films/séries et les photos d'acteurs. La page de réglages explique comment l'obtenir en 2 minutes.

### Synchro entre plusieurs PC
- **Chrome / Edge** : automatique si tu es connecté au même compte Google (ou Microsoft pour Edge) avec la synchronisation activée.
- **Firefox** : automatique avec un compte Firefox et la synchronisation des modules activée.
- **Brave**, ou pour passer **de Chrome à Firefox** : utilise **Exporter / Importer une sauvegarde** dans les réglages.
- Capacité de la synchro : environ **2 000 cartes** modifiées à la main (données compressées ; au-delà, les plus récentes sont synchronisées). La sauvegarde par fichier n'a pas de limite.

### Grosses collections
L'extension est prévue pour des collections de **30 000 cartes et plus** : tu peux modifier autant de cartes que tu veux sur un PC. Elle garde en mémoire les recherches des 5 000 dernières cartes vues (les plus anciennes sont refaites si besoin), et la liste « toutes les cartes modifiées » du menu du bas se filtre par nom.

---

## ❓ Bon à savoir

- **Images Google et GIF** : ce sont des liens vers d'autres sites ; une image peut disparaître avec le temps. Dans ce cas la carte revient toute seule à l'image automatique.
- **Google** n'est interrogé que lorsque tu ouvres la fenêtre d'une carte, jamais en masse.
- **Les recadrages** ne modifient pas les images : seulement la façon dont elles sont affichées.
- Si une page affiche quelque chose d'étrange, recharge-la ; en dernier recours, désactive l'extension depuis la page des extensions.

---

## 🛠 Pour les développeurs

```
src/                 code de l'extension (commun à tous les navigateurs)
  content.js         ce qui tourne sur wiki-masters.com (détection des cartes, fenêtres, menu)
  background.js      recherche dans les banques d'images, cache, synchro entre PC
  options.html/.js   page de réglages
  style.css          styles injectés dans la page
build.py             fabrique dist/chrome-brave-edge et dist/firefox (+ les zips de telechargements/)
chrome-key.txt       clé publique qui fixe l'identifiant de l'extension sur Chrome (nécessaire pour la synchro)
```

Pour fabriquer les zips : `python3 build.py`

---

*Projet personnel de **Le Vagicien**, non affilié à WikiMasters. Les images affichées appartiennent à leurs auteurs respectifs ; l'extension ne fait que les afficher dans ton navigateur.*
