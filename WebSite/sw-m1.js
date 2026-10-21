/* eslint-disable no-restricted-globals */
/* 20261009voteRemKeep1 — OS close vote_reminder → skipMarkRead (no silent consume) */
/* swBackPwa1 marker — PWA may register again; push-only (Cache solo su notificationclick) */
/* 20260928swBackPwa1 */
/* 20260928consoleErrFix1 — catch WindowClient.navigate rejection */
/* 20260929pushMultiDevice3 — mai silent; tag per id; push su tutti i device */
/* 20260929cpuIdleHard1 — push icon still (no gif decode) */
/* 20260929pushOpenCold1 — PWA chiusa: pending-nav + openWindow (no client hidden) */
/* 20260930pushOpenCold2 — race start_url vs pending: write+openWindow dest; home poll retry */
/* 20260929pushDismissDedup1 — dismiss chiude OS su tutti i device; ids/ticketIds */
/* 20260929pushInAppSilent1 — in-app focused: niente banner OS (come notif in-app) */
/* 20260930pushPwaBadgeStable1 — clearAppBadge su dismiss; focused strict; badge=OS count */
/* 20260930pushReuseClient1 — riusa PWA già aperta (no seconda finestra); pending nav su standalone */
/* 20261001votePushPairPhone1 — tag/Topic distinti Top.gg vs Discadia; no collapse telefono */
/* 20261001pushColdOpenDest1 — app chiusa: openWindow(dest); non riusare client hidden */
/* 20261001pushBadgeVisitFix1 — swipe/delete → badge sync retry; fanout os-closed; pageUrl match */
/* 20261001pushNoBgUpdate1 — Chrome/Edge PC: niente “aggiornata in background”
   (userVisibleOnly: ogni push deve lasciare una notifica; silent+close immediato) */
/* 20261001pushPhoneNoEmpty1 — Android: niente ack ZWSP (banner vuoti di continuo).
   Mobile in-app → notifica reale; dismiss mobile → ack testuale stesso tag + close */
/* 20261002iosPushNoAck1 — iOS/PWA: mai showNotification ack ("Aggiornato" / solo
   "from Vinili & Caffè"). silent+close non funziona su iOS e ritarda le push vere
   finché non apri la PWA. Ack solo Chrome/Edge desktop. */
/* 20261002pushWinPwaReuse1 — Windows PWA: riusa finestra hidden/minimized;
   niente broadcast mark-read; no openWindow se esiste già un client. */
/* 20261002pushAlwaysShow1 — content push: SEMPRE showNotification reale.
   ticketNotifDedup1: suppressOs false = client non fa fly gemello.
   Silent ZWSP ack a focus addestrava Chrome/Edge a ritardare/droppare
   le push in background finche non riapri l app. */
/* 20261003pushOpenDestFix1 — click push: non perdere deep link ticket
   (www vs apex → /); ricostruisci da ticketId; openWindow se non gia su dest. */
/* 20261003notifDismissCross1 — cold openWindow: postMessage vc:open-dest
   (mark-read + dismiss cross-device); pending-nav tiene id. */
/* 20261003pushAckEmptyFix1 — fix comment syntax SW (install falliva);
   dismiss mobile di nuovo skip server-side; ack desktop solo se serve. */
/* 20261003pushWinReuseNav3 — click push con PWA già aperta: riusa client
   (focus + postMessage + navigate), openWindow solo se nessun client. */
/* 20261003pushVisitOsDismiss2 — visita pagina: dismiss push anche mobile;
   closeMatching retry breve (Android ghost). */
/* 20261003notifCatClearFix1 — bump SW con chunk notif (cat clear). */
/* 20261003pushPurgeEmptyAck1 — stop push vuote / “aggiornata in background”:
   dismiss: riusa tag chiuso + silent close (niente ZWSP); content vuoto → no banner. */
/* 20261008badgeCrossDevice1 — dismiss cross-device: show silent riusando banner match
   (userVisibleOnly) + setAppBadge(unreadCount); no “.” ghost. */
/* 20261008osBadgeNoFlash2 — con client PWA aperto: badge solo da page (vc:set-app-badge).
   syncAppBadgeFromOsNotifications non deve più sovrascrivere unread inbox → flash. */
/* 20261008osBadgeStable1 — Windows: setAppBadge di nuovo (taskbarBadgeRed1 clear-only
   faceva flash set/clear con PWA aperta). */
/* 20261008pushIosShowFirst1 — iOS: showNotification PRIMA di clients.matchAll.
   matchAll lento/appeso = waitUntil scade e APNs “ok” ma niente banner. */
/* 20261007pushPhoneAlive3 — dismiss push = solo closeMatching (no ZWSP/ack).
   Server non manda più dismiss; se ne arriva uno legacy non starve FCM. */
/* 20261007pushDotGhost1 — stop banner Windows “sito + .” da dismissSatisfyVisible
   (ack "." mai chiuso perché closeMatching skippa vcAck). show+close immediato. */
/* 20261003pushNoGhostTitle1 — mai inventare “Nuova notifica” su payload vuoto:
   flash+auto-close continuo; blank/missing → solo quiet ack. */
/* 20261003pushKillGhostSpam1 — Vinili+“Nuova notifica” = ghost; blank content
   senza quiet-ack (no “aggiornato in background”); dismiss desktop stoppato a server. */
/* 20261003pushPhoneTicketAck1 — Android: ack silent su dismiss/blank (userVisibleOnly),
   altrimenti Chrome ritarda le push ticket vere. Windows: niente ack (no spam background). */
/* 20261003iosWinProfilePush1 — Windows: di nuovo quiet-ack (senza = “aggiornato in background”);
   iOS: renotify false (niente re-alert aprendo PWA). */
/* 20261003pushBgAlive1 — STOP silent+close ack: Chrome/FCM ritardavano le push
   finché la PWA non era aperta (PC + telefono). Dismiss = solo closeMatching;
   content = sempre showNotification reale (mai silent). */
/* 20261005pushPhoneVisible2 — MAI no-op su push vuote: userVisibleOnly senza
   showNotification = FCM ritarda/droppa finché non apri la PWA (stesso sintomo
   di ieri mattina). Blank → fallback banner reale. */
/* 20261005pushKillEmptyDismiss1 — dismiss: SOLO closeMatching + badge.
   Niente showNotification("\u00a0") (banner vuoti di continuo su Android).
   quiet-ack nbsp di readDismissBadge1 = spam telefono. */
/* 20261005readDismissBadge1 — dismiss push di nuovo: closeMatching + quiet-ack
   showNotification (userVisibleOnly) + badge da unreadCount inbox. */
/* 20261005pushPhoneAlive1 — server non manda più dismiss webpush (starve FCM).
   Blank: mai no-op → fallback banner reale (come pushPhoneVisible2). */
/* 20261006pushBadgeSyncPhone1 — dismiss di nuovo (mobile): closeMatching + badge
   da unreadCount + silent show+close (userVisibleOnly, no nbsp). parsePayload
   inoltra unreadCount/openUrls/pageUrl. */
/* 20261006pushKillEmpty2 — STOP banner vuoti telefono:
   - dismissQuietAck = no-op (ZWSP show+close = notifica bianca Android)
   - blank content = solo fanout/badge, MAI inventare “Vinili & Caffè” */
/* 20261007pushPhoneAlive2 — server NON manda più dismiss webpush (Starve FCM
   se dismiss silenzioso senza showNotification). Content push = unico canale. */
/* 20261007pushReadCrossDismiss1 — dismiss di nuovo: closeMatching + show
   riusando titolo/tag del banner match (userVisibleOnly, no ZWSP vuoto). */
/* 20261008pushKillBgSpam1 — STOP spam “Il sito è stato aggiornato in background”:
   - install: Niente skipWaiting auto (solo message vc:skip-waiting)
   - dismiss: SOLO closeMatching (no silent show+close → WNS/Chrome ghost)
   - blank: fanout/badge only (server non manda più dismiss/blank)
   Server: dismiss webpush off; FCM host ≠ mobile. */
/* 20261012pushKillBgSpam2 — dismiss desktop off (server); SW URL stabile /sw-m1.js. */
/* 20261012pushAppleShownAck1 — dopo showNotification POST /push/shown (APNs 201 ≠ banner). */
/* 20261012pushAppleHedgeKeepOnRead1 — /push/shown SOLO da Apple SW (PC show ≠ iPhone banner). */
/* 20261012pushShownAckVisible1 — se tag già visibile: comunque /push/shown (altrimenti hedge
   ruota token buoni). Hedge :mpr → tag unico + renotify Apple. */
/* 20261013pushShownAckPhoneOnly1 — /push/shown SOLO iPhone/iPad; Mac Safari non ferma hedge. */
/* 20261013pushApplePhonePrefer1 — iPadOS Macintosh+touch conta come telefono per ack. */
/* 20261012pushAppleZombieHedge5 — Apple: skip show se tag già visibile (anti-doppio hedge);
   notificationclose → persistDismissedIds anche vote_reminder (solo SW, no mark-read server). */
/* 20261011pushSkipRead1 — no showNotification se id già dismesso/letto
   (wake PC: push WNS in coda → flash poi auto-close). Cache + query client. */
/* 20261011badgeCrossOs1 — stamp SW allineato a landing-notif; badge unreadCount
   da dismiss/WS resta source of truth (no reinflate da store client). */
/* 20261017badgeOsDismiss1 — dismiss push di nuovo: dismissSatisfyVisible
   (userVisibleOnly, reuse titolo banner) + setAppBadge(unreadCount).
   Close-only (KillBgSpam) starveva FCM/APNs content. Server: solo mobile. */
/* 20261014pushShowFirstClosed1 — Apple/PWA chiusa: MAI await getNotifications
   prima di showNotification (hang → waitUntil scade → APNs 201 senza banner
   finché non apri la PWA). Show+ack subito; dedupe tag solo after con timeout. */
/* 20261014pushIphoneMacUa1 — iPhone/iPad PWA spesso UA Macintosh (desktop mode).
   /push/shown deve partire su TUTTI i client Apple che fanno show, altrimenti
   APNs 201 + zero banner percepito e hedge cieco. Label: touch→ipad, else ios. */
