
const SESSION_COOKIE = "lourdes_admin_session";
const SESSION_SECONDS = 8 * 60 * 60;

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function redirect(url, status = 303, headers = {}) {
  return new Response(null, {
    status,
    headers: {
      Location: url,
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function base64url(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function equalConstantTime(a, b) {
  const encoder = new TextEncoder();
  const x = encoder.encode(String(a));
  const y = encoder.encode(String(b));
  let diff = x.length ^ y.length;
  const max = Math.max(x.length, y.length);

  for (let i = 0; i < max; i++) {
    diff |= (x[i] || 0) ^ (y[i] || 0);
  }

  return diff === 0;
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );

  return base64url(signature);
}

async function createSession(env) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const payload = `${expires}.${nonce}`;
  const signature = await hmac(payload, env.SESSION_SECRET);

  return `${payload}.${signature}`;
}

async function validSession(request, env) {
  if (!env.SESSION_SECRET) return false;

  const cookieHeader = request.headers.get("Cookie") || "";
  const prefix = `${SESSION_COOKIE}=`;
  const cookie = cookieHeader
    .split(";")
    .map(value => value.trim())
    .find(value => value.startsWith(prefix));

  if (!cookie) return false;

  const token = cookie.slice(prefix.length);
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [expiresText, nonce, signature] = parts;
  if (!/^\d+$/.test(expiresText)) return false;
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(nonce)) return false;
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(signature)) return false;

  const expires = Number(expiresText);
  const now = Math.floor(Date.now() / 1000);

  if (!Number.isSafeInteger(expires) || expires <= now) return false;
  if (expires > now + SESSION_SECONDS + 60) return false;

  const expected = await hmac(
    `${expiresText}.${nonce}`,
    env.SESSION_SECRET
  );

  return equalConstantTime(signature, expected);
}

function cookieHeader(value, maxAge) {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function loginPage(error = "") {
  const errorHtml = error
    ? `<p role="alert" style="color:#a33;font-size:13px">${error}</p>`
    : "";

  return new Response(`<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Admin Login — Lourdes</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8f4ee;color:#27352f;font-family:system-ui,sans-serif;padding:20px}
main{width:min(400px,100%);background:#fffcf7;padding:34px;border:1px solid #e8e1d7}
.brand{font:28px Georgia,serif;letter-spacing:.12em;color:#315b50}
p{font-size:14px;line-height:1.7;color:#68746b}
label{display:block;font-size:12px;margin:24px 0 8px}
input{width:100%;padding:13px;border:1px solid #cfd8d0;background:white;font:inherit}
button{width:100%;margin-top:16px;padding:13px;background:#315b50;color:white;border:0;cursor:pointer;font:inherit}
</style>
</head>
<body>
<main>
<div class="brand">LOURDES</div>
<p>Masuk untuk mengelola jurnal Lourdes.</p>
${errorHtml}
<form method="post" action="/admin/login">
<label for="password">KATA SANDI ADMIN</label>
<input id="password" name="password" type="password"
autocomplete="current-password" required autofocus>
<button type="submit">Masuk ke Admin</button>
</form>
</main>
</body>
</html>`, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer"
    }
  });
}


