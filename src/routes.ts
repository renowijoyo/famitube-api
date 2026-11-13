import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';
import {
  AuthenticatedRequest,
  hashPassword,
  requireAuth,
  sendVerificationEmail,
  signAuthToken,
  verifyPassword
} from './auth.js';
import { extractYouTubeId, fetchYouTubeOEmbed, getYouTubeThumbnail } from './utils.js';
import { Video, Channel, Playlist, ChannelType } from './types.js';

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

// Get Channels
apiRouter.get(
  '/channels',
  asyncHandler(async (_req, res) => {
    const channels = await db.getChannels();
    res.json({ success: true, data: channels });
  })
);

// Get Channel details, its videos, and live schedule state (if LIVE_TV)
apiRouter.get(
  '/channels/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const channel = await db.getChannelById(id);

    if (!channel) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }

    const videos = await db.getChannelVideos(id);
    const liveState = channel.channelType === 'LIVE_TV' ? await db.getLiveChannelState(id) : null;

    res.json({
      success: true,
      data: {
        channel,
        videos,
        liveState
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
      name: cleanName || 'Curator',
      passwordHash: hashPassword(String(password)),
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

    if (!cleanEmail || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await db.getUserByEmail(cleanEmail);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
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
      name: user.name
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isVerified: user.isVerified
      }
    });
  })
);

apiRouter.get(
  '/auth/me',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    res.json({ success: true, user: req.user });
  })
);

// ==========================================
// ADMIN APIS (Curator Dashboard - Protected)
// ==========================================

apiRouter.use('/admin', requireAuth);

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

// Create Channel (supports ON_DEMAND or LIVE_TV)
apiRouter.post(
  '/admin/channels',
  asyncHandler(async (req, res) => {
    const {
      name,
      description,
      avatarUrl,
      bannerUrl,
      category,
      channelType = 'ON_DEMAND',
      videoIds = []
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Channel name is required' });
    }

    const validType: ChannelType = channelType === 'LIVE_TV' ? 'LIVE_TV' : 'ON_DEMAND';

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
      videoIds: Array.isArray(videoIds) ? videoIds : []
    };

    await db.addChannel(newChannel);
    res.status(201).json({ success: true, data: newChannel });
  })
);

// Update Channel (toggle ON_DEMAND <-> LIVE_TV, reorder videoIds, edit metadata)
apiRouter.put(
  '/admin/channels/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const updated = await db.updateChannel(id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    res.json({ success: true, data: updated });
  })
);

// Delete Channel
apiRouter.delete(
  '/admin/channels/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const deleted = await db.deleteChannel(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    res.json({ success: true, message: 'Channel deleted' });
  })
);

// Add a video to a channel
apiRouter.post(
  '/admin/channels/:id/videos',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
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

// Remove a video from a channel
apiRouter.delete(
  '/admin/channels/:id/videos/:videoId',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const videoId = String(req.params.videoId);
    const updated = await db.removeVideoFromChannel(id, videoId);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
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
