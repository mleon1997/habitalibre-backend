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

  const isStory = job.providers.every((p) =>
    ["instagram", "facebook"].includes(p.network)
  ) && (
    job.instagramData?.type === "STORY" ||
    job.facebookData?.type === "STORY"
  );

  if (isStory) {
    job.text = "";
  } else {
    assert(typeof job.text === "string", `${fileName}: text is required for non-Story posts`);
  }

  // Safety defaults: publisher starts draft-only until explicitly promoted later.
  job.draft = job.draft ?? true;
  job.autoPublish = job.autoPublish ?? false;
  job.firstCommentText = job.firstCommentText ?? "";
  job.shortener = job.shortener ?? false;
  job.smartLinkData = job.smartLinkData ?? { ids: [] };

  // Metricool's API can ingest external media immediately and store its own copy.
  job.saveExternalMediaFiles = true;

  return job;
}

async function postToMetricool(job) {
  const endpoint = `${API_BASE}/v2/scheduler/posts?blogId=${encodeURIComponent(blogId)}&userId=${encodeURIComponent(userId)}`;

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
  const job = validate(JSON.parse(raw), fileName);

  console.log(`Publishing draft job: ${fileName}`);
  const response = await postToMetricool(job);

  const media = response?.data?.media ?? response?.media ?? [];
  const plannerUrl = response?.data?.plannerUrl ?? response?.plannerUrl ?? null;
  const hasMetricoolMedia =
    Array.isArray(media) &&
    media.some((url) => typeof url === "string" && url.includes("static.metricool.com"));

  // The MCP path has shown Metricool returning static.metricool.com after ingest.
  // For the REST API, we require a successful response and record whether that
  // static media handoff is visible in the response.
  const receipt = {
    source: job,
    metricool: response,
    handoff: {
      plannerUrl,
      staticMetricoolMediaVisible: hasMetricoolMedia,
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
    // Process sequentially to make retries and ordering predictable.
    await processFile(file);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  // Important: on failure the source JSON stays in READY for a later retry.
  process.exit(1);
});
