import type { DocumentSnapshot, FieldPath, OrderByDirection, Query, WhereFilterOp } from 'firebase/firestore';

import { endAt, endBefore, limit, limitToLast, orderBy, query, startAfter, startAt, where } from 'firebase/firestore';

/**
 * Where clause for Firestore queries
 */
export interface Where {
  /** Field path to filter on (string or FieldPath) */
  fieldPath: string | FieldPath;
  /** Comparison operator (==, !=, <, <=, >, >=, array-contains, in, array-contains-any, not-in) */
  opStr: WhereFilterOp;
  /** Value to compare against */
  value: unknown;
}

/**
 * Query condition configuration
 *
 * Defines filtering, ordering, pagination and cursor options for Firestore queries.
 * All fields are optional.
 *
 * @example
 * ```typescript
 * const condition: Condition = {
 *   where: [
 *     { fieldPath: 'age', opStr: '>=', value: 18 },
 *     { fieldPath: 'status', opStr: '==', value: 'active' }
 *   ],
 *   orderBy: { fieldPath: 'createdAt', directionStr: 'desc' },
 *   limit: 10
 * };
 * ```
 */
export interface Condition {
  /** Array of where clauses (all conditions are AND-ed together) */
  where?: Where[];
  /** Maximum number of documents to return */
  limit?: number;
  /** Maximum number of documents to return from the end of the result set */
  limitToLast?: number;
  /** Order by field and direction */
  orderBy?: {
    fieldPath: string | FieldPath;
    directionStr?: OrderByDirection | undefined;
  };
  /** Start after this document snapshot (for pagination) */
  startAfter?: DocumentSnapshot<unknown>;
  /** Start at this document snapshot (inclusive) */
  startAt?: DocumentSnapshot<unknown>;
  /** End before this document snapshot (for pagination) */
  endBefore?: DocumentSnapshot<unknown>;
  /** End at this document snapshot (inclusive) */
  endAt?: DocumentSnapshot<unknown>;
}

/**
 * Builds a Firestore query from a base query reference and condition object
 *
 * Applies where clauses, ordering, limits, and cursor operations in the correct order
 * to construct a complete Firestore query.
 *
 * @param ref - Base Firestore query reference
 * @param condition - Query conditions to apply
 * @returns Modified query with conditions applied, or undefined if ref is not provided
 *
 * @example
 * ```typescript
 * const baseQuery = collection(db, 'users');
 * const query = buildQuery(baseQuery, {
 *   where: [{ fieldPath: 'age', opStr: '>=', value: 18 }],
 *   orderBy: { fieldPath: 'name', directionStr: 'asc' },
 *   limit: 10
 * });
 * ```
 */
export function buildQuery(ref?: Query<unknown>, condition?: Condition): Query<unknown> | undefined {
  if (!ref) {
    return;
  }

  if (!condition) {
    return ref;
  }

  if (condition.where !== undefined) {
    for (const w of condition.where) {
      ref = query(ref, where(w.fieldPath, w.opStr, w.value));
    }
  }

  if (condition.limit !== undefined) {
    ref = query(ref, limit(condition.limit));
  }

  if (condition.limitToLast !== undefined) {
    ref = query(ref, limitToLast(condition.limitToLast));
  }

  if (condition.orderBy !== undefined) {
    ref = query(ref, orderBy(condition.orderBy.fieldPath, condition.orderBy.directionStr));
  }

  if (condition.startAfter !== undefined) {
    ref = query(ref, startAfter(condition.startAfter));
  }

  if (condition.startAt !== undefined) {
    ref = query(ref, startAt(condition.startAt));
  }

  if (condition.endBefore !== undefined) {
    ref = query(ref, endBefore(condition.endBefore));
  }

  if (condition.endAt !== undefined) {
    ref = query(ref, endAt(condition.endAt));
  }

  return ref;
}
