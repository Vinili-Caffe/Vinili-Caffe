export interface QueueTrack {
  title: string;
  requestedBy: string;
  uri?: string;
  /** Base64 Lavalink encoded track — required for voice play. */
  encoded?: string;
  author?: string;
  lengthMs?: number;
}

export type RepeatMode = "off" | "track" | "queue";

export interface GuildMusicSession {
  guildId: string;
  voiceChannelId: string | null;
  textChannelId: string | null;
  queue: QueueTrack[];
  playing: QueueTrack | null;
  history: QueueTrack[];
  paused: boolean;
  volume: number;
  repeat: RepeatMode;
}

const sessions = new Map<string, GuildMusicSession>();

export function getSession(guildId: string): GuildMusicSession {
  let s = sessions.get(guildId);
  if (!s) {
    s = {
      guildId,
      voiceChannelId: null,
      textChannelId: null,
      queue: [],
      playing: null,
      history: [],
      paused: false,
      volume: 100,
      repeat: "off",
    };
    sessions.set(guildId, s);
  }
  return s;
}

export function clearSession(guildId: string): void {
  sessions.delete(guildId);
}

export function isLavalinkReady(): boolean {
  return process.env.VC_TS_LAVALINK === "1" && Boolean(process.env.LAVALINK_HOST);
}
