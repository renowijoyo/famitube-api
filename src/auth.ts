import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { db } from './db.js';
import { UserRole } from './types.js';

export interface AuthPayload {
  sub: string;
  email: string;
  name: string;
  role?: UserRole;
  parentId?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'kidstube-dev-secret-change-me';
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function signAuthToken(payload: AuthPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

export function verifyAuthToken(token: string): AuthPayload {
  return jwt.verify(token, getJwtSecret()) as AuthPayload;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const token = header.slice('Bearer '.length).trim();
    const decoded = verifyAuthToken(token);
    const user = await db.getUserById(decoded.sub);

    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid session' });
      return;
    }

    if (!user.isVerified) {
      res.status(403).json({
        success: false,
        needsVerification: true,
        message: 'Email verification required before accessing curation tools'
      });
      return;
    }

    req.user = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'PARENT',
      parentId: user.parentId
    };
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

export function requireParent(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || req.user.role !== 'PARENT') {
    res.status(403).json({
      success: false,
      message: 'Parent account required for this action'
    });
    return;
  }
  next();
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      const token = header.slice('Bearer '.length).trim();
      const decoded = verifyAuthToken(token);
      const user = await db.getUserById(decoded.sub);
      if (user && user.isVerified) {
        req.user = {
          sub: user.id,
          email: user.email,
          name: user.name,
          role: user.role || 'PARENT',
          parentId: user.parentId
        };
      }
    }
  } catch {
    // Ignore invalid/expired token for optional auth
  }
  next();
}

export async function sendVerificationEmail(
  toEmail: string,
  name: string,
  token: string
): Promise<void> {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user || 'no-reply@kidstube.local';

  if (!user || !pass) {
    throw new Error('SMTP credentials are not configured in environment variables');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });

  const apiBase = (process.env.APP_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');
  const verifyUrl = `${apiBase}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: 'Verify your FamiTube Studio account',
    text: `Hi ${name},\n\nPlease verify your email address to access FamiTube Studio:\n${verifyUrl}\n\nThis link expires in 24 hours.\n`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 12px;">
        <h2 style="color: #ff3366; margin-top: 0;">Verify your FamiTube Studio account</h2>
        <p>Hi ${name},</p>
        <p>Thanks for registering. Click the button below to verify your email address before signing in:</p>
        <p style="margin: 24px 0;">
          <a href="${verifyUrl}" style="background: #ff3366; color: #ffffff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
            Verify Email Address
          </a>
        </p>
        <p style="color: #94a3b8; font-size: 13px;">Or copy this link: ${verifyUrl}</p>
        <p style="color: #94a3b8; font-size: 12px;">This verification link expires in 24 hours.</p>
      </div>
    `
  });
}

export interface VideoRequestActionPayload {
  purpose: 'video_request_decision';
  requestId: string;
  parentId: string;
  kidId: string;
  youtubeVideoId: string;
}

