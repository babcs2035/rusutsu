declare module "heic-decode" {
  type DecodedImage = {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  };
  type ImageHandle = {
    width: number;
    height: number;
    decode(): Promise<DecodedImage>;
  };
  const decode: {
    (input: { buffer: Uint8Array }): Promise<DecodedImage>;
    all(input: {
      buffer: Uint8Array;
    }): Promise<ImageHandle[] & { dispose(): void }>;
  };
  export default decode;
}
