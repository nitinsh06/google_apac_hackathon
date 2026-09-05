import React from 'react';
import {
  Sparkles,
  LogOut,
  ShieldCheck,
  Database,
  MapPin,
  BookOpen,
  PenLine,
  LogIn,
} from 'lucide-react';
import type { UserProfile } from '../types.ts';

interface NavbarProps {
  user: UserProfile | null;
  isGuest?: boolean;
  onSignOut: () => void;
  onSignIn?: () => void;
  onNewEntry: () => void;
  activeView: 'editor' | 'history' | 'map';
  onSelectView: (view: 'editor' | 'history' | 'map') => void;
  entryCount: number;
  taggedCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  isGuest = false,
  onSignOut,
  onSignIn,
  onNewEntry,
  activeView,
  onSelectView,
  entryCount,
  taggedCount = 0,
}) => {
  const showNavTabs = Boolean(user || isGuest);

  return (
    <header
      id="app-navbar"
      className="sticky top-0 z-40 bg-white border-b border-slate-200 text-slate-900 shadow-xs"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-6">
          <div
            id="brand-logo-button"
            role="button"
            tabIndex={0}
            onClick={() => onSelectView(showNavTabs ? 'editor' : 'map')}
            className="flex items-center space-x-3 cursor-pointer group select-none"
          >
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-xs group-hover:bg-blue-700 transition-colors">
              <Sparkles className="w-4 h-4 text-white stroke-[2.4]" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-slate-800 flex items-center gap-2">
                ReflectAI
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 tracking-wide uppercase">
                  Gemini 3.6
                </span>
              </span>
            </div>
          </div>

          {/* Navigation tabs if authenticated or in guest preview mode (Desktop) */}
          {showNavTabs && (
            <nav className="hidden md:flex items-center space-x-1 bg-slate-100/80 p-1 rounded-lg border border-slate-200">
              <button
                id="nav-tab-editor"
                type="button"
                onClick={() => onSelectView('editor')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeView === 'editor'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <PenLine className="w-3.5 h-3.5" />
                <span>Current Reflection</span>
              </button>
              <button
                id="nav-tab-history"
                type="button"
                onClick={() => onSelectView('history')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeView === 'history'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Journal History</span>
                {entryCount > 0 && (
                  <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-slate-200 text-slate-700">
                    {entryCount}
                  </span>
                )}
              </button>
              <button
                id="nav-tab-map"
                type="button"
                onClick={() => onSelectView('map')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeView === 'map'
                    ? 'bg-white text-blue-700 shadow-xs ring-1 ring-blue-500/20'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                <span>Places Map</span>
                {taggedCount > 0 && (
                  <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-blue-100 text-blue-700">
                    {taggedCount}
                  </span>
                )}
              </button>
            </nav>
          )}
        </div>

        {/* Right side controls */}
        {user ? (
          <div className="flex items-center space-x-3 sm:space-x-4">
            {isGuest ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 hidden sm:inline-block">
                  Guest Demo Mode
                </span>
                {onSignIn && (
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <LogIn className="w-3 h-3" />
                    <span>Sign In to Save</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                <button
                  id="nav-new-entry-btn"
                  onClick={onNewEntry}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-xs cursor-pointer"
                >
                  <span>+ New Reflection</span>
                </button>

                {/* Firestore status indicator badge */}
                <div
                  id="firestore-status-badge"
                  className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase tracking-wide border border-slate-200"
                  title="Cloud Firestore User-Isolated Storage active"
                >
                  <Database className="w-3 h-3 text-slate-500" />
                  <span>Firestore Synced</span>
                </div>
              </>
            )}

            {/* User profile dropdown / info */}
            <div className="flex items-center space-x-3 pl-2 border-l border-slate-200">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-9 h-9 rounded-full border border-slate-300 object-cover shadow-xs"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-xs font-bold text-slate-600">
                  {(user.displayName || user.email || 'U').slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="hidden xl:block text-left">
                <p className="text-xs font-semibold text-slate-800 leading-tight">
                  {user.displayName || 'User'}
                </p>
                <p className="text-[11px] text-slate-500 leading-tight truncate max-w-[140px]">
                  {user.email}
                </p>
              </div>

              <button
                id="sign-out-btn"
                onClick={onSignOut}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => onSelectView('map')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold border border-blue-200 transition-colors cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              <span>Explore Places Map</span>
            </button>
          </div>
        )}
      </div>

      {/* Mobile Navigation Strip */}
      {showNavTabs && (
        <div className="md:hidden border-t border-slate-200 bg-slate-50 px-3 py-1.5 flex items-center justify-around gap-1">
          <button
            id="mobile-nav-tab-editor"
            type="button"
            onClick={() => onSelectView('editor')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center gap-1 cursor-pointer transition-colors ${
              activeView === 'editor'
                ? 'bg-white text-blue-700 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PenLine className="w-3 h-3" />
            <span>Reflection</span>
          </button>
          <button
            id="mobile-nav-tab-history"
            type="button"
            onClick={() => onSelectView('history')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center gap-1 cursor-pointer transition-colors ${
              activeView === 'history'
                ? 'bg-white text-blue-700 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3 h-3" />
            <span>History</span>
            {entryCount > 0 && (
              <span className="text-[10px] font-bold px-1 rounded-full bg-slate-200 text-slate-700">
                {entryCount}
              </span>
            )}
          </button>
          <button
            id="mobile-nav-tab-map"
            type="button"
            onClick={() => onSelectView('map')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center gap-1 cursor-pointer transition-colors ${
              activeView === 'map'
                ? 'bg-white text-blue-700 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MapPin className="w-3 h-3 text-blue-600" />
            <span>Map</span>
            {taggedCount > 0 && (
              <span className="text-[10px] font-bold px-1 rounded-full bg-blue-100 text-blue-700">
                {taggedCount}
              </span>
            )}
          </button>
        </div>
      )}
    </header>
  );
};
