import React from 'react';
import {
  Sparkles,
  Shield,
  Database,
  Lock,
  ArrowRight,
  Brain,
  BookOpen,
  MapPin,
  PenLine,
  BarChart3,
  CalendarRange,
  Trash2,
  Send,
} from 'lucide-react';

interface LandingPageProps {
  onSignIn: () => void;
  isLoading: boolean;
  errorMessage: string | null;
}

/**
 * The walkthrough. Ordered because the product is ordered — you write, it gets
 * placed, it gets read back, and the year accumulates. Each step names what
 * actually happens rather than what it is called, and carries one concrete
 * detail so the claim is checkable rather than atmospheric.
 */
const STEPS: Array<{
  icon: typeof PenLine;
  title: string;
  body: string;
  detail: React.ReactNode;
}> = [
  {
    icon: PenLine,
    title: 'You write. It asks better questions.',
    body:
      'A reflection is a conversation, not a text box. Write what is on your mind and Gemini answers in the mode you picked — mirroring and probing in Reflect, diverging in Brainstorm, condensing in Summarize, or simply talking in Dialogue. Both sides of every turn are saved as you go, so nothing depends on you remembering to press save.',
    detail: (
      <div className="flex flex-wrap gap-1.5">
        {['Reflect', 'Brainstorm', 'Summarize', 'Dialogue'].map((mode) => (
          <span
            key={mode}
            className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700"
          >
            {mode}
          </span>
        ))}
      </div>
    ),
  },
  {
    icon: MapPin,
    title: 'Tag it to a place, or do not.',
    body:
      'Any entry can carry a location. The ones that do land on the Places Map, clustered the way a photo library clusters them — pins merge as you zoom out and split apart as you zoom in, so a whole city reads as one stack until you look closer. Entries without a location simply stay off the map; nothing is guessed on your behalf.',
    detail: (
      <p className="text-[11px] leading-relaxed text-slate-500">
        Coordinates are stored on your own entries and never published or shared.
      </p>
    ),
  },
  {
    icon: BarChart3,
    title: 'It reads your entries back to you.',
    body:
      'Shortly after you save, a lightweight model pass reads what you wrote — your words only, never the assistant\u2019s replies — and records a structured reading: which life domains the entry belongs to, how it felt on two separate axes, any position you visibly changed your mind about, and behaviours that recur across entries. Those readings are what the Analytics tab charts.',
    detail: (
      <div className="flex flex-wrap gap-1.5">
        {[
          'Career',
          'Relationships',
          'Family',
          'Health',
          'Inner life',
          'Creativity',
          'Learning',
          'Money',
          'Purpose',
          'Habits',
        ].map((domain) => (
          <span
            key={domain}
            className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600"
          >
            {domain}
          </span>
        ))}
      </div>
    ),
  },
  {
    icon: CalendarRange,
    title: 'The year accumulates.',
    body:
      'When a month closes, its readings are condensed into a short retrospective: what took up the room, which way the mood moved, which patterns took hold and which faded out, and one open question worth carrying into the next month. They stack into a timeline, so a year of journalling becomes something you can read rather than something you have to remember.',
    detail: (
      <p className="text-[11px] leading-relaxed text-slate-500">
        Summaries are written from the readings, not from your raw entries.
      </p>
    ),
  },
];

const GUARANTEES: Array<{ icon: typeof Lock; title: string; body: string }> = [
  {
    icon: Lock,
    title: 'Owner-bound by default',
    body:
      'Every document lives under your user ID, behind Firestore rules that match only you. There is no shared collection and no admin view.',
  },
  {
    icon: Send,
    title: 'Nothing leaves unless you send it',
    body:
      'Optional webhooks can post to Discord, Slack, your inbox or an endpoint of your own — but only for the events and categories you choose.',
  },
  {
    icon: Trash2,
    title: 'Delete means delete',
    body:
      'Removing a reflection removes its analysis with it, so nothing derived outlives the entry it came from.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onSignIn,
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
          className="mt-8 p-6 sm:p-8 bg-surface border border-slate-200 rounded-2xl w-full max-w-md shadow-sm"
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
            className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl bg-inverse hover:opacity-90 text-inverse-fg font-semibold text-sm transition-all shadow-sm hover:shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
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
          <div className="p-5 rounded-xl bg-surface border border-slate-200 shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center mb-3.5 text-blue-600">
              <Brain className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1.5">Multi-Turn Reflections</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Converse with Gemini 3.6 Flash across multiple turns with tailored modes: Deep
              Reflecting, Brainstorming, and Synthesis.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-surface border border-slate-200 shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-3.5 text-emerald-600">
              <MapPin className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1.5">Interactive Life Map</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Drop pin points on the map, group memories by landmark, and explore life reflections
              geographically.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-surface border border-slate-200 shadow-xs">
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

      {/* How it works */}
      <section
        id="how-it-works"
        className="border-t border-slate-200 bg-surface/60 px-4 py-16 sm:px-6 sm:py-20"
      >
        <div className="mx-auto max-w-4xl">
          <header className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">
              How it works
            </p>
            <h2 className="mt-2.5 text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">
              Four things happen to everything you write.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
              You only ever do the first one. The rest run on their own, from the words you already
              wrote, and none of it leaves your account.
            </p>
          </header>

          <ol className="relative mt-12 space-y-11 sm:space-y-14">
            {/* The spine reads as one continuous process rather than four cards. */}
            <span
              aria-hidden
              className="pointer-events-none absolute left-[21px] top-6 bottom-10 hidden w-px bg-gradient-to-b from-blue-300 via-slate-300 to-transparent sm:block"
            />

            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="relative flex flex-col gap-4 sm:flex-row sm:gap-6">
                  <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:gap-2">
                    <span className="relative z-10 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-surface text-blue-600 shadow-xs">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-[11px] font-bold tabular-nums text-slate-400 sm:text-center">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 sm:pt-1.5">
                    <h3 className="text-base font-bold tracking-tight text-slate-900">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
                    <div className="mt-3.5">{step.detail}</div>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* What the four steps are allowed to do with what they produce. */}
          <div className="mt-14 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-7">
            <h3 className="text-sm font-bold tracking-tight text-slate-900">
              What happens to your writing
            </h3>
            <div className="mt-4 grid gap-5 sm:grid-cols-3">
              {GUARANTEES.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title}>
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <h4 className="mt-2.5 text-xs font-bold text-slate-800">{item.title}</h4>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.body}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onSignIn}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg shadow-xs transition-colors cursor-pointer hover:bg-accent-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Start your first reflection
              <ArrowRight className="h-4 w-4" />
            </button>
            <p className="text-xs text-slate-500">
              Sign in with Google. Nothing to configure, nothing to install.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 border-t border-slate-200 text-center text-xs text-slate-500">
        <p>Google AI Studio • Powered by Gemini 3.6 Flash & Cloud Firestore</p>
      </footer>
    </div>
  );
};
