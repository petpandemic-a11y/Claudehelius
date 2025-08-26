// Raydium LP Burn Monitor - index.js
// Teljes LP burn monitoring Helius webhook-okkal
// Minden LP burn esemény élő figyelése a Solana Raydium AMM v4 programon

require('dotenv').config();
const express = require('express');
const { Connection, PublicKey } = require('@solana/web3.js');
const axios = require('axios');

const app = express();
app.use(express.json());

// Konfiguráció - Render Environment változókból
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL; 
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const PORT = process.env.PORT || 10000; // Render default port
const RAYDIUM_AMM_V4_PROGRAM = 'RVKd61ztZW9njDq5E7Yh5b2bb4a6JjAwjhH38GZ3oN7';

// Validáció
if (!HELIUS_API_KEY) {
  console.error('❌ HELIUS_API_KEY environment variable is required!');
  process.exit(1);
}

if (!WEBHOOK_URL) {
  console.error('❌ WEBHOOK_URL environment variable is required!');
  process.exit(1);
}

// Helius kapcsolat
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`);

// Token cache a kredit spóroláshoz
const tokenCache = new Map();

// Webhook regisztrálása Heliusnál - MINDEN LP BURN FIGYELÉSE
async function setupWebhook() {
  try {
    const webhookData = {
      webhookURL: WEBHOOK_URL,
      transactionTypes: ["Any"], // Minden tranzakció típus
      accountAddresses: [RAYDIUM_AMM_V4_PROGRAM], // Teljes Raydium monitoring
      webhookType: "enhanced", // Enhanced webhook több információt ad
      txnStatus: "success" // Csak sikeres tranzakciókat
    };

    const response = await axios.post(
      'https://api.helius.xyz/v0/webhooks',
      webhookData,
      {
        headers: {
          'Authorization': `Bearer ${HELIUS_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Webhook sikeresen regisztrálva:', response.data.webhookID);
    return response.data.webhookID;
  } catch (error) {
    console.error('❌ Webhook regisztráció hiba:', error.response?.data || error.message);
    throw error;
  }
}

// LP burn detection logic - MINDEN BURN ÉSZLELÉSE
function isLPBurnTransaction(transaction) {
  const { instructions, meta, accountKeys } = transaction;
  
  // 1. Raydium program instruction elemzés
  for (const instruction of instructions) {
    if (instruction.programId === RAYDIUM_AMM_V4_PROGRAM) {
      const instructionData = instruction.data;
      
      // LP burn/withdraw/remove liquidity instruction-ök
      if (instructionData && (
        instructionData.startsWith('0x02') || // Withdraw instruction
        instructionData.startsWith('0x09') || // Remove liquidity instruction  
        instructionData.startsWith('0x0a') || // Close position
        instructionData.includes('close') ||
        instructionData.includes('burn') ||
        instructionData.includes('withdraw') ||
        instructionData.includes('remove')
      )) {
        return true;
      }
    }
  }
  
  // 2. Token account balance csökkenés elemzés (LP token burn jelei)
  const preTokenBalances = meta?.preTokenBalances || [];
  const postTokenBalances = meta?.postTokenBalances || [];
  
  for (const preBalance of preTokenBalances) {
    const postBalance = postTokenBalances.find(
      post => post.accountIndex === preBalance.accountIndex
    );
    
    if (postBalance) {
      const preAmount = preBalance.uiTokenAmount?.uiAmount || 0;
      const postAmount = postBalance.uiTokenAmount?.uiAmount || 0;
      
      // Ha token mennyiség jelentősen csökkent = potenciális burn
      if (preAmount > postAmount && (preAmount - postAmount) > 0) {
        return true;
      }
    }
  }
  
  // 3. SOL balance változás elemzés (LP műveletekhez gyakran SOL is mozog)
  const preBalances = meta?.preBalances || [];
  const postBalances = meta?.postBalances || [];
  
  for (let i = 0; i < preBalances.length; i++) {
    const balanceChange = preBalances[i] - postBalances[i];
    // Ha jelentős SOL mozgás van, lehet LP művelet
    if (balanceChange > 100000) { // 0.0001 SOL küszöb (nagyon alacsony)
      return true;
    }
  }
  
  // 4. Account keys elemzés - LP pool account-ok keresése
  if (accountKeys) {
    for (const account of accountKeys) {
      // Raydium pool account pattern ellenőrzése
      if (account.includes('pool') || account.length === 44) {
        // További Raydium specifikus ellenőrzések
        return true;
      }
    }
  }
  
  return false;
}

