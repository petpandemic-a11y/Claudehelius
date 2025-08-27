import express from "express";
import fetch from "node-fetch";
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(express.json({ limit: "5mb" }));

const PORT = process.env.PORT || 10000;
const HELIUS_WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

const RAYDIUM_PROGRAM = "RVKd61ztZW9njDq5E7Yh5b2bb4a6JjAwjhH38GZ3oN7";

// Ellenőrzés: Helius webhook signature
function verifyHeliusSignature(req) {
  const signature = req.headers["x-helius-signature"];
  const hmac = crypto
    .createHmac("sha256", HELIUS_WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");

  return signature === hmac;
}

// Token metainfó lekérése Solana API-ról
async function getTokenMetadata(mint) {
  try {
    const url = `https://api.helius.xyz/v0/tokens?mintAccounts=${mint}&api-key=${process.env.HELIUS_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data[0]) {
      return {
        name: data[0].name || "Unknown Token",
        symbol: data[0].symbol || "UNKNOWN",
        logo: data[0].logo || null
      };
    }
  } catch (e) {
    console.error("Metadata fetch error:", e);
  }
  return { name: "Unknown Token", symbol: "UNKNOWN", logo: null };
}

// Webhook endpoint
app.post("/webhook", async (req, res) => {
  if (!verifyHeliusSignature(req)) {
    console.error("Helius signature mismatch!");
    return res.status(401).send("Invalid signature");
  }

  const txs = req.body || [];
  for (const tx of txs) {
    try {
      // Csak Raydium AMM v4 LP burn figyelés
      if (tx.program !== RAYDIUM_PROGRAM) continue;

      const mint = tx.tokenTransfers?.[0]?.mint || null;
      const amount = tx.tokenTransfers?.[0]?.tokenAmount || 0;

      if (!mint || amount === 0) continue;

      // Token adatok lekérése
      const token = await getTokenMetadata(mint);

      // Telegram üzenet összeállítás
      let msg = `🔥 <b>100% LP ELÉGETVE!</b> 🔥\n\n`;
      msg += `💰 Token: ${token.name} (${token.symbol})\n`;
      msg += `🪙 Mint: <code>${mint}</code>\n`;
      msg += `🔥 Égetett tokenek: ${amount}\n`;
      msg += `📊 Tranzakció: <a href="https://solscan.io/tx/${tx.signature}">Solscan</a>\n`;

      if (token.logo) {
        await bot.sendPhoto(CHANNEL_ID, token.logo, {
          caption: msg,
          parse_mode: "HTML"
        });
      } else {
        await bot.sendMessage(CHANNEL_ID, msg, { parse_mode: "HTML" });
      }
    } catch (err) {
      console.error("TX feldolgozási hiba:", err);
    }
  }

  res.status(200).send("ok");
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
