# Firestore ORM

TypeScript-first ORM library for Firestore with support for both client-side (web) and server-side (admin) environments.

## Features

- **ActiveRecord Pattern**: Document-based ORM with change tracking via Proxy
- **Repository Pattern**: Collection-based queries with powerful filtering
- **Dual SDK Support**: Works with both `firebase` (web) and `firebase-admin` (server)
- **Type Safe**: Full TypeScript support with generics
- **Automatic Change Tracking**: Proxy-based dirty checking - only modified fields are saved
- **Real-time Updates**: Built-in snapshot listeners with async generators
- **Batch Operations**: Efficient bulk operations with automatic 500-document chunking
- **Transaction Support**: First-class transaction and WriteBatch support
- **Path Templates**: Flexible document path configuration with placeholders

## Installation

```bash
npm install firestore-orm
```

### For Web/Client Projects

```bash
npm install firestore-orm firebase
```

### For Server/Functions Projects

```bash
npm install firestore-orm firebase-admin
```

## Quick Start

### Web (Client-Side)

```typescript
import { FirestoreDocument, FirestoreCollection } from 'firestore-orm/web';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Initialize Firebase
initializeApp({ /* config */ });

// Define your key and data interfaces
import { FirestoreKey } from 'firestore-orm/web';

interface UserKey extends FirestoreKey {
  uid: string;
}

interface UserData {
  name: string;
  email: string;
  age: number;
}

// Create Document class with path template
class User extends FirestoreDocument<UserKey, UserData> {
  protected static pathTemplate = 'users/{uid}';
}

// Usage
const user = new User({ uid: 'user123' });
await user.get();  // Load from Firestore

user.data.name = 'John Doe';  // Changes tracked automatically
await user.save();  // Only saves 'name' field
```

### Admin (Server-Side)

```typescript
import { FirestoreDocument } from 'firestore-orm/admin';
import { initializeApp } from 'firebase-admin/app';

initializeApp();

// Same interfaces as web
import { FirestoreKey } from 'firestore-orm/admin';

interface UserKey extends FirestoreKey {
  uid: string;
}

interface UserData {
  name: string;
  email: string;
  age: number;
}

class User extends FirestoreDocument<UserKey, UserData> {
  protected static pathTemplate = 'users/{uid}';
}

const user = new User({ uid: 'user123' });
await user.get();
user.data.email = 'newemail@example.com';
await user.save();  // Only updates 'email' field
```

## Core Concepts

### Path Templates

Define document paths using templates with placeholders:

```typescript
import { FirestoreKey } from 'firestore-orm/web';

interface PostKey extends FirestoreKey {
  userId: string;
  postId: string;
}

interface PostData {
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
import { FirestoreKey } from 'firestore-orm/web';

interface UserKey extends FirestoreKey {
  id: string;
}

interface UserData {
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
constructor(reference?, condition?)
```

- `reference`: Firestore CollectionReference or Query (optional)
- `condition`: Query conditions (optional)

#### Properties

- `documents: Map<string, Document>` - Map of document ID to Document instance
- `reference: CollectionReference | Query` - Firestore reference

#### Static Properties

- `DocumentClass: typeof FirestoreDocument` - Document class to use
- `path: string` - Collection path (e.g., 'users')

#### Methods

##### `get(): Promise<void>`

Load documents matching query.

```typescript
const users = new UserCollection(undefined, {
  where: [{ fieldPath: 'age', opStr: '>=', value: 18 }],
  limit: 10
});
await users.get();

for (const [id, user] of users.documents) {
  console.log(id, user.data);
}
```

##### `add(data): Promise<string>`

Create document with auto-generated ID.

```typescript
const id = await users.add({
  name: 'John',
  age: 30,
  email: 'john@example.com'
});
```

##### `set(key, data): Promise<void>`

Create/update document with specific ID.

```typescript
await users.set({ id: 'user123' }, {
  name: 'Jane',
  age: 25,
  email: 'jane@example.com'
});
```

##### `delete(key): Promise<void>`

Delete document by key.

```typescript
await users.delete({ id: 'user123' });
```

##### `batchAdd(dataArray): Promise<void>`

Batch create multiple documents. Automatically chunks into 500-document batches.

```typescript
const newUsers = Array.from({ length: 1000 }, (_, i) => ({
  name: `User ${i}`,
  age: 20 + i,
  email: `user${i}@example.com`
}));

await users.batchAdd(newUsers);  // Creates 1000 users in 2 batches
```

##### `batchSet(dataArray): Promise<void>`

Batch set multiple documents with specific IDs.

```typescript
await users.batchSet([
  { key: { id: 'user1' }, data: { name: 'User 1', age: 20, email: 'user1@example.com' } },
  { key: { id: 'user2' }, data: { name: 'User 2', age: 21, email: 'user2@example.com' } }
]);
```

##### `batchDelete(keys): Promise<void>`

Batch delete multiple documents.

```typescript
await users.batchDelete([
  { id: 'user1' },
  { id: 'user2' },
  { id: 'user3' }
]);
```

##### `watch(callback?): () => void`

Watch collection for real-time updates.

```typescript
users.watch(() => {
  console.log(`Collection has ${users.documents.size} documents`);
});
```

##### `snapshot<T>(): AsyncGenerator<T>`

Async generator for collection snapshots.

```typescript
for await (const snapshot of users.snapshot()) {
  for (const change of snapshot.docChanges()) {
    console.log(change.type, change.doc.data());
  }
}
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
import { FirestoreKey } from 'firestore-orm/web';

interface CommentKey extends FirestoreKey {
  userId: string;
  postId: string;
  commentId: string;
}

interface CommentData {
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
import { FirestoreKey } from 'firestore-orm/web';

interface UserKey extends FirestoreKey {
  id: string;
}

interface UserData {
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

The library also exports utility functions from `shared/`:

```typescript
import {
  deepEqual,
  parseKey,
  buildPath,
  newId,
  timeId,
  AsyncQueue
} from 'firestore-orm/web';

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

This project includes test files for both web and admin implementations.

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

# Run web (firebase) tests (coming soon)
# npm run test:web
```

**Note**: Make sure the emulator is running before executing tests, otherwise you'll get connection errors.

#### Test Files

Test files are located in the `test/` directory:
- `test/admin/test.ts` - Admin SDK tests
- `test/web/test.ts` - Web SDK tests
- `test/firebase.json` - Emulator configuration

You can also run test files directly:

```bash
npx tsx test-admin.ts
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
