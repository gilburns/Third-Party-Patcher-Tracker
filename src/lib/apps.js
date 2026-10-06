import apps from '../data/apps.json';

export { apps };

// How many entries the "Recently updated" list on the home page shows.
export const RECENT_COUNT = 60;

export const SOURCES = {
  tracker: 'https://github.com/gilburns/Installomator-Tracker',
  metadata: 'https://github.com/gilburns/Installomator-Metadata',
  installomator: 'https://github.com/Installomator/Installomator',
};

export const isUrl = (v) => typeof v === 'string' && /^https?:\/\//i.test(v);

export const iconSrc = (app, size = 96) =>
  app.hasIcon ? `/icons/${size}/${app.label}.webp` : '/icons/placeholder.svg';

export const appHref = (label) => `/app/${label}/`;

const dateFmt = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

export const formatDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : '');
export const formatDay = (iso) => (iso ? dayFmt.format(new Date(iso)) : '');

// Every recorded version across all titles, newest first.
export function recentReleases(limit = RECENT_COUNT) {
  return apps
    .flatMap((app) => app.versions.map((v) => ({ app, ...v })))
    .filter((r) => r.timeStamp)
    .sort((a, b) => b.timeStamp.localeCompare(a.timeStamp))
    .slice(0, limit);
}

export function categories() {
  const counts = new Map();
  for (const a of apps) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
  return [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
}

export const lastUpdated = () =>
  apps.reduce((max, a) => (a.versions[0].timeStamp > max ? a.versions[0].timeStamp : max), '');
