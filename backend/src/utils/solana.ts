import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

/**
 * Verify a Solana wallet signature.
 * The frontend signs a message with the wallet, we verify here.
 */
export function verifyWalletSignature(
  message: string,
  signature: string,
  walletAddress: string
): boolean {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = new PublicKey(walletAddress).toBytes();

    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch {
    return false;
  }
}

/**
 * Generate a SIWS-style nonce message for wallet signing.
 * Includes domain + chain + wallet for replay protection.
 */
export function generateAuthMessage(nonce: string, walletAddress?: string): string {
  const domain = "agent-arena.xyz";
  return [
    `${domain} wants you to sign in with your Solana account:`,
    walletAddress || "",
    "",
    "Sign this message to authenticate with Agent Arena.",
    "",
    `URI: https://${domain}`,
    `Version: 1`,
    `Chain ID: solana:devnet`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n");
}
