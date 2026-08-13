import type { RangeResponse, Source } from "pmtiles";

/**
 * PMTiles Source backed by a Blob so range reads use `blob.slice`
 * instead of retaining the entire archive as a contiguous ArrayBuffer.
 */
export class BlobPmtilesSource implements Source {
  constructor(
    private readonly blob: Blob,
    private readonly key: string,
  ) {}

  getKey(): string {
    return this.key;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const end = offset + length;
    const slice = this.blob.slice(offset, end);
    return {
      data: await slice.arrayBuffer(),
      etag: undefined,
      cacheControl: undefined,
      expires: undefined,
    };
  }
}
