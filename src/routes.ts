import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';
import {
  AuthenticatedRequest,
  GoogleUserProfile,
  exchangeGoogleAuthCode,
  getGoogleClientId,
  hashPassword,
  optionalAuth,
  requireAuth,
  requireParent,
  sendParentVideoRequestEmail,
  sendVerificationEmail,
  signAuthToken,
  signGoogleOAuthState,
  signMobileOAuthState,
  signVideoRequestActionToken,
  verifyGoogleAccessToken,
  verifyGoogleIdToken,
  verifyGoogleOAuthState,
  verifyMobileOAuthState,
  verifyPassword,
  verifyVideoRequestActionToken,
  verifyVideoRequestDecisionToken
} from './auth.js';
import {
  buildToddlerWeeklyChannelLoops,
  DEFAULT_TODDLER_ENABLED_TOPICS,
  extractYouTubeId,
  fetchYouTubeOEmbed,
  getYouTubeThumbnail,
  searchYouTubeVideos,
  searchYouTubeChannels,
  resolveGeoForSearch,
  deriveAgeRatingFromBirthday,
  fetchYouTubeChannelInfo,
  fetchYouTubePlaylistVideos,
  isCategoryAllowedForAge,
  normalizeReligion,
  resolveVideoCategories
} from './utils.js';
import { PARENT_FILTER_PRESETS, TAG_TAXONOMY, parseTagList } from './tags.js';
import { buildPremiumRequiredPayload, getEntitlementsForPlan, resolveUserPlan } from './entitlements.js';
import {
  Video,
  AgeRating,
  ContentLanguage,
  CultureMode,
  ToddlerSubStage,
  Channel,
  ChannelVisibility,
  PermissionPreset,
  ChannelPermissions,
  PERMISSION_PRESETS,
  ChannelInvite,
  ChannelSuggestion,
  ChannelVideoComment,
  Playlist,
  ChannelType,
  PlanTier,
  ParentalControls,
  ParentalControlsOverride,
  User,
  StoryBook,
  StoryPage,
  StoryLanguage,
  StoryReadingMode,
  StoryAgeRating
} from './types.js';

function normalizeContentLanguage(val: unknown, fallback: ContentLanguage = 'all'): ContentLanguage {
  const s = String(val || '').trim().toLowerCase();
  if (s === 'all' || s === 'en' || s === 'id' || s === 'bilingual') return s as ContentLanguage;
  return fallback;
}

function normalizeCultureMode(val: unknown, fallback: CultureMode = 'GLOBAL'): CultureMode {
  const s = String(val || '').trim().toUpperCase();
  if (s === 'GLOBAL' || s === 'ID') return s;
  return fallback;
}

function normalizeToddlerSubStage(val: unknown, fallback: ToddlerSubStage = 'AUTO'): ToddlerSubStage {
  const s = String(val || '').trim().toUpperCase();
  if (s === 'AUTO' || s === 'EARLY' || s === 'OLDER') return s;
  return fallback;
}

function getGlobalParentalControls(parent?: User): ParentalControls {
  const ageRating = parent?.ageRating || 'ALL';
  return {
    parentPin: parent?.parentPin || '1234',
    dailyLimitMinutes: parent?.dailyLimitMinutes ?? 45,
    ageRating,
    attentionTrackingEnabled: false,
    attentionPauseSeconds: parent?.attentionPauseSeconds ?? 30,
    attentionMinWatchPercent: parent?.attentionMinWatchPercent ?? 70,
    youtubeSearchEnabled: parent?.youtubeSearchEnabled !== false,
    searchViewLimit: parent?.searchViewLimit ?? 0,
    searchRequireApproval: parent?.searchRequireApproval !== false,
    contentLanguage: normalizeContentLanguage(parent?.contentLanguage, 'all'),
    cultureMode: normalizeCultureMode(parent?.cultureMode, 'GLOBAL'),
    toddlerLoopMinutes: parent?.toddlerLoopMinutes ?? 15,
    toddlerCooldownMinutes: parent?.toddlerCooldownMinutes ?? 30,
    toddlerSubStage: normalizeToddlerSubStage(parent?.toddlerSubStage, 'AUTO'),
    toddlerEnabledTopics:
      Array.isArray(parent?.toddlerEnabledTopics) && parent.toddlerEnabledTopics.length > 0
        ? parent.toddlerEnabledTopics
        : [...DEFAULT_TODDLER_ENABLED_TOPICS],
    toddlerHiddenVideoIds: Array.isArray(parent?.toddlerHiddenVideoIds) ? parent.toddlerHiddenVideoIds : [],
    religion: normalizeReligion(parent?.religion) || null
  };
}

function resolveEffectiveParentalControls(parent: User | undefined, child: User): ParentalControls {
  const global = getGlobalParentalControls(parent);
  const ov = child.parentalOverride || {};
  const effectiveAgeRating = ov.ageRating ?? child.ageRating ?? global.ageRating;
  const isToddler = effectiveAgeRating === 'TODDLER';
  return {
    parentPin: ov.parentPin ?? global.parentPin,
    dailyLimitMinutes: ov.dailyLimitMinutes ?? global.dailyLimitMinutes,
    ageRating: effectiveAgeRating,
    attentionTrackingEnabled: ov.attentionTrackingEnabled ?? global.attentionTrackingEnabled,
    attentionPauseSeconds: ov.attentionPauseSeconds ?? global.attentionPauseSeconds,
    attentionMinWatchPercent: ov.attentionMinWatchPercent ?? global.attentionMinWatchPercent,
    youtubeSearchEnabled: isToddler ? false : (ov.youtubeSearchEnabled ?? global.youtubeSearchEnabled),
    searchViewLimit: ov.searchViewLimit ?? global.searchViewLimit,
    searchRequireApproval: ov.searchRequireApproval ?? global.searchRequireApproval,
    contentLanguage: ov.contentLanguage ?? global.contentLanguage,
    cultureMode: ov.cultureMode ?? global.cultureMode,
    toddlerLoopMinutes: ov.toddlerLoopMinutes ?? child.toddlerLoopMinutes ?? global.toddlerLoopMinutes,
    toddlerCooldownMinutes: ov.toddlerCooldownMinutes ?? child.toddlerCooldownMinutes ?? global.toddlerCooldownMinutes,
    toddlerSubStage: ov.toddlerSubStage ?? child.toddlerSubStage ?? global.toddlerSubStage,
    toddlerEnabledTopics:
      ov.toddlerEnabledTopics ?? child.toddlerEnabledTopics ?? global.toddlerEnabledTopics,
    toddlerHiddenVideoIds:
      ov.toddlerHiddenVideoIds ?? child.toddlerHiddenVideoIds ?? global.toddlerHiddenVideoIds,
    religion: ov.religion !== undefined ? normalizeReligion(ov.religion) : (normalizeReligion(child.religion) ?? normalizeReligion(global.religion) ?? null)
  };
}

function formatChildResponse(parent: User | undefined, child: User) {
  const effective = resolveEffectiveParentalControls(parent, child);
  return {
    id: child.id,
    email: child.email,
    name: child.name,
    role: child.role,
    birthday: child.birthday || null,
    ageRating: effective.ageRating,
    religion: effective.religion || null,
    youtubeSearchEnabled: effective.youtubeSearchEnabled,
    searchViewLimit: effective.searchViewLimit,
    searchViewsUsed: child.searchViewsUsed ?? 0,
    searchRequireApproval: effective.searchRequireApproval,
    parentPin: effective.parentPin,
    dailyLimitMinutes: effective.dailyLimitMinutes,
    attentionTrackingEnabled: effective.attentionTrackingEnabled,
    attentionPauseSeconds: effective.attentionPauseSeconds,
    attentionMinWatchPercent: effective.attentionMinWatchPercent,
    contentLanguage: effective.contentLanguage,
    cultureMode: effective.cultureMode,
    toddlerLoopMinutes: effective.toddlerLoopMinutes,
    toddlerCooldownMinutes: effective.toddlerCooldownMinutes,
    toddlerSubStage: effective.toddlerSubStage,
    toddlerEnabledTopics: effective.toddlerEnabledTopics,
    toddlerHiddenVideoIds: effective.toddlerHiddenVideoIds,
    toddlerCooldownUntil: child.toddlerCooldownUntil || null,
    overrides: child.parentalOverride || {},
    createdAt: child.createdAt
  };
}

function resolvePermissionsInput(
  presetInput?: unknown,
  customPermissions?: Partial<ChannelPermissions>
): { preset: PermissionPreset; permissions: ChannelPermissions } {
  const validPresets: PermissionPreset[] = [
    'VIEWER',
    'COMMENTER',
    'SUGGESTER',
    'CONTRIBUTOR',
    'CUSTOM'
  ];
  const preset: PermissionPreset = validPresets.includes(presetInput as PermissionPreset)
    ? (presetInput as PermissionPreset)
    : 'SUGGESTER';

  const base =
    preset !== 'CUSTOM' ? PERMISSION_PRESETS[preset] : PERMISSION_PRESETS.VIEWER;

  const permissions: ChannelPermissions = {
    canAddVideo:
      typeof customPermissions?.canAddVideo === 'boolean'
        ? customPermissions.canAddVideo
        : base.canAddVideo,
    canSuggestVideo:
      typeof customPermissions?.canSuggestVideo === 'boolean'
        ? customPermissions.canSuggestVideo
        : base.canSuggestVideo,
    canComment:
      typeof customPermissions?.canComment === 'boolean'
        ? customPermissions.canComment
        : base.canComment
  };

  return { preset, permissions };
}

export const apiRouter = Router();

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// ==========================================
// CLIENT APP APIS (Android App Consumption)
// ==========================================

// Get canonical tag taxonomy and parent filter presets
apiRouter.get('/tags/taxonomy', (_req, res) => {
  res.json({
    success: true,
    data: {
      categories: TAG_TAXONOMY,
      presets: PARENT_FILTER_PRESETS
    }
  });
});

// Get list of approved videos with optional filters
apiRouter.get(
  '/videos',
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const {
      category,
      channelId,
      ageRating,
      search,
      featured,
      tags,
      includeTags,
      anyTags,
      excludeTags,
      preset,
      presets,
      religion,
      childId
    } = req.query;

    let childReligion: string | null | undefined = undefined;
    if (religion !== undefined) {
      childReligion = normalizeReligion(religion);
    } else if (childId) {
      const targetChild = await db.getUserById(String(childId));
      if (targetChild && targetChild.role === 'CHILD') {
        const parentUser = targetChild.parentId ? await db.getUserById(targetChild.parentId) : undefined;
        const effective = resolveEffectiveParentalControls(parentUser, targetChild);
        childReligion = effective.religion || null;
      }
    } else if (req.user?.sub) {
      const requestingUser = await db.getUserById(req.user.sub);
      if (requestingUser?.role === 'CHILD') {
        const parentUser = requestingUser.parentId ? await db.getUserById(requestingUser.parentId) : undefined;
        const effective = resolveEffectiveParentalControls(parentUser, requestingUser);
        childReligion = effective.religion || null;
      }
    }

    const resolvedIncludeTags = parseTagList(includeTags ?? tags);
    const resolvedAnyTags = parseTagList(anyTags);
    const resolvedExcludeTags = parseTagList(excludeTags);
    const resolvedPresetIds = parseTagList(presets ?? preset).map((p) => p.toLowerCase());

    const videos = await db.getVideos({
      category: category ? String(category) : undefined,
      channelId: channelId ? String(channelId) : undefined,
      ageRating: ageRating ? String(ageRating) : undefined,
      search: search ? String(search) : undefined,
      featured: featured !== undefined ? featured === 'true' : undefined,
      onlyApproved: true,
      includeTags: resolvedIncludeTags.length > 0 ? resolvedIncludeTags : undefined,
      anyTags: resolvedAnyTags.length > 0 ? resolvedAnyTags : undefined,
      excludeTags: resolvedExcludeTags.length > 0 ? resolvedExcludeTags : undefined,
      presetIds: resolvedPresetIds.length > 0 ? resolvedPresetIds : undefined,
      childReligion
    });

    res.json({
      success: true,
      count: videos.length,
      data: videos
    });
  })
);

// Get single video details and increment view count
apiRouter.get(
  '/videos/:id',
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const video = await db.getVideoById(id);

    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    await db.incrementViews(id);

    if (req.user?.sub) {
      try {
        const key = video.youtubeVideoId || video.id;
        await db.upsertKidHistory({
          id: `hist-${req.user.sub}-${key}`,
          kidId: req.user.sub,
          itemKey: key,
          youtubeVideoId: video.youtubeVideoId,
          videoId: video.id,
          title: video.title,
          channelTitle: video.channelTitle || 'FamiTube',
          thumbnailUrl: video.thumbnailUrl,
          sourceType: video.sourceType,
          sourceUrl: video.sourceUrl,
          isApprovedSearch: false,
          watchedAt: new Date().toISOString()
        });
      } catch {
        // Non-fatal history logging
      }
    }

    const videoCats = video.categories?.length
      ? video.categories
      : resolveVideoCategories(video.tags, video.category);
    const related = (await db.getVideos({ onlyApproved: true }))
      .filter((v) => {
        if (v.id === id) return false;
        const cats = v.categories?.length ? v.categories : resolveVideoCategories(v.tags, v.category);
        return cats.some((cat) => videoCats.includes(cat));
      })
      .slice(0, 4);

    res.json({
      success: true,
      data: {
        ...video,
        views: video.views + 1,
        relatedVideos: related
      }
    });
  })
);

// Get Categories
apiRouter.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const ageRating = req.query.ageRating ? String(req.query.ageRating) : undefined;
    const categories = await db.getCategories(ageRating);
    res.json({ success: true, data: categories });
  })
);

// Get Channels (public channels for client app)
apiRouter.get(
  '/channels',
  asyncHandler(async (req, res) => {
    const ageRating = req.query.ageRating ? String(req.query.ageRating) : undefined;
    const channels = await db.getChannels({ onlyPublic: true, ageRating });
    res.json({ success: true, data: channels });
  })
);

// Get Channel details, its videos, and live schedule state (if LIVE_TV)
apiRouter.get(
  '/channels/:id',
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const access = await db.getChannelAccess(id, req.user?.sub);

    if (!access) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }

    if (!access.canView) {
      return res.status(403).json({ success: false, message: 'This channel is private' });
    }

    const queryAgeRating = req.query.ageRating ? String(req.query.ageRating) : undefined;
    let effectiveAgeRating = queryAgeRating && queryAgeRating !== 'ALL' ? queryAgeRating : undefined;
    if (!effectiveAgeRating && req.user?.role === 'CHILD') {
      const childUser = await db.getUserById(req.user.sub);
      effectiveAgeRating =
        !childUser?.ageRating || childUser.ageRating === 'ALL' ? 'OLDER_KIDS' : childUser.ageRating;
    }

    const videos = await db.getChannelVideos(id, effectiveAgeRating);
    const liveState =
      access.channel.channelType === 'LIVE_TV' ? await db.getLiveChannelState(id) : null;

    res.json({
      success: true,
      data: {
        channel: access.channel,
        videos,
        liveState,
        permissions: access.permissions
      }
    });
  })
);

// Get Live TV Schedule State (current video, exact second offset, up next)
apiRouter.get(
  '/channels/:id/live',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const liveState = await db.getLiveChannelState(id);

    if (!liveState) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }

    res.json({
      success: true,
      data: liveState
    });
  })
);

// Get Playlists
apiRouter.get(
  '/playlists',
  asyncHandler(async (_req, res) => {
    const playlists = await db.getPlaylists();
    res.json({ success: true, data: playlists });
  })
);

// Get Playlist with resolved videos
apiRouter.get(
  '/playlists/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const playlist = await db.getPlaylistById(id);

    if (!playlist) {
      return res.status(404).json({ success: false, message: 'Playlist not found' });
    }

    const resolved = await Promise.all(playlist.videoIds.map((vidId) => db.getVideoById(vidId)));
    const videos = resolved.filter((v): v is Video => !!v && v.isApproved);

    res.json({
      success: true,
      data: {
        playlist,
        videos
      }
    });
  })
);

// Get App Configuration
apiRouter.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const config = await db.getConfig();
    res.json({
      success: true,
      data: {
        ...config,
        googleClientId: getGoogleClientId()
      }
    });
  })
);

// ==========================================
// AUTHENTICATION APIS (Curator Login & Email Verification)
// ==========================================

apiRouter.post(
  '/auth/register',
  asyncHandler(async (req, res) => {
    const { email, password, name, referralCode } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(name || cleanEmail.split('@')[0] || '').trim();
    const cleanReferralCode = String(referralCode || '').trim().toUpperCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid email is required' });
    }
    if (!password || String(password).length < 6) {
      return res
        .status(400)
        .json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const existing = await db.getUserByEmail(cleanEmail);
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email is already registered' });
    }

    let referrerUser: User | undefined;
    if (cleanReferralCode) {
      referrerUser = await db.getUserByReferralCode(cleanReferralCode);
      if (!referrerUser) {
        return res.status(400).json({
          success: false,
          message: 'Invalid referral code. Please check the code or leave it blank.'
        });
      }
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const newParentReferralCode = await db.generateUniqueReferralCode(cleanName || 'Parent');
    const nowIso = new Date().toISOString();

    const user = await db.createUser({
      id: `usr-${uuidv4().slice(0, 8)}`,
      email: cleanEmail,
      name: cleanName || 'Parent',
      passwordHash: hashPassword(String(password)),
      role: 'PARENT',
      referralCode: newParentReferralCode,
      referredByUserId: referrerUser?.id,
      referredByCode: referrerUser?.referralCode,
      isVerified: false,
      verificationToken,
      verificationExpiresAt,
      createdAt: nowIso
    });

    if (referrerUser) {
      await db.createFamilyPassVoucher({
        id: `fpv-${uuidv4().slice(0, 8)}`,
        userId: user.id,
        code: `FP3M-${uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase()}`,
        durationMonths: 3,
        source: 'REFERRAL',
        referralCodeUsed: referrerUser.referralCode,
        referrerUserId: referrerUser.id,
        status: 'AVAILABLE',
        expiresAt: null, // No expiration Ã¢â‚¬â€ usable anytime
        redeemedAt: null,
        createdAt: nowIso
      });
    }

    try {
      await sendVerificationEmail(user.email, user.name, verificationToken);
    } catch (mailErr) {
      console.warn('Failed to send verification email during registration:', mailErr);
    }

    res.status(201).json({
      success: true,
      referralApplied: Boolean(referrerUser),
      message: referrerUser
        ? 'Registration successful! Your 3-month Family Pass voucher (no expiration) is waiting in your account. Please verify your email before logging in.'
        : 'Registration successful! Please check your email to verify your account before logging in.'
    });
  })
);

