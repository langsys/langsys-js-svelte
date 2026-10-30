import { derived, type Readable } from 'svelte/store';
import { renderServerMessage, tSignal, type ServerMessage } from 'langsys-js-typescript';

/** Renders one server message entry, optionally under a category other than the configured one. */
export type ServerMessageFn = (entry: ServerMessage, category?: string) => string;

/**
 * Server message entries as a Svelte store — read with `{$serverMessage(entry)}`.
 *
 * Every call goes to the core's `renderServerMessage`, which owns the decision: the entry's
 * `template` rendered through `t()` under the messages category (`Errors` unless `init()` set
 * `messagesCategory`) when the catalog holds a translation for it, and the entry's `message`
 * otherwise. `message` is never looked up. Nothing here re-decides any of that.
 *
 * What this adds is reactivity. The store is derived from `t`, so it re-emits a fresh
 * function whenever the catalog or the locale changes, and a template reading
 * `$serverMessage(entry)` re-renders exactly as one reading `$t(...)` does. Calling
 * `renderServerMessage(entry)` directly in markup renders once and never updates.
 */
export const serverMessage: Readable<ServerMessageFn> = derived(
    tSignal,
    () => (entry: ServerMessage, category?: string) => renderServerMessage(entry, category)
);
