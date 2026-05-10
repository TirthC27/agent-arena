import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../config/db";
import { env } from "../config/env";
import { verifyWalletSignature, generateAuthMessage } from "../utils/solana";
import { ApiError } from "../utils/ApiError";

// In-memory nonce store (Redis in production)
const nonceStore = new Map<string, { message: string; createdAt: Date }>();

/**
 * Generate a challenge message for wallet signing
 */
export async function generateChallenge(walletAddress: string) {
  const nonce = uuidv4();
  const message = generateAuthMessage(nonce, walletAddress);

  // Store nonce with 5-minute expiry
  nonceStore.set(walletAddress, { message, createdAt: new Date() });

  // Clean old nonces
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  for (const [key, val] of nonceStore) {
    if (val.createdAt.getTime() < fiveMinAgo) nonceStore.delete(key);
  }

  return { message, nonce };
}

/**
 * Verify wallet signature and return JWT + user
 */
export async function verifyAndLogin(
  walletAddress: string,
  signature: string,
  message: string
) {
  // Check nonce exists
  const storedNonce = nonceStore.get(walletAddress);
  if (!storedNonce || storedNonce.message !== message) {
    throw ApiError.unauthorized("Invalid or expired challenge");
  }

  // Check nonce age (5 min max)
  if (Date.now() - storedNonce.createdAt.getTime() > 5 * 60 * 1000) {
    nonceStore.delete(walletAddress);
    throw ApiError.unauthorized("Challenge expired");
  }

  // Verify the signature
  const isValid = verifyWalletSignature(message, signature, walletAddress);
  if (!isValid) {
    throw ApiError.unauthorized("Invalid signature");
  }

  // Delete used nonce
  nonceStore.delete(walletAddress);

  // Upsert user
  const user = await prisma.user.upsert({
    where: { walletAddress },
    update: { updatedAt: new Date() },
    create: { walletAddress },
  });

  // Create JWT (7 days in seconds)
  const token = jwt.sign(
    { userId: user.id, walletAddress: user.walletAddress },
    env.JWT_SECRET,
    { expiresIn: 7 * 24 * 60 * 60 }
  );

  // Create session
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  });

  return { token, user };
}

/**
 * Logout — invalidate session in DB
 */
export async function logout(token: string) {
  await prisma.session.deleteMany({ where: { token } });
}

/**
 * Get current user from token
 */
export async function getCurrentUser(userId: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      agents: {
        select: {
          id: true,
          name: true,
          eloOverall: true,
          isActive: true,
        },
      },
    },
  });
}

/**
 * Clean up expired sessions (call periodically or on login)
 */
export async function cleanupExpiredSessions() {
  await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}