apiRouter.get(
  '/auth/verify-email',
  asyncHandler(async (req, res) => {
    const token = String(req.query.token || '').trim();
    const webUrl = process.env.WEB_APP_URL || 'http://localhost:3000';
    const wantsHtml = (req.headers.accept || '').includes('text/html');

    const sendResult = (ok: boolean, status: number, message: string) => {
      if (wantsHtml) {
        return res.status(status).send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>FamiTube Email Verification</title>
<style>body{font-family:Arial,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
.card{background:#1e293b;padding:32px;border-radius:16px;max-width:440px;text-align:center;border:1px solid #334155;}
a.btn{display:inline-block;margin-top:16px;padding:10px 20px;background:#ff3366;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;}</style>
</head><body><div class="card"><h2>${ok ? 'Email Verified!' : 'Verification Failed'}</h2><p>${message}</p><a class="btn" href="${webUrl}">Go to FamiTube Studio</a></div></body></html>`);
      }
      return res.status(status).json({ success: ok, message });
    };

    if (!token) {
      return sendResult(false, 400, 'Verification token is missing.');
    }

    const user = await db.getUserByVerificationToken(token);
    if (!user) {
      return sendResult(false, 400, 'Invalid or already-used verification token.');
    }

    if (user.verificationExpiresAt && new Date(user.verificationExpiresAt).getTime() < Date.now()) {
      return sendResult(false, 400, 'Verification token has expired. Please request a new one.');
    }

    await db.markUserVerified(user.id);
    return sendResult(true, 200, 'Your email has been verified. You can now sign in to FamiTube Studio.');
  })
);

apiRouter.post(
  '/auth/resend-verification',
  asyncHandler(async (req, res) => {
    const cleanEmail = String(req.body.email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await db.getUserByEmail(cleanEmail);
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found with that email' });
    }
    if (user.isVerified) {
      return res.json({ success: true, message: 'Account is already verified. You can log in.' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db.updateUserVerificationToken(user.id, verificationToken, verificationExpiresAt);
    try {
      await sendVerificationEmail(user.email, user.name, verificationToken);
    } catch (mailErr) {
      console.warn('Failed to send verification email during registration:', mailErr);
    }

    res.json({
      success: true,
      message: 'Verification email resent. Please check your inbox.'
    });
  })
);

apiRouter.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const cleanEmail = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const loginType = req.body.loginType ? String(req.body.loginType).toUpperCase() : undefined;

    if (!cleanEmail || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await db.getUserByEmail(cleanEmail);
    if (!user) {
      if (loginType === 'CHILD') {
        return res.status(401).json({
          success: false,
          message: 'This email is not registered. Ask your parent or guardian to register your email in FamiTube Studio first.'
        });
      }
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const userRole = user.role || 'PARENT';
    if (loginType === 'CHILD' && userRole !== 'CHILD') {
      return res.status(403).json({
        success: false,
        message: 'This is a Parent account. Please switch to Parent Login.'
      });
    }
    if (loginType === 'CHILD' && !user.parentId) {
      return res.status(403).json({
        success: false,
        message: 'This child account is not linked to a parent or guardian.'
      });
    }
    if (loginType === 'PARENT' && userRole !== 'PARENT') {
      return res.status(403).json({
        success: false,
        message: 'Curator Studio is only accessible by parent accounts. Kids must sign in on the Kids Login page.'
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        needsVerification: true,
        message: 'Please verify your email address before logging in.'
      });
    }

    const token = signAuthToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: userRole,
      parentId: user.parentId
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: userRole,
        parentId: user.parentId,
        ageRating: user.ageRating,
        isVerified: user.isVerified,
        youtubeSearchEnabled: Boolean(user.youtubeSearchEnabled),
        searchViewLimit: user.searchViewLimit ?? 0,
        searchViewsUsed: user.searchViewsUsed ?? 0,
        searchRequireApproval: user.searchRequireApproval !== false
      }
    });
  })
);

async function authenticateGoogleAccount(
  googleProfile: GoogleUserProfile,
  loginType?: string
): Promise<
  | {
      ok: true;
      status: number;
      token: string;
      user: Record<string, unknown>;
    }
  | {
      ok: false;
      status: number;
      message: string;
    }
> {
  const requestedRole = String(loginType || 'PARENT').toUpperCase() === 'CHILD' ? 'CHILD' : 'PARENT';
  const cleanEmail = googleProfile.email.trim().toLowerCase();
  let user = await db.getUserByEmail(cleanEmail);

  if (requestedRole === 'CHILD') {
    if (!user) {
      return {
        ok: false,
        status: 401,
        message:
          'This email is not registered. Ask your parent or guardian to register your email in FamiTube Studio first.'
      };
    }
    const userRole = user.role || 'PARENT';
    if (userRole !== 'CHILD') {
      return {
        ok: false,
        status: 403,
        message: 'This is a Parent account. Please switch to Parent Login.'
      };
    }
    if (!user.parentId) {
      return {
        ok: false,
        status: 403,
        message: 'This child account is not linked to a parent or guardian.'
      };
    }
    if (!user.isVerified) {
      await db.markUserVerified(user.id);
      user.isVerified = true;
    }
  } else {
    if (!user) {
      const randomPassword = crypto.randomBytes(32).toString('hex');
      user = await db.createUser({
        id: `usr-${uuidv4().slice(0, 8)}`,
        email: cleanEmail,
        name: googleProfile.name || cleanEmail.split('@')[0] || 'Parent',
        passwordHash: hashPassword(randomPassword),
        role: 'PARENT',
        isVerified: true,
        createdAt: new Date().toISOString()
      });
    } else {
      const userRole = user.role || 'PARENT';
      if (userRole !== 'PARENT') {
        return {
          ok: false,
          status: 403,
          message:
            'Curator Studio is only accessible by parent accounts. Kids must sign in on the Kids Login page.'
        };
      }
      if (!user.isVerified) {
        await db.markUserVerified(user.id);
        user.isVerified = true;
      }
    }
  }

  const userRole = user.role || 'PARENT';
  const token = signAuthToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: userRole,
    parentId: user.parentId
  });

  return {
    ok: true,
    status: 200,
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: userRole,
      parentId: user.parentId,
      ageRating: user.ageRating,
      isVerified: user.isVerified,
      youtubeSearchEnabled: Boolean(user.youtubeSearchEnabled),
      searchViewLimit: user.searchViewLimit ?? 0,
      searchViewsUsed: user.searchViewsUsed ?? 0,
      searchRequireApproval: user.searchRequireApproval !== false
    }
  };
}

apiRouter.get('/auth/google/config', (_req, res) => {
  res.json({
    success: true,
    clientId: getGoogleClientId()
  });
});

apiRouter.post(
  '/auth/google',
  asyncHandler(async (req, res) => {
    const { credential, idToken, accessToken, code, redirectUri, loginType } = req.body || {};

    let profile: GoogleUserProfile;
    try {
      if (credential || idToken) {
        profile = await verifyGoogleIdToken(String(credential || idToken));
      } else if (accessToken) {
        profile = await verifyGoogleAccessToken(String(accessToken));
      } else if (code) {
        const apiBase = (process.env.APP_BASE_URL || 'https://famitube-api.gamantha.my.id').replace(
          /\/+$/,
          ''
        );
        const resolvedRedirect = redirectUri
          ? String(redirectUri)
          : `${apiBase}/api/auth/google/callback`;
        profile = await exchangeGoogleAuthCode(String(code), resolvedRedirect);
      } else {
        return res.status(400).json({
          success: false,
          message: 'Google credential, accessToken, or authorization code is required'
        });
      }
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: err instanceof Error ? err.message : 'Google authentication failed'
      });
    }

    const result = await authenticateGoogleAccount(profile, loginType);
    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        message: result.message
      });
    }

    res.json({
      success: true,
      token: result.token,
      user: result.user
    });
  })
);

apiRouter.get('/auth/google', (req, res) => {
  const loginType =
    String(req.query.loginType || 'PARENT').toUpperCase() === 'CHILD' ? 'CHILD' : 'PARENT';
  const redirectOrigin = req.query.redirectOrigin ? String(req.query.redirectOrigin) : undefined;
  const apiBase = (process.env.APP_BASE_URL || 'https://famitube-api.gamantha.my.id').replace(
    /\/+$/,
    ''
  );
  const callbackUrl = `${apiBase}/api/auth/google/callback`;
  const state = signGoogleOAuthState({ loginType, redirectOrigin });

  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

apiRouter.get(
  '/auth/google/callback',
  asyncHandler(async (req, res) => {
    const code = String(req.query.code || '').trim();
    const stateRaw = String(req.query.state || '').trim();
    const errorParam = String(req.query.error || '').trim();

    let loginType: 'PARENT' | 'CHILD' = 'PARENT';
    let webBase = (process.env.WEB_APP_URL || 'https://famitube.gamantha.my.id').replace(/\/+$/, '');

    if (stateRaw) {
      try {
        const stateDecoded = verifyGoogleOAuthState(stateRaw);
        loginType = stateDecoded.loginType === 'CHILD' ? 'CHILD' : 'PARENT';
        if (
          stateDecoded.redirectOrigin &&
          /^https?:\/\//i.test(stateDecoded.redirectOrigin)
        ) {
          webBase = stateDecoded.redirectOrigin.replace(/\/+$/, '');
        }
      } catch {
        // fallback to default webBase and PARENT role
      }
    }

    const redirectWithError = (message: string) => {
      const url = new URL(webBase);
      url.searchParams.set('google_auth_error', message);
      url.searchParams.set('login_role', loginType);
      return res.redirect(url.toString());
    };

    if (errorParam) {
      return redirectWithError(`Google sign-in was cancelled or denied (${errorParam}).`);
    }
    if (!code) {
      return redirectWithError('Missing authorization code from Google.');
    }

    try {
      const apiBase = (process.env.APP_BASE_URL || 'https://famitube-api.gamantha.my.id').replace(
        /\/+$/,
        ''
      );
      const callbackUrl = `${apiBase}/api/auth/google/callback`;
      const profile = await exchangeGoogleAuthCode(code, callbackUrl);
      const result = await authenticateGoogleAccount(profile, loginType);
      if (!result.ok) {
        return redirectWithError(result.message);
      }

      const url = new URL(webBase);
      url.searchParams.set('google_auth_token', result.token);
      return res.redirect(url.toString());
    } catch (err) {
      return redirectWithError(
        err instanceof Error ? err.message : 'Google authentication failed'
      );
    }
  })
);

apiRouter.get(
  '/auth/me',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const dbUser = await db.getUserById(req.user!.sub);
    const entitlements = dbUser ? await db.getEffectiveEntitlements(dbUser) : null;
    res.json({
      success: true,
      user: {
        ...req.user,
        ageRating: dbUser?.ageRating,
        youtubeSearchEnabled: Boolean(dbUser?.youtubeSearchEnabled),
        searchViewLimit: dbUser?.searchViewLimit ?? 0,
        searchViewsUsed: dbUser?.searchViewsUsed ?? 0,
        searchRequireApproval: dbUser?.searchRequireApproval !== false,
        plan: entitlements?.plan ?? 'FREE',
        entitlements
      }
    });
  })
);

apiRouter.get(
  '/subscription/entitlements',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const dbUser = await db.getUserById(req.user!.sub);
    if (!dbUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const entitlements = await db.getEffectiveEntitlements(dbUser);
    res.json({
      success: true,
      data: entitlements
    });
  })
);

apiRouter.post(
  '/subscription/plan',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawPlan = String(req.body?.plan || '').toUpperCase();
    if (rawPlan !== 'FREE' && rawPlan !== 'PREMIUM') {
      return res.status(400).json({ success: false, message: 'plan must be FREE or PREMIUM' });
    }
    const plan = rawPlan as PlanTier;
    const durationDays = req.body?.durationDays !== undefined ? Number(req.body.durationDays) : null;
    const planExpiresAt =
      plan === 'PREMIUM' && durationDays && Number.isFinite(durationDays) && durationDays > 0
        ? new Date(Date.now() + durationDays * 86400 * 1000).toISOString()
        : null;

    const updated = await db.updateUserPlan(req.user!.sub, plan, planExpiresAt);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const entitlements = await db.getEffectiveEntitlements(updated);
    res.json({
      success: true,
      data: entitlements
    });
  })
);

apiRouter.get(
  '/auth/google/mobile/start',
  asyncHandler(async (req, res) => {
    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) {
      return res.status(503).send(
        '<html><body style="font-family:sans-serif;padding:24px;"><h2>Google OAuth Not Configured</h2><p>Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the FamiTube backend server.</p></body></html>'
      );
    }

    const baseUrl = (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    const redirectUri = `${baseUrl}/api/auth/google/mobile/callback`;
    const state = signMobileOAuthState();

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      prompt: 'select_account',
      state
    });

    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  })
);

apiRouter.get(
  '/auth/google/mobile/callback',
  asyncHandler(async (req, res) => {
    const callbackScheme = 'famitube://auth-callback';
    const failRedirect = (message: string) =>
      res.redirect(`${callbackScheme}?error=${encodeURIComponent(message)}`);

    const errorParam = String(req.query.error || '').trim();
    if (errorParam) {
      return failRedirect('Google sign-in was cancelled or denied.');
    }

    const code = String(req.query.code || '').trim();
    const state = String(req.query.state || '').trim();
    if (!code || !state || !verifyMobileOAuthState(state)) {
      return failRedirect('Invalid or expired Google OAuth session.');
    }

    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) {
      return failRedirect('Google OAuth is not configured on the server.');
    }

    const baseUrl = (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    const redirectUri = `${baseUrl}/api/auth/google/mobile/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }).toString()
    });
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenRes.ok || !tokenJson.access_token) {
      return failRedirect('Failed to exchange Google authorization code.');
    }

    const userInfoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` }
    });
    const profile = (await userInfoRes.json()) as { email?: string; email_verified?: boolean; name?: string };
    const cleanEmail = String(profile.email || '').trim().toLowerCase();
    if (!userInfoRes.ok || !cleanEmail || profile.email_verified === false) {
      return failRedirect('Google account email could not be verified.');
    }

    const user = await db.getUserByEmail(cleanEmail);
    if (!user) {
      return failRedirect('This Gmail account is not registered by a parent or guardian.');
    }
    if (!user.isVerified) {
      return failRedirect('Please verify your email address before signing in.');
    }

    const token = signAuthToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'PARENT',
      parentId: user.parentId
    });

    return res.redirect(`${callbackScheme}?token=${encodeURIComponent(token)}`);
  })
);

// ==========================================
// ADMIN APIS (Curator Dashboard - Protected, Parents Only)
// ==========================================

apiRouter.use('/admin', requireAuth, requireParent);

apiRouter.get(
  '/admin/stats',
  asyncHandler(async (_req, res) => {
    const stats = await db.getStats();
    res.json({ success: true, data: stats });
  })
);

apiRouter.get(
  '/admin/videos',
  asyncHandler(async (_req, res) => {
    const videos = await db.getVideos({ onlyApproved: false });
    res.json({ success: true, data: videos });
  })
);

apiRouter.post(
  '/admin/parse-url',
  asyncHandler(async (req, res) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, message: 'URL is required' });
    }

    const youtubeId = extractYouTubeId(url);
    if (youtubeId) {
      const oembed = await fetchYouTubeOEmbed(url);
      return res.json({
        success: true,
        sourceType: 'YOUTUBE',
        youtubeVideoId: youtubeId,
        thumbnailUrl: getYouTubeThumbnail(youtubeId),
        title: oembed?.title || '',
        channelTitle: oembed?.author_name || 'YouTube Creator'
      });
    }

    if (url.match(/\.(mp4|webm|m3u8|mov)($|\?)/i)) {
      return res.json({
        success: true,
        sourceType: 'DIRECT',
        thumbnailUrl: 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=800&h=450&fit=crop',
        title: 'Direct Video Stream',
        channelTitle: 'FamiTube Media'
      });
    }

    return res.json({
      success: true,
      sourceType: 'DIRECT',
      thumbnailUrl: 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=800&h=450&fit=crop',
      title: '',
      channelTitle: 'Curated Creator'
    });
  })
);

// Add new video (and optionally link to an existing channel)
apiRouter.post(
  '/admin/videos',
  asyncHandler(async (req, res) => {
    const {
      title,
      description = '',
      sourceUrl,
      sourceType,
      thumbnailUrl,
      duration = 180,
      channelId,
      channelTitle,
      channelAvatar,
      category = 'Cartoons & Fun',
      ageRating = 'ALL',
      isFeatured = false,
      isApproved = true,
      tags = []
    } = req.body;

    if (!title || !sourceUrl) {
      return res.status(400).json({ success: false, message: 'Title and sourceUrl are required' });
    }

    let finalSourceType = sourceType;
    let ytId: string | undefined = undefined;

    const detectedYtId = extractYouTubeId(sourceUrl);
    if (detectedYtId) {
      finalSourceType = 'YOUTUBE';
      ytId = detectedYtId;
    } else if (!finalSourceType) {
      finalSourceType = 'DIRECT';
    }

    const finalThumb =
      thumbnailUrl ||
      (ytId
        ? getYouTubeThumbnail(ytId)
        : 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=800&h=450&fit=crop');

    const resolvedChannel = channelId ? await db.getChannelById(channelId) : undefined;

    const newVideo: Video = {
      id: `vid-${uuidv4().slice(0, 8)}`,
      title,
      description,
      sourceType: finalSourceType,
      sourceUrl,
      youtubeVideoId: ytId,
      thumbnailUrl: finalThumb,
      duration: Number(duration) || 180,
      channelId: resolvedChannel?.id || channelId || 'chan-kidstube',
      channelTitle: resolvedChannel?.name || channelTitle || 'FamiTube Curators',
      channelAvatar:
        resolvedChannel?.avatarUrl ||
        channelAvatar ||
        'https://images.unsplash.com/photo-1563089145-599997674d42?w=200&h=200&fit=crop',
      category,
      ageRating,
      isFeatured: Boolean(isFeatured),
      isApproved: Boolean(isApproved),
      views: 0,
      tags: Array.isArray(tags)
        ? tags
        : String(tags)
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
      createdAt: new Date().toISOString()
    };

    await db.addVideo(newVideo);
    res.status(201).json({ success: true, data: newVideo });
  })
);

apiRouter.put(
  '/admin/videos/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const updated = await db.updateVideo(id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
    res.json({ success: true, data: updated });
  })
);

apiRouter.delete(
  '/admin/videos/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const deleted = await db.deleteVideo(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
    res.json({ success: true, message: 'Video removed successfully' });
  })
);

// Create Channel (supports ON_DEMAND or LIVE_TV, PUBLIC or PRIVATE)
apiRouter.post(
  '/admin/channels',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const {
      name,
      description,
      avatarUrl,
      bannerUrl,
      category,
      ageRating = 'ALL',
      channelType = 'ON_DEMAND',
      visibility = 'PUBLIC',
      videoIds = []
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Channel name is required' });
    }

    const validType: ChannelType = channelType === 'LIVE_TV' ? 'LIVE_TV' : 'ON_DEMAND';
    const validVisibility: ChannelVisibility = visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC';
    const validRatings: AgeRating[] = ['ALL', 'TODDLER', 'YOUNG_KIDS', 'OLDER_KIDS'];
    const resolvedAgeRating: AgeRating = validRatings.includes(String(ageRating).toUpperCase() as AgeRating)
      ? (String(ageRating).toUpperCase() as AgeRating)
      : 'ALL';

    const newChannel: Channel = {
      id: `chan-${uuidv4().slice(0, 8)}`,
      name,
      description: description || '',
      avatarUrl:
        avatarUrl ||
        'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&h=200&fit=crop',
      bannerUrl: bannerUrl || '',
      category: category || 'Cartoons & Fun',
      ageRating: resolvedAgeRating,
      isVerified: true,
      channelType: validType,
      scheduleStartTime: new Date().toISOString(),
      videoIds: Array.isArray(videoIds) ? videoIds : [],
      ownerId: req.user?.sub || 'usr-team-famitube',
      ownerName: req.user?.name || 'Team FamiTube',
      visibility: validVisibility,
      createdAt: new Date().toISOString()
    };

    await db.addChannel(newChannel);
    res.status(201).json({ success: true, data: newChannel });
  })
);

// Update Channel (Owner only for user-owned channels)
apiRouter.put(
  '/admin/channels/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const existing = await db.getChannelById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (existing.ownerId && existing.ownerId !== req.user?.sub) {
      return res.status(403).json({ success: false, message: 'Only the channel owner can edit this channel' });
    }
    const updated = await db.updateChannel(id, req.body);
    res.json({ success: true, data: updated });
  })
);

// Delete Channel (Owner only for user-owned channels)
apiRouter.delete(
  '/admin/channels/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const existing = await db.getChannelById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (existing.ownerId && existing.ownerId !== req.user?.sub) {
      return res.status(403).json({ success: false, message: 'Only the channel owner can delete this channel' });
    }
    await db.deleteChannel(id);
    res.json({ success: true, message: 'Channel deleted' });
  })
);

// Add a video to a channel (Owner or member with canAddVideo)
apiRouter.post(
  '/admin/channels/:id/videos',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const access = await db.getChannelAccess(id, req.user?.sub);
    if (!access) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (access.channel.ownerId && !access.isOwner && !access.permissions.canAddVideo) {
      return res.status(403).json({ success: false, message: 'You do not have permission to add videos to this channel' });
    }
    const { videoId } = req.body;
    if (!videoId) {
      return res.status(400).json({ success: false, message: 'videoId is required' });
    }
    const updated = await db.addVideoToChannel(id, String(videoId));
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Channel or video not found' });
    }
    res.json({ success: true, data: updated });
  })
);

// Remove a video from a channel (Owner only for user-owned channels)
apiRouter.delete(
  '/admin/channels/:id/videos/:videoId',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const videoId = String(req.params.videoId);
    const existing = await db.getChannelById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (existing.ownerId && existing.ownerId !== req.user?.sub) {
      return res.status(403).json({ success: false, message: 'Only the channel owner can remove videos from this channel' });
    }
    const updated = await db.removeVideoFromChannel(id, videoId);
    res.json({ success: true, data: updated });
  })
);

// Create Playlist
apiRouter.post(
  '/admin/playlists',
  asyncHandler(async (req, res) => {
    const {
      title,
      description,
      thumbnailUrl,
      videoIds = [],
      category = 'Cartoons & Fun',
      ageRating = 'ALL'
    } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: 'Playlist title is required' });
    }
    const newPlaylist: Playlist = {
      id: `pl-${uuidv4().slice(0, 8)}`,
      title,
      description: description || '',
      thumbnailUrl:
        thumbnailUrl ||
        'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&h=350&fit=crop',
      videoIds,
      category,
      ageRating
    };
    await db.addPlaylist(newPlaylist);
    res.status(201).json({ success: true, data: newPlaylist });
  })
);

// Update App Config
apiRouter.put(
  '/admin/config',
  asyncHandler(async (req, res) => {
    const updated = await db.updateConfig(req.body);
    res.json({ success: true, data: updated });
  })
);

// ==========================================
// COLLABORATIVE CHANNELS, INVITES, SUGGESTIONS & COMMENTS
// ==========================================

// List channels visible to the authenticated user (owned + shared + public)
apiRouter.get(
  '/my/channels',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const channels = await db.getChannelsForUser(req.user!.sub);
    res.json({ success: true, data: channels });
  })
);


// Preview / parse YouTube channel metadata and recent videos
apiRouter.post(
  ['/channels/parse-youtube', '/admin/channels/parse-youtube'],
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { url } = req.body || {};
    if (!url || !String(url).trim()) {
      return res.status(400).json({ success: false, message: 'YouTube channel URL or handle is required' });
    }
    const info = await fetchYouTubeChannelInfo(String(url));
    if (!info) {
      return res.status(404).json({ success: false, message: 'Could not resolve YouTube channel from provided URL or handle' });
    }
    res.json({ success: true, data: info });
  })
);

// Import a YouTube channel into FamiTube with curated video ingestion
apiRouter.post(
  ['/channels/import-youtube', '/admin/channels/import-youtube'],
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const {
      url,
      name,
      description,
      avatarUrl,
      category = 'Cartoons & Fun',
      ageRating = 'ALL',
      channelType = 'ON_DEMAND',
      visibility = 'PUBLIC',
      maxVideos = 10,
      autoApproveVideos = true
    } = req.body || {};

    if (!url || !String(url).trim()) {
      return res.status(400).json({ success: false, message: 'YouTube channel URL or handle is required' });
    }

    const info = await fetchYouTubeChannelInfo(String(url));
    if (!info) {
      return res.status(404).json({ success: false, message: 'Could not resolve YouTube channel from provided URL or handle' });
    }

    const channelName = String(name || info.title || 'Curated Channel').trim();
    const channelDesc = String(description || info.description || '').trim();
    const channelAvatar = String(avatarUrl || info.avatarUrl || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&h=200&fit=crop');
    const validType: ChannelType = channelType === 'LIVE_TV' ? 'LIVE_TV' : 'ON_DEMAND';
    const validVisibility: ChannelVisibility = visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC';
    const validRatings: AgeRating[] = ['ALL', 'TODDLER', 'YOUNG_KIDS', 'OLDER_KIDS'];
    const resolvedAgeRating: AgeRating = validRatings.includes(String(ageRating).toUpperCase() as AgeRating)
      ? (String(ageRating).toUpperCase() as AgeRating)
      : 'ALL';

    const channelId = `chan-${uuidv4().slice(0, 8)}`;
    const nowIso = new Date().toISOString();

    const limit = Math.min(Math.max(Number(maxVideos) || 10, 1), 25);
    const candidateVideos = (info.videos || []).slice(0, limit);
    const addedVideoIds: string[] = [];

    for (const v of candidateVideos) {
      const vidId = `vid-${uuidv4().slice(0, 8)}`;
      const videoRecord: Video = {
        id: vidId,
        title: v.title,
        description: v.description || `Video from ${channelName}`,
        sourceType: 'YOUTUBE',
        sourceUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
        youtubeVideoId: v.videoId,
        thumbnailUrl: v.thumbnailUrl || getYouTubeThumbnail(v.videoId),
        duration: 240,
        channelId,
        channelTitle: channelName,
        channelAvatar,
        category,
        ageRating: resolvedAgeRating,
        isFeatured: false,
        isApproved: Boolean(autoApproveVideos),
        views: 0,
        tags: [
          category.toLowerCase(),
          channelName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          'curated',
          'safe'
        ],
        createdAt: v.publishedAt || nowIso
      };

      try {
        await db.addVideo(videoRecord);
        addedVideoIds.push(vidId);
      } catch (err) {
        console.warn('Failed to add video during channel import:', err);
      }
    }

    const newChannel: Channel = {
      id: channelId,
      name: channelName,
      description: channelDesc,
      avatarUrl: channelAvatar,
      bannerUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1000&h=300&fit=crop',
      category,
      ageRating: resolvedAgeRating,
      isVerified: true,
      channelType: validType,
      scheduleStartTime: nowIso,
      scheduleTimezoneOffsetMinutes: 0,
      videoIds: addedVideoIds,
      ownerId: req.user!.sub,
      ownerName: req.user!.name || 'Curator',
      visibility: validVisibility,
      defaultTags: [category.toLowerCase(), 'curated-channel'],
      createdAt: nowIso
    };

    await db.addChannel(newChannel);

    res.json({
      success: true,
      data: {
        channel: newChannel,
        videosImportedCount: addedVideoIds.length
      },
      message: `Successfully imported "${channelName}" with ${addedVideoIds.length} curated videos!`
    });
  })
);

// Create a channel (current user becomes owner with full control)
apiRouter.post(
  '/channels',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const {
      name,
      description = '',
      avatarUrl,
      bannerUrl = '',
      category = 'Cartoons & Fun',
      ageRating = 'ALL',
      channelType = 'ON_DEMAND',
      visibility = 'PUBLIC',
      videoIds = [],
      defaultTags = [],
      liveTimeline,
      liveSchedules,
      scheduleTimezoneOffsetMinutes
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Channel name is required' });
    }

    const validType: ChannelType = channelType === 'LIVE_TV' ? 'LIVE_TV' : 'ON_DEMAND';
    const validVisibility: ChannelVisibility = visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC';
    const validRatings: AgeRating[] = ['ALL', 'TODDLER', 'YOUNG_KIDS', 'OLDER_KIDS'];
    const resolvedAgeRating: AgeRating = validRatings.includes(String(ageRating).toUpperCase() as AgeRating)
      ? (String(ageRating).toUpperCase() as AgeRating)
      : 'ALL';

    if (validVisibility === 'PRIVATE') {
      const parentUser = await db.getUserById(req.user!.sub);
      if (parentUser) {
        const entitlements = await db.getEffectiveEntitlements(parentUser);
        if (!entitlements.allowPrivateChannels) {
          return res.status(403).json(
            buildPremiumRequiredPayload(
              'private_channels',
              'Private family channels require FamiTube Family Pass (Premium).'
            )
          );
        }
      }
    }

    const newChannel: Channel = {
      id: `chan-${uuidv4().slice(0, 8)}`,
      name: String(name).trim(),
      description: String(description || ''),
      avatarUrl:
        avatarUrl ||
        'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&h=200&fit=crop',
      bannerUrl,
      category,
      ageRating: resolvedAgeRating,
      isVerified: true,
      channelType: validType,
      scheduleStartTime: new Date().toISOString(),
      scheduleTimezoneOffsetMinutes:
        typeof scheduleTimezoneOffsetMinutes === 'number' ? scheduleTimezoneOffsetMinutes : 0,
      videoIds: Array.isArray(videoIds) ? videoIds : [],
      liveTimeline: Array.isArray(liveTimeline) ? liveTimeline : undefined,
      liveSchedules: Array.isArray(liveSchedules) ? liveSchedules : undefined,
      ownerId: req.user!.sub,
      ownerName: req.user!.name || 'Team FamiTube',
      visibility: validVisibility,
      defaultTags: parseTagList(defaultTags),
      createdAt: new Date().toISOString()
    };

    await db.addChannel(newChannel);
    res.status(201).json({ success: true, data: newChannel });
  })
);

// Update channel (Owner only)
apiRouter.put(
  '/channels/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const access = await db.getChannelAccess(id, req.user!.sub);
    if (!access) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (!access.isOwner) {
      return res.status(403).json({ success: false, message: 'Only the channel owner can update this channel' });
    }
    const updated = await db.updateChannel(id, req.body);
    res.json({ success: true, data: updated });
  })
);

// Delete channel (Owner only)
apiRouter.delete(
  '/channels/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const access = await db.getChannelAccess(id, req.user!.sub);
    if (!access) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (!access.isOwner) {
      return res.status(403).json({ success: false, message: 'Only the channel owner can delete this channel' });
    }
    await db.deleteChannel(id);
    res.json({ success: true, message: 'Channel deleted' });
  })
);

// --- Shareable Invite Links ---

// List invite links for a channel (Owner only)
apiRouter.get(
  '/channels/:id/invites',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const access = await db.getChannelAccess(id, req.user!.sub);
    if (!access) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (!access.isOwner) {
      return res.status(403).json({ success: false, message: 'Only the channel owner can manage invite links' });
    }
    const invites = await db.getChannelInvites(id);
    res.json({ success: true, data: invites });
  })
);

// Create a shareable invite link (Owner only)
apiRouter.post(
  '/channels/:id/invites',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const access = await db.getChannelAccess(id, req.user!.sub);
    if (!access) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (!access.isOwner) {
      return res.status(403).json({ success: false, message: 'Only the channel owner can create invite links' });
    }

    const { label, preset: rawPreset, permissions: rawPerms, maxUses, expiresInHours } = req.body;
    const { preset, permissions } = resolvePermissionsInput(rawPreset, rawPerms);

    const expiresAt =
      expiresInHours && Number(expiresInHours) > 0
        ? new Date(Date.now() + Number(expiresInHours) * 60 * 60 * 1000).toISOString()
        : null;

    const invite: ChannelInvite = {
      id: `inv-${uuidv4().slice(0, 8)}`,
      channelId: id,
      token: crypto.randomBytes(18).toString('base64url'),
      createdBy: req.user!.sub,
      label: label ? String(label).trim() : undefined,
      preset,
      permissions,
      maxUses: maxUses && Number(maxUses) > 0 ? Number(maxUses) : null,
      useCount: 0,
      expiresAt,
      isRevoked: false,
      createdAt: new Date().toISOString()
    };

    await db.createChannelInvite(invite);
    res.status(201).json({ success: true, data: invite });
  })
);

// Revoke an invite link (Owner only)
apiRouter.delete(
  '/channels/:id/invites/:inviteId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const inviteId = String(req.params.inviteId);
    const access = await db.getChannelAccess(id, req.user!.sub);
    if (!access) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (!access.isOwner) {
      return res.status(403).json({ success: false, message: 'Only the channel owner can revoke invite links' });
    }
    const revoked = await db.revokeChannelInvite(id, inviteId);
    if (!revoked) {
      return res.status(404).json({ success: false, message: 'Invite not found' });
    }
    res.json({ success: true, message: 'Invite link revoked' });
  })
);

// Preview an invite link before accepting
apiRouter.get(
  '/invites/:token',
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const token = String(req.params.token);
    const invite = await db.getInviteByToken(token);
    if (!invite) {
      return res.status(404).json({ success: false, message: 'Invite link not found' });
    }
    const channel = await db.getChannelById(invite.channelId);
    if (!channel) {
      return res.status(404).json({ success: false, message: 'Channel no longer exists' });
    }

    const isExpired = invite.expiresAt ? new Date(invite.expiresAt).getTime() < Date.now() : false;
    const isMaxedOut = invite.maxUses !== null && invite.maxUses !== undefined && invite.useCount >= invite.maxUses;
    const isValid = !invite.isRevoked && !isExpired && !isMaxedOut;

    const owner = channel.ownerId ? await db.getUserById(channel.ownerId) : undefined;
    const alreadyMember = req.user
      ? Boolean(await db.getChannelMember(channel.id, req.user.sub)) || channel.ownerId === req.user.sub
      : false;

    res.json({
      success: true,
      data: {
        isValid,
        isRevoked: invite.isRevoked,
        isExpired,
        isMaxedOut,
        alreadyMember,
        preset: invite.preset,
        permissions: invite.permissions,
        label: invite.label,
        channel: {
          id: channel.id,
          name: channel.name,
          description: channel.description,
          avatarUrl: channel.avatarUrl,
          category: channel.category,
          visibility: channel.visibility || 'PUBLIC',
          ownerName: owner?.name || channel.ownerName || 'Team FamiTube'
        }
      }
    });
  })
);

// Accept an invite link and join the channel
apiRouter.post(
  '/invites/:token/accept',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const token = String(req.params.token);
    const invite = await db.getInviteByToken(token);
    if (!invite) {
      return res.status(404).json({ success: false, message: 'Invite link not found' });
    }
    if (invite.isRevoked) {
      return res.status(410).json({ success: false, message: 'This invite link has been revoked' });
    }
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
      return res.status(410).json({ success: false, message: 'This invite link has expired' });
    }
    if (invite.maxUses !== null && invite.maxUses !== undefined && invite.useCount >= invite.maxUses) {
      return res.status(410).json({ success: false, message: 'This invite link has reached its usage limit' });
    }

    const channel = await db.getChannelById(invite.channelId);
    if (!channel) {
      return res.status(404).json({ success: false, message: 'Channel no longer exists' });
    }
    if (channel.ownerId === req.user!.sub) {
      return res.json({ success: true, message: 'You are already the owner of this channel', data: { channelId: channel.id } });
    }

    const existingMember = await db.getChannelMember(channel.id, req.user!.sub);
    const member = await db.upsertChannelMember({
      id: `mem-${uuidv4().slice(0, 8)}`,
      channelId: channel.id,
      userId: req.user!.sub,
      inviteId: invite.id,
      preset: invite.preset,
      permissions: invite.permissions,
      joinedAt: new Date().toISOString()
    });

    if (!existingMember) {
      await db.incrementInviteUseCount(invite.id);
    }

    res.json({ success: true, message: `Joined ${channel.name}`, data: member });
  })
);

// --- Channel Members & Individual Permissions ---

// List members of a channel (Owner only)
apiRouter.get(
  '/channels/:id/members',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const access = await db.getChannelAccess(id, req.user!.sub);
    if (!access) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (!access.isOwner) {
      return res.status(403).json({ success: false, message: 'Only the channel owner can view members' });
    }
    const members = await db.getChannelMembers(id);
    res.json({ success: true, data: members });
  })
);

// Update an individual member's preset or custom permissions (Owner only)
apiRouter.put(
  '/channels/:id/members/:userId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const targetUserId = String(req.params.userId);
    const access = await db.getChannelAccess(id, req.user!.sub);
    if (!access) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (!access.isOwner) {
      return res.status(403).json({ success: false, message: 'Only the channel owner can update member permissions' });
    }

    const { preset: rawPreset, permissions: rawPerms } = req.body;
    const { preset, permissions } = resolvePermissionsInput(rawPreset, rawPerms);

    const updated = await db.updateChannelMemberPermissions(id, targetUserId, preset, permissions);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    res.json({ success: true, data: updated });
  })
);

// Remove a member (Owner) or leave channel (Self)
apiRouter.delete(
  '/channels/:id/members/:userId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const targetUserId = String(req.params.userId);
    const access = await db.getChannelAccess(id, req.user!.sub);
    if (!access) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (!access.isOwner && targetUserId !== req.user!.sub) {
      return res.status(403).json({ success: false, message: 'Only the channel owner can remove other members' });
    }
    const removed = await db.removeChannelMember(id, targetUserId);
    if (!removed) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    res.json({ success: true, message: 'Member removed' });
  })
);

// --- Direct Video Add to Channel (Owner or canAddVideo) ---

apiRouter.post(
  '/channels/:id/videos',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const access = await db.getChannelAccess(id, req.user!.sub);
    if (!access) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (!access.isOwner && !access.permissions.canAddVideo) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to add videos directly to this channel'
      });
    }

    const { videoId, title, description = '', sourceUrl, sourceType, thumbnailUrl, duration = 180, category, ageRating = 'ALL', tags = [] } = req.body;

    if (videoId) {
      const updated = await db.addVideoToChannel(id, String(videoId));
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Video not found' });
      }
      return res.json({ success: true, data: updated });
    }

    if (!title || !sourceUrl) {
      return res.status(400).json({ success: false, message: 'Title and sourceUrl (or videoId) are required' });
    }

    const detectedYtId = extractYouTubeId(sourceUrl);
    const finalSourceType = detectedYtId ? 'YOUTUBE' : sourceType || 'DIRECT';
    const finalThumb =
      thumbnailUrl ||
      (detectedYtId
        ? getYouTubeThumbnail(detectedYtId)
        : 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=800&h=450&fit=crop');

    const newVideo: Video = {
      id: `vid-${uuidv4().slice(0, 8)}`,
      title: String(title).trim(),
      description: String(description || ''),
      sourceType: finalSourceType,
      sourceUrl: String(sourceUrl).trim(),
      youtubeVideoId: detectedYtId || undefined,
      thumbnailUrl: finalThumb,
      duration: Number(duration) || 180,
      channelId: access.channel.id,
      channelTitle: access.channel.name,
      channelAvatar: access.channel.avatarUrl,
      category: category || access.channel.category || 'Cartoons & Fun',
      ageRating,
      isFeatured: false,
      isApproved: true,
      views: 0,
      tags: Array.isArray(tags)
        ? tags
        : String(tags)
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
      createdAt: new Date().toISOString()
    };

    await db.addVideo(newVideo);
    await db.addVideoToChannel(access.channel.id, newVideo.id);
    res.status(201).json({ success: true, data: newVideo });
  })
);

apiRouter.delete(
  '/channels/:id/videos/:videoId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const videoId = String(req.params.videoId);
    const access = await db.getChannelAccess(id, req.user!.sub);
    if (!access) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (!access.isOwner) {
      return res.status(403).json({ success: false, message: 'Only the channel owner can remove videos' });
    }
    const updated = await db.removeVideoFromChannel(id, videoId);
    res.json({ success: true, data: updated });
  })
);

// --- Video Suggestions Queue ---

// List suggestions (Owner sees all; members see their own)
apiRouter.get(
  '/channels/:id/suggestions',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const access = await db.getChannelAccess(id, req.user!.sub);
    if (!access) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (!access.isOwner && !access.member) {
      return res.status(403).json({ success: false, message: 'Channel membership required' });
    }

    const suggestions = await db.getChannelSuggestions(
      id,
      access.isOwner ? undefined : { suggestedBy: req.user!.sub }
    );
    res.json({ success: true, data: suggestions });
  })
);

// Submit a video suggestion (Owner or canSuggestVideo)
apiRouter.post(
  '/channels/:id/suggestions',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const access = await db.getChannelAccess(id, req.user!.sub);
    if (!access) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (!access.isOwner && !access.permissions.canSuggestVideo) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to suggest videos to this channel'
      });
    }
    const requestingUser = await db.getUserById(req.user!.sub);
    if (requestingUser?.role === 'CHILD') {
      const parentUser = requestingUser.parentId ? await db.getUserById(requestingUser.parentId) : undefined;
      const effective = resolveEffectiveParentalControls(parentUser, requestingUser);
      if (effective.ageRating === 'TODDLER') {
        return res.status(403).json({
          success: false,
          message: 'Toddlers cannot submit video requests or suggestions.'
        });
      }
    }

    const {
      title,
      description = '',
      sourceUrl,
      sourceType,
      thumbnailUrl,
      duration = 180,
      category,
      ageRating = 'ALL',
      note = ''
    } = req.body;

    if (!title || !sourceUrl) {
      return res.status(400).json({ success: false, message: 'Title and sourceUrl are required' });
    }

    const detectedYtId = extractYouTubeId(sourceUrl);
    const finalSourceType = detectedYtId ? 'YOUTUBE' : sourceType || 'DIRECT';
    const finalThumb =
      thumbnailUrl ||
      (detectedYtId
        ? getYouTubeThumbnail(detectedYtId)
        : 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=800&h=450&fit=crop');

    const suggestion: ChannelSuggestion = {
      id: `sug-${uuidv4().slice(0, 8)}`,
      channelId: id,
      suggestedBy: req.user!.sub,
      title: String(title).trim(),
      description: String(description || ''),
      sourceType: finalSourceType,
      sourceUrl: String(sourceUrl).trim(),
      youtubeVideoId: detectedYtId || undefined,
      thumbnailUrl: finalThumb,
      duration: Number(duration) || 180,
      category: category || access.channel.category || 'Cartoons & Fun',
      ageRating,
      note: note ? String(note).trim() : undefined,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };

    const created = await db.createSuggestion(suggestion);
    res.status(201).json({ success: true, data: created });
  })
);

// Approve a video suggestion -> publishes video into the channel (Owner only)
apiRouter.post(
  '/channels/:id/suggestions/:suggestionId/approve',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const suggestionId = String(req.params.suggestionId);
    const access = await db.getChannelAccess(id, req.user!.sub);
    if (!access) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (!access.isOwner) {
      return res.status(403).json({ success: false, message: 'Only the channel owner can approve suggestions' });
    }

    const suggestion = await db.getSuggestionById(suggestionId);
    if (!suggestion || suggestion.channelId !== id) {
      return res.status(404).json({ success: false, message: 'Suggestion not found' });
    }
    if (suggestion.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: `Suggestion is already ${suggestion.status}` });
    }

    const newVideo: Video = {
      id: `vid-${uuidv4().slice(0, 8)}`,
      title: suggestion.title,
      description: suggestion.description,
      sourceType: suggestion.sourceType,
      sourceUrl: suggestion.sourceUrl,
      youtubeVideoId: suggestion.youtubeVideoId,
      thumbnailUrl: suggestion.thumbnailUrl,
      duration: suggestion.duration,
      channelId: access.channel.id,
      channelTitle: access.channel.name,
      channelAvatar: access.channel.avatarUrl,
      category: suggestion.category,
      ageRating: suggestion.ageRating,
      isFeatured: false,
      isApproved: true,
      views: 0,
      tags: [],
      createdAt: new Date().toISOString()
    };

    await db.addVideo(newVideo);
    await db.addVideoToChannel(access.channel.id, newVideo.id);
    const updatedSuggestion = await db.updateSuggestionStatus(suggestionId, 'APPROVED', req.user!.sub);

    res.json({ success: true, data: { suggestion: updatedSuggestion, video: newVideo } });
  })
);

// Reject a video suggestion (Owner only)
apiRouter.post(
  '/channels/:id/suggestions/:suggestionId/reject',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const suggestionId = String(req.params.suggestionId);
    const access = await db.getChannelAccess(id, req.user!.sub);
    if (!access) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (!access.isOwner) {
      return res.status(403).json({ success: false, message: 'Only the channel owner can reject suggestions' });
    }

    const suggestion = await db.getSuggestionById(suggestionId);
    if (!suggestion || suggestion.channelId !== id) {
      return res.status(404).json({ success: false, message: 'Suggestion not found' });
    }
    if (suggestion.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: `Suggestion is already ${suggestion.status}` });
    }

    const updatedSuggestion = await db.updateSuggestionStatus(suggestionId, 'REJECTED', req.user!.sub);
    res.json({ success: true, data: updatedSuggestion });
  })
);

// --- Channel Video Comments ---

// List comments on a video in a channel
apiRouter.get(
  '/channels/:id/videos/:videoId/comments',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const videoId = String(req.params.videoId);
    const access = await db.getChannelAccess(id, req.user!.sub);
    if (!access) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (!access.canView) {
      return res.status(403).json({ success: false, message: 'You do not have access to this channel' });
    }
    const comments = await db.getChannelVideoComments(id, videoId);
    res.json({ success: true, data: comments });
  })
);

// Post a comment on a video in a channel (Owner or canComment)
apiRouter.post(
  '/channels/:id/videos/:videoId/comments',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const videoId = String(req.params.videoId);
    const access = await db.getChannelAccess(id, req.user!.sub);
    if (!access) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    if (!access.isOwner && !access.permissions.canComment) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to comment in this channel'
      });
    }

    const content = String(req.body.content || '').trim();
    if (!content) {
      return res.status(400).json({ success: false, message: 'Comment content is required' });
    }

    const comment: ChannelVideoComment = {
      id: `cmt-${uuidv4().slice(0, 8)}`,
      channelId: id,
      videoId,
      authorId: req.user!.sub,
      content,
      createdAt: new Date().toISOString()
    };

    const created = await db.addChannelVideoComment(comment);
    res.status(201).json({ success: true, data: created });
  })
);

// Delete a comment (Channel Owner or comment author)
apiRouter.delete(
  '/channels/:id/videos/:videoId/comments/:commentId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const commentId = String(req.params.commentId);
    const access = await db.getChannelAccess(id, req.user!.sub);
    if (!access) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }

    const comment = await db.getChannelVideoCommentById(commentId);
    if (!comment || comment.channelId !== id) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }
    if (!access.isOwner && comment.authorId !== req.user!.sub) {
      return res.status(403).json({ success: false, message: 'You can only delete your own comments' });
    }

    await db.deleteChannelVideoComment(commentId);
    res.json({ success: true, message: 'Comment deleted' });
  })
);

// ==========================================
// PARENT CHILD ACCOUNT MANAGEMENT & KIDS FEED
// ==========================================

// Parent referral code, referred registrations & Family Pass vouchers
apiRouter.get(
  '/parent/referrals',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const [stats, vouchers] = await Promise.all([
      db.getReferralStatsForUser(req.user!.sub),
      db.getVouchersByUserId(req.user!.sub)
    ]);
    res.json({
      success: true,
      data: {
        referralCode: stats.referralCode,
        referredUsers: stats.referredUsers,
        vouchers
      }
    });
  })
);

apiRouter.post(
  '/parent/vouchers/:voucherId/redeem',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const voucherId = String(req.params.voucherId);
    const result = await db.redeemFamilyPassVoucher(req.user!.sub, voucherId);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found or already redeemed.'
      });
    }
    const plan = resolveUserPlan(result.user);
    const entitlements = getEntitlementsForPlan(plan, result.user.planExpiresAt ?? null);
    res.json({
      success: true,
      message: `Activated ${result.voucher.durationMonths}-month Family Pass!`,
      data: {
        voucher: result.voucher,
        plan,
        planExpiresAt: result.user.planExpiresAt ?? null,
        entitlements
      }
    });
  })
);

// Global Parental Controls (for all kids, unless overridden per kid)
apiRouter.get(
  '/parent/controls',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parent = await db.getUserById(req.user!.sub);
    if (!parent) {
      return res.status(404).json({ success: false, message: 'Parent account not found' });
    }
    res.json({
      success: true,
      data: getGlobalParentalControls(parent)
    });
  })
);

apiRouter.put(
  '/parent/controls',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const {
      parentPin,
      dailyLimitMinutes,
      ageRating,
      attentionTrackingEnabled,
      attentionPauseSeconds,
      attentionMinWatchPercent,
      youtubeSearchEnabled,
      searchViewLimit,
      searchRequireApproval,
      contentLanguage,
      cultureMode,
      toddlerLoopMinutes,
      toddlerCooldownMinutes,
      toddlerSubStage,
      toddlerEnabledTopics,
      toddlerHiddenVideoIds
    } = req.body || {};

    const cleanPin = parentPin !== undefined ? String(parentPin).trim() : undefined;
    if (cleanPin !== undefined && !/^\d{4}$/.test(cleanPin)) {
      return res.status(400).json({ success: false, message: 'Parent PIN must be exactly 4 digits' });
    }
    const validRatings: AgeRating[] = ['ALL', 'TODDLER', 'YOUNG_KIDS', 'OLDER_KIDS'];
    const resolvedRating =
      ageRating !== undefined && validRatings.includes(String(ageRating) as AgeRating)
        ? (String(ageRating) as AgeRating)
        : undefined;

    const updated = await db.updateParentGlobalControls(req.user!.sub, {
      parentPin: cleanPin,
      dailyLimitMinutes: dailyLimitMinutes !== undefined ? Number(dailyLimitMinutes) : undefined,
      ageRating: resolvedRating,
      attentionTrackingEnabled:
        attentionTrackingEnabled !== undefined ? Boolean(attentionTrackingEnabled) : undefined,
      attentionPauseSeconds:
        attentionPauseSeconds !== undefined ? Number(attentionPauseSeconds) : undefined,
      attentionMinWatchPercent:
        attentionMinWatchPercent !== undefined ? Number(attentionMinWatchPercent) : undefined,
      youtubeSearchEnabled: youtubeSearchEnabled !== undefined ? Boolean(youtubeSearchEnabled) : undefined,
      searchViewLimit: searchViewLimit !== undefined ? Math.max(0, Number(searchViewLimit)) : undefined,
      searchRequireApproval: searchRequireApproval !== undefined ? Boolean(searchRequireApproval) : undefined,
      contentLanguage: contentLanguage !== undefined ? normalizeContentLanguage(contentLanguage) : undefined,
      cultureMode: cultureMode !== undefined ? normalizeCultureMode(cultureMode) : undefined,
      toddlerLoopMinutes:
        toddlerLoopMinutes !== undefined ? Math.max(5, Math.min(60, Number(toddlerLoopMinutes))) : undefined,
      toddlerCooldownMinutes:
        toddlerCooldownMinutes !== undefined ? Math.max(5, Math.min(240, Number(toddlerCooldownMinutes))) : undefined,
      toddlerSubStage: toddlerSubStage !== undefined ? normalizeToddlerSubStage(toddlerSubStage) : undefined,
      toddlerEnabledTopics: Array.isArray(toddlerEnabledTopics)
        ? toddlerEnabledTopics.map((t) => String(t).trim()).filter(Boolean)
        : undefined,
      toddlerHiddenVideoIds: Array.isArray(toddlerHiddenVideoIds)
        ? toddlerHiddenVideoIds.map((id) => String(id).trim()).filter(Boolean)
        : undefined
    });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Parent account not found' });
    }
    res.json({
      success: true,
      data: getGlobalParentalControls(updated),
      message: 'Global parental controls updated for all kids.'
    });
  })
);

// List child accounts registered by this parent
apiRouter.get(
  '/parent/children',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const [parent, children] = await Promise.all([
      db.getUserById(req.user!.sub),
      db.getChildrenByParentId(req.user!.sub)
    ]);
    res.json({
      success: true,
      data: children.map((c) => formatChildResponse(parent, c))
    });
  })
);

// Register a child account by their email (Parent only)
apiRouter.post(
  '/parent/children',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const {
      email,
      name,
      password,
      birthday,
      ageRating,
      religion,
      youtubeSearchEnabled = true,
      searchViewLimit = 0,
      searchRequireApproval = true
    } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(name || '').trim();
    const cleanBirthday = birthday ? String(birthday).trim() : undefined;
    const cleanReligion = normalizeReligion(religion);

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid child email address is required' });
    }
    if (!cleanName) {
      return res.status(400).json({ success: false, message: 'Child name is required' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    if (cleanBirthday && !deriveAgeRatingFromBirthday(cleanBirthday)) {
      return res.status(400).json({ success: false, message: 'Birthday must be a valid YYYY-MM-DD date' });
    }

    const existing = await db.getUserByEmail(cleanEmail);
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email is already registered' });
    }

    const parentUser = await db.getUserById(req.user!.sub);
    if (parentUser) {
      const entitlements = await db.getEffectiveEntitlements(parentUser);
      if (entitlements.maxChildren !== null) {
        const currentChildren = await db.getChildrenByParentId(req.user!.sub);
        if (currentChildren.length >= entitlements.maxChildren) {
          return res.status(403).json(
            buildPremiumRequiredPayload(
              'multiple_children',
              `Free plan supports up to ${entitlements.maxChildren} child profile. Upgrade to Family Pass for unlimited child profiles.`,
              entitlements.maxChildren
            )
          );
        }
      }
    }

    const validRatings: AgeRating[] = ['ALL', 'TODDLER', 'YOUNG_KIDS', 'OLDER_KIDS'];
    const derivedFromBirthday = cleanBirthday ? deriveAgeRatingFromBirthday(cleanBirthday) : null;
    const resolvedRating: AgeRating =
      ageRating && validRatings.includes(ageRating as AgeRating)
        ? (ageRating as AgeRating)
        : (derivedFromBirthday || 'ALL');

    const child = await db.createUser({
      id: `chd-${uuidv4().slice(0, 8)}`,
      email: cleanEmail,
      name: cleanName,
      passwordHash: hashPassword(String(password)),
      role: 'CHILD',
      parentId: req.user!.sub,
      birthday: cleanBirthday,
      ageRating: resolvedRating,
      religion: cleanReligion || null,
      isVerified: true,
      youtubeSearchEnabled: Boolean(youtubeSearchEnabled),
      searchViewLimit: Math.max(0, Number(searchViewLimit) || 0),
      searchViewsUsed: 0,
      searchRequireApproval: searchRequireApproval !== false,
      createdAt: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      data: {
        id: child.id,
        email: child.email,
        name: child.name,
        role: child.role,
        birthday: child.birthday || null,
        ageRating: child.ageRating,
        religion: child.religion || null,
        youtubeSearchEnabled: Boolean(child.youtubeSearchEnabled),
        searchViewLimit: child.searchViewLimit ?? 0,
        searchViewsUsed: child.searchViewsUsed ?? 0,
        searchRequireApproval: child.searchRequireApproval !== false,
        createdAt: child.createdAt
      }
    });
  })
);

// Update a child account (Parent only)
apiRouter.put(
  '/parent/children/:childId',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const childId = String(req.params.childId);
    const {
      name,
      birthday,
      ageRating,
      religion,
      password,
      youtubeSearchEnabled,
      searchViewLimit,
      searchRequireApproval,
      resetSearchViewsUsed,
      parentPin,
      dailyLimitMinutes,
      attentionTrackingEnabled,
      attentionPauseSeconds,
      attentionMinWatchPercent,
      contentLanguage,
      cultureMode,
      toddlerLoopMinutes,
      toddlerCooldownMinutes,
      toddlerSubStage,
      toddlerEnabledTopics,
      toddlerHiddenVideoIds,
      toddlerCooldownUntil,
      overrides: overridesBody
    } = req.body;
    const cleanBirthday = birthday !== undefined ? String(birthday).trim() : undefined;
    if (cleanBirthday && !deriveAgeRatingFromBirthday(cleanBirthday)) {
      return res.status(400).json({ success: false, message: 'Birthday must be a valid YYYY-MM-DD date' });
    }
    if (password && String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const cleanPin =
      parentPin !== undefined && parentPin !== null ? String(parentPin).trim() : undefined;
    if (cleanPin !== undefined && !/^\d{4}$/.test(cleanPin)) {
      return res.status(400).json({ success: false, message: 'Parent PIN must be exactly 4 digits' });
    }
    const validRatings: AgeRating[] = ['ALL', 'TODDLER', 'YOUNG_KIDS', 'OLDER_KIDS'];
    // Parent is in full control of ageRating on existing profiles; editing birthday never overwrites ageRating
    const resolvedRating =
      ageRating && validRatings.includes(ageRating as AgeRating)
        ? (ageRating as AgeRating)
        : undefined;

    const [parentUser, existingChildren] = await Promise.all([
      db.getUserById(req.user!.sub),
      db.getChildrenByParentId(req.user!.sub)
    ]);
    const existingChild = existingChildren.find((c) => c.id === childId);
    if (!existingChild) {
      return res.status(404).json({ success: false, message: 'Child account not found' });
    }

    // Build per-kid overrides: null clears an override back to Global; non-null sets it
    const nextOverrides: ParentalControlsOverride = { ...(existingChild.parentalOverride || {}) };
    const applyOverride = <K extends keyof ParentalControls>(
      key: K,
      rawVal: unknown,
      transform: (v: unknown) => ParentalControls[K]
    ) => {
      if (rawVal === null) {
        delete nextOverrides[key];
      } else if (rawVal !== undefined) {
        nextOverrides[key] = transform(rawVal);
      }
    };

    if (overridesBody && typeof overridesBody === 'object') {
      const ob = overridesBody as Record<string, unknown>;
      if (ob.parentPin !== undefined && ob.parentPin !== null && !/^\d{4}$/.test(String(ob.parentPin).trim())) {
        return res.status(400).json({ success: false, message: 'Parent PIN must be exactly 4 digits' });
      }
      applyOverride('parentPin', ob.parentPin, (v) => String(v).trim());
      applyOverride('dailyLimitMinutes', ob.dailyLimitMinutes, (v) => Math.max(0, Math.min(720, Number(v))));
      applyOverride('ageRating', ob.ageRating, (v) =>
        validRatings.includes(String(v) as AgeRating) ? (String(v) as AgeRating) : 'ALL'
      );
      applyOverride('attentionTrackingEnabled', ob.attentionTrackingEnabled, (v) => Boolean(v));
      applyOverride('attentionPauseSeconds', ob.attentionPauseSeconds, (v) => Math.max(5, Math.min(300, Number(v))));
      applyOverride('attentionMinWatchPercent', ob.attentionMinWatchPercent, (v) => Math.max(10, Math.min(100, Number(v))));
      applyOverride('youtubeSearchEnabled', ob.youtubeSearchEnabled, (v) => Boolean(v));
      applyOverride('searchViewLimit', ob.searchViewLimit, (v) => Math.max(0, Number(v)));
      applyOverride('searchRequireApproval', ob.searchRequireApproval, (v) => Boolean(v));
      applyOverride('contentLanguage', ob.contentLanguage, (v) => normalizeContentLanguage(v));
      applyOverride('cultureMode', ob.cultureMode, (v) => normalizeCultureMode(v));
      applyOverride('toddlerLoopMinutes', ob.toddlerLoopMinutes, (v) => Math.max(5, Math.min(60, Number(v))));
      applyOverride('toddlerCooldownMinutes', ob.toddlerCooldownMinutes, (v) => Math.max(5, Math.min(240, Number(v))));
      applyOverride('toddlerSubStage', ob.toddlerSubStage, (v) => normalizeToddlerSubStage(v));
      applyOverride('toddlerEnabledTopics', ob.toddlerEnabledTopics, (v) =>
        Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [...DEFAULT_TODDLER_ENABLED_TOPICS]
      );
      applyOverride('toddlerHiddenVideoIds', ob.toddlerHiddenVideoIds, (v) =>
        Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []
      );
      applyOverride('religion', ob.religion, (v) => normalizeReligion(v));
    }

    // Also support flat fields on PUT body for direct per-kid override updates
    applyOverride('parentPin', parentPin === null ? null : cleanPin, (v) => String(v));
    applyOverride('dailyLimitMinutes', dailyLimitMinutes, (v) => Math.max(0, Math.min(720, Number(v))));
    applyOverride('ageRating', ageRating === null ? null : resolvedRating, (v) => v as AgeRating);
    applyOverride('attentionTrackingEnabled', attentionTrackingEnabled, (v) => Boolean(v));
    applyOverride('attentionPauseSeconds', attentionPauseSeconds, (v) => Math.max(5, Math.min(300, Number(v))));
    applyOverride('attentionMinWatchPercent', attentionMinWatchPercent, (v) => Math.max(10, Math.min(100, Number(v))));
    applyOverride('youtubeSearchEnabled', youtubeSearchEnabled, (v) => Boolean(v));
    applyOverride('searchViewLimit', searchViewLimit, (v) => Math.max(0, Number(v)));
    applyOverride('searchRequireApproval', searchRequireApproval, (v) => Boolean(v));
    applyOverride('contentLanguage', contentLanguage, (v) => normalizeContentLanguage(v));
    applyOverride('cultureMode', cultureMode, (v) => normalizeCultureMode(v));
    applyOverride('toddlerLoopMinutes', toddlerLoopMinutes, (v) => Math.max(5, Math.min(60, Number(v))));
    applyOverride('toddlerCooldownMinutes', toddlerCooldownMinutes, (v) => Math.max(5, Math.min(240, Number(v))));
    applyOverride('toddlerSubStage', toddlerSubStage, (v) => normalizeToddlerSubStage(v));
    applyOverride('toddlerEnabledTopics', toddlerEnabledTopics, (v) =>
      Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [...DEFAULT_TODDLER_ENABLED_TOPICS]
    );
    applyOverride('toddlerHiddenVideoIds', toddlerHiddenVideoIds, (v) =>
      Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []
    );
    applyOverride('religion', religion === null ? null : (religion !== undefined ? normalizeReligion(religion) : undefined), (v) => v as string);

    const effective = resolveEffectiveParentalControls(parentUser, {
      ...existingChild,
      parentalOverride: nextOverrides
    });

    const updated = await db.updateChildAccount(req.user!.sub, childId, {
      name: name ? String(name) : undefined,
      birthday: cleanBirthday,
      ageRating: effective.ageRating,
      passwordHash: password ? hashPassword(String(password)) : undefined,
      youtubeSearchEnabled: effective.youtubeSearchEnabled,
      searchViewLimit: effective.searchViewLimit,
      searchRequireApproval: effective.searchRequireApproval,
      resetSearchViewsUsed: Boolean(resetSearchViewsUsed),
      parentPin: effective.parentPin,
      dailyLimitMinutes: effective.dailyLimitMinutes,
      attentionTrackingEnabled: effective.attentionTrackingEnabled,
      attentionPauseSeconds: effective.attentionPauseSeconds,
      attentionMinWatchPercent: effective.attentionMinWatchPercent,
      contentLanguage: effective.contentLanguage,
      cultureMode: effective.cultureMode,
      toddlerLoopMinutes: effective.toddlerLoopMinutes,
      toddlerCooldownMinutes: effective.toddlerCooldownMinutes,
      toddlerSubStage: effective.toddlerSubStage,
      toddlerEnabledTopics: effective.toddlerEnabledTopics,
      toddlerHiddenVideoIds: effective.toddlerHiddenVideoIds,
      toddlerCooldownUntil: toddlerCooldownUntil !== undefined ? toddlerCooldownUntil : undefined,
      religion: effective.religion || null,
      parentalOverride: Object.keys(nextOverrides).length > 0 ? nextOverrides : null
    });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Child account not found' });
    }
    res.json({
      success: true,
      data: formatChildResponse(parentUser, updated)
    });
  })
);

// Delete a child account (Parent only)
apiRouter.delete(
  '/parent/children/:childId',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const childId = String(req.params.childId);
    const deleted = await db.deleteChildAccount(req.user!.sub, childId);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Child account not found' });
    }
    res.json({ success: true, message: 'Child account removed' });
  })
);

// Switch into a child's session from an authenticated parent account
apiRouter.post(
  '/parent/children/:childId/switch-session',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const childId = String(req.params.childId);
    const [parent, children] = await Promise.all([
      db.getUserById(req.user!.sub),
      db.getChildrenByParentId(req.user!.sub)
    ]);
    const child = children.find((c) => c.id === childId);
    if (!child) {
      return res.status(404).json({ success: false, message: 'Child account not found' });
    }

    const token = signAuthToken({
      sub: child.id,
      email: child.email,
      name: child.name,
      role: 'CHILD',
      parentId: req.user!.sub
    });

    res.json({
      success: true,
      token,
      user: formatChildResponse(parent, child)
    });
  })
);

// Kid-safe feed (for logged-in CHILD or PARENT preview)
apiRouter.get(
  '/kids/feed',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await db.getUserById(req.user!.sub);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const parentOrSelfId = user.role === 'CHILD' && user.parentId ? user.parentId : user.id;
    const parentUser =
      user.role === 'CHILD' && user.parentId ? await db.getUserById(user.parentId) : user;
    const effectiveControls =
      user.role === 'CHILD'
        ? resolveEffectiveParentalControls(parentUser, user)
        : getGlobalParentalControls(user);
    const entitlements = await db.getEffectiveEntitlements(user);
    const { includeTags, anyTags, excludeTags, preset, presets, ageRating: queryAgeRaw } = req.query;
    const queryAgeRating = queryAgeRaw ? String(queryAgeRaw) : undefined;
    const effectiveAgeRating =
      user.role === 'CHILD'
        ? queryAgeRating && queryAgeRating !== 'ALL'
          ? queryAgeRating
          : !effectiveControls.ageRating || effectiveControls.ageRating === 'ALL'
            ? 'OLDER_KIDS'
            : effectiveControls.ageRating
        : queryAgeRating && queryAgeRating !== 'ALL'
          ? queryAgeRating
          : effectiveControls.ageRating && effectiveControls.ageRating !== 'ALL'
            ? effectiveControls.ageRating
            : undefined;
    const accessibleChannels = await db.getChannelsForUser(parentOrSelfId, effectiveAgeRating);
    const resolvedIncludeTags = parseTagList(includeTags);
    const resolvedAnyTags = parseTagList(anyTags);
    const resolvedExcludeTags = parseTagList(excludeTags);
    const resolvedPresetIds = parseTagList(presets ?? preset).map((p) => p.toLowerCase());

    if (
      !entitlements.allowCustomTagRules &&
      (resolvedIncludeTags.length > 0 || resolvedAnyTags.length > 0 || resolvedExcludeTags.length > 0)
    ) {
      return res.status(403).json(
        buildPremiumRequiredPayload(
          'custom_tag_rules',
          'Custom tag include/exclude rules require FamiTube Family Pass (Premium).'
        )
      );
    }

    if (entitlements.maxActivePresets !== null && resolvedPresetIds.length > entitlements.maxActivePresets) {
      return res.status(403).json(
        buildPremiumRequiredPayload(
          'multiple_presets',
          `Free plan supports up to ${entitlements.maxActivePresets} active filter preset. Upgrade to Family Pass to stack multiple presets.`,
          entitlements.maxActivePresets
        )
      );
    }

    const videos = await db.getVideos({
      ageRating: effectiveAgeRating,
      onlyApproved: true,
      includeTags: resolvedIncludeTags.length > 0 ? resolvedIncludeTags : undefined,
      anyTags: resolvedAnyTags.length > 0 ? resolvedAnyTags : undefined,
      excludeTags: resolvedExcludeTags.length > 0 ? resolvedExcludeTags : undefined,
      presetIds: resolvedPresetIds.length > 0 ? resolvedPresetIds : undefined
    });

    res.json({
      success: true,
      data: {
        channels: accessibleChannels,
        videos,
        entitlements,
        parentalSettings: {
          parentPin: effectiveControls.parentPin,
          dailyLimitMinutes: effectiveControls.dailyLimitMinutes,
          ageRating: effectiveControls.ageRating,
          attentionTrackingEnabled: effectiveControls.attentionTrackingEnabled,
          attentionPauseSeconds: effectiveControls.attentionPauseSeconds,
          attentionMinWatchPercent: effectiveControls.attentionMinWatchPercent,
          contentLanguage: effectiveControls.contentLanguage,
          cultureMode: effectiveControls.cultureMode,
          toddlerLoopMinutes: effectiveControls.toddlerLoopMinutes,
          toddlerCooldownMinutes: effectiveControls.toddlerCooldownMinutes,
          toddlerSubStage: effectiveControls.toddlerSubStage,
          toddlerEnabledTopics: effectiveControls.toddlerEnabledTopics,
          toddlerHiddenVideoIds: effectiveControls.toddlerHiddenVideoIds,
          toddlerCooldownUntil: user.toddlerCooldownUntil || null
        }
      }
    });
  })
);

// Toddler TV Mode: Ready-made linear weekly loops + cooldown status
apiRouter.get(
  '/kids/toddler-tv',
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    let targetChild: User | undefined;
    let parentUser: User | undefined;

    if (req.user?.sub) {
      const me = await db.getUserById(req.user.sub);
      if (me?.role === 'CHILD') {
        targetChild = me;
        if (me.parentId) parentUser = await db.getUserById(me.parentId);
      } else if (me?.role === 'PARENT') {
        parentUser = me;
        const childId = req.query.childId ? String(req.query.childId) : '';
        if (childId) {
          const children = await db.getChildrenByParentId(me.id);
          targetChild = children.find((c) => c.id === childId);
        }
      }
    }

    const effective = targetChild
      ? resolveEffectiveParentalControls(parentUser, targetChild)
      : getGlobalParentalControls(parentUser);

    const langParam = req.query.lang ? normalizeContentLanguage(req.query.lang) : effective.contentLanguage;
    const cultureParam = req.query.culture ? normalizeCultureMode(req.query.culture) : effective.cultureMode;
    const subStageParam = req.query.subStage ? normalizeToddlerSubStage(req.query.subStage) : effective.toddlerSubStage;

    const allToddlerVideos = await db.getVideos({
      ageRating: 'TODDLER',
      onlyApproved: true,
      childReligion: targetChild ? (effective.religion || null) : undefined
    });

    const { channels, weekNumber } = buildToddlerWeeklyChannelLoops(allToddlerVideos, {
      contentLanguage: langParam,
      cultureMode: cultureParam,
      toddlerSubStage: subStageParam,
      enabledTopics: effective.toddlerEnabledTopics,
      hiddenVideoIds: effective.toddlerHiddenVideoIds
    });

    res.json({
      success: true,
      data: {
        channels,
        weekNumber,
        serverTime: new Date().toISOString(),
        cooldownUntil: targetChild?.toddlerCooldownUntil || null,
        settings: {
          contentLanguage: langParam,
          cultureMode: cultureParam,
          toddlerLoopMinutes: effective.toddlerLoopMinutes,
          toddlerCooldownMinutes: effective.toddlerCooldownMinutes,
          toddlerSubStage: subStageParam,
          toddlerEnabledTopics: effective.toddlerEnabledTopics,
          toddlerHiddenVideoIds: effective.toddlerHiddenVideoIds
        }
      }
    });
  })
);

// Start Toddler TV nap cooldown after 1 loop, or wake TV with Parent PIN
apiRouter.post(
  '/kids/toddler-tv/cooldown',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await db.getUserById(req.user!.sub);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const parentUser =
      user.role === 'CHILD' && user.parentId ? await db.getUserById(user.parentId) : undefined;
    const effective =
      user.role === 'CHILD'
        ? resolveEffectiveParentalControls(parentUser, user)
        : getGlobalParentalControls(user);

    const action = String(req.body?.action || 'START').trim().toUpperCase();
    if (action === 'WAKE') {
      const submittedPin = String(req.body?.pin ?? '').trim();
      if (!submittedPin || submittedPin !== effective.parentPin) {
        return res.status(403).json({ success: false, message: 'Incorrect Parent PIN' });
      }
      await db.setChildToddlerCooldown(user.id, null);
      return res.json({ success: true, data: { cooldownUntil: null } });
    }

    const cooldownUntil = new Date(
      Date.now() + Math.max(5, effective.toddlerCooldownMinutes) * 60_000
    ).toISOString();
    await db.setChildToddlerCooldown(user.id, cooldownUntil);
    res.json({ success: true, data: { cooldownUntil } });
  })
);

// Parent wakes up a child's Toddler TV from Nap Cooldown
apiRouter.post(
  '/parent/children/:childId/toddler-wake',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const childId = String(req.params.childId);
    const children = await db.getChildrenByParentId(req.user!.sub);
    const child = children.find((c) => c.id === childId);
    if (!child) {
      return res.status(404).json({ success: false, message: 'Child account not found' });
    }
    await db.setChildToddlerCooldown(childId, null);
    res.json({ success: true, data: { childId, cooldownUntil: null }, message: 'Toddler TV is awake!' });
  })
);

// Verify parent PIN from a child (or parent) session for quick-access parental controls
apiRouter.post(
  '/kids/parental-controls/verify-pin',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await db.getUserById(req.user!.sub);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const parentUser =
      user.role === 'CHILD' && user.parentId ? await db.getUserById(user.parentId) : undefined;
    const effective =
      user.role === 'CHILD'
        ? resolveEffectiveParentalControls(parentUser, user)
        : getGlobalParentalControls(user);

    const submittedPin = String(req.body?.pin ?? '').trim();
    if (!submittedPin || submittedPin !== effective.parentPin) {
      return res.status(403).json({ success: false, message: 'Incorrect Parent PIN' });
    }

    res.json({
      success: true,
      data: {
        parentPin: effective.parentPin,
        dailyLimitMinutes: effective.dailyLimitMinutes,
        ageRating: effective.ageRating,
        attentionTrackingEnabled: effective.attentionTrackingEnabled,
        attentionPauseSeconds: effective.attentionPauseSeconds,
        attentionMinWatchPercent: effective.attentionMinWatchPercent,
        contentLanguage: effective.contentLanguage,
        cultureMode: effective.cultureMode,
        toddlerLoopMinutes: effective.toddlerLoopMinutes,
        toddlerCooldownMinutes: effective.toddlerCooldownMinutes,
        toddlerSubStage: effective.toddlerSubStage,
        toddlerEnabledTopics: effective.toddlerEnabledTopics,
        toddlerHiddenVideoIds: effective.toddlerHiddenVideoIds,
        toddlerCooldownUntil: user.toddlerCooldownUntil || null
      }
    });
  })
);

// Quick-access parental controls update from a child device/web session (requires valid currentPin)
apiRouter.put(
  '/kids/parental-controls',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await db.getUserById(req.user!.sub);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const parentUser =
      user.role === 'CHILD' && user.parentId ? await db.getUserById(user.parentId) : undefined;
    const currentEffective =
      user.role === 'CHILD'
        ? resolveEffectiveParentalControls(parentUser, user)
        : getGlobalParentalControls(user);

    const currentPin = String(req.body?.currentPin ?? '').trim();
    if (!currentPin || currentPin !== currentEffective.parentPin) {
      return res.status(403).json({ success: false, message: 'Incorrect Parent PIN' });
    }

    const validRatings: AgeRating[] = ['ALL', 'TODDLER', 'YOUNG_KIDS', 'OLDER_KIDS'];
    const {
      parentPin,
      dailyLimitMinutes,
      ageRating,
      attentionTrackingEnabled,
      attentionPauseSeconds,
      attentionMinWatchPercent,
      contentLanguage,
      cultureMode,
      toddlerLoopMinutes,
      toddlerCooldownMinutes,
      toddlerSubStage,
      toddlerEnabledTopics,
      toddlerHiddenVideoIds,
      toddlerCooldownUntil
    } = req.body || {};

    const cleanNewPin =
      parentPin !== undefined && parentPin !== null && String(parentPin).trim() !== ''
        ? String(parentPin).trim()
        : undefined;
    if (cleanNewPin !== undefined && !/^\d{4}$/.test(cleanNewPin)) {
      return res.status(400).json({ success: false, message: 'Parent PIN must be exactly 4 digits' });
    }

    if (user.role === 'CHILD' && user.parentId) {
      const nextOverrides: ParentalControlsOverride = { ...(user.parentalOverride || {}) };
      if (cleanNewPin !== undefined) nextOverrides.parentPin = cleanNewPin;
      if (dailyLimitMinutes !== undefined) {
        nextOverrides.dailyLimitMinutes = Math.max(0, Math.min(720, Number(dailyLimitMinutes)));
      }
      if (ageRating !== undefined && validRatings.includes(String(ageRating) as AgeRating)) {
        nextOverrides.ageRating = String(ageRating) as AgeRating;
      }
      if (attentionTrackingEnabled !== undefined) {
        nextOverrides.attentionTrackingEnabled = Boolean(attentionTrackingEnabled);
      }
      if (attentionPauseSeconds !== undefined) {
        nextOverrides.attentionPauseSeconds = Math.max(5, Math.min(300, Number(attentionPauseSeconds)));
      }
      if (attentionMinWatchPercent !== undefined) {
        nextOverrides.attentionMinWatchPercent = Math.max(10, Math.min(100, Number(attentionMinWatchPercent)));
      }
      if (contentLanguage !== undefined) {
        nextOverrides.contentLanguage = normalizeContentLanguage(contentLanguage);
      }
      if (cultureMode !== undefined) {
        nextOverrides.cultureMode = normalizeCultureMode(cultureMode);
      }
      if (toddlerLoopMinutes !== undefined) {
        nextOverrides.toddlerLoopMinutes = Math.max(5, Math.min(60, Number(toddlerLoopMinutes)));
      }
      if (toddlerCooldownMinutes !== undefined) {
        nextOverrides.toddlerCooldownMinutes = Math.max(5, Math.min(240, Number(toddlerCooldownMinutes)));
      }
      if (toddlerSubStage !== undefined) {
        nextOverrides.toddlerSubStage = normalizeToddlerSubStage(toddlerSubStage);
      }
      if (Array.isArray(toddlerEnabledTopics)) {
        nextOverrides.toddlerEnabledTopics = toddlerEnabledTopics.map((t) => String(t).trim()).filter(Boolean);
      }
      if (Array.isArray(toddlerHiddenVideoIds)) {
        nextOverrides.toddlerHiddenVideoIds = toddlerHiddenVideoIds.map((id) => String(id).trim()).filter(Boolean);
      }

      const nextEffective = resolveEffectiveParentalControls(parentUser, {
        ...user,
        parentalOverride: nextOverrides
      });

      await db.updateChildAccount(user.parentId, user.id, {
        ageRating: nextEffective.ageRating,
        parentPin: nextEffective.parentPin,
        dailyLimitMinutes: nextEffective.dailyLimitMinutes,
        attentionTrackingEnabled: nextEffective.attentionTrackingEnabled,
        attentionPauseSeconds: nextEffective.attentionPauseSeconds,
        attentionMinWatchPercent: nextEffective.attentionMinWatchPercent,
        contentLanguage: nextEffective.contentLanguage,
        cultureMode: nextEffective.cultureMode,
        toddlerLoopMinutes: nextEffective.toddlerLoopMinutes,
        toddlerCooldownMinutes: nextEffective.toddlerCooldownMinutes,
        toddlerSubStage: nextEffective.toddlerSubStage,
        toddlerEnabledTopics: nextEffective.toddlerEnabledTopics,
        toddlerHiddenVideoIds: nextEffective.toddlerHiddenVideoIds,
        toddlerCooldownUntil: toddlerCooldownUntil !== undefined ? toddlerCooldownUntil : undefined,
        parentalOverride: Object.keys(nextOverrides).length > 0 ? nextOverrides : null
      });

      return res.json({
        success: true,
        data: {
          parentPin: nextEffective.parentPin,
          dailyLimitMinutes: nextEffective.dailyLimitMinutes,
          ageRating: nextEffective.ageRating,
          attentionTrackingEnabled: nextEffective.attentionTrackingEnabled,
          attentionPauseSeconds: nextEffective.attentionPauseSeconds,
          attentionMinWatchPercent: nextEffective.attentionMinWatchPercent,
          contentLanguage: nextEffective.contentLanguage,
          cultureMode: nextEffective.cultureMode,
          toddlerLoopMinutes: nextEffective.toddlerLoopMinutes,
          toddlerCooldownMinutes: nextEffective.toddlerCooldownMinutes,
          toddlerSubStage: nextEffective.toddlerSubStage,
          toddlerEnabledTopics: nextEffective.toddlerEnabledTopics,
          toddlerHiddenVideoIds: nextEffective.toddlerHiddenVideoIds,
          toddlerCooldownUntil: toddlerCooldownUntil !== undefined ? toddlerCooldownUntil : (user.toddlerCooldownUntil || null)
        },
        message: 'Parental controls updated and synced.'
      });
    }

    // Fallback for parent previewing child mode
    const updatedParent = await db.updateParentGlobalControls(user.id, {
      parentPin: cleanNewPin,
      dailyLimitMinutes:
        dailyLimitMinutes !== undefined ? Math.max(0, Math.min(720, Number(dailyLimitMinutes))) : undefined,
      ageRating:
        ageRating !== undefined && validRatings.includes(String(ageRating) as AgeRating)
          ? (String(ageRating) as AgeRating)
          : undefined,
      attentionTrackingEnabled:
        attentionTrackingEnabled !== undefined ? Boolean(attentionTrackingEnabled) : undefined,
      attentionPauseSeconds:
        attentionPauseSeconds !== undefined ? Math.max(5, Math.min(300, Number(attentionPauseSeconds))) : undefined,
      attentionMinWatchPercent:
        attentionMinWatchPercent !== undefined ? Math.max(10, Math.min(100, Number(attentionMinWatchPercent))) : undefined,
      contentLanguage: contentLanguage !== undefined ? normalizeContentLanguage(contentLanguage) : undefined
    });
    const nextGlobal = getGlobalParentalControls(updatedParent || user);
    res.json({
      success: true,
      data: {
        parentPin: nextGlobal.parentPin,
        dailyLimitMinutes: nextGlobal.dailyLimitMinutes,
        ageRating: nextGlobal.ageRating,
        attentionTrackingEnabled: nextGlobal.attentionTrackingEnabled,
        attentionPauseSeconds: nextGlobal.attentionPauseSeconds,
        attentionMinWatchPercent: nextGlobal.attentionMinWatchPercent,
        contentLanguage: nextGlobal.contentLanguage
      },
      message: 'Parental controls updated.'
    });
  })
);

// Kid saved channels list (channels added by the child to their channel list)
apiRouter.get(
  '/kids/channels',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await db.getUserById(req.user!.sub);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const parentOrSelfId = user.role === 'CHILD' && user.parentId ? user.parentId : user.id;
    const parentUser =
      user.role === 'CHILD' && user.parentId ? await db.getUserById(user.parentId) : undefined;
    const effective =
      user.role === 'CHILD'
        ? resolveEffectiveParentalControls(parentUser, user)
        : getGlobalParentalControls(user);
    const effectiveAge =
      user.role === 'CHILD'
        ? !effective.ageRating || effective.ageRating === 'ALL'
          ? 'OLDER_KIDS'
          : effective.ageRating
        : effective.ageRating && effective.ageRating !== 'ALL'
          ? effective.ageRating
          : undefined;

    const [savedIds, accessible] = await Promise.all([
      db.getKidSavedChannelIds(user.id),
      db.getChannelsForUser(parentOrSelfId, effectiveAge)
    ]);
    const channelMap = new Map(accessible.map((c) => [c.id, c]));
    const savedChannels = savedIds.map((id) => channelMap.get(id)).filter(Boolean);
    res.json({ success: true, data: savedChannels });
  })
);

apiRouter.post(
  '/kids/channels/:channelId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const channelId = String(req.params.channelId);
    const ch = await db.getChannelById(channelId);
    if (!ch) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    await db.addKidSavedChannel(req.user!.sub, channelId);
    const savedIds = await db.getKidSavedChannelIds(req.user!.sub);
    res.json({ success: true, data: { channelId, savedIds } });
  })
);

apiRouter.delete(
  '/kids/channels/:channelId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const channelId = String(req.params.channelId);
    await db.removeKidSavedChannel(req.user!.sub, channelId);
    const savedIds = await db.getKidSavedChannelIds(req.user!.sub);
    res.json({ success: true, data: { channelId, savedIds } });
  })
);

// ==========================================
// KID YOUTUBE SEARCH, APPROVAL REQUESTS, HISTORY & PLAYLISTS
// ==========================================

// Parent: list kid video approval requests (pending & recent)
apiRouter.get(
  '/parent/video-requests',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const requests = await db.getKidVideoRequestsForParent(req.user!.sub);
    res.json({ success: true, data: requests });
  })
);

// Parent: one-click approve or deny from email link
apiRouter.get(
  '/parent/video-requests/email-decide',
  asyncHandler(async (req, res) => {
    const token = String(req.query.token || '').trim();
    const renderPage = (title: string, message: string, color: string, thumbUrl?: string, videoTitle?: string) => `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${title} - FamiTube</title>
        </head>
        <body style="margin:0; font-family: Arial, sans-serif; background:#0b1120; color:#f8fafc; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:20px;">
          <div style="max-width:460px; width:100%; background:#111827; border:1px solid #1f2937; border-radius:16px; padding:24px; text-align:center;">
            <div style="font-size:13px; font-weight:700; color:#ff2e93; letter-spacing:0.06em; text-transform:uppercase; margin-bottom:8px;">FamiTube Parent Control</div>
            <h2 style="margin:0 0 12px 0; color:${color};">${title}</h2>
            ${thumbUrl ? `<img src="${thumbUrl}" alt="" style="width:100%; border-radius:10px; margin-bottom:12px; max-height:220px; object-fit:cover;" />` : ''}
            ${videoTitle ? `<div style="font-weight:700; font-size:16px; margin-bottom:10px;">${videoTitle}</div>` : ''}
            <p style="color:#cbd5e1; font-size:14px; line-height:1.5; margin:0 0 18px 0;">${message}</p>
            <a href="/" style="display:inline-block; background:#ff2e93; color:#ffffff; text-decoration:none; font-weight:700; padding:10px 18px; border-radius:10px;">Open FamiTube</a>
          </div>
        </body>
      </html>
    `;

    if (!token) {
      return res.status(400).send(renderPage('Invalid Link', 'Missing decision token.', '#ff3366'));
    }

    try {
      const payload = verifyVideoRequestDecisionToken(token);
      const updated = await db.decideKidVideoRequest(payload.parentId, payload.requestId, payload.decision);
      if (!updated) {
        return res.status(404).send(renderPage('Request Not Found', 'This video permission request could not be found.', '#ff3366'));
      }
      const isApproved = payload.decision === 'APPROVED';
      return res.send(
        renderPage(
          isApproved ? 'Permission Granted' : 'Permission Denied',
          isApproved
            ? 'This video has been approved and added to your childÃ¢â‚¬â„¢s Watch History.'
            : 'This video request has been declined.',
          isApproved ? '#06d6a0' : '#ff3366',
          updated.thumbnailUrl,
          updated.title
        )
      );
    } catch {
      return res.status(400).send(renderPage('Link Expired or Invalid', 'This permission link is invalid or has expired.', '#ff3366'));
    }
  })
);

// Parent: approve or reject a kid's searched video request
apiRouter.post(
  '/parent/video-requests/:requestId/decide',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const requestId = String(req.params.requestId);
    const decision = String(req.body?.decision || '').toUpperCase();
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      return res.status(400).json({ success: false, message: 'decision must be APPROVED or REJECTED' });
    }
    const updated = await db.decideKidVideoRequest(req.user!.sub, requestId, decision);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Video approval request not found' });
    }
    await db.createNotification(
      updated.kidId,
      'VIDEO_DECISION',
      decision === 'APPROVED' ? 'Video Approved!' : 'Video Request Declined',
      decision === 'APPROVED'
        ? `"${updated.title}" was approved by your parent.`
        : `"${updated.title}" was declined by your parent.`,
      updated.id
    );
    res.json({
      success: true,
      data: updated,
      message:
        decision === 'APPROVED'
          ? 'Video approved and added to your childÃ¢â‚¬â„¢s history.'
          : 'Video request declined.'
    });
  })
);

// Parent: one-click approve or reject a kid's video request directly from email link
apiRouter.get(
  '/parent/video-requests/:requestId/email-decision',
  asyncHandler(async (req, res) => {
    const requestId = String(req.params.requestId || '').trim();
    const decision = String(req.query.decision || '').trim().toUpperCase();
    const token = String(req.query.token || '').trim();
    const webUrl = (process.env.WEB_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const wantsJson =
      (req.headers.accept || '').includes('application/json') &&
      !(req.headers.accept || '').includes('text/html');

    const renderPage = (
      ok: boolean,
      statusCode: number,
      heading: string,
      message: string,
      videoTitle?: string,
      thumbnailUrl?: string
    ) => {
      if (wantsJson) {
        return res.status(statusCode).json({ success: ok, heading, message, videoTitle });
      }
      const badgeColor = !ok ? '#ef4444' : decision === 'APPROVED' ? '#10b981' : '#f59e0b';
      return res.status(statusCode).send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FamiTube Video Permission</title>
<style>body{font-family:Arial,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px;}
.card{background:#1e293b;padding:32px;border-radius:16px;max-width:460px;width:100%;text-align:center;border:1px solid #334155;box-shadow:0 16px 40px rgba(0,0,0,0.4);}
.badge{display:inline-block;padding:6px 14px;border-radius:999px;font-size:13px;font-weight:bold;background:${badgeColor};color:#fff;margin-bottom:12px;}
img.thumb{width:100%;max-height:200px;object-fit:cover;border-radius:10px;margin:14px 0;border:1px solid #334155;}
a.btn{display:inline-block;margin-top:18px;padding:12px 22px;background:#ff3366;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;}</style>
</head><body><div class="card">
<div class="badge">${ok ? (decision === 'APPROVED' ? 'Approved' : 'Declined') : 'Error'}</div>
<h2 style="margin:6px 0 12px;">${heading}</h2>
${thumbnailUrl ? `<img class="thumb" src="${thumbnailUrl}" alt="">` : ''}
${videoTitle ? `<p style="font-weight:bold;color:#e2e8f0;margin:8px 0;">${videoTitle}</p>` : ''}
<p style="color:#94a3b8;line-height:1.5;">${message}</p>
<a class="btn" href="${webUrl}">Open FamiTube Parent Studio</a>
</div></body></html>`);
    };

    if (!requestId || !token || (decision !== 'APPROVED' && decision !== 'REJECTED')) {
      return renderPage(
        false,
        400,
        'Invalid Link',
        'This approval link is missing required parameters.'
      );
    }

    let decoded;
    try {
      decoded = verifyVideoRequestActionToken(token);
    } catch {
      return renderPage(
        false,
        400,
        'Expired or Invalid Link',
        'This email approval link has expired or is invalid. Please sign in to FamiTube Parent Studio to review the request.'
      );
    }

    if (decoded.requestId !== requestId) {
      return renderPage(
        false,
        400,
        'Request Mismatch',
        'This token does not match the video request.'
      );
    }

    const updated = await db.decideKidVideoRequest(decoded.parentId, requestId, decision);
    if (!updated) {
      return renderPage(
        false,
        404,
        'Request Not Found',
        'We could not find this video permission request.'
      );
    }

    return renderPage(
      true,
      200,
      decision === 'APPROVED' ? 'Video Approved!' : 'Request Declined',
      decision === 'APPROVED'
        ? 'This video has been approved and added to your childÃ¢â‚¬â„¢s FamiTube Watch History so they can watch it anytime.'
        : 'This video permission request has been declined.',
      updated.title,
      updated.thumbnailUrl
    );
  })
);

