// PostgreSQL language support with the app's own schema-aware completion source.

import {
  autocompletion,
  type Completion as CmCompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import type { Extension } from "@codemirror/state";

import type { Completion } from "@/core/completion/engine";

import { mapCompletionType, matchCase, wordContext } from "./editorHelpers";
import type { SqlEditorProps } from "./types";

/** Signature of the completion provider prop. */
export type CompletionProvider = NonNullable<SqlEditorProps["completionProvider"]>;

/** Holder read on every completion request so the source always sees the latest provider. */
export interface CompletionProviderRef {
  current: CompletionProvider | undefined;
}

/**
 * The PostgreSQL language (parsing, highlighting tags, `--` comment tokens, indentation).
 * Keyword completion from lang-sql is bypassed because `sqlCompletion` overrides every source.
 */
export function sqlLanguage(): Extension {
  return sql({ dialect: PostgreSQL, upperCaseKeywords: false });
}

/** Maps an app completion to a CodeMirror option; keywords follow the case the user typed. */
export function toCmCompletion(completion: Completion, prefix: string): CmCompletion {
  const apply = completion.kind === "keyword" ? matchCase(prefix, completion.text) : completion.text;
  const option: CmCompletion = {
    label: completion.text,
    apply,
    type: mapCompletionType(completion.kind),
  };
  if (completion.detail !== undefined) option.detail = completion.detail;
  return option;
}

/**
 * Builds the completion source. It looks at the current line only, extracts the identifier before
 * the caret and its qualifier, and asks the provider. It activates after typing at least one
 * identifier character or a `.`, and on explicit requests (Ctrl+Space).
 */
export function sqlCompletionSource(
  providerRef: CompletionProviderRef,
): (context: CompletionContext) => CompletionResult | null {
  return (context: CompletionContext): CompletionResult | null => {
    const provider = providerRef.current;
    if (!provider) return null;
    const line = context.state.doc.lineAt(context.pos);
    const { prefix, qualifier, from } = wordContext(line.text, context.pos - line.from);
    if (!context.explicit && prefix === "" && qualifier === null) return null;
    const options = provider(prefix, qualifier).map((c) => toCmCompletion(c, prefix));
    if (options.length === 0) return null;
    // The provider ranks and filters; CodeMirror must not reorder its result.
    return { from: line.from + from, options, filter: false };
  };
}

/** Autocompletion configured with the schema-aware source as the only one. */
export function sqlCompletion(providerRef: CompletionProviderRef): Extension {
  return autocompletion({
    override: [sqlCompletionSource(providerRef)],
    activateOnTyping: true,
    activateOnTypingDelay: 60,
    icons: true,
    maxRenderedOptions: 60,
  });
}