export function signVideoRequestActionToken(payload: Omit<VideoRequestActionPayload, 'purpose'>): string {
  return jwt.sign(
    { ...payload, purpose: 'video_request_decision' },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}

export function verifyVideoRequestActionToken(token: string): VideoRequestActionPayload {
  const decoded = jwt.verify(token, getJwtSecret()) as VideoRequestActionPayload;
  if (!decoded || decoded.purpose !== 'video_request_decision') {
    throw new Error('Invalid video request action token');
  }
  return decoded;
}

export interface VideoRequestDecisionPayload {
  type: 'VIDEO_REQUEST_DECISION';
  requestId: string;
  parentId: string;
  decision: 'APPROVED' | 'REJECTED';
}

export function verifyVideoRequestDecisionToken(token: string): VideoRequestDecisionPayload {
  const decoded = jwt.verify(token, getJwtSecret()) as VideoRequestDecisionPayload;
  if (!decoded || decoded.type !== 'VIDEO_REQUEST_DECISION' || !decoded.requestId || !decoded.parentId) {
    throw new Error('Invalid video request decision token');
  }
  return decoded;
}

export function signMobileOAuthState(): string {
  return jwt.sign({ purpose: 'mobile_google_oauth' }, getJwtSecret(), { expiresIn: '10m' });
}

export function verifyMobileOAuthState(state: string): boolean {
  try {
    const decoded = jwt.verify(state, getJwtSecret()) as { purpose?: string };
    return decoded?.purpose === 'mobile_google_oauth';
  } catch {
    return false;
  }
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ParentVideoRequestEmailParams {
  toEmail: string;
  parentName: string;
  kidName: string;
  kidEmail: string;
  requestId: string;
  youtubeVideoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  actionToken: string;
  approvedCount?: number;
  declinedCount?: number;
}

export async function sendParentVideoRequestEmail(
  params: ParentVideoRequestEmailParams
): Promise<void> {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user || 'no-reply@kidstube.local';

  if (!user || !pass) {
    throw new Error('SMTP credentials are not configured in environment variables');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });

  const apiBase = (process.env.APP_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');
  const webUrl = (process.env.WEB_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const youtubeUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(params.youtubeVideoId)}`;
  const approveUrl = `${apiBase}/api/parent/video-requests/${encodeURIComponent(params.requestId)}/email-decision?decision=APPROVED&token=${encodeURIComponent(params.actionToken)}`;
  const rejectUrl = `${apiBase}/api/parent/video-requests/${encodeURIComponent(params.requestId)}/email-decision?decision=REJECTED&token=${encodeURIComponent(params.actionToken)}`;

  const safeParentName = escapeHtml(params.parentName || 'Parent');
  const safeKidName = escapeHtml(params.kidName || 'Your child');
  const safeKidEmail = escapeHtml(params.kidEmail || '');
  const safeTitle = escapeHtml(params.title || 'YouTube Video');
  const safeChannelTitle = escapeHtml(params.channelTitle || 'YouTube');
  const safeThumbnailUrl = escapeHtml(params.thumbnailUrl || '');
  const approvedCount = Math.max(0, Number(params.approvedCount) || 0);
  const declinedCount = Math.max(0, Number(params.declinedCount) || 0);

  await transporter.sendMail({
    from,
    to: params.toEmail,
    subject: `FamiTube: ${params.kidName || 'Your child'} asked permission to watch "${params.title}"`,
    text: [
      `Hi ${params.parentName || 'Parent'},`,
      '',
      `${params.kidName || 'Your child'}${params.kidEmail ? ` (${params.kidEmail})` : ''} is asking for your permission to watch a YouTube video on FamiTube:`,
      '',
      `Title: ${params.title}`,
      `Channel: ${params.channelTitle}`,
      `Parent Decisions: 😊 ${approvedCount} approved | 😡 ${declinedCount} declined`,
      `Preview on YouTube: ${youtubeUrl}`,
      '',
      `Approve Video: ${approveUrl}`,
      `Decline Request: ${rejectUrl}`,
      '',
      `Or manage all requests in FamiTube Parent Studio: ${webUrl}`
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 14px; border: 1px solid #1e293b;">
        <h2 style="color: #ff3366; margin-top: 0; margin-bottom: 12px;">Video Permission Request</h2>
        <p style="margin: 0 0 16px; color: #e2e8f0; line-height: 1.5;">
          Hi <strong>${safeParentName}</strong>,<br>
          <strong>${safeKidName}</strong>${safeKidEmail ? ` <span style="color: #94a3b8;">(${safeKidEmail})</span>` : ''} asked for your permission to watch a searched YouTube video on FamiTube.
        </p>

        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; overflow: hidden; margin: 20px 0;">
          ${safeThumbnailUrl ? `<a href="${youtubeUrl}" target="_blank" rel="noopener noreferrer" style="display: block;"><img src="${safeThumbnailUrl}" alt="${safeTitle}" style="width: 100%; max-height: 260px; object-fit: cover; display: block;"></a>` : ''}
          <div style="padding: 16px;">
            <div style="font-size: 16px; font-weight: bold; color: #f8fafc; margin-bottom: 6px;">${safeTitle}</div>
            <div style="font-size: 13px; color: #94a3b8; margin-bottom: 10px;">Channel: <strong style="color: #cbd5e1;">${safeChannelTitle}</strong></div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
              <span style="display: inline-block; background: rgba(34, 197, 94, 0.18); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.45); padding: 4px 10px; border-radius: 999px; font-size: 13px; font-weight: 700; margin-right: 8px;">
                <span style="color: #22c55e;">😊</span> ${approvedCount} Approved
              </span>
              <span style="display: inline-block; background: rgba(239, 68, 68, 0.18); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.45); padding: 4px 10px; border-radius: 999px; font-size: 13px; font-weight: 700;">
                <span style="color: #ef4444;">😡</span> ${declinedCount} Declined
              </span>
            </div>
            <a href="${youtubeUrl}" target="_blank" rel="noopener noreferrer" style="color: #38bdf8; font-size: 13px; text-decoration: none; font-weight: bold;">
              &#9654; Preview Video on YouTube &rarr;
            </a>
          </div>
        </div>

        <div style="margin: 24px 0; text-align: center;">
          <a href="${approveUrl}" style="background: #10b981; color: #ffffff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; margin: 4px 6px;">
            &#10003; Approve Video
          </a>
          <a href="${rejectUrl}" style="background: #ef4444; color: #ffffff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; margin: 4px 6px;">
            &#10005; Decline Request
          </a>
        </div>

        <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; text-align: center; margin-top: 20px;">
          You can also review and manage all video requests anytime in
          <a href="${webUrl}" style="color: #ff3366; text-decoration: none; font-weight: bold;">FamiTube Parent Studio</a>.
        </p>
      </div>
    `
  });
}

