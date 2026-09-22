# Website sample — 200 houses (stratified random sample)

Parmi l'ensemble des biens retenus, un échantillon de 200 biens a été tiré par échantillonnage aléatoire stratifié. Deux variables de stratification ont été retenues : la localisation et le prix. La localisation est approximée par le premier chiffre du code postal, qui correspond grosso modo aux provinces belges. Le prix est discrétisé en quartiles du logarithme du prix final d'adjudication (auction.finalPriceLog), calculés sur l'ensemble des biens disponibles. Le croisement de ces deux variables définit jusqu'à 36 strates (9 régions × 4 classes de prix). Les 200 tirages ont été répartis entre les strates proportionnellement à leur effectif, avec arrondi par la méthode des plus grands restes afin d'obtenir un total d'exactement 200. Au sein de chaque strate, les biens ont ensuite été tirés par échantillonnage aléatoire simple sans remise, avec une graine aléatoire fixe (42) pour garantir la reproductibilité. Grâce à l'allocation proportionnelle, l'échantillon est auto-pondéré : les distributions marginales de la localisation et du prix y reproduisent celles de la population de départ, ce que nous avons vérifié en comparant les proportions observées dans l'échantillon et dans la population.

## Survey allocation (after sampling)

- Source archive: `propfiles_sample200.zip` (200 property folders).
- Floor plans and technical drawings are excluded from the photos shown to raters (same visual heuristic as before).
- 10 expert users; each rates **20 houses** (partition of the 200, seed 42).
- For each house, raters grade **6 attributes**, each from a **different family**. Attribute assignment is balanced so that the 38 individual attributes appear a similar number of times across the 200 houses.
