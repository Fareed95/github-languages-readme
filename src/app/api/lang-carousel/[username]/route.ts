import { icons } from "@/utils/langIcons";

const MIN_BYTES = 5000; // Minimum bytes threshold
const RECT_MIN_WIDTH = 55; // Minimum width for unknown langs
const SVG_HEIGHT = 55;
const VIEWPORT_WIDTH = 600; // Fixed carousel width
const GAP = 15; // Equal spacing between items

// GitHub-friendly random colors
const COLORS = ["#1abc9c", "#e67e22", "#9b59b6", "#3498db", "#e74c3c", "#f1c40f"];

// Dynamic width calculator for unknown text
function calcWidth(name: string) {
  const estimated = name.length * 8 + 22; // 8px per char + padding
  return Math.max(RECT_MIN_WIDTH, estimated);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ username: string }> }
) {
  const { username } = await context.params;

  // Fetch repos
  const reposRes = await fetch(`https://api.github.com/users/${username}/repos`, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Authorization: process.env.GITHUB_TOKEN ? `token ${process.env.GITHUB_TOKEN}` : "",
    },
  });

  if (!reposRes.ok)
    return new Response("GitHub API Error / Invalid Username / Rate Limit.", {
      status: reposRes.status,
    });

  const repos = await reposRes.json();
  if (!Array.isArray(repos)) return new Response("Invalid GitHub Username", { status: 404 });

  // Language totals
  const langTotals: Record<string, number> = {};

  await Promise.all(
    repos.map(async (repo) => {
      if (!repo.languages_url) return;

      const langRes = await fetch(repo.languages_url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Authorization: process.env.GITHUB_TOKEN ? `token ${process.env.GITHUB_TOKEN}` : "",
        },
      });

      if (!langRes.ok) return;
      const data = await langRes.json();

      for (const [lang, value] of Object.entries(data))
        langTotals[lang] = (langTotals[lang] || 0) + (value as number);
    })
  );

  // Filter big languages
  const frequentLangs = Object.entries(langTotals)
    .filter(([, total]) => (total as number) >= MIN_BYTES)
    .map(([lang]) => lang);

  if (!frequentLangs.length)
    return new Response("No languages above threshold.", { status: 404 });

  // Separate known & unknown icons
  const known = frequentLangs.filter((l) => icons[l]);
  const unknown = frequentLangs.filter((l) => !icons[l]);

  // Calculate totalWidth dynamically (with spacing)
  let totalWidth = 0;
  for (const lang of known) totalWidth += 60 + GAP; // icons always 55px + 5px padding
  for (const lang of unknown) totalWidth += calcWidth(lang) + GAP;

  // Scrolling duration
  const duration = Math.max(12, frequentLangs.length * 0.9);

  // Build SVG blocks
  let x = 0;
  let parts: string[] = [];

  // ========== Known icons ==========
  for (const lang of known) {
    parts.push(`
      <g transform="translate(${x},0)">
        <image href="${icons[lang]}" width="55" height="55" />
      </g>
    `);
    x += 60 + GAP;
  }

  // ========== Unknown language tags ==========
  for (const lang of unknown) {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const width = calcWidth(lang);
    parts.push(`
      <g transform="translate(${x},0)">
        <rect rx="10" ry="10" width="${width}" height="55" fill="${color}" />
        <text x="${width / 2}" y="32" text-anchor="middle" font-size="11" fill="white" font-weight="bold">${lang}</text>
      </g>
    `);
    x += width + GAP;
  }

  // ========== FINAL RETURN (HTML + SVG) ==========
  return new Response(
    `
  <div style="width:${VIEWPORT_WIDTH}px; overflow:hidden; display:inline-block; white-space:nowrap;">
    <svg width="${totalWidth * 2}" height="${SVG_HEIGHT}"
         viewBox="0 0 ${totalWidth * 2} ${SVG_HEIGHT}"
         xmlns="http://www.w3.org/2000/svg"
         preserveAspectRatio="xMinYMin">

      <g>
        ${parts.join("")}
        ${parts.join("")} <!-- Duplicate ONCE for infinite looping -->

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
  </div>
  `,
    { headers: { "Content-Type": "text/html" } }
  );
}
