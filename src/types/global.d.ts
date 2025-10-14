declare global {
  namespace NodeJS {
    interface ReadableStream {}
  }
  
  interface Buffer {}
  
  var Buffer: {
    new (size: number): Buffer;
    new (array: Uint8Array): Buffer;
    new (arrayBuffer: ArrayBuffer): Buffer;
    new (str: string, encoding?: string): Buffer;
    isBuffer(obj: any): obj is Buffer;
    concat(list: Buffer[], totalLength?: number): Buffer;
    from(array: number[]): Buffer;
    from(array: Uint8Array): Buffer;
    from(str: string, encoding?: string): Buffer;
    alloc(size: number, fill?: string | number | Buffer): Buffer;
    allocUnsafe(size: number): Buffer;
  };
}

export {};
