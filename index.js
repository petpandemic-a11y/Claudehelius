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

// Webhook endpoint
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;

    if (!data || !data[0] || !data[0].nativeTransfers) {
      return res.status(400).send("Invalid webhook payload");
    }

    // LP burn tranzakció részletei
    const txHash = data[0].signature;
    const amount = data[0].nativeTransfers[0]?.amount || 0;
    const symbol = data[0].tokenTransfers[0]?.tokenSymbol || "UNKNOWN";
    const solscanUrl = `https://solscan.io/tx/${txHash}`;

    // Üzenet összeállítása
    const message = `🔥 LP Burn Detected!  
Token: ${symbol}  
Amount: ${(amount / 1_000_000_000).toFixed(2)} SOL  
[View on Solscan](${solscanUrl})`;

    // Telegram üzenet küldés
    await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });

    console.log("✅ LP burn notification sent to Telegram");
    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(500).send("Server error");
  }
});

// Server indítás
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
