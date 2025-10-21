# Firestore ORM

[![npm version](https://badge.fury.io/js/@mizushino%2Ffirestore-orm.svg)](https://www.npmjs.com/package/@mzsn/firestore)
[![npm downloads](https://img.shields.io/npm/dm/@mzsn/firestore.svg)](https://www.npmjs.com/package/@mzsn/firestore)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)
![Tree Shakeable](https://img.shields.io/badge/Tree%20Shakeable-Yes-brightgreen)

TypeScript-first ORM library for Firestore with support for both client-side (web) and server-side (admin) environments.

**✨ Key Features:**
- **ActiveRecord & Repository patterns** - Intuitive document and collection management
- **Automatic change tracking** - Only modified fields are saved via Proxy
- **Auto-generated IDs** - Optional automatic ID generation with `defaultKey`
- **Lifecycle hooks** - Built-in validation and timestamp management with `beforeSave`/`afterSave`
- **Works everywhere** - Both `firebase` (web) and `firebase-admin` (server) SDKs
- **Real-time updates** - Built-in snapshot listeners with async generators
- **Type-safe** - Full TypeScript support with generics and inference
- **Path templates** - Flexible document path configuration with placeholders

## Installation

```bash
npm install @mzsn/firestore
```

**For Web/Client Projects:**
```bash
npm install @mzsn/firestore firebase
```

**For Server/Functions Projects:**
```bash
npm install @mzsn/firestore firebase-admin
```

## Usage

### Quick Start

```typescript
import { FirestoreDocument, FirestoreCollection, initializeFirestore, newId } from '@mzsn/firestore/admin';
import type { FirestoreKey, FirestoreData } from '@mzsn/firestore/admin';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
const app = initializeApp({ projectId: 'your-project-id' });
const db = getFirestore(app);
initializeFirestore(db);

// Define your types
interface UserKey extends FirestoreKey {
  uid: string;
}

interface UserData extends FirestoreData {
  name: string;
  email: string;
  age: number;
  createdAt: Date;
  updatedAt: Date;
}

// Create a Document class with auto-generated IDs
class UserDocument extends FirestoreDocument<UserKey, UserData> {
  public static pathTemplate = 'users/{uid}';

  // Auto-generate ID for each new instance
  public static get defaultKey(): UserKey {
    return { uid: newId() };
  }

  public static get defaultData(): UserData {
    return {
      name: '',
      email: '',
      age: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // Validation and auto-update timestamps
  protected override beforeSave(): void {
    // Update timestamp on every save
    this.data.updatedAt = new Date();

    // Validation
    if (!this.data.name || this.data.name.trim() === '') {
      throw new Error('Name is required');
    }
    if (!this.data.email || !this.data.email.includes('@')) {
      throw new Error('Valid email is required');
    }
    if (this.data.age < 0) {
      throw new Error('Age must be non-negative');
    }
  }
}

// Create a Collection class
class UserCollection extends FirestoreCollection<UserKey, UserData, UserDocument> {
  public static pathTemplate = 'users';
  public static documentClass = UserDocument;
}

// Example 1: Create with auto-generated ID
const newUser = new UserDocument();
newUser.data.name = 'John Doe';
newUser.data.email = 'john@example.com';
newUser.data.age = 30;
await newUser.save();
console.log('Created:', newUser.id);  // Auto-generated ID

// Example 2: Create with manual ID
const specificUser = new UserDocument({ uid: 'user123' });
specificUser.data.name = 'Jane Doe';
specificUser.data.email = 'jane@example.com';
specificUser.data.age = 25;
await specificUser.save();

// Example 3: Load and update
const existingUser = new UserDocument({ uid: 'user123' });
await existingUser.get();
existingUser.data.age = 26;  // Automatically tracked
await existingUser.save();    // Only saves 'age' field

// Example 4: Query with Collection
const users = new UserCollection(undefined, {
  where: [{ fieldPath: 'age', opStr: '>=', value: 18 }],
  orderBy: { fieldPath: 'age', directionStr: 'asc' },
  limit: 10
});
await users.get();

for (const [id, user] of users.documents) {
  console.log(`${id}: ${user.data.name} (${user.data.age})`);
}

// Example 5: Add via Collection
await users.add({
  name: 'Alice',
  email: 'alice@example.com',
  age: 28,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// Example 6: Validation in action
try {
  const invalidUser = new UserDocument();
  invalidUser.data.name = '';  // Invalid - empty name
  invalidUser.data.email = 'invalid-email';  // Invalid - no @
  invalidUser.data.age = -5;  // Invalid - negative age
  await invalidUser.save();  // Throws error
} catch (error) {
  console.error('Validation failed:', error.message);
}
```

### Web vs Admin SDK

The library provides separate implementations for client-side (web) and server-side (admin) with the **same API**:

```typescript
// Admin SDK (Firebase Functions, Node.js, Cloud Functions)
import {
  FirestoreDocument,
  FirestoreCollection,
  initializeFirestore,
  batchSave,
  batchDelete,
  newId
} from '@mzsn/firestore/admin';

// Web SDK (Browser, React, Vue, etc.)
import {
  FirestoreDocument,
  FirestoreCollection,
  initializeFirestore,
  batchSave,
  batchDelete,
  newId
} from '@mzsn/firestore/web';
```

**Web SDK Setup:**
```typescript
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { initializeFirestore } from '@mzsn/firestore/web';

const app = initializeApp({
  apiKey: 'your-api-key',
  projectId: 'your-project-id',
  // ... other config
});

const db = getFirestore(app);

// For development with emulator
connectFirestoreEmulator(db, 'localhost', 8080);

// Initialize ORM
initializeFirestore(db);
```

**Admin SDK Setup:**
```typescript
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirestore } from '@mzsn/firestore/admin';

const app = initializeApp();
const db = getFirestore(app);

// For development with emulator
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
db.settings({ host: 'localhost:8080', ssl: false });

// Initialize ORM
initializeFirestore(db);
```

### Auto-Generated Keys and Default Data

Use static getters for `defaultKey` and `defaultData` to generate dynamic values:

```typescript
import { FirestoreDocument } from '@mzsn/firestore/admin';

// Auto-generate IDs for each new instance
class Post extends FirestoreDocument<PostKey, PostData> {
  protected static pathTemplate = 'posts/{postId}';

  // Auto-generate unique ID for each new instance
  protected static get defaultKey(): PostKey {
    return { postId: timeId() };
  }

  // Fresh default data with current timestamp
  protected static get defaultData(): PostData {
    return {
      title: '',
      content: '',
      createdAt: new Date(),  // Fresh timestamp each time
    };
  }
}

// No need to specify key - auto-generated
const post = new Post();
post.data.title = 'My Post';
await post.save();  // Saved with auto-generated ID

// Singleton pattern - always same document
class AppConfig extends FirestoreDocument<ConfigKey, ConfigData> {
  protected static pathTemplate = 'config/{configId}';

  protected static get defaultKey(): ConfigKey {
    return { configId: 'app-settings' };  // Always references the same document
  }

  protected static get defaultData(): ConfigData {
    return {
      theme: 'light',
      language: 'en',
    };
  }
}

const config = new AppConfig();  // Always references 'app-settings'
await config.get();
```

## Core Concepts

### Path Templates

Define document paths using templates with placeholders:

```typescript
import { FirestoreDocument } from '@mzsn/firestore/web';
import type { FirestoreKey, FirestoreData } from '@mzsn/firestore/web';

interface PostKey extends FirestoreKey {
  userId: string;
  postId: string;
}

interface PostData extends FirestoreData {
  title: string;
  content: string;
}

class Post extends FirestoreDocument<PostKey, PostData> {
  protected static pathTemplate = 'users/{userId}/posts/{postId}';
}

// Creates document at: users/user123/posts/post456
const post = new Post({ userId: 'user123', postId: 'post456' });
```

### Change Tracking

All data access goes through a Proxy that automatically tracks changes:

```typescript
const user = new User({ id: 'user123' });
await user.get();

console.log(user.isDirty);  // false

user.data.name = 'Jane';
user.data.age = 30;

console.log(user.isDirty);  // true

await user.save();  // Only sends {name: 'Jane', age: 30} to Firestore
console.log(user.isDirty);  // false
```

## API Reference

### FirestoreDocument

#### Constructor

```typescript
constructor(key?, data?, exist?)
```

- `key`: Document key object or path string
- `data`: Initial data (optional)
- `exist`: Whether document exists (default: false)

#### Properties

- `data: Data` - Data proxy with change tracking
- `key: Key` - Document key object
- `id: string` - Document ID
- `exist: boolean` - Whether document exists in Firestore
- `isNew: boolean` - Whether document is new (not saved)
- `isDirty: boolean` - Whether document has unsaved changes
- `isLoaded: boolean` - Whether document has been loaded
- `reference: DocumentReference` - Firestore reference

#### Methods

##### `get(transaction?, cache?): Promise<this>`

Load document from Firestore.

```typescript
await user.get();  // Load from Firestore
await user.get(transaction);  // Load within transaction
await user.get(undefined, true);  // Use cache if already loaded
```

##### `save(force?, transaction?): Promise<void>`

Save changes to Firestore. Auto-detects whether to use `set()` or `update()`.

```typescript
await user.save();  // Update changed fields only
await user.save(true);  // Force full set operation
await user.save(false, transaction);  // Save within transaction
```

##### `set(data?, transaction?): Promise<void>`

Overwrite entire document.

```typescript
await user.set({ name: 'John', age: 30, email: 'john@example.com' });
await user.set(undefined, transaction);  // Set current data in transaction
```

##### `update(transaction?): Promise<void>`

Update only changed fields.

```typescript
user.data.name = 'Jane';
await user.update();  // Only updates 'name' field
```

##### `delete(transaction?): Promise<void>`

Delete document from Firestore.

```typescript
await user.delete();
await user.delete(transaction);
```

##### `watch(callback?): () => void`

Watch document for real-time updates. Returns unsubscribe function.

```typescript
const unsubscribe = user.watch((data) => {
  console.log('Updated:', data);
});

// Stop watching
unsubscribe();
```

##### `snapshot<T>(): AsyncGenerator<T>`

Async generator for real-time updates.

```typescript
for await (const user of new User({ id: 'user123' }).snapshot()) {
  console.log('Current:', user.data);
  if (someCondition) break;
}
```

##### `toObject(): Data`

Get a deep copy of document data.

```typescript
const userData = user.toObject();
```

#### Lifecycle Hooks

Override these methods in subclasses:

```typescript
import { FirestoreDocument } from '@mzsn/firestore/web';
import type { FirestoreKey, FirestoreData, FirestoreValue } from '@mzsn/firestore/web';

interface UserKey extends FirestoreKey {
  id: string;
}

interface UserData extends FirestoreData {
  name: string;
  email: string;
  age: number;
}

class User extends FirestoreDocument<UserKey, UserData> {
  protected static pathTemplate = 'users/{id}';

  // Validation before save
  protected beforeSave(): void {
    if (!this.data.email.includes('@')) {
      throw new Error('Invalid email');
    }
  }

  // Custom logic after save
  protected afterSave(): void {
    console.log('User saved:', this.id);
  }

  // Custom serialization
  protected serializeValue(value: FirestoreValue): FirestoreValue {
    // Date → Timestamp conversion is automatic
    return super.serializeValue(value);
  }

  // Custom deserialization
  protected unserializeValue(value: FirestoreValue): FirestoreValue {
    // Timestamp → Date conversion is automatic
    return super.unserializeValue(value);
  }
}
```

### FirestoreCollection

#### Constructor

```typescript
class UserCollection extends FirestoreCollection<UserKey, UserData, User> {
  protected static pathTemplate = 'users';  // or 'users/{userId}/posts'
  protected static documentClass = User;
}

// Usage
const users = new UserCollection();  // All documents
const users = new UserCollection(undefined, condition);  // With query condition
const userPosts = new UserCollection({ userId: 'user123' });  // For subcollections
```

**Parameters:**
- `key?: Key` - Collection key object for subcollections (optional)
- `condition?: Condition` - Query conditions (optional)

#### Properties

- `documents: Map<string, Document>` - Map of document ID to Document instance
- `reference: CollectionReference` - Firestore collection reference
- `key: Key | string[]` - Collection key
- `condition: Condition` - Query condition
- `isLoaded: boolean` - Whether documents have been loaded

#### Static Properties

- `pathTemplate: string` - Path template for building collection paths (e.g., 'users' or 'users/{userId}/posts')
- `documentClass: DocumentConstructor` - Document class constructor for creating document instances (required for inheritance pattern)

#### Methods

##### `get(cache?): Promise<this>`

Load documents matching query.

```typescript
class UserCollection extends FirestoreCollection<UserKey, UserData, User> {
  protected static pathTemplate = 'users';
  protected static documentClass = User;
}

const users = new UserCollection(undefined, {
  where: [{ fieldPath: 'age', opStr: '>=', value: 18 }],
  limit: 10
});
await users.get();

for (const [id, user] of users.documents) {
  console.log(id, user.data);
}

// Use cache to skip loading if already loaded
await users.get(true);
```

##### `add(data?, transaction?): Promise<Document | undefined>`

Create document with auto-generated ID.

```typescript
const user = await users.add({
  name: 'John',
  age: 30,
  email: 'john@example.com'
});
console.log('Created user:', user?.id);
```

##### `set(id, data, transaction?): Promise<Document | undefined>`

Create/update document with specific ID.

```typescript
const user = await users.set('user123', {
  name: 'Jane',
  age: 25,
  email: 'jane@example.com'
});
```

##### `delete(id, transaction?): Promise<void>`

Delete document by ID.

```typescript
await users.delete('user123');
```

##### `save(transaction?): Promise<void>`

Save all dirty documents in the collection.

```typescript
// Make changes to multiple documents
users.documents.get('user1')!.data.age = 30;
users.documents.get('user2')!.data.age = 25;

// Save all changes
await users.save();
```

##### `first(): Document | undefined`

Get the first document in the collection.

```typescript
const firstUser = users.first();
```

##### `find(id): Document | undefined`

Find a document by ID from loaded documents (cache only, doesn't query Firestore).

```typescript
const user = users.find('user123');
```

##### `toArray(): Document[]`

Convert documents map to array.

```typescript
const userArray = users.toArray();
```

##### `docs(force?): Promise<Document[]>`

Get all documents as an array, loading if necessary.

```typescript
const userArray = await users.docs();
const freshUserArray = await users.docs(true); // Force reload
```

##### `watch(callback): void`

Watch collection for real-time updates.

```typescript
users.watch((snapshot) => {
  console.log(`Collection has ${users.documents.size} documents`);
  console.log('Changes:', snapshot.docChanges());
});
```

##### `unwatch(): void`

Cancel all active snapshot listeners.

```typescript
users.unwatch();
```

##### `snapshot(): AsyncGenerator<Document[]>`

Async generator for real-time collection updates.

```typescript
for await (const documents of users.snapshot()) {
  console.log('Documents updated:', documents.length);
  for (const doc of documents) {
    console.log(doc.data);
  }
}
```

### Batch Operations

Batch operations are provided as standalone functions that handle Firestore's 500-document batch limit automatically.

```typescript
import { batchSave, batchDelete } from '@mzsn/firestore/admin';
```

#### `batchSave(documents): Promise<void>`

Save multiple documents in batches.

```typescript
const documents = [user1, user2, user3, /* ... up to 1000s ... */];

// Automatically chunks into batches of 500
await batchSave(documents);
```

#### `batchDelete(documents): Promise<void>`

Delete multiple documents in batches.

```typescript
const documentsToDelete = Array.from(users.documents.values());

// Automatically chunks into batches of 500
await batchDelete(documentsToDelete);
```

### Query Conditions

```typescript
interface Condition {
  where?: Array<{
    fieldPath: string | FieldPath;
    opStr: WhereFilterOp;  // '==', '!=', '<', '<=', '>', '>=', 'array-contains', 'in', etc.
    value: unknown;
  }>;
  orderBy?: {
    fieldPath: string | FieldPath;
    directionStr?: 'asc' | 'desc';
  };
  limit?: number;
  limitToLast?: number;
  startAfter?: DocumentSnapshot;
  startAt?: DocumentSnapshot;
  endBefore?: DocumentSnapshot;
  endAt?: DocumentSnapshot;
}
```

## Advanced Examples

### Nested Collections

```typescript
import { FirestoreDocument } from '@mzsn/firestore/web';
import type { FirestoreKey, FirestoreData } from '@mzsn/firestore/web';

interface CommentKey extends FirestoreKey {
  userId: string;
  postId: string;
  commentId: string;
}

interface CommentData extends FirestoreData {
  text: string;
  author: string;
  createdAt: Date;
}

class Comment extends FirestoreDocument<CommentKey, CommentData> {
  protected static pathTemplate = 'users/{userId}/posts/{postId}/comments/{commentId}';
}

const comment = new Comment({
  userId: 'user123',
  postId: 'post456',
  commentId: 'comment789'
});
```

### Transactions

```typescript
import { getFirestore } from 'firebase/firestore';
import { runTransaction } from 'firebase/firestore';

await runTransaction(getFirestore(), async (transaction) => {
  const sender = new User({ id: 'user1' });
  const receiver = new User({ id: 'user2' });

  await sender.get(transaction);
  await receiver.get(transaction);

  sender.data.balance -= 100;
  receiver.data.balance += 100;

  await sender.save(false, transaction);
  await receiver.save(false, transaction);
});
```

### Custom Validation

```typescript
import { FirestoreDocument } from '@mzsn/firestore/web';
import type { FirestoreKey, FirestoreData } from '@mzsn/firestore/web';

interface UserKey extends FirestoreKey {
  id: string;
}

interface UserData extends FirestoreData {
  name: string;
  email: string;
  age: number;
}

class User extends FirestoreDocument<UserKey, UserData> {
  protected static pathTemplate = 'users/{id}';

  protected beforeSave(): void {
    if (this.data.age < 0) {
      throw new Error('Age must be positive');
    }
    if (!this.data.email.includes('@')) {
      throw new Error('Invalid email');
    }
  }
}
```

### Real-time UI Updates

```typescript
// React example
function UserProfile({ userId }: { userId: string }) {
  const [userData, setUserData] = useState<UserData | null>(null);

  useEffect(() => {
    const user = new User({ id: userId });
    user.get();

    const unsubscribe = user.watch((data) => {
      setUserData(data);
    });

    return unsubscribe;
  }, [userId]);

  return <div>{userData?.name}</div>;
}
```

## Utility Functions

The library also exports utility functions:

```typescript
import {
  deepEqual,
  parseKey,
  buildPath,
  newId,
  timeId,
  AsyncQueue
} from '@mzsn/firestore/web';

// Generate random ID
const id = newId(20);  // 20-character random ID

// Generate time-based ID (sortable)
const timeBasedId = timeId(20);  // First 9 chars are timestamp

// Deep equality check
const isEqual = deepEqual(obj1, obj2);

// Parse path to key
const key = parseKey('users/user123/posts/post456', 'users/{userId}/posts/{postId}');
// => { userId: 'user123', postId: 'post456' }

// Build path from key
const path = buildPath({ userId: 'user123', postId: 'post456' }, 'users/{userId}/posts/{postId}');
// => 'users/user123/posts/post456'
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Clean
npm run clean
```

### Running Tests

This project includes comprehensive test files for both web and admin implementations.

#### 1. Start Firestore Emulator

In one terminal, start the Firestore emulator:

```bash
npm run emulator
```

This will start:
- Firestore Emulator on `localhost:8080`
- Emulator UI on `http://localhost:4000`

#### 2. Run Tests

In another terminal, run the tests:

```bash
# Run admin (firebase-admin) tests
npm run test:admin

# Run web (firebase) tests
npm run test:web

# Run both
npm run test:admin && npm run test:web
```

**Note**: Make sure the emulator is running before executing tests, otherwise you'll get connection errors.

#### Test Coverage

Both test files include the following test cases:

1. **CRUD Operations**
   - Creating documents with manual IDs
   - Creating documents with auto-generated IDs
   - Reading documents
   - Updating documents (dirty tracking)
   - Deleting documents

2. **Collection Operations**
   - Adding multiple documents
   - Querying with conditions
   - Filtering and ordering

3. **Change Tracking**
   - Verifying dirty state after load
   - Verifying dirty state after changes
   - Verifying dirty state after save

4. **Real-time Updates**
   - Watching document changes
   - Receiving snapshot updates
   - Unsubscribing from listeners

5. **Collection Inheritance Pattern**
   - Creating collections with keys
   - Querying with conditions
   - Direct usage without inheritance
   - Using string paths
   - Using string array keys

#### Test Files

Test files are located in the `test/` directory:
- `test/admin/test.ts` - Admin SDK integration tests
- `test/web/test.ts` - Web SDK integration tests
- `test/firebase.json` - Emulator configuration

Example test output:
```
✓ Connected to Firestore Emulator at localhost:8080

=== Testing CRUD Operations ===
Creating user with manual ID...
✓ User created: {
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  createdAt: 2025-10-20T15:00:54.953Z,
  updatedAt: 2025-10-20T15:00:54.953Z,
  _id: 'user123'
}

Creating user with auto-generated ID...
✓ Auto user created: {
  name: 'Auto User',
  email: 'auto@example.com',
  age: 25,
  createdAt: 2025-10-20T15:00:54.961Z,
  updatedAt: 2025-10-20T15:00:54.961Z,
  _id: 'gYgYmMi9TVTFOXxrEvmM'
}
✓ Auto-generated uid: gYgYmMi9TVTFOXxrEvmM

Updating user...
✓ Verified: {
  name: 'Jane Doe',
  age: 31,
  createdAt: 2025-10-20T15:00:54.953Z,
  updatedAt: 2025-10-20T15:00:54.973Z,  // Updated timestamp!
  _id: 'user123'
}

=== Testing Collection Operations ===
✓ Found 3 users:
  - Alice (25) [ZL6ql0Dn0td2suPDFeCl]
  - Charlie (28) [dblOR1bUfFTPpTQrP1i2]
  - Bob (35) [O1agEjATccrF072nYbfs]

✅ All tests passed!
```

## Project Structure

```
firestore-orm/
├── shared/         # Common code (types, utils, async-queue)
├── web/            # Client-side implementation (firebase/firestore)
├── admin/          # Server-side implementation (firebase-admin/firestore)
├── test/           # Test files (not published to npm)
│   ├── admin/test.ts
│   ├── web/test.ts
│   └── firebase.json
└── dist/           # Compiled output
    ├── shared/
    ├── web/
    └── admin/
```

## License

MIT