/* 20261015pushAppleShowNoCache1 — iOS PWA kill: shouldSkipShowForRead→caches.open
   hang → waitUntil scade → APNs 201 senza banner/ack. Apple = solo mem, show subito. */
/* 20261015pushAppleAckRace1 — showNotification/matchAll possono hangare su iOS kill:
   race timeout + ack non bloccato da clients.matchAll. */
/* 20261015pushAppleWaitUntil1 — stamp allineato a landing-notif force-upgrade PWA. */
/* 20261015consoleFixAll1 — force clients off stamped /sw-m1.*.js paths. */
/* 20261015pushShowHold1 — Apple: NON race-away showNotification a 500ms
   (waitUntil chiudeva prima del banner → APNs 201 senza push/ack).
   Solo afterShowJobs ha budget corto; show ha safety ~8s. */
/* 20261015pushIdb1 — force-upgrade SW stamp (PWA telefono prende showHold). */
/* 20261016pushPhoneAlive4 — server stop dismiss webpush; force SW upgrade telefono. */
/* 20261018pushShowAckOnlyOk1 — /push/shown SOLO se showNotification risolve.
   Timeout 8s / reject → niente ack (altrimenti hedge stoppa senza banner iOS). */
/* 20261020pushIosDeclarative1 — parse Declarative Web Push (web_push:8030) +
   mutable event.notification; APNs banner anche se SW non riesce a show. */
/* 20261021iosPushGzHeal1 — gzip_static serviva sw-m1.js.gz STALE (pushSwForceUp1
   Oct15) senza declarative → iOS zero banner; heal .gz + force upgrade stamp. */

/* wsShellKill1: SOLO sfondo still — MAI cache-first sui CSS GIGANTI SENZA stamp
   (landing-core/ext/soft-fx). wsShell1 serviva CSS stale → freeze + layout rotto. */
/* siteOptAll2: cache-first SOLO su path stampati (foo.20261021bar.css|js) —
   stamp nuovo = URL nuovo = no stale look. */
/* consoleClean1: NIENTE cache.add in install — Chrome SW default CSP
   connect-src 'none' (report-only) spamava warning su sfondo-still.webp. */
var VC_SHELL_CACHE = "vc-shell-static-20261021stamp404Heal2";
var VC_STAMP_CACHE = "vc-stamp-static-20261021stamp404Heal2";
var VC_SHELL_ASSETS = [];
var VC_SW_STAMP = "20261021stamp404Heal2";
var DISMISSED_IDS_CACHE = "vc-dismissed-notif-ids-v1";
var DISMISSED_IDS_URL = "/__vc/dismissed-notif-ids";
var dismissedIdsMem = Object.create(null);
var dismissedIdsMemAt = 0;

function isVcShellAssetUrl(url) {
  try {
    var u = new URL(url, self.location.origin);
    if (u.origin !== self.location.origin) return false;
    var path = String(u.pathname || "");
    if (path.indexOf("/images/sfondo-still.webp") === 0) return true;
    if (path.indexOf("/images/sfondo-mobile-still.webp") === 0) return true;
  } catch (eU) {}
  return false;
}

function isVcStampAssetUrl(url) {
  try {
    var u = new URL(url, self.location.origin);
    if (u.origin !== self.location.origin) return false;
    var path = String(u.pathname || "");
    /* solo /css|/js con stamp nel filename — mai unstamped / css mega “vivi” */
    if (!/^\/(css|js)\//i.test(path)) return false;
    return /\.\d{8}[A-Za-z0-9._-]*\.(css|js)$/i.test(path);
  } catch (eS) {}
  return false;
}

function precacheVcShell() {
  /* consoleClean1: no-op (prefetch sfondo resta in pagina/shell-preload) */
  return Promise.resolve();
}

self.addEventListener("install", function (event) {
  /* stamp404Heal2: skipWaiting SEMPRE — SW vecchio con stamp-fetch
     spamava CSP connect-src 'none' e restava stuck su desktop senza unregister. */
  try {
    self.skipWaiting();
  } catch (eSkip) {}
  event.waitUntil(
    Promise.resolve()
      .then(function () {
        return precacheVcShell();
      })
      .catch(function () {}),
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    Promise.resolve(self.clients.claim())
      .then(function () {
        /* drop old shell + stamp caches */
        if (!self.caches || typeof self.caches.keys !== "function") return null;
        return self.caches.keys().then(function (keys) {
          return Promise.all(
            (keys || []).map(function (k) {
              var name = String(k || "");
              /* wsShellKill1: drop TUTTE le shell cache vecchie (anche CSS stale) */
              if (name.indexOf("vc-shell-static-") === 0 && name !== VC_SHELL_CACHE) {
                return self.caches.delete(k);
              }
              if (name.indexOf("vc-stamp-static-") === 0 && name !== VC_STAMP_CACHE) {
                return self.caches.delete(k);
              }
              return null;
            }),
          );
        });
      })
      .then(function () {
        /* pushBgAlive1: chiudi ack silent orfani lasciati dalle ver precedenti */
        return self.registration.getNotifications({ includeTriggered: true });
      })
      .then(function (list) {
        (list || []).forEach(function (n) {
          try {
            var tag = String((n && n.tag) || "");
            var d = (n && n.data) || {};
            if (tag === "vc-push-ack" || tag === "vc-dismiss-ack" || d.vcAck || d.type === "dismiss-ack") n.close();
            if (String(n.title || "").trim() === ".") n.close();
          } catch (eAck) {}
        });
      })
      .catch(function () {}),
  );
});

self.addEventListener("fetch", function (event) {
  try {
    var req = event.request;
    if (!req || req.method !== "GET") return;
    if (isVcShellAssetUrl(req.url)) {
      /* consoleClean1: non interceptare sfondo — evita fetch SW + CSP connect-src 'none' */
      return;
    }
    /* stamp404Heal1 / consoleClean1b: non interceptare stamp CSS/JS —
       SW default CSP connect-src 'none' (report-only) spamava TUTTI i ?v= stamp. */
    if (isVcStampAssetUrl(req.url)) return;
    return;
  } catch (eFetch) {}
});

var PUSH_ICON = "/images/og-server-icon-still.png?v=20260929cpuIdleHard1";

function pushClientUserAgent() {
  try {
    return String((self.navigator && self.navigator.userAgent) || "");
  } catch (eUa) {
    return "";
  }
}

function isMobilePushClient() {
  return /Android|iPhone|iPad|iPod|Mobile|webOS/i.test(pushClientUserAgent());
}

function isApplePushClient() {
  var ua = pushClientUserAgent();
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  /* iPadOS desktop UA + Safari PWA */
  if (/Macintosh/i.test(ua) && /Safari/i.test(ua) && !/Chrome|Chromium|Firefox|Android|CriOS|FxiOS|Edg\//i.test(ua)) {
    return true;
  }
  return false;
}

/* pushShownAckPhoneOnly1 / pushIphoneMacUa1:
   iPhone/iPad PWA spesso UA Macintosh. Ack su ogni Apple client che ha fatto show
   (altrimenti APNs 201 zombie). Server hedge ascolta client ios/iphone/ipad. */
function isIosPhonePushClient() {
  if (/iPhone|iPad|iPod/i.test(pushClientUserAgent())) return true;
  try {
    if (
      /Macintosh/i.test(pushClientUserAgent()) &&
      Number(navigator.maxTouchPoints || 0) > 1
    ) {
      return true;
    }
  } catch (eTouch) {}
  /* pushIphoneMacUa1: SW Apple = questo device ha ricevuto il push — conta come phone
     anche se maxTouchPoints=0 nel worker (visto su PWA iOS desktop-UA). */
  return isApplePushClient();
}

function pushShownClientLabel() {
  var ua = pushClientUserAgent();
  if (/iPhone/i.test(ua)) return "iphone";
  if (/iPad|iPod/i.test(ua)) return "ipad";
  if (/Macintosh/i.test(ua) && /Safari/i.test(ua) && !/Chrome|Chromium|Firefox|Android|CriOS|FxiOS|Edg\//i.test(ua)) {
    try {
      if (Number(navigator.maxTouchPoints || 0) > 1) return "ipad";
    } catch (eT) {}
    /* desktop-UA PWA installata: server deve fermare hedge → ios */
    return "ios";
  }
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function postPushShownAck(payload) {
  if (!isApplePushClient()) return Promise.resolve(null);
  /* pushAppleWaitUntil1: fetch senza timeout appendeva waitUntil → iOS kill →
     APNs 201 senza banner (probe a PWA aperta ok, push reali a PWA chiusa no). */
  var ctrl = null;
  var abortTimer = null;
  try {
    if (typeof AbortController === "function") {
      ctrl = new AbortController();
      abortTimer = setTimeout(function () {
        try {
          ctrl.abort();
        } catch (eAb) {}
      }, 1200);
    }
  } catch (eCtrl) {
    ctrl = null;
  }
  var fetchOpts = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: String((payload && payload.id) || "").trim(),
      dedupeKey: String((payload && payload.dedupeKey) || "").trim(),
      shown: true,
      client: pushShownClientLabel(),
    }),
    keepalive: true,
    credentials: "omit",
  };
  if (ctrl) fetchOpts.signal = ctrl.signal;
  return fetch(self.location.origin + "/webhooks/site-notifications/push/shown", fetchOpts)
    .catch(function () {
      return null;
    })
    .then(function (res) {
      if (abortTimer) {
        try {
          clearTimeout(abortTimer);
        } catch (eCl) {}
      }
      return res;
    });
}

function isWindowsPushClient() {
  return /Windows/i.test(pushClientUserAgent());
}

/* pushBgAlive1: quiet-ack DISABILITATO.
   silent showNotification + close immediato = Chrome/Edge/FCM trattano i push
   come non user-visible → ritardo/drop finché la PWA non è in foreground. */
/* pushReadDismissBadge1: dismiss → quiet-ack breve (userVisibleOnly), poi close. */
function shouldQuietAckPush() {
  return false;
}

function ackPushUserVisible() {
  return Promise.resolve();
}

