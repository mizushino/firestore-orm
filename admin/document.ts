import {
  type DocumentData,
  type FieldValue,
  DocumentReference,
  DocumentSnapshot,
  Timestamp,
  Transaction,
  WriteBatch,
} from 'firebase-admin/firestore';

import { firestore, DELETE_FIELD } from './firestore.js';
import {
  type FirestoreData,
  type FirestoreKey,
  type FirestoreObject,
  type FirestoreValue,
  FirestoreDocumentError,
} from './types.js';
import { AsyncQueue } from '../shared/async-queue.js';
import { deepEqual, parseKey, buildPath } from '../shared/utils.js';

/**
 * ActiveRecord-style Firestore document class with change tracking
 * @template Key - Document key type (object with key fields or string array)
 * @template Data - Document data type extending FirestoreData
 */
export class FirestoreDocument<Key = FirestoreKey, Data extends FirestoreData = FirestoreData> {
  public get static(): typeof FirestoreDocument {
    return this.constructor as typeof FirestoreDocument;
  }

  /**
   * Path template for building document paths (e.g., "users/{userId}/posts/{postId}")
   * Override in subclasses to define the document path structure
   */
  public static pathTemplate = '';

  /**
   * Default key for new documents
   * Override in subclasses to provide custom default key (e.g., using newId() or timeId())
   * Use getter to generate new IDs on each access
   */
  public static get defaultKey(): FirestoreKey | string[] | undefined {
    return undefined;
  }

  /**
   * Default data for new documents
   * Override in subclasses to provide custom default values
   * Use getter to generate fresh default values on each access (e.g., new Date())
   */
  public static get defaultData(): FirestoreData {
    return {};
  }

  public reference?: DocumentReference;

  private _key?: Key | string[];
  private readonly _data: FirestoreObject = {};
  /** Proxy wrapper for _data that tracks changes and provides dynamic _id access */
  private readonly _proxyData: Data = new Proxy(this._data, {
    get: (target, prop: string | symbol) => {
      if (typeof prop === 'string') {
        if (prop === '_id' && this.reference?.id) {
          return this.reference.id;
        }
        return target[prop];
      }
      return undefined;
    },
    set: (_target, prop: string | symbol, value: unknown) => {
      if (typeof prop === 'string') {
        this.setValue(prop, value);
      }
      return true;
    },
    deleteProperty: (_target, prop: string | symbol) => {
      if (typeof prop === 'string') {
        this.setValue(prop, undefined);
      }
      return true;
    },
  }) as Data;
  private _exist = false;
  private _isLoaded = false;

  /** Tracks old values of changed fields for rollback */
  private readonly _updated = new Map<string, FirestoreValue>();
  /** Indicates if all fields should be saved (set operation) */
  private _updatedAll = false;

  /** Queues for async snapshot generators */
  private _snapshotQueues: AsyncQueue<any>[] = [];
  /** Unsubscribe function for real-time listener */
  private _unwatch?: () => void;

  /**
   * Document key used to identify this document
   */
  public get key(): Readonly<Key | string[]> | undefined {
    return this._key;
  }

  /**
   * Document ID from Firestore
   */
  public get id(): string {
    return this.reference?.id || '';
  }

  /**
   * Document data accessible via Proxy for change tracking
   */
  public get data(): Data {
    return this._proxyData;
  }

  /**
   * Whether this document exists in Firestore
   */
  public get exist(): boolean {
    return this._exist;
  }

  /**
   * Whether this document is new (not yet saved to Firestore)
   */
  public get isNew(): boolean {
    return !this._exist;
  }

  /**
   * Whether this document has unsaved changes
   */
  public get isDirty(): boolean {
    return this._updated.size > 0 || this._updatedAll;
  }

  /**
   * Whether this document has been loaded from Firestore
   */
  public get isLoaded(): boolean {
    return this._isLoaded;
  }

