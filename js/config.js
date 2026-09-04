/* Configuration du site.
   Pour activer la synchronisation Google Drive :
   1. Créez un identifiant OAuth dans la console Google Cloud (voir README).
   2. Collez-le ci-dessous entre les guillemets, puis publiez sur GitHub. */
window.GOOGLE_CLIENT_ID = "923812373412-jt4088gp47sfoh1qrjn0mds993qtqan1.apps.googleusercontent.com";

/* Adresse du relais EODHD (Cloudflare Workers) — nécessaire car EODHD
   bloque les appels directs depuis un navigateur. Voir README.
   Exemple : "https://mes-finances-eodhd.VOTRE-COMPTE.workers.dev" */
window.EODHD_PROXY = "https://mes-finances-eodhd.b-lamassiaude.workers.dev";
