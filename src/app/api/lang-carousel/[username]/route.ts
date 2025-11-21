import { icons } from "@/utils/langIcons";

export const dynamic = "force-dynamic"; // Prevent static build issues

// ===== XXL SIZE SETTINGS =====
const MIN_BYTES = 5000;
const RECT_MIN_WIDTH = 180;       // Larger badge width
const SVG_HEIGHT = 160;           // XXL height
const GAP = 40;                   // Bigger spacing
const ICON_SIZE = 140;            // XXL icon size

// GitHub-friendly random colors
const COLORS = ["#1abc9c", "#e67e22", "#9b59b6", "#3498db", "#e74c3c", "#f1c40f"];

// Dynamic width calculator for unknown text
function calcWidth(name: string) {
  const estimated = name.length * 22 + 50; // XXL width calculation
  return Math.max(RECT_MIN_WIDTH, estimated);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ username: string }> }
) {
  const { username } = await context.params;

  // ===== Fetch repos =====
  const reposRes = await fetch(`https://api.github.com/users/${username}/repos`, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Authorization: process.env.GITHUB_TOKEN ? `Bearer ${process.env.GITHUB_TOKEN}` : "",
    },
    next: { revalidate: 0 },
  });

  if (!reposRes.ok)
    return new Response("GitHub API Error / Invalid Username / Rate Limit.", {
      status: reposRes.status,
    });

  const repos = await reposRes.json();
  if (!Array.isArray(repos)) return new Response("Invalid GitHub Username", { status: 404 });

  // ===== Language totals =====
  const langTotals: Record<string, number> = {};

  await Promise.all(
    repos.map(async (repo) => {
      if (!repo.languages_url) return;

      const langRes = await fetch(repo.languages_url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Authorization: process.env.GITHUB_TOKEN ? `Bearer ${process.env.GITHUB_TOKEN}` : "",
        },
        next: { revalidate: 0 },
      });

      if (!langRes.ok) return;
      const data = await langRes.json();

      for (const [lang, value] of Object.entries(data))
        langTotals[lang] = (langTotals[lang] || 0) + (value as number);
    })
  );

  const frequentLangs = Object.entries(langTotals)
    .filter(([, total]) => (total as number) >= MIN_BYTES)
    .map(([lang]) => lang);

  if (!frequentLangs.length)
    return new Response("No languages above threshold.", { status: 404 });

  // ===== Separate known & unknown icons =====
  const known = frequentLangs.filter((l) => icons[l]);
  const unknown = frequentLangs.filter((l) => !icons[l]);

  // ===== Calculate total width =====
  let totalWidth = 0;
  for (const lang of known) totalWidth += ICON_SIZE + GAP;
  for (const lang of unknown) totalWidth += calcWidth(lang) + GAP;

  const duration = Math.max(16, frequentLangs.length * 1.4);

  // ===== Build SVG blocks =====
  let x = 0;
  let parts: string[] = [];

  // Known Icons
  for (const lang of known) {
    parts.push(`
      <g transform="translate(${x},10)">
        <image href="${icons[lang]}" width="${ICON_SIZE}" height="${ICON_SIZE}" />
      </g>
    `);
    x += ICON_SIZE + GAP;
  }

  // Unknown badges
  for (const lang of unknown) {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const width = calcWidth(lang);

    parts.push(`
      <g transform="translate(${x},10)">
        <rect rx="24" ry="24" width="${width}" height="${ICON_SIZE}" fill="${color}" />
        <text x="${width / 2}" y="${ICON_SIZE / 1.55}"
          text-anchor="middle" font-size="32" fill="white" font-weight="bold">${lang}</text>
      </g>
    `);

    x += width + GAP;
  }

  // ===== FINAL SVG RETURN =====
  return new Response(
    `
<svg width="100%" height="${SVG_HEIGHT}"
  viewBox="0 0 ${totalWidth} ${SVG_HEIGHT}"
  xmlns="http://www.w3.org/2000/svg"
  preserveAspectRatio="xMidYMid meet">

  <g>
    ${parts.join("")}
    ${parts.join("")}

    <animateTransform 
      attributeName="transform"
      type="translate"
      dur="${duration}s"
      repeatCount="indefinite"
      keyTimes="0;1"
      values="0,0; -${totalWidth},0"
      calcMode="linear"
    />
  </g>
</svg>
  `,
    { headers: { "Content-Type": "image/svg+xml" } }
  );
}