function sameOriginPost(request, url) {
  const origin = request.headers.get("Origin");

  if (origin) {
    try {
      return new URL(origin).origin === url.origin;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("Referer");

  if (!referer) {
    return false;
  }

  try {
    return new URL(referer).origin === url.origin;
  } catch {
    return false;
  }
}


export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Public health check.
    if (path === "/api/health") {
      return json({
        ok: true,
        service: "Lourdes CMS API",
        message: "API is running"
      });
    }

    // Do not expose database diagnostics publicly.
    if (path === "/api/db-test") {
      return json({ ok: false, message: "Not found" }, 404);
    }

    // Login page and login handler.
    if (path === "/admin/login") {
      if (request.method === "GET") {
        if (await validSession(request, env)) {
          return redirect(new URL("/admin/", url).href);
        }
        return loginPage();
      }

      if (request.method !== "POST") {
        return json(
          { ok: false, message: "Method not allowed" },
          405,
          { Allow: "GET, POST" }
        );
      }

      if (!sameOriginPost(request, url)) {
        return json({ ok: false, message: "Invalid request origin" }, 403);
      }

      if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
        return json(
          { ok: false, message: "Admin authentication is not configured" },
          503
        );
      }

      let password = "";

      try {
        const form = await request.formData();
        password = String(form.get("password") || "");
      } catch {
        return loginPage("Permintaan login tidak valid.");
      }

      if (password.length > 1024 || !password) {
        return loginPage("Kata sandi tidak benar.");
      }

      // Compare SHA-256 digests rather than raw password strings.
      const encoder = new TextEncoder();
      const suppliedDigest = base64url(
        await crypto.subtle.digest("SHA-256", encoder.encode(password))
      );
      const expectedDigest = base64url(
        await crypto.subtle.digest(
          "SHA-256",
          encoder.encode(env.ADMIN_PASSWORD)
        )
      );

      if (!equalConstantTime(suppliedDigest, expectedDigest)) {
        return loginPage("Kata sandi tidak benar.");
      }

      const session = await createSession(env);

      return redirect(new URL("/admin/", url).href, 303, {
        "Set-Cookie": cookieHeader(session, SESSION_SECONDS)
      });
    }

    // Logout requires a same-origin POST and a valid session.
    if (path === "/admin/logout") {
      if (request.method !== "POST") {
        return json(
          { ok: false, message: "Method not allowed" },
          405,
          { Allow: "POST" }
        );
      }

      if (!sameOriginPost(request, url)) {
        return json({ ok: false, message: "Invalid request origin" }, 403);
      }

      if (!(await validSession(request, env))) {
        return redirect(new URL("/admin/login", url).href, 303, {
          "Set-Cookie": cookieHeader("", 0)
        });
      }

      return redirect(new URL("/admin/login", url).href, 303, {
        "Set-Cookie": cookieHeader("", 0)
      });
    }

    // Protect every path under /admin, including direct file URLs.
    const isAdminPath = path === "/admin" || path.startsWith("/admin/");

    if (isAdminPath) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return json(
          { ok: false, message: "Method not allowed" },
          405,
          { Allow: "GET, HEAD" }
        );
      }

      if (!(await validSession(request, env))) {
  // URL utama admin menampilkan login secara langsung.
  if (path === "/admin" || path === "/admin/") {
    return loginPage();
  }

  // Halaman admin lainnya kembali ke pintu masuk.
  return redirect(new URL("/admin", url).href, 303);
}

      const assetUrl = new URL(url);
      if (path === "/admin" || path === "/admin/") {
        assetUrl.pathname = "/admin/index.html";
      }

      const assetRequest = new Request(assetUrl.href, request);
      const response = await env.ASSETS.fetch(assetRequest);

      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("X-Frame-Options", "DENY");
      headers.set("Referrer-Policy", "same-origin");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    // Public API: only published articles are readable.
    if (path.startsWith("/api/articles/")) {
      if (request.method !== "GET") {
        return json(
          { ok: false, message: "Method not allowed" },
          405,
          { Allow: "GET" }
        );
      }

      try {
        const slug = decodeURIComponent(
          path.slice("/api/articles/".length)
        );

        if (!slug || slug.includes("/")) {
          return json({ ok: false, message: "Article not found" }, 404);
        }

        const article = await env.LOURDES_DB
          .prepare(`
            SELECT
              id, title, slug, excerpt, content, cover_image,
              seo_title, seo_description, published_at
            FROM articles
            WHERE slug = ? AND status = 'published'
            LIMIT 1
          `)
          .bind(slug)
          .first();

        if (!article) {
          return json({ ok: false, message: "Article not found" }, 404);
        }

        return json({ ok: true, article });
      } catch {
        return json(
          { ok: false, message: "Failed to fetch article" },
          500
        );
      }
    }

    if (path === "/api/articles") {
      if (request.method !== "GET") {
        return json(
          { ok: false, message: "Method not allowed" },
          405,
          { Allow: "GET" }
        );
      }

      try {
        const result = await env.LOURDES_DB
          .prepare(`
            SELECT
              id, title, slug, excerpt, cover_image,
              seo_title, seo_description, published_at
            FROM articles
            WHERE status = 'published'
            ORDER BY published_at DESC
          `)
          .all();

        return json({
          ok: true,
          articles: result.results
        });
      } catch {
        return json(
          { ok: false, message: "Failed to fetch articles" },
          500
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};
