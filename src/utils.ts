import { AgeRating } from './types.js';

export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  // Match youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/...
  const patterns = [
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|watch\?.+&v=))([\w-]{11})/,
    /^([\w-]{11})$/ // if already raw video ID
  ];

  for (const regex of patterns) {
    const match = url.trim().match(regex);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

export function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export async function fetchYouTubeOEmbed(urlOrId: string): Promise<{
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
} | null> {
  const videoId = extractYouTubeId(urlOrId);
  const targetUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : urlOrId;

  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(targetUrl)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title,
      author_name: data.author_name,
      thumbnail_url: videoId ? getYouTubeThumbnail(videoId) : data.thumbnail_url
    };
  } catch (err) {
    console.warn('Failed to fetch oEmbed metadata:', err);
    return null;
  }
}

export interface YouTubeSearchResult {
  youtubeVideoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
}

export async function searchYouTubeVideos(query: string, limit = 12): Promise<YouTubeSearchResult[]> {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];
  try {
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}&sp=EgIQAQ%253D%253D`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );
    if (!res.ok) return [];
    const html = await res.text();
    const ids = [...new Set([...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map((m) => m[1]))].slice(
      0,
      limit
    );
    const verified = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`
          );
          if (!r.ok) return null;
          const j = await r.json();
          return {
            youtubeVideoId: id,
            title: String(j.title || `YouTube Video (${id})`),
            channelTitle: String(j.author_name || 'YouTube'),
            thumbnailUrl: getYouTubeThumbnail(id)
          } as YouTubeSearchResult;
        } catch {
          return null;
        }
      })
    );
    return verified.filter((x): x is YouTubeSearchResult => Boolean(x));
  } catch (err) {
    console.warn('YouTube search failed:', err);
    return [];
  }
}

export function deriveAgeRatingFromBirthday(birthday: string): AgeRating | null {
  const clean = String(birthday || '').trim();
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const birthYear = Number(match[1]);
  const birthMonth = Number(match[2]);
  const birthDay = Number(match[3]);
  const birthDate = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay));
  if (Number.isNaN(birthDate.getTime())) return null;

  const now = new Date();
  let age = now.getUTCFullYear() - birthYear;
  const monthDiff = now.getUTCMonth() + 1 - birthMonth;
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birthDay)) {
    age--;
  }
  if (age < 0) return null;
  if (age <= 4) return 'TODDLER';
  if (age <= 7) return 'YOUNG_KIDS';
  return 'OLDER_KIDS';
}

export function channelMatchesAgeRating(channelAgeRating: string | undefined, targetRating?: string): boolean {
  if (!targetRating) return true;
  const target = targetRating.trim().toUpperCase();
  if (!target || target === 'ALL') return true;
  const chAge = (channelAgeRating || 'ALL').trim().toUpperCase();
  return chAge === target || chAge === 'ALL';
}

export function normalizeVideoTags(
  tags: string[] = [],
  ageRating?: AgeRating,
  category?: string
): string[] {
  const cleaned = (tags || [])
    .map((t) => String(t).trim())
    .filter((t) => t.length > 0);

  const filtered = cleaned.filter((t) => {
    const lower = t.toLowerCase();
    if (ageRating && lower.startsWith('age:')) return false;
    if (category && lower.startsWith('category:')) return false;
    return true;
  });

  if (ageRating) {
    filtered.push(`age:${ageRating.toLowerCase()}`);
  }
  if (category && category.trim() && category.trim() !== 'All Videos') {
    filtered.push(`category:${category.trim().toLowerCase()}`);
  }

  // Deduplicate case-insensitively while preserving order
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of filtered) {
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(tag);
    }
  }
  return result;
}

export function videoMatchesAgeTag(videoTags: string[], targetRating: string): boolean {
  const target = targetRating.trim().toLowerCase();
  if (!target || target === 'all') return true;
  const normalized = videoTags.map((t) => t.trim().toLowerCase());
  return (
    normalized.includes(`age:${target}`) ||
    normalized.includes('age:all') ||
    normalized.includes(target) ||
    normalized.includes('all')
  );
}

export function videoMatchesCategoryTag(videoTags: string[], category: string): boolean {
  const target = category.trim().toLowerCase();
  if (!target || target === 'all videos' || target === 'cat-all') return true;
  const normalized = videoTags.map((t) => t.trim().toLowerCase());
  return normalized.includes(`category:${target}`) || normalized.includes(target);
}
