// Raydium LP Burn Monitor - index.js
// Teljes LP burn monitoring Helius webhook-okkal
// Minden LP burn esemény élő figyelése a Solana Raydium AMM v4 programon

require('dotenv').config();
const express = require('express');
const { Connection, PublicKey } = require('@solana/web3.js');
const axios = require('axios');

const app = express();
app.use(express.json());

// Konstansok
const RAYDIUM_AMM_V4_PROGRAM = 'RVKd61ztZW9njDq5E7Yh5b2bb4a6JjAwjhH38GZ3oN7';

// Render Environment Variables Debug - Több módszer próbálása
console.log('🔍 TELJES Environment Variables Debug:');
console.log('process.env keys:', Object.keys(process.env).filter(key => key.includes('HELIUS') || key.includes('WEBHOOK')));
console.log('All environment variables containing "HELIUS":', Object.keys(process.env).filter(k => k.toLowerCase().includes('helius')));

// Próbáljunk különböző kulcs neveket
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || 
                      process.env.HELIUS_API_KEY_PROD || 
                      process.env.helius_api_key ||
                      process.env.HELIUSAPIKEY ||
                      process.env.API_KEY;

const WEBHOOK_URL = process.env.WEBHOOK_URL || 
                   process.env.WEBHOOK_URL_PROD ||
                   process.env.webhook_url ||
                   process.env.WEBHOOKURL ||
                   process.env.URL;

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || 
                           process.env.DISCORD_URL ||
                           process.env.discord_webhook_url;

const PORT = process.env.PORT || 10000; // Render default port

// DEBUG: MINDEN environment variable kiírása (biztonságosan)
console.log('🔍 Environment Variables Detailed Check:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('Raw HELIUS_API_KEY exists:', 'HELIUS_API_KEY' in process.env);
console.log('Raw WEBHOOK_URL exists:', 'WEBHOOK_URL' in process.env);

// Összes env var név kiírása
console.log('Available env var names:');
Object.keys(process.env).sort().forEach(key => {
  if (key.length < 50) { // Túl hosszú rendszer változók kiszűrése
    console.log(`  ${key}: ${key.includes('KEY') || key.includes('SECRET') || key.includes('TOKEN') ? '[HIDDEN]' : process.env[key]?.substring(0, 50) + '...'}`);
  }
});

// Validáció és debug - KIBŐVÍTETT
console.log('🔍 Final Values Check:');
console.log(`- HELIUS_API_KEY: ${HELIUS_API_KEY ? `${HELIUS_API_KEY.substring(0, 8)}...` : '❌ MISSING/UNDEFINED'}`);
console.log(`- WEBHOOK_URL: ${WEBHOOK_URL || '❌ MISSING/UNDEFINED'}`);
console.log(`- DISCORD_WEBHOOK_URL: ${DISCORD_WEBHOOK_URL ? 'SET' : 'NOT SET'}`);
console.log(`- PORT: ${PORT}`);
console.log('─────────────────────────────────');

if (!HELIUS_API_KEY) {
  console.error('❌ HELIUS_API_KEY environment variable is STILL missing!');
  console.error('🔧 RENDER DEPLOYMENT STEPS TO FIX:');
  console.error('1. Go to Render Dashboard');
  console.error('2. Select your service');
  console.error('3. Settings → Environment');
  console.error('4. Add: Key="HELIUS_API_KEY" Value="your_api_key"');
  console.error('5. Click "Save Changes"');
  console.error('6. Redeploy the service');
  console.error('');
  console.error('🔄 Server will continue running for debugging...');
  // Ne állítsuk le, hogy debugolni tudjuk
}

if (!WEBHOOK_URL) {
  console.error('❌ WEBHOOK_URL environment variable is STILL missing!');
  console.error('Should be: https://your-service-name.onrender.com/webhook');
  console.error('');
}

// Render specifikus debug endpoint
console.log('🌐 Creating debug endpoints for Render...');

// Helius kapcsolat
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY || 'dummy'}`);

// Token cache a kredit spóroláshoz
const tokenCache = new Map();

// Helius API kulcs teszt
async function testHeliusAPI() {
  try {
    if (!HELIUS_API_KEY) {
      throw new Error('No API key available');
    }
    console.log('🧪 Helius API kulcs tesztelése...');
    const response = await axios.get(
      `https://api.helius.xyz/v0/addresses/So11111111111111111111111111111111111111112/balances?api-key=${HELIUS_API_KEY}`
    );
    console.log('✅ Helius API kulcs működik');
    return true;
  } catch (error) {
    console.error('❌ Helius API kulcs hiba:', error.response?.status, error.response?.data || error.message);
    return false;
  }
}

