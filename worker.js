
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

    return env.ASSETS.fetch(request);
  }
};
