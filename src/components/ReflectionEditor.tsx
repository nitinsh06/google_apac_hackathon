import React, { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import {
  Sparkles,
  Send,
  RefreshCw,
  Copy,
  Check,
  Brain,
  Lightbulb,
  FileText,
  MessageSquare,
  Bookmark,
  AlertTriangle,
  RotateCcw,
  Tag,
  Wand2,
  MapPin,
} from 'lucide-react';
import type { JournalEntry, JournalTurn, ReflectionMode, JournalCategory, JournalLocation } from '../types.ts';
import { requestGeminiReflection, requestSuggestedTitle } from '../lib/geminiApi.ts';
import { saveJournalEntry } from '../lib/firebase.ts';
import { LocationPickerModal } from './LocationPickerModal.tsx';

interface ReflectionEditorProps {
  userId: string;
  entry: JournalEntry;
  onUpdateEntry: (updated: JournalEntry) => void;
  onSaveConfirmed?: () => void;
}

const CATEGORIES: JournalCategory[] = ['Personal', 'Work', 'Ideas', 'Gratitude', 'Mindfulness'];

const MODES: Array<{
  id: ReflectionMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  {
    id: 'reflect',
    label: 'Reflect',
    icon: Brain,
    description: 'Empathetic mirroring, introspective reframing & questions',
  },
  {
    id: 'brainstorm',
    label: 'Brainstorm',
    icon: Lightbulb,
    description: 'Creative exploration, diverse angles & practical steps',
  },
  {
    id: 'summarize',
    label: 'Summarize',
    icon: FileText,
    description: 'Executive summary, key insights & structured action bullets',
  },
  {
    id: 'chat',
    label: 'Dialogue',
    icon: MessageSquare,
    description: 'Open conversational dialogue across the session',
  },
];

export const ReflectionEditor: React.FC<ReflectionEditorProps> = ({
  userId,
  entry,
  onUpdateEntry,
}) => {
  const [inputText, setInputText] = useState('');
  const [currentMode, setCurrentMode] = useState<ReflectionMode>('reflect');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuggestingTitle, setIsSuggestingTitle] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null);
  const [pendingUnsavedEntry, setPendingUnsavedEntry] = useState<JournalEntry | null>(null);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

  const turnsEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest turn
  useEffect(() => {
    turnsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entry.turns.length, isGenerating]);

  // Adjust textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 240)}px`;
    }
  }, [inputText]);

  // Handle Location Change & Persistence
  const handleSaveLocation = async (loc: JournalLocation | null) => {
    const updated: JournalEntry = {
      ...entry,
      location: loc,
      updatedAt: new Date().toISOString(),
    };
    onUpdateEntry(updated);
    try {
      setSaveStatus('saving');
      await saveJournalEntry(userId, updated);
      setSaveStatus('saved');
      setSaveErrorMessage(null);
    } catch (err: any) {
      console.error('Error saving location to entry:', err);
      setSaveStatus('error');
      setSaveErrorMessage('Failed to save pinned location to Firestore.');
      setPendingUnsavedEntry(updated);
    }
  };

  // Handle Title Change
  const handleTitleChange = async (newTitle: string) => {
    const updated: JournalEntry = {
      ...entry,
      title: newTitle,
      updatedAt: new Date().toISOString(),
    };
    onUpdateEntry(updated);
    try {
      setSaveStatus('saving');
      await saveJournalEntry(userId, updated);
      setSaveStatus('saved');
      setSaveErrorMessage(null);
    } catch (err: any) {
      console.error('Error saving title:', err);
      setSaveStatus('error');
      setSaveErrorMessage('Failed to save title to Firestore. Check connection.');
      setPendingUnsavedEntry(updated);
    }
  };

  // Handle Category Change
  const handleCategoryChange = async (category: JournalCategory) => {
    const updated: JournalEntry = {
      ...entry,
      category,
      updatedAt: new Date().toISOString(),
    };
    onUpdateEntry(updated);
    try {
      setSaveStatus('saving');
      await saveJournalEntry(userId, updated);
      setSaveStatus('saved');
      setSaveErrorMessage(null);
    } catch (err: any) {
      console.error('Error saving category:', err);
      setSaveStatus('error');
      setSaveErrorMessage('Failed to save category to Firestore.');
      setPendingUnsavedEntry(updated);
    }
  };

  // Auto-suggest title using Gemini
  const handleAutoSuggestTitle = async () => {
    if (isSuggestingTitle) return;
    const sampleText =
      entry.turns.map((t) => t.text).join('\n') || inputText || 'Journal Reflection';
    if (!sampleText.trim()) return;

    setIsSuggestingTitle(true);
    try {
      const suggested = await requestSuggestedTitle(sampleText);
      if (suggested) {
        await handleTitleChange(suggested);
      }
    } catch (err) {
      console.error('Title suggestion error:', err);
    } finally {
      setIsSuggestingTitle(false);
    }
  };

  // Retry persistence in case of failure
  const handleRetrySave = async () => {
    if (!pendingUnsavedEntry) return;
    try {
      setSaveStatus('saving');
      await saveJournalEntry(userId, pendingUnsavedEntry);
      setSaveStatus('saved');
      setSaveErrorMessage(null);
      setPendingUnsavedEntry(null);
    } catch (err: any) {
      console.error('Retry save failed:', err);
      setSaveStatus('error');
      setSaveErrorMessage(err.message || 'Retry save failed. Please try again.');
    }
  };

  // Copy response turn
  const handleCopyTurn = (turnId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTurnId(turnId);
    setTimeout(() => setCopiedTurnId(null), 2000);
  };

  // Submit Prompt to Gemini with Guaranteed Transaction Persistence
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedInput = inputText.trim();
    if (!trimmedInput || isGenerating) return;

    setIsGenerating(true);
    setSaveStatus('saving');
    setSaveErrorMessage(null);

    const userTurn: JournalTurn = {
      id: `turn-user-${Date.now()}`,
      role: 'user',
      text: trimmedInput,
      timestamp: new Date().toISOString(),
      mode: currentMode,
    };

    // Prepare multi-turn history for Gemini API
    const historyPayload = entry.turns.map((turn) => ({
      role: turn.role,
      text: turn.text,
    }));

    try {
      // 1. Generate response via backend Gemini API
      const geminiResult = await requestGeminiReflection({
        prompt: trimmedInput,
        history: historyPayload,
        mode: currentMode,
        location: entry.location || null,
      });

      const modelTurn: JournalTurn = {
        id: `turn-model-${Date.now()}`,
        role: 'model',
        text: geminiResult.response,
        timestamp: new Date().toISOString(),
        mode: currentMode,
        modelUsed: geminiResult.modelUsed,
      };

      // Determine updated title if default
      let newTitle = entry.title;
      if (entry.turns.length === 0 && (entry.title === 'Untitled Reflection' || !entry.title)) {
        newTitle =
          trimmedInput.length > 40 ? `${trimmedInput.slice(0, 37)}...` : trimmedInput;
      }

      const updatedEntry: JournalEntry = {
        ...entry,
        title: newTitle,
        turns: [...entry.turns, userTurn, modelTurn],
        updatedAt: new Date().toISOString(),
      };

      // 2. Guaranteed Transaction Verification: Persist both user input AND AI output to Firestore
      await saveJournalEntry(userId, updatedEntry);

      // 3. Settle and update state only upon verified database commit
      onUpdateEntry(updatedEntry);
      setInputText(''); // Safely clear input only after confirmed persistence
      setSaveStatus('saved');
      setPendingUnsavedEntry(null);
    } catch (err: any) {
      console.error('Transaction failure during reflection generation or save:', err);
      setSaveStatus('error');
      setSaveErrorMessage(
        err.message || 'Operation failed. Your input has been preserved. Please retry.'
      );

      // Keep user input in buffer, do not clear
      const fallbackEntry: JournalEntry = {
        ...entry,
        turns: [...entry.turns, userTurn],
        updatedAt: new Date().toISOString(),
      };
      setPendingUnsavedEntry(fallbackEntry);
    } finally {
      setIsGenerating(false);
    }
  };

  // Keyboard shortcut: Cmd/Ctrl + Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col max-w-5xl mx-auto w-full px-4 sm:px-6 py-4 overflow-hidden">
      {/* Top Header Card: Title, Category, Persistence Status */}
      <div
        id="reflection-meta-card"
        className="bg-surface border border-slate-200 rounded-xl p-4 mb-3 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Editable Title */}
          <div className="flex-1 flex items-center gap-2">
            <input
              id="reflection-title-input"
              type="text"
              value={entry.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Title your reflection..."
              className="bg-transparent text-lg font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 rounded px-2 py-0.5 w-full max-w-lg transition-all"
            />
            <button
              id="suggest-title-btn"
              onClick={handleAutoSuggestTitle}
              disabled={isSuggestingTitle}
              title="AI suggest a concise title"
              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer disabled:opacity-40"
            >
              <Wand2 className={`w-4 h-4 ${isSuggestingTitle ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>

          {/* Category Badges, Location Pin & Save Status */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Location Pinning Chip */}
            <button
              id="reflection-location-pin-btn"
              type="button"
              onClick={() => setIsLocationModalOpen(true)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                entry.location
                  ? 'bg-blue-50/90 border-blue-200 text-blue-700 font-semibold hover:bg-blue-100/80 shadow-2xs'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-600 font-medium hover:bg-slate-100'
              }`}
              title={
                entry.location
                  ? `Pinned Location: ${entry.location.name}${entry.location.address ? ` (${entry.location.address})` : ''} - Click to view or adjust map`
                  : 'Pin a Google Maps location to this reflection'
              }
            >
              <MapPin className={`w-3.5 h-3.5 ${entry.location ? 'text-blue-600 fill-blue-100' : 'text-slate-400'}`} />
              <span className="max-w-[120px] sm:max-w-[150px] truncate">
                {entry.location ? entry.location.name : 'Pin Location'}
              </span>
            </button>

            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              <Tag className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  id={`cat-badge-${cat.toLowerCase()}`}
                  onClick={() => handleCategoryChange(cat)}
                  className={`text-xs px-2.5 py-1 rounded-full transition-all cursor-pointer ${
                    entry.category === cat
                      ? 'bg-accent text-accent-fg font-semibold shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Firestore Status */}
            <div className="flex items-center text-xs">
              {saveStatus === 'saving' && (
                <span className="flex items-center gap-1.5 text-blue-600 font-medium">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span className="hidden sm:inline">Saving...</span>
                </span>
              )}
              {saveStatus === 'saved' && (
                <span
                  id="firestore-saved-indicator"
                  className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase tracking-wide border border-slate-200 flex items-center gap-1"
                  title="Verified saved to Firestore"
                >
                  <Bookmark className="w-3 h-3 text-blue-600" />
                  <span className="hidden sm:inline">Synced</span>
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="px-2 py-0.5 bg-red-50 text-red-700 text-[10px] font-bold rounded uppercase tracking-wide border border-red-200 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span className="hidden sm:inline">Unsaved</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Persistence Error Banner with Retry */}
        {saveStatus === 'error' && (
          <div
            id="persistence-error-banner"
            className="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{saveErrorMessage || 'Failed to sync with Cloud Firestore.'}</span>
            </div>
            {pendingUnsavedEntry && (
              <button
                id="retry-save-btn"
                onClick={handleRetrySave}
                className="px-2.5 py-1 bg-danger hover:bg-danger-strong text-white rounded text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shrink-0 shadow-xs"
              >
                <RotateCcw className="w-3 h-3" /> Retry Save
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mode Selector Chips */}
      <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1 hidden sm:inline text-[11px]">
          Focus Mode:
        </span>
        {MODES.map((m) => {
          const Icon = m.icon;
          const isActive = currentMode === m.id;
          return (
            <button
              key={m.id}
              id={`mode-chip-${m.id}`}
              onClick={() => setCurrentMode(m.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-blue-50 border border-blue-200 text-blue-700 shadow-xs'
                  : 'bg-surface border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              title={m.description}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Turns Conversation Thread */}
      <div
        id="turns-scroll-area"
        className="flex-1 overflow-y-auto space-y-4 pr-1 mb-3 rounded-xl scrollbar-thin scrollbar-thumb-slate-300"
      >
        {entry.turns.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-300 rounded-xl bg-surface/50">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-3 text-blue-600">
              <Brain className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Start Your Reflection</h3>
            <p className="text-xs text-slate-500 max-w-md mt-1 mb-6 leading-relaxed">
              Record your thoughts, challenges, or strategic priorities. Gemini will analyze,
              mirror core insights, and propose structured next steps.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg text-left">
              {[
                'What made today memorable, and what core insight did I learn?',
                'I feel like my focus is too fragmented across multiple priorities.',
                'Brainstorm 5 high-impact avenues for our upcoming milestone.',
                'Help me unpack a difficult decision and identify key trade-offs.',
              ].map((promptText, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setInputText(promptText);
                    textareaRef.current?.focus();
                  }}
                  className="p-3 text-xs bg-surface hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 rounded-lg text-slate-700 text-left transition-all cursor-pointer shadow-xs"
                >
                  "{promptText}"
                </button>
              ))}
            </div>
          </div>
        ) : (
          entry.turns.map((turn) => (
            <div
              key={turn.id}
              className={`flex flex-col ${turn.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`transition-all ${
                  turn.role === 'user'
                    ? 'bg-surface border border-slate-200 p-4 rounded-2xl rounded-tr-none shadow-xs text-slate-800 max-w-[85%]'
                    : 'bg-accent text-accent-fg p-5 rounded-2xl rounded-tl-none shadow-md max-w-[90%]'
                }`}
              >
                {/* Header line inside turn */}
                <div
                  className={`flex items-center justify-between gap-4 mb-2 pb-2 text-[11px] ${
                    turn.role === 'user'
                      ? 'border-b border-slate-100 text-slate-500'
                      : 'border-b border-accent-fg/20 text-accent-fg/75'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {turn.role === 'user' ? (
                      <span className="font-semibold text-slate-700">You</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-accent-fg/20 rounded-sm flex items-center justify-center text-[10px] font-bold text-accent-fg">
                          AI
                        </div>
                        <span className="text-xs font-bold uppercase tracking-widest text-accent-fg/75">
                          Gemini Intelligence
                        </span>
                        {turn.modelUsed && (
                          <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded bg-accent-fg/10 text-accent-fg/75 font-mono">
                            {turn.modelUsed}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {turn.mode && (
                      <span
                        className={`capitalize text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          turn.role === 'user'
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-white/20 text-white'
                        }`}
                      >
                        {turn.mode}
                      </span>
                    )}
                    <span className="text-[10px] opacity-80">
                      {new Date(turn.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {turn.role === 'model' && (
                      <button
                        onClick={() => handleCopyTurn(turn.id, turn.text)}
                        className="p-1 hover:text-accent-fg text-accent-fg/75 hover:bg-accent-fg/10 rounded transition-colors cursor-pointer"
                        title="Copy reflection"
                      >
                        {copiedTurnId === turn.id ? (
                          <Check className="w-3.5 h-3.5 text-white" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Turn Body */}
                {turn.role === 'user' ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap font-sans text-slate-700">
                    {turn.text}
                  </p>
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none text-accent-fg leading-relaxed space-y-2 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_li]:text-blue-50 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:border-white/50 [&_blockquote]:pl-3 [&_blockquote]:italic [&_code]:bg-accent-strong [&_code]:text-blue-50 [&_code]:px-1 [&_code]:rounded">
                    <Markdown>{turn.text}</Markdown>
                  </div>
                )}
              </div>
              <span
                className={`text-[10px] text-slate-400 mt-1.5 ${
                  turn.role === 'user' ? 'mr-2' : 'ml-2'
                }`}
              >
                {new Date(turn.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {turn.role === 'user' ? 'Logged' : 'Generated by Gemini 3.6 Flash'}
              </span>
            </div>
          ))
        )}

        {/* Generating Indicator */}
        {isGenerating && (
          <div className="flex items-start">
            <div className="bg-accent text-accent-fg rounded-2xl rounded-tl-none p-5 text-accent-fg max-w-[85%] flex items-center gap-3 shadow-md">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <div className="text-xs">
                <span className="font-bold text-white uppercase tracking-wider">Gemini 3.6 Flash</span>{' '}
                is analyzing your reflections and formulating insights...
              </div>
            </div>
          </div>
        )}

        <div ref={turnsEndRef} />
      </div>

      {/* Input Area Form matching Design HTML */}
      <form
        id="reflection-form"
        onSubmit={handleSubmit}
        className="bg-surface border border-slate-300 rounded-xl shadow-lg p-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all"
      >
        <textarea
          id="journal-input-textarea"
          ref={textareaRef}
          rows={2}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            currentMode === 'reflect'
              ? 'Add a new reflection or question for Gemini...'
              : currentMode === 'brainstorm'
              ? 'Describe a goal, initiative, or problem you want to brainstorm...'
              : currentMode === 'summarize'
              ? 'Paste notes or thoughts you want organized into clear action points...'
              : 'Converse freely with Gemini about any topic...'
          }
          className="w-full p-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none resize-none bg-transparent"
          maxLength={8000}
        />

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between p-2 border-t border-slate-100 bg-slate-50/50 rounded-b-lg">
          <div className="text-[11px] text-slate-500 flex items-center gap-2">
            <span className="hidden sm:inline">
              Press <kbd className="px-1.5 py-0.5 bg-slate-200 rounded font-mono text-[10px] text-slate-700">Ctrl/⌘ + Enter</kbd>
            </span>
            <span>{inputText.length} / 8000 chars</span>
          </div>

          <button
            id="submit-prompt-btn"
            type="submit"
            disabled={!inputText.trim() || isGenerating}
            className="px-5 py-2 bg-accent hover:bg-accent-strong text-accent-fg rounded-lg text-sm font-bold shadow-md shadow-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 cursor-pointer"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Analyzing...</span>
              </>
            ) : (
              <>
                <span>Analyze Reflections</span>
                <Send className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Location Picker Modal */}
      <LocationPickerModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        currentLocation={entry.location}
        onSaveLocation={handleSaveLocation}
      />
    </div>
  );
};
