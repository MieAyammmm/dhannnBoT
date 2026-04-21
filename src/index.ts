import { Hono } from "hono";

const app = new Hono();

const notes: string[] = [];
const todos: string[] = [];

const TOKEN = "8626624026:AAEzMxduEuz19kXwC93QvzK9V6E13155x9o";

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.post("/webhook", async (c) => {
  const body = await c.req.json();

  const message = body.message;
  const text = message?.text?.toLowerCase();
  const chatId = message?.chat?.id;

  if (!chatId || !text) {
    return c.text("no message");
  }

  let reply = "";

  // 📝 NOTES
  if (text.startsWith("catat")) {
    const isi = text.replace("catat", "").trim();
    notes.push(isi);

    reply = `📝 Catatan disimpan:\n"${isi}"`;
  }

  // ✅ TODO
  else if (text.startsWith("tugas")) {
    const isi = text.replace("tugas", "").trim();
    todos.push(isi);

    reply = `✅ Tugas ditambahkan:\n"${isi}"`;
  }

  // 📋 LIHAT NOTES
  else if (text === "lihat catatan") {
    reply = notes.length
      ? `📝 Catatan kamu:\n- ${notes.join("\n- ")}`
      : "Belum ada catatan";
  }

  // 📋 LIHAT TODO
  else if (text === "lihat tugas") {
    reply = todos.length
      ? `✅ Tugas kamu:\n- ${todos.join("\n- ")}`
      : "Belum ada tugas";
  }

  // ⏰ REMINDER (basic dulu)
  else if (text.startsWith("ingatkan")) {
    reply = "⏰ Reminder disimpan (fitur aktif di step berikutnya)";
  }

  // DEFAULT
  else {
    reply = `Aku belum paham 😅\nCoba:\n- catat beli bensin\n- tugas belajar\n- lihat catatan`;
  }

  // kirim balasan
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
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
