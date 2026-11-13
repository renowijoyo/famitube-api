import fs from 'fs';
import path from 'path';
import {
  DatabaseSchema,
  Video,
  Channel,
  Playlist,
  Category,
  AppConfig,
  LiveScheduleState,
  UpNextItem
} from './types.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const INITIAL_CATEGORIES: Category[] = [
  { id: 'cat-all', name: 'All Videos', icon: 'auto_awesome', color: '#FF4D6D' },
  { id: 'cat-science', name: 'Science & Space', icon: 'rocket_launch', color: '#4361EE' },
  { id: 'cat-cartoons', name: 'Cartoons & Fun', icon: 'theater_comedy', color: '#7209B7' },
  { id: 'cat-learning', name: 'Learning & ABCs', icon: 'school', color: '#4CC9F0' },
  { id: 'cat-music', name: 'Music & Rhymes', icon: 'music_note', color: '#F72585' },
  { id: 'cat-animals', name: 'Animals & Nature', icon: 'pets', color: '#06D6A0' },
  { id: 'cat-crafts', name: 'Art & Crafts', icon: 'palette', color: '#FFB703' }
];

const INITIAL_CHANNELS: Channel[] = [
  {
    id: 'chan-livetv',
    name: 'KidsTube Live TV',
    description: '24/7 scheduled kids TV broadcast! Always playing curated cartoons & science.',
    avatarUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=200&h=200&fit=crop',
    bannerUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1000&h=300&fit=crop',
    category: 'Cartoons & Fun',
    isVerified: true,
    channelType: 'LIVE_TV',
    scheduleStartTime: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    videoIds: ['vid-1', 'vid-2', 'vid-4', 'vid-6']
  },
  {
    id: 'chan-natgeo',
    name: 'Nat Geo Kids',
    description: 'Awesome videos about animals, science, history, and fun adventures!',
    avatarUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&h=200&fit=crop',
    bannerUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1000&h=300&fit=crop',
    category: 'Animals & Nature',
    isVerified: true,
    channelType: 'ON_DEMAND',
    videoIds: ['vid-3']
  },
  {
    id: 'chan-scishow',
    name: 'SciShow Kids',
    description: 'Explore the fascinating science behind everyday questions and mysteries.',
    avatarUrl: 'https://images.unsplash.com/photo-1507668077129-56e32842fceb?w=200&h=200&fit=crop',
    bannerUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1000&h=300&fit=crop',
    category: 'Science & Space',
    isVerified: true,
    channelType: 'ON_DEMAND',
    videoIds: ['vid-2', 'vid-6']
  },
  {
    id: 'chan-blender',
    name: 'Blender Open Animation',
    description: 'Award-winning open source 3D animated shorts suitable for all ages.',
    avatarUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=200&h=200&fit=crop',
    bannerUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1000&h=300&fit=crop',
    category: 'Cartoons & Fun',
    isVerified: true,
    channelType: 'ON_DEMAND',
    videoIds: ['vid-1', 'vid-5']
  },
  {
    id: 'chan-supersimple',
    name: 'Simple Songs & Fun',
    description: 'Catchy songs, nursery rhymes, and upbeat learning tunes for young kids.',
    avatarUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&h=200&fit=crop',
    bannerUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1000&h=300&fit=crop',
    category: 'Music & Rhymes',
    isVerified: true,
    channelType: 'ON_DEMAND',
    videoIds: ['vid-4']
  }
];

