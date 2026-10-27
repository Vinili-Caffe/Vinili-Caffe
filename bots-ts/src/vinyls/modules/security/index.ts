import type { Client } from "discord.js";
import { registerAntinukeModule } from "./antinuke";
import { registerJoinGate } from "./joingate";

export function registerSecurityModule(client: Client): void {
  registerAntinukeModule(client);
  registerJoinGate(client);
}
