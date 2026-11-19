import crypto from 'crypto';
import mysql, { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  channelMatchesAgeRating,
  normalizeVideoTags,
  videoMatchesAgeTag,
  videoMatchesCategoryTag
} from './utils.js';
import { matchesTagFilter, parseTagList, resolveEffectiveVideoTags } from './tags.js';
import { getEntitlementsForPlan, resolveUserPlan } from './entitlements.js';
import {
  Video,
  AgeRating,
  Channel,
  LiveTimelineItem,
  LiveDaySchedule,
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
  UserRole,
  PlanTier,
  PlanEntitlements,
  ParentalControls,
  ParentalControlsOverride,
  BrowserControls,
  KidVideoRequest,
  KidVideoRequestStatus,
  KidHistoryItem,
  KidBrowserHistoryItem,
  KidSiteRequest,
  KidSiteRequestStatus,
  AppNotification,
  AppNotificationType,
  KidPlaylist,
  KidPlaylistItem,
  ParentSafetyRating,
  VideoParentReview,
  AdvisoryVideoEntry,
  FamilyPassVoucher
} from './types.js';

import { INITIAL_CATEGORIES, INITIAL_CHANNELS, INITIAL_VIDEOS } from './catalog-seed.js';

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
  appName: 'FamiTube Safe Video Player',
  version: '1.0.0',
  welcomeMessage: 'Welcome to FamiTube! Enjoy safe, curated videos chosen with care.',
  parentalDefaults: {
    defaultWatchLimitMinutes: 45,
    enforcePin: true
  }
};

