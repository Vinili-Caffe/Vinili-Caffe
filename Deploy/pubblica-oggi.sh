#!/usr/bin/env bash
# Pubblica sulla VPS tutti i fix del bot dell'8-9/11 (dashboard, ticket, mute, compiti, Premium) in un colpo solo.
# Gli argomenti sono qui dentro: da PowerShell non servono virgolette annidate (che PowerShell rovina).
# Uso (PowerShell):
#   & "C:\Program Files\Git\bin\bash.exe" -lc 'cd /c/Users/corva/Desktop/Vinili*/Deploy && bash pubblica-oggi.sh'
set -euo pipefail
cd "$(dirname "$0")"

FILES="
MultiGuild/core/tenantCommandAcl.ts
MultiGuild/site/dashboard/dashboardRoutes.ts
MultiGuild/site/dashboard/siteDashboardApi.ts
MultiGuild/site/dashboard/siteDashboardGuildCommandsApi.ts
MultiGuild/site/dashboard/siteDashboardGuildSettingsApi.ts
MultiGuild/tickets/dashboard/dashboardTicketRoutes.ts
MultiGuild/tickets/dashboard/siteDashboardTicketsApi.ts
Vinili/Community/events/guildMemberRemove.ts
Vinili/Community/services/premiumCreditsService.ts
Vinili/Community/services/publicVoiceHubService.ts
Vinili/Moderation/services/mutedMirrorRoleService.ts
Vinili/Staff/services/resocontoAutoValEnsure.ts
Vinili/site/http/webhooks/publicMiscRoutes.ts
Vinili/site/staff/compitiCalendar.ts
Vinili/site/staff/compitiTicks.ts
Vinili/site/staff/siteStaffCompitiApi.ts
Vinili/site/staff/siteStaffCompitiAutoComplete.ts
Vinili/site/staff/siteStaffCompitiNotifications.ts
"

bash pubblica.sh "$(echo $FILES)" "bots-vinyls bot-workers site-api"
