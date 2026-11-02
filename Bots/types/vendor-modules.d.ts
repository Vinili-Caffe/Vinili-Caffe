/**
 * Ambient modules per l’IDE senza node_modules locale.
 * `export = any` → niente TS2307; mongoose espone anche Model/InferSchemaType.
 */
declare module "discord.js" { const mod: any; export = mod; }
declare module "discord-api-types" { const mod: any; export = mod; }
declare module "discord-api-types/v10" { const mod: any; export = mod; }
declare module "@discordjs/rest" { const mod: any; export = mod; }
declare module "@discordjs/voice" { const mod: any; export = mod; }
declare module "@discordjs/builders" { const mod: any; export = mod; }
declare module "@discordjs/collection" { const mod: any; export = mod; }
declare module "@discordjs/ws" { const mod: any; export = mod; }
declare module "@vladfrangu/async_event_emitter" { const mod: any; export = mod; }

declare module "mongoose" { const mod: any; export = mod; }

declare module "axios" { const mod: any; export = mod; }
declare module "ws" { const mod: any; export = mod; }
declare module "express" { const mod: any; export = mod; }
declare module "express-rate-limit" { const mod: any; export = mod; }
declare module "form-data" { const mod: any; export = mod; }
declare module "dotenv" { const mod: any; export = mod; }
declare module "node-cron" { const mod: any; export = mod; }
declare module "web-push" { const mod: any; export = mod; }
declare module "shoukaku" { const mod: any; export = mod; }
declare module "prism-media" { const mod: any; export = mod; }
declare module "ffmpeg-static" { const mod: any; export = mod; }
declare module "canvas" { const mod: any; export = mod; }
declare module "decode-gif" { const mod: any; export = mod; }
declare module "gif-encoder-2" { const mod: any; export = mod; }
declare module "ascii-table" { const mod: any; export = mod; }
declare module "emoji-name-map" { const mod: any; export = mod; }
declare module "node-emoji" { const mod: any; export = mod; }

declare module "fs/promises" { const mod: any; export = mod; }
