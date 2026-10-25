
export async function onRequestGet() {
  return Response.json({
    ok: true,
    service: "Lourdes CMS API",
    message: "API is running"
  });
}
