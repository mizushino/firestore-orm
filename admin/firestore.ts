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
 * @param databaseId - Database ID (default: '(default)')
 *
 * @example
 * ```typescript
 * import { getFirestore } from 'firebase-admin/firestore';
 * import { setFirestore } from 'firestore-orm/admin';
 *
 * const db = getFirestore(app);
 * setFirestore(db); // Register default database
 *
 * const dbJapan = getFirestore(app, 'db-japan');
 * setFirestore(dbJapan, 'db-japan'); // Register secondary database
 * ```
 */
export function setFirestore(db: Firestore, databaseId = '(default)'): void {
  _firestores.set(databaseId, db);
}

/**
 * Gets or initializes the Firestore instance for a specific database ID
 * @param databaseId - Database ID (default: '(default)')
 * @returns Firestore instance
 */
export function firestore(databaseId?: string): Firestore {
  const dbId = databaseId || '(default)';
  let db = _firestores.get(dbId);
  if (!db) {
    // Auto-initialize default database
    db = getFirestore();
    _firestores.set(dbId, db);
  }
  return db;
}

/**
 * Shared DELETE_FIELD sentinel value for marking fields to be deleted
 */
export const DELETE_FIELD = FieldValue.delete();
