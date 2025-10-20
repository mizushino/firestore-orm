import type { FirestoreDocument } from './document';

import {
  collection,
  type CollectionReference,
  type DocumentChange,
  type DocumentReference,
  type Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
  type Transaction,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
} from 'firebase/firestore';

import { firestore } from './firestore';
import { buildQuery, type Condition } from './query';
import { type FirestoreData, type FirestoreKey, FirestoreDocumentError } from './types';
import { AsyncQueue } from '../shared/async-queue';
import { newId, parseKey, buildPath } from '../shared/utils';

export class FirestoreCollection<
  Key extends FirestoreKey = FirestoreKey,
  Data extends FirestoreData = FirestoreData,
  Document extends FirestoreDocument<Key, Data> = FirestoreDocument<Key, Data>,
> {
  public get static(): typeof FirestoreCollection {
    return this.constructor as typeof FirestoreCollection;
  }

  /**
   * Path template for building collection paths (e.g., "users/{userId}/posts")
   * Override in subclasses to define the collection path structure
   */
  public static pathTemplate = '';

  /**
   * Collection key used to identify this collection
   */
  public get key(): Readonly<Key | string[]> | undefined {
    return this._key;
  }

  public set key(key: Readonly<Key | string[]> | undefined) {
    if (key !== undefined) {
      // Clone array to remove readonly
      const mutableKey: Key | string[] = Array.isArray(key) ? [...key] : (key as Key);
      this.setKey(mutableKey);
    } else {
      this._key = undefined;
      this.reference = undefined;
      delete this.query;
      this.unwatch();
    }
  }

  /**
   * Query condition for filtering documents
   */
  public get condition(): Readonly<Condition> | undefined {
    return this._condition;
  }

  public set condition(condition: Readonly<Condition> | undefined) {
    this._condition = condition;
    this.initializeQuery();
  }

  /**
   * Map of loaded documents keyed by document ID
   */
  public get documents(): Map<string, Document> {
    return this._documents;
  }

  /**
   * Converts the documents map to an array
   * @returns Array of all documents in this collection
   */
  public toArray(): Document[] {
    return Array.from(this.documents.values());
  }

  protected _ctor: {
    new (
      key?: Key | string | DocumentReference,
      data?: Data | QueryDocumentSnapshot<Data> | null,
      exist?: boolean,
    ): Document;
    readonly defaultData: FirestoreData;
    readonly defaultKey?: FirestoreKey | string[];
  };
  protected _key?: Key | string[];
  protected _condition: Condition | undefined;
  protected _documents: Map<string, Document> = new Map<string, Document>();

  protected _snapshotQueues = [] as AsyncQueue<Document[] | undefined>[];
  protected _cachedDocuments?: Document[];
  protected _unwatch?: () => void;

  public reference?: CollectionReference<Data>;
  protected query?: Query<Data>;

  public isLoaded = false;

  /**
   * Initializes query from reference and condition
   */
  protected initializeQuery(): void {
    if (this.reference !== undefined) {
      if (this._condition !== undefined) {
        this.query = buildQuery(this.reference, this._condition) as Query<Data>;
      } else {
        this.query = this.reference;
      }
    } else {
      delete this.query;
    }

    this.unwatch();
  }

  constructor(
    ctor: { new (): Document; readonly defaultData: FirestoreData; readonly defaultKey?: FirestoreKey | string[] },
    key?: Key | string[],
    condition?: Condition,
  ) {
    this._ctor = ctor;
    this.key = key;
    this.condition = condition;
  }

  /**
   * Initializes collection with reference and query
   * @param reference - Collection reference
   * @param query - Optional query
   */
  public initialize(reference?: CollectionReference<Data>, query?: Query<Data>): void {
    this.reference = reference;
    if (query !== undefined) {
      this.query = query;
      this.unwatch();
    } else {
      this.initializeQuery();
    }
  }

  /**
   * Applies query snapshot documents to the collection
   * @param docs - Query document snapshots
   */
  protected applyDocs(docs: QueryDocumentSnapshot<Data>[]): void {
    for (const doc of docs) {
      const document = this._documents.get(doc.id) ?? new this._ctor(doc.ref, doc, true);
      this._documents.set(doc.id, document);
    }
    this.isLoaded = true;
  }

  /**
   * Applies document changes from snapshot listener
   * @param docChanges - Document changes
   */
  protected applyDocChanges(docChanges: DocumentChange<Data>[]): void {
    for (const docChange of docChanges) {
      const doc = docChange.doc;
      if (docChange.type === 'added' || docChange.type === 'modified') {
        const document = this._documents.get(doc.id) ?? new this._ctor(doc.ref, doc, true);
        this._documents.set(doc.id, document);
      } else if (docChange.type === 'removed') {
        this._documents.delete(doc.id);
      }
    }
    this.isLoaded = true;
  }

  /**
   * Prepares collection for snapshot
   * Override in subclasses to add custom preparation logic
   * @param cache - Whether to use cached data
   * @returns true if ready, false otherwise
   */
  protected async prepare(_cache = false): Promise<boolean> {
    return true;
  }

  /**
   * Gets documents from Firestore
   * @param cache - If true and already loaded, skip loading
   * @returns This collection instance
   */
  public async get(cache = false): Promise<FirestoreCollection<Key, Data, Document>> {
    if (cache && this.isLoaded) {
      return this;
    }

    if (!this.query) {
      return this;
    }

    const snapshot = await getDocs(this.query);
    if (!snapshot.docs) {
      return this;
    }

    this._documents.clear();
    this.applyDocs(snapshot.docs);

    return this;
  }

  /**
   * Saves all documents in the collection
   * @param transaction - Optional transaction to use
   */
  public async save(transaction?: Transaction): Promise<void> {
    if (transaction) {
      for (const document of this._documents.values()) {
        await document.save(false, transaction);
      }
    } else {
      await runTransaction(firestore(), async (transaction) => {
        for (const document of this._documents.values()) {
          await document.save(false, transaction);
        }
      });
    }
  }

  /**
   * Returns the first document in the collection
   * @returns First document or undefined if empty
   */
  public first(): Document | undefined {
    for (const document of this.documents.values()) {
      return document;
    }
    return undefined;
  }

  /**
   * Finds a document by ID from the loaded documents (cache only)
   * @param id - Document ID
   * @returns Document or undefined if not found
   */
  public find(id: string): Document | undefined {
    return this.reference ? this.documents.get(id) : undefined;
  }

  /**
   * Sets a document with a specific ID
   * @param id - Document ID
   * @param data - Document data
   * @param transaction - Optional transaction to use
   * @returns Created document or undefined if no reference
   */
  public async set(id: string, data: Data, transaction?: Transaction): Promise<Document | undefined> {
    if (this.reference === undefined) {
      return undefined;
    }

    const reference = doc(this.reference, id);
    const document = new this._ctor(reference, data, false);
    await document.save(true, transaction);

    this._documents.set(reference.id, document);
    return document;
  }

  /**
   * Generates a new document ID
   * Override in subclasses to customize ID generation (e.g., use timeId)
   * @param _data - Document data (unused in default implementation)
   * @returns Generated document ID
   */
  protected generateNewId(_data: Data): string {
    return newId();
  }

  /**
   * Adds a new document with auto-generated ID
   * @param data - Document data (uses defaultData if not provided)
   * @param transaction - Optional transaction to use
   * @returns Created document or undefined if no reference
   */
  public async add(data?: Data, transaction?: Transaction): Promise<Document | undefined> {
    if (!this.reference) {
      return undefined;
    }
    if (!data) {
      data = this._ctor.defaultData as Data;
    }
    return this.set(this.generateNewId(data), data, transaction);
  }

  /**
   * Deletes a document by ID
   * @param id - Document ID
   * @param transaction - Optional transaction to use
   */
  public async delete(id: string, transaction?: Transaction): Promise<void> {
    if (!this.reference) {
      return;
    }

    const reference = doc(this.reference, id);

    if (transaction) {
      transaction.delete(reference);
    } else {
      await deleteDoc(reference);
    }
    this._documents.delete(id);
  }

  /**
   * Gets all documents as an array, loading if necessary
   * @param force - If true, reload even if already loaded
   * @returns Array of all documents
   */
  public async docs(force = false): Promise<Document[]> {
    if (this.isLoaded && !force) {
      return this.toArray();
    }

    await this.get();
    return this.toArray();
  }

  /**
   * Creates an async generator for real-time document updates
   * @param node - Optional DOM node to observe for removal (auto-cleanup)
   * @yields Array of documents on each change
   */
  public async *snapshot(node?: Node): AsyncGenerator<Document[]> {
    if (!(await this.prepare())) {
      yield [];
      return;
    }

    const queue = new AsyncQueue<Document[] | undefined>();

    if (this._cachedDocuments !== undefined) {
      queue.enqueue(this._cachedDocuments);
    }
    this._snapshotQueues.push(queue);

    if (this._unwatch === undefined) {
      this.watch((_snapshot: QuerySnapshot<Data>) => {
        this._cachedDocuments = this.toArray();
        this._snapshotQueues.forEach((queue) => {
          queue.enqueue(this._cachedDocuments as Document[]);
        });
      });
    }

    if (node?.parentNode) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (Array.from(mutation.removedNodes).includes(node)) {
            queue.enqueue(undefined);
          }
        });
      });
      observer.observe(node.parentNode, { childList: true, subtree: false });
    }

    while (this._unwatch !== undefined) {
      const document = await queue.dequeue();
      if (document === undefined) {
        break;
      }
      yield document;
    }

    const index = this._snapshotQueues.indexOf(queue);
    if (index >= 0) {
      this._snapshotQueues.splice(index, 1);
      if (this._snapshotQueues.length === 0) {
        this.unwatch();
      }
    }
  }

  /**
   * Watches collection for real-time updates
   * @param callback - Called on each snapshot update
   * @throws {FirestoreDocumentError} If watch is already active
   */
  public watch(callback: (snapshot: QuerySnapshot<Data>) => void): void {
    if (!this.query) {
      return;
    }

    if (this._unwatch !== undefined) {
      throw new FirestoreDocumentError('watch is already called');
    }

    this._unwatch = onSnapshot(this.query, (snapshot: QuerySnapshot<Data>) => {
      this.applyDocChanges(snapshot.docChanges());
      callback(snapshot);
    });
  }

  /**
   * Cancels all active snapshot listeners
   */
  public unwatch(): void {
    if (this._unwatch) {
      this._unwatch();
      this._unwatch = undefined;
    }
    this._snapshotQueues = [];
  }

  /**
   * Sets the collection key from a Key object, string array, or path string
   * @param keyOrPath - Collection key object, string array, or path string
   */
  protected setKey(keyOrPath: Key | string[] | string): void {
    if (typeof keyOrPath === 'string') {
      this._key = parseKey<Key>(keyOrPath, this.static.pathTemplate);
    } else {
      this._key = keyOrPath as Key | string[];
    }

    const pathSegments = buildPath(this._key, this.static.pathTemplate);
    if (pathSegments !== undefined) {
      // Build collection reference from Firestore instance
      const db = firestore();
      this.reference = collection(db, pathSegments) as CollectionReference<Data>;
      this.condition = this._condition;
    } else {
      this.reference = undefined;
      delete this.query;
    }
    this.unwatch();
  }

  /**
   * Sets the collection reference and extracts the key from its path
   * @param ref - Firestore collection reference
   */
  protected setReference(ref: CollectionReference<Data>): void {
    this.reference = ref;
    this._key = parseKey<Key>(ref.path, this.static.pathTemplate);
    this.condition = this._condition;
  }
}
