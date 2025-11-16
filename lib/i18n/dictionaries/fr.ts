const frDictionary = {
  "hero": {
    "tagline1": "EXPLORE DES CONTENUS ALÉATOIRES.",
    "tagline2": "ZÉRO MISSION. ZÉRO SENS. ZÉRO UTILITÉ.",
    "tagline3": "SEULEMENT DES SURPRISES INUTILES.",
    "startButton": "GO RANDOM",
    "noroscopeButton": "NOROSCOPE"
  },
  "noroscope": {
    "menu": "Noroscope",
    "titleBar": "Voici votre Noroscope du jour.",
    "shareTitle": "Partager votre Noroscope",
    "shareAction": "Partager ce Noroscope",
    "loading": "On aligne votre Noroscope...",
    "error": "Impossible de tout charger. Réessayez.",
    "retry": "Réessayer",
    "empty": "Contenu indisponible.",
    "expressionFallback": "L'ambiance hésite encore aujourd'hui.",
    "tiles": {
      "weirdDrop": "1. Weird Drop",
      "luckyMess": "2. Lucky Mess",
      "dumbSpark": "3. Dumb Spark",
      "randomVibe": "4. Random Vibe",
      "lostThought": "5. Lost Thought",
      "secretUselessness": "6. Secret Uselessness"
    },
    "instructions": "Appuyez sur les carrés et découvrez votre vibe du jour.",
    "progress": {
      "none": "Rien révélé pour l'instant. Choisis un carré pour commencer.",
      "partial": "{count}/{total} vibes révélées. Continue.",
      "full": ""
    },
    "revealAction": "Dévoiler cette vibe",
    "revealUnavailable": "Contenu en cours de chargement",
    "tileFallback": "Révèle-moi",
    "aiDisclaimer": "Généré par IA – {source}"
  },
  "nav": {
    "images": "images",
    "videos": "vidéos",
    "web": "web",
    "quotes": "citations",
    "jokes": "blagues",
    "facts": "faits"
  },
  "footer": {
    "social": "social",
    "legal": "Mentions légales.",
    "share": "partager"
  },
  "modal": {
    "randomAgain": "Encore",
    "like": "J'aime",
    "dislike": "Je n'aime pas",
    "share": "Partager"
  },
  "likes": {
    "title": "Vos Likes",
    "empty": "Aucun like",
    "maxReached": "Maximum 6 likes atteint!",
    "keep24h": "Conservé ici pendant 24 h.",
    "youTab": "YOU",
    "weTab": "WE",
    "youDescription": "Vos",
    "youSuffix": "sont gardés ici pendant 24 h.",
    "weDescription": "Voici les contenus les plus",
    "weSuffix": "aimés.",
    "banner": {
      "youPrefix": "Vos",
      "youSuffix": "sont gardés ici pendant 24 h.",
      "wePrefix": "Ici, les contenus les plus",
      "weSuffix": "aimés."
    },
    "weEmpty": "Pas encore de favoris globaux. Soyez le premier à aimer un contenu !"
  },
  "shareMenu": {
    "siteName": "Random",
    "title": "Partager",
    "close": "Fermer",
    "native": "Partager par message",
    "copy": "Copier",
    "copied": "Copié !"
  },
  "video": {
    "fullscreen": "Plein écran",
    "openExternally": "Ouvrir dans l'app"
  },
  "shuffle": {
    "title": "Filtrer le contenu",
    "all": "Tout",
    "imagesVideos": "Images & Vidéos",
    "imagesOnly": "Images seulement"
  },
  "minigames": {
    "card": {
      "unavailable": "Mini-jeu indisponible pour le moment.",
      "category": "Mini-jeu",
      "level": "Niveau {level}",
      "rulesIntro": "Prêt ? Voici les règles :",
      "defaultRule": "Amuse-toi et reste concentré.",
      "actions": {
        "start": "Jouer",
        "replay": "Rejouer",
        "guide": "Guide"
      },
      "result": {
        "win": "Gagné !",
        "lose": "Perdu"
      }
    },
    "games": {
      "tap-to-not-tap": {
        "name": "Tap-to-not-Tap",
        "tagline": "Suit le rythme sans te tromper.",
        "instructions": [
          "Les flashs TAP / DON'T TAP sont séparés par de vrais blancs.",
          "Clique uniquement pendant TAP, reste immobile pendant DON'T TAP.",
          "Au niveau 1–2, seulement 2 erreurs possibles."
        ],
        "status": {
          "ready": "La séquence commence...",
          "tap": "TAP ! Clique avant le prochain flash.",
          "dontTap": "DON'T TAP !",
          "tip": "Clique uniquement quand le mot TAP apparaît. Chaque flash arrive plus vite.",
          "encourage": "Bien joué ! Reste concentré.",
          "errorCount": "{reason} · erreur {current}/{max}"
        },
        "messages": {
          "missedTap": "Tu as manqué un TAP.",
          "wrongClick": "Il ne fallait pas cliquer.",
          "sequenceComplete": "Séquence complétée !",
          "sequenceInterrupted": "Séquence interrompue.",
          "tooManyErrors": "Trop d’erreurs !"
        },
        "details": {
          "steps": "Étapes",
          "success": "TAP réussis",
          "errors": "Erreurs"
        },
        "hud": {
          "step": "Étape",
          "tapCount": "TAP faits",
          "errors": "Erreurs"
        }
      },
      "emoji-echo": {
        "name": "Emoji Echo",
        "tagline": "Souviens-toi de la séquence.",
        "instructions": [
          "Deux séquences à retenir par niveau : ex. 2 puis 3 emojis.",
          "Chaque séquence est rejouée depuis zéro avec de nouveaux emojis.",
          "Reproduis-les sans faute avant la fin du chrono."
        ],
        "status": {
          "observeSequence": "Observe la séquence d’emojis…",
          "observe": "Observe…",
          "repeat": "Reproduis la séquence !"
        },
        "messages": {
          "timeout": "Trop tard.",
          "wrong": "Ce n’est pas la bonne suite !",
          "perfect": "Mémoire impeccable !"
        },
        "details": {
          "sequence": "Séquence atteinte"
        },
        "hud": {
          "progress": "Séquence {current}/{total} · Longueur {length}"
        }
      },
      "useless-progress-bar": {
        "name": "Useless Progress Bar",
        "tagline": "Une barre qui ne finit jamais… ou presque.",
        "instructions": [
          "Maintiens le bouton pour charger la barre en continu.",
          "Relâche exactement sur la cible indiquée (± tolérance).",
          "Chaque dépassement fait perdre instantanément."
        ],
        "status": {
          "ready": "Charge la barre inutile avec précision…",
          "target": "Objectif {current}/{total} · Vise {target}% (±{tolerance}%)"
        },
        "messages": {
          "timeout": "Temps écoulé !",
          "over": "Trop chargé !",
          "under": "Pas assez chargé !",
          "win": "Barre inutile parfaitement calibrée !"
        },
        "details": {
          "validated": "Cibles validées",
          "lastGoal": "Dernier objectif"
        },
        "hud": {
          "progress": "Charge {progress}% · Cible {target}% ± {tolerance}%",
          "timer": "Temps : {seconds}s · Cible {current}/{total}"
        },
        "buttons": {
          "press": "Appuie pour charger",
          "release": "Relâche pour valider"
        }
      },
      "left-or-right": {
        "name": "Left or Right?",
        "tagline": "Préfère la flèche la moins fréquente.",
        "instructions": [
          "Observe les dernières flèches (5 à 9 selon ton niveau).",
          "Choisis celle la moins utilisée.",
          "Limite tes erreurs successives."
        ],
        "details": {
          "rounds": "Tours",
          "success": "Réussites",
          "errors": "Erreurs"
        },
        "status": {
          "intro": "Choisis la flèche la moins fréquente dans les {count} dernières !",
          "analyzing": "Analyse en cours…",
          "tie": "Égalité parfaite : choisis n’importe laquelle.",
          "guidance": "{direction} est la moins fréquente (écart {diff}).",
          "correct": "Bien vu ! Continue.",
          "mistake": "Oups, ce n’était pas la meilleure option…"
        },
        "messages": {
          "tooMany": "Trop d’erreurs.",
          "success": "Challenge complété !",
          "fail": "Encore une erreur de trop.",
          "time": "Le temps est écoulé."
        },
        "feedback": {
          "correct": "Bien vu !",
          "wrong": "Essaie l’autre sens."
        },
        "directions": {
          "left": "← Gauche",
          "right": "Droite →",
          "either": "← ou →"
        },
        "hud": {
          "history": "Derniers {count} : ← {left} · → {right}",
          "target": "Cible : {label}",
          "round": "Round {round}/{total} · Réussites {successes} · Erreurs {mistakes}/{allowed} · Temps {seconds}s"
        }
      },
      "fake-loading-race": {
        "name": "Loading Race",
        "tagline": "Parie sur le loader gagnant.",
        "instructions": [
          "Choisis ton loader (3 à 5 barres) avant le départ.",
          "Tu peux changer de pari une seule fois pendant la course.",
          "Observe les variations de vitesse et devine la barre gagnante."
        ],
        "messages": {
          "start": "Parie sur le loader gagnant !",
          "selected": "Tu paries sur le loader {index}. Course lancée !",
          "swap": "Tu changes de pari pour le loader {index} !",
          "win": "Ton loader {index} passe la ligne en tête !",
          "lose": "Loader {index} gagne la course.",
          "hint": "Tu peux changer de pari une seule fois pendant la course."
        },
        "details": {
          "bet": "Pari",
          "none": "Aucun",
          "winner": "Gagnant"
        },
        "labels": {
          "loader": "Loader {index}"
        },
        "buttons": {
          "bet": "Parier",
          "switch": "Switch",
          "locked": "Pari",
          "replay": "Rejouer",
          "exit": "Quitter"
        },
        "finish": {
          "prefix": "Arrivée :",
          "entry": "{position}ᵉ → Loader {runner}"
        },
        "result": {
          "winTitle": "VICTOIRE !",
          "loseTitle": "DÉFAITE",
          "summary": "Pari : {bet} · Gagnant : Loader {winner}"
        }
      },
      "color-off-by-one": {
        "name": "Color Off-By-One",
        "tagline": "Une nuance presque identique.",
        "instructions": [
          "Observe la grille (3×3 qui passe en 5×5).",
          "Clique la nuance légèrement différente.",
          "Plus ton niveau monte, plus les teintes se rapprochent."
        ],
        "details": {
          "round": "Round",
          "difference": "Différence"
        },
        "status": {
          "look": "Repère la nuance différente.",
          "harder": "Encore plus subtil…"
        },
        "messages": {
          "win": "Œil de lynx !",
          "fail": "Ce n’était pas la bonne nuance."
        },
        "hud": {
          "round": "Round {round}/{total}"
        },
        "aria": {
          "tile": "Case {index}"
        }
      },
      "steady-spots": {
        "name": "Steady Spots",
        "tagline": "Atterris sur chaque spot sans trembler.",
        "instructions": [
          "Atteins chaque halo dans l’ordre indiqué.",
          "Maintiens le pointeur dessus ~2 s sans bouger pour valider.",
          "Les niveaux avancés ajoutent des spots et réduisent leur taille."
        ],
        "status": {
          "start": "Atteins chaque spot et maintiens-le environ 2 secondes.",
          "validated": "Spot validé !",
          "next": "Spot {next}/{total} — clique et maintiens 2 s.",
          "hold": "Ne bouge plus…",
          "win": "Tu as tenu tous les spots !"
        },
        "messages": {
          "time": "Temps écoulé.",
          "leftSpot": "Tu as quitté le spot !",
          "released": "Tu as relâché trop tôt.",
          "leftArea": "Tu as quitté la zone."
        },
        "details": {
          "validated": "Spots validés"
        },
        "hud": {
          "progress": "Spot {current}/{total} · Temps {seconds}s"
        },
        "overlay": {
          "hold": "Maintiens"
        }
      }
    }
  },
  "add": {
    "title": "Ajouter",
    "banner": "Ajoute le contenu que tu",
    "pendingNote": "Chaque proposition est vérifiée à la main. Merci pour ta patience !",
    "tabs": {
      "image": "Image",
      "text": "Blagues · Citations · Infos",
      "web": "Web",
      "video": "Vidéos"
    },
    "remainingSpace": "Espace disponible :",
    "storageFull": "Les soumissions sont pleines pour le moment. Réessaie plus tard.",
    "image": {
      "uploadLabel": "Dépose ou importe une image",
      "limit": "1 Mo max. PNG, JPG, GIF acceptés.",
      "select": "Choisir un fichier",
      "urlLabel": "Ou colle une URL d'image",
      "previewAlt": "Prévisualisation de l'image choisie",
      "remove": "Retirer le fichier",
      "firstName": "Prénom",
      "lastName": "Nom",
      "keywordsLabel": "Mots-clés de l'image",
      "keywordsHint": "Ajoute 4 à 5 mots-clés séparés par des virgules (portrait, nuit, rue...)"
    },
    "fileTooLarge": "L'image dépasse 1 Mo.",
    "errors": {
      "invalidImage": "Merci de choisir un fichier image.",
      "imageRequired": "Ajoute ou colle une image avant d'envoyer.",
      "textRequired": "Écris quelque chose avant d'envoyer.",
      "urlRequired": "Merci d'indiquer une URL valide.",
      "storageUnavailable": "Les soumissions sont indisponibles pour le moment. Réessaie plus tard.",
      "missingContributor": "Indique qui est l'auteur de cette image.",
      "missingAuthor": "Indique qui a prononcé cette citation.",
      "duplicate": "Ce lien est déjà dans notre file d'attente.",
      "missingKeywords": "Ajoute 4 à 5 mots-clés pour ton image."
    },
    "text": {
      "placeholder": "Écris ta meilleure blague, citation ou info...",
      "options": {
        "joke": "Blague",
        "quote": "Citation",
        "fact": "Info"
      },
      "authorLabel": "Qui a dit ça ?",
      "authorPlaceholder": "Auteur"
    },
    "web": {
      "urlLabel": "URL du site"
    },
    "video": {
      "urlLabel": "URL de la vidéo",
      "disclaimer": "On ne stocke pas les vidéos, uniquement des liens. Partage l'URL de la plateforme.",
      "embedWarning": "Ce lien semble difficile à intégrer. Nous vérifierons manuellement."
    },
    "analyzing": "Analyse en cours...",
    "analyzeError": "Impossible d'analyser ce lien pour l'instant. Tu peux quand même l'envoyer.",
    "email": {
      "label": "Ton e-mail (obligatoire)",
      "placeholder": "toi@example.com",
      "required": "Un e-mail est nécessaire pour envoyer."
    },
    "success": "Merci ! Nous examinerons rapidement ta proposition.",
    "error": "Impossible d'envoyer maintenant. Réessaie plus tard.",
    "submitting": "Envoi...",
    "submit": "Envoyer le contenu"
  },
  legal: {
    title: "Mentions légales",
    subtitle: "Clarté des responsabilités",
    close: "Fermer",
    disclaimer: {
      title: "Avertissement contenu",
      body:
        "Random agrège des contenus issus d’APIs et de soumissions manuelles. Nous ne pouvons pas tout vérifier à l’avance. Si un élément vous paraît illicite ou nuisible, envoyez une capture + URL à gorandomfun@gmail.com pour un retrait rapide.",
    },

    editor: {
      title: "Éditeur",
      body:
        "RANDOM Studio (entrepreneur individuel) — SIREN 514 550 698 — SIRET 514 550 698 00013\n" +
        "NAF 7410Z — 17 Grand Rue, 67110 Gundershoffen, France — Contact : gorandomfun@gmail.com"
    },

    hosting: {
      title: "Hébergement",
      body: "Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA — vercel.com"
    },

    purpose: {
      title: "Objet",
      body: "Contenus aléatoires (images, GIFs, vidéos, textes) pour le divertissement. Monétisation via des publicités contextuelles (A-ADS) et, parfois, des liens d’affiliation."
    },

    privacy: {
      title: "Cookies & vie privée",
      bodyPrefix: "Nous utilisons uniquement des cookies essentiels (préférence de langue, journal de consentement). A-ADS diffuse des publicités sans cookies de suivi ; si nous ajoutons d’autres traceurs, ils seront proposés ici pour opt-in.",
      manageCookies: "Gérer mes cookies",
      privacyPolicy: "Politique de confidentialité"
    },

    usa: {
      title: "USA",
      bodyPrefix: "Nous ne vendons ni ne partageons de données personnelles. Pour exercer vos droits CCPA/CPRA, écrivez à gorandomfun@gmail.com.",
      doNotSell: "Do Not Sell or Share"
    },

    dmca: {
      title: "DMCA",
      body: "Notifications DMCA : gorandomfun@gmail.com"
    },

    law: {
      title: "Droit applicable",
      body: "Droit français, sous réserve des dispositions impératives locales."
    }
  },
  "encourage": {
    "roundLabel": "Manche",
    "messages": [
      "Tu viens de percer une nouvelle couche.",
      "Une autre ronde de hasard franchie.",
      "Au-delà du banal, continue d’escalader.",
      "Un portail inédit vient de s’ouvrir.",
      "Le mainstream disparaît derrière toi.",
      "Niveau supérieur de bizarrerie débloqué.",
      "Tu dépasses tout ce qui est prévisible.",
      "De nouveaux signaux bizarres arrivent.",
      "L’élan t’entraîne encore plus loin.",
      "Tu as franchi la ligne de confort.",
      "Des recoins cachés s’allument.",
      "La frontière du bizarre te salue.",
      "La curiosité monte d’un cran.",
      "La carte s’arrête, ta trace continue.",
      "Un nouveau terrier vient d’apparaître.",
      "Des ondes rares collectées.",
      "Le moteur random gronde plus fort.",
      "Des idées hors piste sont débloquées.",
      "L’inattendu te fait désormais confiance.",
      "Ton badge d’explorateur brille davantage.",
      "Pousse encore, des merveilles étranges t’attendent.",
      "Tu as encore distancé la routine.",
      "Une chambre cryptique s’ouvre devant toi.",
      "Reste en mouvement, le signal pointe devant."
    ]
  }
}

export default frDictionary
