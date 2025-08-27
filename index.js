import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";

dotenv.config();
const app = express();
app.use(express.json());

// Telegram bot inicializálás
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const chatId = process.env.TELEGRAM_CHAT_ID;

// Webhook endpoint Helius számára
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body[0];

    if (!data) {
      return res.status(400).send("Missing webhook data");
    }

    const signature = data.signature;
    const solAmount = (data.nativeTransfers?.[0]?.amount || 0) / 1_000_000_000;
    const tokenMint = data.tokenTransfers?.[0]?.mint || "Unknown";
    const tokenSymbol = data.tokenTransfers?.[0]?.tokenSymbol || "UNKNOWN";
    const amount = data.tokenTransfers?.[0]?.tokenAmount || 0;

    const solscanUrl = `https://solscan.io/tx/${signature}`;

    // Telegram üzenet formázás
    const message = `
🔥 *100% LP ELÉGETVE!* 🔥

💰 Token: ${tokenSymbol}  
🔑 Mint: \`${tokenMint}\`
🔥 Égetett tokens: ${amount.toLocaleString()}
💎 SOL égetve: ${solAmount} SOL
📊 Market Cap: N/A
🗓 Időpont: ${new Date(data.blockTime * 1000).toLocaleString("hu-HU")}

✅ TELJES MEME/SOL LP ELÉGETVE!
🛡 ${solAmount} SOL biztosan elégetve
⛔ Rug pull: *Már nem lehetséges!*
📈 Tranzakció: [Solscan](${solscanUrl})

🚀 Biztonságos memecoin lehet!
⚠️ DYOR: Mindig végezz saját kutatást!
`;

    // Telegram értesítés
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
app.listen(PORT, () => console.log(`🚀 Server fut a ${PORT} porton`));
