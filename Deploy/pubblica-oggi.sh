#!/usr/bin/env bash
# Pubblica sulla VPS tutti i fix del bot dell'8-9/11 (dashboard, ticket, mute, compiti, Premium, pannello sviluppatore, emoji nei canvas, transcript) in un colpo solo.
# Gli argomenti sono qui dentro: da PowerShell non servono virgolette annidate (che PowerShell rovina).
# Uso (PowerShell):
#   & "C:\Program Files\Git\bin\bash.exe" -lc 'cd /c/Users/corva/Desktop/Vinili*/Deploy && bash pubblica-oggi.sh'
set -euo pipefail
cd "$(dirname "$0")"

FILES="
MultiGuild/core/tenantCommandAcl.ts
MultiGuild/schemas/guildFeatureBucketSchema.ts
MultiGuild/site/dashboard/dashboardAuditLog.ts
MultiGuild/site/dashboard/dashboardRoutes.ts
MultiGuild/site/dashboard/dashboardStatsApi.ts
MultiGuild/site/dashboard/siteDashboardGuildConfigApi.ts
MultiGuild/site/dashboard/siteDashboardApi.ts
MultiGuild/site/dashboard/siteDashboardBotDevApi.ts
MultiGuild/site/dashboard/siteDashboardGuildCommandsApi.ts
MultiGuild/site/dashboard/siteDashboardGuildSettingsApi.ts
MultiGuild/tickets/dashboard/dashboardTicketRoutes.ts
MultiGuild/tickets/dashboard/siteDashboardTicketsApi.ts
MultiGuild/tickets/tenant/tenantTicketSettings.ts
MultiGuild/tickets/transcript/transcriptRender.ts
MultiGuild/tickets/transcript/transcriptStyles.ts
MultiGuild/tickets/transcript/ticketMaintenanceService.ts
MultiGuild/discord/slash/Ticket/risposta.ts
MultiGuild/discord/slash/Partnership/partnership.ts
MultiGuild/discord/slash/Partnership/partnershipContext.ts
MultiGuild/discord/slash/Partnership/delete.ts
MultiGuild/discord/prefix/Bacheca/quote.ts
MultiGuild/discord/prefix/Bacheca/repost.ts
MultiGuild/discord/prefix/Bacheca/clip.ts
MultiGuild/discord/prefix/Partnership/description.ts
MultiGuild/discord/prefix/Partnership/setup.ts
MultiGuild/discord/prefix/Partnership/profile.ts
MultiGuild/discord/prefix/Partnership/blacklist.ts
MultiGuild/discord/prefix/Partnership/badges.ts
MultiGuild/discord/prefix/Partnership/history.ts
MultiGuild/discord/prefix/Partnership/invite.ts
MultiGuild/discord/prefix/Partnership/points.ts
MultiGuild/discord/prefix/Partnership/random.ts
MultiGuild/discord/prefix/Partnership/leaderboard.ts
MultiGuild/discord/prefix/Partnership/settings.ts
MultiGuild/discord/prefix/Utility/help.ts
MultiGuild/core/openMediaCommands.ts
MultiGuild/core/tenantCommandAcl.ts
MultiGuild/utils/tenantHelp.ts
Vinili/core/handlers/prefixHandler.ts
Vinili/core/handlers/commandHandler.ts
Vinili/Community/events/guildMemberRemove.ts
Vinili/Community/services/premiumCreditsService.ts
Vinili/Community/utils/Render/canvasEmojiRichText.ts
Vinili/Community/utils/Render/canvasFonts.ts
Vinili/Community/utils/Render/quoteCanvas.ts
Vinili/Community/utils/Render/shipCanvas.ts
Vinili/Community/utils/Render/skullboardCanvas.ts
Vinili/Community/services/publicVoiceHubService.ts
Vinili/Moderation/services/botGuildLifecycleLogService.ts
Vinili/Moderation/services/botUsageBlacklistService.ts
Vinili/Moderation/services/mutedMirrorRoleService.ts
Vinili/Staff/services/resocontoAutoValEnsure.ts
Vinili/site/http/siteWebhookRoutes.ts
Vinili/site/http/webhooks/publicMiscRoutes.ts
Vinili/site/staff/compitiCalendar.ts
Vinili/site/staff/compitiTicks.ts
Vinili/site/staff/siteStaffCompitiApi.ts
Vinili/site/staff/siteStaffCompitiAutoComplete.ts
Vinili/site/staff/siteStaffCompitiNotifications.ts
"

bash pubblica.sh "$(echo $FILES)" "bots-vinyls bot-workers site-api"
