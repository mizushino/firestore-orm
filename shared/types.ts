/**
 * Base key type for Firestore documents
 * Define document keys as objects with string/number/bigint properties
 * Numbers and bigints are automatically converted to strings when building paths
 *
 * @example
 * type UserKey = FirestoreKey & {
 *   id: string;
 * }
 *
 * type PostKey = FirestoreKey & {
 *   userId: string;
 *   postId: string;
 * }
 *
 * { id: 'user123' }            // String ID
 * { id: 123 }                  // Numeric ID
 * { id: 1234567890123456789n } // BigInt ID
 */
export type FirestoreKey = Record<string, string | number | bigint>;

/**
 * Common primitive types supported by Firestore
 * These are the basic JavaScript types that can be stored directly in Firestore
 */
export type FirestoreBasePrimitive = string | number | boolean | null | undefined | Date;

/**
 * Custom error class for Firestore document operations
 */
export class FirestoreDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FirestoreDocumentError';
  }
}
