import { describe, test, expect } from "bun:test";
import { detectRealEncryption } from "./encryption";

describe("detectRealEncryption", () => {
  test("detects a real AES cipher as blocking", async () => {
    const bytes = new Uint8Array(await Bun.file("fixtures/encrypted-source.pdf").arrayBuffer());
    const info = detectRealEncryption(bytes);
    expect(info.encrypted).toBe(true);
    expect(info.blocking).toBe(true);
    expect(info.cipher).toBe("AESV2");
  });

  test("reports no encryption for an already-decrypted form", async () => {
    const bytes = new Uint8Array(await Bun.file("forms/income-and-assets/blank-form.pdf").arrayBuffer());
    const info = detectRealEncryption(bytes);
    expect(info.encrypted).toBe(false);
    expect(info.blocking).toBe(false);
  });
});