const INITIAL_VIDEOS: Video[] = [
  {
    id: 'vid-1',
    title: 'Big Buck Bunny - An Animated Spring Adventure',
    description: 'A giant rabbit with a heart bigger than himself meets bullying forest creatures who ruin his day. A heartwarming open-movie classic.',
    sourceType: 'DIRECT',
    sourceUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=800&h=450&fit=crop',
    duration: 596,
    channelId: 'chan-blender',
    channelTitle: 'Blender Open Animation',
    channelAvatar: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=200&h=200&fit=crop',
    category: 'Cartoons & Fun',
    ageRating: 'ALL',
    isFeatured: true,
    isApproved: true,
    views: 12450,
    tags: ['rabbit', 'cartoon', 'nature', 'spring', 'animals'],
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    id: 'vid-2',
    title: 'Why Do We Have Seasons? Earth Tilt Explained!',
    description: 'Ever wonder why summer is hot and winter is cold? Join us on a journey through space to see how our tilted Earth creates summer, fall, winter, and spring!',
    sourceType: 'YOUTUBE',
    sourceUrl: 'https://www.youtube.com/watch?v=b25g4nZTHvM',
    youtubeVideoId: 'b25g4nZTHvM',
    thumbnailUrl: 'https://img.youtube.com/vi/b25g4nZTHvM/hqdefault.jpg',
    duration: 254,
    channelId: 'chan-scishow',
    channelTitle: 'SciShow Kids',
    channelAvatar: 'https://images.unsplash.com/photo-1507668077129-56e32842fceb?w=200&h=200&fit=crop',
    category: 'Science & Space',
    ageRating: 'YOUNG_KIDS',
    isFeatured: true,
    isApproved: true,
    views: 8930,
    tags: ['earth', 'seasons', 'space', 'science', 'sun'],
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString()
  },
  {
    id: 'vid-3',
    title: 'Elephants 101 - Gentle Giants of the Savanna',
    description: 'Learn incredible facts about elephant trunks, family herds, and how these smart giants communicate over miles!',
    sourceType: 'YOUTUBE',
    sourceUrl: 'https://www.youtube.com/watch?v=Aw6GkiCvcWs',
    youtubeVideoId: 'Aw6GkiCvcWs',
    thumbnailUrl: 'https://img.youtube.com/vi/Aw6GkiCvcWs/hqdefault.jpg',
    duration: 215,
    channelId: 'chan-natgeo',
    channelTitle: 'Nat Geo Kids',
    channelAvatar: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&h=200&fit=crop',
    category: 'Animals & Nature',
    ageRating: 'ALL',
    isFeatured: false,
    isApproved: true,
    views: 15400,
    tags: ['elephants', 'safari', 'wildlife', 'nature'],
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString()
  },
  {
    id: 'vid-4',
    title: 'The Solar System Song - Planets for Kids',
    description: 'Sing along to all 8 planets from Mercury to Neptune! Fun music video teaching kids the order and sizes of planets.',
    sourceType: 'YOUTUBE',
    sourceUrl: 'https://www.youtube.com/watch?v=mQrlgH933Po',
    youtubeVideoId: 'mQrlgH933Po',
    thumbnailUrl: 'https://img.youtube.com/vi/mQrlgH933Po/hqdefault.jpg',
    duration: 185,
    channelId: 'chan-supersimple',
    channelTitle: 'Simple Songs & Fun',
    channelAvatar: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&h=200&fit=crop',
    category: 'Music & Rhymes',
    ageRating: 'TODDLER',
    isFeatured: true,
    isApproved: true,
    views: 28310,
    tags: ['solar system', 'planets', 'song', 'singalong', 'space'],
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString()
  },
  {
    id: 'vid-5',
    title: 'For the Birds - Pixar Style Cartoon Comedy',
    description: 'A flock of small birds sitting on a telephone wire get an unexpected visit from a quirky large bird.',
    sourceType: 'DIRECT',
    sourceUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1522858547550-3405742f160d?w=800&h=450&fit=crop',
    duration: 15,
    channelId: 'chan-blender',
    channelTitle: 'Blender Open Animation',
    channelAvatar: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=200&h=200&fit=crop',
    category: 'Cartoons & Fun',
    ageRating: 'ALL',
    isFeatured: false,
    isApproved: true,
    views: 4520,
    tags: ['birds', 'comedy', 'animation', 'short'],
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString()
  },
  {
    id: 'vid-6',
    title: 'How Do Airplanes Fly? Bernoulli & Lift for Kids',
    description: 'Discover how wings create lift, engines provide thrust, and how pilots steer huge planes through the sky!',
    sourceType: 'YOUTUBE',
    sourceUrl: 'https://www.youtube.com/watch?v=Gg0TXNXgz-w',
    youtubeVideoId: 'Gg0TXNXgz-w',
    thumbnailUrl: 'https://img.youtube.com/vi/Gg0TXNXgz-w/hqdefault.jpg',
    duration: 310,
    channelId: 'chan-scishow',
    channelTitle: 'SciShow Kids',
    channelAvatar: 'https://images.unsplash.com/photo-1507668077129-56e32842fceb?w=200&h=200&fit=crop',
    category: 'Science & Space',
    ageRating: 'YOUNG_KIDS',
    isFeatured: false,
    isApproved: true,
    views: 19800,
    tags: ['airplane', 'flight', 'physics', 'invention'],
    createdAt: new Date(Date.now() - 86400000 * 12).toISOString()
  }
];

