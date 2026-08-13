/** SHA-256 hex digest of an ArrayBuffer (Web Crypto). */
export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function assertChecksumSha256(
  buffer: ArrayBuffer,
  expectedSha256: string,
): Promise<void> {
  const actual = await sha256Hex(buffer);
  if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error(`Checksum mismatch: expected ${expectedSha256}, got ${actual}`);
  }
}
