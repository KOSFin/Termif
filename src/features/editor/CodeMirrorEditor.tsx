import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { getLanguageExtension } from "./languageMap";
import { buildEditorTheme } from "./editorTheme";

interface CodeMirrorEditorProps {
  content: string;
  languageId: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onCursorChange?: (line: number, col: number) => void;
}

export function CodeMirrorEditor({ content, languageId, readOnly, onChange, onCursorChange }: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onCursorRef = useRef(onCursorChange);

  onChangeRef.current = onChange;
  onCursorRef.current = onCursorChange;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const lc = langCompartment.current;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && onChangeRef.current) {
        onChangeRef.current(update.state.doc.toString());
      }
      if (update.selectionSet && onCursorRef.current) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        onCursorRef.current(line.number, pos - line.from + 1);
      }
    });

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      foldGutter(),
      drawSelection(),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      ...buildEditorTheme(),
      updateListener,
      lc.of([]),
    ];

    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true));
    }

    const state = EditorState.create({ doc: content, extensions });
    const view = new EditorView({ state, parent: el });
    viewRef.current = view;

    // Load language extension async
    void getLanguageExtension(languageId).then((lang) => {
      if (lang && viewRef.current) {
        viewRef.current.dispatch({
          effects: lc.reconfigure(lang),
        });
      }
    });

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Recreate editor when language or readOnly changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageId, readOnly]);

  // Sync content from props (e.g., after save resets dirty state)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== content) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: content },
      });
    }
  }, [content]);

  return <div ref={containerRef} className="codemirror-container" />;
}
