import React, { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import type { JournalEntry, UserProfile } from './types.ts';
import {
  subscribeAuthState,
  signInWithGoogle,
  logOut,
  subscribeUserJournalEntries,
} from './lib/firebase.ts';
import { Navbar } from './components/Navbar.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { ReflectionEditor } from './components/ReflectionEditor.tsx';
import { HistoryView } from './components/HistoryView.tsx';
import { AlertCircle } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // App State
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activeView, setActiveView] = useState<'editor' | 'history'>('editor');
  const [currentEntry, setCurrentEntry] = useState<JournalEntry | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // 1. Subscribe to Firebase Authentication state
  useEffect(() => {
    const unsubscribe = subscribeAuthState((user) => {
      setCurrentUser(user);
      setAuthLoading(false);
      setAuthError(null);

      if (user) {
        // Initialize new entry draft if none active
        setCurrentEntry((prev) => {
          if (prev && prev.userId === user.uid) return prev;
          return {
            id: `entry-${Date.now()}`,
            userId: user.uid,
            title: 'Untitled Reflection',
            category: 'Personal',
            turns: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        });
      } else {
        setCurrentEntry(null);
        setEntries([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Subscribe to real-time user-isolated Firestore entries
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeUserJournalEntries(
      currentUser.uid,
      (fetchedEntries) => {
        setEntries(fetchedEntries);
        setSyncError(null);

        // Keep currentEntry in sync if it was updated in Firestore
        setCurrentEntry((current) => {
          if (!current) return current;
          const remoteMatch = fetchedEntries.find((e) => e.id === current.id);
          if (remoteMatch && remoteMatch.updatedAt > current.updatedAt) {
            return remoteMatch;
          }
          return current;
        });
      },
      (err) => {
        console.error('Firestore synchronization error:', err);
        setSyncError('Could not sync entries with Cloud Firestore. Check security rules or network.');
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // Handle Google Sign-In
  const handleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Sign in failure:', err);
      // Clean readable error for user
      if (err.code === 'auth/popup-closed-by-user') {
        setAuthError('Sign-in cancelled. Please click the button again to continue.');
      } else if (err.code === 'auth/popup-blocked') {
        setAuthError('Sign-in popup blocked by browser. Please allow popups for this site.');
      } else {
        setAuthError(err.message || 'Failed to authenticate with Google.');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  // Handle Sign Out
  const handleSignOut = async () => {
    try {
      await logOut();
      setActiveView('editor');
    } catch (err: any) {
      console.error('Sign out error:', err);
    }
  };

  // Start a fresh new reflection
  const handleNewEntry = () => {
    if (!currentUser) return;
    const freshEntry: JournalEntry = {
      id: `entry-${Date.now()}`,
      userId: currentUser.uid,
      title: 'Untitled Reflection',
      category: 'Personal',
      turns: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setCurrentEntry(freshEntry);
    setActiveView('editor');
  };

  // Select an entry from history
  const handleSelectEntry = (entry: JournalEntry) => {
    setCurrentEntry(entry);
    setActiveView('editor');
  };

  // Update current active entry state locally
  const handleUpdateEntry = (updated: JournalEntry) => {
    setCurrentEntry(updated);
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === updated.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      }
      return [updated, ...prev];
    });
  };

  // Initial Auth Loading Screen
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-600">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-semibold text-slate-500 tracking-wide uppercase">
          Verifying secure session...
        </p>
      </div>
    );
  }

  const userProfile: UserProfile | null = currentUser
    ? {
        uid: currentUser.uid,
        displayName: currentUser.displayName,
        email: currentUser.email,
        photoURL: currentUser.photoURL,
      }
    : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-500/20 selection:text-blue-800">
      {/* Top Navigation Bar */}
      <Navbar
        user={userProfile}
        onSignOut={handleSignOut}
        onNewEntry={handleNewEntry}
        activeView={activeView}
        onSelectView={setActiveView}
        entryCount={entries.length}
      />

      {/* Sync Error Banner if any */}
      {syncError && (
        <div
          id="sync-error-banner"
          className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 flex items-center justify-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>{syncError}</span>
        </div>
      )}

      {/* Conditional Rendering: Unauthenticated Landing Page vs. Authenticated Dashboard */}
      {!currentUser ? (
        <LandingPage
          onSignIn={handleSignIn}
          isLoading={isSigningIn}
          errorMessage={authError}
        />
      ) : (
        <main className="flex-1 flex flex-col overflow-hidden">
          {activeView === 'editor' && currentEntry && (
            <ReflectionEditor
              userId={currentUser.uid}
              entry={currentEntry}
              onUpdateEntry={handleUpdateEntry}
            />
          )}

          {activeView === 'history' && (
            <HistoryView
              userId={currentUser.uid}
              entries={entries}
              onSelectEntry={handleSelectEntry}
              onNewEntry={handleNewEntry}
            />
          )}
        </main>
      )}
    </div>
  );
}
