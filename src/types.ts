export type ReflectionMode = 'reflect' | 'summarize' | 'brainstorm' | 'chat';

export type JournalCategory = 'Personal' | 'Work' | 'Ideas' | 'Gratitude' | 'Mindfulness';

export interface JournalTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  mode?: ReflectionMode;
  modelUsed?: string;
}

export interface JournalEntry {
  id: string;
  userId: string;
  title: string;
  topic?: string;
  category: JournalCategory;
  summary?: string;
  turns: JournalTurn[];
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  pinned?: boolean;
}

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}
