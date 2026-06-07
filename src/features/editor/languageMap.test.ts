import { describe, expect, it } from "vitest";
import { detectLanguage } from "@/features/editor/languageMap";

describe("detectLanguage", () => {
  it("detects common extensions case-insensitively", () => {
    expect(detectLanguage("APP.TSX")).toEqual({ id: "tsx", name: "TSX" });
    expect(detectLanguage("server.py")).toEqual({ id: "python", name: "Python" });
    expect(detectLanguage("schema.JSON")).toEqual({ id: "json", name: "JSON" });
  });

  it("detects special file names", () => {
    expect(detectLanguage("Dockerfile")).toEqual({ id: "dockerfile", name: "Dockerfile" });
    expect(detectLanguage(".env")).toEqual({ id: "ini", name: "Environment" });
  });

  it("falls back to plain text", () => {
    expect(detectLanguage("unknown.nope")).toEqual({ id: "plaintext", name: "Plain Text" });
  });
});