// Webhook regisztrálása Heliusnál - HIBAKERESÉSEKKEL
async function setupWebhook() {
  try {
    // Először teszteljük az API kulcsot
    const apiTest = await testHeliusAPI();
    if (!apiTest) {
      throw new Error('Helius API kulcs nem működik - ellenőrizd az API kulcsot');
    }

    console.log('📡 Webhook regisztrálása Heliusnál...');
    console.log(`📍 Webhook URL: ${WEBHOOK_URL}`);
    
    const webhookData = {
      webhookURL: WEBHOOK_URL,
      transactionTypes: ["Any"], // Minden tranzakció típus
      accountAddresses: [RAYDIUM_AMM_V4_PROGRAM], // Teljes Raydium monitoring
      webhookType: "enhanced", // Enhanced webhook több információt ad
      txnStatus: "success" // Csak sikeres tranzakciókat
    };

    console.log('📋 Webhook konfiguráció:', JSON.stringify(webhookData, null, 2));

    const response = await axios.post(
      'https://api.helius.xyz/v0/webhooks',
      webhookData,
      {
        headers: {
          'Authorization': `Bearer ${HELIUS_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 másodperc timeout
      }
    );

    console.log('✅ Webhook sikeresen regisztrálva:', response.data.webhookID);
    return response.data.webhookID;
  } catch (error) {
    console.error('❌ Webhook regisztráció hiba:');
    console.error('Status:', error.response?.status);
    console.error('Data:', JSON.stringify(error.response?.data, null, 2));
    console.error('Headers:', error.response?.headers);
    
    // Részletes hibakeresés
    if (error.response?.status === 401) {
      console.error('🚨 401 Unauthorized - Lehetséges okok:');
      console.error('1. Hibás Helius API kulcs');
      console.error('2. API kulcs expired');
      console.error('3. API kulcs nincs webhook jogosultságokkal');
      console.error('4. Hibás Authorization header formátum');
    }
    
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
    if (!HELIUS_API_KEY) {
      return {
        name: 'Unknown Token (No API Key)',
        symbol: 'UNKNOWN',
        mint: mintAddress,
        decimals: 9,
        logoURI: null
      };
    }

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

// Render Debug endpoint - Environment Variables
app.get('/debug-env', (req, res) => {
  res.json({
    message: 'Render Environment Debug',
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    environmentVariables: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      heliusApiKeyExists: !!process.env.HELIUS_API_KEY,
      heliusApiKeyLength: process.env.HELIUS_API_KEY?.length || 0,
      heliusApiKeyPreview: process.env.HELIUS_API_KEY ? `${process.env.HELIUS_API_KEY.substring(0, 8)}...` : 'NOT_FOUND',
      webhookUrlExists: !!process.env.WEBHOOK_URL,
      webhookUrl: process.env.WEBHOOK_URL || 'NOT_FOUND',
      discordWebhookExists: !!process.env.DISCORD_WEBHOOK_URL,
      allEnvKeys: Object.keys(process.env).filter(key => 
        key.includes('HELIUS') || 
        key.includes('WEBHOOK') || 
        key.includes('DISCORD') ||
        key === 'PORT' ||
        key === 'NODE_ENV'
      ).sort()
    },
    renderSpecific: {
      serviceUrl: `${req.protocol}://${req.get('host')}`,
      expectedWebhookUrl: `${req.protocol}://${req.get('host')}/webhook`,
      headers: req.headers
    }
  });
});

