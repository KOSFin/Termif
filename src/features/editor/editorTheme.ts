import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

function readCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function buildEditorTheme(): Extension[] {
  const bg = readCssVar("--bg", "#1a1d23");
  const bgElev1 = readCssVar("--bg-elev-1", "#21252b");
  const bgHover = readCssVar("--bg-hover", "#2c313a");
  const text = readCssVar("--text", "#abb2bf");
  const textMuted = readCssVar("--text-muted", "#636d83");
  const textBright = readCssVar("--text-bright", "#e6e8ee");
  const accent = readCssVar("--accent", "#61afef");
  const accent2 = readCssVar("--accent-2", "#98c379");
  const danger = readCssVar("--danger", "#e06c75");
  const warning = readCssVar("--warning", "#e5c07b");
  const stroke = readCssVar("--stroke", "#3a3f4b");

  const theme = EditorView.theme(
    {
      "&": {
        height: "100%",
        fontSize: "13px",
        color: text,
        backgroundColor: bg,
      },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily: "'Cascadia Code', 'JetBrains Mono', monospace",
      },
      ".cm-content": {
        caretColor: accent,
      },
      "&.cm-focused .cm-cursor": {
        borderLeftColor: accent,
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: bgHover,
      },
      ".cm-panels": {
        backgroundColor: bgElev1,
        color: text,
      },
      ".cm-panels.cm-panels-top": {
        borderBottom: `1px solid ${stroke}`,
      },
      ".cm-searchMatch": {
        backgroundColor: "rgba(97, 175, 239, 0.2)",
        outline: `1px solid ${accent}`,
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: "rgba(97, 175, 239, 0.35)",
      },
      ".cm-activeLine": {
        backgroundColor: `color-mix(in srgb, ${bgHover} 40%, transparent)`,
      },
      ".cm-selectionMatch": {
        backgroundColor: "rgba(97, 175, 239, 0.12)",
      },
      ".cm-matchingBracket, .cm-nonmatchingBracket": {
        backgroundColor: "rgba(97, 175, 239, 0.2)",
        outline: "1px solid rgba(97, 175, 239, 0.4)",
      },
      ".cm-gutters": {
        backgroundColor: bg,
        color: textMuted,
        border: "none",
      },
      ".cm-activeLineGutter": {
        backgroundColor: `color-mix(in srgb, ${bgHover} 40%, transparent)`,
        color: textBright,
      },
      ".cm-foldPlaceholder": {
        backgroundColor: "transparent",
        border: "none",
        color: textMuted,
      },
      ".cm-tooltip": {
        border: `1px solid ${stroke}`,
        backgroundColor: bgElev1,
        color: text,
      },
      ".cm-tooltip .cm-tooltip-arrow:before": {
        borderTopColor: "transparent",
        borderBottomColor: "transparent",
      },
      ".cm-tooltip .cm-tooltip-arrow:after": {
        borderTopColor: bgElev1,
        borderBottomColor: bgElev1,
      },
      ".cm-tooltip-autocomplete": {
        "& > ul > li[aria-selected]": {
          backgroundColor: bgHover,
          color: textBright,
        },
      },
    },
    { dark: true }
  );

  const highlightStyle = HighlightStyle.define([
    { tag: t.keyword, color: "#c678dd" },
    { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: danger },
    { tag: [t.function(t.variableName), t.labelName], color: accent },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: warning },
    { tag: [t.definition(t.name), t.separator], color: text },
    { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: warning },
    { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: "#56b6c2" },
    { tag: [t.meta, t.comment], color: textMuted },
    { tag: t.strong, fontWeight: "bold" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: t.link, color: textMuted, textDecoration: "underline" },
    { tag: t.heading, fontWeight: "bold", color: danger },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: warning },
    { tag: [t.processingInstruction, t.string, t.inserted], color: accent2 },
    { tag: t.invalid, color: textMuted },
  ]);

  return [theme, syntaxHighlighting(highlightStyle)];
}
