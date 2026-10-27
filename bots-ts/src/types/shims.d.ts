declare module "ffmpeg-static" {
  const path: string | null;
  export default path;
}

declare module "prism-media" {
  import { Transform } from "node:stream";
  export class FFmpeg extends Transform {
    constructor(options?: {
      args?: string[];
      shell?: boolean;
      command?: string;
    });
  }
  export class Decoder extends Transform {
    constructor(options: { rate: number; channels: number; frameSize: number });
  }
  const prism: {
    FFmpeg: typeof FFmpeg;
    opus: { Decoder: typeof Decoder };
  };
  export default prism;
}

declare module "@napi-rs/canvas" {
  interface NapiCtx {
    fillStyle: string | { addColorStop(offset: number, color: string): void };
    strokeStyle: string;
    lineWidth: number;
    font: string;
    textAlign: string;
    textBaseline: string;
    createLinearGradient(x0: number, y0: number, x1: number, y1: number): {
      addColorStop(offset: number, color: string): void;
    };
    fillRect(x: number, y: number, w: number, h: number): void;
    beginPath(): void;
    moveTo(x: number, y: number): void;
    arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
    closePath(): void;
    fill(): void;
    stroke(): void;
    arc(x: number, y: number, r: number, a0: number, a1: number): void;
    fillText(text: string, x: number, y: number): void;
  }
  export function createCanvas(
    width: number,
    height: number,
  ): {
    getContext(type: "2d"): NapiCtx & {
      save(): void;
      restore(): void;
      clip(): void;
      drawImage(img: unknown, x: number, y: number, w: number, h: number): void;
    };
    toBuffer(mime: string): Buffer;
  };
  export function loadImage(src: string): Promise<unknown>;
}
