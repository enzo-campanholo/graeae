// What every area of the socket protocol shares.

/**
 * What an area does with a change it does not know, such as one from a newer instance:
 * nothing. Typed `never`, so an area that forgets to handle one of its own changes does
 * not compile.
 */
export function unknownChange<T>(state: T, change: never): T {
  void change;
  return state;
}