function fulfillUserVisibleOnlyQuietly() {
  return Promise.resolve();
}

function isAckNotification(n) {
  try {
    if (!n) return false;
    if (n.data && (n.data.vcAck || n.data.type === "dismiss-ack")) return true;
    var tg = String(n.tag || "");
    return tg === "vc-push-ack" || tg === "vc-dismiss-ack";
  } catch (eAck) {
    return false;
  }
}

var lastSwBadgeApplied = -1;
function setAppBadgeCount(count) {
  var nav = self.navigator || (typeof navigator !== "undefined" ? navigator : null);
  if (!nav) return Promise.resolve();
  var n = Math.max(0, Math.min(99, Math.floor(Number(count) || 0)));
  /* osBadgeNoFlash2: skip se uguale — page+SW altrimenti doppio set flash */
  if (n === lastSwBadgeApplied) return Promise.resolve();
  lastSwBadgeApplied = n;
  try {
    /* osBadgeStable1: set/clear reale su tutti gli OS (anche Windows PWA) */
    if (n > 0 && typeof nav.setAppBadge === "function") {
      return Promise.resolve(nav.setAppBadge(n)).catch(function () {});
    }
    if (typeof nav.clearAppBadge === "function") {
      return Promise.resolve(nav.clearAppBadge()).catch(function () {});
    }
  } catch (eBadgeSet) {}
  return Promise.resolve();
}

function dismissQuietAck(tags) {
  /* pushKillEmpty2 legacy no-op — superseded by dismissSatisfyVisible */
  return Promise.resolve();
}

/* pushReadCrossDismiss1: userVisibleOnly senza banner vuoto —
   riusa titolo/body/tag di un banner già aperto, poi closeMatching lo toglie. */
function listMatchingNotifications(spec) {
  if (!self.registration || typeof self.registration.getNotifications !== "function") {
    return Promise.resolve([]);
  }
  var jobs = [self.registration.getNotifications()];
  try {
    jobs.push(self.registration.getNotifications({ includeTriggered: true }));
  } catch (eInc) {}
  return Promise.all(jobs)
    .then(function (lists) {
      var seen = {};
      var matched = [];
      (lists || []).forEach(function (list) {
        (list || []).forEach(function (n) {
          if (!n) return;
          try {
            if (n.data && n.data.vcAck) return;
            if (String(n.tag || "") === "vc-push-ack") return;
          } catch (eAck) {}
          var key =
            String(n.tag || "") +
            "|" +
            String((n.data && n.data.id) || "") +
            "|" +
            String((n.data && n.data.ticketId) || "");
          if (seen[key]) return;
          seen[key] = true;
          if (!notificationMatchesDismiss(n, spec)) return;
          matched.push(n);
        });
      });
      return matched;
    })
    .catch(function () {
      return [];
    });
}

function closeAckNotificationsNow() {
  if (!self.registration || typeof self.registration.getNotifications !== "function") {
    return Promise.resolve();
  }
  var jobs = [self.registration.getNotifications()];
  try {
    jobs.push(self.registration.getNotifications({ includeTriggered: true }));
  } catch (eInc) {}
  return Promise.all(jobs)
    .then(function (lists) {
      (lists || []).forEach(function (list) {
        (list || []).forEach(function (n) {
          try {
            if (!n) return;
            var title = String(n.title || "").trim();
            if (isAckNotification(n) || title === "." || title === "·" || title === "\u200b") {
              n.close();
            }
          } catch (eClose) {}
        });
      });
    })
    .catch(function () {});
}

function dismissSatisfyVisible(spec, payload) {
  /* badgeCrossDevice1: userVisibleOnly senza banner vuoti —
     riusa titolo/tag del banner match (silent); se c’è client aperto skip show;
     mai “.” / ZWSP (DotGhost). Poi closeMatching chiude tutto. */
  return listMatchingNotifications(spec).then(function (matched) {
    var showP = Promise.resolve();
    if (matched && matched.length) {
      var n = matched[0];
      var title = String(n.title || "").trim();
      if (!title || title === "." || title === "·" || title === "\u200b") {
        title = String((n.data && n.data.kind) || "info");
      }
      var body = String(n.body || "");
      var tag = String(n.tag || "").trim() || "vc-site-dismiss";
      var opts = {
        tag: tag,
        body: body,
        silent: true,
        renotify: false,
        data: Object.assign({}, n.data && typeof n.data === "object" ? n.data : {}, {
          type: "dismiss",
          vcAck: true,
        }),
      };
      try {
        if (n.icon) opts.icon = n.icon;
        if (n.badge) opts.badge = n.badge;
      } catch (eIco) {}
      showP = self.registration.showNotification(title, opts).catch(function () {});
    } else {
      showP = sameOriginClients().then(function (list) {
        if (list && list.length) return;
        /* Nessun banner + PWA chiusa: serve 1 showNotification (userVisibleOnly)
           altrimenti FCM/APNs ritardano i content. Tag dedicato + close immediato;
           titolo reale (mai “.” / ZWSP). */
        return self.registration
          .showNotification("Notifiche", {
            tag: "vc-badge-sync",
            body: "",
            silent: true,
            renotify: false,
            data: { type: "dismiss", vcAck: true },
          })
          .then(function () {
            return self.registration.getNotifications({ tag: "vc-badge-sync" }).then(function (ns) {
              (ns || []).forEach(function (x) {
                try {
                  x.close();
                } catch (eC) {}
              });
            });
          })
          .catch(function () {});
      });
    }
    return showP.then(function () {
      return closeMatchingNotifications(spec).then(function (closeResult) {
        return closeAckNotificationsNow().then(function () {
          return closeResult || { closed: 0, tags: [] };
        });
      });
    });
  });
}

function isBlankPushText(s) {
  return !String(s || "")
    .replace(/[\u200b\u200c\u200d\ufeff\u00a0]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function looksLikeSiteNamePush(s) {
  var raw = String(s || "").replace(/\s+/g, " ").trim();
  var t = raw.toLowerCase();
  if (!t) return true;
  /* brand lungo con emoji/season (pumpkin/leaf) = ghost title Windows */
  var bare = t
    .replace(/[^\w\s&àèéê]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/vinili/.test(bare) && /caff/.test(bare) && /(italia|social|gaming)/.test(bare)) return true;
  if (/^vinili(\s*[&e]\s*caff[eèê]?)?(\s*(italia|social|gaming))*$/i.test(bare)) return true;
  return /^(vinili\s*[&e]\s*caff[eè]?|viniliecaffe|vinili)$/i.test(t);
}

function isGhostPushText(s) {
  if (isBlankPushText(s)) return true;
  var t = String(s || "")
    .replace(/\s+/g, " ")
    .trim();
  if (t === "." || t === "·" || t === "•" || t === "…" || t === "...") return true;
  if (/^nuova\s+notifica$/i.test(t)) return true;
  if (looksLikeSiteNamePush(t)) return true;
  return false;
}

function asIdList(raw, max) {
  var out = [];
  var seen = {};
  var arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (var i = 0; i < arr.length; i += 1) {
    var v = String(arr[i] || "").trim();
    if (!v || seen[v]) continue;
    seen[v] = true;
    out.push(v);
    if (out.length >= (max || 80)) break;
  }
  return out;
}

function emptyPushPayload(extra) {
  var base = {
    type: "",
    title: "",
    body: "",
    openUrl: "/",
    icon: PUSH_ICON,
    badge: PUSH_ICON,
    id: "",
    ticketId: "",
    messageId: "",
    kind: "info",
    dedupeKey: "",
    channel: "",
    ids: [],
    ticketIds: [],
    all: false,
    blank: true,
  };
  if (extra && typeof extra === "object") {
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) base[k] = extra[k];
    }
  }
  return base;
}

function pushFieldsFromObject(data) {
  if (!data || typeof data !== "object") return emptyPushPayload();
  try {
    var id = String(data.id || "").trim().slice(0, 40);
    var ticketId = String(data.ticketId || "").trim().slice(0, 40);
    var ids = asIdList(data.ids, 80);
    var ticketIds = asIdList(data.ticketIds, 40).map(function (t) {
      return t.toLowerCase();
    });
    if (id && ids.indexOf(id) === -1) ids.unshift(id);
    if (ticketId) {
      var tl = ticketId.toLowerCase();
      if (ticketIds.indexOf(tl) === -1) ticketIds.unshift(tl);
    }
    var title = String(data.title || "").trim().slice(0, 120);
    var body = String(data.body || "").trim().slice(0, 500);
    var type = String(data.type || "").trim().slice(0, 24);
    /* pushKillGhostSpam1: sito / “Nuova notifica” / vuoto = ghost (no banner) */
    if (type !== "dismiss" && isGhostPushText(title) && isGhostPushText(body)) {
      title = "";
      body = "";
    } else if (type !== "dismiss") {
      if (isGhostPushText(title) && !isGhostPushText(body)) title = "";
      if (isGhostPushText(body) && !isGhostPushText(title) && /^nuova\s+notifica$/i.test(body)) {
        body = "";
      }
      if (isGhostPushText(title) && isGhostPushText(body)) {
        title = "";
        body = "";
      }
    }
    return {
      type: type,
      title: title,
      body: body,
      openUrl: String(data.openUrl || "/").slice(0, 2000),
      icon: String(data.icon || PUSH_ICON).slice(0, 500) || PUSH_ICON,
      badge: String(data.badge || data.icon || PUSH_ICON).slice(0, 500) || PUSH_ICON,
      image: String(data.image || "").trim().slice(0, 500),
      id: id,
      ticketId: ticketId,
      messageId: String(data.messageId || "").trim().slice(0, 40),
      kind: String(data.kind || "info").slice(0, 24),
      dedupeKey: String(data.dedupeKey || "").trim().slice(0, 180),
      channel: String(data.channel || "").trim().slice(0, 16),
      ids: ids,
      ticketIds: ticketIds,
      all: data.all === true,
      /* pushBadgeSyncPhone1: campi dismiss/badge persi dal parse — ripristinati */
      unreadCount: Number.isFinite(Number(data.unreadCount))
        ? Math.max(0, Math.min(99, Math.floor(Number(data.unreadCount))))
        : -1,
      openUrls: asIdList(data.openUrls, 40),
      dedupeKeys: asIdList(data.dedupeKeys, 40),
      pageUrl: String(data.pageUrl || "").trim().slice(0, 500),
      msgCount: Number(data.msgCount) > 0 ? Math.min(99, Math.floor(Number(data.msgCount))) : 0,
      createdAt: Number(data.createdAt) || 0,
      blank: isGhostPushText(title) && isGhostPushText(body) && type !== "dismiss",
    };
  } catch (e) {
    return emptyPushPayload();
  }
}