// Kid: search YouTube (only when enabled by parent)
apiRouter.get(
  '/kids/youtube-search',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await db.getUserById(req.user!.sub);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const parentUser =
      user.role === 'CHILD' && user.parentId ? await db.getUserById(user.parentId) : undefined;
    const effective =
      user.role === 'CHILD'
        ? resolveEffectiveParentalControls(parentUser, user)
        : getGlobalParentalControls(user);
    if (user.role === 'CHILD' && effective.ageRating === 'TODDLER') {
      return res.status(403).json({
        success: false,
        message: 'Search is only available for Young Kids and Older Kids.'
      });
    }
    if (user.role === 'CHILD' && !effective.youtubeSearchEnabled) {
      return res.status(403).json({
        success: false,
        message: 'YouTube search is currently disabled by your parent.'
      });
    }
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ success: false, message: 'Search query (q) is required' });
    }

    const { regionCode, languageCode } = await resolveGeoForSearch(req.headers, {
      region: req.query.region ? String(req.query.region) : req.query.gl ? String(req.query.gl) : undefined,
      lang: req.query.lang ? String(req.query.lang) : req.query.hl ? String(req.query.hl) : undefined,
      lat: req.query.lat,
      lon: req.query.lon
    });
    const [rawResults, rawChannels, existingRequests, history, ytSubscriptions] = await Promise.all([
      searchYouTubeVideos(q, 25, { regionCode, languageCode }),
      searchYouTubeChannels(q, 6, { regionCode, languageCode }),
      db.getKidVideoRequestsForKid(user.id),
      db.getKidHistory(user.id),
      db.getKidYouTubeSubscriptions(user.id)
    ]);
    const reqMap = new Map(existingRequests.map((r) => [r.youtubeVideoId, r]));
    const histSet = new Set(history.map((h) => h.youtubeVideoId || h.itemKey));
    const subMap = new Map(ytSubscriptions.map((s) => [s.handle.toLowerCase(), s]));
    const channels = rawChannels
      .map((ch) => {
        const handle = ch.handle.startsWith('@') ? ch.handle : `@${ch.handle}`;
        const existingSub = subMap.get(handle.toLowerCase());
        return {
          ...ch,
          handle,
          isSubscribed: Boolean(existingSub && existingSub.trustLevel !== 'BLOCKED'),
          trustLevel: existingSub?.trustLevel || 'SUPERVISED'
        };
      })
      .filter((ch) => ch.trustLevel !== 'BLOCKED');

    const results = await Promise.all(
      rawResults.map(async (item) => {
        const curated = await db.getVideoByYouTubeId(item.youtubeVideoId);
        const reqItem = reqMap.get(item.youtubeVideoId);
        const inHistory = histSet.has(item.youtubeVideoId);
        return {
          ...item,
          sourceType: 'YOUTUBE' as const,
          sourceUrl: `https://www.youtube.com/watch?v=${item.youtubeVideoId}`,
          isCurated: Boolean(curated),
          curatedVideoId: curated?.id || null,
          approvalStatus: reqItem?.status || (inHistory ? 'APPROVED' : null),
          inHistory
        };
      })
    );

    try {
      await db.addKidYouTubeSearchHistory({
        id: `ysh-${uuidv4().slice(0, 12)}`,
        kidId: user.id,
        query: q,
        resultsCount: results.length,
        regionCode,
        searchedAt: new Date().toISOString()
      });
    } catch {
      // Non-fatal search logging
    }

    res.json({
      success: true,
      data: {
        results,
        channels,
        regionCode,
        languageCode,
        searchSettings: {
          youtubeSearchEnabled: effective.youtubeSearchEnabled,
          searchViewLimit: effective.searchViewLimit,
          searchViewsUsed: user.searchViewsUsed ?? 0,
          searchRequireApproval: effective.searchRequireApproval
        }
      }
    });
  })
);

