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

export interface LiveTimelineItem {
  videoId: string;
  playMode: 'WHOLE' | 'CLIP';
  startSeconds?: number;
  endSeconds?: number | null;
}

export type LiveScheduleRuleType = 'DEFAULT' | 'WEEKDAY' | 'DATE';

export interface LiveTimelineSlot {
  videoId: string;
  startOfDaySeconds: number; // 0..86399
  playMode: 'WHOLE' | 'CLIP';
  clipStartSeconds?: number;
  clipEndSeconds?: number | null;
}

export interface LiveDaySchedule {
  id: string;
  ruleType: LiveScheduleRuleType;
  date?: string; // YYYY-MM-DD when ruleType === 'DATE'
  weekday?: number; // 0..6 (Sun..Sat) when ruleType === 'WEEKDAY'
  slots: LiveTimelineSlot[];
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
  scheduleTimezoneOffsetMinutes?: number; // Minutes east of UTC (e.g. +420 for UTC+7)
  videoIds?: string[]; // Ordered list of videos in this channel
  liveTimeline?: LiveTimelineItem[]; // Legacy ordered timeline slots for LIVE_TV channels
  liveSchedules?: LiveDaySchedule[]; // 24H real-time-of-day schedules (DATE / WEEKDAY / DEFAULT)
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
  birthday?: string; // YYYY-MM-DD
  ageRating?: AgeRating;
  isVerified: boolean;
  youtubeSearchEnabled?: boolean;
  searchViewLimit?: number;
  searchViewsUsed?: number;
  searchRequireApproval?: boolean;
  bonusStars?: number;
  parentPin?: string;
  dailyLimitMinutes?: number;
  attentionTrackingEnabled?: boolean;
  attentionPauseSeconds?: number;
  attentionMinWatchPercent?: number;
  verificationToken?: string;
  verificationExpiresAt?: string;
  createdAt: string;
}

export type QuizType = 'MATH' | 'SCIENCE' | 'ENGLISH' | 'LOGIC' | 'MIXED';

export type LockoutAction = 'LOCKOUT' | 'ALLOW_AFTER_WAIT';

export interface ChannelQuizRule {
  id: string;
  parentId: string;
  channelId: string;
  quizEnabled: boolean;
  quizType: QuizType;
  retryWaitSeconds: number;
  maxAttempts: number;
  lockoutAction: LockoutAction;
  lockoutDurationSeconds: number;
  updatedAt: string;
}

export interface QuizQuestion {
  id: string;
  type: Exclude<QuizType, 'MIXED'>;
  prompt: string;
  options: string[];
  correctIndex: number;
}

export interface KidChannelQuizState {
  id: string;
  kidId: string;
  channelId: string;
  wrongAttempts: number;
  nextQuizAt?: string | null;
  lockedUntil?: string | null;
  postLockoutGrant: boolean;
  unlockedUntil?: string | null;
  activeQuestion?: QuizQuestion | null;
  updatedAt: string;
}

export type KidVideoRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface KidVideoRequest {
  id: string;
  kidId: string;
  kidName?: string;
  parentId: string;
  youtubeVideoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  status: KidVideoRequestStatus;
  createdAt: string;
  decidedAt?: string | null;
}

export interface KidHistoryItem {
  id: string;
  kidId: string;
  itemKey: string;
  youtubeVideoId?: string;
  videoId?: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  sourceType: SourceType;
  sourceUrl: string;
  isApprovedSearch: boolean;
  watchedAt: string;
}

export interface KidPlaylistItem {
  key: string;
  youtubeVideoId?: string;
  videoId?: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  sourceType: SourceType;
  sourceUrl: string;
  addedAt: string;
}

export interface KidPlaylist {
  id: string;
  kidId: string;
  title: string;
  items: KidPlaylistItem[];
  createdAt: string;
  updatedAt: string;
}

export type ParentSafetyRating = 'RECOMMENDED' | 'CAUTION';

export interface VideoParentReview {
  id: string;
  videoKey: string;
  videoId?: string;
  youtubeVideoId?: string;
  videoTitle: string;
  channelTitle: string;
  thumbnailUrl: string;
  sourceType: SourceType;
  sourceUrl: string;
  parentId: string;
  parentName: string;
  rating: ParentSafetyRating;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdvisoryVideoEntry {
  videoKey: string;
  videoId?: string;
  youtubeVideoId?: string;
  videoTitle: string;
  channelTitle: string;
  thumbnailUrl: string;
  sourceType: SourceType;
  sourceUrl: string;
  recommendedCount: number;
  cautionCount: number;
  reviews: VideoParentReview[];
  updatedAt: string;
}
