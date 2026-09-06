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

export interface JournalLocation {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  placeId?: string;
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
  location?: JournalLocation | null;
}

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  /** ISO timestamp of account creation, from Firebase Auth metadata. */
  createdAt?: string | null;
}
