import fs from "node:fs/promises";
import path from "node:path";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v26.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const SYSTEM_TOKEN = process.env.META_SYSTEM_USER_TOKEN;
const PAGE_ID = process.env.META_PAGE_ID || "880545785145111";
const REPO = process.env.GITHUB_REPOSITORY || "mleon1997/habitalibre-backend";
const BRANCH = process.env.GITHUB_REF_NAME || "main";

const READY = "meta-autopilot/ready";
const STATE = "meta-autopilot/state";
const SENT = "meta-autopilot/sent";
const MEDIA = "meta-autopilot/media";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(value, message) {
  if (!value) throw new Error(message);
}

function safeId(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, "-");
}

async function ensureDirs() {
  await Promise.all([READY, STATE, SENT, MEDIA].map((d) => fs.mkdir(d, { recursive: true })));
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

async function graphGet(endpoint, token, params = {}) {
  const url = new URL(`${GRAPH}/${endpoint.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  url.searchParams.set("access_token", token);

  const res = await fetch(url);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok || body?.error) {
    throw new Error(`Meta GET ${url.pathname} failed (${res.status}): ${text}`);
  }
  return body;
}

async function graphPost(endpoint, token, params = {}) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) body.set(key, String(value));
  }
  body.set("access_token", token);

  const res = await fetch(`${GRAPH}/${endpoint.replace(/^\//, "")}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data?.error) {
    throw new Error(`Meta POST /${endpoint} failed (${res.status}): ${text}`);
  }
  return data;
}

async function resolveMetaAssets() {
  assert(SYSTEM_TOKEN, "Missing META_SYSTEM_USER_TOKEN GitHub Actions secret.");

  const info = await graphGet(PAGE_ID, SYSTEM_TOKEN, {
    fields: "id,name,access_token,instagram_business_account{id,username}",
  });

  const pageToken = info.access_token || SYSTEM_TOKEN;
  const igId = info.instagram_business_account?.id || null;
  const igUsername = info.instagram_business_account?.username || null;

  return {
    pageId: PAGE_ID,
    pageToken,
    igId,
    igUsername,
    pageName: info.name || null,
  };
}

function extensionFromContentType(type, sourceUrl) {
  if (type?.includes("png")) return "png";
  if (type?.includes("jpeg") || type?.includes("jpg")) return "jpg";
  if (type?.includes("webp")) return "webp";
  const pathname = new URL(sourceUrl).pathname.toLowerCase();
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    if (pathname.endsWith(`.${ext}`)) return ext === "jpeg" ? "jpg" : ext;
  }
  return "png";
}

async function hostMedia(job, state) {
  if (Array.isArray(state.hostedMedia) && state.hostedMedia.length === job.media.length) {
    return state.hostedMedia;
  }

  const jobId = safeId(job.id);
  const dir = path.join(MEDIA, jobId);
  await fs.mkdir(dir, { recursive: true });

  const hosted = [];
  for (let i = 0; i < job.media.length; i += 1) {
    const sourceUrl = job.media[i];
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Media download failed (${response.status}) for item ${i + 1}: ${sourceUrl}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const ext = extensionFromContentType(response.headers.get("content-type"), sourceUrl);
    const fileName = `${String(i + 1).padStart(2, "0")}.${ext}`;
    const relative = path.posix.join(MEDIA, jobId, fileName);
    await fs.writeFile(relative, bytes);
    hosted.push(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/${relative}`);
  }

  state.hostedMedia = hosted;
  state.mediaIngestedAt = new Date().toISOString();
  return hosted;
}

async function waitForInstagramContainer(containerId, token) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const status = await graphGet(containerId, token, { fields: "status_code,status" });
    if (!status.status_code || status.status_code === "FINISHED") return;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new Error(`Instagram container ${containerId} failed: ${JSON.stringify(status)}`);
    }
    await sleep(2500);
  }
  throw new Error(`Instagram container ${containerId} did not finish in time.`);
}

async function publishInstagram(job, media, assets) {
  assert(assets.igId, "No Instagram professional account is linked to the Facebook Page.");
  const caption = job.caption || job.text || "";

  if (job.format === "story") {
    assert(media.length === 1, "Instagram Story jobs currently require exactly one image.");
    const container = await graphPost(`${assets.igId}/media`, assets.pageToken, {
      image_url: media[0],
      media_type: "STORIES",
    });
    await waitForInstagramContainer(container.id, assets.pageToken);
    const published = await graphPost(`${assets.igId}/media_publish`, assets.pageToken, {
      creation_id: container.id,
    });
    return { id: published.id, type: "story" };
  }

  if (media.length === 1) {
    const container = await graphPost(`${assets.igId}/media`, assets.pageToken, {
      image_url: media[0],
      caption,
    });
    await waitForInstagramContainer(container.id, assets.pageToken);
    const published = await graphPost(`${assets.igId}/media_publish`, assets.pageToken, {
      creation_id: container.id,
    });
    return { id: published.id, type: "feed" };
  }

  const childIds = [];
  for (const imageUrl of media) {
    const child = await graphPost(`${assets.igId}/media`, assets.pageToken, {
      image_url: imageUrl,
      is_carousel_item: "true",
    });
    await waitForInstagramContainer(child.id, assets.pageToken);
    childIds.push(child.id);
  }

  const parent = await graphPost(`${assets.igId}/media`, assets.pageToken, {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption,
  });
  await waitForInstagramContainer(parent.id, assets.pageToken);
  const published = await graphPost(`${assets.igId}/media_publish`, assets.pageToken, {
    creation_id: parent.id,
  });
  return { id: published.id, type: "carousel", children: childIds };
}

async function publishFacebook(job, media, assets) {
  const caption = job.caption || job.text || "";

  if (job.format === "story") {
    assert(media.length === 1, "Facebook Story jobs currently require exactly one image.");
    const photo = await graphPost(`${assets.pageId}/photos`, assets.pageToken, {
      url: media[0],
      published: "false",
    });
    const story = await graphPost(`${assets.pageId}/photo_stories`, assets.pageToken, {
      photo_id: photo.id,
    });
    return { id: story.post_id || story.id || photo.id, type: "story", photoId: photo.id };
  }

  if (media.length === 1) {
    const photo = await graphPost(`${assets.pageId}/photos`, assets.pageToken, {
      url: media[0],
      caption,
      published: "true",
    });
    return { id: photo.post_id || photo.id, type: "feed" };
  }

  const photoIds = [];
  for (const imageUrl of media) {
    const photo = await graphPost(`${assets.pageId}/photos`, assets.pageToken, {
      url: imageUrl,
      published: "false",
    });
    photoIds.push(photo.id);
  }

  const params = { message: caption };
  photoIds.forEach((id, index) => {
    params[`attached_media[${index}]`] = JSON.stringify({ media_fbid: id });
  });
  const post = await graphPost(`${assets.pageId}/feed`, assets.pageToken, params);
  return { id: post.id, type: "carousel", photoIds };
}

function validateJob(job, fileName) {
  assert(job?.id, `${fileName}: id is required`);
  assert(job?.publishAt, `${fileName}: publishAt is required`);
  assert(["feed", "story"].includes(job.format), `${fileName}: format must be feed or story`);
  assert(Array.isArray(job.channels) && job.channels.length > 0, `${fileName}: channels[] required`);
  assert(job.channels.every((c) => ["instagram", "facebook"].includes(c)), `${fileName}: unsupported channel`);
  assert(Array.isArray(job.media) && job.media.length > 0, `${fileName}: media[] required`);
  for (const url of job.media) assert(/^https:\/\//.test(url), `${fileName}: media URLs must be HTTPS`);
  const when = new Date(job.publishAt);
  assert(!Number.isNaN(when.getTime()), `${fileName}: invalid publishAt`);
  return job;
}

async function processJob(fileName, assets) {
  const readyPath = path.join(READY, fileName);
  const job = validateJob(await readJson(readyPath), fileName);
  const statePath = path.join(STATE, fileName);
  const state = (await readJson(statePath, {})) || {};
  state.id = job.id;
  state.sourceFile = fileName;
  state.channels = state.channels || {};

  const hostedMedia = await hostMedia(job, state);
  await writeJson(statePath, state);

  const due = new Date(job.publishAt).getTime() <= Date.now();
  if (!due) {
    console.log(`INGESTED, NOT DUE: ${job.id} at ${job.publishAt}`);
    return;
  }

  for (const channel of job.channels) {
    if (state.channels[channel]?.status === "published") {
      console.log(`SKIP already published ${channel}: ${job.id}`);
      continue;
    }

    try {
      const result =
        channel === "instagram"
          ? await publishInstagram(job, hostedMedia, assets)
          : await publishFacebook(job, hostedMedia, assets);

      state.channels[channel] = {
        status: "published",
        publishedAt: new Date().toISOString(),
        result,
      };
      await writeJson(statePath, state);
      console.log(`PUBLISHED ${channel}: ${job.id}`);
    } catch (error) {
      state.channels[channel] = {
        status: "failed",
        failedAt: new Date().toISOString(),
        error: String(error?.message || error),
      };
      await writeJson(statePath, state);
      throw error;
    }
  }

  const complete = job.channels.every((c) => state.channels[c]?.status === "published");
  if (!complete) return;

  const receipt = {
    ...state,
    job,
    completedAt: new Date().toISOString(),
    metaAssets: {
      pageId: assets.pageId,
      pageName: assets.pageName,
      instagramId: assets.igId,
      instagramUsername: assets.igUsername,
    },
  };

  await writeJson(path.join(SENT, fileName), receipt);
  await fs.unlink(readyPath);
  try { await fs.unlink(statePath); } catch {}
  console.log(`COMPLETE: ${job.id}`);
}

async function main() {
  await ensureDirs();
  const files = (await fs.readdir(READY)).filter((f) => f.endsWith(".json")).sort();
  if (!files.length) {
    console.log("No Meta jobs in READY.");
    return;
  }

  // Always ingest media. Authentication is only required once a job is due.
  const dueExists = await Promise.all(files.map(async (f) => {
    const job = await readJson(path.join(READY, f));
    return new Date(job.publishAt).getTime() <= Date.now();
  })).then((values) => values.some(Boolean));

  let assets = null;
  if (dueExists) assets = await resolveMetaAssets();

  for (const fileName of files) {
    const job = await readJson(path.join(READY, fileName));
    const due = new Date(job.publishAt).getTime() <= Date.now();

    if (!due) {
      const statePath = path.join(STATE, fileName);
      const state = (await readJson(statePath, {})) || {};
      state.id = job.id;
      state.sourceFile = fileName;
      state.channels = state.channels || {};
      await hostMedia(job, state);
      await writeJson(statePath, state);
      console.log(`INGESTED, NOT DUE: ${job.id}`);
      continue;
    }

    await processJob(fileName, assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