// Manual Environment Set endpoint (emergency)
app.post('/set-env', (req, res) => {
  const { heliusApiKey, webhookUrl } = req.body;
  
  if (heliusApiKey) {
    process.env.HELIUS_API_KEY = heliusApiKey;
    console.log('⚠️ Manual HELIUS_API_KEY set via API (TEMPORARY!)');
  }
  
  if (webhookUrl) {
    process.env.WEBHOOK_URL = webhookUrl;
    console.log('⚠️ Manual WEBHOOK_URL set via API (TEMPORARY!)');
  }
  
  res.json({ 
    success: true, 
    message: 'Environment variables set temporarily',
    note: 'This is temporary - add them properly in Render Dashboard'
  });
});

// Manual webhook regisztrációs endpoint (hibakereséshez)
app.post('/register-webhook', async (req, res) => {
  try {
    if (!process.env.HELIUS_API_KEY) {
      return res.status(400).json({ 
        success: false, 
        error: 'HELIUS_API_KEY still missing - check Render environment variables',
        instructions: [
          '1. Go to Render Dashboard',
          '2. Your service → Settings → Environment',
          '3. Add HELIUS_API_KEY with your actual API key',
          '4. Click Save Changes',
          '5. Redeploy service'
        ]
      });
    }
    
    console.log('🔄 Manual webhook regisztráció...');
    const webhookId = await setupWebhook();
    res.json({ success: true, webhookId, message: 'Webhook sikeresen regisztrálva!' });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: error.response?.data 
    });
  }
});

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
      webhook: '/webhook',
      'debug-env': '/debug-env (GET) - Environment variables debug',
      'register-webhook': '/register-webhook (POST) - Manual webhook registration',
      'set-env': '/set-env (POST) - Emergency env var setting'
    },
    monitoring: {
      program: RAYDIUM_AMM_V4_PROGRAM,
      description: 'Real-time LP burn detection on Raydium AMM v4'
    },
    environment: {
      heliusApiKey: HELIUS_API_KEY ? `${HELIUS_API_KEY.substring(0, 8)}...` : '❌ MISSING',
      webhookUrl: WEBHOOK_URL || '❌ MISSING',
      discordEnabled: !!DISCORD_WEBHOOK_URL,
      port: PORT
    },
    renderDebugging: {
      message: 'If environment variables are missing:',
      steps: [
        '1. Visit /debug-env to see what Render has',
        '2. Go to Render Dashboard → Your Service → Settings → Environment',
        '3. Add HELIUS_API_KEY and WEBHOOK_URL',
        '4. Save Changes and Redeploy',
        '5. Or use /set-env temporarily'
      ]
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
    
    // Server indítás ELŐBB
    app.listen(PORT, () => {
      console.log(`✅ Server fut a porton: ${PORT}`);
    });
    
    // Kis várakozás majd webhook regisztrálás
    console.log('⏳ 5 másodperc várakozás a server indulására...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Webhook regisztrálás
    if (HELIUS_API_KEY && WEBHOOK_URL) {
      console.log('📡 Helius webhook regisztrálása...');
      await setupWebhook();
      
      console.log(`🔥 LP burn monitoring aktív!`);
      console.log(`💰 Várható napi kredit használat: 15,000-50,000`);
      console.log(`📈 Becsült LP burn események: 500-2000/nap`);
    } else {
      console.log('⚠️ Environment variables hiányoznak, webhook regisztráció kihagyva');
    }
    
    console.log('────────────────────────────────────────');
    
  } catch (error) {
    console.error('❌ Server indítási hiba:', error);
    console.log('🔄 Server továbbra is fut, webhook regisztrációt újra lehet próbálni...');
    // Ne állítsuk le a szervert, csak a webhook regisztráció nem sikerült
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
