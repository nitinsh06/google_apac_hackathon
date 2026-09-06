import React, { useState, useMemo } from 'react';
import {
  Search,
  BookOpen,
  Calendar,
  MessageSquare,
  Trash2,
  Pin,
  Sparkles,
  ArrowRight,
  Filter,
  MapPin,
} from 'lucide-react';
import type { JournalEntry, JournalCategory } from '../types.ts';
import { deleteJournalEntryWithEvent, togglePinEntry } from '../lib/firebase.ts';

interface HistoryViewProps {
  userId: string;
  entries: JournalEntry[];
  onSelectEntry: (entry: JournalEntry) => void;
  onNewEntry: () => void;
}

const CATEGORIES: Array<JournalCategory | 'All'> = [
  'All',
  'Personal',
  'Work',
  'Ideas',
  'Gratitude',
  'Mindfulness',
];

export const HistoryView: React.FC<HistoryViewProps> = ({
  userId,
  entries,
  onSelectEntry,
  onNewEntry,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<JournalCategory | 'All'>('All');
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);

  // Filter and search entries
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      // Category filter
      if (selectedCategory !== 'All' && entry.category !== selectedCategory) {
        return false;
      }

      // Search text filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const titleMatch = (entry.title || '').toLowerCase().includes(q);
      const turnsMatch = entry.turns.some((t) => (t.text || '').toLowerCase().includes(q));
      const locationMatch =
        (entry.location?.name || '').toLowerCase().includes(q) ||
        (entry.location?.address || '').toLowerCase().includes(q);
      return titleMatch || turnsMatch || locationMatch;
    });
  }, [entries, selectedCategory, searchQuery]);

  const handleDelete = async (entryId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const entry = entries.find((candidate) => candidate.id === entryId);
    if (!entry) return;
    try {
      await deleteJournalEntryWithEvent(userId, entry);
      setEntryToDelete(null);
    } catch (err) {
      console.error('Failed to delete reflection entry:', err);
    }
  };

  const handleTogglePin = async (entry: JournalEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await togglePinEntry(userId, entry.id, !entry.pinned);
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  };

  return (
    <div className="flex-1 min-h-0 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 overflow-y-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <BookOpen className="w-4 h-4" />
            </div>
            Reflection Journal History
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {entries.length} {entries.length === 1 ? 'reflection' : 'reflections'} stored securely in
            your private Cloud Firestore vault.
          </p>
        </div>

        <button
          id="history-new-entry-btn"
          onClick={onNewEntry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg font-semibold text-xs shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>New Reflection</span>
        </button>
      </div>

      {/* Search and Category Filters */}
      <div className="bg-surface border border-slate-200 rounded-xl p-3 sm:p-4 mb-6 space-y-3 shadow-xs">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            id="history-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reflections by title, keyword, or insight..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <Filter className="w-3.5 h-3.5 text-slate-400 mr-1 shrink-0" />
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-accent text-accent-fg shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Entries List / Cards */}
      {filteredEntries.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-slate-300 rounded-2xl bg-surface/50">
          <BookOpen className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700">No reflections found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-6 leading-relaxed">
            {searchQuery || selectedCategory !== 'All'
              ? 'Try adjusting your search query or category filter.'
              : 'You have not created any journal entries yet. Start your first reflection with Gemini.'}
          </p>
          <button
            onClick={onNewEntry}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg font-semibold text-xs transition-colors cursor-pointer shadow-xs"
          >
            Start Your First Entry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredEntries.map((entry) => {
            const firstPrompt = entry.turns.find((t) => t.role === 'user')?.text || '';
            const lastAiReply =
              [...entry.turns].reverse().find((t) => t.role === 'model')?.text || '';

            return (
              <div
                key={entry.id}
                id={`journal-entry-card-${entry.id}`}
                onClick={() => onSelectEntry(entry)}
                className={`p-5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group relative ${
                  entry.pinned
                    ? 'bg-blue-50/30 border-blue-300 shadow-xs hover:shadow-sm'
                    : 'bg-surface border-slate-200 hover:border-blue-300 hover:shadow-sm'
                }`}
              >
                <div>
                  {/* Top metadata */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap max-w-[80%]">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase tracking-wide border border-slate-200">
                        {entry.category || 'Personal'}
                      </span>

                      {entry.location && (
                        <span
                          className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded border border-blue-200/60 flex items-center gap-1 max-w-[170px] truncate"
                          title={`Pinned location: ${entry.location.name}${entry.location.address ? ` (${entry.location.address})` : ''}`}
                        >
                          <MapPin className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                          <span className="truncate">{entry.location.name}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => handleTogglePin(entry, e)}
                        className={`p-1 rounded transition-colors ${
                          entry.pinned
                            ? 'text-blue-600 hover:text-blue-700'
                            : 'text-slate-400 hover:text-slate-700 opacity-0 group-hover:opacity-100'
                        }`}
                        title={entry.pinned ? 'Unpin reflection' : 'Pin to top'}
                      >
                        {entry.pinned ? (
                          <Pin className="w-3.5 h-3.5 fill-blue-600" />
                        ) : (
                          <Pin className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEntryToDelete(entry.id);
                        }}
                        className="p-1 text-slate-400 hover:text-red-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-base font-bold text-slate-800 group-hover:text-blue-600 transition-colors line-clamp-1 mb-2">
                    {entry.title || 'Untitled Reflection'}
                  </h3>

                  {/* Preview of prompt */}
                  {firstPrompt && (
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-3">
                      "{firstPrompt}"
                    </p>
                  )}

                  {/* AI Reply snippet */}
                  {lastAiReply && (
                    <div className="p-2.5 rounded-lg bg-blue-50/70 border border-blue-100 mb-3">
                      <span className="text-[10px] text-blue-700 font-bold uppercase tracking-wider flex items-center gap-1 mb-1">
                        <Sparkles className="w-3 h-3" /> Gemini Insight:
                      </span>
                      <p className="text-[11px] text-slate-700 line-clamp-2 leading-relaxed font-sans">
                        {lastAiReply.replace(/[*#_`]/g, '')}
                      </p>
                    </div>
                  )}
                </div>

                {/* Card Footer */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 mt-2">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 font-medium">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {new Date(entry.updatedAt || entry.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="flex items-center gap-1 font-medium">
                      <MessageSquare className="w-3 h-3 text-slate-400" />
                      {entry.turns.length} turns
                    </span>
                  </div>

                  <span className="inline-flex items-center gap-1 text-blue-600 font-semibold group-hover:translate-x-0.5 transition-transform">
                    <span>Open</span>
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </div>

                {/* Delete Confirmation Overlay */}
                {entryToDelete === entry.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute inset-0 bg-surface/95 rounded-xl p-4 flex flex-col items-center justify-center text-center z-10 shadow-lg border border-slate-200"
                  >
                    <p className="text-xs font-bold text-slate-800 mb-3">
                      Permanently delete this reflection?
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handleDelete(entry.id, e)}
                        className="px-3 py-1.5 bg-danger hover:bg-danger-strong text-white text-xs rounded-lg font-semibold transition-colors cursor-pointer shadow-xs"
                      >
                        Yes, Delete
                      </button>
                      <button
                        onClick={() => setEntryToDelete(null)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg font-medium transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
