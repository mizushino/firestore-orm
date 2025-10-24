import type { FirestoreDocument } from './document.js';

import { writeBatch } from 'firebase/firestore';

import { firestore } from './firestore.js';

/**
 * Splits an array into chunks of specified size
 * @param array - Array to chunk
 * @param size - Size of each chunk
 * @returns Array of chunks
 * @example
 * chunk([1, 2, 3, 4, 5], 2) // => [[1, 2], [3, 4], [5]]
 */
function chunk<T>(array: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, i) => array.slice(i * size, (i + 1) * size));
}

/**
 * Saves multiple documents in batches of 500 (Firestore batch limit)
 * @param documents - Documents to save
 */
export async function batchSave(documents: FirestoreDocument[]): Promise<void> {
  if (documents.length === 0) return;

  const db = firestore();
  const chunks = chunk(documents, 500);

  await Promise.all(
    chunks.map(async (docs) => {
      const batch = writeBatch(db);
      for (const doc of docs) {
        await doc.save(false, batch);
      }
      await batch.commit();
    }),
  );
}

/**
 * Deletes multiple documents in batches of 500 (Firestore batch limit)
 * @param documents - Documents to delete
 */
export async function batchDelete(documents: FirestoreDocument[]): Promise<void> {
  if (documents.length === 0) return;

  const db = firestore();
  const chunks = chunk(documents, 500);

  await Promise.all(
    chunks.map(async (docs) => {
      const batch = writeBatch(db);
      for (const doc of docs) {
        await doc.delete(batch);
      }
      await batch.commit();
    }),
  );
}
