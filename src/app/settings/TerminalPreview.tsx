export interface TerminalColorScheme {
  id: string;
  name: string;
  colors: {
    black: string; red: string; green: string; yellow: string;
    blue: string; magenta: string; cyan: string; white: string;
    brightBlack: string; brightRed: string; brightGreen: string; brightYellow: string;
    brightBlue: string; brightMagenta: string; brightCyan: string; brightWhite: string;
    background: string; foreground: string; cursor: string; selection: string;
  };
}

export const TERMINAL_COLOR_SCHEMES: TerminalColorScheme[] = [
  {
    id: "one_dark", name: "One Dark",
    colors: {
      black: "#1a1d23", red: "#e06c75", green: "#98c379", yellow: "#e5c07b",
      blue: "#61afef", magenta: "#c678dd", cyan: "#56b6c2", white: "#abb2bf",
      brightBlack: "#636d83", brightRed: "#ff7a8c", brightGreen: "#b5e890", brightYellow: "#f5c06a",
      brightBlue: "#7ec8ff", brightMagenta: "#d896f0", brightCyan: "#82ccdf", brightWhite: "#e6e8ee",
      background: "#1a1d23", foreground: "#abb2bf", cursor: "#61afef", selection: "#2c313a",
    },
  },
  {
    id: "solarized_dark", name: "Solarized Dark",
    colors: {
      black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900",
      blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5",
      brightBlack: "#586e75", brightRed: "#cb4b16", brightGreen: "#859900", brightYellow: "#b58900",
      brightBlue: "#268bd2", brightMagenta: "#6c71c4", brightCyan: "#2aa198", brightWhite: "#fdf6e3",
      background: "#002b36", foreground: "#839496", cursor: "#839496", selection: "#073642",
    },
  },
  {
    id: "dracula", name: "Dracula",
    colors: {
      black: "#21222c", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c",
      blue: "#bd93f9", magenta: "#ff79c6", cyan: "#8be9fd", white: "#f8f8f2",
      brightBlack: "#6272a4", brightRed: "#ff6e6e", brightGreen: "#69ff94", brightYellow: "#ffffa5",
      brightBlue: "#d6acff", brightMagenta: "#ff92df", brightCyan: "#a4ffff", brightWhite: "#ffffff",
      background: "#282a36", foreground: "#f8f8f2", cursor: "#f8f8f2", selection: "#44475a",
    },
  },
  {
    id: "gruvbox", name: "Gruvbox Dark",
    colors: {
      black: "#282828", red: "#cc241d", green: "#98971a", yellow: "#d79921",
      blue: "#458588", magenta: "#b16286", cyan: "#689d6a", white: "#a89984",
      brightBlack: "#928374", brightRed: "#fb4934", brightGreen: "#b8bb26", brightYellow: "#fabd2f",
      brightBlue: "#83a598", brightMagenta: "#d3869b", brightCyan: "#8ec07c", brightWhite: "#ebdbb2",
      background: "#282828", foreground: "#ebdbb2", cursor: "#ebdbb2", selection: "#3c3836",
    },
  },
  {
    id: "tokyo_night", name: "Tokyo Night",
    colors: {
      black: "#1a1b26", red: "#f7768e", green: "#9ece6a", yellow: "#e0af68",
      blue: "#7aa2f7", magenta: "#bb9af7", cyan: "#7dcfff", white: "#a9b1d6",
      brightBlack: "#414868", brightRed: "#f7768e", brightGreen: "#9ece6a", brightYellow: "#e0af68",
      brightBlue: "#7aa2f7", brightMagenta: "#bb9af7", brightCyan: "#7dcfff", brightWhite: "#c0caf5",
      background: "#1a1b26", foreground: "#a9b1d6", cursor: "#c0caf5", selection: "#283457",
    },
  },
  {
    id: "catppuccin_mocha", name: "Catppuccin Mocha",
    colors: {
      black: "#45475a", red: "#f38ba8", green: "#a6e3a1", yellow: "#f9e2af",
      blue: "#89b4fa", magenta: "#f5c2e7", cyan: "#94e2d5", white: "#bac2de",
      brightBlack: "#585b70", brightRed: "#f38ba8", brightGreen: "#a6e3a1", brightYellow: "#f9e2af",
      brightBlue: "#89b4fa", brightMagenta: "#f5c2e7", brightCyan: "#94e2d5", brightWhite: "#a6adc8",
      background: "#1e1e2e", foreground: "#cdd6f4", cursor: "#f5e0dc", selection: "#45475a",
    },
  },
  {
    id: "tango", name: "Tango",
    colors: {
      black: "#2e3436", red: "#cc0000", green: "#4e9a06", yellow: "#c4a000",
      blue: "#3465a4", magenta: "#75507b", cyan: "#06989a", white: "#d3d7cf",
      brightBlack: "#555753", brightRed: "#ef2929", brightGreen: "#8ae234", brightYellow: "#fce94f",
      brightBlue: "#729fcf", brightMagenta: "#ad7fa8", brightCyan: "#34e2e2", brightWhite: "#eeeeec",
      background: "#2e3436", foreground: "#d3d7cf", cursor: "#d3d7cf", selection: "#4e5a5e",
    },
  },
  {
    id: "material", name: "Material",
    colors: {
      black: "#212121", red: "#f07178", green: "#c3e88d", yellow: "#ffcb6b",
      blue: "#82aaff", magenta: "#c792ea", cyan: "#89ddff", white: "#eeffff",
      brightBlack: "#4a4a4a", brightRed: "#f07178", brightGreen: "#c3e88d", brightYellow: "#ffcb6b",
      brightBlue: "#82aaff", brightMagenta: "#c792ea", brightCyan: "#89ddff", brightWhite: "#ffffff",
      background: "#263238", foreground: "#eeffff", cursor: "#ffcc00", selection: "#374349",
    },
  },
  {
    id: "nord_term", name: "Nord",
    colors: {
      black: "#3b4252", red: "#bf616a", green: "#a3be8c", yellow: "#ebcb8b",
      blue: "#81a1c1", magenta: "#b48ead", cyan: "#88c0d0", white: "#e5e9f0",
      brightBlack: "#4c566a", brightRed: "#bf616a", brightGreen: "#a3be8c", brightYellow: "#ebcb8b",
      brightBlue: "#81a1c1", brightMagenta: "#b48ead", brightCyan: "#8fbcbb", brightWhite: "#eceff4",
      background: "#2e3440", foreground: "#d8dee9", cursor: "#d8dee9", selection: "#434c5e",
    },
  },
  {
    id: "monokai_term", name: "Monokai",
    colors: {
      black: "#272822", red: "#f92672", green: "#a6e22e", yellow: "#f4bf75",
      blue: "#66d9ef", magenta: "#ae81ff", cyan: "#a1efe4", white: "#f8f8f2",
      brightBlack: "#75715e", brightRed: "#f92672", brightGreen: "#a6e22e", brightYellow: "#f4bf75",
      brightBlue: "#66d9ef", brightMagenta: "#ae81ff", brightCyan: "#a1efe4", brightWhite: "#f9f8f5",
      background: "#272822", foreground: "#f8f8f2", cursor: "#f8f8f0", selection: "#49483e",
    },
  },
];

