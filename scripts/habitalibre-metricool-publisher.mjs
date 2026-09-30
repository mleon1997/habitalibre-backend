import fs from "node:fs/promises";
import path from "node:path";

const API_BASE = "https://app.metricool.com/api";
const token = process.env.METRICOOL_API_TOKEN;
const userId = process.env.METRICOOL_USER_ID || "5522469";
const blogId = process.env.METRICOOL_BLOG_ID || "7140882";
const readyDir = process.env.HABITALIBRE_READY_DIR || "autopilot/ready";
const sentDir = process.env.HABITALIBRE_SENT_DIR || "autopilot/sent";

if (!token) {
  console.error("Missing METRICOOL_API_TOKEN GitHub Actions secret.");
  process.exit(2);
}

const headers = {
  "X-Mc-Auth": token,
  "Content-Type": "application/json",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validate(job, fileName) {
  assert(job && typeof job === "object", `${fileName}: invalid JSON object`);
  assert(job.publicationDate?.dateTime, `${fileName}: publicationDate.dateTime is required`);
  assert(job.publicationDate?.timezone, `${fileName}: publicationDate.timezone is required`);
  assert(Array.isArray(job.providers) && job.providers.length > 0, `${fileName}: providers[] is required`);
  assert(Array.isArray(job.media) && job.media.length > 0, `${fileName}: media[] is required`);

  for (const url of job.media) {
    assert(typeof url === "string" && /^https:\/\//.test(url), `${fileName}: every media item must be a public HTTPS URL`);
  }

  const isStory =
    job.providers.every((p) => ["instagram", "facebook"].includes(p.network)) &&
    (job.instagramData?.type === "STORY" || job.facebookData?.type === "STORY");

  if (isStory) {
    job.text = "";
  } else {
    assert(typeof job.text === "string", `${fileName}: text is required for non-Story posts`);
  }

  // Safety defaults while the publisher is being validated.
  job.draft = job.draft ?? true;
  job.autoPublish = job.autoPublish ?? false;
  job.firstCommentText = job.firstCommentText ?? "";
  job.shortener = job.shortener ?? false;
  job.smartLinkData = job.smartLinkData ?? { ids: [] };

  return job;
}

function findHttpUrl(value) {
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/^"|"$/g, "");
    if (/^https:\/\//.test(trimmed)) return trimmed;
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findHttpUrl(item);
      if (found) return found;
    }
  }

  if (value && typeof value === "object") {
    // Prefer fields that commonly carry normalized media URLs.
    for (const key of ["url", "mediaUrl", "normalizedUrl", "data", "value", "result"]) {
      if (key in value) {
        const found = findHttpUrl(value[key]);
        if (found) return found;
      }
    }
    for (const child of Object.values(value)) {
      const found = findHttpUrl(child);
      if (found) return found;
    }
  }

  return null;
}

async function normalizeMediaUrl(sourceUrl) {
  const endpoint =
    `${API_BASE}/actions/normalize/image/url?` +
    new URLSearchParams({
      url: sourceUrl,
      userId,
      blogId,
    }).toString();

  const response = await fetch(endpoint, {
    method: "GET",
    headers,
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Metricool normalize HTTP ${response.status}: ${raw}`);
  }

  let parsed = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Raw string responses are supported below.
  }

  const normalizedUrl = findHttpUrl(parsed);
  if (!normalizedUrl) {
    throw new Error(`Metricool normalize returned no usable URL: ${raw}`);
  }

  console.log(`Normalized media: ${normalizedUrl}`);
  return normalizedUrl;
}

async function prepareMedia(job) {
  const normalized = [];
  for (const sourceUrl of job.media) {
    normalized.push(await normalizeMediaUrl(sourceUrl));
  }
  job.media = normalized;

  // Keep this true so Metricool stores its own copy immediately.
  job.saveExternalMediaFiles = true;
  return job;
}

async function postToMetricool(job) {
  const endpoint =
    `${API_BASE}/v2/scheduler/posts?blogId=${encodeURIComponent(blogId)}&userId=${encodeURIComponent(userId)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(job),
  });

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }

  if (!response.ok) {
    throw new Error(`Metricool HTTP ${response.status}: ${raw}`);
  }

  return data;
}

async function listReadyFiles() {
  await fs.mkdir(readyDir, { recursive: true });
  await fs.mkdir(sentDir, { recursive: true });
  const files = await fs.readdir(readyDir);
  return files.filter((f) => f.endsWith(".json")).sort();
}

async function processFile(fileName) {
  const readyPath = path.join(readyDir, fileName);
  const raw = await fs.readFile(readyPath, "utf8");
  let job = validate(JSON.parse(raw), fileName);

  console.log(`Preparing draft job: ${fileName}`);
  job = await prepareMedia(job);

  console.log(`Publishing draft job: ${fileName}`);
  const response = await postToMetricool(job);

  const media = response?.data?.media ?? response?.media ?? [];
  const plannerUrl = response?.data?.plannerUrl ?? response?.plannerUrl ?? null;
  const hasMetricoolMedia =
    Array.isArray(media) &&
    media.some((url) => typeof url === "string" && url.includes("metricool.com"));

  const receipt = {
    source: job,
    metricool: response,
    handoff: {
      plannerUrl,
      metricoolMediaVisible: hasMetricoolMedia,
      completedAt: new Date().toISOString(),
    },
  };

  const sentPath = path.join(sentDir, fileName);
  await fs.writeFile(sentPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");
  await fs.unlink(readyPath);

  console.log(`SUCCESS: ${fileName}`);
  if (plannerUrl) console.log(`Planner: ${plannerUrl}`);
}

async function main() {
  const files = await listReadyFiles();

  if (files.length === 0) {
    console.log("No HabitaLibre jobs in autopilot/ready.");
    return;
  }

  for (const file of files) {
    // Sequential processing makes retries and ordering predictable.
    await processFile(file);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  // On failure the source JSON remains in READY for retry.
  process.exit(1);
});
