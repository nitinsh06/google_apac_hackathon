import React from 'react';
import { Sparkles, Shield, Database, Lock, ArrowRight, Brain, BookOpen, MapPin } from 'lucide-react';

interface LandingPageProps {
  onSignIn: () => void;
  onExploreDemo?: () => void;
  isLoading: boolean;
  errorMessage: string | null;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onSignIn,
  onExploreDemo,
  isLoading,
  errorMessage,
}) => {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 text-slate-900 flex flex-col justify-between">
      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 flex-1 flex flex-col items-center justify-center text-center">
        {/* Eyebrow badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-6 shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Intelligent Journaling with Gemini 3.6 Flash & Interactive Life Map</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 max-w-3xl leading-[1.15]">
          A sanctuary for your thoughts, reflections, and places visited.
        </h1>

        <p className="mt-5 text-base sm:text-lg text-slate-600 max-w-2xl leading-relaxed">
          Engage in multi-turn introspective dialogue, synthesize complex challenges, and pin
          reflections to interactive map coordinates. Strictly isolated and securely persisted in
          your personal Cloud Firestore vault.
        </p>

        {/* Authentication Action Card */}
        <div
          id="auth-cta-card"
          className="mt-8 p-6 sm:p-8 bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-sm"
        >
          <h2 className="text-lg font-bold text-slate-800 mb-2">
            Sign In to Your Private Vault
          </h2>
          <p className="text-xs text-slate-500 mb-5 leading-relaxed">
            Federated authentication via Google. We never store or handle passwords, and your
            reflections remain strictly restricted to your authenticated user identity.
          </p>

          {errorMessage && (
            <div
              id="auth-error-message"
              className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl text-left"
            >
              {errorMessage}
            </div>
          )}

          <button
            id="google-signin-btn"
            type="button"
            onClick={onSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm transition-all shadow-sm hover:shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3h3.88c2.27-2.09 3.665-5.17 3.665-9.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.15-6.72-4.98H1.25v3.15C3.26 21.36 7.36 24 12 24z"
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

          {onExploreDemo && (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2 text-slate-400 font-medium">or preview without sign-in</span>
                </div>
              </div>

              <button
                id="explore-demo-btn"
                type="button"
                onClick={onExploreDemo}
                className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs border border-blue-200 shadow-2xs hover:border-blue-300 transition-all cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                <span>Explore Live Places Map & Demo Journal</span>
              </button>
            </>
          )}

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
        <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl text-left">
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
              <MapPin className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1.5">Interactive Life Map</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Drop pin points on the map, group memories by landmark, and explore life reflections
              geographically.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-3.5 text-indigo-600">
              <Database className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1.5">Cloud Firestore Vault</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              All journal entries, dialogues, and location coordinates are stored under your unique
              user ID with strict owner-bound rules.
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