const INITIAL_PLAYLISTS: Playlist[] = [
  {
    id: 'pl-space',
    title: 'Space Explorers Club',
    description: 'Journey to the stars, planets, and galaxies!',
    thumbnailUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&h=350&fit=crop',
    videoIds: ['vid-2', 'vid-4'],
    category: 'Science & Space',
    ageRating: 'ALL'
  },
  {
    id: 'pl-fun-cartoons',
    title: 'Weekend Morning Cartoons',
    description: 'Safe, fun, hilarious cartoons guaranteed to make you smile.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=600&h=350&fit=crop',
    videoIds: ['vid-1', 'vid-5'],
    category: 'Cartoons & Fun',
    ageRating: 'ALL'
  }
];

const INITIAL_CONFIG: AppConfig = {
  appName: 'KidsTube Safe Video Player',
  version: '1.0.0',
  welcomeMessage: 'Welcome to KidsTube! Enjoy safe, curated videos chosen with care.',
  parentalDefaults: {
    defaultWatchLimitMinutes: 45,
    enforcePin: true
  }
};

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_PATH)) {
      try {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as DatabaseSchema;
        // Ensure channelType & videoIds exist on migrated channels
        parsed.channels = (parsed.channels || []).map((ch) => ({
          ...ch,
          channelType: ch.channelType || 'ON_DEMAND',
          videoIds:
            ch.videoIds ||
            (parsed.videos || []).filter((v) => v.channelId === ch.id).map((v) => v.id)
        }));
        // Seed Live TV channel if not present yet
        if (!parsed.channels.some((c) => c.channelType === 'LIVE_TV')) {
          parsed.channels.unshift(INITIAL_CHANNELS[0]);
          this.saveDirect(parsed);
        }
        return parsed;
      } catch (err) {
        console.error('Failed to parse database file, resetting to initial data:', err);
      }
    }

    const initial: DatabaseSchema = {
      videos: INITIAL_VIDEOS,
      channels: INITIAL_CHANNELS,
      playlists: INITIAL_PLAYLISTS,
      categories: INITIAL_CATEGORIES,
      config: INITIAL_CONFIG
    };

    this.saveDirect(initial);
    return initial;
  }

  private saveDirect(data: DatabaseSchema): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  }

  public save(): void {
    this.saveDirect(this.data);
  }

  // --- Videos ---
  public getVideos(filter?: {
    category?: string;
    channelId?: string;
    ageRating?: string;
    search?: string;
    onlyApproved?: boolean;
    featured?: boolean;
  }): Video[] {
    let list = this.data.videos;

    if (filter?.onlyApproved ?? true) {
      list = list.filter((v) => v.isApproved);
    }
    if (filter?.category && filter.category !== 'All Videos' && filter.category !== 'cat-all') {
      list = list.filter((v) => v.category.toLowerCase() === filter.category!.toLowerCase());
    }
    if (filter?.channelId) {
      const ch = this.data.channels.find((c) => c.id === filter.channelId);
      if (ch && ch.videoIds && ch.videoIds.length > 0) {
        const orderMap = new Map(ch.videoIds.map((id, idx) => [id, idx]));
        list = list
          .filter((v) => orderMap.has(v.id) || v.channelId === filter.channelId)
          .sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
      } else {
        list = list.filter((v) => v.channelId === filter.channelId);
      }
    }
    if (filter?.ageRating && filter.ageRating !== 'ALL') {
      list = list.filter((v) => v.ageRating === filter.ageRating || v.ageRating === 'ALL');
    }
    if (filter?.featured !== undefined) {
      list = list.filter((v) => v.isFeatured === filter.featured);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          v.description.toLowerCase().includes(q) ||
          v.tags.some((t) => t.toLowerCase().includes(q)) ||
          v.channelTitle.toLowerCase().includes(q)
      );
    }

    return list;
  }

  public getVideoById(id: string): Video | undefined {
    return this.data.videos.find((v) => v.id === id);
  }

  public addVideo(video: Video): Video {
    this.data.videos.unshift(video);
    // Also add to channel's videoIds if channel exists
    const channel = this.data.channels.find((c) => c.id === video.channelId);
    if (channel) {
      channel.videoIds = channel.videoIds || [];
      if (!channel.videoIds.includes(video.id)) {
        channel.videoIds.push(video.id);
      }
    }
    this.save();
    return video;
  }

  public updateVideo(id: string, updates: Partial<Video>): Video | null {
    const idx = this.data.videos.findIndex((v) => v.id === id);
    if (idx === -1) return null;
    this.data.videos[idx] = { ...this.data.videos[idx], ...updates };
    this.save();
    return this.data.videos[idx];
  }

  public deleteVideo(id: string): boolean {
    const prevLen = this.data.videos.length;
    this.data.videos = this.data.videos.filter((v) => v.id !== id);
    this.data.channels.forEach((ch) => {
      if (ch.videoIds) {
        ch.videoIds = ch.videoIds.filter((vid) => vid !== id);
      }
    });
    if (this.data.videos.length !== prevLen) {
      this.save();
      return true;
    }
    return false;
  }

  public incrementViews(id: string): void {
    const video = this.getVideoById(id);
    if (video) {
      video.views += 1;
      this.save();
    }
  }

  // --- Channels ---
  public getChannelVideos(channelId: string): Video[] {
    return this.getVideos({ channelId, onlyApproved: true });
  }

  public getChannels(): Channel[] {
    return this.data.channels.map((c) => ({
      ...c,
      channelType: c.channelType || 'ON_DEMAND',
      videoCount: this.getChannelVideos(c.id).length
    }));
  }

  public getChannelById(id: string): Channel | undefined {
    const c = this.data.channels.find((ch) => ch.id === id);
    if (!c) return undefined;
    return {
      ...c,
      channelType: c.channelType || 'ON_DEMAND',
      videoCount: this.getChannelVideos(c.id).length
    };
  }

  public addChannel(channel: Channel): Channel {
    this.data.channels.push({
      ...channel,
      channelType: channel.channelType || 'ON_DEMAND',
      scheduleStartTime: channel.scheduleStartTime || new Date().toISOString(),
      videoIds: channel.videoIds || []
    });
    this.save();
    return channel;
  }

  public updateChannel(id: string, updates: Partial<Channel>): Channel | null {
    const idx = this.data.channels.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    this.data.channels[idx] = { ...this.data.channels[idx], ...updates };
    this.save();
    return this.getChannelById(id)!;
  }

  public deleteChannel(id: string): boolean {
    const prev = this.data.channels.length;
    this.data.channels = this.data.channels.filter((c) => c.id !== id);
    if (this.data.channels.length !== prev) {
      this.save();
      return true;
    }
    return false;
  }

  public addVideoToChannel(channelId: string, videoId: string): Channel | null {
    const ch = this.data.channels.find((c) => c.id === channelId);
    const vid = this.getVideoById(videoId);
    if (!ch || !vid) return null;

    ch.videoIds = ch.videoIds || [];
    if (!ch.videoIds.includes(videoId)) {
      ch.videoIds.push(videoId);
      this.save();
    }
    return this.getChannelById(channelId)!;
  }

  public removeVideoFromChannel(channelId: string, videoId: string): Channel | null {
    const ch = this.data.channels.find((c) => c.id === channelId);
    if (!ch) return null;
    ch.videoIds = (ch.videoIds || []).filter((id) => id !== videoId);
    this.save();
    return this.getChannelById(channelId)!;
  }

  /**
   * Computes the current live broadcast state for a LIVE_TV channel based on wall-clock time.
   * Loops seamlessly through the channel's scheduled videos using each video's duration.
   */
  public getLiveChannelState(channelId: string): LiveScheduleState | null {
    const channel = this.getChannelById(channelId);
    if (!channel) return null;

    const videos = this.getChannelVideos(channelId);
    if (videos.length === 0) {
      return {
        channel,
        serverTime: new Date().toISOString(),
        currentVideo: null,
        offsetSeconds: 0,
        remainingSeconds: 0,
        upNext: []
      };
    }

    const totalCycleSeconds = videos.reduce((sum, v) => sum + Math.max(10, v.duration || 180), 0);
    const anchorMs = channel.scheduleStartTime ? new Date(channel.scheduleStartTime).getTime() : 0;
    const nowMs = Date.now();
    const elapsedSinceAnchorSec = Math.max(0, Math.floor((nowMs - anchorMs) / 1000));
    const cyclePos = elapsedSinceAnchorSec % totalCycleSeconds;

    let accumulated = 0;
    let currentIdx = 0;
    let offsetSeconds = 0;
    let remainingSeconds = 0;

    for (let i = 0; i < videos.length; i++) {
      const dur = Math.max(10, videos[i].duration || 180);
      if (cyclePos < accumulated + dur) {
        currentIdx = i;
        offsetSeconds = cyclePos - accumulated;
        remainingSeconds = dur - offsetSeconds;
        break;
      }
      accumulated += dur;
    }

    const upNext: UpNextItem[] = [];
    let nextStartIn = remainingSeconds;
    const maxUpNext = Math.min(videos.length - 1, 4);
    for (let j = 1; j <= maxUpNext; j++) {
      const nextVideo = videos[(currentIdx + j) % videos.length];
      upNext.push({
        video: nextVideo,
        startsInSeconds: nextStartIn
      });
      nextStartIn += Math.max(10, nextVideo.duration || 180);
    }

    return {
      channel,
      serverTime: new Date(nowMs).toISOString(),
      currentVideo: videos[currentIdx],
      offsetSeconds,
      remainingSeconds,
      upNext
    };
  }

  // --- Playlists ---
  public getPlaylists(): Playlist[] {
    return this.data.playlists;
  }

  public getPlaylistById(id: string): Playlist | undefined {
    return this.data.playlists.find((p) => p.id === id);
  }

  public addPlaylist(playlist: Playlist): Playlist {
    this.data.playlists.push(playlist);
    this.save();
    return playlist;
  }

  // --- Categories ---
  public getCategories(): Category[] {
    return this.data.categories.map((c) => ({
      ...c,
      videoCount:
        c.id === 'cat-all'
          ? this.data.videos.filter((v) => v.isApproved).length
          : this.data.videos.filter((v) => v.category === c.name && v.isApproved).length
    }));
  }

  // --- Config ---
  public getConfig(): AppConfig {
    return this.data.config;
  }

  public updateConfig(updates: Partial<AppConfig>): AppConfig {
    this.data.config = { ...this.data.config, ...updates };
    this.save();
    return this.data.config;
  }

  public getStats() {
    return {
      totalVideos: this.data.videos.length,
      approvedVideos: this.data.videos.filter((v) => v.isApproved).length,
      pendingVideos: this.data.videos.filter((v) => !v.isApproved).length,
      totalChannels: this.data.channels.length,
      totalPlaylists: this.data.playlists.length,
      totalViews: this.data.videos.reduce((sum, v) => sum + (v.views || 0), 0)
    };
  }
}

export const db = new Database();
