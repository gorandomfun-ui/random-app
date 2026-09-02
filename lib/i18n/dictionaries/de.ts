const deDictionary = {
  "hero": {
    "tagline1": "ENTDECKE ZUFÄLLIGE INHALTE.",
    "tagline2": "KEINE MISSION, KEIN ZIEL, KEIN GRUND.",
    "tagline3": "NUR NUTZLOSE ÜBERRASCHUNG.",
    "startButton": "GO RANDOM",
    "noroscopeButton": "6 RANDOM"
  },
  "noroscope": {
    "menu": "6 RANDOM",
    "titleBar": "Dein 6 RANDOM",
    "shareTitle": "Teile dein 6 RANDOM",
    "shareAction": "Dieses 6 RANDOM teilen",
    "loading": "Wir richten dein 6 RANDOM aus...",
    "error": "Nicht alles konnte geladen werden. Bitte erneut versuchen.",
    "retry": "Erneut versuchen",
    "empty": "Noch kein Inhalt verfügbar.",
    "expressionFallback": "Die Stimmung ist heute noch unentschieden.",
    "tiles": {
      "weirdDrop": "1. Seltsamer Drop",
      "luckyMess": "2. Glückliches Chaos",
      "dumbSpark": "3. Dummer Funke",
      "randomVibe": "4. Zufalls-Vibe",
      "lostThought": "5. Verlorener Gedanke",
      "secretUselessness": "6. Geheime Nutzlosigkeit"
    },
    "instructions": "Tippe auf die Quadrate und entdecke deine Tagesvibe.",
    "progress": {
      "none": "Noch nichts enthüllt. Tipp ein Quadrat zum Start.",
      "partial": "{count}/{total} Vibes enthüllt. Weiterklicken.",
      "full": ""
    },
    "revealAction": "Diese Vibe enthüllen",
    "revealUnavailable": "Inhalt wird geladen",
    "tileFallback": "Enthülle mich",
    "aiDisclaimer": "Mit KI erzeugt – {source}"
  },
  "nav": {
    "images": "Bilder",
    "videos": "Videos",
    "web": "Web",
    "quotes": "Zitate",
    "jokes": "Witze",
    "facts": "Fakten",
    "other": "Anderes"
  },
  "footer": {
    "social": "Sozial",
    "legal": "Impressum.",
    "share": "Teilen"
  },
  "modal": {
    "randomAgain": "Nochmal",
    "like": "Gefällt mir",
    "dislike": "Gefällt nicht",
    "share": "Teilen"
  },
  "language": {
    "title": "Sprache"
  },
  "quiz": {
    "score": "Quiz",
    "points": "Pkt",
    "correct": "Richtig!",
    "wrong": "Falsch"
  },
  "likes": {
    "title": "Deine Likes",
    "empty": "Noch keine Likes",
    "maxReached": "Maximum 6 Likes erreicht!",
    "keep24h": "Lokal auf diesem Gerät gespeichert.",
    "youTab": "YOU",
    "weTab": "WE",
    "youDescription": "Deine",
    "youSuffix": "bleiben auf diesem Gerät gespeichert.",
    "weDescription": "Die Top",
    "weSuffix": "Inhalte der Community.",
    "banner": {
      "youPrefix": "Deine",
      "youSuffix": "bleiben auf diesem Gerät gespeichert.",
      "wePrefix": "Top",
      "weSuffix": "Inhalte der Community."
    },
    "weEmpty": "Noch keine globalen Favoriten. Sei der Erste, der etwas liked!"
  },
  "shareMenu": {
    "siteName": "Random",
    "title": "Teilen",
    "close": "Schließen",
    "foundOn": "Schau, was ich auf goRANDOM.fun gefunden habe",
    "instagram": "Instagram",
    "copy": "Link kopieren",
    "copied": "Kopiert!",
    "itemsLabel": "Geteilte Inhalte"
  },
  "video": {
    "fullscreen": "Vollbild",
    "openExternally": "In App öffnen"
  },
  "shuffle": {
    "title": "Inhalt filtern",
    "all": "Alles",
    "imagesVideos": "Bilder & Videos",
    "imagesOnly": "Nur Bilder",
    "other": "Anderes"
  },
  "minigames": {
    "card": {
      "unavailable": "Minispiel derzeit nicht verfügbar.",
      "category": "Minispiel",
      "level": "Level {level}",
      "rulesIntro": "Bereit? Hier sind die Regeln:",
      "defaultRule": "Hab Spaß und bleib fokussiert.",
      "actions": {
        "start": "Start",
        "replay": "Nochmal",
        "guide": "Anleitung"
      },
      "result": {
        "win": "Sieg!",
        "lose": "Niederlage"
      }
    },
    "games": {
      "tap-to-not-tap": {
        "name": "Tap-to-not-Tap",
        "tagline": "Folge dem Rhythmus ohne Fehler.",
        "instructions": [
          "TAP-/DON'T-TAP-Blitze werden durch echte Pausen getrennt.",
          "Klicke nur bei TAP, bleib während DON'T TAP ruhig.",
          "In Level 1–2 sind nur 2 Fehler erlaubt."
        ],
        "status": {
          "ready": "Sequenz startet...",
          "tap": "TAP! Klicke vor dem nächsten Blitz.",
          "dontTap": "DON'T TAP!",
          "tip": "Klicke nur, wenn TAP erscheint. Jeder Blitz wird schneller.",
          "encourage": "Gute Reaktion! Bleib dran.",
          "errorCount": "{reason} · Fehler {current}/{max}"
        },
        "messages": {
          "missedTap": "Du hast einen TAP verpasst.",
          "wrongClick": "Du hättest nicht klicken dürfen.",
          "sequenceComplete": "Sequenz geschafft!",
          "sequenceInterrupted": "Sequenz unterbrochen.",
          "tooManyErrors": "Zu viele Fehler!"
        },
        "details": {
          "steps": "Schritte",
          "success": "TAP-Treffer",
          "errors": "Fehler"
        },
        "hud": {
          "step": "Schritt",
          "tapCount": "TAP-Zähler",
          "errors": "Fehler"
        }
      },
      "emoji-echo": {
        "name": "Emoji Echo",
        "tagline": "Merk dir die Sequenz.",
        "instructions": [
          "Zwei Sequenzen pro Level, z. B. 2 dann 3 Emojis.",
          "Jede Sequenz startet neu mit frischen Emojis.",
          "Gib sie fehlerfrei ein, bevor die Zeit endet."
        ],
        "status": {
          "observeSequence": "Präge dir die Emoji-Reihe ein...",
          "observe": "Beobachten...",
          "repeat": "Gib die Reihenfolge ein!"
        },
        "messages": {
          "timeout": "Zu langsam.",
          "wrong": "Das war nicht die richtige Reihenfolge!",
          "perfect": "Perfektes Gedächtnis!"
        },
        "details": {
          "sequence": "Erreichte Sequenz"
        },
        "hud": {
          "progress": "Sequenz {current}/{total} · Länge {length}"
        }
      },
      "useless-progress-bar": {
        "name": "Useless Progress Bar",
        "tagline": "Eine Leiste, die nie endet… fast.",
        "instructions": [
          "Halte den Button, um die Leiste durchgehend zu laden.",
          "Lass genau auf dem Ziel los (± Toleranz).",
          "Jedes Überschießen beendet den Versuch sofort."
        ],
        "status": {
          "ready": "Lade die nutzlose Leiste präzise...",
          "target": "Ziel {current}/{total} · Triff {target}% (±{tolerance}%)"
        },
        "messages": {
          "timeout": "Zeit abgelaufen!",
          "over": "Zu viel geladen!",
          "under": "Zu wenig geladen!",
          "win": "Perfekt kalibrierte nutzlose Leiste!"
        },
        "details": {
          "validated": "Ziele geschafft",
          "lastGoal": "Letztes Ziel"
        },
        "hud": {
          "progress": "Ladung {progress}% · Ziel {target}% ± {tolerance}%",
          "timer": "Zeit: {seconds}s · Ziel {current}/{total}"
        },
        "buttons": {
          "press": "Gedrückt halten",
          "release": "Loslassen zum Bestätigen"
        }
      },
      "left-or-right": {
        "name": "Left or Right?",
        "tagline": "Wähle den selteneren Pfeil.",
        "instructions": [
          "Beobachte die letzten Pfeile (5 bis 9 je nach Level).",
          "Wähle den Pfeil, der am seltensten vorkommt.",
          "Begrenze aufeinanderfolgende Fehler."
        ],
        "details": {
          "rounds": "Runden",
          "success": "Treffer",
          "errors": "Fehler"
        },
        "status": {
          "intro": "Wähle den seltensten Pfeil der letzten {count}!",
          "analyzing": "Analyse läuft...",
          "tie": "Gleichstand: wähle irgendeinen.",
          "guidance": "{direction} ist am seltensten (Diff {diff}).",
          "correct": "Guter Riecher! Weiter so.",
          "mistake": "Ups, das war nicht optimal..."
        },
        "messages": {
          "tooMany": "Zu viele Fehler.",
          "success": "Challenge geschafft!",
          "fail": "Noch ein Fehler zu viel.",
          "time": "Zeit ist abgelaufen."
        },
        "feedback": {
          "correct": "Guter Riecher!",
          "wrong": "Probier die andere Richtung."
        },
        "directions": {
          "left": "← Links",
          "right": "Rechts →",
          "either": "← oder →"
        },
        "hud": {
          "history": "Letzte {count}: ← {left} · → {right}",
          "target": "Ziel: {label}",
          "round": "Runde {round}/{total} · Treffer {successes} · Fehler {mistakes}/{allowed} · Zeit {seconds}s"
        }
      },
      "fake-loading-race": {
        "name": "Loading Race",
        "tagline": "Setz auf den Sieger-Loader.",
        "instructions": [
          "Wähle vor dem Start deinen Loader (3 bis 5 Balken).",
          "Du darfst deine Wette einmal während des Rennens wechseln.",
          "Beobachte die Geschwindigkeiten und errate den Gewinner."
        ],
        "messages": {
          "start": "Setz auf den Sieger-Loader!",
          "selected": "Du wettest auf Loader {index}. Rennen startet!",
          "swap": "Du wechselst zu Loader {index}!",
          "win": "Dein Loader {index} erreicht als Erster das Ziel!",
          "lose": "Loader {index} gewinnt das Rennen.",
          "hint": "Du darfst nur einmal während des Rennens wechseln."
        },
        "details": {
          "bet": "Wette",
          "none": "Keine",
          "winner": "Sieger"
        },
        "labels": {
          "loader": "Loader {index}"
        },
        "buttons": {
          "bet": "Wette",
          "switch": "Wechseln",
          "locked": "Wette",
          "replay": "Nochmal",
          "exit": "Beenden"
        },
        "finish": {
          "prefix": "Ziel:",
          "entry": "{position}. → Loader {runner}"
        },
        "result": {
          "winTitle": "Sieg!",
          "loseTitle": "Niederlage",
          "summary": "Wette: {bet} · Sieger: Loader {winner}"
        }
      },
      "color-off-by-one": {
        "name": "Color Off-By-One",
        "tagline": "Eine fast identische Nuance.",
        "instructions": [
          "Betrachte das Raster (von 3×3 bis 5×5).",
          "Klicke auf das leicht andere Feld.",
          "Höhere Level machen die Farben fast identisch."
        ],
        "details": {
          "round": "Runde",
          "difference": "Differenz"
        },
        "status": {
          "look": "Finde die abweichende Nuance.",
          "harder": "Noch subtiler..."
        },
        "messages": {
          "win": "Adleraugen!",
          "fail": "Das war nicht das andere Feld."
        },
        "hud": {
          "round": "Runde {round}/{total}"
        },
        "aria": {
          "tile": "Feld {index}"
        }
      },
      "steady-spots": {
        "name": "Steady Spots",
        "tagline": "Land auf jedem Spot ohne Zittern.",
        "instructions": [
          "Erreiche jeden Halo in der angegebenen Reihenfolge.",
          "Halte den Zeiger ~2 s ruhig darauf.",
          "Höhere Level fügen Spots hinzu und verkleinern sie."
        ],
        "status": {
          "start": "Erreiche jeden Spot und halte ca. 2 Sekunden.",
          "validated": "Spot geschafft!",
          "next": "Spot {next}/{total} — klicken und 2 s halten.",
          "hold": "Nicht bewegen...",
          "win": "Du hast alle Spots gehalten!"
        },
        "messages": {
          "time": "Zeit abgelaufen.",
          "leftSpot": "Du hast den Spot verlassen!",
          "released": "Zu früh losgelassen.",
          "leftArea": "Du hast das Feld verlassen."
        },
        "details": {
          "validated": "Spots geschafft"
        },
        "hud": {
          "progress": "Spot {current}/{total} · Zeit {seconds}s"
        },
        "overlay": {
          "hold": "Halten"
        }
      }
    }
  },
  "add": {
    "title": "Hinzufügen",
    "banner": "Füge den Content hinzu, den du",
    "pendingNote": "Jeder Beitrag wird manuell geprüft. Danke für deine Geduld!",
    "tabs": {
      "image": "Bild",
      "text": "Witze · Zitate · Fakten",
      "web": "Web",
      "video": "Videos"
    },
    "remainingSpace": "Verfügbarer Speicher:",
    "storageFull": "Der Speicher für Einsendungen ist aktuell voll. Versuch es später erneut.",
    "image": {
      "uploadLabel": "Zieh ein Bild hierher oder lade es hoch",
      "limit": "Max. 1 MB. PNG, JPG, GIF möglich.",
      "select": "Datei wählen",
      "urlLabel": "Oder eine Bild-URL einfügen",
      "previewAlt": "Vorschau des ausgewählten Bildes",
      "remove": "Datei entfernen",
      "firstName": "Vorname",
      "lastName": "Nachname",
      "keywordsLabel": "Bild-Schlüsselwörter",
      "keywordsHint": "Füge 4–5 Stichwörter durch Kommata getrennt hinzu (Portrait, Nacht, Straße...)"
    },
    "fileTooLarge": "Das Bild ist größer als 1 MB.",
    "errors": {
      "invalidImage": "Bitte eine Bilddatei auswählen.",
      "imageRequired": "Füge ein Bild hinzu oder verlinke eins, bevor du sendest.",
      "textRequired": "Schreibe etwas, bevor du sendest.",
      "urlRequired": "Bitte eine gültige URL angeben.",
      "storageUnavailable": "Einsendungen sind gerade nicht verfügbar. Versuch es später erneut.",
      "missingContributor": "Wer hat dieses Bild erstellt? Bitte Name angeben.",
      "missingAuthor": "Bitte gib an, wer dieses Zitat gesagt hat.",
      "duplicate": "Dieser Link befindet sich bereits in unserer Warteschlange.",
      "missingKeywords": "Bitte gib 4–5 Schlüsselwörter für dein Bild an."
    },
    "text": {
      "placeholder": "Schreibe deinen besten Witz, dein Zitat oder deinen Fakt...",
      "options": {
        "joke": "Witz",
        "quote": "Zitat",
        "fact": "Fakt"
      },
      "authorLabel": "Wer hat es gesagt?",
      "authorPlaceholder": "Autor"
    },
    "web": {
      "urlLabel": "Website-URL"
    },
    "video": {
      "urlLabel": "Video-URL",
      "disclaimer": "Wir hosten nur Links, keine Videodateien. Teile die Plattform-URL.",
      "embedWarning": "Dieser Link lässt sich eventuell nicht einbetten. Wir prüfen das manuell."
    },
    "analyzing": "Analysiere...",
    "analyzeError": "Dieser Link konnte noch nicht analysiert werden. Du kannst ihn trotzdem senden.",
    "email": {
      "label": "Deine E-Mail (Pflichtfeld)",
      "placeholder": "du@example.com",
      "required": "Für Einsendungen benötigen wir eine E-Mail."
    },
    "success": "Danke! Wir prüfen deinen Beitrag in Kürze.",
    "error": "Senden gerade nicht möglich. Bitte versuch es erneut.",
    "submitting": "Senden...",
    "submit": "Content senden"
  },
  legal: {
    title: "Impressum",
    subtitle: "Transparenz & Verantwortung",
    close: "Schließen",
    disclaimer: {
      title: "Hinweis zu Inhalten",
      body:
        "Random bündelt Inhalte aus APIs und manuellen Einsendungen. Eine Vorabprüfung jedes Beitrags ist nicht möglich. Bitte sende bei rechtswidrig oder schädlich wirkenden Inhalten einen Screenshot/Link an gorandomfun@gmail.com, damit wir schnell entfernen können.",
    },

    editor: {
      title: "Herausgeber",
      body:
        "RANDOM Studio (Einzelunternehmen) — SIREN 514 550 698 — SIRET 514 550 698 00013\n" +
        "NAF 7410Z — 17 Grand Rue, 67110 Gundershoffen, Frankreich — Kontakt: gorandomfun@gmail.com"
    },

    hosting: {
      title: "Hosting",
      body: "Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA — vercel.com"
    },

    purpose: {
      title: "Zweck",
      body: "Zufällige Inhalte (Bilder, GIFs, Videos, Texte) zur Unterhaltung. Monetarisierung über kontextbezogene Anzeigen (A-ADS) und gelegentliche Affiliate-Links."
    },

    privacy: {
      title: "Cookies & Datenschutz",
      bodyPrefix: "Wir setzen nur unbedingt erforderliche Cookies (Sprachauswahl, Einwilligungsprotokoll). A-ADS liefert Anzeigen ohne Tracking-Cookies; zusätzliche Tracker werden hier zur Einwilligung angeboten.",
      manageCookies: "Cookies verwalten",
      privacyPolicy: "Datenschutzerklärung"
    },

    usa: {
      title: "USA",
      bodyPrefix: "Wir verkaufen oder teilen keine personenbezogenen Daten. Für Rechte nach CCPA/CPRA schreiben Sie an gorandomfun@gmail.com.",
      doNotSell: "Do Not Sell or Share"
    },

    dmca: {
      title: "DMCA",
      body: "DMCA-Mitteilungen: gorandomfun@gmail.com"
    },

    law: {
      title: "Anwendbares Recht",
      body: "Anwendbares Recht: Frankreich, vorbehaltlich zwingender lokaler Vorschriften."
    }
  }  ,
  "encourage": {
    "roundLabel": "Runde",
    "messages": [
      "Du hast eine brandneue Schicht durchbrochen.",
      "Eine weitere Zufallsrunde gemeistert.",
      "Jenseits des Offensichtlichen – weiter steigen.",
      "Ein frisches Portal wurde geöffnet.",
      "Der Mainstream bleibt hinter dir.",
      "Neue Stufe des Kuriosen freigeschaltet.",
      "Du lässt das Vorhersagbare zurück.",
      "Frische Glitch-Signale voraus.",
      "Der Schwung zieht dich tiefer.",
      "Die Komfortlinie ist überschritten.",
      "Versteckte Winkel leuchten auf.",
      "Die Grenze des Absonderlichen grüßt dich.",
      "Neugier steigt auf ein neues Level.",
      "Wo Karten enden, geht deine Spur weiter.",
      "Ein neuer Kaninchenbau öffnet sich.",
      "Seltene Vibes eingesammelt.",
      "Der Zufallsmotor dröhnt lauter.",
      "Offroad-Ideen freigeschaltet.",
      "Das Unerwartete vertraut dir jetzt.",
      "Dein Explorer-Badge leuchtet stärker.",
      "Drück weiter, fremde Wunder warten.",
      "Routine hinter dir gelassen – schon wieder.",
      "Eine weitere kryptische Kammer öffnet sich.",
      "Bleib unruhig, das Signal zeigt nach vorn."
    ]
  }


}

export default deDictionary
