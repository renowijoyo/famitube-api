import { AgeRating } from './types.js';
import { normalizeVideoTags } from './utils.js';

export interface TagDefinition {
  id: string;
  label: string;
  description?: string;
}

export interface TagCategory {
  id: string;
  label: string;
  description: string;
  multiSelect: boolean;
  tags: TagDefinition[];
}

export interface ParentFilterPreset {
  id: string;
  label: string;
  description: string;
  includeAllTags: string[];
  includeAnyTags: string[];
  excludeTags: string[];
}

export const TAG_TAXONOMY: TagCategory[] = [
  {
    id: 'age',
    label: 'Age & Developmental Tier',
    description: 'Developmental stage suitability for kids and teens.',
    multiSelect: false,
    tags: [
      { id: 'age:toddler', label: 'Toddler (2-4)', description: 'Slow speech, simple concepts, gentle visuals' },
      { id: 'age:young_kids', label: 'Young Kids (5-8)', description: 'Early reading, basic science, playful stories' },
      { id: 'age:older_kids', label: 'Older Kids (9-12)', description: 'Deeper hobbies, humor, critical thinking' },
      { id: 'age:early_teen', label: 'Early Teen (13-15)', description: 'Study skills, identity, STEM, creative arts' },
      { id: 'age:older_teen', label: 'Older Teen (16-17)', description: 'Life skills, advanced tutorials, nuanced topics' }
    ]
  },
  {
    id: 'pacing',
    label: 'Sensory Pacing & Stimulation',
    description: 'Controls sensory load, cut speed, and audio intensity.',
    multiSelect: true,
    tags: [
      { id: 'pacing:calm', label: 'Calm Pacing', description: 'Slow cuts, soft audio, low visual clutter' },
      { id: 'pacing:moderate', label: 'Moderate Pacing', description: 'Normal conversational or documentary pacing' },
      { id: 'pacing:high-energy', label: 'High Energy', description: 'Fast cuts, loud SFX, high excitement' },
      { id: 'audio:gentle', label: 'Gentle Audio', description: 'No sudden screaming, sirens, or jarring sound effects' },
      { id: 'visual:low-stimulation', label: 'Low Visual Stimulation', description: 'Muted/natural colors, minimal flashing' }
    ]
  },
  {
    id: 'topic',
    label: 'Topic & Interest',
    description: 'Subject matter and interest areas for discovery and study.',
    multiSelect: true,
    tags: [
      { id: 'topic:science', label: 'Science' },
      { id: 'topic:space-astronomy', label: 'Space & Astronomy' },
      { id: 'topic:animals-nature', label: 'Animals & Nature' },
      { id: 'topic:math-logic', label: 'Math & Logic' },
      { id: 'topic:coding-tech', label: 'Coding & Tech' },
      { id: 'topic:engineering-robotics', label: 'Engineering & Robotics' },
      { id: 'topic:history-geography', label: 'History & Geography' },
      { id: 'topic:art-drawing', label: 'Art & Drawing' },
      { id: 'topic:crafts-diy', label: 'Crafts & DIY' },
      { id: 'topic:music-instruments', label: 'Music & Instruments' },
      { id: 'topic:cooking-baking', label: 'Cooking & Baking' },
      { id: 'topic:abcs-phonics', label: 'ABCs & Phonics' },
      { id: 'topic:reading-books', label: 'Reading & Books' },
      { id: 'topic:language-learning', label: 'Language Learning' },
      { id: 'topic:emotional-learning', label: 'Emotional Learning (SEL)' },
      { id: 'topic:mindfulness-breathing', label: 'Mindfulness & Breathing' },
      { id: 'topic:financial-literacy', label: 'Financial Literacy' },
      { id: 'topic:digital-citizenship', label: 'Digital Citizenship' },
      { id: 'topic:physical-fitness', label: 'Physical Fitness & Yoga' },
      { id: 'topic:animation-cartoons', label: 'Animation & Cartoons' },
      { id: 'topic:comedy-clean', label: 'Clean Comedy' },
      { id: 'topic:gaming-wholesome', label: 'Wholesome Gaming' },
      { id: 'topic:sports-outdoors', label: 'Sports & Outdoors' }
    ]
  },
  {
    id: 'purpose',
    label: 'Developmental Purpose',
    description: 'Intent and learning value of the video.',
    multiSelect: true,
    tags: [
      { id: 'purpose:educational', label: 'Educational' },
      { id: 'purpose:tutorial-howto', label: 'Tutorial / How-To' },
      { id: 'purpose:story-narrative', label: 'Story / Narrative' },
      { id: 'purpose:active-participation', label: 'Active Participation' },
      { id: 'purpose:background-audio', label: 'Background Audio / Lullaby' },
      { id: 'purpose:pure-entertainment', label: 'Pure Entertainment' }
    ]
  },
  {
    id: 'format',
    label: 'Format & Attention Profile',
    description: 'Length and viewing structure to prevent infinite-scroll habits.',
    multiSelect: true,
    tags: [
      { id: 'format:short-form', label: 'Short-Form (<60s / Shorts)' },
      { id: 'format:bite-sized', label: 'Bite-Sized (1-5m)' },
      { id: 'format:episode', label: 'Episode (5-20m)' },
      { id: 'format:long-form', label: 'Long-Form (20m+)' },
      { id: 'format:series', label: 'Sequential Series' }
    ]
  },
  {
    id: 'commercial',
    label: 'Commercial & Manipulation Signals',
    description: 'Transparency around sponsorships, toy marketing, and clickbait.',
    multiSelect: true,
    tags: [
      { id: 'commercial:ad-free-creator', label: 'Ad-Free Creator' },
      { id: 'commercial:contains-sponsor', label: 'Contains Sponsor Segment' },
      { id: 'commercial:toy-unboxing', label: 'Toy / Merch Unboxing' },
      { id: 'commercial:clickbait-free', label: 'Clickbait-Free' }
    ]
  },
  {
    id: 'advisory',
    label: 'Content Advisories',
    description: 'Granular sensitivity flags for parent opt-in or opt-out.',
    multiSelect: true,
    tags: [
      { id: 'advisory:mild-peril', label: 'Mild Peril / Spooky' },
      { id: 'advisory:toilet-humor', label: 'Toilet Humor' },
      { id: 'advisory:slapstick', label: 'Cartoon Slapstick' },
      { id: 'advisory:real-world-news', label: 'Real-World News' },
      { id: 'advisory:teen-mental-health', label: 'Teen Mental Health Discussion' },
      { id: 'advisory:religious-cultural', label: 'Religious / Cultural' }
    ]
  },
  {
    id: 'context',
    label: 'Context & Time-of-Day',
    description: 'Shortcut suitability tags for daily routines.',
    multiSelect: true,
    tags: [
      { id: 'context:bedtime-safe', label: 'Bedtime Safe' },
      { id: 'context:focus-study', label: 'Focus & Study' },
      { id: 'context:morning-calm', label: 'Morning Calm' },
      { id: 'context:movement-break', label: 'Movement Break' },
      { id: 'context:co-watch', label: 'Great for Co-Watching' }
    ]
  },
  {
    id: 'access',
    label: 'Language & Accessibility',
    description: 'Language, captions, and non-verbal accessibility.',
    multiSelect: true,
    tags: [
      { id: 'lang:en', label: 'English' },
      { id: 'lang:id', label: 'Indonesian' },
      { id: 'lang:es', label: 'Spanish' },
      { id: 'access:no-dialogue', label: 'No Dialogue / Visual Only' },
      { id: 'access:bilingual', label: 'Bilingual' },
      { id: 'access:captions-verified', label: 'Verified Captions' },
      { id: 'access:asl-sign-language', label: 'Sign Language (ASL)' }
    ]
  }
];

