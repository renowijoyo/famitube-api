import mysql, { Pool, RowDataPacket } from 'mysql2/promise';
import {
  Video,
  Channel,
  Playlist,
  Category,
  AppConfig,
  LiveScheduleState,
  UpNextItem,
  User
} from './types.js';

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
    description: 'Awesome videos about animals, ocean adventures, science, and fun wildlife!',
    avatarUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&h=200&fit=crop',
    bannerUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1000&h=300&fit=crop',
    category: 'Animals & Nature',
    isVerified: true,
    channelType: 'ON_DEMAND',
    videoIds: ['vid-3', 'vid-7', 'vid-8', 'vid-9']
  },
  {
    id: 'chan-scishow',
    name: 'SciShow Kids',
    description: 'Explore the fascinating science behind planets, volcanoes, and everyday mysteries.',
    avatarUrl: 'https://images.unsplash.com/photo-1507668077129-56e32842fceb?w=200&h=200&fit=crop',
    bannerUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1000&h=300&fit=crop',
    category: 'Science & Space',
    isVerified: true,
    channelType: 'ON_DEMAND',
    videoIds: ['vid-2', 'vid-6', 'vid-10', 'vid-11', 'vid-12']
  },
  {
    id: 'chan-crashcourse',
    name: 'Crash Course Kids',
    description: 'Fun, bite-sized science lessons on ecosystems, food chains, and Earth science.',
    avatarUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=200&h=200&fit=crop',
    bannerUrl: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1000&h=300&fit=crop',
    category: 'Science & Space',
    isVerified: true,
    channelType: 'ON_DEMAND',
    videoIds: ['vid-13', 'vid-2']
  },
  {
    id: 'chan-abclearn',
    name: 'Little Learners ABC',
    description: 'Early childhood phonics, ABC songs, counting, and interactive sing-alongs.',
    avatarUrl: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=200&h=200&fit=crop',
    bannerUrl: 'https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=1000&h=300&fit=crop',
    category: 'Learning & ABCs',
    isVerified: true,
    channelType: 'ON_DEMAND',
    videoIds: ['vid-14', 'vid-15']
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
    title: 'Twinkle Twinkle Little Star - Nursery Rhymes for Kids',
    description: 'Sing along to the classic bedtime nursery rhyme with gentle animations from Super Simple Songs!',
    sourceType: 'YOUTUBE',
    sourceUrl: 'https://www.youtube.com/watch?v=yCjJyiqpAuU',
    youtubeVideoId: 'yCjJyiqpAuU',
    thumbnailUrl: 'https://img.youtube.com/vi/yCjJyiqpAuU/hqdefault.jpg',
    duration: 155,
    channelId: 'chan-supersimple',
    channelTitle: 'Simple Songs & Fun',
    channelAvatar: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&h=200&fit=crop',
    category: 'Music & Rhymes',
    ageRating: 'TODDLER',
    isFeatured: true,
    isApproved: true,
    views: 28310,
    tags: ['twinkle', 'nursery rhyme', 'song', 'singalong', 'bedtime'],
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
  },
  {
    id: 'vid-7',
    title: 'All About Penguins - Nat Geo Kids',
    description: 'Waddle into Antarctica and discover fun facts about how penguins swim, huddle, and raise their chicks!',
    sourceType: 'YOUTUBE',
    sourceUrl: 'https://www.youtube.com/watch?v=kp-qauWF_GU',
    youtubeVideoId: 'kp-qauWF_GU',
    thumbnailUrl: 'https://img.youtube.com/vi/kp-qauWF_GU/hqdefault.jpg',
    duration: 240,
    channelId: 'chan-natgeo',
    channelTitle: 'Nat Geo Kids',
    channelAvatar: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&h=200&fit=crop',
    category: 'Animals & Nature',
    ageRating: 'ALL',
    isFeatured: true,
    isApproved: true,
    views: 11200,
    tags: ['penguins', 'antarctica', 'birds', 'wildlife'],
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  {
    id: 'vid-8',
    title: 'All About Dolphins - Nat Geo Kids',
    description: 'Meet the smartest swimmers in the ocean! Learn how dolphins use echolocation and live in pods.',
    sourceType: 'YOUTUBE',
    sourceUrl: 'https://www.youtube.com/watch?v=ZZJzv_B5K9Q',
    youtubeVideoId: 'ZZJzv_B5K9Q',
    thumbnailUrl: 'https://img.youtube.com/vi/ZZJzv_B5K9Q/hqdefault.jpg',
    duration: 210,
    channelId: 'chan-natgeo',
    channelTitle: 'Nat Geo Kids',
    channelAvatar: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&h=200&fit=crop',
    category: 'Animals & Nature',
    ageRating: 'ALL',
    isFeatured: false,
    isApproved: true,
    views: 9850,
    tags: ['dolphins', 'ocean', 'marine', 'animals'],
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  {
    id: 'vid-9',
    title: 'World Ocean Adventures! Sharks & Coral Reefs',
    description: 'Dive beneath the waves with Nat Geo Kids to explore coral reefs, sharks, and amazing sea creatures.',
    sourceType: 'YOUTUBE',
    sourceUrl: 'https://www.youtube.com/watch?v=-Qd4-YxTfZI',
    youtubeVideoId: '-Qd4-YxTfZI',
    thumbnailUrl: 'https://img.youtube.com/vi/-Qd4-YxTfZI/hqdefault.jpg',
    duration: 360,
    channelId: 'chan-natgeo',
    channelTitle: 'Nat Geo Kids',
    channelAvatar: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&h=200&fit=crop',
    category: 'Animals & Nature',
    ageRating: 'YOUNG_KIDS',
    isFeatured: false,
    isApproved: true,
    views: 7420,
    tags: ['sharks', 'ocean', 'coral reef', 'adventure'],
    createdAt: new Date(Date.now() - 86400000 * 6).toISOString()
  },
  {
    id: 'vid-10',
    title: 'Explore the Solar System: The Rocky Planets',
    description: 'Blast off with SciShow Kids to visit Mercury, Venus, Earth, and Mars — the rocky inner planets!',
    sourceType: 'YOUTUBE',
    sourceUrl: 'https://www.youtube.com/watch?v=joq-IUFNkrw',
    youtubeVideoId: 'joq-IUFNkrw',
    thumbnailUrl: 'https://img.youtube.com/vi/joq-IUFNkrw/hqdefault.jpg',
    duration: 280,
    channelId: 'chan-scishow',
    channelTitle: 'SciShow Kids',
    channelAvatar: 'https://images.unsplash.com/photo-1507668077129-56e32842fceb?w=200&h=200&fit=crop',
    category: 'Science & Space',
    ageRating: 'YOUNG_KIDS',
    isFeatured: true,
    isApproved: true,
    views: 14300,
    tags: ['solar system', 'planets', 'mars', 'space'],
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    id: 'vid-11',
    title: 'Every Kind of Volcano - SciShow Kids',
    description: 'Why do volcanoes erupt? Learn about shield volcanoes, cinder cones, and bubbling magma!',
    sourceType: 'YOUTUBE',
    sourceUrl: 'https://www.youtube.com/watch?v=0jKoOUZ1GBM',
    youtubeVideoId: '0jKoOUZ1GBM',
    thumbnailUrl: 'https://img.youtube.com/vi/0jKoOUZ1GBM/hqdefault.jpg',
    duration: 225,
    channelId: 'chan-scishow',
    channelTitle: 'SciShow Kids',
    channelAvatar: 'https://images.unsplash.com/photo-1507668077129-56e32842fceb?w=200&h=200&fit=crop',
    category: 'Science & Space',
    ageRating: 'YOUNG_KIDS',
    isFeatured: false,
    isApproved: true,
    views: 9100,
    tags: ['volcano', 'geology', 'lava', 'science'],
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString()
  },
  {
    id: 'vid-12',
    title: 'Hawaiʻi: Land of Volcanoes - SciShow Kids',
    description: 'Discover how volcanic islands form in the middle of the Pacific Ocean!',
    sourceType: 'YOUTUBE',
    sourceUrl: 'https://www.youtube.com/watch?v=YR4wtGWK7eE',
    youtubeVideoId: 'YR4wtGWK7eE',
    thumbnailUrl: 'https://img.youtube.com/vi/YR4wtGWK7eE/hqdefault.jpg',
    duration: 230,
    channelId: 'chan-scishow',
    channelTitle: 'SciShow Kids',
    channelAvatar: 'https://images.unsplash.com/photo-1507668077129-56e32842fceb?w=200&h=200&fit=crop',
    category: 'Science & Space',
    ageRating: 'YOUNG_KIDS',
    isFeatured: false,
    isApproved: true,
    views: 6800,
    tags: ['hawaii', 'volcanoes', 'islands', 'earth'],
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString()
  },
  {
    id: 'vid-13',
    title: 'Fabulous Food Chains: Crash Course Kids #7.1',
    description: 'How does energy move from the sun to plants and animals? Explore ecosystems and food chains!',
    sourceType: 'YOUTUBE',
    sourceUrl: 'https://www.youtube.com/watch?v=MuKs9o1s8h8',
    youtubeVideoId: 'MuKs9o1s8h8',
    thumbnailUrl: 'https://img.youtube.com/vi/MuKs9o1s8h8/hqdefault.jpg',
    duration: 205,
    channelId: 'chan-crashcourse',
    channelTitle: 'Crash Course Kids',
    channelAvatar: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=200&h=200&fit=crop',
    category: 'Science & Space',
    ageRating: 'OLDER_KIDS',
    isFeatured: true,
    isApproved: true,
    views: 13400,
    tags: ['food chains', 'ecosystems', 'biology', 'science'],
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  {
    id: 'vid-14',
    title: 'The ABC Song - Phonics & Alphabet Learning',
    description: 'Sing along and learn all 26 letters of the alphabet with clear phonics and cheerful music.',
    sourceType: 'YOUTUBE',
    sourceUrl: 'https://www.youtube.com/watch?v=75p-N9YKqNo',
    youtubeVideoId: '75p-N9YKqNo',
    thumbnailUrl: 'https://img.youtube.com/vi/75p-N9YKqNo/hqdefault.jpg',
    duration: 140,
    channelId: 'chan-abclearn',
    channelTitle: 'Little Learners ABC',
    channelAvatar: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=200&h=200&fit=crop',
    category: 'Learning & ABCs',
    ageRating: 'TODDLER',
    isFeatured: true,
    isApproved: true,
    views: 31200,
    tags: ['abc', 'alphabet', 'phonics', 'toddler'],
    createdAt: new Date(Date.now() - 86400000 * 1).toISOString()
  },
  {
    id: 'vid-15',
    title: 'Finger Family Song - Nursery Rhymes with Lyrics',
    description: 'Fun interactive finger family song for toddlers and preschoolers to sing and count along!',
    sourceType: 'YOUTUBE',
    sourceUrl: 'https://www.youtube.com/watch?v=G6k7dChBaJ8',
    youtubeVideoId: 'G6k7dChBaJ8',
    thumbnailUrl: 'https://img.youtube.com/vi/G6k7dChBaJ8/hqdefault.jpg',
    duration: 130,
    channelId: 'chan-abclearn',
    channelTitle: 'Little Learners ABC',
    channelAvatar: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=200&h=200&fit=crop',
    category: 'Learning & ABCs',
    ageRating: 'TODDLER',
    isFeatured: false,
    isApproved: true,
    views: 18900,
    tags: ['finger family', 'counting', 'nursery rhyme', 'preschool'],
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
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

function parseJson<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  return val as T;
}

function mapVideoRow(row: RowDataPacket): Video {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    sourceType: row.sourceType,
    sourceUrl: row.sourceUrl,
    youtubeVideoId: row.youtubeVideoId || undefined,
    thumbnailUrl: row.thumbnailUrl,
    duration: Number(row.duration) || 180,
    channelId: row.channelId,
    channelTitle: row.channelTitle,
    channelAvatar: row.channelAvatar,
    category: row.category,
    ageRating: row.ageRating,
    isFeatured: Boolean(row.isFeatured),
    isApproved: Boolean(row.isApproved),
    views: Number(row.views) || 0,
    tags: parseJson<string[]>(row.tags, []),
    createdAt: row.createdAt
  };
}

function mapChannelRow(row: RowDataPacket): Channel {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    avatarUrl: row.avatarUrl,
    bannerUrl: row.bannerUrl || undefined,
    category: row.category,
    isVerified: Boolean(row.isVerified),
    channelType: row.channelType || 'ON_DEMAND',
    scheduleStartTime: row.scheduleStartTime || undefined,
    videoIds: parseJson<string[]>(row.videoIds, [])
  };
}

function mapPlaylistRow(row: RowDataPacket): Playlist {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    thumbnailUrl: row.thumbnailUrl,
    videoIds: parseJson<string[]>(row.videoIds, []),
    category: row.category,
    ageRating: row.ageRating
  };
}