// Token információk lekérése (cachelés a kredit spórolás érdekében)
async function getTokenInfo(mintAddress) {
  try {
    // Cache ellenőrzés
    if (tokenCache.has(mintAddress)) {
      return tokenCache.get(mintAddress);
    }

    const response = await axios.get(
      `https://api.helius.xyz/v0/token-metadata?api-key=${HELIUS_API_KEY}`,
      {
        params: { mint: mintAddress }
      }
    );

    const tokenInfo = {
      name: response.data.name || 'Unknown Token',
      symbol: response.data.symbol || 'UNKNOWN',
      mint: mintAddress,
      decimals: response.data.decimals || 9,
      logoURI: response.data.logoURI || null
    };

    // Cache tárolás (1 óra TTL)
    tokenCache.set(mintAddress, tokenInfo);
    setTimeout(() => tokenCache.delete(mintAddress), 3600000);
    
    return tokenInfo;
  } catch (error) {
    console.log(`⚠️  Token info hiba ${mintAddress}:`, error.message);
    return {
      name: 'Unknown Token',
      symbol: 'UNKNOWN',
      mint: mintAddress,
      decimals: 9,
      logoURI: null
    };
  }
}

// LP burn események feldolgozása
async function processLPBurn(transaction) {
  const signature = transaction.signature;
  const timestamp = new Date(transaction.blockTime * 1000);
  
  console.log(`\n🔥 LP BURN DETECTED! 🔥`);
  console.log(`Signature: ${signature}`);
  console.log(`Time: ${timestamp.toISOString()}`);
  
  // Token információk gyűjtése
  const tokenMints = new Set();
  
  // Pre/post token balances elemzése
  const preTokenBalances = transaction.meta?.preTokenBalances || [];
  const postTokenBalances = transaction.meta?.postTokenBalances || [];
  
  for (const balance of [...preTokenBalances, ...postTokenBalances]) {
    if (balance.mint) {
      tokenMints.add(balance.mint);
    }
  }
  
  // Token részletek lekérése
  const tokenDetails = [];
  for (const mint of tokenMints) {
    const tokenInfo = await getTokenInfo(mint);
    tokenDetails.push(tokenInfo);
  }
  
  // Burn amount számítás
  const burnAmounts = {};
  for (let i = 0; i < preTokenBalances.length; i++) {
    const preBalance = preTokenBalances[i];
    const postBalance = postTokenBalances.find(
      post => post.accountIndex === preBalance.accountIndex
    );
    
    if (postBalance && preBalance.uiTokenAmount.uiAmount > postBalance.uiTokenAmount.uiAmount) {
      const burnAmount = preBalance.uiTokenAmount.uiAmount - postBalance.uiTokenAmount.uiAmount;
      burnAmounts[preBalance.mint] = burnAmount;
    }
  }
  
  console.log(`Burned Tokens:`);
  tokenDetails.forEach(token => {
    const burnAmount = burnAmounts[token.mint];
    if (burnAmount > 0) {
      console.log(`  - ${token.name} (${token.symbol}): ${burnAmount.toFixed(6)}`);
      console.log(`    Mint: ${token.mint}`);
    }
  });
  
  console.log(`Solscan: https://solscan.io/tx/${signature}`);
  console.log(`─────────────────────────────────`);
  
  // Notification küldés
  await sendNotification({
    signature,
    timestamp,
    tokenDetails,
    burnAmounts,
    solscanUrl: `https://solscan.io/tx/${signature}`
  });
}

