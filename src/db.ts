import mysql, { Pool, RowDataPacket } from 'mysql2/promise';
import {
  Video,
  AgeRating,
  Channel,
  ChannelVisibility,
  PermissionPreset,
  ChannelPermissions,
  PERMISSION_PRESETS,
  ChannelInvite,
  ChannelMember,
  ChannelSuggestion,
  SuggestionStatus,
  ChannelVideoComment,
  ChannelWithAccess,
  Playlist,
  Category,
  AppConfig,
  LiveScheduleState,
  UpNextItem,
  User,
  UserRole
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
    videoIds: parseJson<string[]>(row.videoIds, []),
    ownerId: row.ownerId || undefined,
    visibility: (row.visibility as ChannelVisibility) || 'PUBLIC',
    createdAt: row.createdAt || undefined
  };
}

function normalizePermissions(raw: unknown, preset?: PermissionPreset): ChannelPermissions {
  const base =
    preset && preset !== 'CUSTOM' ? PERMISSION_PRESETS[preset] : PERMISSION_PRESETS.VIEWER;
  const parsed = parseJson<Partial<ChannelPermissions>>(raw, {});
  return {
    canAddVideo: typeof parsed.canAddVideo === 'boolean' ? parsed.canAddVideo : base.canAddVideo,
    canSuggestVideo:
      typeof parsed.canSuggestVideo === 'boolean' ? parsed.canSuggestVideo : base.canSuggestVideo,
    canComment: typeof parsed.canComment === 'boolean' ? parsed.canComment : base.canComment
  };
}

function mapInviteRow(row: RowDataPacket): ChannelInvite {
  const preset = (row.preset as PermissionPreset) || 'SUGGESTER';
  return {
    id: row.id,
    channelId: row.channelId,
    token: row.token,
    createdBy: row.createdBy,
    label: row.label || undefined,
    preset,
    permissions: normalizePermissions(row.permissions, preset),
    maxUses: row.maxUses !== null && row.maxUses !== undefined ? Number(row.maxUses) : null,
    useCount: Number(row.useCount) || 0,
    expiresAt: row.expiresAt || null,
    isRevoked: Boolean(row.isRevoked),
    createdAt: row.createdAt
  };
}

function mapMemberRow(row: RowDataPacket): ChannelMember {
  const preset = (row.preset as PermissionPreset) || 'VIEWER';
  return {
    id: row.id,
    channelId: row.channelId,
    userId: row.userId,
    userName: row.userName || undefined,
    userEmail: row.userEmail || undefined,
    inviteId: row.inviteId || null,
    preset,
    permissions: normalizePermissions(row.permissions, preset),
    joinedAt: row.joinedAt
  };
}

function mapSuggestionRow(row: RowDataPacket): ChannelSuggestion {
  return {
    id: row.id,
    channelId: row.channelId,
    suggestedBy: row.suggestedBy,
    suggesterName: row.suggesterName || undefined,
    title: row.title,
    description: row.description || '',
    sourceType: row.sourceType,
    sourceUrl: row.sourceUrl,
    youtubeVideoId: row.youtubeVideoId || undefined,
    thumbnailUrl: row.thumbnailUrl,
    duration: Number(row.duration) || 180,
    category: row.category,
    ageRating: row.ageRating || 'ALL',
    note: row.note || undefined,
    status: (row.status as SuggestionStatus) || 'PENDING',
    reviewedBy: row.reviewedBy || null,
    reviewedAt: row.reviewedAt || null,
    createdAt: row.createdAt
  };
}

