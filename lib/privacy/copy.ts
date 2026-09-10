const en = {
  title: 'Privacy choices',
  intro:
    'YouTube and Dailymotion players and A-ADS advertising contact external services. Choose which to load. You can change your choice at any time.',
  accept: 'Accept all',
  reject: 'Reject all',
  settings: 'Privacy settings',
  close: 'Close',
  save: 'Save choices',
  necessary: 'Essential storage',
  necessaryText: 'Language, preferences, saved likes and your privacy choice.',
  media: 'External video players',
  mediaText:
    'Load YouTube and Dailymotion. These services receive connection data and may use cookies or similar technologies.',
  ads: 'Advertising',
  adsText: 'Load A-ADS advertisements. The external advertising service receives connection data.',
  gpc: 'Your browser privacy signal is active: advertising remains disabled.',
  blocked: 'External video is disabled by your privacy settings.',
  allow: 'Choose video settings',
  policy: 'Privacy policy',
}

type Copy = typeof en

export const privacyCopy: Record<string, Copy> = {
  en,
  fr: {
    title: 'Choix de confidentialité',
    intro:
      'Les lecteurs YouTube et Dailymotion et les annonces A-ADS contactent des services externes. Choisissez lesquels charger. Votre choix reste modifiable à tout moment.',
    accept: 'Tout accepter',
    reject: 'Tout refuser',
    settings: 'Réglages de confidentialité',
    close: 'Fermer',
    save: 'Enregistrer',
    necessary: 'Stockage nécessaire',
    necessaryText: 'Langue, préférences, favoris et choix de confidentialité.',
    media: 'Lecteurs vidéo externes',
    mediaText:
      'Charger YouTube et Dailymotion. Ces services reçoivent des données de connexion et peuvent utiliser des cookies ou technologies similaires.',
    ads: 'Publicité',
    adsText:
      'Charger les annonces A-ADS. Le service publicitaire externe reçoit des données de connexion.',
    gpc: 'Le signal de confidentialité de votre navigateur est actif : la publicité reste désactivée.',
    blocked: 'La vidéo externe est désactivée par vos réglages de confidentialité.',
    allow: 'Choisir les réglages vidéo',
    policy: 'Politique de confidentialité',
  },
  de: {
    title: 'Datenschutzeinstellungen',
    intro:
      'YouTube, Dailymotion und A-ADS kontaktieren externe Dienste. Wählen Sie, welche geladen werden dürfen. Sie können Ihre Auswahl jederzeit ändern.',
    accept: 'Alle akzeptieren',
    reject: 'Alle ablehnen',
    settings: 'Datenschutz einstellen',
    close: 'Schließen',
    save: 'Speichern',
    necessary: 'Notwendiger Speicher',
    necessaryText: 'Sprache, Einstellungen, gespeicherte Likes und Datenschutzauswahl.',
    media: 'Externe Videoplayer',
    mediaText:
      'YouTube und Dailymotion laden. Diese Dienste erhalten Verbindungsdaten und können Cookies oder ähnliche Technologien verwenden.',
    ads: 'Werbung',
    adsText: 'A-ADS-Werbung laden. Der externe Werbedienst erhält Verbindungsdaten.',
    gpc: 'Das Datenschutzsignal Ihres Browsers ist aktiv: Werbung bleibt deaktiviert.',
    blocked: 'Externe Videos sind in Ihren Datenschutzeinstellungen deaktiviert.',
    allow: 'Videoeinstellungen wählen',
    policy: 'Datenschutzerklärung',
  },
  es: {
    title: 'Opciones de privacidad',
    intro:
      'YouTube, Dailymotion y los anuncios A-ADS contactan con servicios externos. Elige cuáles cargar. Puedes cambiar tu elección en cualquier momento.',
    accept: 'Aceptar todo',
    reject: 'Rechazar todo',
    settings: 'Ajustes de privacidad',
    close: 'Cerrar',
    save: 'Guardar',
    necessary: 'Almacenamiento necesario',
    necessaryText: 'Idioma, preferencias, favoritos y elección de privacidad.',
    media: 'Reproductores externos',
    mediaText:
      'Cargar YouTube y Dailymotion. Estos servicios reciben datos de conexión y pueden utilizar cookies o tecnologías similares.',
    ads: 'Publicidad',
    adsText: 'Cargar anuncios A-ADS. El servicio publicitario externo recibe datos de conexión.',
    gpc: 'La señal de privacidad de tu navegador está activa: la publicidad permanece desactivada.',
    blocked: 'El vídeo externo está desactivado en tus ajustes de privacidad.',
    allow: 'Elegir ajustes de vídeo',
    policy: 'Política de privacidad',
  },
  jp: {
    title: 'プライバシー設定',
    intro:
      'YouTube、Dailymotion、A-ADS広告は外部サービスに接続します。読み込みを許可するサービスを選択してください。設定はいつでも変更できます。',
    accept: 'すべて許可',
    reject: 'すべて拒否',
    settings: 'プライバシー設定',
    close: '閉じる',
    save: '保存',
    necessary: '必要な保存データ',
    necessaryText: '言語、設定、お気に入り、プライバシーの選択を保存します。',
    media: '外部動画プレーヤー',
    mediaText:
      'YouTubeとDailymotionを読み込みます。これらのサービスは接続データを受け取り、Cookieなどを使用する場合があります。',
    ads: '広告',
    adsText: 'A-ADS広告を読み込みます。外部広告サービスは接続データを受け取ります。',
    gpc: 'ブラウザーのプライバシー信号が有効なため、広告は無効のままです。',
    blocked: 'プライバシー設定により外部動画は無効になっています。',
    allow: '動画の設定を選択',
    policy: 'プライバシーポリシー',
  },
}
