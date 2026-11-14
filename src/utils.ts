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