function mapCommentRow(row: RowDataPacket): ChannelVideoComment {
  return {
    id: row.id,
    channelId: row.channelId,
    videoId: row.videoId,
    authorId: row.authorId,
    authorName: row.authorName || undefined,
    content: row.content,
    createdAt: row.createdAt
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
    role: (row.role as UserRole) || 'PARENT',
    parentId: row.parentId || undefined,
    ageRating: (row.ageRating as AgeRating) || undefined,
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
        videoIds JSON NOT NULL,
        ownerId VARCHAR(64) NULL,
        visibility VARCHAR(16) NOT NULL DEFAULT 'PUBLIC',
        createdAt VARCHAR(64) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.ensureColumnExists('channels', 'ownerId', 'VARCHAR(64) NULL');
    await this.ensureColumnExists('channels', 'visibility', "VARCHAR(16) NOT NULL DEFAULT 'PUBLIC'");
    await this.ensureColumnExists('channels', 'createdAt', 'VARCHAR(64) NULL');

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
        role VARCHAR(16) NOT NULL DEFAULT 'PARENT',
        parentId VARCHAR(64) NULL,
        ageRating VARCHAR(32) NULL,
        isVerified TINYINT(1) NOT NULL DEFAULT 0,
        verificationToken VARCHAR(128),
        verificationExpiresAt VARCHAR(64),
        createdAt VARCHAR(64) NOT NULL,
        INDEX idx_users_parent (parentId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.ensureColumnExists('users', 'role', "VARCHAR(16) NOT NULL DEFAULT 'PARENT'");
    await this.ensureColumnExists('users', 'parentId', 'VARCHAR(64) NULL');
    await this.ensureColumnExists('users', 'ageRating', 'VARCHAR(32) NULL');

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS channel_invites (
        id VARCHAR(64) PRIMARY KEY,
        channelId VARCHAR(64) NOT NULL,
        token VARCHAR(128) NOT NULL UNIQUE,
        createdBy VARCHAR(64) NOT NULL,
        label VARCHAR(128),
        preset VARCHAR(32) NOT NULL DEFAULT 'SUGGESTER',
        permissions JSON NOT NULL,
        maxUses INT NULL,
        useCount INT NOT NULL DEFAULT 0,
        expiresAt VARCHAR(64) NULL,
        isRevoked TINYINT(1) NOT NULL DEFAULT 0,
        createdAt VARCHAR(64) NOT NULL,
        INDEX idx_invites_channel (channelId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS channel_members (
        id VARCHAR(64) PRIMARY KEY,
        channelId VARCHAR(64) NOT NULL,
        userId VARCHAR(64) NOT NULL,
        inviteId VARCHAR(64) NULL,
        preset VARCHAR(32) NOT NULL DEFAULT 'VIEWER',
        permissions JSON NOT NULL,
        joinedAt VARCHAR(64) NOT NULL,
        UNIQUE KEY uniq_channel_user (channelId, userId),
        INDEX idx_members_user (userId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS channel_suggestions (
        id VARCHAR(64) PRIMARY KEY,
        channelId VARCHAR(64) NOT NULL,
        suggestedBy VARCHAR(64) NOT NULL,
        title VARCHAR(512) NOT NULL,
        description TEXT NOT NULL,
        sourceType VARCHAR(32) NOT NULL,
        sourceUrl TEXT NOT NULL,
        youtubeVideoId VARCHAR(64),
        thumbnailUrl TEXT NOT NULL,
        duration INT NOT NULL DEFAULT 180,
        category VARCHAR(255) NOT NULL,
        ageRating VARCHAR(32) NOT NULL DEFAULT 'ALL',
        note TEXT,
        status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        reviewedBy VARCHAR(64) NULL,
        reviewedAt VARCHAR(64) NULL,
        createdAt VARCHAR(64) NOT NULL,
        INDEX idx_suggestions_channel_status (channelId, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS channel_video_comments (
        id VARCHAR(64) PRIMARY KEY,
        channelId VARCHAR(64) NOT NULL,
        videoId VARCHAR(64) NOT NULL,
        authorId VARCHAR(64) NOT NULL,
        content TEXT NOT NULL,
        createdAt VARCHAR(64) NOT NULL,
        INDEX idx_comments_channel_video (channelId, videoId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  private async ensureColumnExists(table: string, column: string, definition: string): Promise<void> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (Number(rows[0]?.cnt || 0) === 0) {
      await this.pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    }
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

  public async getChannels(options?: { onlyPublic?: boolean }): Promise<Channel[]> {
    const query = options?.onlyPublic
      ? "SELECT * FROM channels WHERE visibility = 'PUBLIC' OR visibility IS NULL"
      : 'SELECT * FROM channels';
    const [rows] = await this.pool.query<RowDataPacket[]>(query);
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
      videoIds: channel.videoIds || [],
      visibility: channel.visibility || 'PUBLIC',
      createdAt: channel.createdAt || new Date().toISOString()
    };
    await this.pool.query(
      `INSERT INTO channels (id, name, description, avatarUrl, bannerUrl, category, isVerified, channelType, scheduleStartTime, videoIds, ownerId, visibility, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        JSON.stringify(normalized.videoIds || []),
        normalized.ownerId || null,
        normalized.visibility || 'PUBLIC',
        normalized.createdAt || null
      ]
    );
    return normalized;
  }

  public async updateChannel(id: string, updates: Partial<Channel>): Promise<Channel | null> {
    const existing = await this.getChannelById(id);
    if (!existing) return null;

    const merged: Channel = { ...existing, ...updates, id };
    await this.pool.query(
      `UPDATE channels SET name = ?, description = ?, avatarUrl = ?, bannerUrl = ?, category = ?, isVerified = ?, channelType = ?, scheduleStartTime = ?, videoIds = ?, visibility = ?
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
        merged.visibility || 'PUBLIC',
        id
      ]
    );
    return (await this.getChannelById(id)) || null;
  }

  public async deleteChannel(id: string): Promise<boolean> {
    await this.pool.query('DELETE FROM channel_invites WHERE channelId = ?', [id]);
    await this.pool.query('DELETE FROM channel_members WHERE channelId = ?', [id]);
    await this.pool.query('DELETE FROM channel_suggestions WHERE channelId = ?', [id]);
    await this.pool.query('DELETE FROM channel_video_comments WHERE channelId = ?', [id]);
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
      `INSERT INTO users (id, email, name, passwordHash, role, parentId, ageRating, isVerified, verificationToken, verificationExpiresAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.email.trim().toLowerCase(),
        user.name.trim(),
        user.passwordHash,
        user.role || 'PARENT',
        user.parentId || null,
        user.ageRating || null,
        user.isVerified ? 1 : 0,
        user.verificationToken || null,
        user.verificationExpiresAt || null,
        user.createdAt
      ]
    );
    return user;
  }

  public async getChildrenByParentId(parentId: string): Promise<User[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM users WHERE parentId = ? AND role = 'CHILD' ORDER BY createdAt DESC",
      [parentId]
    );
    return rows.map(mapUserRow);
  }

  public async updateChildAccount(
    parentId: string,
    childId: string,
    updates: { name?: string; ageRating?: AgeRating; passwordHash?: string }
  ): Promise<User | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM users WHERE id = ? AND parentId = ? AND role = 'CHILD'",
      [childId, parentId]
    );
    if (rows.length === 0) return null;
    const existing = mapUserRow(rows[0]);
    const name = updates.name ? updates.name.trim() : existing.name;
    const ageRating = updates.ageRating !== undefined ? updates.ageRating : existing.ageRating;
    const passwordHash = updates.passwordHash || existing.passwordHash;

    await this.pool.query(
      'UPDATE users SET name = ?, ageRating = ?, passwordHash = ? WHERE id = ? AND parentId = ?',
      [name, ageRating || null, passwordHash, childId, parentId]
    );
    return (await this.getUserById(childId)) || null;
  }

  public async deleteChildAccount(parentId: string, childId: string): Promise<boolean> {
    const [result] = await this.pool.query<mysql.ResultSetHeader>(
      "DELETE FROM users WHERE id = ? AND parentId = ? AND role = 'CHILD'",
      [childId, parentId]
    );
    return result.affectedRows > 0;
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

  // --- Channel Access & Collaboration ---
  public async getChannelAccess(
    channelId: string,
    userId?: string
  ): Promise<{
    channel: Channel;
    isOwner: boolean;
    member?: ChannelMember;
    canView: boolean;
    permissions: ChannelPermissions & { isOwner: boolean };
  } | null> {
    const channel = await this.getChannelById(channelId);
    if (!channel) return null;

    const isOwner = Boolean(userId && channel.ownerId && channel.ownerId === userId);
    if (isOwner) {
      return {
        channel,
        isOwner: true,
        canView: true,
        permissions: { isOwner: true, canAddVideo: true, canSuggestVideo: true, canComment: true }
      };
    }

    const member = userId ? await this.getChannelMember(channelId, userId) : undefined;
    if (member) {
      return {
        channel,
        isOwner: false,
        member,
        canView: true,
        permissions: { isOwner: false, ...member.permissions }
      };
    }

    const isPublic = (channel.visibility || 'PUBLIC') === 'PUBLIC';
    return {
      channel,
      isOwner: false,
      canView: isPublic,
      permissions: { isOwner: false, canAddVideo: false, canSuggestVideo: false, canComment: false }
    };
  }

  public async getChannelsForUser(userId: string): Promise<ChannelWithAccess[]> {
    const allChannels = await this.getChannels({ onlyPublic: false });
    const [memberRows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM channel_members WHERE userId = ?',
      [userId]
    );
    const memberMap = new Map<string, ChannelMember>();
    for (const row of memberRows) {
      const m = mapMemberRow(row);
      memberMap.set(m.channelId, m);
    }

    const [pendingRows] = await this.pool.query<RowDataPacket[]>(
      "SELECT channelId, COUNT(*) AS cnt FROM channel_suggestions WHERE status = 'PENDING' GROUP BY channelId"
    );
    const pendingMap = new Map<string, number>();
    for (const r of pendingRows) {
      pendingMap.set(r.channelId, Number(r.cnt) || 0);
    }

    const result: ChannelWithAccess[] = [];
    for (const ch of allChannels) {
      const isOwner = Boolean(ch.ownerId && ch.ownerId === userId);
      const member = memberMap.get(ch.id);
      const isPublic = (ch.visibility || 'PUBLIC') === 'PUBLIC';

      if (isOwner) {
        result.push({
          ...ch,
          role: 'OWNER',
          permissions: { isOwner: true, canAddVideo: true, canSuggestVideo: true, canComment: true },
          pendingSuggestionsCount: pendingMap.get(ch.id) || 0
        });
      } else if (member) {
        result.push({
          ...ch,
          role: 'MEMBER',
          preset: member.preset,
          permissions: { isOwner: false, ...member.permissions }
        });
      } else if (isPublic) {
        result.push({
          ...ch,
          role: 'PUBLIC',
          permissions: { isOwner: false, canAddVideo: false, canSuggestVideo: false, canComment: false }
        });
      }
    }
    return result;
  }

  // --- Channel Invites ---
  public async createChannelInvite(invite: ChannelInvite): Promise<ChannelInvite> {
    await this.pool.query(
      `INSERT INTO channel_invites (id, channelId, token, createdBy, label, preset, permissions, maxUses, useCount, expiresAt, isRevoked, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invite.id,
        invite.channelId,
        invite.token,
        invite.createdBy,
        invite.label || null,
        invite.preset,
        JSON.stringify(invite.permissions),
        invite.maxUses ?? null,
        invite.useCount || 0,
        invite.expiresAt || null,
        invite.isRevoked ? 1 : 0,
        invite.createdAt
      ]
    );
    return invite;
  }

  public async getChannelInvites(channelId: string): Promise<ChannelInvite[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM channel_invites WHERE channelId = ? ORDER BY createdAt DESC',
      [channelId]
    );
    return rows.map(mapInviteRow);
  }

  public async getInviteByToken(token: string): Promise<ChannelInvite | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM channel_invites WHERE token = ?',
      [token]
    );
    if (rows.length === 0) return undefined;
    return mapInviteRow(rows[0]);
  }

  public async revokeChannelInvite(channelId: string, inviteId: string): Promise<boolean> {
    const [result] = await this.pool.query<mysql.ResultSetHeader>(
      'UPDATE channel_invites SET isRevoked = 1 WHERE id = ? AND channelId = ?',
      [inviteId, channelId]
    );
    return result.affectedRows > 0;
  }

  public async incrementInviteUseCount(inviteId: string): Promise<void> {
    await this.pool.query('UPDATE channel_invites SET useCount = useCount + 1 WHERE id = ?', [
      inviteId
    ]);
  }

  // --- Channel Members ---
  public async getChannelMembers(channelId: string): Promise<ChannelMember[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT m.*, u.name AS userName, u.email AS userEmail
       FROM channel_members m
       LEFT JOIN users u ON u.id = m.userId
       WHERE m.channelId = ?
       ORDER BY m.joinedAt DESC`,
      [channelId]
    );
    return rows.map(mapMemberRow);
  }

  public async getChannelMember(
    channelId: string,
    userId: string
  ): Promise<ChannelMember | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT m.*, u.name AS userName, u.email AS userEmail
       FROM channel_members m
       LEFT JOIN users u ON u.id = m.userId
       WHERE m.channelId = ? AND m.userId = ?`,
      [channelId, userId]
    );
    if (rows.length === 0) return undefined;
    return mapMemberRow(rows[0]);
  }

  public async upsertChannelMember(member: ChannelMember): Promise<ChannelMember> {
    const existing = await this.getChannelMember(member.channelId, member.userId);
    if (existing) {
      await this.pool.query(
        'UPDATE channel_members SET inviteId = ?, preset = ?, permissions = ? WHERE id = ?',
        [
          member.inviteId ?? existing.inviteId ?? null,
          member.preset,
          JSON.stringify(member.permissions),
          existing.id
        ]
      );
      return (await this.getChannelMember(member.channelId, member.userId))!;
    }
    await this.pool.query(
      `INSERT INTO channel_members (id, channelId, userId, inviteId, preset, permissions, joinedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        member.id,
        member.channelId,
        member.userId,
        member.inviteId || null,
        member.preset,
        JSON.stringify(member.permissions),
        member.joinedAt
      ]
    );
    return (await this.getChannelMember(member.channelId, member.userId))!;
  }

  public async updateChannelMemberPermissions(
    channelId: string,
    userId: string,
    preset: PermissionPreset,
    permissions: ChannelPermissions
  ): Promise<ChannelMember | null> {
    const existing = await this.getChannelMember(channelId, userId);
    if (!existing) return null;
    await this.pool.query(
      'UPDATE channel_members SET preset = ?, permissions = ? WHERE channelId = ? AND userId = ?',
      [preset, JSON.stringify(permissions), channelId, userId]
    );
    return (await this.getChannelMember(channelId, userId)) || null;
  }

  public async removeChannelMember(channelId: string, userId: string): Promise<boolean> {
    const [result] = await this.pool.query<mysql.ResultSetHeader>(
      'DELETE FROM channel_members WHERE channelId = ? AND userId = ?',
      [channelId, userId]
    );
    return result.affectedRows > 0;
  }

  // --- Video Suggestions ---
  public async createSuggestion(suggestion: ChannelSuggestion): Promise<ChannelSuggestion> {
    await this.pool.query(
      `INSERT INTO channel_suggestions
       (id, channelId, suggestedBy, title, description, sourceType, sourceUrl, youtubeVideoId, thumbnailUrl, duration, category, ageRating, note, status, reviewedBy, reviewedAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        suggestion.id,
        suggestion.channelId,
        suggestion.suggestedBy,
        suggestion.title,
        suggestion.description || '',
        suggestion.sourceType,
        suggestion.sourceUrl,
        suggestion.youtubeVideoId || null,
        suggestion.thumbnailUrl,
        suggestion.duration || 180,
        suggestion.category,
        suggestion.ageRating || 'ALL',
        suggestion.note || null,
        suggestion.status || 'PENDING',
        suggestion.reviewedBy || null,
        suggestion.reviewedAt || null,
        suggestion.createdAt
      ]
    );
    return (await this.getSuggestionById(suggestion.id))!;
  }

  public async getChannelSuggestions(
    channelId: string,
    options?: { suggestedBy?: string; status?: SuggestionStatus }
  ): Promise<ChannelSuggestion[]> {
    let sql = `SELECT s.*, u.name AS suggesterName
               FROM channel_suggestions s
               LEFT JOIN users u ON u.id = s.suggestedBy
               WHERE s.channelId = ?`;
    const params: unknown[] = [channelId];
    if (options?.suggestedBy) {
      sql += ' AND s.suggestedBy = ?';
      params.push(options.suggestedBy);
    }
    if (options?.status) {
      sql += ' AND s.status = ?';
      params.push(options.status);
    }
    sql += ' ORDER BY s.createdAt DESC';
    const [rows] = await this.pool.query<RowDataPacket[]>(sql, params);
    return rows.map(mapSuggestionRow);
  }

  public async getSuggestionById(id: string): Promise<ChannelSuggestion | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT s.*, u.name AS suggesterName
       FROM channel_suggestions s
       LEFT JOIN users u ON u.id = s.suggestedBy
       WHERE s.id = ?`,
      [id]
    );
    if (rows.length === 0) return undefined;
    return mapSuggestionRow(rows[0]);
  }

  public async updateSuggestionStatus(
    id: string,
    status: SuggestionStatus,
    reviewedBy: string
  ): Promise<ChannelSuggestion | null> {
    const reviewedAt = new Date().toISOString();
    const [result] = await this.pool.query<mysql.ResultSetHeader>(
      'UPDATE channel_suggestions SET status = ?, reviewedBy = ?, reviewedAt = ? WHERE id = ?',
      [status, reviewedBy, reviewedAt, id]
    );
    if (result.affectedRows === 0) return null;
    return (await this.getSuggestionById(id)) || null;
  }

  // --- Channel Video Comments ---
  public async getChannelVideoComments(
    channelId: string,
    videoId: string
  ): Promise<ChannelVideoComment[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT c.*, u.name AS authorName
       FROM channel_video_comments c
       LEFT JOIN users u ON u.id = c.authorId
       WHERE c.channelId = ? AND c.videoId = ?
       ORDER BY c.createdAt ASC`,
      [channelId, videoId]
    );
    return rows.map(mapCommentRow);
  }

  public async getChannelVideoCommentById(id: string): Promise<ChannelVideoComment | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT c.*, u.name AS authorName
       FROM channel_video_comments c
       LEFT JOIN users u ON u.id = c.authorId
       WHERE c.id = ?`,
      [id]
    );
    if (rows.length === 0) return undefined;
    return mapCommentRow(rows[0]);
  }

  public async addChannelVideoComment(comment: ChannelVideoComment): Promise<ChannelVideoComment> {
    await this.pool.query(
      `INSERT INTO channel_video_comments (id, channelId, videoId, authorId, content, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        comment.id,
        comment.channelId,
        comment.videoId,
        comment.authorId,
        comment.content,
        comment.createdAt
      ]
    );
    return (await this.getChannelVideoCommentById(comment.id))!;
  }

  public async deleteChannelVideoComment(id: string): Promise<boolean> {
    const [result] = await this.pool.query<mysql.ResultSetHeader>(
      'DELETE FROM channel_video_comments WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }
}

export const db = new Database();