  constructor(keyOrRef?: Key | string | DocumentReference, data: Data | DocumentSnapshot | null = null, exist = false) {
    if (data === null) {
      data = this.static.defaultData as Data;
    }

    if (keyOrRef instanceof DocumentReference) {
      this.setReference(keyOrRef);
    } else if (keyOrRef !== undefined) {
      this.setKey(keyOrRef);
    } else if (this.static.defaultKey !== undefined) {
      this.setKey(this.static.defaultKey as Key);
    }

    this._exist = exist;
    this.setData(data, !exist);
  }

  /**
   * Loads document data from Firestore
   * @param transaction - Optional transaction to use for the read
   * @param cache - If true and document already loaded, skip loading
   * @returns This document instance
   */
  public async get(transaction?: Transaction, cache = false): Promise<this> {
    if (cache && this.isLoaded) {
      return this;
    }

    if (!this.reference) {
      throw new FirestoreDocumentError('Document reference is not set');
    }

    const snapshot = await (transaction ? transaction.get(this.reference) : this.reference.get());
    this.setDataFromSnapshot(snapshot);
    this._isLoaded = true;
    return this;
  }

  /**
   * Overwrites the entire document in Firestore
   * @param data - Optional data to set (uses current data if undefined)
   * @param transaction - Optional transaction or batch to use
   */
  public async set(data?: Data, transaction?: Transaction | WriteBatch): Promise<void> {
    if (!this.reference) {
      throw new FirestoreDocumentError('Document reference is not set');
    }

    if (data !== undefined) {
      this.setData(data, true);
    }

    this.beforeSave();

    const saveData = this.serialize(this._data);

    if (transaction instanceof Transaction) {
      transaction.set(this.reference, saveData);
    } else if (transaction instanceof WriteBatch) {
      transaction.set(this.reference, saveData);
    } else {
      await this.reference.set(saveData);
    }

    this.afterSave();
  }

  /**
   * Updates only changed fields in Firestore
   * @param transaction - Optional transaction or batch to use
   */
  public async update(transaction?: Transaction | WriteBatch): Promise<void> {
    if (!this.reference) {
      return;
    }

    if (this._updated.size === 0) {
      return;
    }

    this.beforeSave();

    const saveData = this.serialize(this._data, this._updated);

    if (transaction instanceof Transaction) {
      transaction.update(this.reference, saveData);
    } else if (transaction instanceof WriteBatch) {
      transaction.update(this.reference, saveData);
    } else {
      await this.reference.update(saveData);
    }

    this.afterSave();
  }

  /**
   * Saves document to Firestore (auto-detects whether to set or update)
   * @param force - If true, always uses set() instead of update()
   * @param transaction - Optional transaction or batch to use
   */
  public async save(force = false, transaction?: Transaction | WriteBatch): Promise<void> {
    if (!this.reference) {
      throw new FirestoreDocumentError('Document reference is not set');
    }

    await (this._exist && !force && !this._updatedAll ? this.update(transaction) : this.set(undefined, transaction));
  }

  /**
   * Recursively serializes a plain object for Firestore storage
   * Iterates through all properties and serializes each value
   * @param obj - Plain object to serialize
   * @returns Serialized object ready for Firestore
   */
  protected serializeObject(obj: FirestoreObject): FirestoreObject {
    const serialized: FirestoreObject = {};
    for (const key in obj) {
      const value = this.serializeValue(obj[key]);
      if (value !== undefined) {
        serialized[key] = value;
      }
    }
    return serialized;
  }

  /**
   * Recursively serializes a value for Firestore storage
   * Converts Date objects to Timestamp and recursively processes nested structures
   * Override this method in subclasses to add custom type conversions
   * @param value - The value to serialize
   * @returns The serialized value ready for Firestore
   */
  protected serializeValue(value: FirestoreValue): FirestoreValue {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'object') {
      if (value instanceof Array) {
        return value.map((v) => this.serializeValue(v));
      }
      if (value instanceof Date) {
        return Timestamp.fromDate(value);
      }
      if (value instanceof Timestamp) {
        return value;
      }
      if (typeof value === 'object' && value.constructor === Object) {
        return this.serializeObject(value as FirestoreObject);
      }
      return value;
    }

