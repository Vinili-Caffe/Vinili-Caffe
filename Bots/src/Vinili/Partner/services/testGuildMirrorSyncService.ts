"use strict";
/**
 * Keep test guild structure aligned with main.
 * Creates missing mirrored roles/channels; deletes mirrored ones removed on main.
 * Test-only roles/channels (not mirrored from main) are never deleted.
 */
const { ChannelType, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { shouldStartExternalWorkerLoop } = require("../../../shared/runtime/externalWorkerGate") as typeof import("../../../shared/runtime/externalWorkerGate");
const {
  getMainGuildId,
  getTestGuildId,
  isTestMirrorGuild,
  persistTestMirrorMaps,
  removeMirrorRemapEntries,
  buildLiveMirrorMaps,
  loadMaps,
  channelKey,
  categoryCoreLabel,
  remapDeepConfigForTestGuild,
} = require("../../Config/testGuildMirrorRemap") as typeof import("../../Config/testGuildMirrorRemap");

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;
let mirrorTimer = null;
let mirrorInFlight = false;
const joinRoleSyncInFlight = new Set();

function sleep(ms?) {
  return new Promise((r?) => setTimeout(r, ms));
}

function mapOverwrites(srcOverwrites?, roleMap?, testGuild?) {
  const out = [];
  for (const ow of srcOverwrites.cache.values()) {
    let mappedId = null;
    if (ow.type === 0) {
      mappedId = roleMap.get(String(ow.id)) || null;
      if (!mappedId && String(ow.id) === String(IDs.guilds?.main)) mappedId = testGuild.id;
    } else if (ow.type === 1) {
      if (testGuild.members.cache.has(String(ow.id))) mappedId = String(ow.id);
    }
    if (!mappedId) continue;
    out.push({ id: mappedId, allow: ow.allow.bitfield, deny: ow.deny.bitfield, type: ow.type });
  }
  return out;
}

async function reorderTestRolesLikeMain(main?, test?, me?) {
  const botHighest = me.roles.highest;
  const editable = [...test.roles.cache.values()].filter((r?) => {
    if (r.id === test.id || r.managed || r.id === botHighest.id) return false;
    try {
      return botHighest.comparePositionTo(r) > 0;
    } catch {
      return false;
    }
  });
  const testByName = new Map();
  for (const r of editable) {
    if (!testByName.has(r.name)) testByName.set(r.name, r);
  }
  const mainAsc = [...main.roles.cache.values()]
    .filter((r?) => r.id !== main.id && !r.managed)
    .sort((a?, b?) => a.position - b.position);
  const desiredAsc = [];
  const seen = new Set();
  for (const src of mainAsc) {
    const dest = testByName.get(src.name);
    if (!dest || seen.has(dest.id)) continue;
    desiredAsc.push(dest);
    seen.add(dest.id);
  }
  const extras = editable.filter((r?) => !seen.has(r.id)).sort((a?, b?) => a.position - b.position);
  const finalAsc = [...extras, ...desiredAsc];
  const positions = finalAsc.map((r?, idx?) => ({ role: r.id, position: idx + 1 }));
  if (!positions.length) return { ok: true, moved: 0 };
  await test.roles.setPositions(positions);
  return { ok: true, moved: positions.length };
}

async function mirrorRenameChannel(guild?, dest?, name?, reason?) {
  const id = String(dest?.id || "").trim();
  if (!guild?.channels || !id) throw new Error("no dest channel");
  const ch = guild.channels.cache.get(id) || dest;
  const reasonText = String(reason || "testGuildMirrorSync");
  const nextName = String(name || "");
  if (typeof ch?.setName === "function") return ch.setName(nextName, reasonText);
  if (typeof ch?.edit === "function") return ch.edit({ name: nextName, reason: reasonText });
  /* DirectoryChannel / partial / remap stale: edit via manager */
  return guild.channels.edit(id, { name: nextName, reason: reasonText });
}

async function mirrorSetParent(guild?, dest?, parentId?, reason?) {
  const id = String(dest?.id || "").trim();
  if (!guild?.channels || !id) throw new Error("no dest channel");
  const ch = guild.channels.cache.get(id) || dest;
  const parent = parentId || null;
  if (typeof ch?.setParent === "function") {
    return ch.setParent(parent, { lockPermissions: false, reason: String(reason || "testGuildMirrorSync") });
  }
  return guild.channels.edit(id, {
    parent,
    lockPermissions: false,
    reason: String(reason || "testGuildMirrorSync"),
  });
}

async function syncMirroredCategoryFields(src?, dest?, roleMap?, test?, stats?) {
  if (!src || !dest) return;
  try {
    if (String(dest.name || "") !== String(src.name || "")) {
      await mirrorRenameChannel(test, dest, src.name, "testGuildMirrorSync: rename category like main");
      stats.channelsUpdated = (stats.channelsUpdated || 0) + 1;
      await sleep(180);
    }
  } catch (e) {
    stats.errors.push(`catRename:${src.name}:${e.message || e}`);
  }
  try {
    const overs = mapOverwrites(src.permissionOverwrites, roleMap, test);
    if (overs.length && typeof dest.permissionOverwrites?.set === "function") {
      await dest.permissionOverwrites.set(overs, "testGuildMirrorSync: category overwrites");
    }
  } catch (e) {
    stats.errors.push(`catOw:${src.name}:${e.message || e}`);
  }
}

/** Allinea posizioni canali/categorie test a quelle del main (rawPosition). */
async function reorderTestChannelsLikeMain(main?, test?, channelMap?) {
  const pairs = [];
  for (const [mainId, testId] of channelMap.entries()) {
    const src = main.channels.cache.get(String(mainId));
    const dest = test.channels.cache.get(String(testId));
    if (!src || !dest) continue;
    pairs.push({ dest, position: Number(src.rawPosition) || 0 });
  }
  pairs.sort((a?, b?) => a.position - b.position);
  if (!pairs.length) return { ok: true, moved: 0 };
  const positions = pairs.map((row?) => ({
    channel: row.dest.id,
    position: row.position,
  }));
  let setPosErr = null;
  try {
    if (typeof test.channels?.setPositions === "function") {
      await test.channels.setPositions(positions);
      return { ok: true, moved: positions.length };
    }
  } catch (e) {
    setPosErr = e;
  }
  let moved = 0;
  for (const row of pairs) {
    try {
      await row.dest.setPosition(row.position, { reason: "testGuildMirrorSync: position like main" });
      moved += 1;
      await sleep(100);
    } catch (_) {
      /* ignore single */
    }
  }
  return {
    ok: true,
    moved,
    fallback: true,
    error: setPosErr ? String(setPosErr?.message || setPosErr) : "no_setPositions",
  };
}

/**
 * Se sul test ci sono categorie doppie (stesso core label) dopo un renumber sul main,
 * tiene quella mappata dal mirror e sposta i figli sull'altra prima di cancellare i residui.
 */
async function pruneDuplicateMirroredCategories(main?, test?, channelMap?, stats?) {
  const mirroredCatIds = new Set();
  for (const [mainId, testId] of channelMap.entries()) {
    const src = main.channels.cache.get(String(mainId));
    if (src?.type === ChannelType.GuildCategory) mirroredCatIds.add(String(testId));
  }
  const byCore = new Map();
  for (const ch of test.channels.cache.values()) {
    if (ch.type !== ChannelType.GuildCategory) continue;
    const core = categoryCoreLabel(ch.name);
    if (!core) continue;
    if (!byCore.has(core)) byCore.set(core, []);
    byCore.get(core).push(ch);
  }
  let deleted = 0;
  for (const [, list] of byCore.entries()) {
    if (list.length < 2) continue;
    const mirrored = list.filter((ch?) => mirroredCatIds.has(String(ch.id)));
    if (!mirrored.length) continue; // categorie test-only: non toccare
    const keep =
      mirrored.find((ch?) => {
        const mainPair = [...channelMap.entries()].find(([, tid]) => String(tid) === String(ch.id));
        if (!mainPair) return false;
        const src = main.channels.cache.get(String(mainPair[0]));
        return src && String(src.name || "") === String(ch.name || "");
      }) ||
      mirrored[0] ||
      list.slice().sort((a?, b?) => b.rawPosition - a.rawPosition)[0];
    if (!keep) continue;
    for (const dup of list) {
      if (String(dup.id) === String(keep.id)) continue;
      /* Cancella sia residui non mappati sia vecchie copie ancora in remap stale. */
      try {
        const children = [...test.channels.cache.values()].filter(
          (c?) => String(c.parentId || "") === String(dup.id),
        );
        for (const child of children) {
          try {
            await child.setParent(keep.id, {
              lockPermissions: false,
              reason: "testGuildMirrorSync: move under kept category",
            });
            await sleep(160);
          } catch (moveErr) {
            stats.errors.push(`catDupMove:${child.name}:${moveErr.message || moveErr}`);
          }
        }
        const stillChildren = [...test.channels.cache.values()].filter(
          (c?) => String(c.parentId || "") === String(dup.id),
        );
        if (stillChildren.length) {
          stats.errors.push(`catDupDel:${dup.name}:still_has_${stillChildren.length}_children`);
          continue;
        }
        await dup.delete("testGuildMirrorSync: duplicate category after main renumber");
        deleted += 1;
        stats.channelsDeleted = (stats.channelsDeleted || 0) + 1;
        await sleep(220);
      } catch (e) {
        stats.errors.push(`catDupDel:${dup.name}:${e.message || e}`);
      }
    }
  }
  return { deleted };
}

function buildRoleMapForSync(main?, test?) {
  const roleMap = new Map();
  const live = buildLiveMirrorMaps(main, test);
  for (const [k, v] of live.roleMap) roleMap.set(String(k), String(v));
  try {
    const persisted = loadMaps()?.roleRemap || {};
    for (const [k, v] of Object.entries(persisted)) {
      if (k && v) roleMap.set(String(k), String(v));
    }
  } catch (_) {
    /* optional */
  }
  roleMap.set(String(main.id), String(test.id));
  return roleMap;
}

function computeMirroredRoleIds({ main, test, srcMember, destMember, roleMap, me }) {
  const targetRoleIds = [];
  for (const role of srcMember.roles.cache.values()) {
    if (role.id === main.id || role.managed) continue;
    const mapped = roleMap.get(role.id) || roleMap.get(String(role.id));
    if (!mapped || mapped === test.id) continue;
    const destRole = test.roles.cache.get(mapped);
    if (!destRole || destRole.managed) continue;
    if (destRole.comparePositionTo(me.roles.highest) >= 0) continue;
    targetRoleIds.push(mapped);
  }
  /* keep test-only unmanaged roles already on the member */
  const mappedDestIds = new Set([...roleMap.values()].map(String));
  for (const role of destMember.roles.cache.values()) {
    if (role.id === test.id || role.managed) continue;
    if (!mappedDestIds.has(String(role.id))) targetRoleIds.push(role.id);
  }
  return [...new Set(targetRoleIds.map(String))];
}

async function applyMirroredRolesToTestMember({
  main,
  test,
  srcMember,
  destMember,
  roleMap,
  me,
  reason = "testGuildMirrorSync: member roles",
}) {
  const unique = computeMirroredRoleIds({ main, test, srcMember, destMember, roleMap, me });
  const current = new Set([...destMember.roles.cache.keys()].filter((id?) => id !== test.id).map(String));
  const same = unique.length === current.size && unique.every((id?) => current.has(id));
  if (same) return { ok: true, changed: false, roles: unique.length };
  await destMember.roles.set(unique, reason);
  return { ok: true, changed: true, roles: unique.length };
}

async function syncMemberRoles(main?, test?, roleMap?, me?) {
  let synced = 0;
  let failed = 0;
  const both = [...main.members.cache.values()].filter((m?) => test.members.cache.has(m.id));
  for (const srcMember of both) {
    const destMember = test.members.cache.get(srcMember.id);
    if (!destMember) continue;
    try {
      const out = await applyMirroredRolesToTestMember({
        main,
        test,
        srcMember,
        destMember,
        roleMap,
        me,
        reason: "testGuildMirrorSync: member roles",
      });
      if (out.changed) {
        synced += 1;
        await sleep(120);
      }
    } catch {
      failed += 1;
    }
  }
  return { synced, failed, both: both.length };
}

/**
 * On test-guild join: copy roles from main immediately (name/remap match).
 */
async function syncTestMemberRolesFromMain(member?) {
  try {
    if (!member?.guild || !member?.id || member.user?.bot) {
      return { ok: false, reason: "bad_input" };
    }
    if (!isTestMirrorGuild(member.guild.id)) return { ok: false, reason: "not_test" };
    const mainId = getMainGuildId();
    const testId = getTestGuildId();
    if (!mainId || !testId) return { ok: false, reason: "missing_guild_ids" };

    const key = String(member.id);
    if (joinRoleSyncInFlight.has(key)) return { ok: false, reason: "in_flight" };
    joinRoleSyncInFlight.add(key);
    try {
      const client = member.client;
      const main = await client.guilds.fetch(mainId).catch(() => null);
      const test = member.guild;
      if (!main) return { ok: false, reason: "no_main" };

      const srcMember = await main.members.fetch(member.id).catch(() => null);
      if (!srcMember) return { ok: false, reason: "not_on_main", roles: 0 };

      await Promise.all([
        main.roles.fetch().catch(() => null),
        test.roles.fetch().catch(() => null),
      ]);
      const me = await test.members.fetchMe().catch(() => null);
      if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
        return { ok: false, reason: "missing_manage_roles" };
      }

      const destMember =
        (await test.members.fetch(member.id).catch(() => null)) || member;
      const roleMap = buildRoleMapForSync(main, test);
      const out = await applyMirroredRolesToTestMember({
        main,
        test,
        srcMember,
        destMember,
        roleMap,
        me,
        reason: "testGuildMirrorSync: join from main",
      });
      return {
        ok: true,
        changed: Boolean(out.changed),
        roles: out.roles,
        mainRoles: srcMember.roles.cache.filter((r?) => r.id !== main.id && !r.managed).size,
      };
    } finally {
      joinRoleSyncInFlight.delete(key);
    }
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
}

async function seedTestPartnershipConfig(guildId?) {
  try {
    const { buildMainPartnershipMongoSeed } = require("../../Partner/core/partnershipConfigResolver") as typeof import("../../Partner/core/partnershipConfigResolver");
    const { savePartnershipConfig } = require("../../Partner/core/tenantPartnershipSettings") as typeof import("../../Partner/core/tenantPartnershipSettings");
    const seed = buildMainPartnershipMongoSeed(guildId);
    const remapped = remapDeepConfigForTestGuild(guildId, seed);
    await savePartnershipConfig(guildId, remapped);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

function canBotDeleteTestRole(me?, role?) {
  if (!me || !role) return false;
  if (role.id === role.guild?.id || role.managed) return false;
  try {
    /* editable = ManageRoles + !managed + highest sopra il target (fonte di verità d.js) */
    if (typeof role.editable === "boolean") return role.editable;
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) return false;
    return me.roles.highest.comparePositionTo(role) > 0;
  } catch {
    return false;
  }
}

/** Colori ruolo: sul test spesso manca ENHANCED_ROLE_COLORS → niente secondary/tertiary. */
function mirrorRoleColorsPayload(src?, guild?) {
  const features = guild?.features;
  const enhanced =
    (features && typeof features.has === "function" && features.has("ENHANCED_ROLE_COLORS")) ||
    (Array.isArray(features) && features.includes("ENHANCED_ROLE_COLORS"));
  const c = src?.colors;
  if (c && typeof c === "object") {
    const out: Record<string, any> = {};
    const p = Number(c.primaryColor ?? c.primary ?? c.primary_color ?? NaN);
    const s = Number(c.secondaryColor ?? c.secondary ?? c.secondary_color ?? NaN);
    const t = Number(c.tertiaryColor ?? c.tertiary ?? c.tertiary_color ?? NaN);
    if (Number.isFinite(p)) out.primaryColor = p;
    if (enhanced) {
      if (Number.isFinite(s)) out.secondaryColor = s;
      if (Number.isFinite(t)) out.tertiaryColor = t;
    }
    if (Object.keys(out).length) return out;
  }
  const n = Number(src?.color);
  return Number.isFinite(n) ? { primaryColor: n } : undefined;
}

function canBotDeleteTestChannel(me?) {
  try {
    return Boolean(me?.permissions?.has(PermissionsBitField.Flags.ManageChannels));
  } catch {
    return false;
  }
}

/**
 * Prune test roles/channels that were mirrored from main but no longer exist on main.
 * Never touches test-only entities (not present as remap destinations from a missing main id).
 */
async function pruneDeletedMainMirrors(main?, test?, me?, stats?) {
  const out = { rolesDeleted: 0, channelsDeleted: 0, errors: [] };
  const maps = loadMaps();
  const roleRemap = maps?.roleRemap || {};
  const channelRemap = maps?.channelRemap || {};
  const dropRoleMainIds = [];
  const dropChannelMainIds = [];
  let botMember = me;

  for (const [mainRoleId, testRoleId] of Object.entries(roleRemap)) {
    if (String(mainRoleId) === String(main.id)) continue;
    if (main.roles.cache.has(String(mainRoleId))) continue;
    const dest = test.roles.cache.get(String(testRoleId));
    if (!dest) {
      dropRoleMainIds.push(mainRoleId);
      continue;
    }
    if (!canBotDeleteTestRole(botMember, dest)) {
      /* Cache posizioni a volte stantia: riprova dopo fetch, poi tenta delete e leggi errore reale. */
      try {
        await test.roles.fetch(dest.id).catch(() => null);
        const fresh = await test.members.fetchMe().catch(() => null);
        if (fresh) botMember = fresh;
      } catch (_) {
        /* ignore */
      }
      if (!canBotDeleteTestRole(botMember, dest)) {
        try {
          await dest.delete("testGuildMirrorSync: deleted on main (force after hierarchy miss)");
          out.rolesDeleted += 1;
          dropRoleMainIds.push(mainRoleId);
          await sleep(180);
          continue;
        } catch (e) {
          out.errors.push(`roleKeep:${dest.name}:${e?.code || e?.message || "hierarchy"}`);
          continue;
        }
      }
    }
    try {
      await dest.delete("testGuildMirrorSync: deleted on main");
      out.rolesDeleted += 1;
      dropRoleMainIds.push(mainRoleId);
      await sleep(180);
    } catch (e) {
      out.errors.push(`roleDel:${dest.name}:${e.message || e}`);
    }
  }

  /* channels: children first, then categories */
  const channelEntries = Object.entries(channelRemap).filter(([mainChId]) => {
    return !main.channels.cache.has(String(mainChId));
  });
  const toDelete = [];
  for (const [mainChId, testChId] of channelEntries) {
    const dest = test.channels.cache.get(String(testChId));
    if (!dest) {
      dropChannelMainIds.push(mainChId);
      continue;
    }
    toDelete.push({ mainChId, dest });
  }
  toDelete.sort((a?, b?) => {
    const ac = a.dest.type === ChannelType.GuildCategory ? 1 : 0;
    const bc = b.dest.type === ChannelType.GuildCategory ? 1 : 0;
    return ac - bc;
  });
  if (toDelete.length && !canBotDeleteTestChannel(me)) {
    out.errors.push("channelDel:missing_manage_channels");
  } else {
    for (const { mainChId, dest } of toDelete) {
      try {
        await dest.delete("testGuildMirrorSync: deleted on main");
        out.channelsDeleted += 1;
        dropChannelMainIds.push(mainChId);
        await sleep(220);
      } catch (e) {
        out.errors.push(`chDel:${dest.name}:${e.message || e}`);
      }
    }
  }

  if (dropRoleMainIds.length || dropChannelMainIds.length) {
    removeMirrorRemapEntries({
      roleMainIds: dropRoleMainIds,
      channelMainIds: dropChannelMainIds,
    });
  }
  if (stats) {
    stats.rolesDeleted = (stats.rolesDeleted || 0) + out.rolesDeleted;
    stats.channelsDeleted = (stats.channelsDeleted || 0) + out.channelsDeleted;
    for (const err of out.errors) stats.errors.push(err);
  }
  return out;
}

/** Immediate: main role deleted → delete mirrored test role (name/remap). */
async function mirrorMainRoleDeleteToTest(client?, deletedRole?) {
  try {
    const mainId = getMainGuildId();
    const testId = getTestGuildId();
    if (!mainId || !testId || !deletedRole?.id) return { ok: false, reason: "bad_input" };
    if (String(deletedRole.guildId || deletedRole.guild?.id) !== String(mainId)) {
      return { ok: false, reason: "not_main" };
    }
    const test = await client.guilds.fetch(testId).catch(() => null);
    if (!test) return { ok: false, reason: "no_test" };
    await test.roles.fetch().catch(() => null);
    const me = await test.members.fetchMe().catch(() => null);

    const maps = loadMaps();
    let testRoleId = maps?.roleRemap?.[String(deletedRole.id)] || "";
    let dest = testRoleId ? test.roles.cache.get(String(testRoleId)) : null;
    if (!dest && deletedRole.name) {
      dest = [...test.roles.cache.values()].find(
        (r?) => r.id !== test.id && !r.managed && r.name === deletedRole.name,
      );
      if (dest) testRoleId = dest.id;
    }
    if (!dest) {
      removeMirrorRemapEntries({ roleMainIds: [deletedRole.id] });
      return { ok: true, deleted: false, reason: "no_mirror" };
    }
    if (!canBotDeleteTestRole(me, dest)) {
      return { ok: false, reason: "hierarchy", testRoleId: dest.id };
    }
    await dest.delete("testGuildMirrorSync: role deleted on main");
    removeMirrorRemapEntries({ roleMainIds: [deletedRole.id] });
    return { ok: true, deleted: true, testRoleId: dest.id, name: dest.name };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
}

/** Immediate: main channel deleted → delete mirrored test channel (key/remap). */
async function mirrorMainChannelDeleteToTest(client?, deletedChannel?) {
  try {
    const mainId = getMainGuildId();
    const testId = getTestGuildId();
    if (!mainId || !testId || !deletedChannel?.id) return { ok: false, reason: "bad_input" };
    if (String(deletedChannel.guildId || deletedChannel.guild?.id) !== String(mainId)) {
      return { ok: false, reason: "not_main" };
    }
    const test = await client.guilds.fetch(testId).catch(() => null);
    if (!test) return { ok: false, reason: "no_test" };
    await test.channels.fetch().catch(() => null);
    const me = await test.members.fetchMe().catch(() => null);
    if (!canBotDeleteTestChannel(me)) return { ok: false, reason: "missing_manage_channels" };

    const maps = loadMaps();
    let testChId = maps?.channelRemap?.[String(deletedChannel.id)] || "";
    let dest = testChId ? test.channels.cache.get(String(testChId)) : null;
    if (!dest) {
      const key = channelKey(deletedChannel);
      dest = [...test.channels.cache.values()].find((ch?) => channelKey(ch) === key) || null;
      if (dest) testChId = dest.id;
    }
    if (!dest) {
      removeMirrorRemapEntries({ channelMainIds: [deletedChannel.id] });
      return { ok: true, deleted: false, reason: "no_mirror" };
    }
    await dest.delete("testGuildMirrorSync: channel deleted on main");
    removeMirrorRemapEntries({ channelMainIds: [deletedChannel.id] });
    return { ok: true, deleted: true, testChannelId: dest.id, name: dest.name };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
}

async function runTestGuildMirrorSync(client?, opts: Record<string, any> = {}) {
  const mainId = getMainGuildId();
  const testId = getTestGuildId();
  if (!mainId || !testId) return { ok: false, reason: "missing_guild_ids" };
  if (mirrorInFlight && !opts.force) return { ok: false, reason: "in_flight" };
  mirrorInFlight = true;
  const stats = {
    rolesCreated: 0,
    rolesMatched: 0,
    rolesDeleted: 0,
    channelsCreated: 0,
    channelsMatched: 0,
    channelsUpdated: 0,
    channelsDeleted: 0,
    errors: [],
  };
  try {
    const main = await client.guilds.fetch(mainId);
    const test = await client.guilds.fetch(testId);
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
      return { ok: false, reason: "missing_manage_roles" };
    }
    if (!me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return { ok: false, reason: "missing_manage_channels" };
    }

    /* first drop mirrors of things already gone on main (test-only kept) */
    await pruneDeletedMainMirrors(main, test, me, stats);
    await Promise.all([test.roles.fetch().catch(() => null), test.channels.fetch().catch(() => null)]);

    const roleMap = new Map();
    roleMap.set(main.id, test.id);
    const testByName = new Map();
    for (const r of test.roles.cache.values()) {
      if (r.id === test.id) continue;
      if (!testByName.has(r.name)) testByName.set(r.name, r);
    }
    const mainRoles = [...main.roles.cache.values()]
      .filter((r?) => r.id !== main.id)
      .sort((a?, b?) => a.position - b.position);

    for (const src of mainRoles) {
      if (src.managed) {
        const hit = testByName.get(src.name);
        if (hit) roleMap.set(src.id, hit.id);
        continue;
      }
      let dest = testByName.get(src.name);
      if (dest) {
        roleMap.set(src.id, dest.id);
        stats.rolesMatched += 1;
        continue;
      }
      try {
        const createOpts: Record<string, any> = {
          name: src.name,
          colors: mirrorRoleColorsPayload(src, test),
          hoist: src.hoist,
          mentionable: src.mentionable,
          permissions: src.permissions,
          reason: "testGuildMirrorSync: create role",
        };
        try {
          dest = await test.roles.create(createOpts);
        } catch (e1) {
          /* Fallback: API a volte richiede feature anche con un solo secondary strisciato */
          const msg = String(e1?.message || e1 || "");
          if (/Missing guild feature|ENHANCED_ROLE/i.test(msg) || Number(e1?.code) === 50035 || Number(e1?.code) === 670006) {
            const solid = mirrorRoleColorsPayload(
              { color: src.color, colors: { primaryColor: src.colors?.primaryColor ?? src.colors?.primary ?? src.color } },
              { features: [] },
            );
            dest = await test.roles.create({ ...createOpts, colors: solid });
          } else {
            throw e1;
          }
        }
        testByName.set(dest.name, dest);
        roleMap.set(src.id, dest.id);
        stats.rolesCreated += 1;
        await sleep(220);
      } catch (e) {
        stats.errors.push(`role:${src.name}:${e.message || e}`);
      }
    }

    const channelMap = new Map();
    const persistedChannelRemap = loadMaps()?.channelRemap || {};
    const testByKey = new Map();
    const usedTestChannelIds = new Set();
    for (const ch of test.channels.cache.values()) {
      const key = channelKey(ch);
      if (!testByKey.has(key)) testByKey.set(key, ch);
    }

    function claimTestChannel(candidate?) {
      if (!candidate) return null;
      const id = String(candidate.id || "");
      if (!id || usedTestChannelIds.has(id)) return null;
      usedTestChannelIds.add(id);
      return candidate;
    }

    function resolveExistingTestChannel(src?) {
      const srcType = Number(src?.type);
      const usable = (ch?) =>
        ch &&
        Number(ch.type) === srcType &&
        (typeof ch.setName === "function" || typeof ch.edit === "function" || Boolean(ch.id));
      const remapId = String(persistedChannelRemap[String(src.id)] || "").trim();
      if (remapId) {
        const remapped = test.channels.cache.get(remapId);
        /* Remap stale / DirectoryChannel senza setName: non riusare tipi diversi. */
        if (usable(remapped)) {
          const hit = claimTestChannel(remapped);
          if (hit) return hit;
        }
      }
      const key = channelKey(src);
      /* Preferisci nome uguale al main (dopo renumber), altrimenti prima key libera. */
      const candidates = [...test.channels.cache.values()].filter(
        (ch?) =>
          usable(ch) && channelKey(ch) === key && !usedTestChannelIds.has(String(ch.id)),
      );
      const exact = candidates.find((ch?) => String(ch.name || "") === String(src.name || ""));
      if (exact) return claimTestChannel(exact);
      if (candidates.length) return claimTestChannel(candidates[0]);
      const keyed = testByKey.get(key);
      return usable(keyed) ? claimTestChannel(keyed) : null;
    }

    const mainChannels = [...main.channels.cache.values()].sort((a?, b?) => {
      const ap = a.type === ChannelType.GuildCategory ? 0 : 1;
      const bp = b.type === ChannelType.GuildCategory ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.rawPosition - b.rawPosition;
    });

    for (const src of mainChannels.filter((c?) => c.type === ChannelType.GuildCategory)) {
      let dest = resolveExistingTestChannel(src);
      if (dest) {
        channelMap.set(src.id, dest.id);
        stats.channelsMatched += 1;
        await syncMirroredCategoryFields(src, dest, roleMap, test, stats);
        testByKey.set(channelKey(dest), dest);
        continue;
      }
      try {
        dest = await test.channels.create({
          name: src.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: mapOverwrites(src.permissionOverwrites, roleMap, test),
          reason: "testGuildMirrorSync: create category",
          position: src.rawPosition,
        });
        usedTestChannelIds.add(String(dest.id));
        testByKey.set(channelKey(dest), dest);
        channelMap.set(src.id, dest.id);
        stats.channelsCreated += 1;
        await sleep(320);
      } catch (e) {
        stats.errors.push(`cat:${src.name}:${e.message || e}`);
      }
    }

    const allowed = new Set([
      ChannelType.GuildText,
      ChannelType.GuildVoice,
      ChannelType.GuildAnnouncement,
      ChannelType.GuildStageVoice,
      ChannelType.GuildForum,
      ChannelType.GuildMedia,
    ]);
    for (const src of mainChannels.filter((c?) => allowed.has(c.type))) {
      let dest = resolveExistingTestChannel(src);
      if (dest) {
        channelMap.set(src.id, dest.id);
        stats.channelsMatched += 1;
        try {
          if (String(dest.name || "") !== String(src.name || "")) {
            await mirrorRenameChannel(test, dest, src.name, "testGuildMirrorSync: rename channel like main");
            stats.channelsUpdated = (stats.channelsUpdated || 0) + 1;
            await sleep(120);
          }
          const wantParent = src.parentId ? channelMap.get(src.parentId) || null : null;
          if (String(dest.parentId || "") !== String(wantParent || "")) {
            await mirrorSetParent(test, dest, wantParent, "testGuildMirrorSync: parent like main");
            await sleep(120);
          }
        } catch (e) {
          stats.errors.push(`chUpdate:${src.name}:${e.message || e}`);
        }
        continue;
      }
      try {
        const parentId = src.parentId ? channelMap.get(src.parentId) || null : null;
        const createOpts: Record<string, any> = {
          name: src.name,
          type: src.type,
          topic: src.topic || undefined,
          nsfw: Boolean(src.nsfw),
          rateLimitPerUser: src.rateLimitPerUser || 0,
          parent: parentId || undefined,
          permissionOverwrites: mapOverwrites(src.permissionOverwrites, roleMap, test),
          reason: "testGuildMirrorSync: create channel",
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
        usedTestChannelIds.add(String(dest.id));
        testByKey.set(channelKey(dest), dest);
        channelMap.set(src.id, dest.id);
        stats.channelsCreated += 1;
        await sleep(380);
      } catch (e) {
        stats.errors.push(`ch:${src.name}:${e.message || e}`);
      }
    }

    await test.roles.fetch();
    await test.channels.fetch();
    try {
      await pruneDuplicateMirroredCategories(main, test, channelMap, stats);
      await test.channels.fetch().catch(() => null);
    } catch (e) {
      stats.errors.push(`catPrune:${e.message || e}`);
    }
    const live = buildLiveMirrorMaps(main, test);
    for (const [k, v] of live.roleMap) roleMap.set(k, v);
    for (const [k, v] of live.channelMap) channelMap.set(k, v);

    let order = { moved: 0 };
    let channelOrder = { moved: 0 };
    try {
      order = await reorderTestRolesLikeMain(main, test, me);
    } catch (e) {
      stats.errors.push(`order:${e.message || e}`);
    }
    try {
      channelOrder = await reorderTestChannelsLikeMain(main, test, channelMap);
    } catch (e) {
      stats.errors.push(`chOrder:${e.message || e}`);
    }

    const members = await syncMemberRoles(main, test, roleMap, me);
    const persisted = persistTestMirrorMaps({
      roleMap,
      channelMap,
      meta: { source: "testGuildMirrorSync", stats },
    });
    const seed = await seedTestPartnershipConfig(testId);

    return {
      ok: true,
      stats,
      order,
      channelOrder,
      members,
      roleMapSize: roleMap.size,
      channelMapSize: channelMap.size,
      remapAt: persisted.at,
      partnershipSeed: seed,
    };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err), stats };
  } finally {
    mirrorInFlight = false;
  }
}

function startTestGuildMirrorSyncLoop(client?, intervalMs = DEFAULT_INTERVAL_MS) {
  if (!shouldStartExternalWorkerLoop("COMMUNITY_POLL")) return null;
  if (mirrorTimer) return mirrorTimer;
  const ms = Math.max(30 * 60 * 1000, Number(intervalMs) || DEFAULT_INTERVAL_MS);
  const tick = () => {
    void runTestGuildMirrorSync(client).then((out?) => {
      if (out?.ok) {
        const rC = Number(out.stats?.rolesCreated || 0);
        const rD = Number(out.stats?.rolesDeleted || 0);
        const cC = Number(out.stats?.channelsCreated || 0);
        const cU = Number(out.stats?.channelsUpdated || 0);
        const cD = Number(out.stats?.channelsDeleted || 0);
        const members = Number(out.members?.synced || 0);
        const errN = Array.isArray(out.stats?.errors) ? out.stats.errors.length : 0;
        const movedCh = Number(out.channelOrder?.moved || 0);
        const matched = Number(out.stats?.channelsMatched || 0);
        const changed = Boolean(rC || rD || cC || cU || cD || members || movedCh);
        if (changed || errN || String(process.env.BOOT_VERBOSE || "").trim() === "1") {
          global.logger?.info?.(
            `[TEST MIRROR] sync +r${rC}/-${rD} +c${cC}/~${cU}/-${cD} match=${matched} map=${out.channelMapSize || 0} members=${members} chPos=${movedCh} err=${errN}`,
          );
        }
        if (errN) {
          global.logger?.warn?.(
            `[TEST MIRROR] sync errors: ${(out.stats.errors || []).slice(0, 8).join(" | ")}`,
          );
        }
      } else if (out?.reason && out.reason !== "in_flight") {
        global.logger?.warn?.(`[TEST MIRROR] sync skip/fail: ${out.reason}`);
      }
    });
  };
  /* Community-poll worker: sync subito; altrimenti delay soft dopo ready. */
  const firstDelayMs = shouldStartExternalWorkerLoop("COMMUNITY_POLL") ? 8_000 : 90_000;
  setTimeout(tick, firstDelayMs);
  mirrorTimer = setInterval(tick, ms);
  if (typeof mirrorTimer.unref === "function") mirrorTimer.unref();
  return mirrorTimer;
}

export = {
  startTestGuildMirrorSyncLoop,
  runTestGuildMirrorSync,
  syncTestMemberRolesFromMain,
  mirrorMainRoleDeleteToTest,
  mirrorMainChannelDeleteToTest,
};
