
const { EmbedBuilder } = require('discord.js');
const { ActivityUserProfile, GlobalSettings } = require('../../Schemas/Community/communitySchemas');
const { getLevelInfo, addExpWithLevel } = require('../../Services/Community/expService');

let isChecking = false;
let firstRun = true;

const cloudscraper = require('cloudscraper');

/**
 * Funzione per estrarre le recensioni dall'HTML di DISBOARD.
 */
function parseReviews(html) {
    const reviews = [];
    const blockRegex = /<div\s+class="review-card listing-card review-(\d+)/g;
    let match;

    while ((match = blockRegex.exec(html)) !== null) {
        const reviewId = match[1];
        const startIdx = match.index;
        const endIdx = html.indexOf('</div><!-- .review-card -->', startIdx);
        if (endIdx === -1) continue;
        const block = html.substring(startIdx, endIdx);

        const authorNameMatch = block.match(/<span class="author-name">\s*([\s\S]*?)\s*<\/span>/);
        const authorAvatarMatch = block.match(/<span class="author-icon avatar">[\s\S]*?<img\s*[^>]*data-src="([^"]+)"/);
        const titleMatch = block.match(/<div class="review-title">[\s\S]*?<\/i>\s*([\s\S]*?)\s*<i/);
        const bodyMatch = block.match(/<div class="review-body[\s\S]*?<div class="elastic-text-inner">([\s\S]*?)<\/div>/);
        const starsMatch = block.match(/<div class="review-stars" title="(\d)\/5 ratings">/);
        const dateMatch = block.match(/<div class="review-updated-at">\s*([\s\S]*?)\s*<\/div>/);

        reviews.push({
            reviewId,
            authorName: authorNameMatch ? authorNameMatch[1].trim() : 'Anonimo',
            authorAvatar: authorAvatarMatch ? authorAvatarMatch[1] : null,
            title: titleMatch ? titleMatch[1].trim() : '',
            body: bodyMatch ? bodyMatch[1].trim().replace(/<br\s*\/?>/gi, '\n') : '',
            stars: starsMatch ? parseInt(starsMatch[1]) : 5,
            postedAt: dateMatch ? dateMatch[1].trim() : ''
        });
    }
    return reviews;
}

// ... rest of helpers unchanged ...
function roundToNearest50(v) { return Math.round(v / 50) * 50; }
function getLevelStep(l) {
    const s = Math.max(1, Math.floor(Number(l || 1)));
    let st = 90 + Math.floor(s * 12) + (s % 4) * 15;
    if (s >= 10) { const o = s - 9; st += 120 + o * 28 + Math.floor(o * o * 1.3); }
    if (s >= 30) { st += 120 + (s - 30) * 18; }
    if (s >= 50) { st += 220 + (s - 50) * 25; }
    return Math.max(110, st);
}
function getTotalExpForLevel(l) {
    const t = Math.max(0, Math.floor(Number(l || 0)));
    if (t <= 0) return 0;
    let th = 100;
    for (let i = 1; i < t; i++) { th = roundToNearest50(th + Math.max(110, getLevelStep(i))); }
    return th;
}

async function findDiscordUser(guild, name) {
    if (!name) return null;
    const n = name.toLowerCase();
    let m = guild.members.cache.find(mem => mem.user.username.toLowerCase() === n);
    if (!m) m = guild.members.cache.find(mem => mem.displayName.toLowerCase() === n);
    if (!m) {
        try {
            const f = await guild.members.search({ query: name, limit: 1 });
            if (f.size > 0) m = f.first();
        } catch (e) {}
    }
    return m;
}

