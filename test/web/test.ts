import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

import { FirestoreDocument, FirestoreCollection, setupFirestore, batchDelete, newId } from '../../web';

// Initialize Firebase with dummy config (emulator doesn't need real credentials)
const app = initializeApp({
  projectId: 'demo-firestore-orm',
});

const db = getFirestore(app);

// Connect to Firestore Emulator
// IMPORTANT: This must be called BEFORE any Firestore operations
// and can only be called ONCE per Firestore instance
try {
  connectFirestoreEmulator(db, 'localhost', 8080);
  console.log('✓ Connected to Firestore Emulator at localhost:8080');
} catch (error) {
  // If already connected (e.g., in hot-reload scenarios), that's fine
  if (error instanceof Error && error.message.includes('Firestore has already been started')) {
    console.log('⚠ Emulator already connected');
  } else {
    console.error('❌ Failed to connect to emulator:', error);
    throw error;
  }
}

// Initialize Firestore ORM
setupFirestore(db);

// Define your key and data types
interface UserKey {
  uid: string;
}

interface UserData {
  name: string;
  email: string;
  age: number;
  createdAt: Date;
  updatedAt: Date;
}

// Create Document class with path template
class UserDocument extends FirestoreDocument<UserKey, UserData> {
  public static pathTemplate = 'test/{uid}';

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

// Create Collection class with inheritance pattern
class UserCollection extends FirestoreCollection<never, UserKey, UserData, UserDocument> {
  public static pathTemplate = 'test';
  public static documentClass = UserDocument;
}

// Test functions
async function testCRUD(): Promise<void> {
  console.log('\n=== Testing CRUD Operations ===');

  // Create with manual ID
  const user = new UserDocument({ uid: 'user123' });
  user.data.name = 'John Doe';
  user.data.email = 'john@example.com';
  user.data.age = 30;
  user.data.createdAt = new Date();

  console.log('Creating user with manual ID...');
  await user.save();
  console.log('✓ User created:', user.toObject());

  // Create with auto-generated ID
  const autoUser = new UserDocument();
  autoUser.data.name = 'Auto User';
  autoUser.data.email = 'auto@example.com';
  autoUser.data.age = 25;
  autoUser.data.createdAt = new Date();

  console.log('\nCreating user with auto-generated ID...');
  await autoUser.save();
  console.log('✓ Auto user created:', autoUser.toObject());
  const autoUserKey = autoUser.key as UserKey;
  console.log(`✓ Auto-generated uid: ${autoUserKey.uid}`);

  // Read
  console.log('\nReading user...');
  const userRead = new UserDocument({ uid: 'user123' });
  await userRead.get();
  console.log('✓ User loaded:', userRead.toObject());

  // Assert user exists and has correct data
  if (!userRead.exists) {
    throw new Error('User should exist after creation');
  }
  if (userRead.data.name !== 'John Doe') {
    throw new Error(`Expected name to be "John Doe", got "${userRead.data.name}"`);
  }
  if (userRead.data.age !== 30) {
    throw new Error(`Expected age to be 30, got ${userRead.data.age}`);
  }

  // Update
  console.log('\nUpdating user...');
  userRead.data.age = 31;
  userRead.data.name = 'Jane Doe';
  await userRead.save();
  console.log('✓ User updated (only changed fields)');

  // Verify update
  const userVerify = new UserDocument({ uid: 'user123' });
  await userVerify.get();
  console.log('✓ Verified:', userVerify.toObject());

  // Assert updates were saved
  if (userVerify.data.name !== 'Jane Doe') {
    throw new Error(`Expected name to be "Jane Doe", got "${userVerify.data.name}"`);
  }
  if (userVerify.data.age !== 31) {
    throw new Error(`Expected age to be 31, got ${userVerify.data.age}`);
  }

  // Delete
  console.log('\nDeleting user...');
  await userVerify.delete();
  console.log('✓ User deleted');

  // Verify deletion
  const userDeleted = new UserDocument({ uid: 'user123' });
  await userDeleted.get();
  console.log('✓ User exists:', userDeleted.exists);

  // Assert user doesn't exist
  if (userDeleted.exists) {
    throw new Error('User should not exist after deletion');
  }

  // Clean up auto-generated user
  await autoUser.delete();
  console.log('✓ Auto user deleted');

  console.log('✓ CRUD test completed');
}

async function testCollection(): Promise<void> {
  console.log('\n=== Testing Collection Operations ===');

  const users = new UserCollection();

  // Add multiple users
  console.log('Adding multiple users...');
  await users.add({
    name: 'Alice',
    email: 'alice@example.com',
    age: 25,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await users.add({
    name: 'Bob',
    email: 'bob@example.com',
    age: 35,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await users.add({
    name: 'Charlie',
    email: 'charlie@example.com',
    age: 28,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log('✓ Added 3 users');

  // Query users
  console.log('\nQuerying users (age >= 25)...');
  const queryUsers = new UserCollection({
    where: [['age', '>=', 25]],
    orderBy: ['age', 'asc'],
  });

  await queryUsers.get();
  console.log(`✓ Found ${queryUsers.documents.size} users:`);
  for (const [id, user] of queryUsers.documents) {
    console.log(`  - ${user.data.name} (${user.data.age}) [${id}]`);
  }

  // Assert correct number of users
  if (queryUsers.documents.size !== 3) {
    throw new Error(`Expected 3 users, got ${queryUsers.documents.size}`);
  }

  console.log('✓ Collection test completed (data preserved for inspection)');
}

async function testChangeTracking(): Promise<void> {
  console.log('\n=== Testing Change Tracking ===');

  const user = new UserDocument({ uid: 'tracking-test' });
  user.data.name = 'Test User';
  user.data.email = 'test@example.com';
  user.data.age = 30;
  user.data.createdAt = new Date();

  await user.save();
  console.log('✓ User created');

  // Load and check dirty state
  const userLoad = new UserDocument({ uid: 'tracking-test' });
  await userLoad.get();
  console.log('Is dirty after load:', userLoad.isDirty); // false

  // Assert not dirty after load
  if (userLoad.isDirty) {
    throw new Error('User should not be dirty after load');
  }

  // Make changes
  userLoad.data.name = 'Updated Name';
  console.log('Is dirty after change:', userLoad.isDirty); // true

  // Assert dirty after change
  if (!userLoad.isDirty) {
    throw new Error('User should be dirty after change');
  }

  // Save and check
  await userLoad.save();
  console.log('Is dirty after save:', userLoad.isDirty); // false

  // Assert not dirty after save
  if (userLoad.isDirty) {
    throw new Error('User should not be dirty after save');
  }

  console.log('✓ Change tracking works correctly (data preserved for inspection)');
}

async function testRealtime(): Promise<void> {
  console.log('\n=== Testing Real-time Updates ===');

  const user = new UserDocument({ uid: 'realtime-test' });
  user.data.name = 'Realtime User';
  user.data.email = 'realtime@example.com';
  user.data.age = 30;
  user.data.createdAt = new Date();

  await user.save();
  console.log('✓ User created');

  // Watch for changes
  let updateCount = 0;
  const unsubscribe = user.watch((data?: UserData) => {
    updateCount++;
    console.log(`✓ Update ${updateCount} received:`, data?.name);
  });

  // Make some updates
  await new Promise((resolve) => setTimeout(resolve, 100));
  user.data.name = 'Updated 1';
  await user.save();

  await new Promise((resolve) => setTimeout(resolve, 100));
  user.data.name = 'Updated 2';
  await user.save();

  await new Promise((resolve) => setTimeout(resolve, 100));

  // Stop watching
  unsubscribe();
  console.log('✓ Stopped watching');

  // Assert we received the expected number of updates
  if (updateCount !== 3) {
    throw new Error(`Expected 3 updates, got ${updateCount}`);
  }

  console.log('✓ Realtime test completed (data preserved for inspection)');
}

async function testCollectionInheritance(): Promise<void> {
  console.log('\n=== Testing Collection Inheritance Pattern ===');

  // Test 1: Create collection without key (all documents)
  console.log('\nTest 1: Collection without key');
  const allUsers = new UserCollection();

  await allUsers.add({
    name: 'Inheritance Test 1',
    email: 'test1@example.com',
    age: 20,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await allUsers.add({
    name: 'Inheritance Test 2',
    email: 'test2@example.com',
    age: 22,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await allUsers.get();
  console.log(`✓ Created ${allUsers.documents.size} users via inherited collection`);

  // Test 2: Query with condition
  console.log('\nTest 2: Collection with query condition');
  const filteredUsers = new UserCollection({
    where: [['age', '>=', 21]],
  });

  await filteredUsers.get();
  console.log(`✓ Found ${filteredUsers.documents.size} users with age >= 21`);
  for (const [id, user] of filteredUsers.documents) {
    console.log(`  - ${user.data.name} (age: ${user.data.age}) [${id}]`);
  }

  // Assert at least one user matches
  if (filteredUsers.documents.size === 0) {
    throw new Error('Expected at least one user with age >= 21');
  }

  // Test 3: Direct usage without inheritance (using default documentClass)
  console.log('\nTest 3: Direct usage without inheritance');
  class DirectCollection extends FirestoreCollection<never, UserKey, UserData, UserDocument> {
    // Only pathTemplate is defined, documentClass uses default FirestoreDocument
    public static pathTemplate = 'test';
  }

  const directUsers = new DirectCollection();
  await directUsers.get();
  console.log(`✓ Direct usage with minimal inheritance works: Found ${directUsers.documents.size} users`);

  // Test 4: No inheritance at all - using string path (simplest)
  console.log('\nTest 4: No inheritance - using string path');
  const noInheritanceUsers = new FirestoreCollection<never, UserKey, UserData, UserDocument>('test');
  await noInheritanceUsers.get();
  console.log(`✓ String path works: Found ${noInheritanceUsers.documents.size} users`);

  // Test 5: No inheritance - using string[] for key (also supported)
  console.log('\nTest 5: No inheritance - using string[] key');
  const arrayKeyUsers = new FirestoreCollection<never, UserKey, UserData, UserDocument>(['test']);
  await arrayKeyUsers.get();
  console.log(`✓ String array key works: Found ${arrayKeyUsers.documents.size} users`);

  console.log('\n✓ Collection inheritance test completed');
}

// Cleanup function to clear all test data before tests
async function cleanupTestData(): Promise<void> {
  console.log('\n=== Cleaning up existing test data ===');
  const users = new UserCollection();
  await users.get();

  if (users.documents.size > 0) {
    const keysToDelete = Array.from(users.documents.values());
    await batchDelete(keysToDelete);
    console.log(`✓ Deleted ${keysToDelete.length} existing users`);
  } else {
    console.log('✓ No existing data to clean up');
  }
}

// Run all tests
async function runTests(): Promise<void> {
  try {
    await cleanupTestData();
    await testCRUD();
    await testCollection();
    await testChangeTracking();
    await testRealtime();
    await testCollectionInheritance();

    console.log('\n✅ All tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

runTests();
