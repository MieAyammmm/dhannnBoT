import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

const TELEGRAM_TOKEN = "8626624026:AAEzMxduEuz19kXwC93QvzK9V6E13155x9o";

// webhook handler
app.post("/", async (c) => {
  const body = await c.req.json();

  const message = body.message;
  if (!message) return c.text("ok");

  const chatId = message.chat.id;
  const text = message.text;

  let reply = "Perintah tidak dikenali 🤖";

  // =========================
  // 📝 NOTES
  // =========================

  if (text.startsWith("catat")) {
    const isi = text.replace("catat ", "");

    await c.env.DB.prepare(
      "INSERT INTO notes (user_id, content, created_at) VALUES (?, ?, ?)",
    )
      .bind(chatId.toString(), isi, new Date().toISOString())
      .run();

    reply = "✅ Catatan disimpan!";
  }

  if (text === "lihat catatan") {
    const result = await c.env.DB.prepare(
      "SELECT content FROM notes WHERE user_id = ?",
    )
      .bind(chatId.toString())
      .all();

    const data = result.results.map((r: any) => r.content);

    reply = data.length
      ? `📝 Catatan kamu:\n- ${data.join("\n- ")}`
      : "Belum ada catatan";
  }

  // =========================
  // 📌 TODO
  // =========================

  if (text.startsWith("todo")) {
    const isi = text.replace("todo ", "");

    await c.env.DB.prepare(
      "INSERT INTO todos (user_id, content, created_at) VALUES (?, ?, ?)",
    )
      .bind(chatId.toString(), isi, new Date().toISOString())
      .run();

    reply = "✅ Todo ditambahkan!";
  }

  if (text === "lihat todo") {
    const result = await c.env.DB.prepare(
      "SELECT content FROM todos WHERE user_id = ?",
    )
      .bind(chatId.toString())
      .all();

    const data = result.results.map((r: any) => r.content);

    reply = data.length
      ? `📌 Todo kamu:\n- ${data.join("\n- ")}`
      : "Belum ada todo";
  }

  // =========================
  // 🚀 KIRIM KE TELEGRAM
  // =========================

  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: reply,
    }),
  });

  return c.text("ok");
});

export default app;