// Kid: list subscribed YouTube channels (@handle)
apiRouter.get(
  '/kids/youtube-subscriptions',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const subs = (await db.getKidYouTubeSubscriptions(req.user!.sub)).filter(
      (s) => s.trustLevel !== 'BLOCKED'
    );
    res.json({ success: true, data: subs });
  })
);

// Kid: subscribe to a YouTube channel (@handle)
apiRouter.post(
  '/kids/youtube-subscriptions',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawHandle = String(req.body?.handle || '').trim();
    if (!rawHandle) {
      return res.status(400).json({ success: false, message: 'Channel @handle is required' });
    }
    const handle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;
    const title = String(req.body?.title || handle).trim();
    const avatarUrl = String(
      req.body?.avatarUrl || 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=200&h=200&fit=crop'
    ).trim();
    const channelId = req.body?.channelId ? String(req.body.channelId).trim() : undefined;
    const description = req.body?.description ? String(req.body.description).trim() : undefined;

    const saved = await db.upsertKidYouTubeSubscription({
      id: `ytsub-${req.user!.sub}-${handle.toLowerCase()}`,
      kidId: req.user!.sub,
      handle,
      channelId,
      title,
      avatarUrl,
      description,
      subscribedAt: new Date().toISOString()
    });
    res.json({ success: true, data: saved });
  })
);

