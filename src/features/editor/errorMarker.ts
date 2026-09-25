// Red wavy underline for the statement range a failed query reported.

import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type TransactionSpec,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

import { clampRange } from "./editorHelpers";
import type { EditorErrorMarker } from "./types";

/** CSS class applied to the marked range; styled by the editor theme. */
export const ERROR_MARKER_CLASS = "cm-errorMarker";

/** Replaces the current marker (`null` clears it). */
export const setErrorMarkerEffect = StateEffect.define<EditorErrorMarker | null>();

function buildDecorations(state: EditorState, marker: EditorErrorMarker | null): DecorationSet {
  if (marker === null) return Decoration.none;
  const length = state.doc.length;
  let { from, to } = clampRange(marker.from, marker.to, length);
  // Mark decorations cannot be empty: widen a collapsed range by one character when possible.
  if (from === to) {
    if (to < length) to += 1;
    else if (from > 0) from -= 1;
    else return Decoration.none;
  }
  const mark = Decoration.mark({
    class: ERROR_MARKER_CLASS,
    attributes: { title: marker.message },
  });
  return Decoration.set([mark.range(from, to)]);
}

const errorMarkerField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setErrorMarkerEffect)) next = buildDecorations(transaction.state, effect.value);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Extension holding the error marker decoration. */
export function errorMarker(): Extension {
  return errorMarkerField;
}

/** Transaction that sets or clears the marker. */
export function setErrorMarker(marker: EditorErrorMarker | null): TransactionSpec {
  return { effects: setErrorMarkerEffect.of(marker) };
}
