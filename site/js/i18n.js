const I18N = {
en:{
  app_title:"Perceptual Attribute Survey", tab_welcome:"Welcome", tab_validate:"1. Attribute Validation", tab_scoring:"2. House Scoring", tab_admin:"Admin Panel",
  sign_out:"Sign out", lot:"Lot", section:"Section:", order:"Order:", all:"All", all_sections:"All Sections", first_only:"First-Order Only", second_only:"Second-Order Only",
  your_progress:"Your progress", next:"Next", prev:"Previous", rationale:"Rationale",
  val_instructions:"For each attribute, indicate whether it is relevant for a typical buyer's willingness to pay. Only if you answer Yes, also classify it as first-order or second-order. If you answer No, no order classification is needed.",
  score_instructions:"Select a house, review its listing photographs, then grade the six attributes shown from a typical buyer's point of view, based only on what you see.",
  relevant_q:"Relevant for a buyer's valuation?", yes:"Yes", no:"No", order_q:"Order classification?", order_1:"1st Order", order_2:"2nd Order",
  saved:"saved", save_all:"Save", completed:"Completed", scored:"Scored", your_grade:"Your grade…", photos:"photos", no_houses:"No houses assigned.",
  admin_blurb:"Export CSVs here. Each save adds a new file in the GitHub answers repo (nothing on this site can overwrite or delete saved answers).",
  save_ok:"Saved", save_fail:"Save failed — try again",
  export_val:"Attribute Validation CSV", export_score:"House Scoring CSV", export_combined:"Combined Export (with AI grades)",
  reset_all:"Reset all responses", reset_confirm:"Delete ALL validation and scoring answers for every user? This cannot be undone.", reset_done:"All responses cleared. Clean sheet.",
  user_progress:"User Progress", user:"User", houses:"Houses", validation:"Validation", scoring:"Scoring",
  progress_val:"Attribute Validation", progress_score:"House Scoring",
  welcome_html:`<h2>Expert survey on perceptual housing attributes</h2>
<p class="affil"><strong>Alexandre Garel</strong> &amp; <strong>Koen W. De Bock</strong> · Audencia Business School (Nantes, France)<br>
Non-commercial academic research · <a href="https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5987534" target="_blank" rel="noopener">Working paper on SSRN</a></p>
<h3>Purpose</h3>
<p>We study how <strong>visual impressions from listing photos</strong> relate to house prices. Multimodal AI can extract perceptual attributes (facade condition, natural light, landscaping, etc.). We ask real-estate experts to validate whether these attributes matter and how houses look on those attributes — so we can compare human judgment with the AI.</p>
<p><strong>Please answer from a typical buyer's point of view</strong> (what would influence willingness to pay), not from your professional valuation methodology or appraisal checklist.</p>
<h3>What we ask</h3>
<p><strong>1. Attribute Validation:</strong> For each of 38 attributes — is it relevant for buyers? If Yes, is it 1st or 2nd order? (AI order is hidden; nothing is pre-answered.)</p>
<p><strong>2. House Scoring:</strong> You will rate 20 houses. For each house, grade 6 attributes (each from a different family) from the photos only. Floor plans are excluded. AI grades are hidden. Answers save automatically.</p>
<h3>Data use</h3>
<p>Responses are used only for academic research (working paper and related publications). Results are analysed in aggregate; we do not publish individual identities. Participation is voluntary. More detail is in the invitation email.</p>
<table class="scale-table"><tr><th>Grade</th><th>Meaning</th></tr>
<tr><td><strong>Excellent</strong></td><td>Top quality, no visible issues</td></tr>
<tr><td><strong>Good</strong></td><td>Above average, minor imperfections</td></tr>
<tr><td><strong>Average</strong></td><td>Typical, neither notably good nor bad</td></tr>
<tr><td><strong>Bad</strong></td><td>Below average, visible problems</td></tr>
<tr><td><strong>Terrible</strong></td><td>Severe issues, major defects</td></tr>
<tr><td><strong>Unknown</strong></td><td>Cannot be assessed from available photos</td></tr></table>`
},
fr:{
  app_title:"Enquête attributs perceptuels", tab_welcome:"Bienvenue", tab_validate:"1. Validation des attributs", tab_scoring:"2. Notation des maisons", tab_admin:"Administration",
  sign_out:"Déconnexion", lot:"Lot", section:"Section :", order:"Ordre :", all:"Tous", all_sections:"Toutes les sections", first_only:"1er ordre seulement", second_only:"2e ordre seulement",
  your_progress:"Votre progression", next:"Suivant", prev:"Précédent", rationale:"Justification",
  val_instructions:"Pour chaque attribut, indiquez s'il est pertinent pour la disposition à payer d'un acheteur typique. Seulement si vous répondez Oui, classifiez-le aussi en 1er ou 2e ordre. Si Non, aucune classification d'ordre n'est demandée.",
  score_instructions:"Sélectionnez une maison, examinez ses photos, puis notez les six attributs affichés du point de vue d'un acheteur typique, uniquement à partir de ce que vous voyez.",
  relevant_q:"Pertinent pour un acheteur ?", yes:"Oui", no:"Non", order_q:"Classification d'ordre ?", order_1:"1er ordre", order_2:"2e ordre",
  saved:"enregistré", save_all:"Enregistrer", completed:"Terminé", scored:"Noté", your_grade:"Votre note…", photos:"photos", no_houses:"Aucune maison assignée.",
  admin_blurb:"Exportez les CSV ici. Chaque enregistrement ajoute un nouveau fichier dans le dépôt GitHub des réponses (ce site ne peut ni écraser ni supprimer les réponses sauvegardées).",
  save_ok:"Enregistré", save_fail:"Échec de l'enregistrement — réessayez",
  export_val:"CSV validation des attributs", export_score:"CSV notation des maisons", export_combined:"Export combiné (avec notes IA)",
  reset_all:"Effacer toutes les réponses", reset_confirm:"Supprimer TOUTES les réponses de validation et de notation pour tous les utilisateurs ? Irréversible.", reset_done:"Toutes les réponses ont été effacées.",
  user_progress:"Progression des utilisateurs", user:"Utilisateur", houses:"Maisons", validation:"Validation", scoring:"Notation",
  progress_val:"Validation des attributs", progress_score:"Notation des maisons",
  welcome_html:`<h2>Enquête d'experts sur les attributs perceptuels du logement</h2>
<p class="affil"><strong>Alexandre Garel</strong> &amp; <strong>Koen W. De Bock</strong> · Audencia Business School (Nantes, France)<br>
Recherche académique non commerciale · <a href="https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5987534" target="_blank" rel="noopener">Working paper sur SSRN</a></p>
<h3>Objectif</h3>
<p>Nous étudions le lien entre les <strong>impressions visuelles des photos d'annonces</strong> et les prix des maisons. L'IA multimodale peut extraire des attributs perceptuels (état de façade, lumière naturelle, aménagement, etc.). Nous demandons à des experts immobiliers de valider si ces attributs comptent et comment les maisons se présentent — pour comparer le jugement humain à l'IA.</p>
<p><strong>Répondez du point de vue d'un acheteur typique</strong> (ce qui influencerait la disposition à payer), et non selon votre méthodologie professionnelle d'évaluation.</p>
<h3>Ce que nous demandons</h3>
<p><strong>1. Validation des attributs :</strong> pour chacun des 38 attributs — pertinent pour les acheteurs ? Si Oui, 1er ou 2e ordre ? (ordre IA masqué ; rien n'est prérempli.)</p>
<p><strong>2. Notation des maisons :</strong> vous notez 20 maisons. Pour chacune, notez 6 attributs (chacun d'une famille différente) à partir des photos seules. Les plans de sol sont exclus. Notes IA masquées. Sauvegarde automatique.</p>
<h3>Utilisation des données</h3>
<p>Les réponses servent uniquement à la recherche académique (working paper et publications associées). Analyse agrégée ; pas de publication d'identités individuelles. Participation volontaire. Plus de détails dans l'e-mail d'invitation.</p>
<table class="scale-table"><tr><th>Note</th><th>Signification</th></tr>
<tr><td><strong>Excellent</strong></td><td>Qualité maximale, aucun problème visible</td></tr>
<tr><td><strong>Bon</strong></td><td>Au-dessus de la moyenne, imperfections mineures</td></tr>
<tr><td><strong>Moyen</strong></td><td>Typique, ni notablement bon ni mauvais</td></tr>
<tr><td><strong>Mauvais</strong></td><td>En dessous de la moyenne, problèmes visibles</td></tr>
<tr><td><strong>Très mauvais</strong></td><td>Problèmes graves, défauts majeurs</td></tr>
<tr><td><strong>Inconnu</strong></td><td>Non évaluable à partir des photos disponibles</td></tr></table>`
},
nl:{
  app_title:"Enquête perceptuele attributen", tab_welcome:"Welkom", tab_validate:"1. Attribuutvalidatie", tab_scoring:"2. Huizen scoren", tab_admin:"Beheer",
  sign_out:"Uitloggen", lot:"Lot", section:"Sectie:", order:"Orde:", all:"Alles", all_sections:"Alle secties", first_only:"Alleen 1e orde", second_only:"Alleen 2e orde",
  your_progress:"Uw voortgang", next:"Volgende", prev:"Vorige", rationale:"Onderbouwing",
  val_instructions:"Geef per attribuut aan of het relevant is voor de betalingsbereidheid van een typische koper. Alleen bij Ja classificeert u het ook als 1e of 2e orde. Bij Nee is geen ordeclassificatie nodig.",
  score_instructions:"Kies een huis, bekijk de foto's en geef de zes getoonde attributen een score vanuit het standpunt van een typische koper, alleen op basis van wat u ziet.",
  relevant_q:"Relevant voor een koper?", yes:"Ja", no:"Nee", order_q:"Ordeclassificatie?", order_1:"1e orde", order_2:"2e orde",
  saved:"opgeslagen", save_all:"Opslaan", completed:"Voltooid", scored:"Gescoord", your_grade:"Uw score…", photos:"foto's", no_houses:"Geen huizen toegewezen.",
  admin_blurb:"Exporteer CSV's hier. Elke opslag voegt een nieuw bestand toe in de GitHub-antwoordenrepo (deze site kan opgeslagen antwoorden niet overschrijven of wissen).",
  save_ok:"Opgeslagen", save_fail:"Opslaan mislukt — probeer opnieuw",
  export_val:"CSV attribuutvalidatie", export_score:"CSV huisenscores", export_combined:"Gecombineerde export (met AI-scores)",
  reset_all:"Alle antwoorden wissen", reset_confirm:"ALLE validatie- en scoringsantwoorden van alle gebruikers verwijderen? Dit kan niet ongedaan worden.", reset_done:"Alle antwoorden gewist. Schone lei.",
  user_progress:"Voortgang gebruikers", user:"Gebruiker", houses:"Huizen", validation:"Validatie", scoring:"Scoring",
  progress_val:"Attribuutvalidatie", progress_score:"Huizen scoren",
  welcome_html:`<h2>Expertenquête over perceptuele woningattributen</h2>
<p class="affil"><strong>Alexandre Garel</strong> &amp; <strong>Koen W. De Bock</strong> · Audencia Business School (Nantes, Frankrijk)<br>
Niet-commercieel academisch onderzoek · <a href="https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5987534" target="_blank" rel="noopener">Working paper op SSRN</a></p>
<h3>Doel</h3>
<p>We onderzoeken hoe <strong>visuele indrukken uit advertentiefoto's</strong> samenhangen met woningprijzen. Multimodale AI kan perceptuele attributen extraheren (gevelstaat, natuurlijk licht, tuin, enz.). We vragen vastgoedexperts te valideren of deze attributen ertoe doen en hoe woningen erop scoren — om menselijk oordeel met de AI te vergelijken.</p>
<p><strong>Antwoord vanuit het standpunt van een typische koper</strong> (wat de betalingsbereidheid beïnvloedt), niet vanuit uw professionele waarderingsmethodologie.</p>
<h3>Wat we vragen</h3>
<p><strong>1. Attribuutvalidatie:</strong> voor elk van de 38 attributen — relevant voor kopers? Bij Ja: 1e of 2e orde? (AI-orde verborgen; niets vooraf ingevuld.)</p>
<p><strong>2. Huizen scoren:</strong> u beoordeelt 20 huizen. Per huis geeft u 6 attributen (elk uit een andere familie) een score op basis van alleen de foto's. Plattegronden zijn uitgesloten. AI-scores verborgen. Automatisch opslaan.</p>
<h3>Gebruik van gegevens</h3>
<p>Antwoorden dienen uitsluitend voor academisch onderzoek (working paper en gerelateerde publicaties). Analyse op geaggregeerd niveau; geen publicatie van individuele identiteiten. Deelname is vrijwillig. Meer details in de uitnodigingsmail.</p>
<table class="scale-table"><tr><th>Score</th><th>Betekenis</th></tr>
<tr><td><strong>Uitstekend</strong></td><td>Topkwaliteit, geen zichtbare problemen</td></tr>
<tr><td><strong>Goed</strong></td><td>Boven gemiddeld, kleine imperfecties</td></tr>
<tr><td><strong>Gemiddeld</strong></td><td>Typisch, noch opvallend goed noch slecht</td></tr>
<tr><td><strong>Slecht</strong></td><td>Onder gemiddeld, zichtbare problemen</td></tr>
<tr><td><strong>Zeer slecht</strong></td><td>Ernstige problemen, grote gebreken</td></tr>
<tr><td><strong>Onbekend</strong></td><td>Niet te beoordelen op basis van beschikbare foto's</td></tr></table>`
}
};