export const PARENT_FILTER_PRESETS: ParentFilterPreset[] = [
  {
    id: 'calm-mode',
    label: 'Calm Mode',
    description: 'Low-stimulation, calm pacing videos without high energy or mild peril.',
    includeAllTags: ['pacing:calm'],
    includeAnyTags: [],
    excludeTags: ['pacing:high-energy', 'advisory:mild-peril', 'commercial:toy-unboxing']
  },
  {
    id: 'no-shorts',
    label: 'No Shorts',
    description: 'Hide short-form vertical / <60s clips to prevent rapid scrolling.',
    includeAllTags: [],
    includeAnyTags: [],
    excludeTags: ['format:short-form']
  },
  {
    id: 'no-unboxing',
    label: 'No Toy / Unboxing',
    description: 'Hide commercial toy unboxing and merchandise-heavy videos.',
    includeAllTags: [],
    includeAnyTags: [],
    excludeTags: ['commercial:toy-unboxing']
  },
  {
    id: 'study-mode',
    label: 'Study & Focus Mode',
    description: 'Educational, tutorial, and study-friendly videos only.',
    includeAllTags: [],
    includeAnyTags: ['purpose:educational', 'purpose:tutorial-howto', 'context:focus-study'],
    excludeTags: ['purpose:pure-entertainment', 'format:short-form']
  },
  {
    id: 'bedtime-safe',
    label: 'Bedtime Safe',
    description: 'Calm, gentle content suitable for winding down before sleep.',
    includeAllTags: [],
    includeAnyTags: ['context:bedtime-safe', 'pacing:calm'],
    excludeTags: ['pacing:high-energy', 'advisory:mild-peril', 'advisory:slapstick']
  }
];

