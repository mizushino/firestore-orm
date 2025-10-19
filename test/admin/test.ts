import type { FirestoreData, FirestoreKey } from '../../admin/types.js';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { FirestoreDocument, FirestoreCollection, initializeFirestore, batchDelete } from '../../admin/index.js';

// Initialize Firebase Admin with emulator
const app = initializeApp({
  projectId: 'demo-firestore-orm',
});

const db = getFirestore(app);

// Connect to Firestore Emulator
// Set environment variables or use settings
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
db.settings({
  host: 'localhost:8080',
  ssl: false,
});

console.log('✓ Connected to Firestore Emulator at localhost:8080');

// Initialize Firestore ORM
initializeFirestore(db);

// Define your key and data types
type UserKey = FirestoreKey & {
  uid: string;
};

interface UserData extends FirestoreData {
  name: string;
  email: string;
  age: number;
  createdAt: Date;
}

// Create Document class with path template
class User extends FirestoreDocument<UserKey, UserData> {
  protected static pathTemplate = 'test/{uid}';

  protected static get defaultData(): UserData {
    return {
      name: '',
      email: '',
      age: 0,
      createdAt: new Date(),
    };
  }
}

// Test functions
async function testCRUD(): Promise<void> {
  console.log('\n=== Testing CRUD Operations ===');

  // Create
  const user = new User({ uid: 'user123' });
  user.data.name = 'John Doe';
  user.data.email = 'john@example.com';
  user.data.age = 30;
  user.data.createdAt = new Date();

  console.log('Creating user...');
  await user.save();
  console.log('✓ User created:', user.toObject());

  // Read
  console.log('\nReading user...');
  const userRead = new User({ uid: 'user123' });
  await userRead.get();
  console.log('✓ User loaded:', userRead.toObject());

  // Assert user exists and has correct data
  if (!userRead.exist) {
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
  const userVerify = new User({ uid: 'user123' });
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
  const userDeleted = new User({ uid: 'user123' });
  await userDeleted.get();
  console.log('✓ User exists:', userDeleted.exist);

  // Assert user doesn't exist
  if (userDeleted.exist) {
    throw new Error('User should not exist after deletion');
  }

  console.log('✓ CRUD test completed (data preserved for inspection)');
}

async function testCollection(): Promise<void> {
  console.log('\n=== Testing Collection Operations ===');

  const users = new FirestoreCollection<UserKey, UserData, User>(User, ['test']);

  // Add multiple users
  console.log('Adding multiple users...');
  await users.add({
    name: 'Alice',
    email: 'alice@example.com',
    age: 25,
    createdAt: new Date(),
  });

  await users.add({
    name: 'Bob',
    email: 'bob@example.com',
    age: 35,
    createdAt: new Date(),
  });

  await users.add({
    name: 'Charlie',
    email: 'charlie@example.com',
    age: 28,
    createdAt: new Date(),
  });

  console.log('✓ Added 3 users');

  // Query users
  console.log('\nQuerying users (age >= 25)...');
  const queryUsers = new FirestoreCollection<UserKey, UserData, User>(User, ['test'], {
    where: [{ fieldPath: 'age', opStr: '>=', value: 25 }],
    orderBy: { fieldPath: 'age', directionStr: 'asc' },
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

  const user = new User({ uid: 'tracking-test' });
  user.data.name = 'Test User';
  user.data.email = 'test@example.com';
  user.data.age = 30;
  user.data.createdAt = new Date();

  await user.save();
  console.log('✓ User created');

  // Load and check dirty state
  const userLoad = new User({ uid: 'tracking-test' });
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

  const user = new User({ uid: 'realtime-test' });
  user.data.name = 'Realtime User';
  user.data.email = 'realtime@example.com';
  user.data.age = 30;
  user.data.createdAt = new Date();

  await user.save();
  console.log('✓ User created');

  // Watch for changes
  let updateCount = 0;
  const unsubscribe = user.watch((data) => {
    updateCount++;
    console.log(`✓ Update ${updateCount} received:`, data.name);
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

// Cleanup function to clear all test data before tests
async function cleanupTestData(): Promise<void> {
  console.log('\n=== Cleaning up existing test data ===');
  const users = new FirestoreCollection<UserKey, UserData, User>(User, ['test']);
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