/* pushIosDeclarative1: web_push:8030 → campi flat per show/ack */
function unwrapDeclarativeJson(data) {
  if (!data || typeof data !== "object") return data;
  if (Number(data.web_push) !== 8030) return data;
  var n = data.notification;
  if (!n || typeof n !== "object") return data;
  var nested = n.data && typeof n.data === "object" ? n.data : {};
  var unread =
    Number.isFinite(Number(data.app_badge)) && Number(data.app_badge) >= 0
      ? Math.max(0, Math.min(99, Math.floor(Number(data.app_badge))))
      : Number.isFinite(Number(n.app_badge)) && Number(n.app_badge) >= 0
        ? Math.max(0, Math.min(99, Math.floor(Number(n.app_badge))))
        : Number.isFinite(Number(nested.unreadCount))
          ? Number(nested.unreadCount)
          : Number.isFinite(Number(data.unreadCount))
            ? Number(data.unreadCount)
            : -1;
  var out = {};
  var k;
  for (k in data) {
    if (Object.prototype.hasOwnProperty.call(data, k) && k !== "notification" && k !== "web_push" && k !== "mutable" && k !== "app_badge") {
      out[k] = data[k];
    }
  }
  for (k in nested) {
    if (Object.prototype.hasOwnProperty.call(nested, k)) out[k] = nested[k];
  }
  out.title = String(n.title || out.title || "").trim();
  out.body = String(n.body || out.body || "").trim();
  out.openUrl = String(n.navigate || out.openUrl || nested.openUrl || nested.url || "/").trim();
  if (n.icon) out.icon = String(n.icon).trim();
  if (n.badge) out.badge = String(n.badge).trim();
  if (n.image) out.image = String(n.image).trim();
  out.unreadCount = unread;
  return out;
}

function payloadFromProposedNotification(proposed) {
  var dataObj = {};
  try {
    var raw = proposed && proposed.data;
    if (raw && typeof raw === "object") dataObj = raw;
    else if (typeof raw === "string" && raw.trim()) {
      try {
        dataObj = JSON.parse(raw) || {};
      } catch (eParse) {
        dataObj = {};
      }
    }
  } catch (eData) {
    dataObj = {};
  }
  var title = "";
  var body = "";
  var navigate = "";
  var icon = "";
  var badge = "";
  try {
    title = String((proposed && proposed.title) || dataObj.title || "").trim();
  } catch (eT) {}
  try {
    body = String((proposed && proposed.body) || dataObj.body || "").trim();
  } catch (eB) {}
  try {
    navigate = String(
      (proposed && proposed.navigate) || dataObj.openUrl || dataObj.url || "/",
    ).trim();
  } catch (eN) {
    navigate = String(dataObj.openUrl || "/").trim() || "/";
  }
  try {
    icon = String((proposed && proposed.icon) || dataObj.icon || "").trim();
  } catch (eI) {}
  try {
    badge = String((proposed && proposed.badge) || dataObj.badge || icon || "").trim();
  } catch (eBd) {}
  return pushFieldsFromObject(
    Object.assign({}, dataObj, {
      title: title,
      body: body,
      openUrl: navigate || "/",
      icon: icon || undefined,
      badge: badge || undefined,
    }),
  );
}

function parsePayload(event) {
  /* pushNoGhostTitle1: niente fallback “Nuova notifica” — altrimenti push vuote
     diventano banner fantasma che poi il dismiss chiude subito. */
  /* pushIosDeclarative1: mutable → event.notification, event.data null */
  try {
    if (event && event.notification) {
      var hasDataText = false;
      try {
        hasDataText = !!(
          event.data &&
          String(event.data.text() || "")
            .replace(/\s+/g, "")
            .trim()
        );
      } catch (eHas) {
        hasDataText = false;
      }
      if (!hasDataText) {
        return payloadFromProposedNotification(event.notification);
      }
    }
  } catch (eDecl) {}
  if (!event || !event.data) return emptyPushPayload();
  try {
    var rawText = "";
    try {
      rawText = String(event.data.text() || "");
    } catch (eTxt) {
      rawText = "";
    }
    if (!String(rawText || "").replace(/\s+/g, "").trim()) return emptyPushPayload();
    var data = JSON.parse(rawText);
    if (!data || typeof data !== "object") return emptyPushPayload();
    data = unwrapDeclarativeJson(data);
    return pushFieldsFromObject(data);
  } catch (e) {
    return emptyPushPayload();
  }
}

function normalizePathForDismiss(url) {
  try {
    var u = new URL(String(url || "/"), self.location.origin);
    return String(u.pathname || "/").replace(/\/+$/, "") || "/";
  } catch (e) {
    return "";
  }
}

