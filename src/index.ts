import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
  TELEGRAM_TOKEN: string;
};

const app = new Hono<{ Bindings: Bindings }>();

function getWIBDate() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
  );
}

function parseNaturalTime(input: string): Date | null {
  const now = getWIBDate();
  const lowerInput = input.toLowerCase();

  // Keyword: besok
  if (lowerInput.includes("besok")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return tomorrow;
  }

  // Keyword: lusa
  if (lowerInput.includes("lusa")) {
    const dayAfter = new Date(now);
    dayAfter.setDate(now.getDate() + 2);
    return dayAfter;
  }

  // Keyword: nanti (default ke hari ini)
  // Extract jam dari format "jam 8:00" atau "jam 08:00" atau "08:00"
  const jamMatch = input.match(/(\d{1,2})[:.](\d{2})/);
  if (jamMatch) {
    const jam = parseInt(jamMatch[1]);
    const menit = parseInt(jamMatch[2]);
    const targetTime = new Date(now);
    targetTime.setHours(jam, menit, 0, 0);
    return targetTime;
  }

  return null;
}

async function sendDailySummary(env: Bindings, chatId: string) {
  const now = getWIBDate();
  const todayStr = now.toISOString().split("T")[0];
  const tomorrowStr = new Date(now.getTime() + 86400000)
    .toISOString()
    .split("T")[0];

  const reminders = await env.DB.prepare(
    `SELECT message, remind_at FROM reminders 
     WHERE user_id = ? AND is_done = 0 
     AND remind_at >= ? AND remind_at < ?`,
  )
    .bind(chatId, `${todayStr}T00:00:00`, `${tomorrowStr}T00:00:00`)
    .all();

  const todos = await env.DB.prepare(
    `SELECT content FROM todos WHERE user_id = ? ORDER BY created_at DESC`,
  )
    .bind(chatId)
    .all();

  let message = "🌅 *Daily Summary* - Selamat pagi!\n\n";

  if (reminders.results.length > 0) {
    message += "⏰ *Reminder Hari Ini:*\n";
    for (const r of reminders.results) {
      const waktu = (r.remind_at as string).split("T")[1].slice(0, 5);
      message += `  • ${waktu} - ${r.message}\n`;
    }
    message += "\n";
  } else {
    message += "⏰ Tidak ada reminder hari ini\n\n";
  }

  if (todos.results.length > 0) {
    message += "📌 *Todo List:*\n";
    for (const t of todos.results.slice(0, 5)) {
      message += `  • ${t.content}\n`;
    }
    if (todos.results.length > 5) {
      message += `  • ...dan ${todos.results.length - 5} lainnya\n`;
    }
  } else {
    message += "📌 Belum ada todo\n";
  }

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown",
    }),
  });
}

