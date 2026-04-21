import { Hono } from "hono";

const app = new Hono();

const TOKEN = "8626624026:AAEzMxduEuz19kXwC93QvzK9V6E13155x9o";

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.post("/webhook", async (c) => {
  const body = await c.req.json();

  const message = body.message;
  const text = message?.text;
  const chatId = message?.chat?.id;

  if (!chatId) {
    return c.text("no chat id");
  }

  // kirim balasan ke Telegram
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: `Kamu bilang: ${text}`,
    }),
  });

  return c.text("ok");
});

export default app;
