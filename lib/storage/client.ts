// MinIO SDK client wrapper. The client is lazy-memoized: we don't
// construct it at module import time because that would try to
// resolve the endpoint hostname during test setup, before the
// compose stack is necessarily up.
//
// Configuration comes from environment variables, matching the
// docker-compose wiring:
//   STORAGE_ENDPOINT        http://minio:9000 (in-compose) or http://localhost:9000 (host)
//   STORAGE_ACCESS_KEY      MinIO root user
//   STORAGE_SECRET_KEY      MinIO root password
//   STORAGE_REGION          us-east-1 (MinIO ignores this but the SDK requires it)
//   STORAGE_HANDBOOK_BUCKET handbook
//   STORAGE_EVENTS_BUCKET   events

import { Client as MinioClient } from "minio";

let cached: MinioClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Log the specific variable name server-side for debugging, but
    // throw a generic message that won't leak env var names if it
    // propagates to an HTTP response.
    console.error(`[storage] required environment variable not set: ${name}`);
    throw new Error("Storage configuration error: a required environment variable is not set.");
  }
  return value;
}

function parseEndpoint(endpoint: string): {
  endPoint: string;
  port: number;
  useSSL: boolean;
} {
  const url = new URL(endpoint);
  const useSSL = url.protocol === "https:";
  const port = url.port ? Number(url.port) : useSSL ? 443 : 80;
  return { endPoint: url.hostname, port, useSSL };
}

export function getClient(): MinioClient {
  if (cached) return cached;

  const endpoint = requireEnv("STORAGE_ENDPOINT");
  const { endPoint, port, useSSL } = parseEndpoint(endpoint);

  cached = new MinioClient({
    endPoint,
    port,
    useSSL,
    accessKey: requireEnv("STORAGE_ACCESS_KEY"),
    secretKey: requireEnv("STORAGE_SECRET_KEY"),
    region: process.env.STORAGE_REGION ?? "us-east-1",
  });

  return cached;
}

// Test-only. Lets a test reset the memoized client after mutating env vars.
export function __resetClientForTests(): void {
  cached = null;
}

export const HANDBOOK_BUCKET = () => process.env.STORAGE_HANDBOOK_BUCKET ?? "handbook";
export const EVENTS_BUCKET = () => process.env.STORAGE_EVENTS_BUCKET ?? "events";
