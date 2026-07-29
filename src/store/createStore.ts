import { useRef, useSyncExternalStore } from 'react'

type Listener = () => void
type Setter<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void
type Creator<T> = (set: Setter<T>, get: () => T) => T

export function create<T extends object>(creator: Creator<T>): {
  <U>(selector: (state: T) => U): U
  (): T
  getState: () => T
  setState: Setter<T>
} {
  let state: T
  const listeners = new Set<Listener>()

  const get = (): T => state
  const set: Setter<T> = (partial) => {
    const next = typeof partial === 'function' ? partial(state) : partial
    state = { ...state, ...next }
    listeners.forEach((l) => l())
  }

  state = creator(set, get)

  function subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function useStore(): T
  function useStore<U>(selector: (state: T) => U): U
  function useStore<U>(selector?: (state: T) => U): T | U {
    const snapshot = useSyncExternalStore(subscribe, get, get)
    const selectorRef = useRef(selector)
    selectorRef.current = selector

    if (selectorRef.current) {
      return selectorRef.current(snapshot)
    }
    return snapshot
  }

  useStore.getState = get
  useStore.setState = set

  return useStore
}
