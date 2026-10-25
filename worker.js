
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

    return env.ASSETS.fetch(request);
  }
};
