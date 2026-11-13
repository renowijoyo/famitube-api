import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { db } from './db.js';

export interface AuthPayload {
  sub: string;
  email: string;
  name: string;
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
      name: user.name
    };
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
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
    subject: 'Verify your KidsTube Studio account',
    text: `Hi ${name},\n\nPlease verify your email address to access KidsTube Studio:\n${verifyUrl}\n\nThis link expires in 24 hours.\n`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 12px;">
        <h2 style="color: #ff3366; margin-top: 0;">Verify your KidsTube Studio account</h2>
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
