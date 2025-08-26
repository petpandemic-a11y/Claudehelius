import express from "express";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "2mb" }));

// Helius webhook signature ellenőrzés
function verifyHeliusSignature(req) {
    const secret = process.env.HELIUS_WEBHOOK_SECRET;
    const signature = req.headers["x-helius-signature"];

    if (!secret || !signature) return false;

    const computed = crypto
        .createHmac("sha256", secret)
        .update(JSON.stringify(req.body))
        .digest("hex");

    return signature === computed;
}

// Webhook endpoint
app.post("/webhook", (req, res) => {
    if (!verifyHeliusSignature(req)) {
        console.error("❌ Helius signature mismatch!");
        return res.status(401).send("Unauthorized");
    }

    const events = req.body;

    // Ha nincs adat a webhookban
    if (!Array.isArray(events)) {
        console.log("⚠️ Hibás vagy üres webhook payload");
        return res.status(200).send("No events");
    }

    for (const e of events) {
        // Csak TokenBurn típusú eseményeket figyelünk
        const txType = e.type || "unknown";
        if (txType !== "TOKEN_BURN") continue;

        const txSig = e.signature || "n/a";
        const lpToken = e.tokenTransfers?.[0]?.mint || "UNKNOWN";
        const burnedAmount = e.tokenTransfers?.[0]?.tokenAmount || 0;

        console.log("🔥 LP Burn esemény!");
        console.log("Signature:", txSig);
        console.log("LP Token cím:", lpToken);
        console.log("Égetett mennyiség:", burnedAmount);
        console.log("--------------------------------------");
    }

    res.status(200).send("OK");
});

// Render szerver indítása
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Webhook szerver fut a ${PORT} porton`);
});
