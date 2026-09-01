import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "./env.js";

let useLocal = env.S3_ENDPOINT.includes("localhost") || env.S3_ENDPOINT.includes("127.0.0.1");
const localDir = resolve(process.cwd(), "../../data/icons");

export const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

export async function ensureBucket() {
  const attempt = (async () => {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
      useLocal = false;
      return;
    } catch {
      try {
        await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
        useLocal = false;
      } catch (err) {
        console.warn("S3 unavailable, storing icons on local disk");
        useLocal = true;
        mkdirSync(localDir, { recursive: true });
        return;
      }
    }
    const policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: ["*"] },
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${env.S3_BUCKET}/*`],
        },
      ],
    };
    try {
      await s3.send(
        new PutBucketPolicyCommand({
          Bucket: env.S3_BUCKET,
          Policy: JSON.stringify(policy),
        }),
      );
    } catch {
      // ignore
    }
  })();
  try {
    await Promise.race([
      attempt,
      new Promise((_, reject) => setTimeout(() => reject(new Error("s3 timeout")), 2000)),
    ]);
  } catch {
    console.warn("S3 timed out, storing icons on local disk");
    useLocal = true;
    mkdirSync(localDir, { recursive: true });
  }
}

export async function uploadIcon(appId: string, body: Buffer, contentType: string) {
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const filename = `${appId}.${ext}`;
  if (useLocal) {
    mkdirSync(localDir, { recursive: true });
    writeFileSync(resolve(localDir, filename), body);
    return `/media/icons/${filename}`;
  }
  const key = `icons/${filename}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return `${env.S3_PUBLIC_URL}/${key}`;
}

export { localDir };
