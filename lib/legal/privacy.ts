export const PRIVACY_UPDATED_AT = '2026-09-10'
export const PRIVACY_CONTACT = 'gorandomfun@gmail.com'

type PrivacyCopy = {
  title: string
  updated: string
  intro: string
  legal: string
  terms: string
  settings: string
  home: string
  sections: { title: string; body: string }[]
}

export const privacyPolicyCopy: Record<'en' | 'fr' | 'de' | 'es' | 'jp', PrivacyCopy> = {
  fr: {
    title: 'Politique de confidentialité',
    updated: 'Dernière mise à jour',
    intro: 'Cette politique décrit les données utilisées par Random sur gorandom.fun. L’identité et les coordonnées de l’éditeur doivent figurer dans les mentions légales.',
    legal: 'Mentions légales',
    terms: 'Conditions d’utilisation',
    settings: 'Gérer mes choix',
    home: 'Retour à Random',
    sections: [
      { title: '1. Données nécessaires', body: 'Random peut traiter des données techniques nécessaires au fonctionnement et à la sécurité du service, notamment l’adresse IP, le navigateur et l’horodatage des requêtes. La langue, le thème, les favoris et le choix de confidentialité peuvent être enregistrés dans le navigateur. Random ne propose pas de compte utilisateur.' },
      { title: '2. Finalités et bases', body: 'Le fonctionnement, la sécurité et la prévention des abus reposent sur l’intérêt légitime de l’éditeur. Les lecteurs et annonces optionnels reposent sur votre consentement. Les demandes envoyées par e-mail sont traitées pour y répondre et les obligations imposées par la loi sont exécutées sur leur base légale propre.' },
      { title: '3. Lecteurs vidéo', body: 'YouTube n’est chargé qu’après une autorisation explicite des lecteurs vidéo. YouTube reçoit alors des données de connexion et peut utiliser des cookies ou technologies similaires. Un lecteur Dailymotion standard peut rester accessible sans autorisation optionnelle uniquement lorsque le mode vérifié sans Infopack/TCF est activé ; Dailymotion reçoit néanmoins des données de connexion et peut diffuser ses propres publicités. Dans les autres cas, Dailymotion reste soumis à l’autorisation vidéo.' },
      { title: '4. Publicité A-ADS', body: 'Les annonces A-ADS de Random ne sont chargées qu’après une autorisation publicitaire explicite. Ce choix est indépendant de l’autorisation vidéo. A-ADS reçoit alors les données de connexion nécessaires à la diffusion de ses annonces. Les publicités éventuellement intégrées aux lecteurs tiers sont distinctes.' },
      { title: '5. Choix et durées', body: 'Une acceptation complète ou partielle est mémorisée pendant 180 jours lorsque le stockage du navigateur est disponible. Un refus total est conservé pendant la visite en cours. Le choix est proposé de nouveau lors d’une nouvelle visite et, dans un onglet conservé, après au moins 30 minutes d’absence. Les réglages permettent de modifier ou retirer une autorisation à tout moment. Le signal Global Privacy Control désactive A-ADS.' },
      { title: '6. Destinataires et transferts', body: 'Les données sont transmises uniquement aux prestataires nécessaires au fonctionnement du service et aux services externes autorisés. Certains prestataires peuvent traiter des données hors de l’Union européenne selon leurs propres garanties et politiques.' },
      { title: '7. Conservation et sécurité', body: 'Les préférences locales restent dans le navigateur jusqu’à leur suppression ou leur expiration. Les journaux techniques et les messages sont conservés uniquement pendant la durée nécessaire au fonctionnement, à la sécurité, au traitement de la demande ou aux obligations légales. Des mesures raisonnables de sécurité sont appliquées, sans qu’aucun système puisse garantir une sécurité absolue.' },
      { title: '8. Contact et droits', body: 'Selon la législation applicable, vous pouvez demander l’accès, la rectification, l’effacement, la limitation ou l’opposition concernant vos données, et retirer une autorisation à tout moment. Écrivez à gorandomfun@gmail.com. Vous pouvez également saisir l’autorité de protection des données compétente.' },
      { title: '9. Enfants et contenus tiers', body: 'Random n’est pas destiné aux enfants de moins de 13 ans. Les contenus externes restent soumis aux conditions et politiques de leurs plateformes. Pour signaler un contenu ou une atteinte à un droit, utilisez l’adresse de contact en indiquant le lien concerné.' },
      { title: '10. Évolution', body: 'Cette politique peut évoluer avec Random, ses prestataires ou les règles applicables. La version publiée indique sa date de mise à jour.' },
    ],
  },
  en: {
    title: 'Privacy policy',
    updated: 'Last updated',
    intro: 'This policy describes the data used by Random at gorandom.fun. The operator’s identity and contact details must be provided in the legal notice.',
    legal: 'Legal notice',
    terms: 'Terms of use',
    settings: 'Manage my choices',
    home: 'Back to Random',
    sections: [
      { title: '1. Necessary data', body: 'Random may process technical data needed to operate and secure the service, including the IP address, browser and request time. Language, theme, saved likes and the privacy choice may be stored in the browser. Random does not provide user accounts.' },
      { title: '2. Purposes and legal bases', body: 'Operation, security and abuse prevention rely on the operator’s legitimate interests. Optional players and advertising rely on your consent. Email requests are processed in order to answer them, and legal obligations are handled under their applicable legal basis.' },
      { title: '3. Video players', body: 'YouTube loads only after explicit permission for video players. YouTube then receives connection data and may use cookies or similar technologies. A standard Dailymotion player may remain available without optional permission only when the verified mode without Infopack/TCF is enabled; Dailymotion still receives connection data and may show its own ads. In every other case, Dailymotion requires video permission.' },
      { title: '4. A-ADS advertising', body: 'Random’s A-ADS placements load only after explicit advertising permission. This choice is separate from video permission. A-ADS then receives the connection data needed to deliver its ads. Advertising that may appear inside third-party players is separate.' },
      { title: '5. Choices and duration', body: 'A complete or partial acceptance is saved for 180 days when browser storage is available. A full refusal is retained for the current visit. The choice is offered again on a new visit and, in a retained tab, after at least 30 minutes away. Settings allow permission to be changed or withdrawn at any time. Global Privacy Control disables A-ADS.' },
      { title: '6. Recipients and transfers', body: 'Data is disclosed only to providers needed to operate the service and to authorised external services. Some providers may process data outside the European Union under their own safeguards and policies.' },
      { title: '7. Retention and security', body: 'Local preferences remain in the browser until they are deleted or expire. Technical logs and messages are kept only as long as necessary for operation, security, handling the request or legal obligations. Reasonable security measures are used, but no system can guarantee absolute security.' },
      { title: '8. Contact and rights', body: 'Depending on applicable law, you may request access, correction, deletion, restriction or objection concerning your data, and withdraw permission at any time. Email gorandomfun@gmail.com. You may also contact the competent data protection authority.' },
      { title: '9. Children and third-party content', body: 'Random is not intended for children under 13. External content remains subject to the terms and policies of its platforms. To report content or a rights issue, use the contact address and include the relevant link.' },
      { title: '10. Changes', body: 'This policy may change with Random, its providers or applicable rules. The published version shows its update date.' },
    ],
  },
  de: {
    title: 'Datenschutzerklärung',
    updated: 'Zuletzt aktualisiert',
    intro: 'Diese Erklärung beschreibt die von Random auf gorandom.fun verwendeten Daten. Identität und Kontaktdaten des Betreibers müssen im Impressum stehen.',
    legal: 'Impressum',
    terms: 'Nutzungsbedingungen',
    settings: 'Auswahl verwalten',
    home: 'Zurück zu Random',
    sections: [
      { title: '1. Erforderliche Daten', body: 'Random kann technische Daten verarbeiten, die für Betrieb und Sicherheit erforderlich sind, darunter IP-Adresse, Browser und Zeitpunkt der Anfrage. Sprache, Design, gespeicherte Likes und die Datenschutzauswahl können im Browser gespeichert werden. Random bietet keine Benutzerkonten.' },
      { title: '2. Zwecke und Rechtsgrundlagen', body: 'Betrieb, Sicherheit und Missbrauchsprävention beruhen auf den berechtigten Interessen des Betreibers. Optionale Player und Werbung beruhen auf Ihrer Einwilligung. E-Mail-Anfragen werden zur Beantwortung verarbeitet; gesetzliche Pflichten werden auf ihrer jeweiligen Rechtsgrundlage erfüllt.' },
      { title: '3. Videoplayer', body: 'YouTube wird erst nach einer ausdrücklichen Erlaubnis für Videoplayer geladen. YouTube erhält dann Verbindungsdaten und kann Cookies oder ähnliche Technologien verwenden. Ein Standardplayer von Dailymotion kann ohne optionale Erlaubnis verfügbar bleiben, wenn der geprüfte Modus ohne Infopack/TCF aktiviert ist; Dailymotion erhält dennoch Verbindungsdaten und kann eigene Werbung anzeigen. Andernfalls ist auch für Dailymotion die Videoerlaubnis erforderlich.' },
      { title: '4. A-ADS-Werbung', body: 'A-ADS-Anzeigen von Random werden nur nach ausdrücklicher Werbeerlaubnis geladen. Diese Auswahl ist von der Videoerlaubnis getrennt. A-ADS erhält dann die für die Auslieferung erforderlichen Verbindungsdaten. Werbung innerhalb externer Player ist davon getrennt.' },
      { title: '5. Auswahl und Dauer', body: 'Eine vollständige oder teilweise Zustimmung wird bei verfügbarem Browserspeicher 180 Tage gespeichert. Eine vollständige Ablehnung gilt für den aktuellen Besuch. Bei einem neuen Besuch und in einem beibehaltenen Tab nach mindestens 30 Minuten Abwesenheit wird erneut gefragt. Erlaubnisse können jederzeit geändert oder widerrufen werden. Global Privacy Control deaktiviert A-ADS.' },
      { title: '6. Empfänger und Übermittlungen', body: 'Daten werden nur an für den Betrieb erforderliche Anbieter und an erlaubte externe Dienste übermittelt. Einige Anbieter können Daten außerhalb der Europäischen Union nach ihren eigenen Garantien und Richtlinien verarbeiten.' },
      { title: '7. Speicherung und Sicherheit', body: 'Lokale Einstellungen bleiben bis zu ihrer Löschung oder ihrem Ablauf im Browser. Technische Protokolle und Nachrichten werden nur so lange aufbewahrt, wie es für Betrieb, Sicherheit, Bearbeitung der Anfrage oder gesetzliche Pflichten erforderlich ist. Es werden angemessene Sicherheitsmaßnahmen eingesetzt; absolute Sicherheit kann jedoch kein System garantieren.' },
      { title: '8. Kontakt und Rechte', body: 'Je nach anwendbarem Recht können Sie Auskunft, Berichtigung, Löschung, Einschränkung oder Widerspruch verlangen und eine Erlaubnis jederzeit widerrufen. Schreiben Sie an gorandomfun@gmail.com. Sie können sich auch an die zuständige Datenschutzbehörde wenden.' },
      { title: '9. Kinder und externe Inhalte', body: 'Random richtet sich nicht an Kinder unter 13 Jahren. Externe Inhalte unterliegen weiterhin den Bedingungen und Richtlinien ihrer Plattformen. Verwenden Sie zur Meldung von Inhalten oder Rechtsverletzungen die Kontaktadresse und geben Sie den betreffenden Link an.' },
      { title: '10. Änderungen', body: 'Diese Erklärung kann sich mit Random, seinen Anbietern oder den geltenden Regeln ändern. Die veröffentlichte Fassung enthält das Aktualisierungsdatum.' },
    ],
  },
  es: {
    title: 'Política de privacidad',
    updated: 'Última actualización',
    intro: 'Esta política describe los datos utilizados por Random en gorandom.fun. La identidad y los datos de contacto del responsable deben figurar en el aviso legal.',
    legal: 'Aviso legal',
    terms: 'Condiciones de uso',
    settings: 'Gestionar mis opciones',
    home: 'Volver a Random',
    sections: [
      { title: '1. Datos necesarios', body: 'Random puede tratar datos técnicos necesarios para el funcionamiento y la seguridad, como la dirección IP, el navegador y la hora de las solicitudes. El idioma, el tema, los favoritos y la elección de privacidad pueden guardarse en el navegador. Random no ofrece cuentas de usuario.' },
      { title: '2. Finalidades y bases jurídicas', body: 'El funcionamiento, la seguridad y la prevención de abusos se basan en los intereses legítimos del responsable. Los reproductores y anuncios opcionales se basan en tu consentimiento. Las solicitudes por correo se tratan para responderlas y las obligaciones legales conforme a su base jurídica correspondiente.' },
      { title: '3. Reproductores de vídeo', body: 'YouTube se carga únicamente tras autorizar expresamente los reproductores de vídeo. Entonces recibe datos de conexión y puede utilizar cookies o tecnologías similares. Un reproductor estándar de Dailymotion puede seguir disponible sin permiso opcional solo cuando está activo el modo verificado sin Infopack/TCF; Dailymotion sigue recibiendo datos de conexión y puede mostrar sus propios anuncios. En los demás casos también requiere permiso para vídeo.' },
      { title: '4. Publicidad A-ADS', body: 'Los anuncios A-ADS de Random solo se cargan tras un permiso publicitario explícito. Esta opción es independiente del permiso para vídeos. A-ADS recibe entonces los datos de conexión necesarios para mostrar sus anuncios. La publicidad integrada en reproductores externos es independiente.' },
      { title: '5. Opciones y duración', body: 'Una aceptación completa o parcial se guarda durante 180 días cuando el navegador lo permite. El rechazo total se conserva durante la visita actual. Volveremos a preguntar en una nueva visita y, en una pestaña conservada, después de al menos 30 minutos de ausencia. Los permisos pueden modificarse o retirarse en cualquier momento. Global Privacy Control desactiva A-ADS.' },
      { title: '6. Destinatarios y transferencias', body: 'Los datos se comunican únicamente a proveedores necesarios para el servicio y a servicios externos autorizados. Algunos proveedores pueden tratar datos fuera de la Unión Europea conforme a sus propias garantías y políticas.' },
      { title: '7. Conservación y seguridad', body: 'Las preferencias locales permanecen en el navegador hasta su eliminación o caducidad. Los registros técnicos y mensajes se conservan solo durante el tiempo necesario para el funcionamiento, la seguridad, la gestión de la solicitud o las obligaciones legales. Se aplican medidas de seguridad razonables, aunque ningún sistema garantiza una seguridad absoluta.' },
      { title: '8. Contacto y derechos', body: 'Según la legislación aplicable, puedes solicitar acceso, rectificación, supresión, limitación u oposición, y retirar un permiso en cualquier momento. Escribe a gorandomfun@gmail.com. También puedes acudir a la autoridad de protección de datos competente.' },
      { title: '9. Menores y contenidos externos', body: 'Random no está dirigido a menores de 13 años. Los contenidos externos siguen sujetos a las condiciones y políticas de sus plataformas. Para comunicar un contenido o una vulneración de derechos, utiliza la dirección de contacto e incluye el enlace correspondiente.' },
      { title: '10. Cambios', body: 'Esta política puede evolucionar con Random, sus proveedores o las normas aplicables. La versión publicada indica la fecha de actualización.' },
    ],
  },
  jp: {
    title: 'プライバシーポリシー',
    updated: '最終更新日',
    intro: '本ポリシーはgorandom.funのRandomで使用されるデータについて説明します。運営者の氏名または名称と連絡先は法的表示に記載する必要があります。',
    legal: '法的表示',
    terms: '利用規約',
    settings: '選択を管理',
    home: 'Randomに戻る',
    sections: [
      { title: '1. 必要なデータ', body: 'Randomは、サービスの運営と安全確保に必要なIPアドレス、ブラウザー、リクエスト時刻などの技術情報を処理する場合があります。言語、テーマ、お気に入り、プライバシーの選択はブラウザーに保存される場合があります。Randomにユーザーアカウントはありません。' },
      { title: '2. 利用目的と法的根拠', body: '運営、安全確保、不正利用の防止は運営者の正当な利益に基づきます。任意のプレーヤーと広告は利用者の同意に基づきます。メールでの問い合わせは回答のために処理し、法的義務はそれぞれの法的根拠に従って履行します。' },
      { title: '3. 動画プレーヤー', body: 'YouTubeは動画プレーヤーへの明示的な許可後にのみ読み込まれ、接続情報を受け取り、Cookieなどを使用する場合があります。Dailymotionの標準プレーヤーは、Infopack/TCFを使用しないことを確認したモードが有効な場合に限り、任意の許可なしで利用できることがあります。その場合でもDailymotionは接続情報を受け取り、独自の広告を表示する場合があります。それ以外では動画の許可が必要です。' },
      { title: '4. A-ADS広告', body: 'RandomのA-ADS広告は、広告への明示的な許可後にのみ読み込まれます。この選択は動画の許可とは別です。A-ADSは広告配信に必要な接続情報を受け取ります。外部プレーヤー内の広告とは区別されます。' },
      { title: '5. 選択と期間', body: '全部または一部の許可は、ブラウザーで保存できる場合に180日間記憶されます。すべて拒否した場合は現在の訪問中のみ記憶されます。新しい訪問時、および保持されたタブで30分以上離れた後に再び選択を表示します。許可はいつでも変更または撤回できます。Global Privacy Controlが有効な場合、A-ADSは無効です。' },
      { title: '6. 提供先と国外処理', body: 'データは、サービス運営に必要な事業者と許可された外部サービスにのみ提供されます。一部の事業者は、各社の保護措置とポリシーに基づき欧州連合外でデータを処理する場合があります。' },
      { title: '7. 保存期間と安全管理', body: 'ブラウザー内の設定は、削除または期限切れまで保存されます。技術ログとメッセージは、運営、安全確保、問い合わせ対応、法的義務に必要な期間のみ保存します。合理的な安全対策を講じますが、完全な安全を保証できるシステムはありません。' },
      { title: '8. お問い合わせと権利', body: '適用される法律に応じて、データへのアクセス、訂正、削除、処理制限、異議申立てを求め、許可をいつでも撤回できます。gorandomfun@gmail.comまでご連絡ください。管轄のデータ保護機関に申し立てることもできます。' },
      { title: '9. 子どもと外部コンテンツ', body: 'Randomは13歳未満の子どもを対象としていません。外部コンテンツには各プラットフォームの規約とポリシーが適用されます。コンテンツや権利侵害を報告する場合は、対象リンクを添えて連絡先までお知らせください。' },
      { title: '10. 変更', body: '本ポリシーはRandom、利用事業者、適用規則の変更に伴い更新される場合があります。公開版に更新日を記載します。' },
    ],
  },
}
