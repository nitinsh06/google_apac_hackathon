import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import type { JournalEntry } from '../types.ts';
import firebaseConfigJson from '../../firebase-applet-config.json';

const firebaseConfig = {
  projectId: firebaseConfigJson.projectId,
  appId: firebaseConfigJson.appId,
  apiKey: firebaseConfigJson.apiKey,
  authDomain: firebaseConfigJson.authDomain,
  storageBucket: firebaseConfigJson.storageBucket,
  messagingSenderId: firebaseConfigJson.messagingSenderId,
};

// Initialize Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Initialize Cloud Firestore with specific databaseId if provided
export const db = firebaseConfigJson.firestoreDatabaseId
  ? getFirestore(app, firebaseConfigJson.firestoreDatabaseId)
  : getFirestore(app);

// Configure Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Authentication Helpers
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function logOut(): Promise<void> {
  await signOut(auth);
}

export function subscribeAuthState(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Strict Undefined-Stripping (Zero-Crash Payload Hygiene)
 * Recursively cleans any object before passing to Firestore.
 */
export function sanitizePayload<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizePayload(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = sanitizePayload(value);
      }
    }
    return cleaned as unknown as T;
  }
  return obj;
}

/**
 * Persists or updates a journal reflection entry in the user's isolated collection.
 * Uses atomic set with sanitizePayload.
 */
export async function saveJournalEntry(userId: string, entry: JournalEntry): Promise<void> {
  if (!userId) throw new Error('User ID is required to save journal entries.');
  if (!entry.id) throw new Error('Entry ID is required.');

  const sanitized = sanitizePayload(entry);
  const entryDocRef = doc(db, 'users', userId, 'reflections', entry.id);
  await setDoc(entryDocRef, sanitized, { merge: true });
}

/**
 * Deletes a journal reflection entry permanently.
 */
export async function deleteJournalEntry(userId: string, entryId: string): Promise<void> {
  if (!userId || !entryId) return;
  const entryDocRef = doc(db, 'users', userId, 'reflections', entryId);
  await deleteDoc(entryDocRef);
}

/**
 * Toggles the pinned status of a reflection.
 */
export async function togglePinEntry(userId: string, entryId: string, pinned: boolean): Promise<void> {
  if (!userId || !entryId) return;
  const entryDocRef = doc(db, 'users', userId, 'reflections', entryId);
  await updateDoc(entryDocRef, { pinned });
}

/**
 * Real-time subscription to user's journal entries sorted by update time.
 */
export function subscribeUserJournalEntries(
  userId: string,
  onSuccess: (entries: JournalEntry[]) => void,
  onError?: (err: Error) => void
) {
  if (!userId) {
    onSuccess([]);
    return () => {};
  }

  const reflectionsRef = collection(db, 'users', userId, 'reflections');
  const q = query(reflectionsRef, orderBy('updatedAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const entries: JournalEntry[] = [];
      snapshot.forEach((docSnap) => {
        entries.push(docSnap.data() as JournalEntry);
      });
      onSuccess(entries);
    },
    (err) => {
      console.error('Firestore onSnapshot error:', err);
      if (onError) onError(err);
    }
  );
}