function mapUserRow(row: RowDataPacket): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    isVerified: Boolean(row.isVerified),
    verificationToken: row.verificationToken || undefined,
    verificationExpiresAt: row.verificationExpiresAt || undefined,
    createdAt: row.createdAt
  };
}

class Database {
  private pool!: Pool;

  public async init(): Promise<void> {
    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl) {
      this.pool = mysql.createPool(databaseUrl);
    } else {
      const host = process.env.MYSQL_HOST || '127.0.0.1';
      const port = Number(process.env.MYSQL_PORT) || 3306;
      const user = process.env.MYSQL_USER || 'root';
      const password = process.env.MYSQL_PASSWORD || '';
      const database = process.env.MYSQL_DATABASE || 'kidstubedb';

      const bootstrapPool = mysql.createPool({
        host,
        port,
        user,
        password,
        database,
        waitForConnections: true,
        connectionLimit: 10
      });

      try {
        await bootstrapPool.query('SELECT 1');
        this.pool = bootstrapPool;
      } catch (err: unknown) {
        const mysqlErr = err as { code?: string };
        if (mysqlErr.code === 'ER_BAD_DB_ERROR') {
          await bootstrapPool.end();
          const bootstrapConn = await mysql.createConnection({ host, port, user, password });
          await bootstrapConn.query(
            `CREATE DATABASE IF NOT EXISTS \`${database.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
          );
          await bootstrapConn.end();

          this.pool = mysql.createPool({
            host,
            port,
            user,
            password,
            database,
            waitForConnections: true,
            connectionLimit: 10
          });
        } else {
          await bootstrapPool.end();
          throw err;
        }
      }
    }

    await this.createTables();
    await this.seedIfEmpty();
  }

  private async createTables(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        icon VARCHAR(64) NOT NULL,
        color VARCHAR(32) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS channels (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        avatarUrl TEXT NOT NULL,
        bannerUrl TEXT,
        category VARCHAR(255) NOT NULL,
        isVerified TINYINT(1) NOT NULL DEFAULT 1,
        channelType VARCHAR(32) NOT NULL DEFAULT 'ON_DEMAND',
        scheduleStartTime VARCHAR(64),
        videoIds JSON NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS videos (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(512) NOT NULL,
        description TEXT NOT NULL,
        sourceType VARCHAR(32) NOT NULL,
        sourceUrl TEXT NOT NULL,
        youtubeVideoId VARCHAR(64),
        thumbnailUrl TEXT NOT NULL,
        duration INT NOT NULL DEFAULT 180,
        channelId VARCHAR(64) NOT NULL,
        channelTitle VARCHAR(255) NOT NULL,
        channelAvatar TEXT NOT NULL,
        category VARCHAR(255) NOT NULL,
        ageRating VARCHAR(32) NOT NULL DEFAULT 'ALL',
        isFeatured TINYINT(1) NOT NULL DEFAULT 0,
        isApproved TINYINT(1) NOT NULL DEFAULT 1,
        views INT NOT NULL DEFAULT 0,
        tags JSON NOT NULL,
        createdAt VARCHAR(64) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS playlists (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        thumbnailUrl TEXT NOT NULL,
        videoIds JSON NOT NULL,
        category VARCHAR(255) NOT NULL,
        ageRating VARCHAR(32) NOT NULL DEFAULT 'ALL'
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_config (
        id VARCHAR(64) PRIMARY KEY,
        config JSON NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        passwordHash VARCHAR(255) NOT NULL,
        isVerified TINYINT(1) NOT NULL DEFAULT 0,
        verificationToken VARCHAR(128),
        verificationExpiresAt VARCHAR(64),
        createdAt VARCHAR(64) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  private async seedIfEmpty(): Promise<void> {
    const [catRows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS cnt FROM categories');
    if (catRows[0].cnt === 0) {
      for (const c of INITIAL_CATEGORIES) {
        await this.pool.query(
          'INSERT INTO categories (id, name, icon, color) VALUES (?, ?, ?, ?)',
          [c.id, c.name, c.icon, c.color]
        );
      }
    }

    const [chanRows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS cnt FROM channels');
    if (chanRows[0].cnt === 0) {
      for (const ch of INITIAL_CHANNELS) {
        await this.pool.query(
          `INSERT INTO channels (id, name, description, avatarUrl, bannerUrl, category, isVerified, channelType, scheduleStartTime, videoIds)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ch.id,
            ch.name,
            ch.description,
            ch.avatarUrl,
            ch.bannerUrl || null,
            ch.category,
            ch.isVerified ? 1 : 0,
            ch.channelType,
            ch.scheduleStartTime || null,
            JSON.stringify(ch.videoIds || [])
          ]
        );
      }
    }

