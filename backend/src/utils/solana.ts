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
 * Generate a nonce message for wallet signing
 */
export function generateAuthMessage(nonce: string): string {
  return `Sign this message to authenticate with Agent Arena.\n\nNonce: ${nonce}\nTimestamp: ${new Date().toISOString()}`;
}
