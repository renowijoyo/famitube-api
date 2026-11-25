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

export const TODDLER_ALLOWED_CATEGORIES = new Set([
  'cartoons & fun',
  'learning & abcs',
  'music & rhymes',
  'animals & nature',
  'art & crafts',
  'stories & reading',
  'kids yoga & active'
]);

export function isCategoryAllowedForAge(category: string | undefined, ageRating?: string): boolean {
  const age = String(ageRating || 'ALL').trim().toUpperCase();
  if (age !== 'TODDLER') return true;
  const cat = String(category || '').trim().toLowerCase();
  if (!cat || cat === 'all videos' || cat === 'cat-all') return true;
  return TODDLER_ALLOWED_CATEGORIES.has(cat);
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

export interface YouTubeChannelPlaylist {
  playlistId: string;
  title: string;
  thumbnailUrl: string;
  videoCount: number;
}

export interface YouTubeChannelInfo {
  channelId: string;
  title: string;
  description: string;
  avatarUrl: string;
  bannerUrl?: string;
  videos: YouTubeChannelVideo[];
  playlists: YouTubeChannelPlaylist[];
}

function extractYtInitialData(html: string): any | null {
  const markers = ['var ytInitialData = ', 'window["ytInitialData"] = '];
  for (const marker of markers) {
    const startIdx = html.indexOf(marker);
    if (startIdx >= 0) {
      const jsonStart = startIdx + marker.length;
      const endIdx = html.indexOf(';</script>', jsonStart);
      if (endIdx > jsonStart) {
        try {
          return JSON.parse(html.slice(jsonStart, endIdx));
        } catch {
          // continue
        }
      }
    }
  }
  return null;
}

function parseVideosFromYtInitialData(data: any): YouTubeChannelVideo[] {
  if (!data) return [];
  const videos: YouTubeChannelVideo[] = [];
  const seen = new Set<string>();

  function walk(node: any) {
    if (!node || typeof node !== 'object') return;
    if (node.lockupViewModel) {
      const lvm = node.lockupViewModel;
      const cid = String(lvm.contentId || '').trim();
      const ctype = String(lvm.contentType || '');
      if (
        cid.length === 11 &&
        (ctype === 'LOCKUP_CONTENT_TYPE_VIDEO' || !ctype.includes('PLAYLIST')) &&
        !seen.has(cid)
      ) {
        const title =
          lvm.metadata?.lockupMetadataViewModel?.title?.content ||
          `Video ${cid}`;
        seen.add(cid);
        videos.push({
          videoId: cid,
          title: String(title).trim(),
          description: '',
          thumbnailUrl: getYouTubeThumbnail(cid)
        });
      }
    }
    if (node.videoRenderer && node.videoRenderer.videoId) {
      const vr = node.videoRenderer;
      const vid = String(vr.videoId).trim();
      if (vid.length === 11 && !seen.has(vid)) {
        const title =
          vr.title?.runs?.[0]?.text ||
          vr.title?.simpleText ||
          `Video ${vid}`;
        seen.add(vid);
        videos.push({
          videoId: vid,
          title: String(title).trim(),
          description: vr.descriptionSnippet?.runs?.map((r: any) => r.text).join('') || '',
          thumbnailUrl: getYouTubeThumbnail(vid),
          publishedAt: vr.publishedTimeText?.simpleText
        });
      }
    }
    if (node.playlistVideoRenderer && node.playlistVideoRenderer.videoId) {
      const pvr = node.playlistVideoRenderer;
      const vid = String(pvr.videoId).trim();
      if (vid.length === 11 && !seen.has(vid)) {
        const title =
          pvr.title?.runs?.[0]?.text ||
          pvr.title?.simpleText ||
          `Video ${vid}`;
        seen.add(vid);
        videos.push({
          videoId: vid,
          title: String(title).trim(),
          description: '',
          thumbnailUrl: getYouTubeThumbnail(vid)
        });
      }
    }
    for (const key of Object.keys(node)) {
      walk(node[key]);
    }
  }

  walk(data);
  return videos;
}

function parsePlaylistsFromYtInitialData(data: any): YouTubeChannelPlaylist[] {
  if (!data) return [];
  const playlists: YouTubeChannelPlaylist[] = [];
  const seen = new Set<string>();

  function walk(node: any) {
    if (!node || typeof node !== 'object') return;
    if (node.lockupViewModel) {
      const lvm = node.lockupViewModel;
      const pid = String(lvm.contentId || '').trim();
      const ctype = String(lvm.contentType || '');
      if (
        pid.startsWith('PL') &&
        pid !== 'PLAYLIST_EDIT_LIST_TYPE_QUEUE' &&
        (ctype === 'LOCKUP_CONTENT_TYPE_PLAYLIST' || pid.length >= 16) &&
        !seen.has(pid)
      ) {
        const title =
          lvm.metadata?.lockupMetadataViewModel?.title?.content ||
          `Playlist ${pid}`;
        const sources =
          lvm.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources || [];
        const rawThumb = sources.length > 0 ? String(sources[sources.length - 1].url || '') : '';
        const overlays =
          lvm.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.overlays || [];
        let videoCount = 0;
        for (const ov of overlays) {
          const badges = ov?.thumbnailOverlayBadgeViewModel?.thumbnailBadges || [];
          for (const b of badges) {
            const txt = String(b?.thumbnailBadgeViewModel?.text || '');
            const m = txt.match(/(\d+)/);
            if (m) {
              videoCount = Number(m[1]) || 0;
              break;
            }
          }
        }
        seen.add(pid);
        playlists.push({
          playlistId: pid,
          title: String(title).trim(),
          thumbnailUrl: rawThumb || 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=400&h=225&fit=crop',
          videoCount
        });
      }
    }
    if (node.gridPlaylistRenderer || node.playlistRenderer) {
      const pr = node.gridPlaylistRenderer || node.playlistRenderer;
      const pid = String(pr.playlistId || '').trim();
      if (pid.startsWith('PL') && !seen.has(pid)) {
        const title =
          pr.title?.runs?.[0]?.text ||
          pr.title?.simpleText ||
          `Playlist ${pid}`;
        const thumbs = pr.thumbnail?.thumbnails || pr.thumbnails?.[0]?.thumbnails || [];
        const rawThumb = thumbs.length > 0 ? String(thumbs[thumbs.length - 1].url || '') : '';
        const countTxt =
          pr.videoCountText?.runs?.map((r: any) => r.text).join('') ||
          pr.videoCountShortText?.simpleText ||
          pr.videoCount ||
          '0';
        const m = String(countTxt).match(/(\d+)/);
        seen.add(pid);
        playlists.push({
          playlistId: pid,
          title: String(title).trim(),
          thumbnailUrl: rawThumb || 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=400&h=225&fit=crop',
          videoCount: m ? Number(m[1]) : 0
        });
      }
    }
    for (const key of Object.keys(node)) {
      walk(node[key]);
    }
  }

  walk(data);
  return playlists;
}

export async function fetchYouTubeChannelPlaylists(urlOrHandle: string): Promise<YouTubeChannelPlaylist[]> {
  const input = String(urlOrHandle || '').trim();
  if (!input) return [];
  let baseUrl = input;
  if (baseUrl.startsWith('@')) {
    baseUrl = `https://www.youtube.com/${baseUrl}`;
  } else if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = baseUrl.startsWith('UC') && baseUrl.length === 24
      ? `https://www.youtube.com/channel/${baseUrl}`
      : `https://www.youtube.com/@${baseUrl}`;
  }
  const playlistsUrl = `${baseUrl.replace(/\/+$/, '')}/playlists`;
  try {
    const res = await fetch(playlistsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: AbortSignal.timeout(7000)
    });
    if (!res.ok) return [];
    const html = await res.text();
    const data = extractYtInitialData(html);
    return parsePlaylistsFromYtInitialData(data);
  } catch (err) {
    console.warn('fetchYouTubeChannelPlaylists error:', err);
    return [];
  }
}

