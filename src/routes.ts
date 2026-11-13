import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';
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
// ADMIN APIS (Curator Dashboard)
// ==========================================

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
