import { seal } from "tweetsodium";

export function encryptGitHubActionsSecret(
  secretValue: string,
  publicKeyBase64: string,
): string {
  const messageBytes = Buffer.from(secretValue, "utf8");
  const publicKeyBytes = Buffer.from(publicKeyBase64, "base64");
  const encryptedBytes = seal(messageBytes, publicKeyBytes);
  return Buffer.from(encryptedBytes).toString("base64");
}
