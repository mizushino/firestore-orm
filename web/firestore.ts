import { type Firestore, deleteField, getFirestore } from 'firebase/firestore';

/**
 * Shared Firestore instance
 */
let _firestore: Firestore | undefined;

/**
 * Initializes the Firestore ORM with a Firestore instance
 *
 * This function should be called once at the start of your application.
 *
 * @param db - Firestore instance to use
 *
 * @example
 * ```typescript
 * import { getFirestore } from 'firebase/firestore';
 * import { initializeFirestore } from 'firestore-orm/web';
 *
 * const db = getFirestore(app);
 * initializeFirestore(db);
 * ```
 */
export function initializeFirestore(db: Firestore): void {
  _firestore = db;
}

/**
 * Gets or initializes the Firestore instance
 * @returns Firestore instance
 */
export function firestore(): Firestore {
  if (!_firestore) {
    _firestore = getFirestore();
  }
  return _firestore;
}

/**
 * Shared DELETE_FIELD sentinel value for marking fields to be deleted
 */
export const DELETE_FIELD = deleteField();