app.post("/webhook", async (c) => {
  const body = await c.req.json();
  const message = body.message;
  if (!message) return c.text("ok");

  const chatId = message.chat.id.toString();
  const text = message.text;

  let reply = "Perintah tidak dikenali 🤖";

  if (text === "/start") {
    reply = `👋 Halo!

Aku adalah bot personal assistant kamu 🤖

✨ Fitur baru:
🔍 cari <kata kunci>
📊 daily summary
⏰ ingatkan aku <pesan> besok jam 08:00

Ketik /help untuk lihat semua perintah`;
  } else if (text === "/help") {
    reply = `📖 *Daftar Perintah Baru:* ✨

📝 *Catatan:*
- catat <isi>
- lihat catatan
- 🔍 cari <kata>

📌 *Todo:*
- todo <isi>
- lihat todo

⏰ *Reminder (UPGRADE!):*
- ingatkan aku <pesan> jam HH:MM
- ingatkan aku <pesan> besok jam HH:MM
- ingatkan aku <pesan> lusa jam HH:MM
- ingatkan aku <pesan> nanti jam HH:MM

📊 *Lainnya:*
- summary - lihat ringkasan hari ini
- /help - bantuan ini

Contoh natural language:
"ingatkan aku beli susu besok jam 08:00"
"ingatkan aku meeting jam 14:30"`;
  } else if (text === "summary") {
    await sendDailySummary(c.env, chatId);
    return c.text("ok");
  } else if (text.startsWith("cari")) {
    const keyword = text.replace("cari", "").trim();
    if (!keyword) {
      reply = "Masukkan kata kunci. Contoh: cari meeting";
    } else {
      const notes = await c.env.DB.prepare(
        "SELECT content, '📝 Catatan' as type FROM notes WHERE user_id = ? AND content LIKE ?",
      )
        .bind(chatId, `%${keyword}%`)
        .all();

      const todos = await c.env.DB.prepare(
        "SELECT content, '📌 Todo' as type FROM todos WHERE user_id = ? AND content LIKE ?",
      )
        .bind(chatId, `%${keyword}%`)
        .all();

      const results = [...notes.results, ...todos.results];

      if (results.length === 0) {
        reply = `🔍 Tidak ditemukan hasil untuk "${keyword}"`;
      } else {
        reply = `🔍 *Hasil pencarian:* "${keyword}"\n\n`;
        for (const r of results.slice(0, 10)) {
          reply += `${r.type}: ${r.content}\n`;
        }
        if (results.length > 10) {
          reply += `\n...dan ${results.length - 10} hasil lainnya`;
        }
      }
    }
  } else if (text.startsWith("catat")) {
    const isi = text.replace("catat", "").trim();
    const now = getWIBDate();
    await c.env.DB.prepare(
      "INSERT INTO notes (user_id, content, created_at) VALUES (?, ?, ?)",
    )
      .bind(chatId, isi, now.toISOString())
      .run();
    reply = "✅ Catatan disimpan!";
  } else if (text === "lihat catatan") {
    const result = await c.env.DB.prepare(
      "SELECT content FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
    )
      .bind(chatId)
      .all();
    const data = result.results.map((r: any) => r.content);
    reply = data.length
      ? `📝 *Catatan kamu:*\n${data.map((d, i) => `${i + 1}. ${d}`).join("\n")}`
      : "Belum ada catatan";
  } else if (text.startsWith("todo")) {
    const isi = text.replace("todo", "").trim();
    const now = getWIBDate();
    await c.env.DB.prepare(
      "INSERT INTO todos (user_id, content, created_at) VALUES (?, ?, ?)",
    )
      .bind(chatId, isi, now.toISOString())
      .run();
    reply = "✅ Todo ditambahkan!";
  } else if (text === "lihat todo") {
    const result = await c.env.DB.prepare(
      "SELECT content FROM todos WHERE user_id = ? ORDER BY created_at DESC",
    )
      .bind(chatId)
      .all();
    const data = result.results.map((r: any) => r.content);
    reply = data.length
      ? `📌 *Todo kamu:*\n${data.map((d, i) => `${i + 1}. ${d}`).join("\n")}`
      : "Belum ada todo";
  } else if (text.startsWith("ingatkan aku")) {
    let targetDate: Date | null = null;

    if (
      text.includes("besok") ||
      text.includes("lusa") ||
      text.includes("nanti")
    ) {
      targetDate = parseNaturalTime(text);
    }

    const jamMatch = text.match(/(\d{1,2})[:.](\d{2})/);

    if (!jamMatch) {
      reply =
        "Format salah.\nContoh:\n- ingatkan aku belajar jam 20:00\n- ingatkan aku beli susu besok jam 08:00";
    } else {
      const jam = parseInt(jamMatch[1]);
      const menit = parseInt(jamMatch[2]);

      let remindDate = targetDate || getWIBDate();
      remindDate.setHours(jam, menit, 0, 0);

      if (!targetDate && remindDate < getWIBDate()) {
        remindDate.setDate(remindDate.getDate() + 1);
      }

      const pesan = text
        .replace("ingatkan aku", "")
        .replace(/besok|lusa|nanti/g, "")
        .replace(/\d{1,2}[:.]\d{2}/g, "")
        .trim();

      await c.env.DB.prepare(
        "INSERT INTO reminders (user_id, message, remind_at) VALUES (?, ?, ?)",
      )
        .bind(chatId, pesan, remindDate.toISOString())
        .run();

      const jamStr = `${jam.toString().padStart(2, "0")}:${menit.toString().padStart(2, "0")}`;
      const tanggalStr = remindDate.toLocaleDateString("id-ID");
      reply = `⏰ Reminder disimpan:\n📝 ${pesan}\n📅 ${tanggalStr} jam ${jamStr} WIB`;
    }
  }

  await fetch(
    `https://api.telegram.org/bot${c.env.TELEGRAM_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: reply,
        parse_mode: "Markdown",
      }),
    },
  );

  return c.text("ok");
});

export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Bindings) {
    if (event.cron === "* * * * *") {
      const now = getWIBDate().toISOString();
      const result = await env.DB.prepare(
        "SELECT * FROM reminders WHERE is_done = 0 AND remind_at <= ?",
      )
        .bind(now)
        .all();

      for (const r of result.results) {
        await fetch(
          `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: r.user_id,
              text: `⏰ *Reminder:*\n${r.message}`,
              parse_mode: "Markdown",
            }),
          },
        );
        await env.DB.prepare("UPDATE reminders SET is_done = 1 WHERE id = ?")
          .bind(r.id)
          .run();
      }
    }

    if (event.cron === "0 0 * * *") {
      const users = await env.DB.prepare(
        "SELECT DISTINCT user_id FROM reminders UNION SELECT DISTINCT user_id FROM notes",
      ).all();
      for (const user of users.results) {
        await sendDailySummary(env, user.user_id as string);
      }
    }
  },
};