// Kid: unsubscribe from a YouTube channel (@handle)
apiRouter.delete(
  '/kids/youtube-subscriptions/:handle',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawHandle = String(req.params.handle || '').trim();
    const handle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;
    await db.removeKidYouTubeSubscription(req.user!.sub, handle);
    res.json({ success: true, data: { handle } });
  })
);

// Kid: view a YouTube channel (@handle) detail and its video list
apiRouter.get(
  '/kids/youtube-channels/:handle',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawHandle = String(req.params.handle || '').trim();
    if (!rawHandle) {
      return res.status(400).json({ success: false, message: 'Channel @handle is required' });
    }
    const handle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;
    const [info, existingRequests, history, subs] = await Promise.all([
      fetchYouTubeChannelInfo(handle),
      db.getKidVideoRequestsForKid(req.user!.sub),
      db.getKidHistory(req.user!.sub),
      db.getKidYouTubeSubscriptions(req.user!.sub)
    ]);
    if (!info) {
      return res.status(404).json({ success: false, message: `Could not load YouTube channel ${handle}` });
    }
    const reqMap = new Map(existingRequests.map((r) => [r.youtubeVideoId, r]));
    const histSet = new Set(history.map((h) => h.youtubeVideoId || h.itemKey));
    const matchedSub = subs.find((s) => s.handle.toLowerCase() === handle.toLowerCase());
    if (matchedSub?.trustLevel === 'BLOCKED') {
      return res.status(403).json({
        success: false,
        message: 'This YouTube channel has been blocked by your parent.'
      });
    }
    const isSubscribed = Boolean(matchedSub);
    const isTrustedChannel = matchedSub?.trustLevel === 'TRUSTED';

    const videos = await Promise.all(
      (info.videos || []).map(async (v) => {
        const curated = await db.getVideoByYouTubeId(v.videoId);
        const reqItem = reqMap.get(v.videoId);
        const inHistory = histSet.has(v.videoId);
        return {
          youtubeVideoId: v.videoId,
          title: v.title,
          channelTitle: `${info.title} (${handle})`,
          thumbnailUrl: v.thumbnailUrl,
          sourceType: 'YOUTUBE' as const,
          sourceUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
          isCurated: Boolean(curated),
          curatedVideoId: curated?.id || null,
          approvalStatus: reqItem?.status || (inHistory || isTrustedChannel ? 'APPROVED' : null),
          inHistory: inHistory || isTrustedChannel
        };
      })
    );

    res.json({
      success: true,
      data: {
        channel: {
          handle,
          channelId: info.channelId,
          title: info.title.startsWith('@') ? info.title : `${info.title} (${handle})`,
          description: info.description,
          avatarUrl: info.avatarUrl,
          isSubscribed,
          trustLevel: matchedSub?.trustLevel || 'SUPERVISED'
        },
        videos,
        playlists: info.playlists || []
      }
    });
  })
);

