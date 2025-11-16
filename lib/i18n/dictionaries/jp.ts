const jpDictionary = {
  "hero": {
    "tagline1": "ランダムコンテンツを探索。",
    "tagline2": "ミッションなし、ゴールなし、理由なし。",
    "tagline3": "無駄な驚きだけ。",
    "startButton": "GO RANDOM",
    "noroscopeButton": "NOROSCOPE"
  },
  "noroscope": {
    "menu": "Noroscope",
    "titleBar": "今日のノロスコープはこちら。",
    "shareTitle": "ノロスコープをシェア",
    "shareAction": "このノロスコープを共有",
    "loading": "ノロスコープを調整中...",
    "error": "すべてを読み込めませんでした。再試行してください。",
    "retry": "再試行",
    "empty": "利用できるコンテンツがありません。",
    "expressionFallback": "今日のムードはまだ決めかねています。",
    "tiles": {
      "weirdDrop": "1. ヘンなドロップ",
      "luckyMess": "2. ラッキーなカオス",
      "dumbSpark": "3. まぬけスパーク",
      "randomVibe": "4. ランダムバイブ",
      "lostThought": "5. 迷子の思考",
      "secretUselessness": "6. 秘密のムダ"
    },
    "instructions": "四角をタップして、今日のバイブを見つけよう。",
    "progress": {
      "none": "まだ何も解放されていません。最初の四角をタップ。",
      "partial": "{count}/{total} のバイブを解放。どんどんいこう。",
      "full": ""
    },
    "revealAction": "このバイブを解放",
    "revealUnavailable": "読み込み中",
    "tileFallback": "解放して",
    "aiDisclaimer": "AI生成 — {source}"
  },
  "nav": {
    "images": "画像",
    "videos": "動画",
    "web": "ウェブ",
    "quotes": "引用",
    "jokes": "ジョーク",
    "facts": "事実"
  },
  "footer": {
    "social": "ソーシャル",
    "legal": "法的通知。",
    "share": "共有"
  },
  "modal": {
    "randomAgain": "もう一度",
    "like": "いいね",
    "dislike": "よくない",
    "share": "共有"
  },
  "likes": {
    "title": "あなたのいいね",
    "empty": "まだいいねはありません",
    "maxReached": "最大6いいねに達しました！",
    "keep24h": "ここでは24時間保存されます。",
    "youTab": "YOU",
    "weTab": "WE",
    "youDescription": "あなたの",
    "youSuffix": "は24時間ここで保存されます。",
    "weDescription": "みんながたくさん",
    "weSuffix": "選んだコンテンツ。",
    "banner": {
      "youPrefix": "あなたの",
      "youSuffix": "は24時間ここで保存されます。",
      "wePrefix": "みんながたくさん",
      "weSuffix": "選んだコンテンツ。"
    },
    "weEmpty": "まだグローバルなお気に入りはありません。最初のいいねを押してみて！"
  },
  "shareMenu": {
    "siteName": "Random",
    "title": "共有",
    "close": "閉じる",
    "native": "メッセージで共有",
    "copy": "コピー",
    "copied": "コピーしました！"
  },
  "video": {
    "fullscreen": "全画面",
    "openExternally": "アプリで開く"
  },
  "shuffle": {
    "title": "コンテンツをフィルター",
    "all": "すべて",
    "imagesVideos": "画像と動画",
    "imagesOnly": "画像のみ"
  },
  "minigames": {
    "card": {
      "unavailable": "ミニゲームは現在利用できません。",
      "category": "ミニゲーム",
      "level": "レベル {level}",
      "rulesIntro": "準備はいい？ ルールはこちら:",
      "defaultRule": "楽しみながら集中しよう。",
      "actions": {
        "start": "スタート",
        "replay": "もう一度",
        "guide": "ガイド"
      },
      "result": {
        "win": "勝利！",
        "lose": "敗北"
      }
    },
    "games": {
      "tap-to-not-tap": {
        "name": "Tap-to-not-Tap",
        "tagline": "リズムを崩さずについていこう。",
        "instructions": [
          "TAP / DON'T TAP の点滅は本物の空白で区切られる。",
          "TAPのときだけクリック、DON'T TAP中は静止。",
          "レベル1〜2はミス2回まで。"
        ],
        "status": {
          "ready": "シーケンス開始...",
          "tap": "TAP！ 次の点滅の前にクリック。",
          "dontTap": "DON'T TAP！",
          "tip": "TAPと表示されたときだけ押して。点滅はどんどん速くなる。",
          "encourage": "ナイス！ 集中を続けて。",
          "errorCount": "{reason} · エラー {current}/{max}"
        },
        "messages": {
          "missedTap": "TAPを逃したよ。",
          "wrongClick": "今はクリックしちゃダメ。",
          "sequenceComplete": "シーケンス達成！",
          "sequenceInterrupted": "シーケンス中断。",
          "tooManyErrors": "ミスが多すぎる！"
        },
        "details": {
          "steps": "ステップ",
          "success": "TAP成功",
          "errors": "エラー"
        },
        "hud": {
          "step": "ステップ",
          "tapCount": "TAPカウント",
          "errors": "エラー"
        }
      },
      "emoji-echo": {
        "name": "Emoji Echo",
        "tagline": "並びを覚えて。",
        "instructions": [
          "各レベルで2つのシーケンス（例: 絵文字2個→3個）。",
          "毎回 新しい絵文字で最初から再生。",
          "タイマーが切れる前に完璧に再現。"
        ],
        "status": {
          "observeSequence": "絵文字の並びを観察して…",
          "observe": "観察中...",
          "repeat": "同じ順番で入力！"
        },
        "messages": {
          "timeout": "遅すぎた。",
          "wrong": "順番が違うよ！",
          "perfect": "完璧な記憶！"
        },
        "details": {
          "sequence": "達成したシーケンス"
        },
        "hud": {
          "progress": "シーケンス {current}/{total} · 長さ {length}"
        }
      },
      "useless-progress-bar": {
        "name": "Useless Progress Bar",
        "tagline": "終わらないバー…ほぼ。",
        "instructions": [
          "ボタンを押し続けてバーをチャージ。",
          "指定の目標で正確に離す（±許容）。",
          "超過したら即失敗。"
        ],
        "status": {
          "ready": "無駄なバーを正確にチャージ...",
          "target": "目標 {current}/{total} · {target}% (±{tolerance}%) を狙え"
        },
        "messages": {
          "timeout": "タイムアップ！",
          "over": "チャージしすぎ！",
          "under": "まだ足りない！",
          "win": "無駄バーを完璧にキャリブレーション！"
        },
        "details": {
          "validated": "クリアした目標",
          "lastGoal": "最後の目標"
        },
        "hud": {
          "progress": "チャージ {progress}% · 目標 {target}% ± {tolerance}%",
          "timer": "時間: {seconds}秒 · 目標 {current}/{total}"
        },
        "buttons": {
          "press": "長押しでチャージ",
          "release": "離して判定"
        }
      },
      "left-or-right": {
        "name": "Left or Right?",
        "tagline": "出現の少ない矢印を選ぼう。",
        "instructions": [
          "レベルに応じて直近5〜9本の矢印を観察。",
          "一番少ない矢印を選択。",
          "連続ミスを抑える。"
        ],
        "details": {
          "rounds": "ラウンド数",
          "success": "成功数",
          "errors": "ミス"
        },
        "status": {
          "intro": "直近{count}で最も少ない矢印を選んで！",
          "analyzing": "分析中...",
          "tie": "同数。どちらでもOK。",
          "guidance": "{direction} がより少ない (差 {diff})。",
          "correct": "いい選択！ 続けて。",
          "mistake": "うーん、ベストではなかった…"
        },
        "messages": {
          "tooMany": "ミスが多すぎる。",
          "success": "チャレンジ達成！",
          "fail": "ミスが一つ多かった。",
          "time": "時間切れ。"
        },
        "feedback": {
          "correct": "いい選択！",
          "wrong": "反対側を試して。"
        },
        "directions": {
          "left": "← 左",
          "right": "右 →",
          "either": "← か →"
        },
        "hud": {
          "history": "直近{count}: ← {left} · → {right}",
          "target": "ターゲット: {label}",
          "round": "ラウンド {round}/{total} · 成功 {successes} · ミス {mistakes}/{allowed} · 時間 {seconds}秒"
        }
      },
      "fake-loading-race": {
        "name": "Loading Race",
        "tagline": "勝つローダーに賭けよう。",
        "instructions": [
          "スタート前にローダー（3〜5本）を選ぶ。",
          "レース中の乗り換えは1回だけ。",
          "スピードの変化を見て勝者を当てよう。"
        ],
        "messages": {
          "start": "勝ちそうなローダーに賭けて！",
          "selected": "ローダー {index} に賭けたよ。レース開始！",
          "swap": "ローダー {index} に乗り換え！",
          "win": "あなたのローダー {index} がトップでゴール！",
          "lose": "ローダー {index} が勝利。",
          "hint": "レース中に乗り換えできるのは1回だけ。"
        },
        "details": {
          "bet": "ベット",
          "none": "なし",
          "winner": "勝者"
        },
        "labels": {
          "loader": "ローダー {index}"
        },
        "buttons": {
          "bet": "ベット",
          "switch": "スイッチ",
          "locked": "ベット",
          "replay": "リプレイ",
          "exit": "終了"
        },
        "finish": {
          "prefix": "ゴール:",
          "entry": "{position}位 → ローダー {runner}"
        },
        "result": {
          "winTitle": "勝利！",
          "loseTitle": "敗北",
          "summary": "ベット: {bet} · 勝者: ローダー {winner}"
        }
      },
      "color-off-by-one": {
        "name": "Color Off-By-One",
        "tagline": "ほぼ同じ色味。",
        "instructions": [
          "3×3から5×5までのグリッドを観察。",
          "わずかに違うマスをクリック。",
          "レベルが上がるほど色差が小さくなる。"
        ],
        "details": {
          "round": "ラウンド",
          "difference": "差"
        },
        "status": {
          "look": "違う色を見つけよう。",
          "harder": "さらに微妙に…"
        },
        "messages": {
          "win": "鷹の目だね！",
          "fail": "違うマスだったよ。"
        },
        "hud": {
          "round": "ラウンド {round}/{total}"
        },
        "aria": {
          "tile": "タイル {index}"
        }
      },
      "steady-spots": {
        "name": "Steady Spots",
        "tagline": "震えずに全スポットへ。",
        "instructions": [
          "指示された順番で各ハローに到達。",
          "ポインターを動かさず約2秒ホールド。",
          "上級レベルではスポットが増え、サイズも縮む。"
        ],
        "status": {
          "start": "各スポットに触れて約2秒キープ。",
          "validated": "スポットクリア！",
          "next": "スポット {next}/{total} — クリックして2秒維持。",
          "hold": "動かないで…",
          "win": "すべてのスポットをキープできた！"
        },
        "messages": {
          "time": "タイムアップ。",
          "leftSpot": "スポットから外れた！",
          "released": "離すのが早すぎる。",
          "leftArea": "フィールド外に出たよ。"
        },
        "details": {
          "validated": "クリアしたスポット"
        },
        "hud": {
          "progress": "スポット {current}/{total} · 時間 {seconds}秒"
        },
        "overlay": {
          "hold": "ホールド"
        }
      }
    }
  },
  "add": {
    "title": "投稿",
    "banner": "あなたの好きなコンテンツを追加",
    "pendingNote": "すべての投稿は人が確認します。少しだけお待ちください。",
    "tabs": {
      "image": "画像",
      "text": "ジョーク・引用・豆知識",
      "web": "ウェブ",
      "video": "動画"
    },
    "remainingSpace": "利用可能な容量：",
    "storageFull": "現在は投稿容量がいっぱいです。後でもう一度お試しください。",
    "image": {
      "uploadLabel": "画像をドロップまたはアップロード",
      "limit": "最大1MB。PNG・JPG・GIFが利用できます。",
      "select": "ファイルを選択",
      "urlLabel": "または画像URLを貼り付け",
      "previewAlt": "選択した画像のプレビュー",
      "remove": "ファイルを削除",
      "firstName": "名",
      "lastName": "姓",
      "keywordsLabel": "画像のキーワード",
      "keywordsHint": "カンマ区切りで4〜5個のキーワードを入力 (ポートレート, 夜, 都市 など)"
    },
    "fileTooLarge": "画像サイズが1MBを超えています。",
    "errors": {
      "invalidImage": "画像ファイルを選択してください。",
      "imageRequired": "送信する前に画像を追加するかURLを入力してください。",
      "textRequired": "送信前にテキストを入力してください。",
      "urlRequired": "正しいURLを入力してください。",
      "storageUnavailable": "現在投稿機能は利用できません。後でもう一度お試しください。",
      "missingContributor": "この画像の作者の名前を教えてください。",
      "missingAuthor": "この引用を発言した人を教えてください。",
      "duplicate": "このリンクはすでに審査待ちです。",
      "missingKeywords": "画像用に4〜5個のキーワードを入力してください。"
    },
    "text": {
      "placeholder": "お気に入りのジョークや引用、豆知識を書いてください...",
      "options": {
        "joke": "ジョーク",
        "quote": "引用",
        "fact": "豆知識"
      },
      "authorLabel": "誰の言葉？",
      "authorPlaceholder": "発言者"
    },
    "web": {
      "urlLabel": "ウェブサイトURL"
    },
    "video": {
      "urlLabel": "動画URL",
      "disclaimer": "動画ファイルは保存できません。プラットフォームのURLを共有してください。",
      "embedWarning": "このリンクは埋め込みできない可能性があります。後で手動確認します。"
    },
    "analyzing": "解析中...",
    "analyzeError": "今はリンクを解析できませんが、そのまま送信できます。",
    "email": {
      "label": "メールアドレス（必須）",
      "placeholder": "you@example.com",
      "required": "送信にはメールアドレスが必要です。"
    },
    "success": "ありがとう！内容をまもなく確認します。",
    "error": "今は送信できません。少し時間をあけてお試しください。",
    "submitting": "送信中...",
    "submit": "コンテンツを送信"
  },
  legal: {
    title: "特定商取引法に基づく表記",
    subtitle: "運営責任の明確化",
    close: "閉じる",
    disclaimer: {
      title: "コンテンツに関する注意",
      body:
        "Random は外部 API や手動投稿からコンテンツを集約しており、すべてを事前検証することはできません。違法または有害と思われる内容を見つけた場合は、スクリーンショットと URL を添えて gorandomfun@gmail.com までご連絡ください。迅速に対応します。",
    },

    editor: {
      title: "運営者",
      body:
        "RANDOM Studio（個人事業）— SIREN 514 550 698 — SIRET 514 550 698 00013\n" +
        "NAF 7410Z — 17 Grand Rue, 67110 Gundershoffen, France — 連絡先: gorandomfun@gmail.com"
    },

    hosting: {
      title: "ホスティング",
      body: "Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA — vercel.com"
    },

    purpose: {
      title: "目的",
      body: "エンタメ向けランダムコンテンツ（画像・GIF・動画・テキスト）。A-ADS によるコンテキスト広告と一部アフィリエイトリンクで収益化しています。"
    },

    privacy: {
      title: "クッキーとプライバシー",
      bodyPrefix: "当サイトで設定するのは必須クッキーのみ（言語設定・同意記録）。A-ADS はトラッキングクッキーを使わずに広告を配信します。追加のトラッカーを導入する際は、ここでオプトインをお願いする予定です。",
      manageCookies: "クッキーを管理",
      privacyPolicy: "プライバシーポリシー"
    },

    usa: {
      title: "USA",
      bodyPrefix: "個人データの販売や共有は行いません。CCPA/CPRA の権利行使は gorandomfun@gmail.com までご連絡ください。",
      doNotSell: "Do Not Sell or Share"
    },

    dmca: {
      title: "DMCA",
      body: "DMCA 通知先：gorandomfun@gmail.com"
    },

    law: {
      title: "準拠法",
      body: "準拠法：フランス法（各国の強行法規に従います）。"
    }
  }  ,
  "encourage": {
    "roundLabel": "ラウンド",
    "messages": [
      "まったく新しい層を突き抜けた。",
      "ランダムの周回をクリアした。",
      "当たり前を越えて、まだ上へ。",
      "未知のポータルが開いた。",
      "メインストリームが後方に消えた。",
      "奇妙レベルがひとつアップ。",
      "予測できる世界を置き去りにした。",
      "新しいグリッチの信号が近づく。",
      "勢いがさらに深部へ引き込む。",
      "コンフォートラインを超えた。",
      "隠れたコーナーが光りだした。",
      "奇妙なフロンティアが歓迎している。",
      "好奇心が次の段階に到達した。",
      "地図が終わり、君の道が続く。",
      "新しいウサギの穴が現れた。",
      "レアなバイブスを収集した。",
      "ランダムエンジンがさらに唸る。",
      "オフロードなアイデアが解放された。",
      "予想外が君を信頼し始めた。",
      "探検バッジがさらに輝きを増した。",
      "押し進め！ 奇妙な驚きが待っている。",
      "またもやルーティンを置き去りにした。",
      "新たな謎の部屋が開いた。",
      "落ち着かず進め、シグナルは前方だ。"
    ]
  }

}

export default jpDictionary