async function checkNewReviews(client) {
    if (isChecking) return;
    isChecking = true;

    try {
        const config = client.config.disboardReviews;
        if (!config || !config.enabled) return isChecking = false;

        // cloudscraper gestisce automaticamente i cookie, i ciphers e i challenge JS
        const html = await cloudscraper.get({
            url: config.reviewUrl,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://disboard.org/'
            }
        });

        const reviews = parseReviews(html);
        const mainGuildId = client.config.mainGuildId;
        const mainGuild = client.guilds.cache.get(mainGuildId);

        // Carico log globale per duplicati
        const settings = await GlobalSettings.findOne({ guildId: mainGuildId });
        const processedIds = new Set((settings?.disboardReviewLog || []).map(r => r.reviewId));

        const notify = !firstRun || (processedIds.size > 0);

        for (const review of reviews) {
            if (processedIds.has(review.reviewId)) continue;

            // 1. Salvo nel Log Globale (GlobalSettings)
            await GlobalSettings.updateOne(
                { guildId: mainGuildId },
                { $push: { disboardReviewLog: { ...review, createdAt: new Date() } } },
                { upsert: true }
            );

            if (notify) {
                let rewardResult = { success: false, user: null };
                if (mainGuild) {
                    const member = await findDiscordUser(mainGuild, review.authorName);
                    if (member) {
                        const profile = await ActivityUserProfile.findOne({ guildId: mainGuildId, userId: member.id });
                        const alreadyDone = profile?.reviewRewards?.some(r => r.rewardedAt) || profile?.reviewReward?.rewardedAt;

                        if (!alreadyDone) {
                            const currentExp = Number(profile?.exp?.totalExp || 0);
                            const currentLevel = getLevelInfo(currentExp).level;
                            const targetExp = getTotalExpForLevel(currentLevel + 5);
                            const addedExp = Math.max(0, targetExp - currentExp);

                            if (addedExp > 0) {
                                await addExpWithLevel(mainGuild, member.id, addedExp, false, false);
                                await ActivityUserProfile.updateOne(
                                    { guildId: mainGuildId, userId: member.id },
                                    { 
                                        $push: { reviewRewards: { ...review, rewardedAt: new Date() } },
                                        $set: { "reviewReward.rewardedAt": new Date(), "reviewReward.rewardedBy": client.user.id }
                                    },
                                    { upsert: true }
                                );
                                rewardResult = { success: true, user: member };
                            }
                        } else {
                            rewardResult = { success: false, alreadyDone: true, user: member };
                        }
                    }
                }
                await sendReviewNotification(client, review, rewardResult);
            }
        }
        if (firstRun) firstRun = false;
    } catch (err) {
        const status = err?.statusCode || err?.response?.status || null;
        const body = typeof err?.error === 'string' ? err.error
            : (typeof err?.message === 'string' ? err.message : String(err || ''));
        const isCfBlock = status === 403 || status === 429
            || body.includes('Just a moment')
            || body.includes('cf_chl_opt')
            || body.includes('Enable JavaScript and cookies');
        if (isCfBlock) {
            global.logger?.warn?.(`[DISBOARD REVIEWS] Bloccato da Cloudflare (IP datacenter) — riprovo tra ${client.config?.disboardReviews?.checkIntervalMinutes || 15} min.`);
        } else {
            global.logger?.error?.('[DISBOARD REVIEWS] Unexpected error:', body.slice(0, 200));
        }
    } finally { isChecking = false; }
}

async function sendReviewNotification(client, review, reward) {
    try {
        const config = client.config.disboardReviews;
        const channel = client.channels.cache.get(config.channelId) || await client.channels.fetch(config.channelId).catch(() => null);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor("#6f4e37")
            .setAuthor({ name: `Nuova recensione da ${review.authorName}`, iconURL: review.authorAvatar || "https://disboard.org/images/no-icon.png", url: config.reviewUrl })
            .setTitle(review.title ? `"${review.title}"` : "Valutazione DISBOARD")
            .setURL(config.reviewUrl)
            .setThumbnail(review.authorAvatar || "https://disboard.org/images/no-icon.png")
            .setDescription(`**Valutazione:** ${"⭐".repeat(review.stars)}\n\n> ${review.body.substring(0, 1500)}${review.body.length > 1500 ? '...' : ''}`)
            .addFields(
                { name: "<:VC_Dot:1482532364222595303> Info", value: `<:VC_bump:1482531857521311885> Inviata: **${review.postedAt}**`, inline: true },
                { name: "<:VC_Dot:1482532364222595303> Link", value: `[Vai alla recensione](<${config.reviewUrl}>)`, inline: true }
            );

        if (reward.success) {
            embed.addFields({ name: "<:VC_LevelUp2:1482527047871107143> Ricompensa Automatica", value: `<a:VC_StarPink:1330194976440848500> Grazie **${reward.user}**, ti sono stati assegnati **+5 livelli** per il tuo supporto!`, inline: false });
        } else if (reward.user && reward.alreadyDone) {
            embed.addFields({ name: "<:VC_Dot:1482532364222595303> Supporto", value: `Bentornato/a **${reward.user}**! Grazie per essere passato/a a trovarci di nuovo!`, inline: false });
        } else if (!reward.user) {
            embed.addFields({ name: "<:VC_Dot:1482532364222595303> Ricompensa", value: `Non abbiamo trovato l'account Discord di **${review.authorName}**. Se sei tu, scrivi allo staff per i **+5 livelli**!`, inline: false });
        }

        embed.setFooter({ text: "Vinili & Caffè • Feedback Community", iconURL: client.user.displayAvatarURL() }).setTimestamp();
        await channel.send({ content: reward.user ? `${reward.user}` : `<a:VC_HeartBlue:1448673354751021190> **Nuova recensione!**`, embeds: [embed] });
    } catch (err) {}
}

function startReviewLoop(client) {
    if (!client.config.disboardReviews?.enabled) return;
    checkNewReviews(client);
    const i = setInterval(() => checkNewReviews(client), (client.config.disboardReviews.checkIntervalMinutes || 2) * 60000);
    if (i.unref) i.unref();
    return i;
}

module.exports = { checkNewReviews, startReviewLoop };