// Kid: view videos inside a specific YouTube playlist (from a @channel)
apiRouter.get(
  '/kids/youtube-playlists/:playlistId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const playlistId = String(req.params.playlistId || '').trim();
    if (!playlistId) {
      return res.status(400).json({ success: false, message: 'playlistId is required' });
    }
    const rawHandle = String(req.query.handle || '').trim();
    const handle = rawHandle
      ? rawHandle.startsWith('@')
        ? rawHandle
        : `@${rawHandle}`
      : '';

    const [plInfo, existingRequests, history, subs] = await Promise.all([
      fetchYouTubePlaylistVideos(playlistId),
      db.getKidVideoRequestsForKid(req.user!.sub),
      db.getKidHistory(req.user!.sub),
      db.getKidYouTubeSubscriptions(req.user!.sub)
    ]);

    if (!plInfo) {
      return res.status(404).json({ success: false, message: 'Could not load YouTube playlist' });
    }

    const reqMap = new Map(existingRequests.map((r) => [r.youtubeVideoId, r]));
    const histSet = new Set(history.map((h) => h.youtubeVideoId || h.itemKey));
    const matchedSub = handle
      ? subs.find((s) => s.handle.toLowerCase() === handle.toLowerCase())
      : undefined;

    if (matchedSub?.trustLevel === 'BLOCKED') {
      return res.status(403).json({
        success: false,
        message: 'This YouTube channel has been blocked by your parent.'
      });
    }
    const isTrustedChannel = matchedSub?.trustLevel === 'TRUSTED';
    const channelLabel = matchedSub
      ? `${matchedSub.title} (${matchedSub.handle})`
      : handle || 'YouTube';

    const videos = await Promise.all(
      (plInfo.videos || []).map(async (v) => {
        const curated = await db.getVideoByYouTubeId(v.videoId);
        const reqItem = reqMap.get(v.videoId);
        const inHistory = histSet.has(v.videoId);
        return {
          youtubeVideoId: v.videoId,
          title: v.title,
          channelTitle: channelLabel,
          thumbnailUrl: v.thumbnailUrl,
          sourceType: 'YOUTUBE' as const,
          sourceUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
          isCurated: Boolean(curated),
          curatedVideoId: curated?.id || null,
          approvalStatus: reqItem?.status || (inHistory || isTrustedChannel ? 'APPROVED' : null),
          inHistory: inHistory || isTrustedChannel
        };
      })
    );

    res.json({
      success: true,
      data: {
        playlistId: plInfo.playlistId,
        title: plInfo.title,
        handle: handle || null,
        videos
      }
    });
  })
);

