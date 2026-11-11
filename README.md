# Natuur

Leer-app (PWA) om de flora en fauna van Nederland en rond Best te leren herkennen. In iOS-stijl, zonder framework of build-stap.

**Online:** https://glennbuilds.github.io/NatuurTrainer/ — open in Safari → Deel → *Zet op beginscherm*.

## Wat zit erin
- 8 categorieën (vogels, zoogdieren, bomen, bloemen, paddenstoelen, vlinders, insecten, amfibieën & reptielen); kies er één, combineer er meer, of alles door elkaar
- Quiz (foto → naam en naam → foto) of flitskaarten. Een nieuwe soort zie je eerst en krijg je in dezelfde ronde twee keer terug
- Afleiders worden lastiger naarmate je een soort beter kent: eerst soorten waarmee je hem zelf verwarde, dan soorten waarmee anderen hem verwarren, dan naaste verwanten
- Gespreide herhaling (5 niveaus): wat je fout doet komt snel terug, wat je kent pas na dagen. Goed antwoorden vóór een soort aan de beurt is telt niet als stap omhoog
- Reservekopie van je voortgang bewaren en terugzetten (tab Voortgang)
- Filter *Rond Best*: alleen soorten die binnen 15 km zijn waargenomen op iNaturalist
- Gids met foto's, herkenningstip en Wikipedia-tekst; voortgang per categorie
- Werkt offline nadat foto's één keer geladen zijn; voortgang blijft lokaal op je telefoon

## Soorten toevoegen
1. Voeg een regel toe aan `data/soorten.txt` (`categorie | naam | wetenschappelijke naam | tip`)
2. `python3 scripts/bouw_data.py` — haalt foto's, tellingen en tekst op en schrijft `data/species.json`
3. `python3 scripts/versie.py` (hoogt het versienummer op in `index.html` en `sw.js`), commit en push

Doe stap 3 ook na elke wijziging in `app.js` of `styles.css`, anders blijft de iPhone de oude bestanden gebruiken.

Lokaal bekijken: `python3 -m http.server 8790` en open http://127.0.0.1:8790

Bronnen: foto's en waarnemingen via [iNaturalist](https://www.inaturalist.org) (licentie per foto in de app), teksten van de Nederlandstalige Wikipedia (CC BY-SA).
