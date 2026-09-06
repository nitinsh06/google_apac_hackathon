import React, { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import {
  subscribeAuthState,
  subscribeUserJournalEntries,
  signInWithGoogle,
  logOut,
} from './lib/firebase.ts';
import type { JournalEntry, JournalLocation, UserProfile } from './types.ts';
import { Navbar } from './components/Navbar.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { ReflectionEditor } from './components/ReflectionEditor.tsx';
import { HistoryView } from './components/HistoryView.tsx';
import { PlacesMapView } from './components/PlacesMapView.tsx';
import { ProfileView } from './components/ProfileView.tsx';
import { SAMPLE_ENTRIES } from './lib/samplePlaces.ts';
import { AlertCircle } from 'lucide-react';

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(false);

  // App State
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activeView, setActiveView] = useState<'editor' | 'history' | 'map' | 'profile'>('editor');
  const [currentEntry, setCurrentEntry] = useState<JournalEntry | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // 1. Subscribe to Firebase Authentication state
  useEffect(() => {
    const unsubscribe = subscribeAuthState((user) => {
      setCurrentUser(user);
      setAuthLoading(false);
      setAuthError(null);

      if (user) {
        setIsGuestMode(false);
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
        if (!isGuestMode) {
          setCurrentEntry(null);
          setEntries([]);
        }
      }
    });

    return () => unsubscribe();
  }, [isGuestMode]);

  // 2. Subscribe to real-time user-isolated Firestore entries when signed in
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
      if (currentUser) {
        await logOut();
      }
      setIsGuestMode(false);
      setActiveView('editor');
    } catch (err: any) {
      console.error('Sign out error:', err);
    }
  };

  // Start Explore Demo / Guest Mode
  const handleExploreDemo = () => {
    setIsGuestMode(true);
    const demoEntries = SAMPLE_ENTRIES;
    setEntries(demoEntries);
    if (!currentEntry) {
      setCurrentEntry(demoEntries[0] || null);
    }
    setActiveView('map');
  };

  // Start a fresh new reflection
  const handleNewEntry = () => {
    const uid = currentUser ? currentUser.uid : 'guest-explorer';
    const freshEntry: JournalEntry = {
      id: `entry-${Date.now()}`,
      userId: uid,
      title: 'Untitled Reflection',
      category: 'Personal',
      turns: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setCurrentEntry(freshEntry);
    setActiveView('editor');
  };

  // Select an entry from history or map
  const handleSelectEntry = (entry: JournalEntry) => {
    setCurrentEntry(entry);
    setActiveView('editor');
  };

  // Start a new reflection at a specific map location
  const handleNewEntryAtLocation = (loc: JournalLocation) => {
    const uid = currentUser ? currentUser.uid : 'guest-explorer';
    const freshEntry: JournalEntry = {
      id: `entry-${Date.now()}`,
      userId: uid,
      title: `Reflection at ${loc.name}`,
      category: 'Personal',
      turns: [],
      location: loc,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setCurrentEntry(freshEntry);
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

  const effectiveUserId = currentUser ? currentUser.uid : 'guest-explorer';
  const isDemo = !currentUser && isGuestMode;

  const userProfile: UserProfile | null = currentUser
    ? {
        uid: currentUser.uid,
        displayName: currentUser.displayName,
        email: currentUser.email,
        photoURL: currentUser.photoURL,
        createdAt: currentUser.metadata.creationTime
          ? new Date(currentUser.metadata.creationTime).toISOString()
          : null,
      }
    : isGuestMode
    ? {
        uid: 'guest-explorer',
        displayName: 'Guest Explorer',
        email: 'preview@guest.demo',
        photoURL: null,
      }
    : null;

  const taggedCount = entries.filter((e) => !!e.location).length;
  const isAuthenticatedOrGuest = Boolean(currentUser || isGuestMode);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-500/20 selection:text-blue-800">
      {/* Top Navigation Bar */}
      <Navbar
        user={userProfile}
        isGuest={isDemo}
        onSignIn={handleSignIn}
        onNewEntry={handleNewEntry}
        activeView={activeView}
        onSelectView={(view) => {
          if (!currentUser && !isGuestMode) {
            handleExploreDemo();
          }
          setActiveView(view);
        }}
        entryCount={entries.length}
        taggedCount={taggedCount}
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

      {/* Conditional Rendering: Unauthenticated Landing Page vs. Authenticated/Guest Dashboard */}
      {!isAuthenticatedOrGuest ? (
        <LandingPage
          onSignIn={handleSignIn}
          onExploreDemo={handleExploreDemo}
          isLoading={isSigningIn}
          errorMessage={authError}
        />
      ) : (
        <main className="flex-1 flex flex-col overflow-hidden">
          {activeView === 'editor' && currentEntry && (
            <ReflectionEditor
              userId={effectiveUserId}
              entry={currentEntry}
              onUpdateEntry={handleUpdateEntry}
            />
          )}

          {activeView === 'history' && (
            <HistoryView
              userId={effectiveUserId}
              entries={entries}
              onSelectEntry={handleSelectEntry}
              onNewEntry={handleNewEntry}
            />
          )}

          {activeView === 'profile' && userProfile && (
            <ProfileView
              user={userProfile}
              isGuest={isDemo}
              entries={entries}
              onSignOut={handleSignOut}
              onSignIn={handleSignIn}
            />
          )}

          {activeView === 'map' && (
            <PlacesMapView
              userId={effectiveUserId}
              isGuest={isDemo}
              entries={entries}
              onSelectEntry={handleSelectEntry}
              onNewEntryAtLocation={handleNewEntryAtLocation}
              onNewEntry={handleNewEntry}
            />
          )}
        </main>
      )}
    </div>
  );
}

export default App;
