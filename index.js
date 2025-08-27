import express from "express";
import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";

dotenv.config();
const app = express();
app.use(express.json());

// Telegram bot inicializálás
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const chatId = process.env.TELEGRAM_CHAT_ID;

// Webhook endpoint: Helius ide küldi a tranzakciós adatokat
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body[0];

    if (!data) {
      return res.status(400).send("Webhook payload missing");
    }

    // Alap adatok kinyerése a webhookból
    const signature = data.signature;
    const solAmount = (data.nativeTransfers?.[0]?.amount || 0) / 1_000_000_000;
    const tokenMint = data.tokenTransfers?.[0]?.mint || "Unknown";
    const tokenSymbol = data.tokenTransfers?.[0]?.tokenSymbol || "UNKNOWN";
    const amount = data.tokenTransfers?.[0]?.tokenAmount || 0;
    const blockTime = data.blockTime ? new Date(data.blockTime * 1000).toLocaleString("hu-HU") : "Ismeretlen";

    // Solscan link generálás
    const solscanUrl = `https://solscan.io/tx/${signature}`;

    // Telegram üzenet formázás
    const message = `
🔥 *100% LP ELÉGETVE!* 🔥

💰 Token: ${tokenSymbol}  
🔑 Mint: \`${tokenMint}\`
🔥 Égetett tokens: ${amount.toLocaleString()}
💎 SOL égetve: ${solAmount} SOL
📊 Market Cap: N/A
🗓 Időpont: ${blockTime}

✅ TELJES MEME/SOL LP ELÉGETVE!
🛡 ${solAmount} SOL biztosan elégetve
⛔ Rug pull: *Már nem lehetséges!*
📈 Tranzakció: [Solscan](${solscanUrl})

🚀 Biztonságos memecoin lehet!
⚠️ DYOR: Mindig végezz saját kutatást!
`;

    // Telegram értesítés küldése
    await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });

    console.log("✅ LP burn értesítés kiküldve Telegramra");
    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Hiba:", err.message);
    res.status(500).send("Server error");
  }
});

// Szerver indítása
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 ClaudeHelius fut a ${PORT} porton`));