    return value;
  }

  /**
   * Recursively unserializes a plain object from Firestore
   * Iterates through all properties and unserializes each value
   * @param obj - Plain object to unserialize
   * @returns Unserialized object with JavaScript types
   */
  protected unserializeObject(obj: FirestoreObject): FirestoreObject {
    const unserialized: FirestoreObject = {};
    for (const key in obj) {
      unserialized[key] = this.unserializeValue(obj[key]);
    }
    return unserialized;
  }

  /**
   * Recursively unserializes a value from Firestore
   * Converts Timestamp objects to Date and recursively processes nested structures
   * Override this method in subclasses to add custom type conversions
   * @param value - The value to unserialize
   * @returns The unserialized value with JavaScript types
   */
  protected unserializeValue(value: FirestoreValue): FirestoreValue {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'object') {
      if (value instanceof Array) {
        return value.map((v) => this.unserializeValue(v));
      }
      if (value instanceof Timestamp) {
        return value.toDate();
      }
      if (typeof value === 'object' && value.constructor === Object) {
        return this.unserializeObject(value as FirestoreObject);
      }
      return value;
    }

    return value;
  }

  /**
   * Serializes document data for Firestore storage
   * @param data - Document data to serialize
   * @param updatedValues - Optional map of updated fields (serializes only these if provided)
   * @returns Serialized data ready for Firestore
   */
  protected serialize(data: FirestoreObject, updatedValues?: Map<string, FirestoreValue>): FirestoreObject {
    if (updatedValues !== undefined) {
      const serializedData: FirestoreObject = {};
      for (const key of updatedValues.keys()) {
        const value = this.serializeValue(data[key]);
        if (value !== undefined) {
          serializedData[key] = value;
        }
      }
      return serializedData;
    } else {
      const { _id, ...rest } = data;
      return this.serializeObject(rest);
    }
  }

  /**
   * Unserializes document data from Firestore
   * @param data - Firestore data to unserialize
   * @returns Unserialized data with JavaScript types
   */
  protected unserialize(data: FirestoreObject): FirestoreObject {
    return this.unserializeObject(data);
  }

  /**
   * Called before saving document to Firestore
   * Override this method in subclasses to add validation or data transformation
   * @throws Error if validation fails - the save operation will be aborted
   */
  protected beforeSave(): void {
    // Override in subclasses
  }

  /**
   * Clears update tracking and marks document as existing after a successful save
   * Override this method in subclasses to add custom post-save logic
   */
  protected afterSave(): void {
    this._updated.clear();
    this._updatedAll = false;
    this._exist = true;
  }

  /**
   * Sets a single field value and tracks the change
   * @param key - Field name
   * @param value - New value (undefined marks field for deletion)
   */
  protected setValue(key: string, value: unknown): void {
    if (!this._updated.has(key)) {
      const oldValue = this._data[key];
      if (!DELETE_FIELD.isEqual(oldValue as FieldValue)) {
        this._updated.set(key, oldValue);
      } else {
        this._updated.set(key, undefined);
      }
    }

    if (value === undefined) {
      if (key in this._data) {
        if (this.exist) {
          this._data[key] = DELETE_FIELD;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete this._data[key];
        }
      }
    } else {
      this._data[key] = value as FirestoreValue;
    }
  }

  /**
   * Replaces document data and updates change tracking
   * @param data - New data or snapshot
   * @param updatedAll - Whether to mark all fields as updated
   * @returns true if data was changed, false if identical
   */
  protected setData(data: Data | DocumentSnapshot, updatedAll = true): boolean {
    if (data instanceof DocumentSnapshot) {
      const snapshotData = data.data();
      if (snapshotData === undefined) {
        return false;
      }
      data = this.unserialize(snapshotData) as Data;
    } else {
      data = structuredClone(data);
    }

    if (deepEqual(data, this._data)) {
      this._updated.clear();
      this._updatedAll = updatedAll;
      return false;
    }

    for (const key in data) {
      const value = data[key as keyof Data];
      if (DELETE_FIELD.isEqual(value as FieldValue)) {
        (data as Record<string, unknown>)[key] = undefined;
      }
    }

    for (const key in this._data) {
      if (key !== '_id') {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this._data[key];
      }
    }
    Object.assign(this._data, data);

    this._updated.clear();
    this._updatedAll = updatedAll;
    return true;
  }

  /**
   * Deletes document from Firestore
   * @param transaction - Optional transaction or batch to use
   */
  public async delete(transaction?: Transaction | WriteBatch): Promise<void> {
    if (!this.reference) {
      throw new FirestoreDocumentError('Document reference is not set');
    }

    if (!this._exist) {
      return;
    }

    this._exist = false;

    if (transaction) {
      transaction.delete(this.reference);
    } else {
      await this.reference.delete();
    }
  }

  /**
   * Returns a deep copy of the document data including _id
   * @returns Deep cloned document data with _id from reference
   */
  public toObject(): Data {
    const cloned = structuredClone(this._data) as Data;
    if (this.reference?.id) {
      cloned._id = this.reference.id;
    }
    return cloned;
  }

  /**
   * Watches document for real-time updates
   * @param callback - Called when document data changes
   * @returns Function to cancel the watch
   */
  public watch(callback?: (data: Data) => void): () => void {
    if (!this.reference) {
      throw new FirestoreDocumentError('Document reference is not set');
    }

    this.unwatch();

    this._unwatch = this.reference.onSnapshot((snapshot) => {
      this.setDataFromSnapshot(snapshot);

      if (this._exist && callback) {
        callback(this.data);
      }
    });

    return () => this.unwatch();
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
   * Creates an async generator for document snapshots
   * @yields Document instances on each change
   */
  public async *snapshot<T extends FirestoreDocument>(): AsyncGenerator<T> {
    const queue = new AsyncQueue<any>();

    if (this.exist) {
      queue.enqueue(this);
    }

    this._snapshotQueues.push(queue);

    if (!this._unwatch) {
      this.watch(() => {
        this._snapshotQueues.forEach((q) => q.enqueue(this));
      });
    }

    while (this._unwatch !== undefined) {
      const document = await queue.dequeue();
      if (document === undefined) {
        break;
      }
      yield document as T;
    }

    this._snapshotQueues.splice(this._snapshotQueues.indexOf(queue), 1);
    if (this._snapshotQueues.length === 0) {
      this.unwatch();
    }
  }

  /**
   * Sets the document key from a Key object or path string
   * @param keyOrPath - Document key object or path string
   */
  protected setKey(keyOrPath: Key | string): void {
    if (typeof keyOrPath === 'string') {
      this._key = parseKey<Key>(keyOrPath, this.static.pathTemplate);
    } else {
      this._key = keyOrPath;
    }

    const path = buildPath(this._key, this.static.pathTemplate);
    if (path !== undefined) {
      this.reference = firestore().doc(path);
    }
  }

  /**
   * Sets the document reference and extracts the key from its path
   * @param ref - Firestore document reference
   */
  protected setReference(ref: DocumentReference): void {
    this.reference = ref;
    this._key = parseKey<Key>(ref.path, this.static.pathTemplate);
  }

  /**
   * Updates document data and metadata from a Firestore snapshot
   * Sets _exist flag, extracts document ID and key, and unserializes data
   * @param snapshot - Firestore document snapshot
   */
  protected setDataFromSnapshot(snapshot: DocumentSnapshot<DocumentData>): void {
    this._exist = snapshot.exists;

    if (!this._exist) {
      this.setData(this.static.defaultData as Data);
      return;
    }

    const data = snapshot.data() as FirestoreObject;
    this.setReference(snapshot.ref);
    this.setData(this.unserialize(data) as Data, false);
  }
}
