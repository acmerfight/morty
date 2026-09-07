export default {
  fetch() {
    return new Response(null, { status: 204 });
  },
} satisfies ExportedHandler;
