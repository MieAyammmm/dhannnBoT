import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.post("/webhook", async (c) => {
  const body = await c.req.json();

  console.log("Data dari Telegram:", body);

  return c.text("ok");
});

export default app;
