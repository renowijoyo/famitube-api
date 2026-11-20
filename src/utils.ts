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

export interface YouTubeChannelSearchResult {
  handle: string; // always starts with '@'
  channelId?: string;
  title: string;
  avatarUrl: string;
  description?: string;
}

export interface YouTubeSearchOptions {
  regionCode?: string;
  languageCode?: string;
}

const geoCoordCache = new Map<string, string>();

export async function resolveRegionFromCoords(lat: number, lon: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = geoCoordCache.get(key);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&zoom=3`,
      {
        headers: { 'User-Agent': 'FamiTube/1.0 (https://famitube-api.gamantha.my.id)' },
        signal: AbortSignal.timeout(2500)
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { address?: { country_code?: string } };
    const code = String(data?.address?.country_code || '').trim().toUpperCase();
    if (code.length === 2 && /^[A-Z]+$/.test(code)) {
      geoCoordCache.set(key, code);
      return code;
    }
  } catch {
    // Fall back to header/default geo resolution on timeout or network error
  }
  return null;
}

export async function resolveGeoForSearch(
  headers: Record<string, string | string[] | undefined>,
  params: { region?: string; lang?: string; lat?: unknown; lon?: unknown }
): Promise<{ regionCode: string; languageCode: string }> {
  const latNum = params.lat !== undefined ? Number(params.lat) : NaN;
  const lonNum = params.lon !== undefined ? Number(params.lon) : NaN;
  const gpsRegion =
    Number.isFinite(latNum) && Number.isFinite(lonNum)
      ? await resolveRegionFromCoords(latNum, lonNum)
      : null;

  return resolveGeoFromHeaders(
    headers,
    gpsRegion || params.region,
    params.lang || (gpsRegion === 'ID' ? 'id' : undefined)
  );
}

export function resolveGeoFromHeaders(
  headers: Record<string, string | string[] | undefined>,
  queryRegion?: string,
  queryLang?: string
): { regionCode: string; languageCode: string } {
  const cleanCode = (val: unknown, len = 2) => {
    const s = String(val || '').trim();
    return s.length === len && /^[a-zA-Z]+$/.test(s) ? s : '';
  };

  let region = cleanCode(queryRegion, 2).toUpperCase();
  let lang = cleanCode(queryLang, 2).toLowerCase();

  // Check common CDN / reverse-proxy country headers
  if (!region) {
    const geoHeaders = ['cf-ipcountry', 'x-vercel-ip-country', 'x-country-code', 'cloudfront-viewer-country'];
    for (const h of geoHeaders) {
      const val = Array.isArray(headers[h]) ? headers[h][0] : headers[h];
      const code = cleanCode(val, 2).toUpperCase();
      if (code && code !== 'XX') {
        region = code;
        break;
      }
    }
  }

  // Parse Accept-Language header (e.g. "id-ID,id;q=0.9,en-US;q=0.8")
  const acceptLangRaw = Array.isArray(headers['accept-language'])
    ? headers['accept-language'][0]
    : headers['accept-language'];
  if (acceptLangRaw) {
    const firstTag = String(acceptLangRaw).split(',')[0]?.split(';')[0]?.trim() || '';
    const parts = firstTag.split(/[-_]/);
    if (!lang && parts[0]) {
      lang = cleanCode(parts[0], 2).toLowerCase();
    }
    if (!region && parts[1]) {
      region = cleanCode(parts[1], 2).toUpperCase();
    }
  }

  if (!region) {
    region = cleanCode(process.env.YOUTUBE_DEFAULT_REGION, 2).toUpperCase() || 'ID';
  }
  if (!lang) {
    lang = cleanCode(process.env.YOUTUBE_DEFAULT_LANG, 2).toLowerCase() || (region === 'ID' ? 'id' : 'en');
  }

  return { regionCode: region, languageCode: lang };
}

export async function searchYouTubeVideos(
  query: string,
  limit = 12,
  options?: YouTubeSearchOptions
): Promise<YouTubeSearchResult[]> {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];
  const region = (options?.regionCode || 'ID').toUpperCase();
  const lang = (options?.languageCode || 'en').toLowerCase();
  try {
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}&sp=EgIQAQ%253D%253D&gl=${encodeURIComponent(region)}&hl=${encodeURIComponent(lang)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': `${lang}-${region},${lang};q=0.9,en;q=0.8`
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

export async function searchYouTubeChannels(
  query: string,
  limit = 6,
  options?: YouTubeSearchOptions
): Promise<YouTubeChannelSearchResult[]> {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];
  const region = (options?.regionCode || 'ID').toUpperCase();
  const lang = (options?.languageCode || 'en').toLowerCase();
  try {
    // sp=EgIQAg%253D%253D filters YouTube search to Channels
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}&sp=EgIQAg%253D%253D&gl=${encodeURIComponent(region)}&hl=${encodeURIComponent(lang)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': `${lang}-${region},${lang};q=0.9,en;q=0.8`
        },
        signal: AbortSignal.timeout(7000)
      }
    );
    if (!res.ok) return [];
    const html = await res.text();

    const results: YouTubeChannelSearchResult[] = [];
    const seenHandles = new Set<string>();

    // Extract channelRenderer blocks from ytInitialData
    const rendererParts = html.split('"channelRenderer":').slice(1);
    for (const part of rendererParts) {
      if (results.length >= limit) break;
      const chunk = part.slice(0, 4500);
      const cidMatch = chunk.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
      const handleMatch =
        chunk.match(/"canonicalBaseUrl":"\/(@[a-zA-Z0-9_.-]+)"/) ||
        chunk.match(/"url":"\/(@[a-zA-Z0-9_.-]+)"/);
      const titleMatch = chunk.match(/"title":\{"simpleText":"([^"]+)"\}/);
      const thumbMatches = [...chunk.matchAll(/"url":"((?:https?:)?\/\/yt3\.ggpht\.com\/[^"]+|(?:https?:)?\/\/yt3\.googleusercontent\.com\/[^"]+)"/g)];
      const rawThumb = thumbMatches.length ? thumbMatches[thumbMatches.length - 1][1] : '';
      const avatarUrl = rawThumb.startsWith('//')
        ? `https:${rawThumb}`
        : rawThumb || 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=200&h=200&fit=crop';

      const rawHandle = handleMatch
        ? handleMatch[1]
        : cidMatch
          ? `@${cidMatch[1]}`
          : '';
      if (!rawHandle) continue;
      const normalizedHandle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;
      const key = normalizedHandle.toLowerCase();
      if (seenHandles.has(key)) continue;
      seenHandles.add(key);

      const rawTitle = titleMatch ? titleMatch[1] : normalizedHandle;
      results.push({
        handle: normalizedHandle,
        channelId: cidMatch ? cidMatch[1] : undefined,
        title: rawTitle.startsWith('@') ? rawTitle : `${rawTitle} (${normalizedHandle})`,
        avatarUrl
      });
    }

    // Fallback: extract/@handles directly if channelRenderer parsing yielded nothing
    if (results.length === 0) {
      const handles = [...new Set([...html.matchAll(/\/(@[a-zA-Z0-9_.-]{3,40})/g)].map((m) => m[1]))].slice(0, limit);
      for (const h of handles) {
        const key = h.toLowerCase();
        if (seenHandles.has(key)) continue;
        seenHandles.add(key);
        results.push({
          handle: h,
          title: h,
          avatarUrl: 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=200&h=200&fit=crop'
        });
      }
    }

    return results;
  } catch (err) {
    console.warn('YouTube channel search failed:', err);
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
  if (normalized.includes(`category:${target}`) || normalized.includes(target)) {
    return true;
  }
  const topicAliases: Record<string, string[]> = {
    'video games & gaming': ['topic:gaming-wholesome'],
    'hobbies & diy': ['topic:crafts-diy', 'topic:art-drawing', 'topic:music-instruments', 'topic:engineering-robotics'],
    'sports & outdoors': ['topic:sports-outdoors', 'topic:physical-fitness'],
    'cooking & baking': ['topic:cooking-baking']
  };
  const aliases = topicAliases[target];
  return Boolean(aliases && aliases.some((alias) => normalized.includes(alias)));
}

export interface YouTubeChannelVideo {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  publishedAt?: string;
}

export interface YouTubeChannelInfo {
  channelId: string;
  title: string;
  description: string;
  avatarUrl: string;
  bannerUrl?: string;
  videos: YouTubeChannelVideo[];
}

export async function fetchYouTubeChannelInfo(urlOrHandle: string): Promise<YouTubeChannelInfo | null> {
  const input = String(urlOrHandle || '').trim();
  if (!input) return null;

  let targetUrl = input;
  if (targetUrl.startsWith('@')) {
    targetUrl = `https://www.youtube.com/${targetUrl}`;
  } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = targetUrl.startsWith('UC') && targetUrl.length === 24
      ? `https://www.youtube.com/channel/${targetUrl}`
      : `https://www.youtube.com/@${targetUrl}`;
  }

  if (targetUrl.includes('watch?v=') || targetUrl.includes('youtu.be/')) {
    const vid = extractYouTubeId(targetUrl);
    if (vid) {
      targetUrl = `https://www.youtube.com/watch?v=${vid}`;
    }
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const html = await res.text();

    let channelId = '';
    const chanMatch = html.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
    if (chanMatch) {
      channelId = chanMatch[1];
    } else {
      const canonMatch = html.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
      if (canonMatch) channelId = canonMatch[1];
    }

    let title = '';
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    if (titleMatch) title = titleMatch[1].replace(/ - YouTube$/i, '').trim();

    let description = '';
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    if (descMatch) description = descMatch[1].trim();

    let avatarUrl = '';
    const imgMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
    if (imgMatch) avatarUrl = imgMatch[1].trim();

    // If watch URL was loaded, title and avatar might be for video, not channel.
    // If channelId was discovered, fetch channel's page to get exact channel title & avatar
    if (channelId && (targetUrl.includes('/watch?v=') || !title)) {
      try {
        const cRes = await fetch(`https://www.youtube.com/channel/${channelId}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          signal: AbortSignal.timeout(6000)
        });
        if (cRes.ok) {
          const cHtml = await cRes.text();
          const cTitle = cHtml.match(/<meta property="og:title" content="([^"]+)"/);
          if (cTitle) title = cTitle[1].replace(/ - YouTube$/i, '').trim();
          const cDesc = cHtml.match(/<meta property="og:description" content="([^"]+)"/);
          if (cDesc) description = cDesc[1].trim();
          const cImg = cHtml.match(/<meta property="og:image" content="([^"]+)"/);
          if (cImg) avatarUrl = cImg[1].trim();
        }
      } catch {}
    }

    const videos: YouTubeChannelVideo[] = [];
    if (channelId) {
      try {
        const feedRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
          signal: AbortSignal.timeout(6000)
        });
        if (feedRes.ok) {
          const xml = await feedRes.text();
          const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => m[1]);
          for (const entry of entries) {
            const vIdMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
            const tMatch = entry.match(/<title>([^<]+)<\/title>/);
            const dMatch = entry.match(/<media:description>([\s\S]*?)<\/media:description>/);
            const pMatch = entry.match(/<published>([^<]+)<\/published>/);
            if (vIdMatch && vIdMatch[1]) {
              const vId = vIdMatch[1].trim();
              videos.push({
                videoId: vId,
                title: tMatch ? tMatch[1].trim() : `Video ${vId}`,
                description: dMatch ? dMatch[1].trim() : '',
                thumbnailUrl: getYouTubeThumbnail(vId),
                publishedAt: pMatch ? pMatch[1].trim() : undefined
              });
            }
          }
        }
      } catch (feedErr) {
        console.warn('Failed to fetch YouTube RSS feed:', feedErr);
      }
    }

    if (videos.length === 0) {
      try {
        const videosUrl = targetUrl.replace(/\/+$/, '') + '/videos';
        const vRes = await fetch(videosUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(6000)
        });
        const vHtml = vRes.ok ? await vRes.text() : html;
        const ids = [...new Set([...vHtml.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map((m) => m[1]))].slice(0, 15);
        const verified = await Promise.all(
          ids.map(async (id) => {
            try {
              const r = await fetch(
                `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`
              );
              if (!r.ok) return null;
              const j = await r.json();
              return {
                videoId: id,
                title: String(j.title || `Video ${id}`),
                description: '',
                thumbnailUrl: getYouTubeThumbnail(id)
              } as YouTubeChannelVideo;
            } catch {
              return null;
            }
          })
        );
        videos.push(...verified.filter((v): v is YouTubeChannelVideo => Boolean(v)));
      } catch {}
    }

    if (!title && !channelId && videos.length === 0) return null;

    return {
      channelId: channelId || `yt-${Date.now()}`,
      title: title || 'YouTube Channel',
      description: description || 'Curated YouTube channel for kids.',
      avatarUrl: avatarUrl || 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=200&h=200&fit=crop',
      videos
    };
  } catch (err) {
    console.warn('fetchYouTubeChannelInfo error:', err);
    return null;
  }
}
