import { type Firestore, FieldValue } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Map of Firestore instances by database ID
 */
const _firestores = new Map<string, Firestore>();

/**
 * Sets a Firestore instance for a specific database ID
 *
 * This function should be called to register Firestore instances for each database you want to use.
 *
 * @param db - Firestore instance to use
 * @param databaseId - Database ID (default: '')
 *
 * @example
 * ```typescript
 * import { getFirestore } from 'firebase-admin/firestore';
 * import { setupFirestore } from 'firestore-orm/admin';
 *
 * const db = getFirestore(app);
 * setupFirestore(db); // Register default database
 *
 * const dbSub = getFirestore(app, 'sub');
 * setupFirestore(dbSub, 'sub'); // Register secondary database
 * ```
 */
export function setupFirestore(db: Firestore, databaseId = ''): void {
  _firestores.set(databaseId, db);
}

/**
 * Gets or initializes the Firestore instance for a specific database ID
 * @param databaseId - Database ID (default: '')
 * @returns Firestore instance
 */
export function firestore(databaseId = ''): Firestore {
  let db = _firestores.get(databaseId);
  if (!db) {
    // Auto-initialize default database
    db = getFirestore();
    _firestores.set(databaseId, db);
  }
  return db;
}

/**
 * Shared DELETE_FIELD sentinel value for marking fields to be deleted
 */
export const DELETE_FIELD = FieldValue.delete();
