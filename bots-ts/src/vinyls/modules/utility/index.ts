import type { Client } from "discord.js";
import { registerPrefixCommand } from "../../prefix/registry";
import { afkCommand, attachAfkListeners } from "./afk";
import { avatarCommand, bannerCommand } from "./avatar";
import { clipCommand, myclipCommand } from "./clip";
import { helpCommand } from "./help";
import { registerHelpNavInteractions } from "./helpNav";
import { inviteCommand } from "./invite";
import { invitesCommand } from "./invites";
import { pingCommand } from "./ping";
import { quoteCommand } from "./quote";
import { myquoteCommand, myrepostCommand, repostCommand } from "./repost";
import { attachSnipeListener, snipeCommand } from "./snipe";

export interface UtilityModuleOptions {
  vinylsExtras?: boolean;
}

export function registerUtilityModule(client?: Client, options: UtilityModuleOptions = {}): void {
  registerPrefixCommand(pingCommand);
  registerPrefixCommand(helpCommand);
  registerHelpNavInteractions();

  if (options.vinylsExtras) {
    registerPrefixCommand(afkCommand);
    registerPrefixCommand(snipeCommand);
    registerPrefixCommand(avatarCommand);
    registerPrefixCommand(bannerCommand);
    registerPrefixCommand(inviteCommand);
    registerPrefixCommand(invitesCommand);
    registerPrefixCommand(quoteCommand);
    registerPrefixCommand(myquoteCommand);
    registerPrefixCommand(repostCommand);
    registerPrefixCommand(myrepostCommand);
    registerPrefixCommand(clipCommand);
    registerPrefixCommand(myclipCommand);
    if (client) {
      attachAfkListeners(client);
      attachSnipeListener(client);
    }
  }
}
