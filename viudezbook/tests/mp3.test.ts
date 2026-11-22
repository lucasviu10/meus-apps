import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { duracaoMp3 } from "../supabase/functions/_shared/mp3.ts";

const ler = (n: string) => new Uint8Array(readFileSync(new URL(`./audios/${n}`, import.meta.url)));

describe("duracaoMp3", () => {
  it.each([
    ["tom0.mp3", 6.0, "44,1 kHz 128k (ElevenLabs)"],
    ["az.mp3", 7.5, "24 kHz 48k (Microsoft)"],
    ["gg.mp3", 4.2, "22 kHz 64k (Piper)"],
    ["vbr.mp3", 3.0, "qualidade variável"],
  ])("%s ≈ %ss (%s)", (arquivo, esperado) => {
    expect(Math.abs(duracaoMp3(ler(arquivo)) - esperado)).toBeLessThan(0.15);
  });
});
