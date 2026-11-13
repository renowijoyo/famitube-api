export type SourceType = 'YOUTUBE' | 'DIRECT';

export type AgeRating = 'ALL' | 'TODDLER' | 'YOUNG_KIDS' | 'OLDER_KIDS';

export type ChannelType = 'ON_DEMAND' | 'LIVE_TV';

export interface Video {
  id: string;
  title: string;
  description: string;
  sourceType: SourceType;
  sourceUrl: string;
  youtubeVideoId?: string;
  thumbnailUrl: string;
  duration: number; // in seconds
  channelId: string;
  channelTitle: string;
  channelAvatar: string;
  category: string;
  ageRating: AgeRating;
  isFeatured: boolean;
  isApproved: boolean;
  views: number;
  tags: string[];
  createdAt: string;
}

export interface Channel {
  id: string;
  name: string;
  description: string;
  avatarUrl: string;
  bannerUrl?: string;
  category: string;
  isVerified: boolean;
  channelType: ChannelType;
  scheduleStartTime?: string; // ISO timestamp anchor for LIVE_TV schedule
  videoIds?: string[]; // Ordered list of videos in this channel
  videoCount?: number;
}

export interface UpNextItem {
  video: Video;
  startsInSeconds: number;
}

export interface LiveScheduleState {
  channel: Channel;
  serverTime: string;
  currentVideo: Video | null;
  offsetSeconds: number;
  remainingSeconds: number;
  upNext: UpNextItem[];
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoIds: string[];
  category: string;
  ageRating: AgeRating;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  videoCount?: number;
}

export interface AppConfig {
  appName: string;
  version: string;
  welcomeMessage: string;
  parentalDefaults: {
    defaultWatchLimitMinutes: number;
    enforcePin: boolean;
  };
}

export interface DatabaseSchema {
  videos: Video[];
  channels: Channel[];
  playlists: Playlist[];
  categories: Category[];
  config: AppConfig;
}