const DEFAULT_GOOGLE_CLIENT_ID =
  '69894868320-jis5bocnh9mul5g053so02op5evl2rfd.apps.googleusercontent.com';

export function getGoogleClientId(): string {
  return (process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID).trim();
}

export function getGoogleClientSecret(): string {
  return (process.env.GOOGLE_CLIENT_SECRET || '').trim();
}

export interface GoogleUserProfile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
}

export interface GoogleOAuthStatePayload {
  purpose: 'google_oauth_state';
  loginType: UserRole;
  redirectOrigin?: string;
}

export function signGoogleOAuthState(payload: Omit<GoogleOAuthStatePayload, 'purpose'>): string {
  return jwt.sign({ ...payload, purpose: 'google_oauth_state' }, getJwtSecret(), {
    expiresIn: '15m'
  });
}

export function verifyGoogleOAuthState(stateToken: string): GoogleOAuthStatePayload {
  const decoded = jwt.verify(stateToken, getJwtSecret()) as GoogleOAuthStatePayload;
  if (!decoded || decoded.purpose !== 'google_oauth_state') {
    throw new Error('Invalid OAuth state token');
  }
  return decoded;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleUserProfile> {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  if (!res.ok) {
    throw new Error('Invalid Google ID token');
  }
  const data = (await res.json()) as Record<string, unknown>;
  const expectedClientId = getGoogleClientId();
  if (expectedClientId && data.aud !== expectedClientId) {
    throw new Error('Google ID token client ID mismatch');
  }
  const email = String(data.email || '').trim().toLowerCase();
  const emailVerified = data.email_verified === true || data.email_verified === 'true';
  if (!email || !emailVerified) {
    throw new Error('Google account email is not verified');
  }
  return {
    sub: String(data.sub || ''),
    email,
    name: String(data.name || email.split('@')[0] || 'User').trim(),
    picture: data.picture ? String(data.picture) : undefined,
    emailVerified
  };
}

export async function verifyGoogleAccessToken(accessToken: string): Promise<GoogleUserProfile> {
  const tokenInfoRes = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
  );
  if (!tokenInfoRes.ok) {
    throw new Error('Invalid Google access token');
  }
  const tokenInfo = (await tokenInfoRes.json()) as Record<string, unknown>;
  const expectedClientId = getGoogleClientId();
  if (
    expectedClientId &&
    tokenInfo.aud !== expectedClientId &&
    tokenInfo.azp !== expectedClientId
  ) {
    throw new Error('Google access token client ID mismatch');
  }

  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!userRes.ok) {
    throw new Error('Unable to fetch Google user profile');
  }
  const userData = (await userRes.json()) as Record<string, unknown>;
  const email = String(userData.email || tokenInfo.email || '').trim().toLowerCase();
  const emailVerified =
    userData.email_verified === true ||
    userData.email_verified === 'true' ||
    tokenInfo.email_verified === true ||
    tokenInfo.email_verified === 'true';
  if (!email || !emailVerified) {
    throw new Error('Google account email is not verified');
  }
  return {
    sub: String(userData.sub || tokenInfo.sub || ''),
    email,
    name: String(userData.name || email.split('@')[0] || 'User').trim(),
    picture: userData.picture ? String(userData.picture) : undefined,
    emailVerified
  };
}

export async function exchangeGoogleAuthCode(
  code: string,
  redirectUri: string
): Promise<GoogleUserProfile> {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth client credentials are not configured');
  }

  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${errText}`);
  }

  const tokenData = (await tokenRes.json()) as {
    id_token?: string;
    access_token?: string;
  };

  if (tokenData.id_token) {
    return verifyGoogleIdToken(tokenData.id_token);
  }
  if (tokenData.access_token) {
    return verifyGoogleAccessToken(tokenData.access_token);
  }
  throw new Error('No token returned from Google OAuth exchange');
}
