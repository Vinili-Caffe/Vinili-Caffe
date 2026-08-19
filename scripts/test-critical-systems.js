const fs = require("fs");
const path = require("path");

function getBotRoot() {
  const workspaceRoot = path.resolve(__dirname, "..");
  const botFolder = process.argv[2] || process.env.BOT_FOLDER || "Vinyls";
  return path.join(workspaceRoot, botFolder);
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function walkJsFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsFiles(full, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

async function run(root) {
  const cwdOrig = process.cwd();
  try {
    process.chdir(root);
  } catch {
    // ignore
  }

  const permissionsPath = path.join(root, "permissions.json");
  const prefixRoot = path.join(root, "Prefix");

  assert(fs.existsSync(permissionsPath), "permissions.json mancante");
  let permissions;
  try {
    permissions = JSON.parse(fs.readFileSync(permissionsPath, "utf8"));
  } catch (err) {
    throw new Error(`permissions.json non valido o illeggibile: ${err?.message || err}`);
  }
  const prefix = permissions?.prefix || {};
  const prefixPerms = prefix;

  const prefixFiles = walkJsFiles(prefixRoot);
  const missingAliasPermissions = [];
  for (const file of prefixFiles) {
    let mod = null;
    try {
      mod = require(file);
    } catch {
      continue;
    }
    if (!mod || typeof mod !== "object") continue;
    const commandName = String(mod.name || "").toLowerCase();
    if (!commandName) continue;
    const aliasMap = mod.subcommandAliases && typeof mod.subcommandAliases === "object" ? mod.subcommandAliases : null;
    if (!aliasMap) continue;
    const commandPerm = prefixPerms?.[commandName];
    const subcommands = commandPerm?.subcommands;
    if (!subcommands || typeof subcommands !== "object") continue;
    for (const [alias, target] of Object.entries(aliasMap)) {
      const aliasKey = String(alias || "").trim();
      const targetKey = String(target || "").trim();
      if (!aliasKey || !targetKey) continue;
      if (Object.prototype.hasOwnProperty.call(subcommands, aliasKey)) continue;
      if (!Object.prototype.hasOwnProperty.call(subcommands, targetKey)) continue;
      missingAliasPermissions.push(`${commandName}.${aliasKey}->${targetKey}`);
    }
  }
  assert(
    missingAliasPermissions.length === 0,
    `alias permissions mancanti: ${missingAliasPermissions.join(", ")}`,
  );

  const hasJoinRaid = fs.existsSync(path.join(root, "Services", "Moderation", "joinRaidService.js"));
  if (hasJoinRaid) {
    const securityPerms = prefix.security?.subcommands || {};
    let securityCmd = null;
    let securityRequireError = null;
    try {
      securityCmd = require(path.join(root, "Prefix", "Admin", "security.js"));
    } catch (err) {
      securityRequireError = err;
      try {
        securityCmd = require(path.join(root, "Prefix", "Staff", "security.js"));
        securityRequireError = null;
      } catch (err2) {
        securityRequireError = err2;
        securityCmd = null;
      }
    }
    assert(
      securityCmd,
      `security.js (Admin o Staff) non caricabile: ${securityRequireError?.message || securityRequireError || "mancante"}`,
    );
    const requiredSecuritySubs = Array.isArray(securityCmd?.subcommands)
      ? [...new Set(securityCmd.subcommands.map((sub) => String(sub || "").trim().split(/\s+/)[0]).filter(Boolean))]
      : [];
    for (const sub of requiredSecuritySubs) {
      assert(Array.isArray(securityPerms[sub]), `permissions.security.${sub} mancante`);
    }
    assert(prefix.security && Array.isArray(prefix.security.roles), "permissions.security mancante");
    assert(Array.isArray(securityCmd.subcommands), "security.subcommands mancante");

    const birthdayService = require(path.join(root, "Services", "Community", "birthdayService.js"));
    const birthdayStatus = birthdayService.getBirthdayLoopStatus?.();
    assert(birthdayStatus && typeof birthdayStatus.active === "boolean", "birthday loop status non disponibile");

    const joinRaidService = require(path.join(root, "Services", "Moderation", "joinRaidService.js"));
    const joinRaidCfg = joinRaidService.getJoinRaidConfigSnapshot?.();
    assert(joinRaidCfg && typeof joinRaidCfg.lockCommands === "boolean", "joinRaid.lockCommands mancante");

    const orchestrator = require(path.join(root, "Services", "Moderation", "securityOrchestratorService.js"));
    const lockDecisionA = orchestrator.buildSecurityLockDecision?.({
      antiNukePanic: false,
      autoModPanic: false,
      joinRaid: true,
      lockAllCommands: true,
      joinRaidLockCommands: false,
    });
    assert(lockDecisionA && lockDecisionA.joinLockActive === true, "security decision A join lock errato");
    assert(lockDecisionA.commandLockActive === false, "security decision A command lock errato");
    const lockDecisionB = orchestrator.buildSecurityLockDecision?.({
      antiNukePanic: false,
      autoModPanic: false,
      joinRaid: true,
      lockAllCommands: true,
      joinRaidLockCommands: true,
    });
    assert(lockDecisionB && lockDecisionB.commandLockActive === true, "security decision B command lock errato");

    const automodService = require(path.join(root, "Services", "Moderation", "automodService.js"));
    const detectCmd = automodService?.__test?.isLikelyCommandMessage;
    assert(typeof detectCmd === "function", "automod __test isLikelyCommandMessage mancante");
    assert(detectCmd({ content: "+help", client: { config: { prefix: "+" } } }) === true, "automod command detection '+' errata");
    assert(detectCmd({ content: "!raid", client: { config: { prefix: "+" } } }) === false, "automod command detection '!' non deve bypassare");
    const explainDecision = automodService?.__test?.buildAutoModDecisionExplain;
    assert(typeof explainDecision === "function", "automod __test buildAutoModDecisionExplain mancante");
    const explainText = explainDecision("timeout", 120, [{ key: "link_blacklist", heat: 100 }, { key: "attachment_image", heat: 20 }]);
    assert(
      typeof explainText === "string" &&
        explainText.includes("timeout") &&
        (explainText.includes("pesi violazioni:") || explainText.includes("top_rules=")),
      "automod decision explain non valido",
    );
    const isMediaEmbed = automodService?.__test?.isAutomodMediaEmbedUrl;
    assert(typeof isMediaEmbed === "function", "automod __test isAutomodMediaEmbedUrl mancante");
    assert(isMediaEmbed(new URL("https://media.tenor.com/abc/tenor.gif")) === true, "URL Tenor deve contare come media embed");
    assert(isMediaEmbed(new URL("https://cdn.discordapp.com/attachments/1/2/x.webp")) === true, "CDN Discord deve contare come media embed");
    assert(isMediaEmbed(new URL("https://example.com/scam")) === false, "host generico non è media embed");
    const isStaffZoneExempt = automodService?.__test?.isStaffZoneExemptChannel;
    assert(typeof isStaffZoneExempt === "function", "automod __test isStaffZoneExemptChannel mancante");
    const staffChatId = String(require("../Vinyls/Utils/Config/ids").channels?.staffChat || "");
    const staffCmdsId = String(require("../Vinyls/Utils/Config/ids").channels?.staffCmds || "");
    assert(staffChatId && staffCmdsId, "staffChat/staffCmds ids mancanti");
    assert(
      isStaffZoneExempt({ id: "thread-pm", isThread: () => true, parentId: staffChatId }) === true,
      "thread staff chat deve essere exempt automod",
    );
    assert(
      isStaffZoneExempt({ id: "thread-high", isThread: () => true, parentId: staffCmdsId }) === true,
      "thread staff cmds deve essere exempt automod",
    );
    const detectScam = automodService?.__test?.detectScam;
    assert(typeof detectScam === "function", "automod __test detectScam mancante");
    assert(detectScam("visit depxbit.com for bonus") === true, "detectScam crypto domain");
    assert(detectScam("I'm excited to announce my crypto casino launch") === true, "detectScam crypto casino phrase");
    assert(detectScam("visit betchoco.com BONUS") === true, "detectScam betchoco domain");
    assert(detectScam("register at serowin.com promo BET") === true, "detectScam serowin domain");
    assert(
      detectScam(
        "LOST YOUR CRYPTO TO A SCAM? Reach out to Kate Expert Services for crypto asset tracing. NO UPFRONT PAYMENT Kateexpertsservices@gmail.com +44 7884 893099",
      ) === true,
      "detectScam crypto recovery kate expert",
    );
    assert(detectScam("ciao come stai oggi") === false, "detectScam conversazione normale");
    const detectScamImageBait = automodService?.__test?.detectScamImageBait;
    assert(typeof detectScamImageBait === "function", "automod __test detectScamImageBait mancante");
    assert(
      detectScamImageBait(
        {
          attachments: new Map([
            ["1", { contentType: "image/png", name: "scam.png" }],
          ]),
        },
        "Omg 😳💰",
        { accountAgeMs: 2 * 24 * 60 * 60_000 },
      ) === true,
      "detectScamImageBait omg + money emoji + young",
    );
    assert(
      detectScamImageBait(
        {
          attachments: new Map([
            ["1", { contentType: "image/png", name: "selfie.png" }],
          ]),
        },
        "omg 😳",
        { accountAgeMs: 400 * 24 * 60 * 60_000 },
      ) === false,
      "detectScamImageBait selfie omg non banna account maturo",
    );
    assert(
      detectScamImageBait(
        {
          attachments: new Map([
            ["1", { contentType: "image/png", name: "selfie.png" }],
          ]),
        },
        "wow",
        { accountAgeMs: 2 * 24 * 60 * 60_000 },
      ) === false,
      "detectScamImageBait solo wow non banna",
    );
    assert(
      detectScamImageBait(
        {
          attachments: new Map([
            ["1", { contentType: "image/png", name: "mrbeast.png" }],
          ]),
        },
        "bro mrbeast casino",
        { accountAgeMs: 2 * 24 * 60 * 60_000 },
      ) === true,
      "detectScamImageBait mrbeast + image",
    );
    assert(
      detectScamImageBait(
        {
          attachments: new Map([
            ["1", { contentType: "image/png", name: "withdraw.png" }],
          ]),
        },
        "betchoco.com",
        { accountAgeMs: 2 * 24 * 60 * 60_000 },
      ) === true,
      "detectScamImageBait scam domain + image",
    );
    assert(
      detectScamImageBait(
        {
          attachments: new Map([
            ["1", { contentType: "image/png", name: "cat.png" }],
          ]),
        },
        "my cat",
        { accountAgeMs: 2 * 24 * 60 * 60_000 },
      ) === false,
      "detectScamImageBait immagine innocua",
    );
    assert(
      detectScamImageBait(
        {
          attachments: new Map([
            ["1", { contentType: "image/png", name: "scam.png" }],
          ]),
        },
        "",
        { accountAgeMs: 2 * 24 * 60 * 60_000 },
      ) === false,
      "detectScamImageBait solo immagine senza testo non banna",
    );
    assert(
      detectScamImageBait(
        {
          attachments: new Map([
            ["1", { contentType: "image/png", name: "scam.png" }],
          ]),
        },
        "",
        { accountAgeMs: 60 * 24 * 60 * 60_000, suspicious: true },
      ) === false,
      "detectScamImageBait solo immagine profilo sospetto senza testo",
    );
    const guildMemberUpdate = require("../Vinyls/Events/guildMemberUpdate");
    const resolveBoostSlotTarget = guildMemberUpdate?.__test?.resolveBoostSlotTarget;
    const noteNativeBoostSeen = guildMemberUpdate?.__test?.noteNativeBoostSeen;
    const nativeBoostSeenSince = guildMemberUpdate?.__test?.nativeBoostSeenSince;
    assert(typeof resolveBoostSlotTarget === "function", "resolveBoostSlotTarget export");
    assert(
      resolveBoostSlotTarget({ premiumSinceTimestamp: Date.now() }, 1, 2, 1, { nativeSeenSlots: 2 }) === 2,
      "resolveBoostSlotTarget secondo boost",
    );
    assert(
      resolveBoostSlotTarget({ premiumSinceTimestamp: Date.now() }, 0, 1, 0, {}) === 1,
      "resolveBoostSlotTarget primo boost",
    );
    assert(typeof noteNativeBoostSeen === "function", "noteNativeBoostSeen export");
    noteNativeBoostSeen("g1", "u1", 1);
    noteNativeBoostSeen("g1", "u1", 1);
    assert(
      nativeBoostSeenSince("g1", "u1", Date.now() - 60_000) === 2,
      "noteNativeBoostSeen accumula doppio boost",
    );
    const parseNativeBoostSlotCount = guildMemberUpdate?.__test?.parseNativeBoostSlotCount;
    assert(typeof parseNativeBoostSlotCount === "function", "parseNativeBoostSlotCount export");
    assert(
      parseNativeBoostSlotCount({ type: 8, content: "Diuk ha appena potenziato il server **2** volte!" }) === 2,
      "parseNativeBoostSlotCount markdown 2 volte",
    );
    assert(
      parseNativeBoostSlotCount({ type: 8, content: "2" }) === 2,
      "parseNativeBoostSlotCount content numerico 2",
    );
    assert(
      parseNativeBoostSlotCount({ type: 8, content: "Diuk ha appena potenziato il server 1 volta!" }) === 1,
      "parseNativeBoostSlotCount 1 volta",
    );
    const pokeNameBlock = require("../Vinyls/Services/Moderation/pokeNameChannelBlockService");
    assert(pokeNameBlock.isPokeNameBotMessage({ author: { id: pokeNameBlock.POKE_NAME_BOT_ID } }) === true, "Poke-Name author id");
    assert(pokeNameBlock.isPokeNameBotMessage({ applicationId: pokeNameBlock.POKE_NAME_BOT_ID }) === true, "Poke-Name application id");
    assert(pokeNameBlock.isPokeNameAllowedChannel({ channelId: pokeNameBlock.POKE_NAME_ALLOWED_CHANNEL_ID }) === true, "Poke-Name canale pokétwo");
    assert(
      pokeNameBlock.isPokeNameAllowedChannel({ channelId: "999", channel: { parentId: pokeNameBlock.POKE_NAME_ALLOWED_CHANNEL_ID } }) === true,
      "Poke-Name thread sotto pokétwo",
    );
    assert(pokeNameBlock.isPokeNameAllowedChannel({ channelId: "999", channel: { parentId: "888" } }) === false, "Poke-Name canale generico");
    const cmdPerms = require("../Vinyls/Utils/Moderation/commandPermissions");
    const matchChannel = cmdPerms?.__test?.channelMatchesPolicyChannelList;
    const normalizeChannels = cmdPerms?.__test?.normalizeChannelList;
    const highZone = cmdPerms?.__test?.HIGH_STAFF_COMMANDS_ZONE_TOKEN;
    assert(typeof matchChannel === "function", "commandPermissions __test channelMatchesPolicyChannelList mancante");
    assert(
      normalizeChannels(["channels.highCmds"]).includes(highZone),
      "highCmds espande zona thread High Staff",
    );
    const staffCmds = String(require("../Vinyls/Utils/Config/ids").channels?.staffCmds || "");
    const commands = String(require("../Vinyls/Utils/Config/ids").channels?.commands || "");
    assert(
      matchChannel({ id: "thread1", isThread: () => true, parentId: staffCmds }, [staffCmds]) === true,
      "thread staff-cmds match parent policy",
    );
    assert(
      matchChannel({ id: "thread2", isThread: () => true, parentId: commands }, [commands]) === true,
      "thread comandi match parent policy",
    );
    assert(
      matchChannel(
        { id: "high-thread", isThread: () => true, parentId: staffCmds, name: "Comandi High Staff" },
        [highZone],
      ) === true,
      "thread high staff match highCmds zone",
    );
    const isCrossForward = automodService?.__test?.isCrossServerForwardedMessage;
    const { MessageReferenceType } = require("discord.js");
    assert(typeof isCrossForward === "function", "automod __test isCrossServerForwardedMessage mancante");
    assert(
      isCrossForward({
        guildId: "111",
        guild: { id: "111" },
        reference: { type: MessageReferenceType.Default, guildId: "111", messageId: "1" },
        messageSnapshots: { size: 0 },
      }) === false,
      "reply stesso server non è cross-forward",
    );
    assert(
      isCrossForward({
        guildId: "111",
        guild: { id: "111" },
        reference: { type: MessageReferenceType.Forward, guildId: "222" },
        messageSnapshots: { size: 0 },
      }) === true,
      "forward da altro server deve essere cross-forward",
    );
    assert(
      isCrossForward({
        guildId: "111",
        guild: { id: "111" },
        reference: { type: MessageReferenceType.Forward },
        messageSnapshots: { size: 0 },
      }) === false,
      "forward senza guildId sorgente non deve dare falso positivo",
    );
  }

  const setJsPath = path.join(root, "Prefix", "TTS", "set.js");
  const ttsServicePath = path.join(root, "Services", "TTS", "ttsService.js");
  if (fs.existsSync(setJsPath) && prefixPerms?.set) {
    const setPerms = prefixPerms.set?.subcommands || {};
    assert(Array.isArray(setPerms.voice), "permissions.prefix.set.subcommands.voice mancante");
    assert(Array.isArray(setPerms.autojoin), "permissions.prefix.set.subcommands.autojoin mancante");

    const setCmd = require(setJsPath);
    assert(Array.isArray(setCmd.subcommands), "set.subcommands mancante");
    assert(setCmd.subcommands.includes("voice"), "set subcommand voice mancante");
    assert(setCmd.subcommands.includes("autojoin"), "set subcommand autojoin mancante");

    if (fs.existsSync(ttsServicePath)) {
      const requiredPrefixCommands = ["help", "join", "leave", "set", "voices"];
      for (const cmd of requiredPrefixCommands) {
        assert(prefixPerms[cmd], `permissions.prefix.${cmd} mancante`);
      }
      const ttsService = require(ttsServicePath);
      assert(typeof ttsService.handleTtsMessage === "function", "ttsService.handleTtsMessage mancante");
      assert(typeof ttsService.joinTtsChannel === "function", "ttsService.joinTtsChannel mancante");
      assert(typeof ttsService.leaveTtsGuild === "function", "ttsService.leaveTtsGuild mancante");
    }
  }

  const pronounGenderPath = path.join(root, "Utils", "Community", "pronounGenderUtils.js");
  if (fs.existsSync(pronounGenderPath)) {
    const {
      applyPronounGenderToText,
      resolveMemberPronounGender,
    } = require(pronounGenderPath);
    assert(applyPronounGenderToText("sei salito/a di livello!", "m") === "sei salito di livello!", "pronoun o/a maschile");
    assert(applyPronounGenderToText("sei salito/a di livello!", "f") === "sei salita di livello!", "pronoun o/a femminile");
    assert(applyPronounGenderToText("sei salito/a di livello!", "x") === "sei salitə di livello!", "pronoun o/a neutro");
    assert(applyPronounGenderToText("bloccato/a", "m") === "bloccato", "pronoun bloccato/a maschile");
    assert(applyPronounGenderToText("benvenutx", "f") === "benvenuta", "pronoun x femminile");
    assert(applyPronounGenderToText("Nuovx Guilded", "f") === "Nuova Guilded", "Nuovx she/her");
    assert(applyPronounGenderToText("Nuovx Guilded", "u") === "Nuovx Guilded", "Nuovx senza pronome");
    assert(applyPronounGenderToText("Benvenuto/a", "m") === "Benvenuto", "pronoun maiuscolo maschile");
    const sheMember = {
      roles: {
        cache: {
          has: (id) => String(id) === "1442568999043989565",
        },
      },
    };
    assert(resolveMemberPronounGender(sheMember) === "f", "resolveMemberPronounGender she/her");
  }

  const repostAckPhrasesPath = path.join(root, "Data", "Community", "repostAckPhrases.js");
  if (fs.existsSync(repostAckPhrasesPath)) {
    const {
      REPOST_ACK_PHRASES,
      pickRepostAckPhrase,
      resetRepostAckPhraseBag,
    } = require(repostAckPhrasesPath);
    assert(Array.isArray(REPOST_ACK_PHRASES) && REPOST_ACK_PHRASES.length >= 100, "repost ack phrases");
    resetRepostAckPhraseBag();
    const picked = pickRepostAckPhrase();
    assert(REPOST_ACK_PHRASES.includes(picked), "pickRepostAckPhrase");
    if (REPOST_ACK_PHRASES.length > 1) {
      const pickedAgain = pickRepostAckPhrase();
      assert(pickedAgain !== picked, "pickRepostAckPhrase no repeat consecutivo");
    }
  }

  const repostServicePath = path.join(root, "Services", "Community", "repostService.js");
  if (fs.existsSync(repostServicePath)) {
    const { extractRepostPayload } = require(repostServicePath);
    const audioMsg = {
      content: "",
      attachments: new Map([
        ["1", { url: "https://cdn.discordapp.com/attachments/a/b/voice.ogg", name: "voice-message.ogg", contentType: "audio/ogg" }],
      ]),
      stickers: { values: () => [] },
      embeds: [],
      mentions: {},
    };
    const audioPayload = extractRepostPayload(audioMsg);
    assert(audioPayload.hasContent, "repost audio/vocale");
    assert(audioPayload.files.length === 1, "repost file audio");
    const imageMsg = {
      content: "ciao",
      attachments: new Map([
        ["1", { url: "https://cdn.discordapp.com/attachments/a/b/pic.png", name: "pic.png", contentType: "image/png" }],
        ["2", { url: "https://cdn.discordapp.com/attachments/a/b/song.mp3", name: "song.mp3", contentType: "audio/mpeg" }],
      ]),
      stickers: { values: () => [] },
      embeds: [],
      mentions: {},
    };
    const mixedPayload = extractRepostPayload(imageMsg);
    assert(mixedPayload.imageUrl.includes("pic.png"), "repost immagine embed");
    assert(mixedPayload.files.length === 1 && mixedPayload.files[0].name === "song.mp3", "repost allegato non-immagine");
    const { MIN_AUDIO_ATTACHMENT_BYTES, prepareRepostSendMedia } = require(repostServicePath);
    assert(MIN_AUDIO_ATTACHMENT_BYTES >= 1024, "repost min audio bytes");
    const { AttachmentBuilder } = require("discord.js");
    const imageFile = new AttachmentBuilder(Buffer.from("img"), { name: "pic.png" });
    const audioFile = new AttachmentBuilder(Buffer.from("audio"), { name: "clip.mp3" });
    const imageOnlySend = prepareRepostSendMedia({
      imageUrl: "https://cdn.discordapp.com/attachments/a/b/pic.png",
      files: [imageFile],
    });
    assert(imageOnlySend.embedImageUrl === "attachment://pic.png", "repost immagine solo embed");
    assert(imageOnlySend.files.length === 1 && imageOnlySend.files[0].name === "pic.png", "repost immagine file unico");
    const mixedSend = prepareRepostSendMedia({
      imageUrl: "https://cdn.discordapp.com/attachments/a/b/pic.png",
      files: [imageFile, audioFile],
    });
    assert(mixedSend.embedImageUrl === "attachment://pic.png", "repost mixed embed image");
    assert(mixedSend.files.length === 2, "repost mixed allegati");
    assert(mixedSend.files.some((file) => file.name === "clip.mp3"), "repost mixed audio fuori");
  }

  const voiceCapturePath = path.join(root, "Services", "Voice", "voiceContinuousCaptureService.js");
  if (fs.existsSync(voiceCapturePath)) {
    const { mixPcmBuffers } = require(voiceCapturePath);
    const loud = Buffer.alloc(4);
    loud.writeInt16LE(8000, 0);
    loud.writeInt16LE(8000, 2);
    const silent = Buffer.alloc(4);
    const mixed = mixPcmBuffers([loud, silent]);
    assert(mixed.readInt16LE(0) === 4000, "clip mix keeps stable level with silent track");
    assert(mixed.readInt16LE(2) === 4000, "clip mix stereo channel");
  }

  const mongoConnectPath = path.join(root, "Utils", "Database", "mongoConnect.js");
  if (fs.existsSync(mongoConnectPath)) {
    const { waitForMongoReachable } = require(mongoConnectPath);
    assert(typeof waitForMongoReachable === "function", "waitForMongoReachable mancante");
  }

  const forbiddenRoundsTestPath = path.join(path.resolve(__dirname, ".."), "scripts", "test-forbidden-section-rounds.js");
  if (fs.existsSync(forbiddenRoundsTestPath)) {
    require(forbiddenRoundsTestPath)();
  }

  const observationTowerRaceTestPath = path.join(path.resolve(__dirname, ".."), "scripts", "test-observation-tower-race.js");
  if (fs.existsSync(observationTowerRaceTestPath)) {
    require(observationTowerRaceTestPath);
  }

  const markovTestPath = path.join(path.resolve(__dirname, ".."), "scripts", "test-markov-channel-access.js");
  if (fs.existsSync(markovTestPath)) {
    require(markovTestPath);
  }

  const voiceCommandAccessTestPath = path.join(path.resolve(__dirname, ".."), "scripts", "test-voice-command-channel-access.js");
  if (fs.existsSync(voiceCommandAccessTestPath)) {
    require(voiceCommandAccessTestPath);
  }

  const markovAutoSendTestPath = path.join(path.resolve(__dirname, ".."), "scripts", "test-markov-auto-send-trigger.js");
  if (fs.existsSync(markovAutoSendTestPath)) {
    require(markovAutoSendTestPath)();
  }

  const markovCommandStyleTestPath = path.join(path.resolve(__dirname, ".."), "scripts", "test-markov-command-style.js");
  if (fs.existsSync(markovCommandStyleTestPath)) {
    require(markovCommandStyleTestPath)();
  }

  const shopBoostRolloverTestPath = path.join(path.resolve(__dirname, ".."), "scripts", "test-shop-boost-period-rollover.js");
  if (fs.existsSync(shopBoostRolloverTestPath)) {
    require(shopBoostRolloverTestPath);
  }

  const basiliskGuildTestPath = path.join(path.resolve(__dirname, ".."), "scripts", "test-basilisk-guild-members.js");
  if (fs.existsSync(basiliskGuildTestPath)) {
    await require(basiliskGuildTestPath)();
  }

  const serverWalletTestPath = path.join(path.resolve(__dirname, ".."), "scripts", "test-server-wallet.js");
  if (fs.existsSync(serverWalletTestPath)) {
    require(serverWalletTestPath)();
  }

  const serverEconomyPhase3TestPath = path.join(path.resolve(__dirname, ".."), "scripts", "test-server-economy-phase3.js");
  if (fs.existsSync(serverEconomyPhase3TestPath)) {
    require(serverEconomyPhase3TestPath)();
  }

  const serverShopTestPath = path.join(path.resolve(__dirname, ".."), "scripts", "test-server-shop.js");
  if (fs.existsSync(serverShopTestPath)) {
    require(serverShopTestPath)();
  }

  const serverBridgeTestPath = path.join(path.resolve(__dirname, ".."), "scripts", "test-server-economy-bridge.js");
  if (fs.existsSync(serverBridgeTestPath)) {
    require(serverBridgeTestPath)();
  }

  const publicVoiceHubTestPath = path.join(path.resolve(__dirname, ".."), "scripts", "test-public-voice-hub.js");
  if (fs.existsSync(publicVoiceHubTestPath)) {
    require(publicVoiceHubTestPath)();
  }

  const serataFilmAttendanceTestPath = path.join(path.resolve(__dirname, ".."), "scripts", "test-serata-film-attendance.js");
  if (fs.existsSync(serataFilmAttendanceTestPath)) {
    require(serataFilmAttendanceTestPath)();
  }

  const staffWarnMigrationTestPath = path.join(path.resolve(__dirname, ".."), "scripts", "test-staff-warn-channel-migration.js");
  if (fs.existsSync(staffWarnMigrationTestPath)) {
    require(staffWarnMigrationTestPath)();
  }

  const staffDepexCleanupTestPath = path.join(path.resolve(__dirname, ".."), "scripts", "test-staff-depex-channel-cleanup.js");
  if (fs.existsSync(staffDepexCleanupTestPath)) {
    require(staffDepexCleanupTestPath)();
  }

  const voiceExpChannelTestPath = path.join(path.resolve(__dirname, ".."), "scripts", "test-voice-exp-channel-utils.js");
  if (fs.existsSync(voiceExpChannelTestPath)) {
    require(voiceExpChannelTestPath)();
  }

  const mentionResponseAccess = require(path.join(root, "Utils", "Community", "mentionResponseAccessUtils"));
  const staffRegolamento = require(path.join(root, "Utils", "Moderation", "staffRegolamentoSteps"));
  assert(staffRegolamento.normalizeRuleDot("1,2") === "1.2", "sanziona normalize rule 1,2");
  assert(staffRegolamento.normalizeRuleDot("2_3") === "2.3", "sanziona normalize rule 2_3");
  assert(staffRegolamento.normalizeRuleDot("foo") === null, "sanziona reject invalid rule");
  const r13 = staffRegolamento.resolveStaffRegolaSanction("1.3", 0);
  assert(r13?.step?.type === "mute" && r13.step.duration === "4h", "sanziona 1.3 first step mute 4h");
  const r13b = staffRegolamento.resolveStaffRegolaSanction("1.3", 1);
  assert(r13b?.step?.type === "mute" && r13b.step.duration === "8h", "sanziona 1.3 second step mute 8h");
  const r13max = staffRegolamento.resolveStaffRegolaSanction("1.3", 99);
  assert(r13max?.step?.duration === "18h", "sanziona 1.3 caps at last step");
  const r23 = staffRegolamento.resolveStaffRegolaSanction("2.3", 0);
  assert(r23?.step?.type === "mute" && r23.step.duration === "3h", "sanziona 2.3 first step mute 3h (no staff warn)");
  const r23b = staffRegolamento.resolveStaffRegolaSanction("2.3", 1);
  assert(r23b?.step?.type === "mute" && r23b.step.duration === "6h", "sanziona 2.3 second step mute 6h");
  assert(
    !Array.isArray(staffRegolamento.STAFF_REGOLA_STEPS["2.3"]) ||
      !staffRegolamento.STAFF_REGOLA_STEPS["2.3"].some((s) => String(s?.type || "").toLowerCase() === "warn"),
    "sanziona 2.3 ladder has no warn (automod keeps warn)",
  );
  assert(
    staffRegolamento.isMatchingRuleCase({ reason: "Violazione della regola 1.2 (2°)" }, "1.2"),
    "sanziona modlog match violazione regola",
  );
  const dynoMute = staffRegolamento.buildDynoArgs("123", r13, "Violazione della regola 1.3 (1°)", "");
  assert(dynoMute?.cmd === "mute" && dynoMute.args[0] === "123" && dynoMute.args[1] === "4h", "sanziona dyno mute args");
  const { MENTION_RESPONSE_ROLE_IDS } = mentionResponseAccess;
  assert(Array.isArray(MENTION_RESPONSE_ROLE_IDS) && MENTION_RESPONSE_ROLE_IDS.length >= 5, "mentionResponse role ids");
  const fakeMember = (roleIds) => ({
    roles: { cache: { has: (id) => roleIds.includes(id) } },
  });
  assert(!mentionResponseAccess.memberHasMentionResponseAccess(fakeMember([])), "mentionResponse deny senza ruoli");
  assert(mentionResponseAccess.memberHasMentionResponseAccess(fakeMember([MENTION_RESPONSE_ROLE_IDS[0]])), "mentionResponse allow VIP");
  assert(mentionResponseAccess.memberHasMentionResponseAccess(fakeMember([MENTION_RESPONSE_ROLE_IDS.at(-1)])), "mentionResponse allow Level100");

  const mentionInteractionChannels = require(path.join(root, "Utils", "Community", "mentionInteractionChannelUtils"));
  const IDs = require(path.join(root, "Utils", "Config", "ids"));
  const { ChannelType } = require("discord.js");
  const fakeChannel = (id, type = ChannelType.GuildText, parentId = null) => ({
    id: String(id),
    type,
    parentId,
    isThread: () => false,
    isTextBased: () => type === ChannelType.GuildVoice || type === ChannelType.GuildText,
  });
  const fakeThread = (parent) => ({
    isThread: () => true,
    parent,
    parentId: parent?.id,
  });
  assert(
    mentionInteractionChannels.channelAllowsMentionInteraction(fakeChannel(IDs.channels.chat)),
    "mentionInteraction allow chat",
  );
  assert(
    !mentionInteractionChannels.channelAllowsMentionInteraction(fakeChannel(IDs.channels.partnerships)),
    "mentionInteraction deny partnerships",
  );
  assert(
    mentionInteractionChannels.channelAllowsMentionInteraction(
      fakeChannel("voice-text", ChannelType.GuildVoice, IDs.categories.categoryPublics),
    ),
    "mentionInteraction allow voice text chat",
  );
  assert(
    mentionInteractionChannels.channelAllowsMentionInteraction(
      fakeThread(fakeChannel(IDs.channels.media)),
    ),
    "mentionInteraction allow thread in media",
  );
  assert(
    !mentionInteractionChannels.channelAllowsMentionInteraction(
      fakeThread(fakeChannel(IDs.channels.partnerships)),
    ),
    "mentionInteraction deny thread in partnerships",
  );

  const staffChatUtils = require(path.join(root, "Utils", "Staff", "staffChatChannelUtils"));
  const pmThread = await staffChatUtils.resolveStaffChatPmThread(null);
  assert(pmThread === null, "resolveStaffChatPmThread senza client non lancia");

  console.log("CRITICAL_SYSTEMS_TEST_OK");
  try {
    process.chdir(cwdOrig);
  } catch {
    // ignore
  }
}

if (require.main === module) {
  run(getBotRoot()).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  module.exports = run;
}