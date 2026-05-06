import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
  TELEGRAM_TOKEN: string;
};

const app = new Hono<{ Bindings: Bindings }>();


function getWIBDate() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
  );
}

app.post("/webhook", async (c) => {
  const body = await c.req.json();

  const message = body.message;
  if (!message) return c.text("ok");

  const chatId = message.chat.id;
  const text = message.text;

  let reply = "Perintah tidak dikenali 🤖";


  if (text.startsWith("catat")) {
    const isi = text.replace("catat", "").trim();

    const now = getWIBDate();

    await c.env.DB.prepare(
      "INSERT INTO notes (user_id, content, created_at) VALUES (?, ?, ?)"
    )
      .bind(chatId.toString(), isi, now.toISOString())
      .run();

    reply = "✅ Catatan disimpan!";
  }

  else if (text === "lihat catatan") {
    const result = await c.env.DB.prepare(
      "SELECT content FROM notes WHERE user_id = ? ORDER BY created_at DESC"
    )
      .bind(chatId.toString())
      .all();

    const data = result.results.map((r: any) => r.content);

    reply = data.length
      ? `📝 Catatan kamu:\n- ${data.join("\n- ")}`
      : "Belum ada catatan";
  }


  else if (text.startsWith("todo")) {
    const isi = text.replace("todo", "").trim();

    const now = getWIBDate();

    await c.env.DB.prepare(
      "INSERT INTO todos (user_id, content, created_at) VALUES (?, ?, ?)"
    )
      .bind(chatId.toString(), isi, now.toISOString())
      .run();

    reply = "✅ Todo ditambahkan!";
  }

  else if (text === "lihat todo") {
    const result = await c.env.DB.prepare(
      "SELECT content FROM todos WHERE user_id = ? ORDER BY created_at DESC"
    )
      .bind(chatId.toString())
      .all();

    const data = result.results.map((r: any) => r.content);

    reply = data.length
      ? `📌 Todo kamu:\n- ${data.join("\n- ")}`
      : "Belum ada todo";
  }

  else if (text.startsWith("ingatkan aku")) {
    const jamMatch = text.match(/jam (\d{2}:\d{2})/);

    const pesan = text
      .replace("ingatkan aku", "")
      .replace(/jam \d{2}:\d{2}/, "")
      .trim();

    if (!jamMatch) {
      reply = "Format salah. Contoh: ingatkan aku belajar jam 20:00";
    } else {
      const jam = jamMatch[1];

      const now = getWIBDate();
      const tanggal = now.toISOString().split("T")[0];

      const remindAt = `${tanggal}T${jam}:00`;

      await c.env.DB.prepare(
        "INSERT INTO reminders (user_id, message, remind_at) VALUES (?, ?, ?)"
      )
        .bind(chatId.toString(), pesan, remindAt)
        .run();

      reply = `⏰ Reminder disimpan jam ${jam} WIB`;
    }
  }

  await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_TOKEN}/sendMessage`, {
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

export default {
  fetch: app.fetch,


  async scheduled(event: ScheduledEvent, env: Bindings) {
    const now = getWIBDate().toISOString();

    const result = await env.DB.prepare(
      "SELECT * FROM reminders WHERE is_done = 0 AND remind_at <= ?"
    )
      .bind(now)
      .all();

    for (const r of result.results) {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: r.user_id,
          text: `⏰ Reminder:\n${r.message}`,
        }),
      });

      await env.DB.prepare(
        "UPDATE reminders SET is_done = 1 WHERE id = ?"
      )
        .bind(r.id)
        .run();
    }
  },
};