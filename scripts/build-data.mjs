#!/usr/bin/env node
// Merges Installomator-Tracker version history with Installomator-Metadata
// plists/icons into the data the site is built from.
//
//   TRACKER_DIR   checkout of gilburns/Installomator-Tracker   (default: data-src/tracker)
//   METADATA_DIR  checkout of gilburns/Installomator-Metadata  (default: data-src/metadata)
//
// Writes:
//   src/data/apps.json          every tracked label, merged, versions newest first
//   public/data/search.json     compact index used by the in-browser search
//   public/icons/{96,256}/<label>.webp  resized icons (skipped when already up to date)

import fs from 'node:fs/promises';
import path from 'node:path';
import * as plist from 'plist';
import sharp from 'sharp';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const trackerDir = path.resolve(process.env.TRACKER_DIR ?? path.join(root, 'data-src/tracker'));
const metadataDir = path.resolve(process.env.METADATA_DIR ?? path.join(root, 'data-src/metadata'));
const ICON_SIZES = [96, 256];

const exists = (p) => fs.access(p).then(() => true, () => false);
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const isUrl = (v) => /^https?:\/\//i.test(v);

async function readMetadata(label) {
  const file = path.join(metadataDir, 'Metadata', `${label}.plist`);
  if (!(await exists(file))) return null;
  try {
    return plist.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    console.warn(`warn: could not parse ${label}.plist: ${err.message}`);
    return null;
  }
}

async function buildIcon(label) {
  const src = path.join(metadataDir, 'Icons', `${label}.png`);
  if (!(await exists(src))) return false;
  const srcTime = (await fs.stat(src)).mtimeMs;
  for (const size of ICON_SIZES) {
    const out = path.join(root, 'public/icons', String(size), `${label}.webp`);
    if ((await exists(out)) && (await fs.stat(out)).mtimeMs >= srcTime) continue;
    try {
      await sharp(src).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 85 }).toFile(out);
    } catch (err) {
      console.warn(`warn: could not convert icon for ${label}: ${err.message}`);
      return false;
    }
  }
  return true;
}

// Run an async fn over items with bounded concurrency.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }));
  return results;
}

async function main() {
  const detailsDir = path.join(trackerDir, 'TrackedLabelDetails');
  if (!(await exists(detailsDir))) throw new Error(`Tracker data not found at ${detailsDir}`);
  if (!(await exists(path.join(metadataDir, 'Metadata')))) throw new Error(`Metadata not found at ${metadataDir}`);

  await fs.mkdir(path.join(root, 'src/data'), { recursive: true });
  await fs.mkdir(path.join(root, 'public/data'), { recursive: true });
  for (const size of ICON_SIZES) await fs.mkdir(path.join(root, 'public/icons', String(size)), { recursive: true });

  const files = (await fs.readdir(detailsDir)).filter((f) => f.endsWith('.json')).sort();

  const apps = (await mapLimit(files, 8, async (file) => {
    const label = file.replace(/\.json$/, '');
    let history;
    try {
      history = JSON.parse(await fs.readFile(path.join(detailsDir, file), 'utf8'));
    } catch (err) {
      console.warn(`warn: skipping ${file}: ${err.message}`);
      return null;
    }
    if (!Array.isArray(history) || history.length === 0) return null;

    const md = (await readMetadata(label)) ?? {};
    const hasIcon = await buildIcon(label);

    // Tracker files are oldest to newest; the site wants newest first.
    const versions = history.map((e, i) => ({
      version: str(e.appNewVersion),
      timeStamp: str(e.timeStamp),
      type: str(e.type),
      downloadURL: str(e.downloadURL),
      downloadURLi386: str(e.downloadURLi386) || undefined,
      teamID: str(e.expectedTeamID),
      firstSeen: i === 0,
    })).reverse();

    const latest = history[history.length - 1];
    const links = {
      homepage: str(md.Homepage),
      documentation: str(md.Documentation),
      privacy: str(md.Privacy),
    };
    for (const k of Object.keys(links)) if (!isUrl(links[k])) delete links[k];

    return {
      label,
      name: str(md.AppName) || str(latest.name) || label,
      publisher: str(md.Publisher),
      category: str(md.Category) || 'Uncategorized',
      description: str(md.Description),
      keywords: str(md.Keywords).split(',').map((k) => k.trim()).filter(Boolean),
      bundleId: str(md.AppID),
      links,
      hasIcon,
      blockingProcesses: Array.isArray(latest.blockingProcesses) ? latest.blockingProcesses : [],
      versions,
    };
  })).filter(Boolean);

  apps.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

  await fs.writeFile(path.join(root, 'src/data/apps.json'), JSON.stringify(apps));

  const search = apps.map((a) => ({
    l: a.label,
    n: a.name,
    p: a.publisher,
    c: a.category,
    k: a.keywords.join(' '),
    v: a.versions[0].version,
    u: a.versions[0].timeStamp,
    i: a.hasIcon ? 1 : 0,
  }));
  await fs.writeFile(path.join(root, 'public/data/search.json'), JSON.stringify(search));

  const withMeta = apps.filter((a) => a.description).length;
  const withIcon = apps.filter((a) => a.hasIcon).length;
  const entries = apps.reduce((n, a) => n + a.versions.length, 0);
  console.log(`Built ${apps.length} titles, ${entries} versions (${withMeta} with metadata, ${withIcon} with icons).`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
