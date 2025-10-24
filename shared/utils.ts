import { type FirestoreKey, FirestoreDocumentError } from './types.js';

/**
 * Performs deep equality comparison for objects, arrays, and primitives
 * @param a - First value to compare
 * @param b - Second value to compare
 * @returns true if values are deeply equal, false otherwise
 * @example
 * deepEqual({ a: 1 }, { a: 1 }) // true
 * deepEqual([1, 2], [1, 2]) // true
 * deepEqual(new Date('2023-01-01'), new Date('2023-01-01')) // true
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (Array.isArray(a) || Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) => deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/**
 * Parses a Firestore path into a structured key
 *
 * If pathTemplate is provided, extracts key components based on template placeholders.
 * Otherwise, returns path segments as a string array.
 *
 * @param path - Firestore path to parse
 * @param pathTemplate - Optional path template with placeholders (e.g., "users/{userId}/posts/{postId}")
 * @returns Parsed key object matching template placeholders, or string array of path segments
 * @throws {FirestoreDocumentError} If path doesn't match the pathTemplate structure
 * @example
 * // With template
 * parseKey('users/123/posts/456', 'users/{userId}/posts/{postId}')
 * // => { userId: '123', postId: '456' }
 *
 * // Without template
 * parseKey('users/123/posts/456')
 * // => ['users', '123', 'posts', '456']
 */
export function parseKey<Key extends FirestoreKey>(path: string, pathTemplate?: string): Key | string[] {
  const pathParts = path.split('/').filter((p) => p);

  if (!pathTemplate) {
    return pathParts;
  }

  const templateParts = pathTemplate.split('/').filter((p) => p);

  if (templateParts.length !== pathParts.length) {
    throw new FirestoreDocumentError(`Path "${path}" does not match template "${pathTemplate}": length mismatch`);
  }

  const key: Record<string, string> = {};

  for (let i = 0; i < templateParts.length; i++) {
    const template = templateParts[i];
    if (template.startsWith('{') && template.endsWith('}')) {
      const keyName = template.slice(1, -1);
      key[keyName] = pathParts[i];
    } else if (template !== pathParts[i]) {
      throw new FirestoreDocumentError(
        `Path "${path}" does not match template "${pathTemplate}": segment mismatch at position ${i}`,
      );
    }
  }

  return key as Key;
}

/**
 * Builds a Firestore path from a key object or array
 *
 * @param key - Key object with named properties, or string array of path segments
 * @param pathTemplate - Optional path template with placeholders (e.g., "users/{userId}/posts/{postId}")
 * @returns Generated path string, or undefined if key is object but no template provided
 * @example
 * // With object key and template
 * buildPath({ userId: '123', postId: '456' }, 'users/{userId}/posts/{postId}')
 * // => 'users/123/posts/456'
 *
 * // With number values (auto-converted to strings)
 * buildPath({ userId: 123, postId: 456 }, 'users/{userId}/posts/{postId}')
 * // => 'users/123/posts/456'
 *
 * // With bigint values (auto-converted to strings)
 * buildPath({ id: 1234567890123456789n }, 'tweets/{id}')
 * // => 'tweets/1234567890123456789'
 *
 * // With array key
 * buildPath(['users', '123', 'posts', '456'])
 * // => 'users/123/posts/456'
 */
export function buildPath(key: FirestoreKey | string[], pathTemplate?: string): string | undefined {
  if (Array.isArray(key)) {
    return key.join('/');
  }

  if (!pathTemplate || pathTemplate === '') {
    return undefined;
  }

  return pathTemplate.replace(/\{(\w+)\}/g, (_, keyName) => {
    const value = (key as Record<string, string | number | bigint>)[keyName];
    return value !== undefined ? String(value) : '';
  });
}

/**
 * Generates a random alphanumeric ID
 *
 * @param n - Length of the generated ID (default: 20)
 * @returns Random alphanumeric string containing A-Z, a-z, and 0-9
 * @example
 * newId() // => 'aBcDeFgHiJkLmNoPqRsT' (20 chars)
 * newId(10) // => 'aBcDeFgHiJ' (10 chars)
 */
export function newId(n = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: n }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

/**
 * Generates a time-based ID with timestamp prefix and random suffix
 *
 * The first 9 characters are a base36-encoded timestamp, making IDs naturally
 * sortable by creation time. Remaining characters are random.
 *
 * @param n - Total length of the generated ID (default: 20)
 * @returns Time-based alphanumeric string (9 chars timestamp + random suffix)
 * @example
 * timeId() // => 'lf2jd8k4a7xBcDeFgHiJ' (20 chars: 9 timestamp + 11 random)
 * timeId(15) // => 'lf2jd8k4aBcDeF' (15 chars: 9 timestamp + 6 random)
 */
export function timeId(n = 20): string {
  const now = new Date();
  const tid = now.getTime().toString(36).padStart(9, '0');
  if (n <= 9) {
    return tid.substring(0, n);
  }
  return tid + newId(n - 9);
}