// Kid: request or start watching a searched YouTube video
apiRouter.post(
  '/kids/youtube-search/watch',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await db.getUserById(req.user!.sub);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const parentUser =
      user.role === 'CHILD' && user.parentId ? await db.getUserById(user.parentId) : undefined;
    const effective =
      user.role === 'CHILD'
        ? resolveEffectiveParentalControls(parentUser, user)
        : getGlobalParentalControls(user);

    const youtubeVideoId = extractYouTubeId(String(req.body?.youtubeVideoId || ''));
    if (!youtubeVideoId) {
      return res.status(400).json({ success: false, message: 'Valid youtubeVideoId is required' });
    }
    const title = String(req.body?.title || `YouTube Video (${youtubeVideoId})`).trim();
    const channelTitle = String(req.body?.channelTitle || 'YouTube').trim();
    const thumbnailUrl = String(req.body?.thumbnailUrl || getYouTubeThumbnail(youtubeVideoId)).trim();

    const [curated, existingReq, history, ytSubs] = await Promise.all([
      db.getVideoByYouTubeId(youtubeVideoId),
      db.getKidVideoRequest(user.id, youtubeVideoId),
      db.getKidHistory(user.id),
      db.getKidYouTubeSubscriptions(user.id)
    ]);
    const inHistory = history.some((h) => h.youtubeVideoId === youtubeVideoId || h.itemKey === youtubeVideoId);
    const lowerChannelTitle = channelTitle.toLowerCase();
    const matchedSub = ytSubs.find(
      (s) =>
        lowerChannelTitle.includes(s.handle.toLowerCase()) ||
        (s.title && lowerChannelTitle === s.title.toLowerCase())
    );

    const searchSettings = {
      youtubeSearchEnabled: effective.youtubeSearchEnabled,
      searchViewLimit: effective.searchViewLimit,
      searchViewsUsed: user.searchViewsUsed ?? 0,
      searchRequireApproval: effective.searchRequireApproval
    };

    if (matchedSub?.trustLevel === 'BLOCKED') {
      return res.json({
        success: true,
        data: {
          allowed: false,
          reason: 'CHANNEL_BLOCKED',
          message: `The YouTube channel ${matchedSub.handle} is blocked by your parent.`,
          searchSettings
        }
      });
    }

    // Curated, parent-trusted @channel, or already approved/in-history videos play anytime without approval or quota
    if (curated || existingReq?.status === 'APPROVED' || inHistory || matchedSub?.trustLevel === 'TRUSTED') {
      await db.upsertKidHistory({
        id: `hist-${user.id}-${youtubeVideoId}`,
        kidId: user.id,
        itemKey: youtubeVideoId,
        youtubeVideoId,
        videoId: curated?.id,
        title: curated?.title || title,
        channelTitle: curated?.channelTitle || channelTitle,
        thumbnailUrl: curated?.thumbnailUrl || thumbnailUrl,
        sourceType: 'YOUTUBE',
        sourceUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
        isApprovedSearch: !curated,
        watchedAt: new Date().toISOString()
      });
      return res.json({
        success: true,
        data: {
          allowed: true,
          reason: curated ? 'CURATED' : 'ALREADY_APPROVED',
          searchSettings
        }
      });
    }

    // Check view limit for non-curated searched videos (0 = unlimited)
    if (user.role === 'CHILD' && effective.ageRating === 'TODDLER') {
      return res.json({
        success: true,
        data: {
          allowed: false,
          reason: 'TODDLER_CANNOT_REQUEST',
          message: 'Toddlers cannot request video approvals. Only parent-approved videos can play.',
          searchSettings
        }
      });
    }
    if (user.role === 'CHILD' && !effective.youtubeSearchEnabled) {
      return res.status(403).json({
        success: false,
        message: 'YouTube search is currently disabled by your parent.'
      });
    }

    const limit = user.searchViewLimit ?? 0;
    const used = user.searchViewsUsed ?? 0;
    if (user.role === 'CHILD' && limit > 0 && used >= limit) {
      return res.json({
        success: true,
        data: {
          allowed: false,
          reason: 'VIEW_LIMIT_REACHED',
          message: `You have reached your parent's limit of ${limit} searched videos. Ask your parent to increase or reset the limit!`,
          searchSettings
        }
      });
    }

    // Check if parent approval is required before watching
    if (user.role === 'CHILD' && user.searchRequireApproval !== false) {
      const parentId = user.parentId || user.id;
      const savedReq = await db.upsertKidVideoRequest({
        id: existingReq?.id || `kvr-${uuidv4().slice(0, 8)}`,
        kidId: user.id,
        parentId,
        youtubeVideoId,
        title,
        channelTitle,
        thumbnailUrl,
        status: existingReq?.status === 'REJECTED' ? 'PENDING' : (existingReq?.status || 'PENDING'),
        createdAt: new Date().toISOString(),
        decidedAt: null
      });

      let emailSent = false;
      const parentUser = user.parentId ? await db.getUserById(user.parentId) : undefined;
      if (parentUser) {
        await db.createNotification(
          parentUser.id,
          'VIDEO_REQUEST',
          'New Video Request',
          `${user.name || 'Your child'} asked to watch "${title}"`,
          savedReq.id
        );
      }
      if (parentUser?.email) {
        try {
          const actionToken = signVideoRequestActionToken({
            requestId: savedReq.id,
            parentId: parentUser.id,
            kidId: user.id,
            youtubeVideoId
          });
          const stats = await db.getYouTubeVideoParentStats(youtubeVideoId);
          await sendParentVideoRequestEmail({
            toEmail: parentUser.email,
            parentName: parentUser.name || 'Parent',
            kidName: user.name || 'Your child',
            kidEmail: user.email,
            requestId: savedReq.id,
            youtubeVideoId,
            title,
            channelTitle,
            thumbnailUrl,
            actionToken,
            approvedCount: stats.approvedCount,
            declinedCount: stats.declinedCount
          });
          emailSent = true;
        } catch (err) {
          console.error('Failed to send parent video request notification email:', err);
        }
      }

      return res.json({
        success: true,
        data: {
          allowed: false,
          reason: 'APPROVAL_REQUIRED',
          request: savedReq,
          emailSent,
          message: emailSent
            ? `Permission request emailed to your parent (${parentUser?.email})! Once approved, this video will appear in your History.`
            : 'Permission request sent to your parent! Once approved, this video will appear in your History.',
          searchSettings
        }
      });
    }

    // Approval not required -> increment count and add to history
    if (user.role === 'CHILD') {
      await db.incrementKidSearchViewsUsed(user.id);
    }
    await db.upsertKidHistory({
      id: `hist-${user.id}-${youtubeVideoId}`,
      kidId: user.id,
      itemKey: youtubeVideoId,
      youtubeVideoId,
      title,
      channelTitle,
      thumbnailUrl,
      sourceType: 'YOUTUBE',
      sourceUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
      isApprovedSearch: true,
      watchedAt: new Date().toISOString()
    });

    const refreshed = await db.getUserById(user.id);
    return res.json({
      success: true,
      data: {
        allowed: true,
        reason: 'AUTO_APPROVED',
        searchSettings: {
          youtubeSearchEnabled: Boolean(refreshed?.youtubeSearchEnabled),
          searchViewLimit: refreshed?.searchViewLimit ?? 0,
          searchViewsUsed: refreshed?.searchViewsUsed ?? 0,
          searchRequireApproval: refreshed?.searchRequireApproval !== false
        }
      }
    });
  })
);

// Kid: watch history (includes all approved searched videos)
apiRouter.get(
  '/kids/history',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const history = await db.getKidHistory(req.user!.sub);
    res.json({ success: true, data: history });
  })
);

apiRouter.post(
  '/kids/history',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { itemKey, youtubeVideoId, videoId, title, channelTitle, thumbnailUrl, sourceType, sourceUrl } = req.body || {};
    const key = String(itemKey || youtubeVideoId || videoId || '').trim();
    if (!key || !title || !sourceUrl) {
      return res.status(400).json({ success: false, message: 'itemKey, title, and sourceUrl are required' });
    }
    const saved = await db.upsertKidHistory({
      id: `hist-${req.user!.sub}-${key}`,
      kidId: req.user!.sub,
      itemKey: key,
      youtubeVideoId: youtubeVideoId ? String(youtubeVideoId) : undefined,
      videoId: videoId ? String(videoId) : undefined,
      title: String(title),
      channelTitle: String(channelTitle || 'FamiTube'),
      thumbnailUrl: String(thumbnailUrl || ''),
      sourceType: sourceType === 'DIRECT' ? 'DIRECT' : 'YOUTUBE',
      sourceUrl: String(sourceUrl),
      isApprovedSearch: false,
      watchedAt: new Date().toISOString()
    });
    res.json({ success: true, data: saved });
  })
);

// Parent: view a child's YouTube search history, video requests, and video viewing history
apiRouter.get(
  '/parent/children/:childId/activity-history',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const childId = String(req.params.childId);
    const children = await db.getChildrenByParentId(req.user!.sub);
    if (!children.some((c) => c.id === childId)) {
      return res.status(404).json({ success: false, message: 'Child account not found' });
    }
    const [searchHistory, videoRequests, watchHistory, youtubeSubscriptions] = await Promise.all([
      db.getKidYouTubeSearchHistory(childId, 150),
      db.getKidVideoRequestsForKid(childId),
      db.getKidHistory(childId),
      db.getKidYouTubeSubscriptions(childId)
    ]);
    res.json({
      success: true,
      data: {
        searchHistory,
        videoRequests,
        watchHistory,
        youtubeSubscriptions
      }
    });
  })
);

// Parent: update trust level (SUPERVISED, TRUSTED, BLOCKED) or remove a child's @YouTube subscription
apiRouter.put(
  '/parent/children/:childId/youtube-subscriptions/:handle',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const childId = String(req.params.childId);
    const children = await db.getChildrenByParentId(req.user!.sub);
    if (!children.some((c) => c.id === childId)) {
      return res.status(404).json({ success: false, message: 'Child account not found' });
    }
    const rawHandle = String(req.params.handle || '').trim();
    const handle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;
    const trustLevel = String(req.body?.trustLevel || 'SUPERVISED').toUpperCase();
    if (!['SUPERVISED', 'TRUSTED', 'BLOCKED'].includes(trustLevel)) {
      return res.status(400).json({ success: false, message: 'trustLevel must be SUPERVISED, TRUSTED, or BLOCKED' });
    }
    const updated = await db.setKidYouTubeSubscriptionTrustLevel(
      childId,
      handle,
      trustLevel as 'SUPERVISED' | 'TRUSTED' | 'BLOCKED'
    );
    if (!updated) {
      return res.status(404).json({ success: false, message: 'YouTube channel subscription not found' });
    }
    res.json({ success: true, data: updated });
  })
);

apiRouter.delete(
  '/parent/children/:childId/youtube-subscriptions/:handle',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const childId = String(req.params.childId);
    const children = await db.getChildrenByParentId(req.user!.sub);
    if (!children.some((c) => c.id === childId)) {
      return res.status(404).json({ success: false, message: 'Child account not found' });
    }
    const rawHandle = String(req.params.handle || '').trim();
    const handle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;
    await db.removeKidYouTubeSubscription(childId, handle);
    res.json({ success: true, data: { handle } });
  })
);

apiRouter.delete(
  '/parent/children/:childId/search-history',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const childId = String(req.params.childId);
    const children = await db.getChildrenByParentId(req.user!.sub);
    if (!children.some((c) => c.id === childId)) {
      return res.status(404).json({ success: false, message: 'Child account not found' });
    }
    await db.clearKidYouTubeSearchHistory(childId);
    res.json({ success: true, message: 'YouTube search history cleared' });
  })
);

apiRouter.delete(
  '/parent/children/:childId/watch-history',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const childId = String(req.params.childId);
    const children = await db.getChildrenByParentId(req.user!.sub);
    if (!children.some((c) => c.id === childId)) {
      return res.status(404).json({ success: false, message: 'Child account not found' });
    }
    await db.clearKidWatchHistory(childId);
    res.json({ success: true, message: 'Video viewing history cleared' });
  })
);

// Notifications & Notification History (Parent & Child)
apiRouter.get(
  '/notifications',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const items = await db.getNotificationsForUser(req.user!.sub, limit);
    const unreadCount = items.filter((n) => !n.isRead).length;
    res.json({ success: true, data: { items, unreadCount } });
  })
);

apiRouter.post(
  '/notifications/:id/read',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const updated = await db.markNotificationRead(String(req.params.id), req.user!.sub);
    res.json({ success: true, data: { updated } });
  })
);

apiRouter.post(
  '/notifications/read-all',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await db.markAllNotificationsRead(req.user!.sub);
    res.json({ success: true, message: 'All notifications marked as read' });
  })
);

apiRouter.delete(
  '/notifications',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await db.clearNotificationsForUser(req.user!.sub);
    res.json({ success: true, message: 'Notification history cleared' });
  })
);

// Kid: personal playlists
apiRouter.get(
  '/kids/playlists',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const dbUser = await db.getUserById(req.user!.sub);
    if (dbUser?.role === 'CHILD' && dbUser.ageRating === 'TODDLER') {
      return res.json({ success: true, data: [] });
    }
    const playlists = await db.getKidPlaylists(req.user!.sub);
    res.json({ success: true, data: playlists });
  })
);

apiRouter.post(
  '/kids/playlists',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const title = String(req.body?.title || '').trim();
    if (!title) {
      return res.status(400).json({ success: false, message: 'Playlist title is required' });
    }
    const dbUser = await db.getUserById(req.user!.sub);
    if (dbUser?.role === 'CHILD' && dbUser.ageRating === 'TODDLER') {
      return res.status(403).json({ success: false, message: 'Playlists are not available for Toddler profiles.' });
    }
    if (dbUser) {
      const entitlements = await db.getEffectiveEntitlements(dbUser);
      if (entitlements.maxPlaylists !== null) {
        const currentPlaylists = await db.getKidPlaylists(req.user!.sub);
        if (currentPlaylists.length >= entitlements.maxPlaylists) {
          return res.status(403).json(
            buildPremiumRequiredPayload(
              'unlimited_playlists',
              `Free plan supports up to ${entitlements.maxPlaylists} custom playlist. Upgrade to Family Pass for unlimited playlists.`,
              entitlements.maxPlaylists
            )
          );
        }
      }
    }
    const pl = await db.createKidPlaylist(req.user!.sub, title);
    res.status(201).json({ success: true, data: pl });
  })
);

apiRouter.post(
  '/kids/playlists/:playlistId/items',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const dbUser = await db.getUserById(req.user!.sub);
    if (dbUser?.role === 'CHILD' && dbUser.ageRating === 'TODDLER') {
      return res.status(403).json({ success: false, message: 'Toddlers cannot add videos to playlists.' });
    }
    const playlistId = String(req.params.playlistId);
    const { key, youtubeVideoId, videoId, title, channelTitle, thumbnailUrl, sourceType, sourceUrl } = req.body || {};
    const resolvedKey = String(key || youtubeVideoId || videoId || '').trim();
    if (!resolvedKey || !title || !sourceUrl) {
      return res.status(400).json({ success: false, message: 'key, title, and sourceUrl are required' });
    }
    const updated = await db.addItemToKidPlaylist(req.user!.sub, playlistId, {
      key: resolvedKey,
      youtubeVideoId: youtubeVideoId ? String(youtubeVideoId) : undefined,
      videoId: videoId ? String(videoId) : undefined,
      title: String(title),
      channelTitle: String(channelTitle || 'YouTube'),
      thumbnailUrl: String(thumbnailUrl || ''),
      sourceType: sourceType === 'DIRECT' ? 'DIRECT' : 'YOUTUBE',
      sourceUrl: String(sourceUrl),
      addedAt: new Date().toISOString()
    });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Playlist not found' });
    }
    res.json({ success: true, data: updated });
  })
);

apiRouter.delete(
  '/kids/playlists/:playlistId/items/:itemKey',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const updated = await db.removeItemFromKidPlaylist(
      req.user!.sub,
      String(req.params.playlistId),
      String(req.params.itemKey)
    );
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Playlist not found' });
    }
    res.json({ success: true, data: updated });
  })
);

apiRouter.delete(
  '/kids/playlists/:playlistId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ok = await db.deleteKidPlaylist(req.user!.sub, String(req.params.playlistId));
    if (!ok) {
      return res.status(404).json({ success: false, message: 'Playlist not found' });
    }
    res.json({ success: true, message: 'Playlist deleted' });
  })
);

// Kid: gamification stats & achievements (single source of truth for Web & Android)
async function computeKidAchievementsSummary(kidId: string) {
  const [user, history, playlists, storiesRead] = await Promise.all([
    db.getUserById(kidId),
    db.getKidHistory(kidId),
    db.getKidPlaylists(kidId),
    db.getKidStoriesReadCount(kidId)
  ]);

  const videosWatched = history.length;
  const approvedSearches = history.filter((h) => h.isApprovedSearch).length;
  const playlistsCreated = playlists.length;
  const playlistItemsCount = playlists.reduce((sum, pl) => sum + (pl.items?.length || 0), 0);

    const definitions = [
      {
        id: 'first_watch',
        title: 'First Watch',
        description: 'Watch your very first video on FamiTube',
        icon: 'ðŸŽ¬',
        progress: Math.min(videosWatched, 1),
        target: 1,
        rewardFamibux: 20,
        rewardStars: 20
      },
      {
        id: 'video_explorer',
        title: 'Video Explorer',
        description: 'Watch 5 different videos',
        icon: 'ðŸš€',
        progress: Math.min(videosWatched, 5),
        target: 5,
        rewardFamibux: 50,
        rewardStars: 50
      },
      {
        id: 'super_viewer',
        title: 'Super Viewer',
        description: 'Watch 15 videos in your library',
        icon: 'ðŸŒŸ',
        progress: Math.min(videosWatched, 15),
        target: 15,
        rewardFamibux: 120,
        rewardStars: 120
      },
      {
        id: 'playlist_maker',
        title: 'Playlist Maker',
        description: 'Create your first personal favorites list',
        icon: 'ðŸŽµ',
        progress: Math.min(playlistsCreated, 1),
        target: 1,
        rewardFamibux: 25,
        rewardStars: 25
      },
      {
        id: 'curator_junior',
        title: 'Junior Curator',
        description: 'Save 5 videos into your favorites lists',
        icon: 'ðŸ“š',
        progress: Math.min(playlistItemsCount, 5),
        target: 5,
        rewardFamibux: 60,
        rewardStars: 60
      },
      {
        id: 'safe_searcher',
        title: 'Safe Searcher',
        description: 'Watch a parent-approved YouTube search video',
        icon: 'ðŸ”',
        progress: Math.min(approvedSearches, 1),
        target: 1,
        rewardFamibux: 30,
        rewardStars: 30
      }
    ];

    const achievements = definitions.map((a) => ({
      ...a,
      unlocked: a.progress >= a.target
    }));

    const activityFamibux =
      videosWatched * 15 +
      playlistsCreated * 10 +
      playlistItemsCount * 5;
    const bonusFamibux = achievements
      .filter((a) => a.unlocked)
      .reduce((sum, a) => sum + (a.rewardFamibux || a.rewardStars), 0);
    const famibux = Math.max(0, activityFamibux + bonusFamibux + (user?.bonusStars || 0));

    // Gamification leveling is based EXCLUSIVELY on unlocked badges (achievements)
    const unlockedCount = achievements.filter((a) => a.unlocked).length;
    const totalCount = achievements.length;

    const levels = [
      { level: 1, title: 'Curious Explorer', minBadges: 0, nextBadges: 1 },
      { level: 2, title: 'Science Sprout', minBadges: 1, nextBadges: 2 },
      { level: 3, title: 'Knowledge Seeker', minBadges: 2, nextBadges: 4 },
      { level: 4, title: 'Super Learner', minBadges: 4, nextBadges: 6 },
      { level: 5, title: 'FamiTube Legend', minBadges: 6, nextBadges: 6 }
    ];
    const currentLevel = [...levels].reverse().find((l) => unlockedCount >= l.minBadges) || levels[0];
    const progressPercent =
      currentLevel.level === 5
        ? 100
        : Math.min(
            100,
            Math.round(
              ((unlockedCount - currentLevel.minBadges) /
                (currentLevel.nextBadges - currentLevel.minBadges)) *
                100
            )
          );

    return {
      famibux,
      stars: famibux, // backwards compatibility
      level: currentLevel.level,
      levelTitle: currentLevel.title,
      nextLevelBadges: currentLevel.nextBadges,
      nextLevelStars: currentLevel.nextBadges, // compatibility alias
      progressPercent,
      unlockedCount,
      totalCount,
      stats: {
        videosWatched,
        approvedSearches,
        playlistsCreated,
        playlistItemsCount,
        storiesRead
      },
      achievements
    };
}

