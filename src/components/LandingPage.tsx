import React from 'react';
import { Sparkles, Shield, Database, Lock, ArrowRight, Brain, BookOpen } from 'lucide-react';

interface LandingPageProps {
  onSignIn: () => void;
  isLoading: boolean;
  errorMessage: string | null;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onSignIn,
  isLoading,
  errorMessage,
}) => {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 text-slate-900 flex flex-col justify-between">
      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-20 flex-1 flex flex-col items-center justify-center text-center">
        {/* Eyebrow badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-8 shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Intelligent Journaling with Gemini 3.6 Flash & Cloud Firestore</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 max-w-3xl leading-[1.15]">
          A sanctuary for your thoughts, reflections, and breakthrough ideas.
        </h1>

        <p className="mt-6 text-base sm:text-lg text-slate-600 max-w-2xl leading-relaxed">
          Engage in multi-turn introspective dialogue, synthesize complex challenges, and
          brainstorm strategic impact areas. Strictly isolated and securely persisted in your personal
          Cloud Firestore vault.
        </p>

        {/* Authentication Action Card */}
        <div
          id="auth-cta-card"
          className="mt-10 p-6 sm:p-8 bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-sm"
        >
          <h2 className="text-lg font-bold text-slate-800 mb-2">
            Sign In to Your Private Vault
          </h2>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            Federated authentication via Google. We never store or handle passwords, and your
            reflections remain strictly restricted to your authenticated user identity.
          </p>

          {errorMessage && (
            <div
              id="auth-error-banner"
              className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs text-left font-medium"
            >
              {errorMessage}
            </div>
          )}

          <button
            id="google-signin-button"
            onClick={onSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm border border-slate-300 shadow-xs hover:shadow-sm hover:border-slate-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer group"
          >
            {isLoading ? (
              <div className="flex items-center gap-2 text-slate-700">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span>Authenticating with Google...</span>
              </div>
            ) : (
              <>
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.36 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.94 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Continue with Google</span>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </button>

          <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-slate-500 font-medium">
            <span className="flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-blue-600" /> Firebase Auth
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-blue-600" /> User-Isolated Storage
            </span>
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl text-left">
          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center mb-3.5 text-blue-600">
              <Brain className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1.5">Multi-Turn Reflections</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Converse with Gemini 3.6 Flash across multiple turns with tailored modes: Deep
              Reflecting, Brainstorming, and Synthesis.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-3.5 text-emerald-600">
              <Database className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1.5">Firestore Isolation</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              All journal entries and AI dialogues are stored under your unique user ID with strict
              owner-bound security rules.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-3.5 text-indigo-600">
              <BookOpen className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1.5">History & Summaries</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Revisit past sessions, search through your reflections, and track strategic growth
              across categories over time.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-slate-200 text-center text-xs text-slate-500">
        <p>Google AI Studio • Powered by Gemini 3.6 Flash & Cloud Firestore</p>
      </footer>
    </div>
  );
};
