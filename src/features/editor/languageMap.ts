import type { LanguageSupport } from "@codemirror/language";

export interface LanguageInfo {
  id: string;
  name: string;
}

const extMap: Record<string, LanguageInfo> = {
  js: { id: "javascript", name: "JavaScript" },
  mjs: { id: "javascript", name: "JavaScript" },
  cjs: { id: "javascript", name: "JavaScript" },
  jsx: { id: "jsx", name: "JSX" },
  ts: { id: "typescript", name: "TypeScript" },
  mts: { id: "typescript", name: "TypeScript" },
  cts: { id: "typescript", name: "TypeScript" },
  tsx: { id: "tsx", name: "TSX" },
  py: { id: "python", name: "Python" },
  rs: { id: "rust", name: "Rust" },
  json: { id: "json", name: "JSON" },
  html: { id: "html", name: "HTML" },
  htm: { id: "html", name: "HTML" },
  css: { id: "css", name: "CSS" },
  scss: { id: "css", name: "SCSS" },
  less: { id: "css", name: "LESS" },
  md: { id: "markdown", name: "Markdown" },
  mdx: { id: "markdown", name: "MDX" },
  java: { id: "java", name: "Java" },
  cpp: { id: "cpp", name: "C++" },
  cc: { id: "cpp", name: "C++" },
  cxx: { id: "cpp", name: "C++" },
  c: { id: "cpp", name: "C" },
  h: { id: "cpp", name: "C Header" },
  hpp: { id: "cpp", name: "C++ Header" },
  php: { id: "php", name: "PHP" },
  sql: { id: "sql", name: "SQL" },
  xml: { id: "xml", name: "XML" },
  svg: { id: "xml", name: "SVG" },
  yaml: { id: "yaml", name: "YAML" },
  yml: { id: "yaml", name: "YAML" },
  toml: { id: "toml", name: "TOML" },
  sh: { id: "shell", name: "Shell" },
  bash: { id: "shell", name: "Bash" },
  zsh: { id: "shell", name: "Zsh" },
  go: { id: "go", name: "Go" },
  rb: { id: "ruby", name: "Ruby" },
  swift: { id: "swift", name: "Swift" },
  kt: { id: "kotlin", name: "Kotlin" },
  cs: { id: "csharp", name: "C#" },
  ps1: { id: "powershell", name: "PowerShell" },
  psm1: { id: "powershell", name: "PowerShell" },
  bat: { id: "batch", name: "Batch" },
  cmd: { id: "batch", name: "Batch" },
  dockerfile: { id: "dockerfile", name: "Dockerfile" },
  makefile: { id: "makefile", name: "Makefile" },
  ini: { id: "ini", name: "INI" },
  cfg: { id: "ini", name: "Config" },
  conf: { id: "ini", name: "Config" },
  log: { id: "plaintext", name: "Log" },
  txt: { id: "plaintext", name: "Plain Text" },
};

const nameMap: Record<string, LanguageInfo> = {
  dockerfile: { id: "dockerfile", name: "Dockerfile" },
  makefile: { id: "makefile", name: "Makefile" },
  cmakelists: { id: "makefile", name: "CMake" },
  ".gitignore": { id: "plaintext", name: "Git Ignore" },
  ".env": { id: "ini", name: "Environment" },
};

export function detectLanguage(filename: string): LanguageInfo {
  const lower = filename.toLowerCase();

  const nameMatch = nameMap[lower];
  if (nameMatch) return nameMatch;

  const dotIdx = lower.lastIndexOf(".");
  if (dotIdx >= 0) {
    const ext = lower.slice(dotIdx + 1);
    const extMatch = extMap[ext];
    if (extMatch) return extMatch;
  }

  return { id: "plaintext", name: "Plain Text" };
}

export const allLanguages: LanguageInfo[] = [
  { id: "plaintext", name: "Plain Text" },
  { id: "javascript", name: "JavaScript" },
  { id: "typescript", name: "TypeScript" },
  { id: "jsx", name: "JSX" },
  { id: "tsx", name: "TSX" },
  { id: "python", name: "Python" },
  { id: "rust", name: "Rust" },
  { id: "json", name: "JSON" },
  { id: "html", name: "HTML" },
  { id: "css", name: "CSS" },
  { id: "markdown", name: "Markdown" },
  { id: "java", name: "Java" },
  { id: "cpp", name: "C++" },
  { id: "php", name: "PHP" },
  { id: "sql", name: "SQL" },
  { id: "xml", name: "XML" },
];

export async function getLanguageExtension(langId: string): Promise<LanguageSupport | null> {
  switch (langId) {
    case "javascript":
    case "jsx": {
      const { javascript } = await import("@codemirror/lang-javascript");
      return javascript({ jsx: langId === "jsx" });
    }
    case "typescript":
    case "tsx": {
      const { javascript } = await import("@codemirror/lang-javascript");
      return javascript({ jsx: langId === "tsx", typescript: true });
    }
    case "python": {
      const { python } = await import("@codemirror/lang-python");
      return python();
    }
    case "rust": {
      const { rust } = await import("@codemirror/lang-rust");
      return rust();
    }
    case "json": {
      const { json } = await import("@codemirror/lang-json");
      return json();
    }
    case "html": {
      const { html } = await import("@codemirror/lang-html");
      return html();
    }
    case "css": {
      const { css } = await import("@codemirror/lang-css");
      return css();
    }
    case "markdown": {
      const { markdown } = await import("@codemirror/lang-markdown");
      return markdown();
    }
    case "java": {
      const { java } = await import("@codemirror/lang-java");
      return java();
    }
    case "cpp": {
      const { cpp } = await import("@codemirror/lang-cpp");
      return cpp();
    }
    case "php": {
      const { php } = await import("@codemirror/lang-php");
      return php();
    }
    case "sql": {
      const { sql } = await import("@codemirror/lang-sql");
      return sql();
    }
    case "xml": {
      const { xml } = await import("@codemirror/lang-xml");
      return xml();
    }
    default:
      return null;
  }
}