const SINGLE_VALUE_PREFIXES = ['pacing:'];

export function parseTagList(raw: unknown): string[] {
  if (!raw) return [];
  const items = Array.isArray(raw)
    ? raw.map((item) => String(item))
    : String(raw)
        .split(',')
        .map((item) => item.trim());

  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const clean = item.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(clean);
    }
  }
  return result;
}

/**
 * Merges channel-level default tags with video-level tags.
 * Video-level single-value prefixes (e.g., `pacing:*`) override channel defaults.
 */
export function resolveEffectiveVideoTags(
  videoTags: string[] = [],
  channelDefaultTags: string[] = [],
  ageRating?: AgeRating,
  category?: string
): string[] {
  const cleanVideoTags = parseTagList(videoTags);
  const cleanChannelTags = parseTagList(channelDefaultTags);

  const videoPrefixesPresent = new Set<string>();
  for (const tag of cleanVideoTags) {
    const lower = tag.toLowerCase();
    for (const prefix of SINGLE_VALUE_PREFIXES) {
      if (lower.startsWith(prefix)) {
        videoPrefixesPresent.add(prefix);
      }
    }
  }

  const inheritedChannelTags = cleanChannelTags.filter((tag) => {
    const lower = tag.toLowerCase();
    for (const prefix of videoPrefixesPresent) {
      if (lower.startsWith(prefix)) return false;
    }
    return true;
  });

  return normalizeVideoTags([...inheritedChannelTags, ...cleanVideoTags], ageRating, category);
}

export interface TagFilterOptions {
  includeTags?: string[];
  anyTags?: string[];
  excludeTags?: string[];
  presetIds?: string[];
}

export function matchesTagFilter(effectiveTags: string[], options: TagFilterOptions): boolean {
  const normalizedTagSet = new Set(effectiveTags.map((t) => t.trim().toLowerCase()));

  const includeAll = [...(options.includeTags || [])];
  const includeAnyGroups: string[][] = [];
  if (options.anyTags && options.anyTags.length > 0) {
    includeAnyGroups.push(options.anyTags);
  }
  const exclude = [...(options.excludeTags || [])];

  if (options.presetIds && options.presetIds.length > 0) {
    for (const presetId of options.presetIds) {
      const preset = PARENT_FILTER_PRESETS.find((p) => p.id === presetId.toLowerCase());
      if (!preset) continue;
      includeAll.push(...preset.includeAllTags);
      if (preset.includeAnyTags.length > 0) {
        includeAnyGroups.push(preset.includeAnyTags);
      }
      exclude.push(...preset.excludeTags);
    }
  }

  for (const reqTag of includeAll) {
    if (!normalizedTagSet.has(reqTag.trim().toLowerCase())) {
      return false;
    }
  }

  for (const group of includeAnyGroups) {
    const matched = group.some((t) => normalizedTagSet.has(t.trim().toLowerCase()));
    if (!matched) {
      return false;
    }
  }

  for (const exTag of exclude) {
    if (normalizedTagSet.has(exTag.trim().toLowerCase())) {
      return false;
    }
  }

  return true;
}
