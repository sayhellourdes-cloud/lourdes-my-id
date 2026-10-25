
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        service: "Lourdes CMS API",
        message: "API is running"
      });
    }

    if (url.pathname === "/api/db-test") {
      try {
        const result = await env.LOURDES_DB
          .prepare("SELECT COUNT(*) AS total_articles FROM articles")
          .first();

        return Response.json({
          ok: true,
          database: "connected",
          total_articles: result.total_articles
        });
      } catch (error) {
        return Response.json({
          ok: false,
          database: "error",
          message: error.message
        }, { status: 500 });
      }
    }

    if (url.pathname.startsWith("/api/articles/")) {
      if (request.method !== "GET") {
        return Response.json(
          { ok: false, message: "Method not allowed" },
          {
            status: 405,
            headers: { Allow: "GET" }
          }
        );
      }

      try {
        const slug = decodeURIComponent(
          url.pathname.slice("/api/articles/".length)
        );

        if (!slug || slug.includes("/")) {
          return Response.json(
            { ok: false, message: "Article not found" },
            { status: 404 }
          );
        }

        const article = await env.LOURDES_DB
          .prepare(`
            SELECT
              id,
              title,
              slug,
              excerpt,
              content,
              cover_image,
              seo_title,
              seo_description,
              published_at
            FROM articles
            WHERE slug = ?
              AND status = 'published'
            LIMIT 1
          `)
          .bind(slug)
          .first();

        if (!article) {
          return Response.json(
            { ok: false, message: "Article not found" },
            { status: 404 }
          );
        }

        return Response.json({
          ok: true,
          article
        });
      } catch (error) {
        return Response.json(
          { ok: false, message: "Failed to fetch article" },
          { status: 500 }
        );
      }
    }

    if (url.pathname === "/api/articles") {
      if (request.method !== "GET") {
        return Response.json(
          { ok: false, message: "Method not allowed" },
          {
            status: 405,
            headers: { Allow: "GET" }
          }
        );
      }

      try {
        const result = await env.LOURDES_DB
          .prepare(`
            SELECT
              id,
              title,
              slug,
              excerpt,
              cover_image,
              seo_title,
              seo_description,
              published_at
            FROM articles
            WHERE status = 'published'
            ORDER BY published_at DESC
          `)
          .all();

        return Response.json({
          ok: true,
          articles: result.results
        });
      } catch (error) {
        return Response.json({
          ok: false,
          message: "Failed to fetch articles"
        }, { status: 500 });
      }
    }

    return env.ASSETS.fetch(request);
  }
};