    const [vidRows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS cnt FROM videos');
    if (vidRows[0].cnt === 0) {
      for (const v of INITIAL_VIDEOS) {
        await this.pool.query(
          `INSERT INTO videos (id, title, description, sourceType, sourceUrl, youtubeVideoId, thumbnailUrl, duration, channelId, channelTitle, channelAvatar, category, ageRating, isFeatured, isApproved, views, tags, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            v.id,
            v.title,
            v.description,
            v.sourceType,
            v.sourceUrl,
            v.youtubeVideoId || null,
            v.thumbnailUrl,
            v.duration,
            v.channelId,
            v.channelTitle,
            v.channelAvatar,
            v.category,
            v.ageRating,
            v.isFeatured ? 1 : 0,
            v.isApproved ? 1 : 0,
            v.views,
            JSON.stringify(v.tags || []),
            v.createdAt
          ]
        );
      }
    }

    const [plRows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS cnt FROM playlists');
    if (plRows[0].cnt === 0) {
      for (const p of INITIAL_PLAYLISTS) {
        await this.pool.query(
          `INSERT INTO playlists (id, title, description, thumbnailUrl, videoIds, category, ageRating)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [p.id, p.title, p.description, p.thumbnailUrl, JSON.stringify(p.videoIds), p.category, p.ageRating]
        );
      }
    }

    const [cfgRows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS cnt FROM app_config');
    if (cfgRows[0].cnt === 0) {
      await this.pool.query('INSERT INTO app_config (id, config) VALUES (?, ?)', [
        'default',
        JSON.stringify(INITIAL_CONFIG)
      ]);
    }
  }

  // --- Videos ---
  public async getVideos(filter?: {
    category?: string;
    channelId?: string;
    ageRating?: string;
    search?: string;
    onlyApproved?: boolean;
    featured?: boolean;
  }): Promise<Video[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM videos ORDER BY createdAt DESC'
    );
    let list = rows.map(mapVideoRow);

    if (filter?.onlyApproved ?? true) {
      list = list.filter((v) => v.isApproved);
    }
    if (filter?.category && filter.category !== 'All Videos' && filter.category !== 'cat-all') {
      list = list.filter((v) => v.category.toLowerCase() === filter.category!.toLowerCase());
    }
    if (filter?.channelId) {
      const ch = await this.getChannelById(filter.channelId);
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

  public async getVideoById(id: string): Promise<Video | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM videos WHERE id = ?', [id]);
    if (rows.length === 0) return undefined;
    return mapVideoRow(rows[0]);
  }

  public async addVideo(video: Video): Promise<Video> {
    await this.pool.query(
      `INSERT INTO videos (id, title, description, sourceType, sourceUrl, youtubeVideoId, thumbnailUrl, duration, channelId, channelTitle, channelAvatar, category, ageRating, isFeatured, isApproved, views, tags, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        video.id,
        video.title,
        video.description,
        video.sourceType,
        video.sourceUrl,
        video.youtubeVideoId || null,
        video.thumbnailUrl,
        video.duration,
        video.channelId,
        video.channelTitle,
        video.channelAvatar,
        video.category,
        video.ageRating,
        video.isFeatured ? 1 : 0,
        video.isApproved ? 1 : 0,
        video.views,
        JSON.stringify(video.tags || []),
        video.createdAt
      ]
    );

    const channel = await this.getChannelById(video.channelId);
    if (channel) {
      const videoIds = channel.videoIds || [];
      if (!videoIds.includes(video.id)) {
        videoIds.push(video.id);
        await this.pool.query('UPDATE channels SET videoIds = ? WHERE id = ?', [
          JSON.stringify(videoIds),
          channel.id
        ]);
      }
    }

    return video;
  }

  public async updateVideo(id: string, updates: Partial<Video>): Promise<Video | null> {
    const existing = await this.getVideoById(id);
    if (!existing) return null;

    const merged: Video = { ...existing, ...updates, id };
    await this.pool.query(
      `UPDATE videos SET title = ?, description = ?, sourceType = ?, sourceUrl = ?, youtubeVideoId = ?, thumbnailUrl = ?, duration = ?, channelId = ?, channelTitle = ?, channelAvatar = ?, category = ?, ageRating = ?, isFeatured = ?, isApproved = ?, views = ?, tags = ?, createdAt = ?
       WHERE id = ?`,
      [
        merged.title,
        merged.description,
        merged.sourceType,
        merged.sourceUrl,
        merged.youtubeVideoId || null,
        merged.thumbnailUrl,
        merged.duration,
        merged.channelId,
        merged.channelTitle,
        merged.channelAvatar,
        merged.category,
        merged.ageRating,
        merged.isFeatured ? 1 : 0,
        merged.isApproved ? 1 : 0,
        merged.views,
        JSON.stringify(merged.tags || []),
        merged.createdAt,
        id
      ]
    );
    return merged;
  }

  public async deleteVideo(id: string): Promise<boolean> {
    const [result] = await this.pool.query<mysql.ResultSetHeader>('DELETE FROM videos WHERE id = ?', [id]);
    if (result.affectedRows === 0) return false;

    const [channels] = await this.pool.query<RowDataPacket[]>('SELECT id, videoIds FROM channels');
    for (const ch of channels) {
      const videoIds = parseJson<string[]>(ch.videoIds, []);
      if (videoIds.includes(id)) {
        const filtered = videoIds.filter((vid) => vid !== id);
        await this.pool.query('UPDATE channels SET videoIds = ? WHERE id = ?', [
          JSON.stringify(filtered),
          ch.id
        ]);
      }
    }
    return true;
  }

  public async incrementViews(id: string): Promise<void> {
    await this.pool.query('UPDATE videos SET views = views + 1 WHERE id = ?', [id]);
  }

  // --- Channels ---
  public async getChannelVideos(channelId: string): Promise<Video[]> {
    return this.getVideos({ channelId, onlyApproved: true });
  }

  public async getChannels(): Promise<Channel[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM channels');
    const channels = rows.map(mapChannelRow);
    return Promise.all(
      channels.map(async (c) => ({
        ...c,
        videoCount: (await this.getChannelVideos(c.id)).length
      }))
    );
  }

  public async getChannelById(id: string): Promise<Channel | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM channels WHERE id = ?', [id]);
    if (rows.length === 0) return undefined;
    const ch = mapChannelRow(rows[0]);
    const [vidRows] = await this.pool.query<RowDataPacket[]>(
      'SELECT id, channelId FROM videos WHERE isApproved = 1'
    );
    const chVideoIds = new Set(ch.videoIds || []);
    const count = vidRows.filter((v) => chVideoIds.has(v.id) || v.channelId === ch.id).length;
    return {
      ...ch,
      videoCount: count
    };
  }

  public async addChannel(channel: Channel): Promise<Channel> {
    const normalized: Channel = {
      ...channel,
      channelType: channel.channelType || 'ON_DEMAND',
      scheduleStartTime: channel.scheduleStartTime || new Date().toISOString(),
      videoIds: channel.videoIds || []
    };
    await this.pool.query(
      `INSERT INTO channels (id, name, description, avatarUrl, bannerUrl, category, isVerified, channelType, scheduleStartTime, videoIds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalized.id,
        normalized.name,
        normalized.description,
        normalized.avatarUrl,
        normalized.bannerUrl || null,
        normalized.category,
        normalized.isVerified ? 1 : 0,
        normalized.channelType,
        normalized.scheduleStartTime || null,
        JSON.stringify(normalized.videoIds || [])
      ]
    );
    return normalized;
  }

  public async updateChannel(id: string, updates: Partial<Channel>): Promise<Channel | null> {
    const existing = await this.getChannelById(id);
    if (!existing) return null;

    const merged: Channel = { ...existing, ...updates, id };
    await this.pool.query(
      `UPDATE channels SET name = ?, description = ?, avatarUrl = ?, bannerUrl = ?, category = ?, isVerified = ?, channelType = ?, scheduleStartTime = ?, videoIds = ?
       WHERE id = ?`,
      [
        merged.name,
        merged.description,
        merged.avatarUrl,
        merged.bannerUrl || null,
        merged.category,
        merged.isVerified ? 1 : 0,
        merged.channelType,
        merged.scheduleStartTime || null,
        JSON.stringify(merged.videoIds || []),
        id
      ]
    );
    return (await this.getChannelById(id)) || null;
  }

  public async deleteChannel(id: string): Promise<boolean> {
    const [result] = await this.pool.query<mysql.ResultSetHeader>('DELETE FROM channels WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  public async addVideoToChannel(channelId: string, videoId: string): Promise<Channel | null> {
    const ch = await this.getChannelById(channelId);
    const vid = await this.getVideoById(videoId);
    if (!ch || !vid) return null;

    const videoIds = ch.videoIds || [];
    if (!videoIds.includes(videoId)) {
      videoIds.push(videoId);
      await this.pool.query('UPDATE channels SET videoIds = ? WHERE id = ?', [
        JSON.stringify(videoIds),
        channelId
      ]);
    }
    return (await this.getChannelById(channelId)) || null;
  }

  public async removeVideoFromChannel(channelId: string, videoId: string): Promise<Channel | null> {
    const ch = await this.getChannelById(channelId);
    if (!ch) return null;
    const videoIds = (ch.videoIds || []).filter((id) => id !== videoId);
    await this.pool.query('UPDATE channels SET videoIds = ? WHERE id = ?', [
      JSON.stringify(videoIds),
      channelId
    ]);
    return (await this.getChannelById(channelId)) || null;
  }

  /**
   * Computes the current live broadcast state for a LIVE_TV channel based on wall-clock time.
   * Loops seamlessly through the channel's scheduled videos using each video's duration.
   */
  public async getLiveChannelState(channelId: string): Promise<LiveScheduleState | null> {
    const channel = await this.getChannelById(channelId);
    if (!channel) return null;

    const videos = await this.getChannelVideos(channelId);
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
  public async getPlaylists(): Promise<Playlist[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM playlists');
    return rows.map(mapPlaylistRow);
  }

  public async getPlaylistById(id: string): Promise<Playlist | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM playlists WHERE id = ?', [id]);
    if (rows.length === 0) return undefined;
    return mapPlaylistRow(rows[0]);
  }

  public async addPlaylist(playlist: Playlist): Promise<Playlist> {
    await this.pool.query(
      `INSERT INTO playlists (id, title, description, thumbnailUrl, videoIds, category, ageRating)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        playlist.id,
        playlist.title,
        playlist.description,
        playlist.thumbnailUrl,
        JSON.stringify(playlist.videoIds || []),
        playlist.category,
        playlist.ageRating
      ]
    );
    return playlist;
  }

  // --- Categories ---
  public async getCategories(): Promise<Category[]> {
    const [catRows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM categories');
    const [vidRows] = await this.pool.query<RowDataPacket[]>(
      'SELECT category FROM videos WHERE isApproved = 1'
    );
    return catRows.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      videoCount:
        c.id === 'cat-all'
          ? vidRows.length
          : vidRows.filter((v) => v.category === c.name).length
    }));
  }

  // --- Config ---
  public async getConfig(): Promise<AppConfig> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT config FROM app_config WHERE id = ?',
      ['default']
    );
    if (rows.length === 0) return INITIAL_CONFIG;
    return parseJson<AppConfig>(rows[0].config, INITIAL_CONFIG);
  }

  public async updateConfig(updates: Partial<AppConfig>): Promise<AppConfig> {
    const current = await this.getConfig();
    const merged: AppConfig = { ...current, ...updates };
    await this.pool.query(
      'INSERT INTO app_config (id, config) VALUES (?, ?) ON DUPLICATE KEY UPDATE config = VALUES(config)',
      ['default', JSON.stringify(merged)]
    );
    return merged;
  }

  public async getStats() {
    const [vidRows] = await this.pool.query<RowDataPacket[]>('SELECT isApproved, views FROM videos');
    const [chanRows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS cnt FROM channels');
    const [plRows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS cnt FROM playlists');

    return {
      totalVideos: vidRows.length,
      approvedVideos: vidRows.filter((v) => Boolean(v.isApproved)).length,
      pendingVideos: vidRows.filter((v) => !Boolean(v.isApproved)).length,
      totalChannels: Number(chanRows[0].cnt) || 0,
      totalPlaylists: Number(plRows[0].cnt) || 0,
      totalViews: vidRows.reduce((sum, v) => sum + (Number(v.views) || 0), 0)
    };
  }

  // --- Users & Auth ---
  public async getUserByEmail(email: string): Promise<User | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM users WHERE LOWER(email) = LOWER(?)',
      [email.trim()]
    );
    if (rows.length === 0) return undefined;
    return mapUserRow(rows[0]);
  }

  public async getUserById(id: string): Promise<User | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM users WHERE id = ?', [id]);
    if (rows.length === 0) return undefined;
    return mapUserRow(rows[0]);
  }

  public async getUserByVerificationToken(token: string): Promise<User | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM users WHERE verificationToken = ?',
      [token]
    );
    if (rows.length === 0) return undefined;
    return mapUserRow(rows[0]);
  }

  public async createUser(user: User): Promise<User> {
    await this.pool.query(
      `INSERT INTO users (id, email, name, passwordHash, isVerified, verificationToken, verificationExpiresAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.email.trim().toLowerCase(),
        user.name.trim(),
        user.passwordHash,
        user.isVerified ? 1 : 0,
        user.verificationToken || null,
        user.verificationExpiresAt || null,
        user.createdAt
      ]
    );
    return user;
  }

  public async markUserVerified(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE users SET isVerified = 1, verificationToken = NULL, verificationExpiresAt = NULL WHERE id = ?',
      [id]
    );
  }

  public async updateUserVerificationToken(
    id: string,
    token: string,
    expiresAt: string
  ): Promise<void> {
    await this.pool.query(
      'UPDATE users SET verificationToken = ?, verificationExpiresAt = ? WHERE id = ?',
      [token, expiresAt, id]
    );
  }
}

export const db = new Database();