function pageContextFromUrl(pageUrl) {
  try {
    var u = new URL(String(pageUrl || "/"), self.location.origin);
    var path = String(u.pathname || "/").replace(/\/+$/, "") || "/";
    var inbox = String(u.searchParams.get("inbox") || "")
      .trim()
      .toLowerCase();
    var tab = String(u.searchParams.get("tab") || "")
      .trim()
      .toLowerCase();
    if (/\/staff\/inbox$/i.test(path) && tab) inbox = tab;
    var ticket =
      String(u.searchParams.get("ticketId") || "")
        .trim()
        .toLowerCase() ||
      String(u.hash || "")
        .replace(/^#/, "")
        .trim()
        .toLowerCase();
    if (!/^[a-f0-9]{24}$/i.test(ticket)) ticket = "";
    return { path: path, inbox: inbox, ticket: ticket, search: String(u.search || "") };
  } catch (e) {
    return { path: "", inbox: "", ticket: "", search: "" };
  }
}

function openUrlMatchesPageContext(openUrl, ticketId, ctx) {
  if (!ctx || !ctx.path) return false;
  var tid = String(ticketId || "")
    .trim()
    .toLowerCase();
  var destPath = "";
  var destInbox = "";
  var destTid = tid;
  try {
    var u = new URL(String(openUrl || "/"), self.location.origin);
    destPath = String(u.pathname || "/").replace(/\/+$/, "") || "/";
    destInbox = String(u.searchParams.get("inbox") || "")
      .trim()
      .toLowerCase();
    if (!destTid) {
      destTid =
        String(u.searchParams.get("ticketId") || "")
          .trim()
          .toLowerCase() ||
        String(u.hash || "")
          .replace(/^#/, "")
          .trim()
          .toLowerCase();
      if (!/^[a-f0-9]{24}$/i.test(destTid)) destTid = "";
    }
  } catch (e) {
    destPath = normalizePathForDismiss(openUrl);
  }
  if (destTid && ctx.ticket && destTid === ctx.ticket) return true;
  if (destInbox && ctx.inbox && destInbox === ctx.inbox) {
    if (
      (/\/notifications$/i.test(destPath) || /\/staff\/inbox$/i.test(destPath)) &&
      (/\/notifications$/i.test(ctx.path) || /\/staff\/inbox$/i.test(ctx.path))
    ) {
      return true;
    }
    if (destInbox === "pause" && /\/staff\/pause$/i.test(ctx.path)) return true;
    if (destInbox === "appelli" && /\/appelli$/i.test(ctx.path)) return true;
    if (destInbox === "candidature" && /\/candidature$/i.test(ctx.path)) return true;
    if (destInbox === "resoconti" && /\/staff\/resoconti$/i.test(ctx.path)) return true;
  }
  /* pushBadgeVisitFix1: pagina dedicata ↔ openUrl inbox= */
  if (/\/staff\/pause$/i.test(ctx.path) && (/inbox=pause\b/i.test(String(openUrl || "")) || /\/staff\/pause/i.test(destPath))) {
    return true;
  }
  if (/\/appelli$/i.test(ctx.path) && (/inbox=appelli\b/i.test(String(openUrl || "")) || /\/appelli/i.test(destPath))) {
    return true;
  }
  if (
    /\/candidature$/i.test(ctx.path) &&
    (/inbox=candidature\b/i.test(String(openUrl || "")) || /\/candidature/i.test(destPath))
  ) {
    return true;
  }
  if (!destPath || destPath === "/") return false;
  if (destPath === ctx.path) {
    if (destTid && ctx.ticket && destTid !== ctx.ticket) return false;
    if (destInbox && ctx.inbox && destInbox !== ctx.inbox) return false;
    return true;
  }
  if (ctx.path.indexOf(destPath + "/") === 0) return true;
  return false;
}

function dismissSpecFromPayload(payload) {
  return {
    all: payload && payload.all === true,
    id: String((payload && payload.id) || "").trim(),
    ticketId: String((payload && payload.ticketId) || "")
      .trim()
      .toLowerCase(),
    ids: asIdList(payload && payload.ids, 80),
    ticketIds: asIdList(payload && payload.ticketIds, 40).map(function (t) {
      return String(t || "")
        .trim()
        .toLowerCase();
    }),
    openUrls: asIdList(payload && payload.openUrls, 40),
    dedupeKeys: asIdList(payload && payload.dedupeKeys, 40),
    pageUrl: String((payload && payload.pageUrl) || "").trim(),
  };
}

function dismissSpecFromMessage(data) {
  var id = String((data && data.id) || "").trim();
  var ticketId = String((data && data.ticketId) || "")
    .trim()
    .toLowerCase();
  var ids = asIdList(data && data.ids, 80);
  var ticketIds = asIdList(data && data.ticketIds, 40).map(function (t) {
    return String(t || "")
      .trim()
      .toLowerCase();
  });
  var openUrls = asIdList(data && data.openUrls, 40);
  var dedupeKeys = asIdList(data && data.dedupeKeys, 40);
  var pageUrl = String((data && data.pageUrl) || "").trim();
  if (id && ids.indexOf(id) === -1) ids.unshift(id);
  if (ticketId && ticketIds.indexOf(ticketId) === -1) ticketIds.unshift(ticketId);
  return {
    all: data && data.all === true,
    id: id,
    ticketId: ticketId,
    ids: ids,
    ticketIds: ticketIds,
    openUrls: openUrls,
    dedupeKeys: dedupeKeys,
    pageUrl: pageUrl,
  };
}

/* pushAutoDismiss1: match openUrl su staffOpen/inbox/resoId/pauseId, non solo pathname */
function openUrlDismissRelated(nOpen, ou) {
  var a = String(nOpen || "").trim();
  var b = String(ou || "").trim();
  if (!a || !b) return false;
  if (a === b) return true;
  var aPath = normalizePathForDismiss(a);
  var bPath = normalizePathForDismiss(b);
  if (aPath && bPath && aPath === bPath) {
    try {
      var ua = new URL(a, self.location.origin);
      var ub = new URL(b, self.location.origin);
      var keys = ["staffOpen", "inbox", "resoId", "pauseId", "item", "tab", "id"];
      var shared = false;
      for (var i = 0; i < keys.length; i += 1) {
        var ka = String(ua.searchParams.get(keys[i]) || "")
          .trim()
          .toLowerCase();
        var kb = String(ub.searchParams.get(keys[i]) || "")
          .trim()
          .toLowerCase();
        if (!ka || !kb) continue;
        shared = true;
        if (ka !== kb) return false;
      }
      /* stesso path + almeno un query rilevante uguale, oppure entrambi senza quei param */
      return shared || true;
    } catch (eRel) {
      return true;
    }
  }
  /* alias resoconti/pause: pathname diversi ma stessa coda */
  var aL = a.toLowerCase();
  var bL = b.toLowerCase();
  if (
    (/staffopen=resocont/i.test(aL) || /inbox=resoconti/i.test(aL)) &&
    (/staffopen=resocont/i.test(bL) || /inbox=resoconti/i.test(bL))
  ) {
    return true;
  }
  if (
    (/staffopen=pause/i.test(aL) || /\/staff\/pause/i.test(aL)) &&
    (/staffopen=pause/i.test(bL) || /\/staff\/pause/i.test(bL))
  ) {
    return true;
  }
  return false;
}

function notificationMatchesDismiss(notif, spec) {
  if (!notif || !spec) return false;
  if (spec.all) return true;
  var d = notif.data && typeof notif.data === "object" ? notif.data : {};
  var nTid = String(d.ticketId || "")
    .trim()
    .toLowerCase();
  var nId = String(d.id || "").trim();
  var nMsg = String(d.messageId || "").trim();
  var nOpen = String(d.openUrl || "").trim();
  var nDk = String(d.dedupeKey || "").trim();
  var nTag = String(notif.tag || "");
  var ticketMap = {};
  var idMap = {};
  var dkMap = {};
  var i;
  for (i = 0; i < (spec.ticketIds || []).length; i += 1) {
    var tk = String(spec.ticketIds[i] || "")
      .trim()
      .toLowerCase();
    if (tk) ticketMap[tk] = true;
  }
  if (spec.ticketId) ticketMap[spec.ticketId] = true;
  for (i = 0; i < (spec.ids || []).length; i += 1) {
    var ik = String(spec.ids[i] || "").trim();
    if (ik) idMap[ik] = true;
  }
  if (spec.id) idMap[spec.id] = true;
  for (i = 0; i < (spec.dedupeKeys || []).length; i += 1) {
    var dk = String(spec.dedupeKeys[i] || "").trim();
    if (dk) dkMap[dk] = true;
  }
  if (nTid && ticketMap[nTid]) return true;
  if (nId && idMap[nId]) return true;
  if (nMsg && (idMap[nMsg] || idMap[nId])) return true;
  /* pushAutoDismiss1: match dedupeKey (digest lifecycle) */
  if (nDk && dkMap[nDk]) return true;
  for (var dkKey in dkMap) {
    if (!dkMap[dkKey]) continue;
    if (nDk && (nDk === dkKey || nDk.indexOf(dkKey) === 0 || dkKey.indexOf(nDk) === 0)) return true;
    var dkTag = String(dkKey || "").replace(/\W+/g, "").slice(-18);
    if (dkTag && nTag.indexOf("vc-site-digest-") === 0 && nTag.indexOf(dkTag) !== -1) return true;
  }
  for (var tKey in ticketMap) {
    if (!ticketMap[tKey]) continue;
    if (nTag === "vc-site-ticket-" + tKey) return true;
    if (nTag.indexOf("vc-site-ticket-" + tKey + "-") === 0) return true;
  }
  for (var iKey in idMap) {
    if (!idMap[iKey]) continue;
    if (nTag === "vc-site-" + iKey || nTag.indexOf("vc-site-" + iKey) === 0) return true;
    if (nTag === "vc-site-msg-" + iKey) return true;
    /* pushDismissBtn1: vote/digest tag usano suffix id — match anche senza data.id */
    var shortId = iKey.length > 10 ? iKey.slice(-10) : iKey;
    if (shortId && nTag.indexOf(shortId) !== -1) {
      if (
        nTag.indexOf("vc-vote-") === 0 ||
        nTag.indexOf("vc-site-digest-") === 0 ||
        nTag.indexOf("vc-site-") === 0 ||
        nTag.indexOf("vc-site-msg-") === 0
      ) {
        return true;
      }
    }
    if (nTag && nTag.indexOf(iKey) !== -1) return true;
  }
  if (nOpen && (spec.openUrls || []).length) {
    for (i = 0; i < spec.openUrls.length; i += 1) {
      var ou = String(spec.openUrls[i] || "").trim();
      if (!ou) continue;
      if (openUrlDismissRelated(nOpen, ou)) return true;
    }
  }
  if (spec.pageUrl && nOpen) {
    if (openUrlMatchesPageContext(nOpen, nTid, pageContextFromUrl(spec.pageUrl))) return true;
  }
  if (
    !Object.keys(ticketMap).length &&
    !Object.keys(idMap).length &&
    !Object.keys(dkMap).length &&
    !(spec.openUrls || []).length &&
    !spec.pageUrl
  ) {
    return false;
  }
  return false;
}

function closeMatchingNotificationsOnce(spec) {
  if (!self.registration || typeof self.registration.getNotifications !== "function") {
    return Promise.resolve({ closed: 0, tags: [] });
  }
  var jobs = [self.registration.getNotifications()];
  try {
    jobs.push(self.registration.getNotifications({ includeTriggered: true }));
  } catch (eInc) {}
  return Promise.all(jobs)
    .then(function (lists) {
      var seen = {};
      var closed = 0;
      var tags = [];
      (lists || []).forEach(function (list) {
        (list || []).forEach(function (n) {
          if (!n) return;
          /* pushAckEmptyFix1: non chiudere ack silenzioso in race */
          try {
            if (n.data && n.data.vcAck) return;
            if (String(n.tag || "") === "vc-push-ack") return;
          } catch (eAck) {}
          var key =
            String(n.tag || "") +
            "|" +
            String((n.data && n.data.id) || "") +
            "|" +
            String((n.data && n.data.ticketId) || "");
          if (seen[key]) return;
          seen[key] = true;
          if (!notificationMatchesDismiss(n, spec)) return;
          try {
            var tg = String(n.tag || "").trim();
            if (tg && tags.indexOf(tg) === -1) tags.push(tg);
            n.close();
            closed += 1;
          } catch (eClose) {}
        });
      });
      return { closed: closed, tags: tags };
    })
    .catch(function () {
      return { closed: 0, tags: [] };
    });
}

function closeMatchingNotifications(spec) {
  /* pushVisitOsDismiss2: retry breve — Android a volte lascia ghost dopo close */
  return closeMatchingNotificationsOnce(spec)
    .then(function (first) {
      var closed = Number((first && first.closed) || 0);
      var tags = (first && first.tags) || [];
      return new Promise(function (resolve) {
        setTimeout(function () {
          closeMatchingNotificationsOnce(spec)
            .then(function (second) {
              var closed2 = Number((second && second.closed) || 0);
              var tags2 = (second && second.tags) || [];
              for (var i = 0; i < tags2.length; i += 1) {
                if (tags.indexOf(tags2[i]) === -1) tags.push(tags2[i]);
              }
              resolve({ closed: closed + closed2, tags: tags });
            })
            .catch(function () {
              resolve({ closed: closed, tags: tags });
            });
        }, 280);
      });
    })
    .then(function (result) {
      return syncAppBadgeFromOsNotifications().then(function () {
        return result || { closed: 0, tags: [] };
      });
    })
    .catch(function () {
      return { closed: 0, tags: [] };
    });
}

/* pushPwaBadgeStable1: badge icona PWA = conteggio banner OS aperti (anche app chiusa) */
/* pushBadgeVisitFix1: includeTriggered + retry breve (Android lascia ghost dopo close) */
/* osBadgeNoFlash2: se esiste QUALSIASI client stesso origin, page possiede il badge —
   non sovrascrivere con conteggio banner OS (≠ unread inbox → flash continuo). */
function syncAppBadgeFromOsNotifications(opts) {
  opts = opts || {};
  var nav = self.navigator || (typeof navigator !== "undefined" ? navigator : null);
  if (!nav) return Promise.resolve();
  var canSet = typeof nav.setAppBadge === "function";
  var canClear = typeof nav.clearAppBadge === "function";
  if (!canSet && !canClear) return Promise.resolve();
  if (!self.registration || typeof self.registration.getNotifications !== "function") {
    /* osBadgeStable1: senza getNotifications NON clear cieco (PWA aperta → flash) */
    return Promise.resolve();
  }
  return sameOriginClients()
    .then(function (list) {
      var hasClient = false;
      try {
        (list || []).forEach(function (c) {
          if (c) hasClient = true;
        });
      } catch (eHas) {}
      /* PWA/tab aperta: lascia badge alla page (vc:set-app-badge) */
      if (hasClient) return Promise.resolve(undefined);
      var jobs = [self.registration.getNotifications()];
      try {
        jobs.push(self.registration.getNotifications({ includeTriggered: true }));
      } catch (eInc) {}
      return Promise.all(jobs).then(function (lists) {
        var seen = {};
        var n = 0;
        (lists || []).forEach(function (listN) {
          (listN || []).forEach(function (notif) {
            if (!notif) return;
            if (isAckNotification(notif)) return;
            var key =
              String(notif.tag || "") +
              "|" +
              String((notif.data && notif.data.id) || "") +
              "|" +
              String((notif.data && notif.data.ticketId) || "");
            if (seen[key]) return;
            seen[key] = true;
            n += 1;
          });
        });
        if (n > 0 && canSet) {
          return setAppBadgeCount(n).then(function () {
            return n;
          });
        }
        if (n <= 0 && canClear) {
          return setAppBadgeCount(0).then(function () {
            return 0;
          });
        }
        return n;
      });
    })
    .then(function (nOrUndef) {
      if (opts.retry === false || nOrUndef === undefined) return nOrUndef;
      return new Promise(function (resolve) {
        setTimeout(function () {
          syncAppBadgeFromOsNotifications({ retry: false }).then(resolve).catch(function () {
            resolve(nOrUndef);
          });
        }, 320);
      });
    })
    .catch(function () {
      return undefined;
    });
}

function isViniliSiteHost(host) {
  var h = String(host || "")
    .trim()
    .toLowerCase();
  return h === "viniliecaffe.it" || h === "www.viniliecaffe.it" || h === "viniliecaffe.gg" || h === "www.viniliecaffe.gg";
}

function sameOriginUrl(dest) {
  try {
    var u = new URL(String(dest || "/"), self.location.origin);
    var here = new URL(self.location.origin);
    if (u.origin === here.origin) return u.href;
    /* pushOpenDestFix1: apex/www (e .gg) sono lo stesso sito — non buttare path a / */
    if (isViniliSiteHost(u.hostname) && isViniliSiteHost(here.hostname)) {
      return here.origin + (u.pathname || "/") + (u.search || "") + (u.hash || "");
    }
    return here.origin + "/";
  } catch (e) {
    return self.location.origin + "/";
  }
}

/** Deep link sicuro al click: openUrl + ticketId (mai solo homepage se c’è un ticket). */
function resolveNotificationClickDest(nd) {
  nd = nd && typeof nd === "object" ? nd : {};
  var openRaw = String(nd.openUrl || "").trim();
  var ticketId = String(nd.ticketId || "")
    .trim()
    .toLowerCase();
  var dest = sameOriginUrl(openRaw || "/");
  var viewStaff = false;
  var path = "/";
  var hasTicketInUrl = false;
  try {
    var u = new URL(dest);
    path = String(u.pathname || "/").replace(/\/+$/, "") || "/";
    viewStaff = String(u.searchParams.get("view") || "").toLowerCase() === "staff";
    hasTicketInUrl = /^[a-f0-9]{24}$/i.test(String(u.searchParams.get("ticketId") || "").trim());
    if (!hasTicketInUrl) {
      hasTicketInUrl = /^[a-f0-9]{24}$/i.test(String(u.hash || "").replace(/^#/, "").trim());
    }
  } catch (eU) {}
  if (!viewStaff && /[?&]view=staff\b/i.test(openRaw)) viewStaff = true;
  if (/^[a-f0-9]{24}$/i.test(ticketId) && (!hasTicketInUrl || path === "/")) {
    return (
      self.location.origin +
      "/tickets/" +
      (viewStaff ? "?view=staff&" : "?") +
      "ticketId=" +
      encodeURIComponent(ticketId) +
      "#" +
      ticketId
    );
  }
  return dest;
}

var PENDING_NAV_CACHE = "vc-pending-nav-v1";
var PENDING_NAV_URL = "/__vc/pending-nav";

/** Una write su click (cold start PWA apre spesso start_url, non dest). */
function writePendingNav(payload) {
  if (!self.caches || typeof self.caches.open !== "function") return Promise.resolve();
  return self.caches
    .open(PENDING_NAV_CACHE)
    .then(function (cache) {
      return cache.put(
        PENDING_NAV_URL,
        new Response(JSON.stringify(payload || {}), {
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        }),
      );
    })
    .catch(function () {});
}

/* pushSkipRead1 */
function rememberDismissedIdsInMem(ids) {
  var arr = asIdList(ids, 120);
  if (!arr.length) return;
  var now = Date.now();
  for (var i = 0; i < arr.length; i += 1) {
    dismissedIdsMem[arr[i]] = now;
  }
  dismissedIdsMemAt = now;
  var keys = Object.keys(dismissedIdsMem);
  if (keys.length > 600) {
    keys.sort(function (a, b) {
      return (dismissedIdsMem[a] || 0) - (dismissedIdsMem[b] || 0);
    });
    for (var k = 0; k < keys.length - 500; k += 1) {
      delete dismissedIdsMem[keys[k]];
    }
  }
}

function persistDismissedIds(ids) {
  rememberDismissedIdsInMem(ids);
  if (!self.caches || typeof self.caches.open !== "function") return Promise.resolve();
  return self.caches
    .open(DISMISSED_IDS_CACHE)
    .then(function (cache) {
      return cache.match(DISMISSED_IDS_URL).then(function (prev) {
        var merge = function (arr) {
          var map = Object.create(null);
          var out = [];
          var src = (arr || []).concat(asIdList(ids, 120));
          for (var i = 0; i < src.length; i += 1) {
            var v = String(src[i] || "").trim();
            if (!v || map[v]) continue;
            map[v] = 1;
            out.push(v);
          }
          if (out.length > 500) out = out.slice(out.length - 500);
          rememberDismissedIdsInMem(out);
          return cache.put(
            DISMISSED_IDS_URL,
            new Response(JSON.stringify({ ids: out, at: Date.now() }), {
              headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            }),
          );
        };
        if (!prev) return merge([]);
        return prev
          .json()
          .then(function (j) {
            return merge(Array.isArray(j && j.ids) ? j.ids : []);
          })
          .catch(function () {
            return merge([]);
          });
      });
    })
    .catch(function () {});
}

function loadDismissedIds() {
  if (dismissedIdsMemAt && Date.now() - dismissedIdsMemAt < 8000) {
    return Promise.resolve(dismissedIdsMem);
  }
  if (!self.caches || typeof self.caches.open !== "function") {
    return Promise.resolve(dismissedIdsMem);
  }
  return self.caches
    .open(DISMISSED_IDS_CACHE)
    .then(function (cache) {
      return cache.match(DISMISSED_IDS_URL);
    })
    .then(function (res) {
      if (!res) return dismissedIdsMem;
      return res
        .json()
        .then(function (j) {
          rememberDismissedIdsInMem(Array.isArray(j && j.ids) ? j.ids : []);
          return dismissedIdsMem;
        })
        .catch(function () {
          return dismissedIdsMem;
        });
    })
    .catch(function () {
      return dismissedIdsMem;
    });
}

function isIdDismissedLocal(id, map) {
  var sid = String(id || "").trim();
  if (!sid) return false;
  return Boolean(map && map[sid]);
}

function askClientsNotifDismissed(id, dedupeKey) {
  var sid = String(id || "").trim();
  if (!sid) return Promise.resolve(false);
  return sameOriginClients().then(function (list) {
    if (!list || !list.length) return false;
    var checks = list.slice(0, 4).map(function (c) {
      return new Promise(function (resolve) {
        var done = false;
        var t = setTimeout(function () {
          if (!done) {
            done = true;
            resolve(false);
          }
        }, 140);
        try {
          var ch = new MessageChannel();
          ch.port1.onmessage = function (ev) {
            if (done) return;
            done = true;
            clearTimeout(t);
            resolve(!!(ev && ev.data && ev.data.dismissed));
          };
          c.postMessage(
            { type: "vc:query-notif-dismissed", id: sid, dedupeKey: String(dedupeKey || "").trim() },
            [ch.port2],
          );
        } catch (eAsk) {
          clearTimeout(t);
          resolve(false);
        }
      });
    });
    return Promise.all(checks).then(function (vals) {
      for (var i = 0; i < vals.length; i += 1) {
        if (vals[i]) return true;
      }
      return false;
    });
  });
}

function shouldSkipShowForRead(payload) {
  var pid = String((payload && payload.id) || "").trim();
  var dk = String((payload && payload.dedupeKey) || "").trim();
  if (!pid && !dk) return Promise.resolve(false);
  /* pushAppleShowNoCache1: su Apple NON await Cache Storage — hang tipico PWA kill. */
  if (isApplePushClient()) {
    if (isIdDismissedLocal(pid, dismissedIdsMem) || (dk && isIdDismissedLocal(dk, dismissedIdsMem))) {
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }
  return loadDismissedIds().then(function (map) {
    if (isIdDismissedLocal(pid, map) || (dk && isIdDismissedLocal(dk, map))) {
      return true;
    }
    /* Desktop/WNS: query client aperti (PWA già sa che è letta) — max ~140ms */
    return askClientsNotifDismissed(pid, dk).then(function (yes) {
      if (yes && pid) {
        try {
          persistDismissedIds([pid]);
        } catch (eP) {}
      }
      return yes;
    });
  });
}

function openDestWindow(dest) {
  if (!self.clients || typeof self.clients.openWindow !== "function") return Promise.resolve(null);
  return Promise.resolve(self.clients.openWindow(dest)).catch(function () {
    return null;
  });
}

function isSameOriginWindowClient(c) {
  if (!c) return false;
  try {
    return new URL(c.url).origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

function clientMatchesDest(c, want) {
  if (!c) return false;
  try {
    var a = String(c.url || "").split("#")[0];
    var b = String(want || "").split("#")[0];
    if (!a || !b) return false;
    if (a === b) return true;
    var ua = new URL(a);
    var ub = new URL(b, self.location.origin);
    return (
      ua.pathname.replace(/\/+$/, "") === ub.pathname.replace(/\/+$/, "") && ua.search === ub.search
    );
  } catch (eSd) {
    return false;
  }
}

function isLikelyMobilePushUa() {
  try {
    return /Android|iPhone|iPad|iPod/i.test(String((self.navigator && self.navigator.userAgent) || ""));
  } catch (eUa) {
    return false;
  }
}

/** pushWinPwaReuse1: PWA Windows minimizzata spesso hidden — riusala comunque.
 *  pwaOpenPush1: su telefono non riusare tab Chrome sepolta (apri/focus PWA). */
function pickNotificationClickClient(list, dest) {
  var clients = [];
  for (var i = 0; i < (list || []).length; i += 1) {
    if (isSameOriginWindowClient(list[i])) clients.push(list[i]);
  }
  if (!clients.length) return null;
  var onDest = null;
  var focused = null;
  var visible = null;
  for (var j = 0; j < clients.length; j += 1) {
    var c = clients[j];
    if (clientMatchesDest(c, dest) && !onDest) onDest = c;
    try {
      if (c.focused === true && !focused) focused = c;
    } catch (eF) {}
    if (c.visibilityState === "visible" && !visible) visible = c;
  }
  if (isLikelyMobilePushUa()) {
    return onDest || focused || visible || null;
  }
  return onDest || focused || visible || clients[0];
}

function openExistingClientDest(client, dest, notifId, ticketId) {
  try {
    client.postMessage({
      type: "vc:open-dest",
      url: dest,
      ticketId: ticketId,
      id: notifId,
    });
  } catch (ePm) {}
  return Promise.resolve(typeof client.focus === "function" ? client.focus() : null)
    .catch(function () {
      return null;
    })
    .then(function () {
      if (clientMatchesDest(client, dest)) return client;
      if (typeof client.navigate !== "function") return client;
      return Promise.resolve(client.navigate(dest))
        .then(function (navClient) {
          return navClient || client;
        })
        .catch(function () {
          /* navigate PWA spesso fallisce su Windows — postMessage + location.href in pagina */
          return client;
        });
    });
}

function sameOriginClients() {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    var out = [];
    (list || []).forEach(function (c) {
      if (!c) return;
      try {
        var u = new URL(c.url);
        if (u.origin !== self.location.origin) return;
      } catch (e) {
        return;
      }
      out.push(c);
    });
    return out;
  });
}

/** pushPwaBadgeStable1: solo client realmente focused — niente fallback “visible”
 *  (su Android un client in background a volte resta visible → OS soppresso = push perse). */
function findInAppFocusedClient(list) {
  for (var i = 0; i < (list || []).length; i += 1) {
    var c = list[i];
    if (!c) continue;
    if (c.visibilityState !== "visible") continue;
    if (c.focused === true) return c;
  }
  return null;
}

function fanoutPushReceived(list, payload, extra) {
  var msg = { type: "vc:push-received", payload: payload };
  if (extra && typeof extra === "object") {
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) msg[k] = extra[k];
    }
  }
  (list || []).forEach(function (c) {
    try {
      c.postMessage(msg);
    } catch (e) {}
  });
}

self.addEventListener("push", function (event) {
  var payload = parsePayload(event);
  if (payload.type === "dismiss") {
    /* badgeOsDismiss1: dismissSatisfyVisible (userVisibleOnly) + badge —
       close-only starveva content FCM/APNs. Desktop skip lato server. */
    var dismissSpec = dismissSpecFromPayload(payload);
    event.waitUntil(
      Promise.all([
        dismissSatisfyVisible(dismissSpec, payload),
        sameOriginClients().then(function (list) {
          fanoutPushReceived(list, payload);
        }),
      ]).then(function (parts) {
        var closeResult = parts && parts[0] ? parts[0] : { closed: 0, tags: [] };
        var unreadRaw = Number(payload.unreadCount);
        var hasUnread = Number.isFinite(unreadRaw) && unreadRaw >= 0;
        var badgeP = Promise.resolve();
        if (hasUnread) {
          badgeP = setAppBadgeCount(unreadRaw);
        } else if (dismissSpec.all) {
          badgeP = setAppBadgeCount(0);
        } else {
          badgeP = syncAppBadgeFromOsNotifications({ retry: false });
        }
        return badgeP.then(function () {
          return closeResult;
        });
      }),
    );
    return;
  }
  /* pushKillEmpty2: blank = solo fanout/badge, zero banner OS inventato */
  if (payload.blank) {
    event.waitUntil(
      sameOriginClients().then(function (list) {
        fanoutPushReceived(list, payload, { suppressOs: true });
        var unreadRaw = Number(payload.unreadCount);
        if (Number.isFinite(unreadRaw) && unreadRaw >= 0) {
          return setAppBadgeCount(unreadRaw);
        }
        return undefined;
      }),
    );
    return;
  }
  /* pushPhoneVisible2 / pushIosShowFirst1: content → showNotification SUBITO.
     Fanout clients dopo (matchAll non deve ritardare il banner iOS).
     pushSkipRead1: skip show se già dismessa (cache / client desktop).
     pushAppleShowNoCache1: Apple = shouldSkip sync (no Cache Storage). */
  event.waitUntil(
    shouldSkipShowForRead(payload).then(function (skipRead) {
      if (skipRead) {
        var unreadSkipRead = Number(payload.unreadCount);
        var skipJobs = [
          sameOriginClients().then(function (list) {
            fanoutPushReceived(list, payload, { suppressOs: true });
          }),
        ];
        if (Number.isFinite(unreadSkipRead) && unreadSkipRead >= 0) {
          skipJobs.push(setAppBadgeCount(unreadSkipRead));
        } else {
          skipJobs.push(syncAppBadgeFromOsNotifications());
        }
        return Promise.all(skipJobs);
      }
      /* pushPhoneTopicAll1: tag OS sempre unici (id/msg/dedupe) — no collapse telefono */
      var kindLc = String(payload.kind || "").toLowerCase();
      var dk = String(payload.dedupeKey || "").toLowerCase();
      var titleLc = String(payload.title || "").toLowerCase();
      var voteTag = "";
      var pid = String(payload.id || "").trim();
      var pmsg = String(payload.messageId || "").trim();
      var ptid = String(payload.ticketId || "").trim();
      if (kindLc === "vote_reminder" || /vote_reminder_/.test(dk) || /promemoria\s+voto/.test(titleLc)) {
        var voteId = pid.slice(-10);
        if (/_topgg|top\.gg|topgg/.test(dk) || /top\.gg/.test(titleLc)) {
          voteTag = "vc-vote-topgg" + (voteId ? "-" + voteId : "");
        } else if (/_discadia|discadia/.test(dk) || /discadia/.test(titleLc)) {
          voteTag = "vc-vote-discadia" + (voteId ? "-" + voteId : "");
        } else {
          voteTag = "vc-vote-" + (voteId || String(Date.now()));
        }
      }
      var isDigest =
        Number(payload.msgCount) > 1 || (dk && dk.indexOf(":digest:") !== -1);
      var isQueue = dk.indexOf("web_ticket:queue:") === 0;
      var tag =
        voteTag ||
        (isDigest || isQueue
          ? "vc-site-digest-" + (dk.replace(/\W+/g, "").slice(-18) || pid || "x")
          : "") ||
        (ptid && pid ? "vc-site-ticket-" + ptid + "-" + pid : "") ||
        (pmsg ? "vc-site-msg-" + pmsg : "") ||
        (pid ? "vc-site-" + pid : "") ||
        (ptid ? "vc-site-ticket-" + ptid + "-" + String(Date.now()) : "") ||
        "vc-site-" + String(Date.now());
      /* pushShownAckVisible1: soft-retry :mprN → tag distinto altrimenti alreadyVisible
         spegne show+ack e l’hedge ruota il token. */
      var mprHit = dk.match(/:(?:mpr|pr)(\d+)$/i);
      if (mprHit && mprHit[1]) {
        tag = String(tag || "vc-site") + "-mpr" + String(mprHit[1]);
      }
      var showTitle = String(payload.title || "").trim();
      if (isGhostPushText(showTitle)) {
        showTitle = String(payload.body || "")
          .trim()
          .split("\n")[0]
          .slice(0, 120);
      }
      var showBody = String(payload.body || "").trim();
      if (isGhostPushText(showBody) || showBody === showTitle) {
        showBody = "";
      }
      /* pushKillEmpty2: niente fallback “Vinili & Caffè” / body generico */
      if (isGhostPushText(showTitle) && isGhostPushText(showBody)) {
        var unreadSkip = Number(payload.unreadCount);
        var blankJobs = [
          sameOriginClients().then(function (list) {
            fanoutPushReceived(list, payload, { suppressOs: true });
          }),
        ];
        if (Number.isFinite(unreadSkip) && unreadSkip >= 0) {
          blankJobs.push(setAppBadgeCount(unreadSkip));
        } else {
          blankJobs.push(syncAppBadgeFromOsNotifications());
        }
        return Promise.all(blankJobs);
      }
      if (isGhostPushText(showTitle)) {
        showTitle = showBody.slice(0, 120) || "Vinili & Caffè";
        if (showTitle === showBody) showBody = "";
      }
      var opts = {
        body: showBody,
        icon: payload.icon,
        badge: payload.badge,
        tag: tag,
        /* iosWinProfilePush1: iOS renotify=true ri-suona/ri-mostra aprendo la PWA
           pushShownAckVisible1: hedge mpr → renotify anche Apple (tag unico). */
        renotify: !isApplePushClient() || Boolean(mprHit),
        silent: false,
        vibrate: isApplePushClient() ? undefined : voteTag ? [120, 60, 120, 60, 120] : [90, 50, 90],
        requireInteraction: !isApplePushClient() && Boolean(voteTag),
        timestamp: Date.now(),
        data: {
          openUrl: payload.openUrl || "/",
          id: payload.id || "",
          ticketId: payload.ticketId || "",
          messageId: payload.messageId || "",
          kind: payload.kind || "info",
          dedupeKey: payload.dedupeKey || "",
        },
      };
      if (payload.image) opts.image = payload.image;
      /* pushShowFirstClosed1 / pushIosShowFirst1: show+ack SUBITO.
         getNotifications pre-show su PWA kill hangua → waitUntil scade →
         APNs 201 zombie (banner solo aprendo la PWA). Dedupe tag after, timeout.
         pushAppleWaitUntil1: dopo show, side-effect con budget corto — mai appendere
         fetch/matchAll/badge al waitUntil oltre ~500ms (iOS droppa il banner). */
      function afterShowJobs() {
        var unreadRaw = Number(payload.unreadCount);
        var fanoutP = Promise.race([
          sameOriginClients().then(function (list) {
            fanoutPushReceived(list, payload, { suppressOs: false });
          }),
          new Promise(function (resolve) {
            setTimeout(resolve, isApplePushClient() ? 250 : 2000);
          }),
        ]).catch(function () {});
        var badgeP;
        if (Number.isFinite(unreadRaw) && unreadRaw >= 0) {
          badgeP = setAppBadgeCount(unreadRaw);
        } else {
          badgeP = Promise.race([
            syncAppBadgeFromOsNotifications(),
            new Promise(function (resolve) {
              setTimeout(resolve, isApplePushClient() ? 250 : 2000);
            }),
          ]).catch(function () {});
        }
        /* pushAppleAckRace1: ack subito, non dietro matchAll/badge */
        var ackP = postPushShownAck(payload);
        if (isApplePushClient()) {
          return Promise.race([
            Promise.all([ackP, fanoutP, badgeP]),
            new Promise(function (resolve) {
              setTimeout(resolve, 500);
            }),
          ]);
        }
        return Promise.all([ackP, fanoutP, badgeP]);
      }
      function showNow() {
        var showOk = false;
        var showP = Promise.resolve(self.registration.showNotification(showTitle, opts))
          .then(function () {
            showOk = true;
          })
          .catch(function () {
            return null;
          });
        /* pushShowHold1: waitUntil DEVE includere showNotification.
           Race 500ms su show → SW kill su PWA chiusa → APNs 201 senza banner/ack.
           Safety lunga solo se show hangua forever; afterShowJobs resta race 500ms.
           pushShowAckOnlyOk1: ack SOLO se show ha risolto — timeout/fail lascia
           hedge vivo (APNs 201 ≠ banner). */
        function afterShowNoAck() {
          return Promise.race([
            sameOriginClients()
              .then(function (list) {
                fanoutPushReceived(list, payload, { suppressOs: false });
              })
              .catch(function () {}),
            new Promise(function (resolve) {
              setTimeout(resolve, 500);
            }),
          ]);
        }
        if (isApplePushClient()) {
          return Promise.race([
            showP.then(function () {
              return "ok";
            }),
            new Promise(function (resolve) {
              setTimeout(function () {
                resolve("timeout");
              }, 8000);
            }),
          ]).then(function (status) {
            if (status !== "ok" || !showOk) {
              return afterShowNoAck();
            }
            return afterShowJobs();
          });
        }
        return showP.then(function () {
          if (!showOk) return afterShowNoAck();
          return afterShowJobs();
        });
      }
      /* Solo hedge mpr: se stesso tag già visibile, ack senza secondo banner.
         Timeout 80ms — se getNotifications non risponde, show comunque. */
      if (isApplePushClient() && tag && mprHit && self.registration.getNotifications) {
        return Promise.race([
          self.registration.getNotifications({ tag: tag }).then(function (existing) {
            return Boolean(existing && existing.length);
          }),
          new Promise(function (resolve) {
            setTimeout(function () {
              resolve(false);
            }, 80);
          }),
        ])
          .catch(function () {
            return false;
          })
          .then(function (alreadyVisible) {
            if (alreadyVisible) {
              return Promise.race([
                Promise.all([
                  postPushShownAck(payload),
                  sameOriginClients().then(function (list) {
                    fanoutPushReceived(list, payload, { suppressOs: true });
                  }),
                ]),
                new Promise(function (resolve) {
                  setTimeout(resolve, 500);
                }),
              ]);
            }
            return showNow();
          });
      }
      return showNow();
    }),
  );
});

self.addEventListener("notificationclick", function (event) {
  var nd = {};
  try {
    nd = (event.notification && event.notification.data) || {};
  } catch (e) {}
  try {
    event.notification.close();
  } catch (e2) {}
  var dest = resolveNotificationClickDest(nd);
  var notifId = String(nd.id || "").trim();
  var ticketId = String(nd.ticketId || "").trim();
  /* pushPwaBadgeStable1: un solo waitUntil (doppio waitUntil scarta il sync badge) */
  event.waitUntil(
    Promise.resolve()
      .then(function () {
        return syncAppBadgeFromOsNotifications();
      })
      .then(function () {
        return writePendingNav({
          url: dest,
          ticketId: ticketId,
          id: notifId,
          at: Date.now(),
        });
      })
      .then(function () {
        return self.clients.matchAll({ type: "window", includeUncontrolled: true });
      })
      .then(function (list) {
        /* pushWinReuseNav1 / pwaOpenPush1: PC riusa finestra; mobile → openWindow
           se nessun client focused/visible (evita tab browser invece della PWA). */
        var reuse = pickNotificationClickClient(list, dest);
        if (reuse) return openExistingClientDest(reuse, dest, notifId, ticketId);
        return openDestWindow(dest).then(function (opened) {
          if (opened) {
            try {
              opened.postMessage({
                type: "vc:open-dest",
                url: dest,
                ticketId: ticketId,
                id: notifId,
              });
            } catch (eOpenPm) {}
          }
          return opened;
        });
      }),
  );
});

self.addEventListener("notificationclose", function (event) {
  /* pushPwaBadgeStable1: swipe dismiss OS → ricalcola badge (0 se nessuno resta) */
  /* pushBadgeVisitFix1: avvisa client → mark-read così badge/unread non restano */
  /* 20261009voteRemKeep1: vote_reminder → skipMarkRead (close OS ≠ consumato) */
  var nd = {};
  try {
    nd = (event.notification && event.notification.data) || {};
  } catch (eNd) {}
  var closedId = String(nd.id || "").trim();
  var closedTid = String(nd.ticketId || "").trim();
  var closedKind = String(nd.kind || "").toLowerCase();
  var closedDk = String(nd.dedupeKey || "").toLowerCase();
  var skipMarkRead =
    closedKind === "vote_reminder" ||
    /vote_reminder_/.test(closedDk) ||
    /promemoria\s+voto/.test(String((event.notification && event.notification.title) || "").toLowerCase());
  /* pushAppleZombieHedge5: chiudi OS → block soft-retry show (stesso id), senza mark-read server */
  var closeRemember = [];
  if (closedId) closeRemember.push(closedId);
  if (closedDk) closeRemember.push(closedDk);
  try {
    event.waitUntil(
      Promise.all([
        closeRemember.length ? persistDismissedIds(closeRemember) : Promise.resolve(),
        syncAppBadgeFromOsNotifications(),
        sameOriginClients().then(function (list) {
          (list || []).forEach(function (c) {
            try {
              c.postMessage({
                type: "vc:notif-os-closed",
                id: closedId,
                ticketId: closedTid,
                kind: closedKind,
                dedupeKey: closedDk,
                skipMarkRead: skipMarkRead,
              });
            } catch (eMsg) {}
          });
        }),
      ]),
    );
  } catch (eCloseBadge) {}
});

self.addEventListener("message", function (event) {
  var data = event && event.data ? event.data : null;
  if (!data || !data.type) return;
  if (data.type === "vc:skip-waiting") {
    try {
      self.skipWaiting();
    } catch (e) {}
    return;
  }
  /* pushDismissDedup1: chiudi banner OS anche da postMessage pagina (stesso device) */
  if (data.type === "vc:dismiss-notifs") {
    var spec = dismissSpecFromMessage(data);
    var unreadMsg = Number(data.unreadCount);
    var rememberIds = asIdList(spec.ids, 80);
    if (spec.id) rememberIds.unshift(spec.id);
    event.waitUntil(
      Promise.resolve(persistDismissedIds(rememberIds))
        .then(function () {
          return closeMatchingNotifications(spec);
        })
        .then(function () {
          if (Number.isFinite(unreadMsg) && unreadMsg >= 0) {
            return setAppBadgeCount(unreadMsg);
          }
          if (data.forceClear === true || spec.all === true) {
            return setAppBadgeCount(0);
          }
          return syncAppBadgeFromOsNotifications({ retry: false });
        }),
    );
    return;
  }
  /* pushSkipRead1: sync set dismissed da pagina (localStorage → SW cache) */
  if (data.type === "vc:sync-dismissed-ids") {
    var syncIds = asIdList(data.ids, 500);
    if (syncIds.length) {
      event.waitUntil(persistDismissedIds(syncIds));
    }
    return;
  }
  if (data.type === "vc:set-app-badge") {
    event.waitUntil(setAppBadgeCount(data.count));
    return;
  }
  if (data.type === "vc:sync-app-badge") {
    var syncUnread = Number(data.unreadCount);
    if (Number.isFinite(syncUnread) && syncUnread >= 0) {
      event.waitUntil(setAppBadgeCount(syncUnread));
      return;
    }
    event.waitUntil(syncAppBadgeFromOsNotifications());
    return;
  }
  if (data.type === "vc-clear-app-badge" || data.type === "vc:clear-app-badge") {
    /* pushReadDismissBadge1: forceClear → solo clear, NON ri-sync da banner OS */
    if (data.forceClear === true) {
      event.waitUntil(setAppBadgeCount(0));
      return;
    }
    var clearUnread = Number(data.unreadCount);
    if (Number.isFinite(clearUnread) && clearUnread >= 0) {
      event.waitUntil(setAppBadgeCount(clearUnread));
      return;
    }
    event.waitUntil(
      setAppBadgeCount(0).then(function () {
        return syncAppBadgeFromOsNotifications({ retry: false });
      }),
    );
  }
});

self.addEventListener("pushsubscriptionchange", function (event) {
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      (list || []).forEach(function (c) {
        try {
          c.postMessage({ type: "vc:push-resubscribe" });
        } catch (e) {}
      });
    }),
  );
});

/* 20261006pwaOpenPush1 — www association JSON CT (nginx) + click telefono:
   non riusare tab browser sepolta; openWindow → PWA. */
/* pushRestoreVisible1 */

