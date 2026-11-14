import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';
import {
  AuthenticatedRequest,
  hashPassword,
  optionalAuth,
  requireAuth,
  requireParent,
  sendVerificationEmail,
  signAuthToken,
  verifyPassword
} from './auth.js';
import { extractYouTubeId, fetchYouTubeOEmbed, getYouTubeThumbnail } from './utils.js';
import {
  Video,
  AgeRating,
  Channel,
  ChannelVisibility,
  PermissionPreset,
  ChannelPermissions,
  PERMISSION_PRESETS,
  ChannelInvite,
  ChannelSuggestion,
  ChannelVideoComment,
  Playlist,
  ChannelType
} from './types.js';

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

// Get list of approved videos with optional filters
apiRouter.get(
  '/videos',
  asyncHandler(async (req, res) => {
    const { category, channelId, ageRating, search, featured } = req.query;

    const videos = await db.getVideos({
      category: category ? String(category) : undefined,
      channelId: channelId ? String(channelId) : undefined,
      ageRating: ageRating ? String(ageRating) : undefined,
      search: search ? String(search) : undefined,
      featured: featured !== undefined ? featured === 'true' : undefined,
      onlyApproved: true
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
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const video = await db.getVideoById(id);

    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    await db.incrementViews(id);

    const related = (await db.getVideos({ category: video.category, onlyApproved: true }))
      .filter((v) => v.id !== id)
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
  asyncHandler(async (_req, res) => {
    const categories = await db.getCategories();
    res.json({ success: true, data: categories });
  })
);

// Get Channels (public channels for client app)
apiRouter.get(
  '/channels',
  asyncHandler(async (_req, res) => {
    const channels = await db.getChannels({ onlyPublic: true });
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

    const videos = await db.getChannelVideos(id);
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
    res.json({ success: true, data: config });
  })
);

// ==========================================
// AUTHENTICATION APIS (Curator Login & Email Verification)
// ==========================================

apiRouter.post(
  '/auth/register',
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(name || cleanEmail.split('@')[0] || '').trim();

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

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const user = await db.createUser({
      id: `usr-${uuidv4().slice(0, 8)}`,
      email: cleanEmail,
      name: cleanName || 'Parent',
      passwordHash: hashPassword(String(password)),
      role: 'PARENT',
      isVerified: false,
      verificationToken,
      verificationExpiresAt,
      createdAt: new Date().toISOString()
    });

    await sendVerificationEmail(user.email, user.name, verificationToken);

    res.status(201).json({
      success: true,
      message: 'Registration successful! Please check your email to verify your account before logging in.'
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
<head><meta charset="UTF-8"><title>KidsTube Email Verification</title>
<style>body{font-family:Arial,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
.card{background:#1e293b;padding:32px;border-radius:16px;max-width:440px;text-align:center;border:1px solid #334155;}
a.btn{display:inline-block;margin-top:16px;padding:10px 20px;background:#ff3366;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;}</style>
</head><body><div class="card"><h2>${ok ? 'Email Verified!' : 'Verification Failed'}</h2><p>${message}</p><a class="btn" href="${webUrl}">Go to KidsTube Studio</a></div></body></html>`);
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
    return sendResult(true, 200, 'Your email has been verified. You can now sign in to KidsTube Studio.');
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
    await sendVerificationEmail(user.email, user.name, verificationToken);

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
          message: 'This email is not registered. Ask your parent or guardian to register your email in KidsTube Studio first.'
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
        isVerified: user.isVerified
      }
    });
  })
);

apiRouter.get(
  '/auth/me',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const dbUser = await db.getUserById(req.user!.sub);
    res.json({
      success: true,
      user: {
        ...req.user,
        ageRating: dbUser?.ageRating
      }
    });
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
        channelTitle: 'KidsTube Media'
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
      channelTitle: resolvedChannel?.name || channelTitle || 'KidsTube Curators',
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
      channelType = 'ON_DEMAND',
      visibility = 'PUBLIC',
      videoIds = []
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Channel name is required' });
    }

    const validType: ChannelType = channelType === 'LIVE_TV' ? 'LIVE_TV' : 'ON_DEMAND';
    const validVisibility: ChannelVisibility = visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC';

    const newChannel: Channel = {
      id: `chan-${uuidv4().slice(0, 8)}`,
      name,
      description: description || '',
      avatarUrl:
        avatarUrl ||
        'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&h=200&fit=crop',
      bannerUrl: bannerUrl || '',
      category: category || 'Cartoons & Fun',
      isVerified: true,
      channelType: validType,
      scheduleStartTime: new Date().toISOString(),
      videoIds: Array.isArray(videoIds) ? videoIds : [],
      ownerId: req.user?.sub,
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
      channelType = 'ON_DEMAND',
      visibility = 'PUBLIC',
      videoIds = []
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Channel name is required' });
    }

    const validType: ChannelType = channelType === 'LIVE_TV' ? 'LIVE_TV' : 'ON_DEMAND';
    const validVisibility: ChannelVisibility = visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC';

    const newChannel: Channel = {
      id: `chan-${uuidv4().slice(0, 8)}`,
      name: String(name).trim(),
      description: String(description || ''),
      avatarUrl:
        avatarUrl ||
        'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&h=200&fit=crop',
      bannerUrl,
      category,
      isVerified: true,
      channelType: validType,
      scheduleStartTime: new Date().toISOString(),
      videoIds: Array.isArray(videoIds) ? videoIds : [],
      ownerId: req.user!.sub,
      visibility: validVisibility,
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
          ownerName: owner?.name || 'Parent'
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

// List child accounts registered by this parent
apiRouter.get(
  '/parent/children',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const children = await db.getChildrenByParentId(req.user!.sub);
    res.json({
      success: true,
      data: children.map((c) => ({
        id: c.id,
        email: c.email,
        name: c.name,
        role: c.role,
        ageRating: c.ageRating || 'ALL',
        createdAt: c.createdAt
      }))
    });
  })
);

// Register a child account by their email (Parent only)
apiRouter.post(
  '/parent/children',
  requireAuth,
  requireParent,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { email, name, password, ageRating = 'ALL' } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(name || '').trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Valid child email address is required' });
    }
    if (!cleanName) {
      return res.status(400).json({ success: false, message: 'Child name is required' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const existing = await db.getUserByEmail(cleanEmail);
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email is already registered' });
    }

    const validRatings: AgeRating[] = ['ALL', 'TODDLER', 'YOUNG_KIDS', 'OLDER_KIDS'];
    const resolvedRating: AgeRating = validRatings.includes(ageRating as AgeRating)
      ? (ageRating as AgeRating)
      : 'ALL';

    const child = await db.createUser({
      id: `chd-${uuidv4().slice(0, 8)}`,
      email: cleanEmail,
      name: cleanName,
      passwordHash: hashPassword(String(password)),
      role: 'CHILD',
      parentId: req.user!.sub,
      ageRating: resolvedRating,
      isVerified: true,
      createdAt: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      data: {
        id: child.id,
        email: child.email,
        name: child.name,
        role: child.role,
        ageRating: child.ageRating,
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
    const { name, ageRating, password } = req.body;
    if (password && String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const updated = await db.updateChildAccount(req.user!.sub, childId, {
      name: name ? String(name) : undefined,
      ageRating: ageRating as AgeRating | undefined,
      passwordHash: password ? hashPassword(String(password)) : undefined
    });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Child account not found' });
    }
    res.json({
      success: true,
      data: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        ageRating: updated.ageRating || 'ALL',
        createdAt: updated.createdAt
      }
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
    const accessibleChannels = await db.getChannelsForUser(parentOrSelfId);
    const ageRating = user.ageRating && user.ageRating !== 'ALL' ? user.ageRating : undefined;
    const videos = await db.getVideos({ ageRating, onlyApproved: true });

    res.json({
      success: true,
      data: {
        channels: accessibleChannels,
        videos
      }
    });
  })
);
