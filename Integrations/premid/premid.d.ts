/**
 * Tipi minimi PreMiD per editare la presence fuori dal repo Activities.
 * Nel PR ufficiale i tipi arrivano da `@types/premid`.
 */
declare class Presence {
  constructor(options: { clientId: string, injectOnComplete?: boolean })
  on(eventName: 'UpdateData', callback: () => unknown): void
  getSetting<T = unknown>(setting: string): Promise<T>
  setActivity(data?: PresenceData): Promise<void>
  clearActivity(): void
}

interface PresenceData {
  name?: string
  details?: string
  state?: string
  largeImageKey?: string
  largeImageText?: string
  smallImageKey?: string
  smallImageText?: string
  startTimestamp?: number
  endTimestamp?: number
  buttons?: Array<{ label: string, url: string }>
}
