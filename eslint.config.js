// @ts-check
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  {
    ...js.configs.recommended,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      globals: {
        ...(js.configs.recommended.languageOptions && js.configs.recommended.languageOptions.globals ? js.configs.recommended.languageOptions.globals : {}),
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        HTMLElement: "readonly",
        HTMLDivElement: "readonly",
        ResizeObserver: "readonly",
        KeyboardEvent: "readonly",
        URLSearchParams: "readonly",
        crypto: "readonly",
        console: "readonly"
      }
    }
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "semi": ["error", "always"],
      "quotes": ["error", "double"]
    },
  },
  {
    files: ["**/*.jsx", "**/*.tsx"],
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off"
    },
    settings: {
      react: { version: "detect" }
    }
  }
];
