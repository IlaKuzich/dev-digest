/* YamlEditor — thin, presentational CodeMirror-6 wrapper for YAML content.
   Controlled (`value`/`onChange`), no business logic: the wizard's Preview
   step (T3) supplies `readOnly` for non-editable bundle files and drives
   YAML-parse/lint validation itself via `./lint`. Only `@codemirror/lang-yaml`
   and the `codemirror` meta-package (re-exports `EditorView`/`basicSetup`) are
   imported directly — `@codemirror/state` et al. are transitive and NOT
   resolvable as top-level imports under this repo's hoisted pnpm layout, so
   editor construction goes through `new EditorView({ doc, extensions, parent })`
   rather than building an `EditorState` by hand. */
"use client";

import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { yaml } from "@codemirror/lang-yaml";

export interface YamlEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  className?: string;
}

export function YamlEditor({ value, onChange, readOnly = false, className }: YamlEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Keep the latest onChange without recreating the view on every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      doc: value,
      extensions: [
        basicSetup,
        yaml(),
        EditorView.editable.of(!readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current?.(update.state.doc.toString());
        }),
      ],
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Recreate only when readOnly flips — `value` sync is handled below so a
    // controlled update doesn't blow away cursor position/undo history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  return <div ref={containerRef} className={className} data-testid="yaml-editor" />;
}
