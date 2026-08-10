import tablerCss from "@tabler/core/dist/css/tabler.min.css";

const THEME_HEADERS = {
  "content-type": "text/css; charset=utf-8",
  "cache-control": "public, max-age=86400",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

export function adminThemeResponse(): Response {
  return new Response(tablerCss, { headers: THEME_HEADERS });
}
