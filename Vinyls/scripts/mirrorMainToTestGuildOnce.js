#!/usr/bin/env node
/**
 * mirrorMainToTestGuildOnce.js
 * Copia struttura main Ã¢â€ â€™ test SENZA cancellare canali/ruoli giÃƒÂ  presenti sul test.
 *
 * Match:
 *  - ruoli per nome esatto
 *  - canali per parentName/type/name
 * Membri: sync ruoli solo per user giÃƒÂ  presenti su entrambi i server
 *   (Discord non permette di invitare in massa).
 *
 * Usage:
 *   node mirrorMainToTestGuildOnce.js            # dry-run
 *   node mirrorMainToTestGuildOnce.js --apply
 *   node mirrorMainToTestGuildOnce.js --apply --skip-members
 *   node mirrorMainToTestGuildOnce.js --apply --roles-only
 *   node mirrorMainToTestGuildOnce.js --apply --channels-only
 */
const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  } catch (_) {}
}

function parseArgs(argv) {
  const out = {
    apply: false,
    skipMembers: false,
    rolesOnly: false,
    channelsOnly: false,
    membersOnly: false,
  };
  for (const a of argv) {
    if (a === "--apply") out.apply = true;
    if (a === "--skip-members") out.skipMembers = true;
    if (a === "--roles-only") out.rolesOnly = true;
    if (a === "--channels-only") out.channelsOnly = true;
    if (a === "--members-only") out.membersOnly = true;
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function channelKey(ch) {
  const parent = ch.parentId ? String(ch.parent?.name || ch.parentId) : "";
  return `${parent}::${Number(ch.type)}::${String(ch.name || "")}`;
}

function backupChannelKey(ch, idToName) {
  const parentName = ch.parentId ? String(idToName.get(String(ch.parentId)) || ch.parentId) : "";
  return `${parentName}::${Number(ch.type)}::${String(ch.name || "")}`;
}

async function main() {
  const ROOT = path.resolve(__dirname, "..");
  loadEnvFile(path.join(ROOT, "..", ".env"));
  loadEnvFile(path.join(ROOT, ".env"));
  const args = parseArgs(process.argv.slice(2));

  const { Client, GatewayIntentBits, Partials, ChannelType, PermissionsBitField } =
    require(path.join(ROOT, "..", "node_modules", "discord.js"));
  const IDs = require(path.join(ROOT, "Utils/Config/ids"));

  const MAIN_ID = String(IDs.guilds.main);
  const TEST_ID = String(IDs.guilds.test);
  if (!MAIN_ID || !TEST_ID) throw new Error("missing guild ids");

  const doRoles = args.membersOnly ? false : !args.channelsOnly;
  const doChannels = args.membersOnly ? false : !args.rolesOnly;
  const doMembers = args.membersOnly ? true : !args.skipMembers && !args.rolesOnly && !args.channelsOnly;

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.GuildMember],
  });
  await client.login(process.env.DISCORD_TOKEN_OFFICIAL);

  const main = await client.guilds.fetch(MAIN_ID);
  const test = await client.guilds.fetch(TEST_ID);
  await Promise.all([
    main.roles.fetch(),
    test.roles.fetch(),
    main.channels.fetch(),
    test.channels.fetch(),
  ]);
  await main.members.fetch().catch(() => null);
  await test.members.fetch().catch(() => null);
  const me = await test.members.fetchMe();

  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    throw new Error("bot missing ManageRoles on test");
  }
  if (!me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    throw new Error("bot missing ManageChannels on test");
  }

  const stats = {
    mode: args.apply ? "APPLY" : "DRY_RUN",
    rolesMatched: 0,
    rolesCreated: 0,
    rolesUpdated: 0,
    rolesSkippedManaged: 0,
    channelsMatched: 0,
    channelsCreated: 0,
    channelsUpdated: 0,
    channelsKeptExisting: test.channels.cache.size,
    membersSynced: 0,
    membersSkippedMissing: 0,
    errors: [],
  };

  const roleMap = new Map(); // mainRoleId -> testRoleId
  roleMap.set(MAIN_ID, TEST_ID); // @everyone

  // --- ROLES ---
  if (doRoles) {
    const testByName = new Map();
    for (const r of test.roles.cache.values()) {
      if (r.id === TEST_ID) continue;
      if (!testByName.has(r.name)) testByName.set(r.name, r);
    }

    const mainRoles = [...main.roles.cache.values()]
      .filter((r) => r.id !== MAIN_ID)
      .sort((a, b) => a.position - b.position);

    for (const src of mainRoles) {
      if (src.managed) {
        stats.rolesSkippedManaged += 1;
        const hit = testByName.get(src.name);
        if (hit) roleMap.set(src.id, hit.id);
        continue;
      }
      let dest = testByName.get(src.name);
      if (dest) {
        roleMap.set(src.id, dest.id);
        stats.rolesMatched += 1;
        if (args.apply) {
          try {
            const patch = {};
            if (dest.color !== src.color) patch.color = src.color;
            if (dest.hoist !== src.hoist) patch.hoist = src.hoist;
            if (dest.mentionable !== src.mentionable) patch.mentionable = src.mentionable;
            const wantPerms = src.permissions.bitfield;
            if (dest.permissions.bitfield !== wantPerms) patch.permissions = wantPerms;
            if (Object.keys(patch).length) {
              await dest.edit({ ...patch, reason: "mirrorMainToTest: sync role" });
              stats.rolesUpdated += 1;
              await sleep(200);
            }
          } catch (e) {
            stats.errors.push(`role_update ${src.name}: ${e.message || e}`);
          }
        }
        continue;
      }
      stats.rolesCreated += 1;
      if (!args.apply) continue;
      try {
        dest = await test.roles.create({
          name: src.name,
          colors: (() => {
            const c = src.colors;
            if (c && typeof c === "object") {
              const out = {};
              const p = Number(c.primaryColor ?? c.primary ?? NaN);
              const s = Number(c.secondaryColor ?? c.secondary ?? NaN);
              const t = Number(c.tertiaryColor ?? c.tertiary ?? NaN);
              if (Number.isFinite(p)) out.primaryColor = p;
              if (Number.isFinite(s)) out.secondaryColor = s;
              if (Number.isFinite(t)) out.tertiaryColor = t;
              if (Object.keys(out).length) return out;
            }
            const n = Number(src.color);
            return Number.isFinite(n) ? { primaryColor: n } : undefined;
          })(),
          hoist: src.hoist,
          mentionable: src.mentionable,
          permissions: src.permissions,
          reason: "mirrorMainToTest: create missing role",
        });
        testByName.set(dest.name, dest);
        roleMap.set(src.id, dest.id);
        await sleep(250);
      } catch (e) {
        stats.errors.push(`role_create ${src.name}: ${e.message || e}`);
      }
    }

    // best-effort position order (below bot top)
    if (args.apply) {
      try {
        const ordered = mainRoles
          .map((r) => roleMap.get(r.id))
          .filter(Boolean)
          .filter((id) => id !== TEST_ID);
        // leave bot's own roles alone; set positions for mapped roles under bot
        const positions = [];
        let pos = 1;
        for (const id of ordered) {
          const role = test.roles.cache.get(id);
          if (!role || role.managed || role.comparePositionTo(me.roles.highest) >= 0) continue;
          positions.push({ role: id, position: pos });
          pos += 1;
        }
        if (positions.length) {
          await test.roles.setPositions(positions).catch((e) => {
            stats.errors.push(`role_positions: ${e.message || e}`);
          });
        }
      } catch (e) {
        stats.errors.push(`role_positions_outer: ${e.message || e}`);
      }
    }
  } else {
    // still build map by name for members/channels
    for (const src of main.roles.cache.values()) {
      if (src.id === MAIN_ID) continue;
      const hit = [...test.roles.cache.values()].find((r) => r.name === src.name);
      if (hit) roleMap.set(src.id, hit.id);
    }
  }

  // --- CHANNELS ---
  const channelMap = new Map(); // mainChannelId -> testChannelId
  if (doChannels || doRoles) {
    await test.channels.fetch();
  }

  if (doChannels) {
    const testByKey = new Map();
    for (const ch of test.channels.cache.values()) {
      testByKey.set(channelKey(ch), ch);
    }
    const mainIdToName = new Map(
      [...main.channels.cache.values()].map((ch) => [String(ch.id), String(ch.name || "")]),
    );

    const mainChannels = [...main.channels.cache.values()].sort((a, b) => {
      const ap = a.type === ChannelType.GuildCategory ? 0 : 1;
      const bp = b.type === ChannelType.GuildCategory ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.rawPosition - b.rawPosition;
    });

    function mapOverwrites(srcOverwrites) {
      const out = [];
      for (const ow of srcOverwrites.cache.values()) {
        let mappedId = null;
        if (ow.type === 0) {
          // role
          mappedId = roleMap.get(String(ow.id)) || null;
          if (!mappedId && String(ow.id) === MAIN_ID) mappedId = TEST_ID;
        } else if (ow.type === 1) {
          // member Ã¢â‚¬â€ only if present on test
          if (test.members.cache.has(String(ow.id))) mappedId = String(ow.id);
        }
        if (!mappedId) continue;
        out.push({
          id: mappedId,
          allow: ow.allow.bitfield,
          deny: ow.deny.bitfield,
          type: ow.type,
        });
      }
      return out;
    }

    // pass 1: categories
    for (const src of mainChannels.filter((c) => c.type === ChannelType.GuildCategory)) {
      const key = backupChannelKey(
        { name: src.name, type: src.type, parentId: null },
        mainIdToName,
      );
      let dest = testByKey.get(key);
      if (dest) {
        channelMap.set(src.id, dest.id);
        stats.channelsMatched += 1;
        if (args.apply) {
          try {
            await dest.permissionOverwrites.set(mapOverwrites(src.permissionOverwrites));
            stats.channelsUpdated += 1;
            await sleep(200);
          } catch (e) {
            stats.errors.push(`cat_update ${src.name}: ${e.message || e}`);
          }
        }
        continue;
      }
      stats.channelsCreated += 1;
      if (!args.apply) continue;
      try {
        dest = await test.channels.create({
          name: src.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: mapOverwrites(src.permissionOverwrites),
          reason: "mirrorMainToTest: create missing category",
          position: src.rawPosition,
        });
        testByKey.set(channelKey(dest), dest);
        channelMap.set(src.id, dest.id);
        await sleep(350);
      } catch (e) {
        stats.errors.push(`cat_create ${src.name}: ${e.message || e}`);
      }
    }

    // pass 2: other channels
    const allowed = new Set([
      ChannelType.GuildText,
      ChannelType.GuildVoice,
      ChannelType.GuildAnnouncement,
      ChannelType.GuildStageVoice,
      ChannelType.GuildForum,
      ChannelType.GuildMedia,
    ]);
    for (const src of mainChannels.filter((c) => allowed.has(c.type))) {
      const parentName = src.parentId ? String(src.parent?.name || "") : "";
      const key = `${parentName}::${Number(src.type)}::${String(src.name || "")}`;
      let dest = testByKey.get(key);
      if (dest) {
        channelMap.set(src.id, dest.id);
        stats.channelsMatched += 1;
        if (args.apply) {
          try {
            const patch = {
              topic: src.topic || null,
              nsfw: Boolean(src.nsfw),
              rateLimitPerUser: src.rateLimitPerUser || 0,
              permissionOverwrites: mapOverwrites(src.permissionOverwrites),
            };
            if (src.parentId && channelMap.get(src.parentId)) {
              patch.parent = channelMap.get(src.parentId);
            }
            await dest.edit({ ...patch, reason: "mirrorMainToTest: sync channel" });
            stats.channelsUpdated += 1;
            await sleep(250);
          } catch (e) {
            stats.errors.push(`ch_update ${src.name}: ${e.message || e}`);
          }
        }
        continue;
      }
      stats.channelsCreated += 1;
      if (!args.apply) continue;
      try {
        const parentId = src.parentId ? channelMap.get(src.parentId) || null : null;
        const createOpts = {
          name: src.name,
          type: src.type,
          topic: src.topic || undefined,
          nsfw: Boolean(src.nsfw),
          rateLimitPerUser: src.rateLimitPerUser || 0,
          parent: parentId || undefined,
          permissionOverwrites: mapOverwrites(src.permissionOverwrites),
          reason: "mirrorMainToTest: create missing channel",
          position: src.rawPosition,
        };
        if (src.type === ChannelType.GuildVoice || src.type === ChannelType.GuildStageVoice) {
          createOpts.bitrate = src.bitrate || undefined;
          createOpts.rtcRegion = src.rtcRegion || undefined;
          if (src.type === ChannelType.GuildVoice) {
            const ul = Math.min(99, Math.max(0, Number(src.userLimit || 0) || 0));
            if (ul > 0) createOpts.userLimit = ul;
          }
        }
        dest = await test.channels.create(createOpts);
        testByKey.set(channelKey(dest), dest);
        channelMap.set(src.id, dest.id);
        await sleep(400);
      } catch (e) {
        stats.errors.push(`ch_create ${src.name}: ${e.message || e}`);
      }
    }
  }

  // --- MEMBERS (present on both) ---
  if (doMembers) {
    const both = [...main.members.cache.values()].filter((m) => test.members.cache.has(m.id));
    for (const srcMember of both) {
      const destMember = test.members.cache.get(srcMember.id);
      if (!destMember) {
        stats.membersSkippedMissing += 1;
        continue;
      }
      const targetRoleIds = [];
      for (const role of srcMember.roles.cache.values()) {
        if (role.id === MAIN_ID) continue;
        if (role.managed) continue;
        const mapped = roleMap.get(role.id);
        if (!mapped || mapped === TEST_ID) continue;
        const destRole = test.roles.cache.get(mapped);
        if (!destRole || destRole.managed) continue;
        if (destRole.comparePositionTo(me.roles.highest) >= 0) continue;
        targetRoleIds.push(mapped);
      }
      // keep test-only unmanaged roles the member already has
      for (const role of destMember.roles.cache.values()) {
        if (role.id === TEST_ID || role.managed) continue;
        const comesFromMain = [...roleMap.values()].includes(role.id);
        if (!comesFromMain) targetRoleIds.push(role.id);
      }
      const unique = [...new Set(targetRoleIds)];
      const current = new Set(
        [...destMember.roles.cache.keys()].filter((id) => id !== TEST_ID),
      );
      const same =
        unique.length === current.size && unique.every((id) => current.has(id));
      if (same) continue;
      stats.membersSynced += 1;
      if (!args.apply) continue;
      try {
        await destMember.roles.set(unique, "mirrorMainToTest: sync member roles");
        await sleep(150);
      } catch (e) {
        stats.errors.push(`member ${srcMember.id}: ${e.message || e}`);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        main: { id: main.id, name: main.name },
        test: { id: test.id, name: test.name },
        flags: args,
        roleMapSize: roleMap.size,
        channelMapSize: channelMap.size,
        membersOnBoth: [...main.members.cache.values()].filter((m) =>
          test.members.cache.has(m.id),
        ).length,
        stats,
      },
      null,
      2,
    ),
  );

  await client.destroy();
  if (stats.errors.length) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});