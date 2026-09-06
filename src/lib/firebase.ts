import { signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import {
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
import { app, auth, db, googleProvider, sanitizePayload } from './firebaseApp.ts';
import { emitReflectionEvent, noteKnownEntries, classifyWrite } from './webhooks.ts';

export { app, auth, db, googleProvider, sanitizePayload };

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
 * Persists or updates a journal reflection entry in the user's isolated
 * collection, then announces the change to any configured webhooks. Delivery is
 * fire-and-forget: a webhook problem must never fail the user's save.
 */
export async function saveJournalEntry(userId: string, entry: JournalEntry): Promise<void> {
  if (!userId) throw new Error('User ID is required to save journal entries.');
  if (!entry.id) throw new Error('Entry ID is required.');

  // Classify before the write, while the previous state is still known.
  const event = classifyWrite(entry);

  const sanitized = sanitizePayload(entry);
  const entryDocRef = doc(db, 'users', userId, 'reflections', entry.id);
  await setDoc(entryDocRef, sanitized, { merge: true });

  if (event) void emitReflectionEvent(event, entry);
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
 * Deletes an entry and announces it. The caller passes the entry it had in hand,
 * because after the delete there is nothing left to describe.
 */
export async function deleteJournalEntryWithEvent(
  userId: string,
  entry: JournalEntry
): Promise<void> {
  await deleteJournalEntry(userId, entry.id);
  void emitReflectionEvent('reflection.deleted', entry);
}

/**
 * Toggles the pinned status of a reflection.
 */
export async function togglePinEntry(
  userId: string,
  entryId: string,
  pinned: boolean
): Promise<void> {
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
      // Seed what "already existed" looks like, so the next save can tell a
      // creation from an edit without an extra read.
      noteKnownEntries(entries);
      onSuccess(entries);
    },
    (err) => {
      console.error('Firestore onSnapshot error:', err);
      if (onError) onError(err);
    }
  );
}