// Famibux API alias endpoints
apiRouter.post(
  '/kids/famibux/award',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const amount = Math.trunc(Number(req.body?.amount ?? 0));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
      return res.status(400).json({ success: false, message: 'Amount must be between 1 and 10000' });
    }
    await db.adjustUserBonusStars(req.user!.sub, amount);
    const data = await computeKidAchievementsSummary(req.user!.sub);
    res.json({ success: true, data });
  })
);

apiRouter.post(
  '/kids/famibux/spend',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const cost = Math.trunc(Number(req.body?.cost ?? 0));
    if (!Number.isFinite(cost) || cost <= 0) {
      return res.status(400).json({ success: false, message: 'Cost must be positive' });
    }
    const current = await computeKidAchievementsSummary(req.user!.sub);
    if (current.famibux < cost) {
      return res.status(400).json({ success: false, message: 'Not enough Famibux', data: current });
    }
    await db.adjustUserBonusStars(req.user!.sub, -cost);
    const data = await computeKidAchievementsSummary(req.user!.sub);
    res.json({ success: true, data });
  })
);
apiRouter.get(
  '/kids/achievements',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = await computeKidAchievementsSummary(req.user!.sub);
    res.json({ success: true, data });
  })
);

apiRouter.post(
  '/kids/stars/award',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const amount = Math.trunc(Number(req.body?.amount ?? 0));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
      return res.status(400).json({ success: false, message: 'Amount must be between 1 and 10000' });
    }
    await db.adjustUserBonusStars(req.user!.sub, amount);
    const data = await computeKidAchievementsSummary(req.user!.sub);
    res.json({ success: true, data });
  })
);

apiRouter.post(
  '/kids/stars/spend',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const cost = Math.trunc(Number(req.body?.cost ?? 0));
    if (!Number.isFinite(cost) || cost <= 0) {
      return res.status(400).json({ success: false, message: 'Cost must be positive' });
    }
    const current = await computeKidAchievementsSummary(req.user!.sub);
    if (current.stars < cost) {
      return res.status(400).json({ success: false, message: 'Not enough stars', data: current });
    }
    await db.adjustUserBonusStars(req.user!.sub, -cost);
    const data = await computeKidAchievementsSummary(req.user!.sub);
    res.json({ success: true, data });
  })
);

// ==========================================
// PARENT VIDEO APPROPRIATENESS REVIEWS & ADVISORY LISTS
// ==========================================

// Public/Parent: get parent reviews and summary for a video
apiRouter.get(
  '/videos/:videoKey/reviews',
  asyncHandler(async (req, res) => {
    const videoKey = String(req.params.videoKey);
    const reviews = await db.getVideoParentReviews(videoKey);
    const recommendedCount = reviews.filter((r) => r.rating === 'RECOMMENDED').length;
    const cautionCount = reviews.filter((r) => r.rating === 'CAUTION').length;
    res.json({
      success: true,
      data: {
        reviews,
        summary: { recommendedCount, cautionCount }
      }
    });
  })
);

// Parent: comment and rate whether a video is appropriate (RECOMMENDED) or not (CAUTION)
apiRouter.post(
  '/parent/videos/:videoKey/reviews',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const videoKey = String(req.params.videoKey).trim();
    const rating = String(req.body?.rating || '').toUpperCase();
    const comment = String(req.body?.comment || '').trim();
    const {
      videoId,
      youtubeVideoId,
      videoTitle,
      channelTitle,
      thumbnailUrl,
      sourceType,
      sourceUrl
    } = req.body || {};

    if (rating !== 'RECOMMENDED' && rating !== 'CAUTION') {
      return res.status(400).json({ success: false, message: 'rating must be RECOMMENDED or CAUTION' });
    }
    if (!comment) {
      return res.status(400).json({ success: false, message: 'Please include a comment explaining your rating' });
    }

    const parent = await db.getUserById(req.user!.sub);
    const nowIso = new Date().toISOString();
    const saved = await db.upsertVideoParentReview({
      id: `vpr-${uuidv4().slice(0, 8)}`,
      videoKey,
      videoId: videoId ? String(videoId) : undefined,
      youtubeVideoId: youtubeVideoId ? String(youtubeVideoId) : undefined,
      videoTitle: String(videoTitle || 'Video'),
      channelTitle: String(channelTitle || 'FamiTube'),
      thumbnailUrl: String(thumbnailUrl || (youtubeVideoId ? getYouTubeThumbnail(String(youtubeVideoId)) : '')),
      sourceType: sourceType === 'DIRECT' ? 'DIRECT' : 'YOUTUBE',
      sourceUrl: String(sourceUrl || (youtubeVideoId ? `https://www.youtube.com/watch?v=${youtubeVideoId}` : '')),
      parentId: req.user!.sub,
      parentName: parent?.name || req.user!.name || req.user!.email,
      rating,
      comment,
      createdAt: nowIso,
      updatedAt: nowIso
    });

    res.status(201).json({ success: true, data: saved });
  })
);

// Parent: list Recommended & Caution video lists to help other parents curating channels
apiRouter.get(
  '/parent/advisory-lists',
  requireAuth,
  requireParent,
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    const lists = await db.getParentCuratorAdvisoryLists();
    res.json({ success: true, data: lists });
  })
);

// ==========================================
// STORYBOOKS & READ-ALONG APIS
// ==========================================

const STORY_CATEGORIES_DEFINITIONS = [
  // Toddler categories (Ages 1.5 - 3)
  {
    id: 'Animals & Pets',
    name: 'Animals & Pets',
    emoji: '🐾',
    description: 'Cute animals, furry pets, and baby wildlife friends.',
    ageRatings: ['TODDLER']
  },
  {
    id: 'Colors & First Words',
    name: 'Colors & First Words',
    emoji: '🎨',
    description: 'Bright picture books exploring colors, counting, and early words.',
    ageRatings: ['TODDLER']
  },
  {
    id: 'Bedtime & Sleep',
    name: 'Bedtime & Sleep',
    emoji: '🌙',
    description: 'Gentle, comforting stories to help little ones drift off to dream.',
    ageRatings: ['TODDLER']
  },
  {
    id: 'Family & Daily Life',
    name: 'Family & Daily Life',
    emoji: '🏡',
    description: 'Warm moments with mom, dad, playtime, and daily adventures.',
    ageRatings: ['TODDLER']
  },
  {
    id: 'Rhymes & Music',
    name: 'Rhymes & Music',
    emoji: '🎶',
    description: 'Rhythmic tales, funny sounds, and catchy story songs.',
    ageRatings: ['TODDLER']
  },

  // Young Kids categories (Ages 4 - 6 / 5 - 8)
  {
    id: 'Friendship & Kindness',
    name: 'Friendship & Kindness',
    emoji: '🤝',
    description: 'Stories about sharing, empathy, and making good friends.',
    ageRatings: ['YOUNG_KIDS']
  },
  {
    id: 'Folk Tales & Legends',
    name: 'Folk Tales & Legends',
    emoji: '🌍',
    description: 'Timeless folklore, Indonesian heritage stories, and world legends.',
    ageRatings: ['YOUNG_KIDS']
  },
  {
    id: 'Funny & Silly Stories',
    name: 'Funny & Silly Stories',
    emoji: '😄',
    description: 'Giggle-filled misadventures, playful tricks, and comedic tales.',
    ageRatings: ['YOUNG_KIDS']
  },
  {
    id: 'Nature & Science',
    name: 'Nature & Science',
    emoji: '🌿',
    description: 'Curious questions about the Earth, sky, plants, and discoveries.',
    ageRatings: ['YOUNG_KIDS']
  },
  {
    id: 'Animal Adventures',
    name: 'Animal Adventures',
    emoji: '🦊',
    description: 'Clever animals, jungle expeditions, and wild adventures.',
    ageRatings: ['YOUNG_KIDS']
  },
  {
    id: 'Courage & Growing Up',
    name: 'Courage & Growing Up',
    emoji: '🦁',
    description: 'Overcoming fears, being brave, and learning life lessons.',
    ageRatings: ['YOUNG_KIDS']
  },

  // Faith & Values (applicable across age tiers if religion is enabled)
  {
    id: 'Faith & Values',
    name: 'Faith & Values',
    emoji: '🕊️',
    description: 'Curated stories reflecting faith, morals, and spiritual traditions.',
    ageRatings: ['TODDLER', 'YOUNG_KIDS']
  }
];

apiRouter.get(
  '/stories/categories',
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    let ageRating = req.query.ageRating ? String(req.query.ageRating).toUpperCase() : '';
    const includeAll = String(req.query.includeAllAges || '').toLowerCase() === 'true';

    let childReligion: string | null | undefined = undefined;
    if (req.query.religion !== undefined) {
      childReligion = normalizeReligion(req.query.religion);
    } else if (req.user?.sub) {
      const user = await db.getUserById(req.user.sub);
      if (user?.role === 'CHILD') {
        const parent = user.parentId ? await db.getUserById(user.parentId) : undefined;
        const effective = resolveEffectiveParentalControls(parent, user);
        if (!ageRating) ageRating = effective.ageRating;
        childReligion = effective.religion || null;
      }
    }

    let categories = STORY_CATEGORIES_DEFINITIONS;

    if (!includeAll && ageRating) {
      if (ageRating === 'TODDLER') {
        categories = categories.filter(c => c.ageRatings.includes('TODDLER'));
      } else if (ageRating === 'YOUNG_KIDS') {
        categories = categories.filter(c => c.ageRatings.includes('YOUNG_KIDS'));
      }
    }

    if (childReligion === null) {
      categories = categories.filter(c => c.id !== 'Faith & Values');
    }

    const allStories = await db.getStoryBooks({
      ageRating: ageRating || undefined,
      includeAllAges: includeAll,
      onlyApproved: true,
      childReligion
    });

    const categoriesWithCount = categories.map(cat => ({
      ...cat,
      count: allStories.filter(s => s.category.toLowerCase().includes(cat.id.toLowerCase())).length
    }));

    res.json({ success: true, data: categoriesWithCount });
  })
);

apiRouter.get(
  '/stories',
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    let ageRating = req.query.ageRating ? String(req.query.ageRating).toUpperCase() : '';
    let language = req.query.language ? String(req.query.language).toLowerCase() : '';
    const includeAllAges =
      String(req.query.includeAllAges || '').toLowerCase() === 'true' ||
      req.query.includeAllAges === '1';

    let childReligion: string | null | undefined = undefined;
    if (req.query.religion !== undefined) {
      childReligion = normalizeReligion(req.query.religion);
    } else if (req.query.childId) {
      const child = await db.getUserById(String(req.query.childId));
      if (child && child.role === 'CHILD') {
        const parent = child.parentId ? await db.getUserById(child.parentId) : undefined;
        const effective = resolveEffectiveParentalControls(parent, child);
        if (!ageRating) ageRating = effective.ageRating;
        // Language filter is removed for storybooks in child mode
        childReligion = effective.religion || null;
      }
    } else if (req.user?.sub) {
      const user = await db.getUserById(req.user.sub);
      if (user?.role === 'CHILD') {
        const parent = user.parentId ? await db.getUserById(user.parentId) : undefined;
        const effective = resolveEffectiveParentalControls(parent, user);
        if (!ageRating) ageRating = effective.ageRating;
        // Language filter is removed for storybooks in child mode
        childReligion = effective.religion || null;
      }
    }

    const search = req.query.search ? String(req.query.search).trim() : undefined;
    const category = req.query.category ? String(req.query.category).trim() : undefined;
    const page = req.query.page ? Math.max(1, parseInt(String(req.query.page), 10) || 1) : undefined;
    const limit = req.query.limit ? Math.max(1, parseInt(String(req.query.limit), 10) || 24) : undefined;

    const stories = await db.getStoryBooks({
      ageRating: ageRating || undefined,
      language: language || undefined,
      includeAllAges,
      onlyApproved: true,
      search,
      category,
      childReligion
    });

    let paged = stories;
    if (page !== undefined || limit !== undefined) {
      const p = page || 1;
      const l = limit || 24;
      paged = stories.slice((p - 1) * l, p * l);
    }

    res.json({
      success: true,
      data: paged,
      total: stories.length,
      page: page || 1,
      limit: limit || stories.length,
      totalPages: limit ? Math.max(1, Math.ceil(stories.length / limit)) : 1
    });
  })
);

apiRouter.get(
  '/stories/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const story = await db.getStoryBookById(String(req.params.id));
    if (!story) {
      return res.status(404).json({ success: false, message: 'Storybook not found' });
    }
    res.json({ success: true, data: story });
  })
);

apiRouter.post(
  '/kids/stories/:id/complete',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const story = await db.getStoryBookById(String(req.params.id));
    if (!story) {
      return res.status(404).json({ success: false, message: 'Storybook not found' });
    }
    const rawMode = String(req.body?.mode || 'READ_ALONG').toUpperCase();
    const mode: StoryReadingMode = rawMode === 'FLIP' ? 'FLIP' : 'READ_ALONG';
    const reward =
      mode === 'READ_ALONG'
        ? story.rewardFamibux
        : Math.max(5, Math.ceil(story.rewardFamibux * 0.5));

    const result = await db.completeKidStory(req.user!.sub, story.id, mode, reward);
    const summary = await computeKidAchievementsSummary(req.user!.sub);

    res.json({
      success: true,
      data: {
        awardedFamibux: result.awardedFamibux,
        alreadyRewardedToday: result.alreadyRewardedToday,
        storiesReadCount: result.storiesReadCount,
        mode,
        summary
      }
    });
  })
);

apiRouter.get(
  '/admin/stories',
  asyncHandler(async (req, res) => {
    const search = req.query.search ? String(req.query.search).trim() : undefined;
    const category = req.query.category ? String(req.query.category).trim() : undefined;
    const stories = await db.getStoryBooks({
      includeAllAges: true,
      onlyApproved: false,
      search,
      category
    });
    res.json({ success: true, data: stories, total: stories.length });
  })
);

apiRouter.post(
  '/admin/stories',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const title = String(req.body?.title || '').trim();
    const author = String(req.body?.author || 'FamiTube Storybooks').trim();
    const description = String(req.body?.description || '').trim();
    const coverUrl = String(
      req.body?.coverUrl ||
        'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&h=400&fit=crop'
    ).trim();
    const ageRating: StoryAgeRating =
      String(req.body?.ageRating || 'TODDLER').toUpperCase() === 'YOUNG_KIDS'
        ? 'YOUNG_KIDS'
        : 'TODDLER';
    const language: StoryLanguage =
      String(req.body?.language || 'en').toLowerCase() === 'id' ? 'id' : 'en';
    const rewardFamibux = Math.min(200, Math.max(5, Math.trunc(Number(req.body?.rewardFamibux ?? 25))));
    const rawPages = Array.isArray(req.body?.pages) ? req.body.pages : [];

    if (!title) {
      return res.status(400).json({ success: false, message: 'Story title is required' });
    }
    const pages: StoryPage[] = rawPages
      .map((p: Partial<StoryPage>, idx: number) => ({
        pageNumber: idx + 1,
        text: String(p?.text || '').trim(),
        imageUrl: String(p?.imageUrl || coverUrl).trim(),
        illustrationEmoji: p?.illustrationEmoji ? String(p.illustrationEmoji).trim() : '📖',
        bgColor: p?.bgColor ? String(p.bgColor).trim() : '#1E293B'
      }))
      .filter((p: StoryPage) => p.text.length > 0);

    if (pages.length < 2) {
      return res.status(400).json({ success: false, message: 'At least 2 pages with text are required' });
    }

    const created = await db.createStoryBook({
      id: `story-${uuidv4().slice(0, 8)}`,
      title,
      author,
      description: description || `${title} — interactive flip-book story`,
      coverUrl,
      ageRating,
      language,
      category: 'Stories & Reading',
      pages,
      rewardFamibux,
      isApproved: true,
      ownerId: req.user?.sub,
      createdAt: new Date().toISOString()
    });
    res.status(201).json({ success: true, data: created });
  })
);

apiRouter.put(
  '/admin/stories/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const body = req.body || {};
    const updates: Partial<StoryBook> = {};
    if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim();
    if (typeof body.author === 'string') updates.author = body.author.trim();
    if (typeof body.description === 'string') updates.description = body.description.trim();
    if (typeof body.coverUrl === 'string' && body.coverUrl.trim()) updates.coverUrl = body.coverUrl.trim();
    if (body.ageRating !== undefined) {
      updates.ageRating =
        String(body.ageRating).toUpperCase() === 'YOUNG_KIDS' ? 'YOUNG_KIDS' : 'TODDLER';
    }
    if (body.language !== undefined) {
      updates.language = String(body.language).toLowerCase() === 'id' ? 'id' : 'en';
    }
    if (body.rewardFamibux !== undefined) {
      updates.rewardFamibux = Math.min(200, Math.max(5, Math.trunc(Number(body.rewardFamibux))));
    }
    if (typeof body.isApproved === 'boolean') updates.isApproved = body.isApproved;
    if (Array.isArray(body.pages)) {
      const cleaned = body.pages
        .map((p: Partial<StoryPage>, idx: number) => ({
          pageNumber: idx + 1,
          text: String(p?.text || '').trim(),
          imageUrl: String(p?.imageUrl || updates.coverUrl || '').trim(),
          illustrationEmoji: p?.illustrationEmoji ? String(p.illustrationEmoji).trim() : '📖',
          bgColor: p?.bgColor ? String(p.bgColor).trim() : '#1E293B'
        }))
        .filter((p: StoryPage) => p.text.length > 0);
      if (cleaned.length < 2) {
        return res.status(400).json({ success: false, message: 'At least 2 pages with text are required' });
      }
      updates.pages = cleaned;
    }

    const updated = await db.updateStoryBook(id, updates);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Storybook not found' });
    }
    res.json({ success: true, data: updated });
  })
);

apiRouter.delete(
  '/admin/stories/:id',
  asyncHandler(async (req, res) => {
    const deleted = await db.deleteStoryBook(String(req.params.id));
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Storybook not found' });
    }
    res.json({ success: true, message: 'Storybook deleted' });
  })
);

// Client Crash Reporting & Telemetry
apiRouter.post(
  '/telemetry/crash-report',
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const b = req.body || {};
    if (!b.message && !b.stackTrace && !b.errorType) {
      return res.status(400).json({ success: false, message: 'Missing error details' });
    }

    const report = await db.saveClientCrashReport({
      appVersion: String(b.appVersion || 'Unknown').slice(0, 32),
      deviceModel: String(b.deviceModel || 'Unknown').slice(0, 128),
      osVersion: String(b.osVersion || 'Unknown').slice(0, 64),
      currentRoute: String(b.currentRoute || 'Unknown').slice(0, 128),
      errorType: String(b.errorType || 'Unknown').slice(0, 128),
      message: String(b.message || '').slice(0, 4000),
      stackTrace: String(b.stackTrace || '').slice(0, 50000),
      userId: req.user?.sub || b.userId || null,
      userRole: req.user?.role || b.userRole || null,
      createdAt: b.timestamp ? String(b.timestamp) : new Date().toISOString()
    });

    console.warn(`[Client Crash Report] Saved crash ${report.id} (${report.errorType}: ${report.message}) on ${report.deviceModel}`);

    res.json({ success: true, data: { id: report.id } });
  })
);

apiRouter.get(
  '/telemetry/crash-reports',
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const reports = await db.getClientCrashReports(limit);
    res.json({ success: true, data: reports });
  })
);
