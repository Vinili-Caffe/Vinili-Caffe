"use client";

/** Store minimo per toast, dialog, lightbox ed emoji picker. */
export type Store<T> = {
  get: () => T;
  set: (next: T) => void;
  subscribe: (onChange: () => void) => () => void;
};

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      subs.forEach((fn) => fn());
    },
    subscribe: (onChange) => {
      subs.add(onChange);
      return () => subs.delete(onChange);
    },
  };
}