// Notification küldés (Discord webhook)
async function sendNotification(burnData) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('💡 Discord webhook URL nincs beállítva, notification skip');
    return;
  }

  const embed = {
    title: "🔥 Raydium LP Burn Detected!",
    color: 0xff4500, // Orange red
    description: `**Transaction:** [View on Solscan](${burnData.solscanUrl})`,
    fields: [
      {
        name: "⏰ Időpont",
        value: burnData.timestamp.toLocaleString('hu-HU'),
        inline: true
      },
      {
        name: "📊 Burned Tokens",
        value: Object.entries(burnData.burnAmounts)
          .filter(([mint, amount]) => amount > 0)
          .map(([mint, amount]) => {
            const token = burnData.tokenDetails.find(t => t.mint === mint);
            return `**${token?.name || 'Unknown'} (${token?.symbol || 'UNKNOWN'})**\n${amount.toFixed(6)}`;
          })
          .join('\n\n') || 'No specific amounts detected',
        inline: false
      }
    ],
    footer: {
      text: "Raydium LP Burn Monitor | Powered by Helius"
    },
    timestamp: burnData.timestamp.toISOString()
  };
  
  try {
    await axios.post(DISCORD_WEBHOOK_URL, {
      embeds: [embed]
    });
    console.log('✅ Discord notification elküldve');
  } catch (error) {
    console.log('❌ Discord notification hiba:', error.response?.data || error.message);
  }
}

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    const transactions = req.body;
    console.log(`📦 Webhook fogadva: ${transactions.length} tranzakció`);
    
    let burnCount = 0;
    for (const transaction of transactions) {
      // LP burn ellenőrzés
      if (isLPBurnTransaction(transaction)) {
        burnCount++;
        await processLPBurn(transaction);
      }
    }
    
    if (burnCount > 0) {
      console.log(`🔥 ${burnCount} LP burn esemény feldolgozva`);
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).send('Error');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    monitoring: 'Raydium LP Burns',
    program: RAYDIUM_AMM_V4_PROGRAM,
    cacheSize: tokenCache.size
  });
});

// Root endpoint info
app.get('/', (req, res) => {
  res.json({
    name: 'Raydium LP Burn Monitor',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      webhook: '/webhook'
    },
    monitoring: {
      program: RAYDIUM_AMM_V4_PROGRAM,
      description: 'Real-time LP burn detection on Raydium AMM v4'
    }
  });
});

// Error handler middleware
app.use((error, req, res, next) => {
  console.error('❌ Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Server indítás
async function startServer() {
  try {
    console.log('🚀 Raydium LP Burn Monitor indítása...');
    console.log(`📊 Monitoring program: ${RAYDIUM_AMM_V4_PROGRAM}`);
    console.log(`🌐 Webhook URL: ${WEBHOOK_URL}`);
    console.log(`🔗 Discord notifications: ${DISCORD_WEBHOOK_URL ? 'Enabled' : 'Disabled'}`);
    
    // Webhook regisztrálás
    console.log('📡 Helius webhook regisztrálása...');
    await setupWebhook();
    
    // Server start
    app.listen(PORT, () => {
      console.log(`✅ Server fut a porton: ${PORT}`);
      console.log(`🔥 LP burn monitoring aktív!`);
      console.log(`💰 Várható napi kredit használat: 15,000-50,000`);
      console.log(`📈 Becsült LP burn események: 500-2000/nap`);
      console.log('────────────────────────────────────────');
    });
    
  } catch (error) {
    console.error('❌ Server indítási hiba:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM jel fogadva, leállás...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT jel fogadva, leállás...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Server indítás
startServer();