export async function fetchYouTubePlaylistVideos(playlistId: string): Promise<{
  playlistId: string;
  title: string;
  videos: YouTubeChannelVideo[];
} | null> {
  const cleanId = String(playlistId || '').trim();
  if (!cleanId) return null;

  try {
    const res = await fetch(`https://www.youtube.com/playlist?list=${encodeURIComponent(cleanId)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: AbortSignal.timeout(8000)
    });
    let title = `Playlist`;
    const videos: YouTubeChannelVideo[] = [];
    const seen = new Set<string>();

    if (res.ok) {
      const html = await res.text();
      const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/);
      if (ogTitle && ogTitle[1]) {
        title = ogTitle[1].replace(/ - YouTube$/i, '').trim();
      }
      const data = extractYtInitialData(html);
      for (const v of parseVideosFromYtInitialData(data)) {
        if (!seen.has(v.videoId)) {
          seen.add(v.videoId);
          videos.push(v);
        }
      }
    }

    // Fallback to YouTube's public playlist Atom/RSS feed if HTML had no items
    if (videos.length === 0) {
      const feedRes = await fetch(
        `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(cleanId)}`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (feedRes.ok) {
        const xml = await feedRes.text();
        const feedTitleMatch = xml.match(/<title>([^<]+)<\/title>/);
        if (feedTitleMatch && feedTitleMatch[1]) {
          title = feedTitleMatch[1].trim();
        }
        const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
        for (const entry of entries) {
          const vIdMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
          const tMatch = entry.match(/<title>([^<]+)<\/title>/);
          const dMatch = entry.match(/<media:description>([\s\S]*?)<\/media:description>/);
          const pMatch = entry.match(/<published>([^<]+)<\/published>/);
          if (vIdMatch && vIdMatch[1]) {
            const vId = vIdMatch[1].trim();
            if (!seen.has(vId)) {
              seen.add(vId);
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
      }
    }

    return {
      playlistId: cleanId,
      title,
      videos
    };
  } catch (err) {
    console.warn('fetchYouTubePlaylistVideos error:', err);
    return null;
  }
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
    const seenVideoIds = new Set<string>();
    const cleanBaseUrl = targetUrl.replace(/\/+(videos|playlists|shorts|streams)?$/i, '');

    // Fetch /videos tab (up to ~30 videos), RSS feed (publishedAt timestamps), and /playlists tab in parallel
    const [videosTabList, rssVideos, playlists] = await Promise.all([
      (async (): Promise<YouTubeChannelVideo[]> => {
        try {
          const vRes = await fetch(`${cleanBaseUrl}/videos`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept-Language': 'en-US,en;q=0.9'
            },
            signal: AbortSignal.timeout(7000)
          });
          if (!vRes.ok) return [];
          const vHtml = await vRes.text();
          return parseVideosFromYtInitialData(extractYtInitialData(vHtml));
        } catch {
          return [];
        }
      })(),
      (async (): Promise<YouTubeChannelVideo[]> => {
        if (!channelId) return [];
        try {
          const feedRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
            signal: AbortSignal.timeout(6000)
          });
          if (!feedRes.ok) return [];
          const xml = await feedRes.text();
          const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
          const list: YouTubeChannelVideo[] = [];
          for (const entry of entries) {
            const vIdMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
            const tMatch = entry.match(/<title>([^<]+)<\/title>/);
            const dMatch = entry.match(/<media:description>([\s\S]*?)<\/media:description>/);
            const pMatch = entry.match(/<published>([^<]+)<\/published>/);
            if (vIdMatch && vIdMatch[1]) {
              const vId = vIdMatch[1].trim();
              list.push({
                videoId: vId,
                title: tMatch ? tMatch[1].trim() : `Video ${vId}`,
                description: dMatch ? dMatch[1].trim() : '',
                thumbnailUrl: getYouTubeThumbnail(vId),
                publishedAt: pMatch ? pMatch[1].trim() : undefined
              });
            }
          }
          return list;
        } catch {
          return [];
        }
      })(),
      fetchYouTubeChannelPlaylists(cleanBaseUrl)
    ]);

    const rssMap = new Map(rssVideos.map((v) => [v.videoId, v]));
    for (const v of videosTabList) {
      if (!seenVideoIds.has(v.videoId)) {
        seenVideoIds.add(v.videoId);
        const rssItem = rssMap.get(v.videoId);
        videos.push({
          ...v,
          description: v.description || rssItem?.description || '',
          publishedAt: v.publishedAt || rssItem?.publishedAt
        });
      }
    }
    for (const v of rssVideos) {
      if (!seenVideoIds.has(v.videoId)) {
        seenVideoIds.add(v.videoId);
        videos.push(v);
      }
    }

    if (!title && !channelId && videos.length === 0 && playlists.length === 0) return null;

    return {
      channelId: channelId || `yt-${Date.now()}`,
      title: title || 'YouTube Channel',
      description: description || 'Curated YouTube channel for kids.',
      avatarUrl: avatarUrl || 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=200&h=200&fit=crop',
      videos,
      playlists
    };
  } catch (err) {
    console.warn('fetchYouTubeChannelInfo error:', err);
    return null;
  }
}
