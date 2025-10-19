import type { FirestoreBasePrimitive } from '../shared/types';
import type { Timestamp, FieldValue } from 'firebase-admin/firestore';

export type { FirestoreKey } from '../shared/types';
export { FirestoreDocumentError } from '../shared/types';

/**
 * Firestore primitive types that can be stored directly (Admin SDK)
 * Extends base primitives with Timestamp
 */
export type FirestorePrimitive = FirestoreBasePrimitive | Timestamp;

/**
 * Firestore value types including arrays and nested objects
 */
export type FirestoreValue = FirestorePrimitive | FirestoreValue[] | { [key: string]: FirestoreValue } | FieldValue;

/**
 * Type for document data with string keys and Firestore-compatible values
 */
export type FirestoreObject = Record<string, FirestoreValue>;

/**
 * Type for Firestore document data with optional _id field
 * Use intersection type (&) to add specific fields to your data type
 *
 * @example
 * type UserData = FirestoreData & {
 *   name: string;
 *   age: number;
 * }
 */
export interface FirestoreData {
  _id?: string;
  [key: string]: FirestoreValue;
}
