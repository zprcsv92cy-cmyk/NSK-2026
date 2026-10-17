export default { fetch() { return new Response('Production authentication not enabled', { status: 503 }); } };
