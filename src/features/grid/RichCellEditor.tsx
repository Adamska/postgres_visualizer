// Plain text editor Glide shows over a rich cell being edited.

import type { ProvideEditorComponent } from "@glideapps/glide-data-grid";
import { useEffect, useRef, useState } from "react";

import type { RichGridCell } from "./richCell";

/** Plain text editor for the raw value, styled like Glide's own text editor. */
export const RichCellEditor: ProvideEditorComponent<RichGridCell> = ({
  value,
  onChange,
  onFinishedEditing,
  initialValue,
}) => {
  const [text, setText] = useState(initialValue ?? value.data.raw);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    element.focus();
    const end = element.value.length;
    element.setSelectionRange(end, end);
  }, []);
  const update = (next: string) => {
    setText(next);
    onChange({ ...value, data: { ...value.data, raw: next } });
  };
  return (
    <input
      ref={input}
      value={text}
      spellCheck={false}
      onChange={(event) => update(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onFinishedEditing({ ...value, data: { ...value.data, raw: text } }, [0, 1]);
        }
      }}
      className="h-full w-full min-w-40 bg-transparent px-2 py-1 font-mono text-[12.5px] text-fg outline-none"
    />
  );
};