const ADMIN_CURATOR_ID = 'usr-team-famitube';
const ADMIN_CURATOR_NAME = 'Team FamiTube';

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
  const rawTags = parseJson<string[]>(row.tags, []);
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
    tags: normalizeVideoTags(rawTags, row.ageRating, row.category),
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
    ageRating: (row.ageRating as AgeRating) || 'ALL',
    isVerified: Boolean(row.isVerified),
    channelType: row.channelType || 'ON_DEMAND',
    scheduleStartTime: row.scheduleStartTime || undefined,
    scheduleTimezoneOffsetMinutes:
      row.scheduleTimezoneOffsetMinutes != null ? Number(row.scheduleTimezoneOffsetMinutes) : undefined,
    videoIds: parseJson<string[]>(row.videoIds, []),
    liveTimeline: parseJson<LiveTimelineItem[] | undefined>(row.liveTimeline, undefined),
    liveSchedules: parseJson<LiveDaySchedule[] | undefined>(row.liveSchedules, undefined),
    ownerId: row.ownerId || undefined,
    ownerName: row.ownerName || (!row.ownerId || row.ownerId === ADMIN_CURATOR_ID ? ADMIN_CURATOR_NAME : undefined),
    visibility: (row.visibility as ChannelVisibility) || 'PUBLIC',
    defaultTags: parseJson<string[]>(row.defaultTags, []),
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
    plan: (row.plan as PlanTier) || 'FREE',
    planExpiresAt: row.planExpiresAt || null,
    referralCode: row.referralCode || undefined,
    referredByUserId: row.referredByUserId || undefined,
    referredByCode: row.referredByCode || undefined,
    birthday: row.birthday || undefined,
    ageRating: (row.ageRating as AgeRating) || undefined,
    isVerified: Boolean(row.isVerified),
    youtubeSearchEnabled: Boolean(row.youtubeSearchEnabled),
    searchViewLimit: row.searchViewLimit !== undefined && row.searchViewLimit !== null ? Number(row.searchViewLimit) : 0,
    searchViewsUsed: row.searchViewsUsed !== undefined && row.searchViewsUsed !== null ? Number(row.searchViewsUsed) : 0,
    searchRequireApproval:
      row.searchRequireApproval !== undefined && row.searchRequireApproval !== null
        ? Boolean(row.searchRequireApproval)
        : true,
    bonusStars: row.bonusStars !== undefined && row.bonusStars !== null ? Number(row.bonusStars) : 0,
    parentPin: row.parentPin || '1234',
    dailyLimitMinutes:
      row.dailyLimitMinutes !== undefined && row.dailyLimitMinutes !== null
        ? Number(row.dailyLimitMinutes)
        : 45,
    attentionTrackingEnabled:
      row.attentionTrackingEnabled !== undefined && row.attentionTrackingEnabled !== null
        ? Boolean(row.attentionTrackingEnabled)
        : true,
    attentionPauseSeconds:
      row.attentionPauseSeconds !== undefined && row.attentionPauseSeconds !== null
        ? Number(row.attentionPauseSeconds)
        : 30,
    attentionMinWatchPercent:
      row.attentionMinWatchPercent !== undefined && row.attentionMinWatchPercent !== null
        ? Number(row.attentionMinWatchPercent)
        : 70,
    parentalOverride: row.parentalOverrideJson
      ? parseJson<ParentalControlsOverride | null>(row.parentalOverrideJson, null)
      : null,
    browserControls: row.browserControlsJson
      ? parseJson<Partial<BrowserControls> | null>(row.browserControlsJson, null)
      : null,
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
    await this.ensureColumnExists('channels', 'liveTimeline', 'JSON NULL');
    await this.ensureColumnExists('channels', 'liveSchedules', 'JSON NULL');
    await this.ensureColumnExists('channels', 'scheduleTimezoneOffsetMinutes', 'INT NULL');
    await this.ensureColumnExists('channels', 'defaultTags', 'JSON NULL');
    await this.ensureColumnExists('channels', 'ageRating', "VARCHAR(32) NOT NULL DEFAULT 'ALL'");

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
    await this.ensureColumnExists('users', 'birthday', 'VARCHAR(32) NULL');
    await this.ensureColumnExists('users', 'ageRating', 'VARCHAR(32) NULL');
    await this.ensureColumnExists('users', 'youtubeSearchEnabled', 'TINYINT(1) NOT NULL DEFAULT 1');
    await this.ensureColumnExists('users', 'searchViewLimit', 'INT NOT NULL DEFAULT 0');
    await this.ensureColumnExists('users', 'searchViewsUsed', 'INT NOT NULL DEFAULT 0');
    await this.ensureColumnExists('users', 'searchRequireApproval', 'TINYINT(1) NOT NULL DEFAULT 1');
    await this.ensureColumnExists('users', 'bonusStars', 'INT NOT NULL DEFAULT 0');
    await this.ensureColumnExists('users', 'parentPin', "VARCHAR(8) NOT NULL DEFAULT '1234'");
    await this.ensureColumnExists('users', 'dailyLimitMinutes', 'INT NOT NULL DEFAULT 45');
    await this.ensureColumnExists('users', 'attentionTrackingEnabled', 'TINYINT(1) NOT NULL DEFAULT 1');
    await this.ensureColumnExists('users', 'attentionPauseSeconds', 'INT NOT NULL DEFAULT 30');
    await this.ensureColumnExists('users', 'attentionMinWatchPercent', 'INT NOT NULL DEFAULT 70');
    await this.ensureColumnExists('users', 'parentalOverrideJson', 'TEXT NULL');
    await this.ensureColumnExists('users', 'browserControlsJson', 'TEXT NULL');
    await this.ensureColumnExists('users', 'plan', "VARCHAR(16) NOT NULL DEFAULT 'FREE'");
    await this.ensureColumnExists('users', 'planExpiresAt', 'VARCHAR(64) NULL');
    await this.ensureColumnExists('users', 'referralCode', 'VARCHAR(32) NULL');
    await this.ensureColumnExists('users', 'referredByUserId', 'VARCHAR(64) NULL');
    await this.ensureColumnExists('users', 'referredByCode', 'VARCHAR(32) NULL');

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

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS kid_video_requests (
        id VARCHAR(64) PRIMARY KEY,
        kidId VARCHAR(64) NOT NULL,
        parentId VARCHAR(64) NOT NULL,
        youtubeVideoId VARCHAR(32) NOT NULL,
        title VARCHAR(255) NOT NULL,
        channelTitle VARCHAR(255) NOT NULL,
        thumbnailUrl TEXT NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        createdAt VARCHAR(64) NOT NULL,
        decidedAt VARCHAR(64) NULL,
        UNIQUE KEY uniq_kid_yt_req (kidId, youtubeVideoId),
        INDEX idx_req_parent (parentId, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS kid_watch_history (
        id VARCHAR(64) PRIMARY KEY,
        kidId VARCHAR(64) NOT NULL,
        itemKey VARCHAR(128) NOT NULL,
        youtubeVideoId VARCHAR(32) NULL,
        videoId VARCHAR(64) NULL,
        title VARCHAR(255) NOT NULL,
        channelTitle VARCHAR(255) NOT NULL,
        thumbnailUrl TEXT NOT NULL,
        sourceType VARCHAR(16) NOT NULL DEFAULT 'YOUTUBE',
        sourceUrl TEXT NOT NULL,
        isApprovedSearch TINYINT(1) NOT NULL DEFAULT 0,
        watchedAt VARCHAR(64) NOT NULL,
        UNIQUE KEY uniq_kid_hist_item (kidId, itemKey),
        INDEX idx_hist_kid (kidId, watchedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS kid_saved_channels (
        id VARCHAR(128) PRIMARY KEY,
        kidId VARCHAR(64) NOT NULL,
        channelId VARCHAR(64) NOT NULL,
        addedAt VARCHAR(64) NOT NULL,
        UNIQUE KEY uq_kid_saved_channel (kidId, channelId),
        INDEX idx_kid_saved_channels_kid (kidId, addedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS kid_playlists (
        id VARCHAR(64) PRIMARY KEY,
        kidId VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        items JSON NOT NULL,
        createdAt VARCHAR(64) NOT NULL,
        updatedAt VARCHAR(64) NOT NULL,
        INDEX idx_kid_pl (kidId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS kid_browser_history (
        id VARCHAR(64) PRIMARY KEY,
        kidId VARCHAR(64) NOT NULL,
        url TEXT NOT NULL,
        domain VARCHAR(255) NOT NULL,
        title VARCHAR(512) NOT NULL,
        blocked TINYINT(1) NOT NULL DEFAULT 0,
        visitedAt VARCHAR(64) NOT NULL,
        INDEX idx_browser_hist_kid_time (kidId, visitedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS kid_site_requests (
        id VARCHAR(64) PRIMARY KEY,
        kidId VARCHAR(64) NOT NULL,
        parentId VARCHAR(64) NOT NULL,
        url TEXT NOT NULL,
        domain VARCHAR(255) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        createdAt VARCHAR(64) NOT NULL,
        decidedAt VARCHAR(64) NULL,
        UNIQUE KEY uniq_kid_site_req (kidId, domain),
        INDEX idx_site_req_parent (parentId, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_notifications (
        id VARCHAR(64) PRIMARY KEY,
        userId VARCHAR(64) NOT NULL,
        type VARCHAR(32) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        relatedId VARCHAR(128) NULL,
        isRead TINYINT(1) NOT NULL DEFAULT 0,
        createdAt VARCHAR(64) NOT NULL,
        INDEX idx_notif_user_time (userId, createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS video_parent_reviews (
        id VARCHAR(64) PRIMARY KEY,
        videoKey VARCHAR(128) NOT NULL,
        videoId VARCHAR(64) NULL,
        youtubeVideoId VARCHAR(32) NULL,
        videoTitle VARCHAR(255) NOT NULL,
        channelTitle VARCHAR(255) NOT NULL,
        thumbnailUrl TEXT NOT NULL,
        sourceType VARCHAR(16) NOT NULL DEFAULT 'YOUTUBE',
        sourceUrl TEXT NOT NULL,
        parentId VARCHAR(64) NOT NULL,
        parentName VARCHAR(255) NOT NULL,
        rating VARCHAR(16) NOT NULL,
        comment TEXT NOT NULL,
        createdAt VARCHAR(64) NOT NULL,
        updatedAt VARCHAR(64) NOT NULL,
        UNIQUE KEY uniq_parent_video_review (parentId, videoKey),
        INDEX idx_vpr_video (videoKey),
        INDEX idx_vpr_rating (rating)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS family_pass_vouchers (
        id VARCHAR(64) PRIMARY KEY,
        userId VARCHAR(64) NOT NULL,
        code VARCHAR(64) NOT NULL UNIQUE,
        durationMonths INT NOT NULL DEFAULT 3,
        source VARCHAR(32) NOT NULL DEFAULT 'REFERRAL',
        referralCodeUsed VARCHAR(32) NULL,
        referrerUserId VARCHAR(64) NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE',
        expiresAt VARCHAR(64) NULL,
        redeemedAt VARCHAR(64) NULL,
        createdAt VARCHAR(64) NOT NULL,
        INDEX idx_fpv_user (userId),
        INDEX idx_fpv_referrer (referrerUserId)
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
    const nowIso = new Date().toISOString();

    await this.pool.query(
      `INSERT INTO users (id, email, name, passwordHash, role, isVerified, createdAt)
       VALUES (?, ?, ?, ?, 'PARENT', 1, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), isVerified = 1`,
      [ADMIN_CURATOR_ID, 'team@famitube.app', ADMIN_CURATOR_NAME, 'seeded-admin-account', nowIso]
    );

    for (const c of INITIAL_CATEGORIES) {
      await this.pool.query(
        'INSERT IGNORE INTO categories (id, name, icon, color) VALUES (?, ?, ?, ?)',
        [c.id, c.name, c.icon, c.color]
      );
    }

    for (const ch of INITIAL_CHANNELS) {
      await this.pool.query(
        `INSERT INTO channels (id, name, description, avatarUrl, bannerUrl, category, ageRating, isVerified, channelType, scheduleStartTime, videoIds, liveSchedules, ownerId, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           description = VALUES(description),
           category = VALUES(category),
           channelType = VALUES(channelType),
           ageRating = VALUES(ageRating),
           videoIds = VALUES(videoIds),
           liveSchedules = COALESCE(liveSchedules, VALUES(liveSchedules)),
           ownerId = COALESCE(ownerId, VALUES(ownerId))`,
        [
          ch.id,
          ch.name,
          ch.description,
          ch.avatarUrl,
          ch.bannerUrl || null,
          ch.category,
          ch.ageRating || 'ALL',
          ch.isVerified ? 1 : 0,
          ch.channelType,
          ch.scheduleStartTime || null,
          JSON.stringify(ch.videoIds || []),
          ch.liveSchedules ? JSON.stringify(ch.liveSchedules) : null,
          ch.ownerId || ADMIN_CURATOR_ID,
          ch.createdAt || nowIso
        ]
      );
    }

    await this.pool.query('UPDATE channels SET ownerId = ? WHERE ownerId IS NULL', [ADMIN_CURATOR_ID]);

    for (const v of INITIAL_VIDEOS) {
      const normalizedTags = normalizeVideoTags(v.tags || [], v.ageRating, v.category);
      await this.pool.query(
        `INSERT INTO videos (id, title, description, sourceType, sourceUrl, youtubeVideoId, thumbnailUrl, duration, channelId, channelTitle, channelAvatar, category, ageRating, isFeatured, isApproved, views, tags, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title),
           description = VALUES(description),
           channelId = VALUES(channelId),
           channelTitle = VALUES(channelTitle),
           category = VALUES(category),
           ageRating = VALUES(ageRating),
           tags = VALUES(tags)`,
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
          JSON.stringify(normalizedTags),
          v.createdAt
        ]
      );
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

    const scaryVideoId = 'vid-scary-01';
    const scaryChannel = INITIAL_CHANNELS[0]?.id || 'ch-science';
    await this.pool.query(
      `INSERT IGNORE INTO videos (id, title, description, sourceType, sourceUrl, youtubeVideoId, thumbnailUrl, duration, channelId, channelTitle, channelAvatar, category, ageRating, isFeatured, isApproved, views, tags, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        scaryVideoId,
        'scary video',
        'Spooky mystery story that may be too intense for younger viewers.',
        'YOUTUBE',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'dQw4w9WgXcQ',
        'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        210,
        scaryChannel,
        'Mystery Storytime',
        'https://api.dicebear.com/7.x/shapes/svg?seed=scary',
        'Stories & Reading',
        'OLDER_KIDS',
        0,
        1,
        42,
        JSON.stringify(['age:older_kids', 'category:stories & reading', 'spooky']),
        nowIso
      ]
    );

    const [vprRows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS cnt FROM video_parent_reviews');
    if (Number(vprRows[0]?.cnt || 0) === 0) {
      const sampleParents = [
        { id: 'seed-parent-1', name: 'Maya Lin' },
        { id: 'seed-parent-2', name: 'Daniel Carter' },
        { id: 'seed-parent-3', name: 'Sarah Jenkins' },
        { id: 'seed-parent-4', name: 'Rina Kusuma' },
        { id: 'seed-parent-5', name: 'Alex Rivera' }
      ];
      const positiveComments = [
        'Great educational pacing and super clear explanations!',
        'My kids loved this and kept talking about what they learned.',
        'Calm, engaging, and completely age-appropriate.',
        'Wonderful visuals and positive message for the whole family.',
        'Highly recommended — one of our favorite safe picks!'
      ];

      const [vidRows] = await this.pool.query<RowDataPacket[]>(
        'SELECT * FROM videos WHERE isApproved = 1 AND id != ? ORDER BY createdAt DESC LIMIT 10',
        [scaryVideoId]
      );

      for (const vRow of vidRows) {
        const v = mapVideoRow(vRow);
        for (let i = 0; i < sampleParents.length; i++) {
          const p = sampleParents[i];
          await this.pool.query(
            `INSERT IGNORE INTO video_parent_reviews
              (id, videoKey, videoId, youtubeVideoId, videoTitle, channelTitle, thumbnailUrl, sourceType, sourceUrl, parentId, parentName, rating, comment, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              `vpr-${v.id}-${p.id}`,
              v.id,
              v.id,
              v.youtubeVideoId || null,
              v.title,
              v.channelTitle,
              v.thumbnailUrl,
              v.sourceType,
              v.sourceUrl,
              p.id,
              p.name,
              'RECOMMENDED',
              positiveComments[i % positiveComments.length],
              nowIso,
              nowIso
            ]
          );
        }
      }

      const [scaryRows] = await this.pool.query<RowDataPacket[]>(
        'SELECT * FROM videos WHERE id = ? LIMIT 1',
        [scaryVideoId]
      );
      if (scaryRows.length > 0) {
        const sv = mapVideoRow(scaryRows[0]);
        const scaryReviews = [
          { parent: sampleParents[0], rating: 'CAUTION', comment: 'Too spooky for younger kids — definitely preview before showing.' },
          { parent: sampleParents[1], rating: 'CAUTION', comment: 'Has sudden loud sound effects and dark scenes.' },
          { parent: sampleParents[2], rating: 'CAUTION', comment: 'Scared my 6-year-old; better for older kids only.' },
          { parent: sampleParents[3], rating: 'CAUTION', comment: 'Intense suspenseful music; recommend parental supervision.' },
          { parent: sampleParents[4], rating: 'RECOMMENDED', comment: 'Fine for older kids who enjoy mild spooky stories.' }
        ];
        for (const sr of scaryReviews) {
          await this.pool.query(
            `INSERT IGNORE INTO video_parent_reviews
              (id, videoKey, videoId, youtubeVideoId, videoTitle, channelTitle, thumbnailUrl, sourceType, sourceUrl, parentId, parentName, rating, comment, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              `vpr-${sv.id}-${sr.parent.id}`,
              sv.id,
              sv.id,
              sv.youtubeVideoId || null,
              sv.title,
              sv.channelTitle,
              sv.thumbnailUrl,
              sv.sourceType,
              sv.sourceUrl,
              sr.parent.id,
              sr.parent.name,
              sr.rating,
              sr.comment,
              nowIso,
              nowIso
            ]
          );
        }
      }
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
    includeTags?: string[];
    anyTags?: string[];
    excludeTags?: string[];
    presetIds?: string[];
  }): Promise<Video[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM videos ORDER BY createdAt DESC'
    );
    const [channelRows] = await this.pool.query<RowDataPacket[]>(
      'SELECT id, defaultTags FROM channels'
    );
    const channelTagsMap = new Map<string, string[]>();
    for (const chRow of channelRows) {
      const chTags = parseJson<string[]>(chRow.defaultTags, []);
      if (chTags.length > 0) {
        channelTagsMap.set(chRow.id, chTags);
      }
    }

    let list = rows.map((row) => {
      const video = mapVideoRow(row);
      const chTags = channelTagsMap.get(video.channelId);
      if (chTags && chTags.length > 0) {
        return {
          ...video,
          tags: resolveEffectiveVideoTags(video.tags, chTags, video.ageRating, video.category)
        };
      }
      return video;
    });

    if (filter?.onlyApproved ?? true) {
      list = list.filter((v) => v.isApproved);
    }
    if (filter?.category && filter.category !== 'All Videos' && filter.category !== 'cat-all') {
      list = list.filter((v) => videoMatchesCategoryTag(v.tags, filter.category!));
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
      list = list.filter((v) => videoMatchesAgeTag(v.tags, filter.ageRating!));
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

    if (
      (filter?.includeTags && filter.includeTags.length > 0) ||
      (filter?.anyTags && filter.anyTags.length > 0) ||
      (filter?.excludeTags && filter.excludeTags.length > 0) ||
      (filter?.presetIds && filter.presetIds.length > 0)
    ) {
      list = list.filter((v) =>
        matchesTagFilter(v.tags, {
          includeTags: filter?.includeTags,
          anyTags: filter?.anyTags,
          excludeTags: filter?.excludeTags,
          presetIds: filter?.presetIds
        })
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
    const normalizedTags = normalizeVideoTags(video.tags || [], video.ageRating, video.category);
    const savedVideo: Video = { ...video, tags: normalizedTags };
    await this.pool.query(
      `INSERT INTO videos (id, title, description, sourceType, sourceUrl, youtubeVideoId, thumbnailUrl, duration, channelId, channelTitle, channelAvatar, category, ageRating, isFeatured, isApproved, views, tags, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        savedVideo.id,
        savedVideo.title,
        savedVideo.description,
        savedVideo.sourceType,
        savedVideo.sourceUrl,
        savedVideo.youtubeVideoId || null,
        savedVideo.thumbnailUrl,
        savedVideo.duration,
        savedVideo.channelId,
        savedVideo.channelTitle,
        savedVideo.channelAvatar,
        savedVideo.category,
        savedVideo.ageRating,
        savedVideo.isFeatured ? 1 : 0,
        savedVideo.isApproved ? 1 : 0,
        savedVideo.views,
        JSON.stringify(savedVideo.tags),
        savedVideo.createdAt
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
    merged.tags = normalizeVideoTags(merged.tags || [], merged.ageRating, merged.category);
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
  public async getChannelVideos(channelId: string, ageRating?: string): Promise<Video[]> {
    return this.getVideos({ channelId, ageRating, onlyApproved: true });
  }

  public async getChannels(options?: { onlyPublic?: boolean; ageRating?: string }): Promise<Channel[]> {
    const query = options?.onlyPublic
      ? `SELECT c.*, u.name AS ownerName
         FROM channels c
         LEFT JOIN users u ON u.id = c.ownerId
         WHERE c.visibility = 'PUBLIC' OR c.visibility IS NULL`
      : `SELECT c.*, u.name AS ownerName
         FROM channels c
         LEFT JOIN users u ON u.id = c.ownerId`;
    const [rows] = await this.pool.query<RowDataPacket[]>(query);
    let channels = rows.map(mapChannelRow);
    if (options?.ageRating && options.ageRating !== 'ALL') {
      channels = channels.filter((c) => channelMatchesAgeRating(c.ageRating, options.ageRating));
    }
    return Promise.all(
      channels.map(async (c) => ({
        ...c,
        videoCount: (await this.getChannelVideos(c.id, options?.ageRating)).length
      }))
    );
  }

  public async getChannelById(id: string): Promise<Channel | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT c.*, u.name AS ownerName
       FROM channels c
       LEFT JOIN users u ON u.id = c.ownerId
       WHERE c.id = ?`,
      [id]
    );
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
    const timeline = Array.isArray(channel.liveTimeline) ? channel.liveTimeline : undefined;
    const schedules = Array.isArray(channel.liveSchedules) ? channel.liveSchedules : undefined;
    const scheduleVideoIds = schedules?.length
      ? schedules.flatMap(s => (s.slots || []).map(slot => slot.videoId))
      : [];
    const derivedVideoIds = scheduleVideoIds.length
      ? Array.from(new Set(scheduleVideoIds))
      : timeline?.length
        ? Array.from(new Set(timeline.map(item => item.videoId)))
        : (channel.videoIds || []);
    const normalized: Channel = {
      ...channel,
      ageRating: channel.ageRating || 'ALL',
      channelType: channel.channelType || 'ON_DEMAND',
      scheduleStartTime: channel.scheduleStartTime || new Date().toISOString(),
      scheduleTimezoneOffsetMinutes:
        typeof channel.scheduleTimezoneOffsetMinutes === 'number'
          ? channel.scheduleTimezoneOffsetMinutes
          : 0,
      videoIds: derivedVideoIds,
      liveTimeline: timeline,
      liveSchedules: schedules,
      visibility: channel.visibility || 'PUBLIC',
      defaultTags: parseTagList(channel.defaultTags),
      createdAt: channel.createdAt || new Date().toISOString()
    };
    await this.pool.query(
      `INSERT INTO channels (id, name, description, avatarUrl, bannerUrl, category, ageRating, isVerified, channelType, scheduleStartTime, scheduleTimezoneOffsetMinutes, videoIds, liveTimeline, liveSchedules, ownerId, visibility, defaultTags, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalized.id,
        normalized.name,
        normalized.description,
        normalized.avatarUrl,
        normalized.bannerUrl || null,
        normalized.category,
        normalized.ageRating || 'ALL',
        normalized.isVerified ? 1 : 0,
        normalized.channelType,
        normalized.scheduleStartTime || null,
        normalized.scheduleTimezoneOffsetMinutes ?? 0,
        JSON.stringify(normalized.videoIds || []),
        normalized.liveTimeline ? JSON.stringify(normalized.liveTimeline) : null,
        normalized.liveSchedules ? JSON.stringify(normalized.liveSchedules) : null,
        normalized.ownerId || null,
        normalized.visibility || 'PUBLIC',
        JSON.stringify(normalized.defaultTags || []),
        normalized.createdAt || null
      ]
    );
    return normalized;
  }

  public async updateChannel(id: string, updates: Partial<Channel>): Promise<Channel | null> {
    const existing = await this.getChannelById(id);
    if (!existing) return null;

    const merged: Channel = {
      ...existing,
      ...updates,
      id,
      ageRating: updates.ageRating || existing.ageRating || 'ALL',
      defaultTags:
        updates.defaultTags !== undefined
          ? parseTagList(updates.defaultTags)
          : existing.defaultTags || []
    };
    if (Array.isArray(updates.liveSchedules) && updates.liveSchedules.length > 0 && !updates.videoIds) {
      merged.videoIds = Array.from(
        new Set(updates.liveSchedules.flatMap(s => (s.slots || []).map(slot => slot.videoId)))
      );
    } else if (Array.isArray(updates.liveTimeline) && updates.liveTimeline.length > 0 && !updates.videoIds) {
      merged.videoIds = Array.from(new Set(updates.liveTimeline.map(item => item.videoId)));
    }
    await this.pool.query(
      `UPDATE channels SET name = ?, description = ?, avatarUrl = ?, bannerUrl = ?, category = ?, ageRating = ?, isVerified = ?, channelType = ?, scheduleStartTime = ?, scheduleTimezoneOffsetMinutes = ?, videoIds = ?, liveTimeline = ?, liveSchedules = ?, visibility = ?, defaultTags = ?
       WHERE id = ?`,
      [
        merged.name,
        merged.description,
        merged.avatarUrl,
        merged.bannerUrl || null,
        merged.category,
        merged.ageRating || 'ALL',
        merged.isVerified ? 1 : 0,
        merged.channelType,
        merged.scheduleStartTime || null,
        merged.scheduleTimezoneOffsetMinutes ?? 0,
        JSON.stringify(merged.videoIds || []),
        merged.liveTimeline ? JSON.stringify(merged.liveTimeline) : null,
        merged.liveSchedules ? JSON.stringify(merged.liveSchedules) : null,
        merged.visibility || 'PUBLIC',
        JSON.stringify(merged.defaultTags || []),
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

    const videoById = new Map(videos.map(v => [v.id, v]));
    const nowMs = Date.now();

    if (channel.liveSchedules && channel.liveSchedules.length > 0) {
      const tzOffsetMin = typeof channel.scheduleTimezoneOffsetMinutes === 'number'
        ? channel.scheduleTimezoneOffsetMinutes
        : 0;
      const localDate = new Date(nowMs + tzOffsetMin * 60000);
      const yyyy = localDate.getUTCFullYear();
      const mm = String(localDate.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(localDate.getUTCDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const weekday = localDate.getUTCDay();
      const nowSecOfDay =
        localDate.getUTCHours() * 3600 +
        localDate.getUTCMinutes() * 60 +
        localDate.getUTCSeconds();

      const activeSchedule =
        channel.liveSchedules.find(s => s.ruleType === 'DATE' && s.date === dateStr) ||
        channel.liveSchedules.find(s => s.ruleType === 'WEEKDAY' && s.weekday === weekday) ||
        channel.liveSchedules.find(s => s.ruleType === 'DEFAULT');

      const sortedRawSlots = [...(activeSchedule?.slots || [])]
        .filter(s => s.startOfDaySeconds >= 0 && s.startOfDaySeconds < 86400)
        .sort((a, b) => a.startOfDaySeconds - b.startOfDaySeconds);

      const resolvedSlots = sortedRawSlots
        .map((slot, idx) => {
          const video = videoById.get(slot.videoId);
          if (!video) return null;
          const fullDur = Math.max(10, video.duration || 180);
          const clipStart = slot.playMode === 'CLIP'
            ? Math.max(0, Math.min(Number(slot.clipStartSeconds) || 0, fullDur - 1))
            : 0;
          const rawEnd = slot.playMode === 'CLIP' && slot.clipEndSeconds != null ? Number(slot.clipEndSeconds) : fullDur;
          const clipEnd = rawEnd > clipStart ? Math.min(rawEnd, fullDur) : fullDur;
          const slotDuration = Math.max(1, clipEnd - clipStart);
          const nextStart = idx + 1 < sortedRawSlots.length ? sortedRawSlots[idx + 1].startOfDaySeconds : 86400;
          // Videos crossing midnight (86400s) or the next scheduled slot are cut off in favor of the next slot/day
          const effectiveEndOfDay = Math.min(86400, nextStart, slot.startOfDaySeconds + slotDuration);
          if (effectiveEndOfDay <= slot.startOfDaySeconds) return null;
          return {
            video,
            startOfDaySeconds: slot.startOfDaySeconds,
            effectiveEndOfDay,
            clipStart
          };
        })
        .filter((s): s is { video: Video; startOfDaySeconds: number; effectiveEndOfDay: number; clipStart: number } => Boolean(s));

      const currentIdx = resolvedSlots.findIndex(
        s => nowSecOfDay >= s.startOfDaySeconds && nowSecOfDay < s.effectiveEndOfDay
      );

      if (currentIdx === -1) {
        const upNext: UpNextItem[] = resolvedSlots
          .filter(s => s.startOfDaySeconds > nowSecOfDay)
          .slice(0, 4)
          .map(s => ({
            video: s.video,
            startsInSeconds: s.startOfDaySeconds - nowSecOfDay
          }));
        return {
          channel,
          serverTime: new Date(nowMs).toISOString(),
          currentVideo: null,
          offsetSeconds: 0,
          remainingSeconds: 0,
          upNext
        };
      }

      const activeSlot = resolvedSlots[currentIdx];
      const offsetSeconds = activeSlot.clipStart + (nowSecOfDay - activeSlot.startOfDaySeconds);
      const remainingSeconds = activeSlot.effectiveEndOfDay - nowSecOfDay;
      const upNext: UpNextItem[] = resolvedSlots
        .slice(currentIdx + 1, currentIdx + 5)
        .map(s => ({
          video: s.video,
          startsInSeconds: s.startOfDaySeconds - nowSecOfDay
        }));

      return {
        channel,
        serverTime: new Date(nowMs).toISOString(),
        currentVideo: activeSlot.video,
        offsetSeconds,
        remainingSeconds,
        upNext
      };
    }

    const timelineSlots = (channel.liveTimeline && channel.liveTimeline.length > 0)
      ? channel.liveTimeline
          .map(item => {
            const video = videoById.get(item.videoId);
            if (!video) return null;
            const fullDur = Math.max(10, video.duration || 180);
            const clipStart = item.playMode === 'CLIP'
              ? Math.max(0, Math.min(Number(item.startSeconds) || 0, fullDur - 1))
              : 0;
            const rawEnd = item.playMode === 'CLIP' && item.endSeconds != null ? Number(item.endSeconds) : fullDur;
            const clipEnd = rawEnd > clipStart ? Math.min(rawEnd, fullDur) : fullDur;
            const slotDuration = Math.max(10, clipEnd - clipStart);
            return { video, clipStart, slotDuration };
          })
          .filter((s): s is { video: Video; clipStart: number; slotDuration: number } => Boolean(s))
      : videos.map(video => ({
          video,
          clipStart: 0,
          slotDuration: Math.max(10, video.duration || 180)
        }));

    if (timelineSlots.length === 0) {
      return {
        channel,
        serverTime: new Date().toISOString(),
        currentVideo: null,
        offsetSeconds: 0,
        remainingSeconds: 0,
        upNext: []
      };
    }

    const totalCycleSeconds = timelineSlots.reduce((sum, s) => sum + s.slotDuration, 0);
    const anchorMs = channel.scheduleStartTime ? new Date(channel.scheduleStartTime).getTime() : 0;
    const elapsedSinceAnchorSec = Math.max(0, Math.floor((nowMs - anchorMs) / 1000));
    const cyclePos = elapsedSinceAnchorSec % totalCycleSeconds;

    let accumulated = 0;
    let currentIdx = 0;
    let offsetSeconds = 0;
    let remainingSeconds = 0;

    for (let i = 0; i < timelineSlots.length; i++) {
      const slot = timelineSlots[i];
      if (cyclePos < accumulated + slot.slotDuration) {
        currentIdx = i;
        const posInSlot = cyclePos - accumulated;
        offsetSeconds = slot.clipStart + posInSlot;
        remainingSeconds = slot.slotDuration - posInSlot;
        break;
      }
      accumulated += slot.slotDuration;
    }

    const upNext: UpNextItem[] = [];
    let nextStartIn = remainingSeconds;
    const maxUpNext = Math.min(timelineSlots.length - 1, 4);
    for (let j = 1; j <= maxUpNext; j++) {
      const nextSlot = timelineSlots[(currentIdx + j) % timelineSlots.length];
      upNext.push({
        video: nextSlot.video,
        startsInSeconds: nextStartIn
      });
      nextStartIn += nextSlot.slotDuration;
    }

    return {
      channel,
      serverTime: new Date(nowMs).toISOString(),
      currentVideo: timelineSlots[currentIdx].video,
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
      `INSERT INTO users (id, email, name, passwordHash, role, parentId, referralCode, referredByUserId, referredByCode, birthday, ageRating, isVerified, youtubeSearchEnabled, searchViewLimit, searchViewsUsed, searchRequireApproval, parentalOverrideJson, verificationToken, verificationExpiresAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.email.trim().toLowerCase(),
        user.name.trim(),
        user.passwordHash,
        user.role || 'PARENT',
        user.parentId || null,
        user.referralCode || null,
        user.referredByUserId || null,
        user.referredByCode || null,
        user.birthday || null,
        user.ageRating || null,
        user.isVerified ? 1 : 0,
        user.youtubeSearchEnabled ? 1 : 0,
        user.searchViewLimit ?? 0,
        user.searchViewsUsed ?? 0,
        user.searchRequireApproval !== false ? 1 : 0,
        user.parentalOverride ? JSON.stringify(user.parentalOverride) : null,
        user.verificationToken || null,
        user.verificationExpiresAt || null,
        user.createdAt
      ]
    );
    return user;
  }

  public async updateParentGlobalControls(
    parentId: string,
    updates: Partial<ParentalControls>
  ): Promise<User | null> {
    const existing = await this.getUserById(parentId);
    if (!existing || existing.role !== 'PARENT') return null;

    const parentPin = updates.parentPin !== undefined ? updates.parentPin : (existing.parentPin || '1234');
    const dailyLimitMinutes =
      updates.dailyLimitMinutes !== undefined
        ? Math.max(0, Math.min(720, Number(updates.dailyLimitMinutes)))
        : (existing.dailyLimitMinutes ?? 45);
    const ageRating = updates.ageRating !== undefined ? updates.ageRating : (existing.ageRating || 'ALL');
    const attentionTrackingEnabled =
      updates.attentionTrackingEnabled !== undefined
        ? updates.attentionTrackingEnabled
        : (existing.attentionTrackingEnabled !== false);
    const attentionPauseSeconds =
      updates.attentionPauseSeconds !== undefined
        ? Math.max(5, Math.min(300, Number(updates.attentionPauseSeconds)))
        : (existing.attentionPauseSeconds ?? 30);
    const attentionMinWatchPercent =
      updates.attentionMinWatchPercent !== undefined
        ? Math.max(10, Math.min(100, Number(updates.attentionMinWatchPercent)))
        : (existing.attentionMinWatchPercent ?? 70);
    const youtubeSearchEnabled =
      updates.youtubeSearchEnabled !== undefined
        ? updates.youtubeSearchEnabled
        : (existing.youtubeSearchEnabled !== false);
    const searchViewLimit =
      updates.searchViewLimit !== undefined
        ? Math.max(0, Number(updates.searchViewLimit))
        : (existing.searchViewLimit ?? 0);
    const searchRequireApproval =
      updates.searchRequireApproval !== undefined
        ? updates.searchRequireApproval
        : (existing.searchRequireApproval !== false);

    const prevBrowser = existing.browserControls || {};
    const nextBrowser: Partial<BrowserControls> = { ...prevBrowser };
    if (updates.browserEnabled !== undefined) nextBrowser.browserEnabled = updates.browserEnabled;
    if (updates.browserAllowlistOnly !== undefined) nextBrowser.browserAllowlistOnly = updates.browserAllowlistOnly;
    if (updates.browserLogHistory !== undefined) nextBrowser.browserLogHistory = updates.browserLogHistory;
    if (updates.allowedDomains !== undefined) nextBrowser.allowedDomains = updates.allowedDomains;
    if (updates.blockedDomains !== undefined) nextBrowser.blockedDomains = updates.blockedDomains;
    const browserControlsJson = Object.keys(nextBrowser).length > 0 ? JSON.stringify(nextBrowser) : null;

    await this.pool.query(
      `UPDATE users
       SET parentPin = ?, dailyLimitMinutes = ?, ageRating = ?, attentionTrackingEnabled = ?, attentionPauseSeconds = ?, attentionMinWatchPercent = ?, youtubeSearchEnabled = ?, searchViewLimit = ?, searchRequireApproval = ?, browserControlsJson = ?
       WHERE id = ? AND role = 'PARENT'`,
      [
        parentPin,
        dailyLimitMinutes,
        ageRating,
        attentionTrackingEnabled ? 1 : 0,
        attentionPauseSeconds,
        attentionMinWatchPercent,
        youtubeSearchEnabled ? 1 : 0,
        searchViewLimit,
        searchRequireApproval ? 1 : 0,
        browserControlsJson,
        parentId
      ]
    );
    return (await this.getUserById(parentId)) || null;
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
    updates: {
      name?: string;
      birthday?: string;
      ageRating?: AgeRating;
      passwordHash?: string;
      youtubeSearchEnabled?: boolean;
      searchViewLimit?: number;
      searchRequireApproval?: boolean;
      resetSearchViewsUsed?: boolean;
      parentPin?: string;
      dailyLimitMinutes?: number;
      attentionTrackingEnabled?: boolean;
      attentionPauseSeconds?: number;
      attentionMinWatchPercent?: number;
      parentalOverride?: ParentalControlsOverride | null;
    }
  ): Promise<User | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM users WHERE id = ? AND parentId = ? AND role = 'CHILD'",
      [childId, parentId]
    );
    if (rows.length === 0) return null;
    const existing = mapUserRow(rows[0]);
    const name = updates.name ? updates.name.trim() : existing.name;
    const birthday = updates.birthday !== undefined ? updates.birthday : existing.birthday;
    const ageRating = updates.ageRating !== undefined ? updates.ageRating : existing.ageRating;
    const passwordHash = updates.passwordHash || existing.passwordHash;
    const youtubeSearchEnabled =
      updates.youtubeSearchEnabled !== undefined
        ? updates.youtubeSearchEnabled
        : Boolean(existing.youtubeSearchEnabled);
    const searchViewLimit =
      updates.searchViewLimit !== undefined
        ? Math.max(0, Number(updates.searchViewLimit))
        : (existing.searchViewLimit ?? 0);
    const searchRequireApproval =
      updates.searchRequireApproval !== undefined
        ? updates.searchRequireApproval
        : (existing.searchRequireApproval !== false);
    const searchViewsUsed = updates.resetSearchViewsUsed ? 0 : (existing.searchViewsUsed ?? 0);
    const parentPin = updates.parentPin !== undefined ? updates.parentPin : (existing.parentPin || '1234');
    const dailyLimitMinutes =
      updates.dailyLimitMinutes !== undefined
        ? Math.max(0, Math.min(720, Number(updates.dailyLimitMinutes)))
        : (existing.dailyLimitMinutes ?? 45);
    const attentionTrackingEnabled =
      updates.attentionTrackingEnabled !== undefined
        ? updates.attentionTrackingEnabled
        : (existing.attentionTrackingEnabled !== false);
    const attentionPauseSeconds =
      updates.attentionPauseSeconds !== undefined
        ? Math.max(5, Math.min(300, Number(updates.attentionPauseSeconds)))
        : (existing.attentionPauseSeconds ?? 30);
    const attentionMinWatchPercent =
      updates.attentionMinWatchPercent !== undefined
        ? Math.max(10, Math.min(100, Number(updates.attentionMinWatchPercent)))
        : (existing.attentionMinWatchPercent ?? 70);
    const parentalOverride =
      updates.parentalOverride !== undefined ? updates.parentalOverride : (existing.parentalOverride ?? null);

    await this.pool.query(
      `UPDATE users
       SET name = ?, birthday = ?, ageRating = ?, passwordHash = ?, youtubeSearchEnabled = ?, searchViewLimit = ?, searchViewsUsed = ?, searchRequireApproval = ?, parentPin = ?, dailyLimitMinutes = ?, attentionTrackingEnabled = ?, attentionPauseSeconds = ?, attentionMinWatchPercent = ?, parentalOverrideJson = ?
       WHERE id = ? AND parentId = ?`,
      [
        name,
        birthday || null,
        ageRating || null,
        passwordHash,
        youtubeSearchEnabled ? 1 : 0,
        searchViewLimit,
        searchViewsUsed,
        searchRequireApproval ? 1 : 0,
        parentPin,
        dailyLimitMinutes,
        attentionTrackingEnabled ? 1 : 0,
        attentionPauseSeconds,
        attentionMinWatchPercent,
        parentalOverride && Object.keys(parentalOverride).length > 0 ? JSON.stringify(parentalOverride) : null,
        childId,
        parentId
      ]
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

  public async updateUserPlan(
    userId: string,
    plan: PlanTier,
    planExpiresAt?: string | null
  ): Promise<User | null> {
    await this.pool.query('UPDATE users SET plan = ?, planExpiresAt = ? WHERE id = ?', [
      plan,
      planExpiresAt ?? null,
      userId
    ]);
    return (await this.getUserById(userId)) || null;
  }

  public async getEffectiveEntitlements(user: User): Promise<PlanEntitlements> {
    let planSource: User = user;
    if (user.role === 'CHILD' && user.parentId) {
      const parent = await this.getUserById(user.parentId);
      if (parent) {
        planSource = parent;
      }
    }
    const resolvedPlan = resolveUserPlan(planSource);
    return getEntitlementsForPlan(resolvedPlan, planSource.planExpiresAt);
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

  public async getChannelsForUser(userId: string, ageRating?: string): Promise<ChannelWithAccess[]> {
    const allChannels = await this.getChannels({ onlyPublic: false, ageRating });
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

  // --- Kid YouTube Search, Approval Requests, History & Playlists ---

  public async getKidSavedChannelIds(kidId: string): Promise<string[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT channelId FROM kid_saved_channels WHERE kidId = ? ORDER BY addedAt DESC',
      [kidId]
    );
    return rows.map((r) => String(r.channelId));
  }

  public async addKidSavedChannel(kidId: string, channelId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO kid_saved_channels (id, kidId, channelId, addedAt)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE addedAt = VALUES(addedAt)`,
      [`ksc-${kidId}-${channelId}`, kidId, channelId, new Date().toISOString()]
    );
  }

  public async removeKidSavedChannel(kidId: string, channelId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM kid_saved_channels WHERE kidId = ? AND channelId = ?',
      [kidId, channelId]
    );
  }

  public async incrementKidSearchViewsUsed(kidId: string): Promise<void> {
    await this.pool.query('UPDATE users SET searchViewsUsed = searchViewsUsed + 1 WHERE id = ?', [kidId]);
  }

  public async getVideoByYouTubeId(youtubeVideoId: string): Promise<Video | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM videos WHERE youtubeVideoId = ? LIMIT 1',
      [youtubeVideoId]
    );
    if (rows.length === 0) return undefined;
    return mapVideoRow(rows[0]);
  }

  public async getKidVideoRequest(kidId: string, youtubeVideoId: string): Promise<KidVideoRequest | undefined> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT r.*, u.name AS kidName
       FROM kid_video_requests r
       LEFT JOIN users u ON u.id = r.kidId
       WHERE r.kidId = ? AND r.youtubeVideoId = ? LIMIT 1`,
      [kidId, youtubeVideoId]
    );
    if (rows.length === 0) return undefined;
    const row = rows[0];
    return {
      id: row.id,
      kidId: row.kidId,
      kidName: row.kidName || undefined,
      parentId: row.parentId,
      youtubeVideoId: row.youtubeVideoId,
      title: row.title,
      channelTitle: row.channelTitle,
      thumbnailUrl: row.thumbnailUrl,
      status: row.status as KidVideoRequestStatus,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt || null
    };
  }

  public async getKidVideoRequestsForKid(kidId: string): Promise<KidVideoRequest[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT * FROM kid_video_requests WHERE kidId = ? ORDER BY createdAt DESC`,
      [kidId]
    );
    return rows.map((row) => ({
      id: row.id,
      kidId: row.kidId,
      parentId: row.parentId,
      youtubeVideoId: row.youtubeVideoId,
      title: row.title,
      channelTitle: row.channelTitle,
      thumbnailUrl: row.thumbnailUrl,
      status: row.status as KidVideoRequestStatus,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt || null
    }));
  }

  public async getKidVideoRequestsForParent(parentId: string): Promise<KidVideoRequest[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT r.*, u.name AS kidName
       FROM kid_video_requests r
       LEFT JOIN users u ON u.id = r.kidId
       WHERE r.parentId = ?
       ORDER BY CASE WHEN r.status = 'PENDING' THEN 0 ELSE 1 END, r.createdAt DESC`,
      [parentId]
    );
    return rows.map((row) => ({
      id: row.id,
      kidId: row.kidId,
      kidName: row.kidName || 'Child',
      parentId: row.parentId,
      youtubeVideoId: row.youtubeVideoId,
      title: row.title,
      channelTitle: row.channelTitle,
      thumbnailUrl: row.thumbnailUrl,
      status: row.status as KidVideoRequestStatus,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt || null
    }));
  }

  public async upsertKidVideoRequest(req: KidVideoRequest): Promise<KidVideoRequest> {
    await this.pool.query(
      `INSERT INTO kid_video_requests (id, kidId, parentId, youtubeVideoId, title, channelTitle, thumbnailUrl, status, createdAt, decidedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         channelTitle = VALUES(channelTitle),
         thumbnailUrl = VALUES(thumbnailUrl),
         status = CASE WHEN status = 'APPROVED' THEN 'APPROVED' ELSE VALUES(status) END,
         createdAt = CASE WHEN status = 'APPROVED' THEN createdAt ELSE VALUES(createdAt) END,
         decidedAt = CASE WHEN status = 'APPROVED' THEN decidedAt ELSE VALUES(decidedAt) END`,
      [
        req.id,
        req.kidId,
        req.parentId,
        req.youtubeVideoId,
        req.title,
        req.channelTitle,
        req.thumbnailUrl,
        req.status,
        req.createdAt,
        req.decidedAt || null
      ]
    );
    return (await this.getKidVideoRequest(req.kidId, req.youtubeVideoId))!;
  }

  public async getYouTubeVideoParentStats(youtubeVideoId: string): Promise<{
    approvedCount: number;
    declinedCount: number;
  }> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT status, COUNT(DISTINCT parentId) AS cnt
       FROM kid_video_requests
       WHERE youtubeVideoId = ? AND status IN ('APPROVED', 'REJECTED')
       GROUP BY status`,
      [youtubeVideoId]
    );
    let approvedCount = 0;
    let declinedCount = 0;
    for (const r of rows) {
      if (r.status === 'APPROVED') approvedCount = Number(r.cnt) || 0;
      else if (r.status === 'REJECTED') declinedCount = Number(r.cnt) || 0;
    }
    return { approvedCount, declinedCount };
  }

  public async decideKidVideoRequest(
    parentId: string,
    requestId: string,
    decision: 'APPROVED' | 'REJECTED'
  ): Promise<KidVideoRequest | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM kid_video_requests WHERE id = ? AND parentId = ? LIMIT 1',
      [requestId, parentId]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    const nowIso = new Date().toISOString();
    const wasApproved = row.status === 'APPROVED';

    await this.pool.query(
      'UPDATE kid_video_requests SET status = ?, decidedAt = ? WHERE id = ? AND parentId = ?',
      [decision, nowIso, requestId, parentId]
    );

    if (decision === 'APPROVED') {
      if (!wasApproved) {
        await this.incrementKidSearchViewsUsed(row.kidId);
      }
      await this.upsertKidHistory({
        id: `hist-${row.kidId}-${row.youtubeVideoId}`,
        kidId: row.kidId,
        itemKey: row.youtubeVideoId,
        youtubeVideoId: row.youtubeVideoId,
        title: row.title,
        channelTitle: row.channelTitle,
        thumbnailUrl: row.thumbnailUrl,
        sourceType: 'YOUTUBE',
        sourceUrl: `https://www.youtube.com/watch?v=${row.youtubeVideoId}`,
        isApprovedSearch: true,
        watchedAt: nowIso
      });
    }

    return (await this.getKidVideoRequest(row.kidId, row.youtubeVideoId)) || null;
  }

  public async getKidHistory(kidId: string): Promise<KidHistoryItem[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM kid_watch_history WHERE kidId = ? ORDER BY watchedAt DESC',
      [kidId]
    );
    return rows.map((row) => ({
      id: row.id,
      kidId: row.kidId,
      itemKey: row.itemKey,
      youtubeVideoId: row.youtubeVideoId || undefined,
      videoId: row.videoId || undefined,
      title: row.title,
      channelTitle: row.channelTitle,
      thumbnailUrl: row.thumbnailUrl,
      sourceType: (row.sourceType as 'YOUTUBE' | 'DIRECT') || 'YOUTUBE',
      sourceUrl: row.sourceUrl,
      isApprovedSearch: Boolean(row.isApprovedSearch),
      watchedAt: row.watchedAt
    }));
  }

  public async upsertKidHistory(item: KidHistoryItem): Promise<KidHistoryItem> {
    await this.pool.query(
      `INSERT INTO kid_watch_history
        (id, kidId, itemKey, youtubeVideoId, videoId, title, channelTitle, thumbnailUrl, sourceType, sourceUrl, isApprovedSearch, watchedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         channelTitle = VALUES(channelTitle),
         thumbnailUrl = VALUES(thumbnailUrl),
         isApprovedSearch = GREATEST(isApprovedSearch, VALUES(isApprovedSearch)),
         watchedAt = VALUES(watchedAt)`,
      [
        item.id,
        item.kidId,
        item.itemKey,
        item.youtubeVideoId || null,
        item.videoId || null,
        item.title,
        item.channelTitle,
        item.thumbnailUrl,
        item.sourceType,
        item.sourceUrl,
        item.isApprovedSearch ? 1 : 0,
        item.watchedAt
      ]
    );
    return item;
  }

  public async getKidBrowserHistory(kidId: string, limit = 200): Promise<KidBrowserHistoryItem[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM kid_browser_history WHERE kidId = ? ORDER BY visitedAt DESC LIMIT ?',
      [kidId, Math.max(1, Math.min(1000, limit))]
    );
    return rows.map((row) => ({
      id: row.id,
      kidId: row.kidId,
      url: row.url,
      domain: row.domain,
      title: row.title,
      blocked: Boolean(row.blocked),
      visitedAt: row.visitedAt
    }));
  }

  public async addKidBrowserHistoryBatch(
    kidId: string,
    items: KidBrowserHistoryItem[]
  ): Promise<KidBrowserHistoryItem[]> {
    if (items.length === 0) return [];
    const values = items.map((item) => [
      item.id,
      kidId,
      item.url,
      item.domain,
      item.title,
      item.blocked ? 1 : 0,
      item.visitedAt
    ]);
    await this.pool.query(
      `INSERT IGNORE INTO kid_browser_history
        (id, kidId, url, domain, title, blocked, visitedAt)
       VALUES ?`,
      [values]
    );
    return items;
  }

  public async clearKidBrowserHistory(kidId: string): Promise<void> {
    await this.pool.query('DELETE FROM kid_browser_history WHERE kidId = ?', [kidId]);
  }

  public async createOrGetKidSiteRequest(req: KidSiteRequest): Promise<KidSiteRequest> {
    const [existingRows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM kid_site_requests WHERE kidId = ? AND domain = ?',
      [req.kidId, req.domain]
    );
    if (existingRows[0]) {
      const row = existingRows[0];
      if (row.status === 'REJECTED') {
        await this.pool.query(
          'UPDATE kid_site_requests SET url = ?, status = ?, createdAt = ?, decidedAt = NULL WHERE id = ?',
          [req.url, 'PENDING', req.createdAt, row.id]
        );
        return {
          ...req,
          id: row.id,
          status: 'PENDING',
          decidedAt: null
        };
      }
      return {
        id: row.id,
        kidId: row.kidId,
        parentId: row.parentId,
        url: row.url,
        domain: row.domain,
        status: row.status as KidSiteRequestStatus,
        createdAt: row.createdAt,
        decidedAt: row.decidedAt || null
      };
    }

    await this.pool.query(
      `INSERT INTO kid_site_requests (id, kidId, parentId, url, domain, status, createdAt, decidedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      [req.id, req.kidId, req.parentId, req.url, req.domain, req.status, req.createdAt]
    );
    return req;
  }

  public async getKidSiteRequestsForParent(parentId: string): Promise<KidSiteRequest[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT r.*, u.name AS kidName
       FROM kid_site_requests r
       LEFT JOIN users u ON u.id = r.kidId
       WHERE r.parentId = ?
       ORDER BY FIELD(r.status, 'PENDING', 'APPROVED', 'REJECTED'), r.createdAt DESC`,
      [parentId]
    );
    return rows.map((row) => ({
      id: row.id,
      kidId: row.kidId,
      kidName: row.kidName || undefined,
      parentId: row.parentId,
      url: row.url,
      domain: row.domain,
      status: row.status as KidSiteRequestStatus,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt || null
    }));
  }

  public async decideKidSiteRequest(
    requestId: string,
    parentId: string,
    decision: 'APPROVED' | 'REJECTED'
  ): Promise<KidSiteRequest | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM kid_site_requests WHERE id = ? AND parentId = ?',
      [requestId, parentId]
    );
    const row = rows[0];
    if (!row) return null;

    const nowIso = new Date().toISOString();
    await this.pool.query(
      'UPDATE kid_site_requests SET status = ?, decidedAt = ? WHERE id = ?',
      [decision, nowIso, requestId]
    );

    return {
      id: row.id,
      kidId: row.kidId,
      parentId: row.parentId,
      url: row.url,
      domain: row.domain,
      status: decision,
      createdAt: row.createdAt,
      decidedAt: nowIso
    };
  }

  public async createNotification(
    userId: string,
    type: AppNotificationType,
    title: string,
    message: string,
    relatedId?: string | null
  ): Promise<AppNotification> {
    const notif: AppNotification = {
      id: `notif-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      userId,
      type,
      title: title.slice(0, 255),
      message: message.slice(0, 1000),
      relatedId: relatedId || null,
      isRead: false,
      createdAt: new Date().toISOString()
    };
    await this.pool.query(
      `INSERT INTO app_notifications (id, userId, type, title, message, relatedId, isRead, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [notif.id, notif.userId, notif.type, notif.title, notif.message, notif.relatedId, notif.createdAt]
    );
    return notif;
  }

  public async getNotificationsForUser(userId: string, limit = 100): Promise<AppNotification[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM app_notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT ?',
      [userId, Math.max(1, Math.min(300, limit))]
    );
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      type: row.type as AppNotificationType,
      title: row.title,
      message: row.message,
      relatedId: row.relatedId || null,
      isRead: Boolean(row.isRead),
      createdAt: row.createdAt
    }));
  }

  public async markNotificationRead(id: string, userId: string): Promise<boolean> {
    const [result] = await this.pool.query<ResultSetHeader>(
      'UPDATE app_notifications SET isRead = 1 WHERE id = ? AND userId = ?',
      [id, userId]
    );
    return result.affectedRows > 0;
  }

  public async markAllNotificationsRead(userId: string): Promise<void> {
    await this.pool.query('UPDATE app_notifications SET isRead = 1 WHERE userId = ? AND isRead = 0', [userId]);
  }

  public async clearNotificationsForUser(userId: string): Promise<void> {
    await this.pool.query('DELETE FROM app_notifications WHERE userId = ?', [userId]);
  }

  public async getKidPlaylists(kidId: string): Promise<KidPlaylist[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM kid_playlists WHERE kidId = ? ORDER BY updatedAt DESC',
      [kidId]
    );
    return rows.map((row) => ({
      id: row.id,
      kidId: row.kidId,
      title: row.title,
      items: parseJson<KidPlaylistItem[]>(row.items, []),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));
  }

  public async createKidPlaylist(kidId: string, title: string): Promise<KidPlaylist> {
    const nowIso = new Date().toISOString();
    const pl: KidPlaylist = {
      id: `kpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      kidId,
      title: title.trim(),
      items: [],
      createdAt: nowIso,
      updatedAt: nowIso
    };
    await this.pool.query(
      'INSERT INTO kid_playlists (id, kidId, title, items, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      [pl.id, pl.kidId, pl.title, JSON.stringify(pl.items), pl.createdAt, pl.updatedAt]
    );
    return pl;
  }

  public async addItemToKidPlaylist(
    kidId: string,
    playlistId: string,
    item: KidPlaylistItem
  ): Promise<KidPlaylist | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM kid_playlists WHERE id = ? AND kidId = ? LIMIT 1',
      [playlistId, kidId]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    const items = parseJson<KidPlaylistItem[]>(row.items, []);
    if (!items.some((x) => x.key === item.key)) {
      items.push(item);
    }
    const updatedAt = new Date().toISOString();
    await this.pool.query('UPDATE kid_playlists SET items = ?, updatedAt = ? WHERE id = ? AND kidId = ?', [
      JSON.stringify(items),
      updatedAt,
      playlistId,
      kidId
    ]);
    return {
      id: row.id,
      kidId: row.kidId,
      title: row.title,
      items,
      createdAt: row.createdAt,
      updatedAt
    };
  }

  public async removeItemFromKidPlaylist(
    kidId: string,
    playlistId: string,
    itemKey: string
  ): Promise<KidPlaylist | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM kid_playlists WHERE id = ? AND kidId = ? LIMIT 1',
      [playlistId, kidId]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    const items = parseJson<KidPlaylistItem[]>(row.items, []).filter((x) => x.key !== itemKey);
    const updatedAt = new Date().toISOString();
    await this.pool.query('UPDATE kid_playlists SET items = ?, updatedAt = ? WHERE id = ? AND kidId = ?', [
      JSON.stringify(items),
      updatedAt,
      playlistId,
      kidId
    ]);
    return {
      id: row.id,
      kidId: row.kidId,
      title: row.title,
      items,
      createdAt: row.createdAt,
      updatedAt
    };
  }

  public async deleteKidPlaylist(kidId: string, playlistId: string): Promise<boolean> {
    const [result] = await this.pool.query<mysql.ResultSetHeader>(
      'DELETE FROM kid_playlists WHERE id = ? AND kidId = ?',
      [playlistId, kidId]
    );
    return result.affectedRows > 0;
  }

  // --- Parent Video Appropriateness Reviews & Recommended/Caution Lists ---

  public async upsertVideoParentReview(review: VideoParentReview): Promise<VideoParentReview> {
    await this.pool.query(
      `INSERT INTO video_parent_reviews
        (id, videoKey, videoId, youtubeVideoId, videoTitle, channelTitle, thumbnailUrl, sourceType, sourceUrl, parentId, parentName, rating, comment, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         videoTitle = VALUES(videoTitle),
         channelTitle = VALUES(channelTitle),
         thumbnailUrl = VALUES(thumbnailUrl),
         parentName = VALUES(parentName),
         rating = VALUES(rating),
         comment = VALUES(comment),
         updatedAt = VALUES(updatedAt)`,
      [
        review.id,
        review.videoKey,
        review.videoId || null,
        review.youtubeVideoId || null,
        review.videoTitle,
        review.channelTitle,
        review.thumbnailUrl,
        review.sourceType,
        review.sourceUrl,
        review.parentId,
        review.parentName,
        review.rating,
        review.comment,
        review.createdAt,
        review.updatedAt
      ]
    );
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM video_parent_reviews WHERE parentId = ? AND videoKey = ? LIMIT 1',
      [review.parentId, review.videoKey]
    );
    const r = rows[0];
    return {
      id: r.id,
      videoKey: r.videoKey,
      videoId: r.videoId || undefined,
      youtubeVideoId: r.youtubeVideoId || undefined,
      videoTitle: r.videoTitle,
      channelTitle: r.channelTitle,
      thumbnailUrl: r.thumbnailUrl,
      sourceType: (r.sourceType as 'YOUTUBE' | 'DIRECT') || 'YOUTUBE',
      sourceUrl: r.sourceUrl,
      parentId: r.parentId,
      parentName: r.parentName,
      rating: r.rating as ParentSafetyRating,
      comment: r.comment,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  }

  public async getVideoParentReviews(videoKey: string): Promise<VideoParentReview[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM video_parent_reviews WHERE videoKey = ? ORDER BY updatedAt DESC',
      [videoKey]
    );
    return rows.map((r) => ({
      id: r.id,
      videoKey: r.videoKey,
      videoId: r.videoId || undefined,
      youtubeVideoId: r.youtubeVideoId || undefined,
      videoTitle: r.videoTitle,
      channelTitle: r.channelTitle,
      thumbnailUrl: r.thumbnailUrl,
      sourceType: (r.sourceType as 'YOUTUBE' | 'DIRECT') || 'YOUTUBE',
      sourceUrl: r.sourceUrl,
      parentId: r.parentId,
      parentName: r.parentName,
      rating: r.rating as ParentSafetyRating,
      comment: r.comment,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));
  }

  public async getParentCuratorAdvisoryLists(): Promise<{
    recommended: AdvisoryVideoEntry[];
    caution: AdvisoryVideoEntry[];
  }> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM video_parent_reviews ORDER BY updatedAt DESC'
    );
    const byKey = new Map<string, AdvisoryVideoEntry>();
    for (const r of rows) {
      const review: VideoParentReview = {
        id: r.id,
        videoKey: r.videoKey,
        videoId: r.videoId || undefined,
        youtubeVideoId: r.youtubeVideoId || undefined,
        videoTitle: r.videoTitle,
        channelTitle: r.channelTitle,
        thumbnailUrl: r.thumbnailUrl,
        sourceType: (r.sourceType as 'YOUTUBE' | 'DIRECT') || 'YOUTUBE',
        sourceUrl: r.sourceUrl,
        parentId: r.parentId,
        parentName: r.parentName,
        rating: r.rating as ParentSafetyRating,
        comment: r.comment,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      };
      let entry = byKey.get(review.videoKey);
      if (!entry) {
        entry = {
          videoKey: review.videoKey,
          videoId: review.videoId,
          youtubeVideoId: review.youtubeVideoId,
          videoTitle: review.videoTitle,
          channelTitle: review.channelTitle,
          thumbnailUrl: review.thumbnailUrl,
          sourceType: review.sourceType,
          sourceUrl: review.sourceUrl,
          recommendedCount: 0,
          cautionCount: 0,
          reviews: [],
          updatedAt: review.updatedAt
        };
        byKey.set(review.videoKey, entry);
      }
      if (review.rating === 'RECOMMENDED') entry.recommendedCount += 1;
      if (review.rating === 'CAUTION') entry.cautionCount += 1;
      entry.reviews.push(review);
      if (review.updatedAt > entry.updatedAt) entry.updatedAt = review.updatedAt;
    }

    const all = Array.from(byKey.values());
    const recommended = all
      .filter((e) => e.recommendedCount > 0 && e.recommendedCount >= e.cautionCount)
      .sort((a, b) => b.recommendedCount - a.recommendedCount || b.updatedAt.localeCompare(a.updatedAt));
    const caution = all
      .filter((e) => e.cautionCount > 0)
      .sort((a, b) => b.cautionCount - a.cautionCount || b.updatedAt.localeCompare(a.updatedAt));

    return { recommended, caution };
  }

  // --- Referrals & 3-Month Family Pass Vouchers ---
  public async getUserByReferralCode(code: string): Promise<User | undefined> {
    const clean = String(code || '').trim().toUpperCase();
    if (!clean) return undefined;
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM users WHERE UPPER(TRIM(referralCode)) = ? LIMIT 1',
      [clean]
    );
    if (rows.length === 0) return undefined;
    return mapUserRow(rows[0]);
  }

  public async generateUniqueReferralCode(seedName?: string): Promise<string> {
    const prefix = String(seedName || 'FAMI')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 4) || 'FAMI';
    for (let attempt = 0; attempt < 10; attempt++) {
      const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 5).toUpperCase();
      const candidate = `${prefix}-${rand}`;
      const existing = await this.getUserByReferralCode(candidate);
      if (!existing) return candidate;
    }
    return `FAMI-${crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
  }

  public async ensureParentReferralCode(userId: string): Promise<string> {
    const user = await this.getUserById(userId);
    if (user?.referralCode) return user.referralCode;
    const code = await this.generateUniqueReferralCode(user?.name);
    await this.pool.query('UPDATE users SET referralCode = ? WHERE id = ?', [code, userId]);
    return code;
  }

  public async createFamilyPassVoucher(voucher: FamilyPassVoucher): Promise<FamilyPassVoucher> {
    await this.pool.query(
      `INSERT INTO family_pass_vouchers
        (id, userId, code, durationMonths, source, referralCodeUsed, referrerUserId, status, expiresAt, redeemedAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        voucher.id,
        voucher.userId,
        voucher.code,
        voucher.durationMonths,
        voucher.source,
        voucher.referralCodeUsed || null,
        voucher.referrerUserId || null,
        voucher.status,
        voucher.expiresAt ?? null,
        voucher.redeemedAt ?? null,
        voucher.createdAt
      ]
    );
    return voucher;
  }

  public async getVouchersByUserId(userId: string): Promise<FamilyPassVoucher[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM family_pass_vouchers WHERE userId = ? ORDER BY createdAt DESC',
      [userId]
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      code: r.code,
      durationMonths: Number(r.durationMonths) || 3,
      source: (r.source as 'REFERRAL' | 'PROMO') || 'REFERRAL',
      referralCodeUsed: r.referralCodeUsed || undefined,
      referrerUserId: r.referrerUserId || undefined,
      status: (r.status as 'AVAILABLE' | 'REDEEMED') || 'AVAILABLE',
      expiresAt: r.expiresAt || null,
      redeemedAt: r.redeemedAt || null,
      createdAt: r.createdAt
    }));
  }

  public async redeemFamilyPassVoucher(
    userId: string,
    voucherId: string
  ): Promise<{ voucher: FamilyPassVoucher; user: User } | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT * FROM family_pass_vouchers WHERE id = ? AND userId = ? LIMIT 1',
      [voucherId, userId]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    if (row.status !== 'AVAILABLE') {
      return null;
    }

    const user = await this.getUserById(userId);
    if (!user) return null;

    const nowMs = Date.now();
    const currentExpiresMs = user.planExpiresAt ? Date.parse(user.planExpiresAt) : 0;
    const baseDate = new Date(
      user.plan === 'PREMIUM' && !Number.isNaN(currentExpiresMs) && currentExpiresMs > nowMs
        ? currentExpiresMs
        : nowMs
    );
    const months = Number(row.durationMonths) || 3;
    baseDate.setUTCMonth(baseDate.getUTCMonth() + months);
    const newExpiresAt = baseDate.toISOString();
    const nowIso = new Date(nowMs).toISOString();

    await this.pool.query(
      "UPDATE family_pass_vouchers SET status = 'REDEEMED', redeemedAt = ? WHERE id = ? AND userId = ?",
      [nowIso, voucherId, userId]
    );
    await this.pool.query(
      "UPDATE users SET plan = 'PREMIUM', planExpiresAt = ? WHERE id = ?",
      [newExpiresAt, userId]
    );

    const updatedUser = (await this.getUserById(userId))!;
    const updatedVouchers = await this.getVouchersByUserId(userId);
    const updatedVoucher = updatedVouchers.find((v) => v.id === voucherId)!;
    return { voucher: updatedVoucher, user: updatedUser };
  }

  public async getReferralStatsForUser(userId: string): Promise<{
    referralCode: string;
    referredUsers: Array<{ id: string; name: string; email: string; createdAt: string }>;
  }> {
    const referralCode = await this.ensureParentReferralCode(userId);
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT id, name, email, createdAt FROM users WHERE referredByUserId = ? ORDER BY createdAt DESC',
      [userId]
    );
    return {
      referralCode,
      referredUsers: rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        createdAt: r.createdAt
      }))
    };
  }
}

export const db = new Database();