interface TerminalPreviewProps {
  scheme: TerminalColorScheme;
  fontFamily?: string;
  fontSize?: number;
}

interface SampleLine {
  segments: Array<{ text: string; color: string; bold?: boolean }>;
}

function buildSampleLines(c: TerminalColorScheme["colors"]): SampleLine[] {
  return [
    {
      segments: [
        { text: "root", color: c.green, bold: true },
        { text: "@", color: c.foreground },
        { text: "server", color: c.cyan, bold: true },
        { text: ":", color: c.foreground },
        { text: "~", color: c.blue, bold: true },
        { text: "# ", color: c.foreground },
        { text: "ls --color", color: c.foreground },
      ],
    },
    {
      segments: [
        { text: "Documents  ", color: c.blue, bold: true },
        { text: "Downloads  ", color: c.blue, bold: true },
        { text: "script.sh  ", color: c.green, bold: true },
        { text: "config.yml  ", color: c.foreground },
        { text: "error.log", color: c.red },
      ],
    },
    {
      segments: [
        { text: "root", color: c.green, bold: true },
        { text: "@", color: c.foreground },
        { text: "server", color: c.cyan, bold: true },
        { text: ":", color: c.foreground },
        { text: "~", color: c.blue, bold: true },
        { text: "# ", color: c.foreground },
        { text: "git status", color: c.foreground },
      ],
    },
    {
      segments: [
        { text: "On branch ", color: c.foreground },
        { text: "main", color: c.magenta, bold: true },
      ],
    },
    {
      segments: [
        { text: "Changes not staged for commit:", color: c.yellow },
      ],
    },
    {
      segments: [
        { text: "  modified:   ", color: c.foreground },
        { text: "src/app.ts", color: c.red },
      ],
    },
    {
      segments: [
        { text: "  new file:   ", color: c.foreground },
        { text: "src/utils.ts", color: c.green },
      ],
    },
    {
      segments: [
        { text: "root", color: c.green, bold: true },
        { text: "@", color: c.foreground },
        { text: "server", color: c.cyan, bold: true },
        { text: ":", color: c.foreground },
        { text: "~", color: c.blue, bold: true },
        { text: "# ", color: c.foreground },
        { text: "\u2588", color: c.cursor },
      ],
    },
  ];
}

export function TerminalPreview({ scheme, fontFamily, fontSize }: TerminalPreviewProps) {
  const lines = buildSampleLines(scheme.colors);
  const font = fontFamily ?? "Cascadia Code, Fira Code, JetBrains Mono, Consolas, monospace";
  const size = fontSize ?? 12;

  return (
    <div
      className="terminal-preview-widget"
      style={{
        background: scheme.colors.background,
        fontFamily: font,
        fontSize: `${size}px`,
        lineHeight: 1.4,
      }}
    >
      {lines.map((line, li) => (
        <div key={li} className="terminal-preview-line">
          {line.segments.map((seg, si) => (
            <span
              key={si}
              style={{
                color: seg.color,
                fontWeight: seg.bold ? 700 : 400,
              }}
            >
              {seg.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
