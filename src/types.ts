export type SourceType = 'YOUTUBE' | 'DIRECT';

export type AgeRating = 'ALL' | 'TODDLER' | 'YOUNG_KIDS' | 'OLDER_KIDS';

export type ChannelType = 'ON_DEMAND' | 'LIVE_TV';

export type ChannelVisibility = 'PUBLIC' | 'PRIVATE';

export type PermissionPreset = 'VIEWER' | 'COMMENTER' | 'SUGGESTER' | 'CONTRIBUTOR' | 'CUSTOM';

export interface ChannelPermissions {
  canAddVideo: boolean;
  canSuggestVideo: boolean;
  canComment: boolean;
}

export const PERMISSION_PRESETS: Record<Exclude<PermissionPreset, 'CUSTOM'>, ChannelPermissions> = {
  VIEWER: { canAddVideo: false, canSuggestVideo: false, canComment: false },
  COMMENTER: { canAddVideo: false, canSuggestVideo: false, canComment: true },
  SUGGESTER: { canAddVideo: false, canSuggestVideo: true, canComment: true },
  CONTRIBUTOR: { canAddVideo: true, canSuggestVideo: true, canComment: true }
};

export type SuggestionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

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
  ownerId?: string;
  visibility?: ChannelVisibility;
  createdAt?: string;
}

export interface ChannelInvite {
  id: string;
  channelId: string;
  token: string;
  createdBy: string;
  label?: string;
  preset: PermissionPreset;
  permissions: ChannelPermissions;
  maxUses?: number | null;
  useCount: number;
  expiresAt?: string | null;
  isRevoked: boolean;
  createdAt: string;
}

export interface ChannelMember {
  id: string;
  channelId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  inviteId?: string | null;
  preset: PermissionPreset;
  permissions: ChannelPermissions;
  joinedAt: string;
}

export interface ChannelSuggestion {
  id: string;
  channelId: string;
  suggestedBy: string;
  suggesterName?: string;
  title: string;
  description: string;
  sourceType: SourceType;
  sourceUrl: string;
  youtubeVideoId?: string;
  thumbnailUrl: string;
  duration: number;
  category: string;
  ageRating: AgeRating;
  note?: string;
  status: SuggestionStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export interface ChannelVideoComment {
  id: string;
  channelId: string;
  videoId: string;
  authorId: string;
  authorName?: string;
  content: string;
  createdAt: string;
}

export interface ChannelWithAccess extends Channel {
  role: 'OWNER' | 'MEMBER' | 'PUBLIC';
  preset?: PermissionPreset;
  permissions: ChannelPermissions & { isOwner: boolean };
  pendingSuggestionsCount?: number;
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

export type UserRole = 'PARENT' | 'CHILD';

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  parentId?: string;
  ageRating?: AgeRating;
  isVerified: boolean;
  verificationToken?: string;
  verificationExpiresAt?: string;
  createdAt: string;
}
