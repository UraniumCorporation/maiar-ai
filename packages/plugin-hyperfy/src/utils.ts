import crypto from "crypto";
import { Readable } from "node:stream";

// Ensure crypto is imported for hashFileBuffer

export async function hashFileBuffer(buffer: Buffer): Promise<string> {
  // Ensure crypto.subtle is available (usually is in modern Node.js)
  if (!crypto.subtle || typeof crypto.subtle.digest !== "function") {
    throw new Error(
      "crypto.subtle.digest is not available. Ensure Node.js version supports Web Crypto API."
    );
  }
  const hashBuf = await crypto.subtle.digest("SHA-256", buffer);
  const hash = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hash;
}

export async function convertToAudioBuffer(
  speechResponse: unknown
): Promise<Buffer> {
  if (Buffer.isBuffer(speechResponse)) {
    return speechResponse;
  }

  // Handle Web ReadableStream (like fetch response body)
  // Define more specific function types for duck typing
  type ReadableStreamLike = {
    getReader: () => {
      read: () => Promise<{ done: boolean; value?: Uint8Array }>;
      releaseLock: () => void;
    };
    body: ReadableStream<Uint8Array>; // Assuming body is a standard ReadableStream
  };

  if (
    speechResponse &&
    typeof (speechResponse as Partial<ReadableStreamLike>).getReader ===
      "function" &&
    (speechResponse as Partial<ReadableStreamLike>).body instanceof
      ReadableStream
  ) {
    const reader = (speechResponse as ReadableStreamLike).body.getReader();
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      return Buffer.concat(chunks);
    } finally {
      reader.releaseLock();
    }
  }

  // Handle Node.js Readable stream
  if (speechResponse instanceof Readable) {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      speechResponse.on("data", (chunk: Buffer | string) =>
        chunks.push(Buffer.from(chunk))
      );
      speechResponse.on("end", () => resolve(Buffer.concat(chunks)));
      speechResponse.on("error", (err: Error) => reject(err));
    });
  } else if (
    speechResponse &&
    typeof speechResponse === "object" &&
    speechResponse !== null &&
    (speechResponse as { readable?: boolean }).readable === true &&
    typeof (
      speechResponse as {
        pipe?: (
          destination: NodeJS.WritableStream,
          options?: { end?: boolean }
        ) => NodeJS.WritableStream;
      }
    ).pipe === "function" &&
    typeof (
      speechResponse as {
        on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
      }
    ).on === "function"
  ) {
    // Duck-typed Node.js stream
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      (speechResponse as Readable).on("data", (chunk: Buffer | string) =>
        chunks.push(Buffer.from(chunk))
      );
      (speechResponse as Readable).on("end", () =>
        resolve(Buffer.concat(chunks))
      );
      (speechResponse as Readable).on("error", (err: Error) => reject(err));
    });
  }

  // If it's a plain object that might represent a stream (less common, but for robustness)
  type BufferDataObject = { type: string; data: number[] | Buffer };
  if (
    speechResponse &&
    typeof speechResponse === "object" &&
    speechResponse !== null &&
    (speechResponse as BufferDataObject).type === "Buffer" &&
    Array.isArray((speechResponse as BufferDataObject).data)
  ) {
    return Buffer.from((speechResponse as BufferDataObject).data);
  }

  throw new Error(
    "Unexpected response type from TEXT_TO_SPEECH model, cannot convert to Buffer."
  );
}
