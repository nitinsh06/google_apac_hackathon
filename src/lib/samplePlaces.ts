import type { JournalEntry } from '../types.ts';

// Curated starter reflections used for the guest demo and for the Places Map
// empty state, so a brand-new vault still has something to explore.
const iso = (daysAgo: number): string =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString();

export const SAMPLE_ENTRIES: JournalEntry[] = [
  {
    id: 'sample-entry-1',
    userId: 'sample-user',
    title: 'Morning Fog & Reflection',
    category: 'Mindfulness',
    createdAt: iso(12),
    updatedAt: iso(12),
    summary: 'Morning quietude among coastal redwoods.',
    turns: [
      {
        id: 't-1',
        role: 'user',
        text: 'Sitting quietly among the redwoods as the morning coastal fog rolls in. Feeling grounded and grateful for fresh perspective.',
        timestamp: iso(12),
      },
      {
        id: 't-2',
        role: 'model',
        text: 'The stillness of coastal mornings offers a sanctuary for clarity. What thought brought you peace today?',
        timestamp: iso(12),
      },
    ],
    location: {
      name: 'Golden Gate Park',
      address: 'San Francisco, CA, USA',
      lat: 37.7694,
      lng: -122.4862,
    },
  },
  {
    id: 'sample-entry-2',
    userId: 'sample-user',
    title: 'Sunset Over the Pacific',
    category: 'Gratitude',
    createdAt: iso(9),
    updatedAt: iso(9),
    summary: 'Counting small wins as the light went gold.',
    turns: [
      {
        id: 't-3',
        role: 'user',
        text: 'Walked to the western edge of the park at golden hour and listed three things that went right this week.',
        timestamp: iso(9),
      },
    ],
    location: {
      name: 'Golden Gate Park',
      address: 'San Francisco, CA, USA',
      lat: 37.7694,
      lng: -122.4862,
    },
  },
  {
    id: 'sample-entry-3',
    userId: 'sample-user',
    title: 'Brainstorming Among Greenery',
    category: 'Ideas',
    createdAt: iso(6),
    updatedAt: iso(6),
    summary: 'Creative roadmap exploration outdoors.',
    turns: [
      {
        id: 't-4',
        role: 'user',
        text: 'Outlining a creative roadmap under the afternoon sun in Central Park. Three directions worth prototyping.',
        timestamp: iso(6),
      },
    ],
    location: {
      name: 'Central Park (Sheep Meadow)',
      address: 'New York, NY, USA',
      lat: 40.7711,
      lng: -73.9742,
    },
  },
  {
    id: 'sample-entry-4',
    userId: 'sample-user',
    title: 'Wind Through Bamboo Stalks',
    category: 'Gratitude',
    createdAt: iso(4),
    updatedAt: iso(4),
    summary: 'Sensory awareness and gratitude in Kyoto.',
    turns: [
      {
        id: 't-5',
        role: 'user',
        text: 'Listening to the gentle rustling sound of bamboo in the morning breeze.',
        timestamp: iso(4),
      },
    ],
    location: {
      name: 'Arashiyama Bamboo Grove',
      address: 'Kyoto, Japan',
      lat: 35.0169,
      lng: 135.6713,
    },
  },
  {
    id: 'sample-entry-5',
    userId: 'sample-user',
    title: 'Café & Fountain Thoughts',
    category: 'Personal',
    createdAt: iso(2),
    updatedAt: iso(2),
    summary: 'Personal retrospective by the Medici Fountain.',
    turns: [
      {
        id: 't-6',
        role: 'user',
        text: 'Writing reflections near the Medici Fountain on a sunny afternoon.',
        timestamp: iso(2),
      },
    ],
    location: {
      name: 'Luxembourg Gardens',
      address: 'Paris, France',
      lat: 48.8462,
      lng: 2.3372,
    },
  },
  {
    id: 'sample-entry-6',
    userId: 'sample-user',
    title: 'Standup Notes, Rue Soufflot',
    category: 'Work',
    createdAt: iso(1),
    updatedAt: iso(1),
    summary: 'Untangling a week of scope creep over espresso.',
    turns: [
      {
        id: 't-7',
        role: 'user',
        text: 'Sat down with an espresso and untangled what actually blocked the release this week.',
        timestamp: iso(1),
      },
    ],
    location: {
      name: 'Luxembourg Gardens',
      address: 'Paris, France',
      lat: 48.8462,
      lng: 2.3372,
    },
  },
];
