const axios = require('axios');

// --- CONFIG ---
const SERVER_URL = 'http://localhost:3000';
const NUM_BOTS = 10; // Change this to control number of bots

// --- BOT CONFIG ---
const MIN_ACTION_DELAY = 5000; // 5 seconds minimum between actions
const MAX_ACTION_DELAY = 30000; // 30 seconds maximum between actions
const TRADE_PROBABILITY = 0.7; // 70% chance to trade vs create

// Available parameters (same as server)
const VALID_PARAMS = [
    'GRAVITY', 'NPC_HEALTH', 'PLAYER_HEALTH', 'TRACTION', 
    'ACCELERATION', 'WANTED', 'ARMOR'
];

const BOT_NAMES = [
    'TraderJoe', 'WolfOfWallSt', 'MoneyBags', 'StockSage', 'CryptoBro',
    'DiamondHands', 'PaperHands', 'WallStreetBet', 'YOLO_Gambler', 'MarginCall',
    'ShortSqueeze', 'PumpNDump', 'BagHolder', 'StonksOnly', 'BullsWin',
    'BearMarket', 'TradingGod', 'RobinHood', 'HedgeFundGuy', 'RetailTard',
    'QuantBro', 'AlgoTrader', 'MarketMaker', 'InsiderInfo', 'SEC_Investigator',
    'PonziScheme', 'WolfPack', 'SilverFox', 'GoldenBull', 'RedCandle'
];

// Available stock names
const STOCK_NAMES = [
    // 5 letters
    'ROCK', 'TITAN', 'ZENIT', 'NOVA', 'ECHO', 'VORTX', 'QUANT',
    'APEX', 'NEXUS', 'ORION', 'PHNTM', 'CORE', 'ALPHA', 'OMEGA',
    'DYNA', 'PULSE', 'FLUX', 'SPARK', 'BLAZE', 'FROST',
    
    // Satirical/Offensive 5 letters
    'PUMP', 'DUMP', 'BAGHD', 'MEME', 'SHIT', 'RUG', 'SCAM',
    'YOLO', 'FOMO', 'FUD', 'REKT', 'BEAR', 'SHORT', 'MARGC',
    'LAMBO', 'MOON', 'STONK', 'WEN', 'DIAM', 'PAPR',
    'GME', 'AMC', 'BBBY', 'NOK', 'TSLA', 'DOGE', 'SHIB',
    'SAFE', 'ELON', 'CUBAN', 'CATH', 'CHAM', 'CNBC', 'REDD', 'WSB',
    
    // More 5-letter stock names
    'CRASH', 'BOOM', 'BUST', 'GAIN', 'LOSS', 'BULL', 'BEAR',
    'TREND', 'SWING', 'VALUE', 'GROW', 'DIV', 'CASH', 'GOLD',
    'SILVR', 'OIL', 'TECH', 'BIO', 'PHAR', 'AUTO', 'REAL',
    'BANK', 'FIN', 'INSR', 'MED', 'FOOD', 'ENER', 'UTIL',
    'MINE', 'SHIP', 'AIR', 'RAIL', 'ROAD', 'WEB', 'CLOUD',
    'CHIP', 'SOFT', 'HARD', 'NET', 'DATA', 'AI', 'ROBO',
    
    // Funny/Offensive 5-letter
    'LAMER', 'NOOB', 'SCRUB', 'N00B', 'PWNED', 'OWNED', 'FAIL',
    'EPIC', 'LEET', 'PRO', 'GOD', 'KING', 'QUEEN', 'BOSS',
    'RICH', 'POOR', 'BROKE', 'WEN$', 'LAMBO', 'MOON', 'STARS',
    'TOAST', 'BURNT', 'ROAST', 'TOXIC', 'SALTY', 'MAD', 'SAD',
    'HAPPY', 'LUCKY', 'UNLK', 'RIGGED', 'FIXED', 'SCAM', 'EXIT'
];

// --- BOT STATE ---
const bots = [];
let currentStocks = [];
let usedParams = new Set();
let isRunning = true;

// Initialize bots
function initializeBots(count) {
    console.log(`Creating ${count} bot accounts...`);
    
    // Shuffle bot names and take needed amount
    const shuffledNames = [...BOT_NAMES].sort(() => 0.5 - Math.random()).slice(0, count);
    
    for (let i = 0; i < count; i++) {
        const username = shuffledNames[i];
        bots.push({
            username: username,
            balance: 500,
            portfolio: {},
            nextActionTime: Date.now() + randomDelay(),
            isActive: true,
            id: i + 1
        });
        console.log(`  Created bot: ${username}`);
    }
}

// --- MAIN FUNCTIONS ---
async function startBotEmulation() {
    console.log('🚀 Starting Stock Bot Emulator...');
    
    try {
        // Initialize bots first
        initializeBots(NUM_BOTS);
        
        // Verify bot accounts with server and get initial balance
        await verifyBotAccounts();
        
        // Fetch initial stocks
        await fetchCurrentStocks();
        
        console.log(`✅ Loaded ${currentStocks.length} existing stocks`);
        console.log(`🤖 ${NUM_BOTS} bots ready to trade`);
        
        // Start main loop
        mainLoop();
        
        // Start status display
        displayBotStatus();
        
    } catch (error) {
        console.error('❌ Failed to start bot emulator:', error.message);
        console.log('Retrying in 5 seconds...');
        setTimeout(startBotEmulation, 5000);
    }
}

async function verifyBotAccounts() {
    console.log('Verifying bot accounts with server...');
    
    for (const bot of bots) {
        try {
            const response = await axios.get(`${SERVER_URL}/api/bot/balance/${bot.username}`);
            bot.balance = response.data.balance;
            console.log(`  ${bot.username}: $${bot.balance.toLocaleString()}`);
        } catch (error) {
            console.error(`  ❌ Failed to verify ${bot.username}:`, error.message);
            bot.isActive = false;
        }
    }
}

async function fetchCurrentStocks() {
    try {
        const response = await axios.get(`${SERVER_URL}/api/stocks`);
        if (response.data && response.data.stocks) {
            currentStocks = response.data.stocks;
            
            // Update used parameters
            usedParams = new Set(currentStocks.map(stock => stock.paramType));
            
            // Initialize bot portfolios with their actual holdings from server
            await initializeBotPortfolios();
            
            return true;
        }
    } catch (error) {
        console.log('⚠️  Could not fetch stocks:', error.message);
        currentStocks = [];
        usedParams = new Set();
        return false;
    }
}

async function initializeBotPortfolios() {
    console.log('Loading bot portfolios from server data...');
    
    for (const bot of bots) {
        bot.portfolio = {}; // Reset portfolio
        
        // Check each stock to see if this bot owns shares
        for (const stock of currentStocks) {
            if (stock.shareholders && stock.shareholders[bot.username]) {
                bot.portfolio[stock.name] = stock.shareholders[bot.username];
                console.log(`  ${bot.username} owns ${bot.portfolio[stock.name]} shares of ${stock.name}`);
            }
        }
    }
}

async function mainLoop() {
    console.log('🔄 Starting main trading loop...');
    
    // Run actions for each bot
    setInterval(async () => {
        if (!isRunning) return;
        
        for (const bot of bots) {
            if (bot.isActive && Date.now() >= bot.nextActionTime) {
                await performBotAction(bot);
                
                // Schedule next action
                bot.nextActionTime = Date.now() + randomDelay();
            }
        }
    }, 1000);
}

async function performBotAction(bot) {
    try {
        // Refresh stock data periodically (every 10 actions)
        if (Math.random() < 0.1) {
            await fetchCurrentStocks();
        }
        
        // Update bot's balance from server
        await updateBotBalance(bot);
        
        // Decision: create new stock or trade existing
        if (canCreateStock() && Math.random() > TRADE_PROBABILITY) {
            await createStock(bot);
        } else if (currentStocks.length > 0) {
            await tradeStock(bot);
        } else if (canCreateStock()) {
            await createStock(bot);
        }
        
    } catch (error) {
        console.error(`❌ Error in bot action for ${bot.username}:`, error.message);
    }
}

async function createStock(bot) {
    // Find unused parameter
    const availableParams = VALID_PARAMS.filter(param => !usedParams.has(param));
    if (availableParams.length === 0) {
        return; // All parameters used
    }
    
    // Find unused stock name
    const usedNames = currentStocks.map(s => s.name);
    const availableNames = STOCK_NAMES.filter(name => !usedNames.includes(name));
    if (availableNames.length === 0) {
        console.log('⚠️  Ran out of stock names!');
        return;
    }
    
    const stockName = availableNames[Math.floor(Math.random() * availableNames.length)];
    const param = availableParams[Math.floor(Math.random() * availableParams.length)];
    
    try {
        const response = await axios.post(`${SERVER_URL}/api/bot/create`, {
            username: bot.username,
            name: stockName,
            param: param
        });
        
        if (response.data.success) {
            console.log(`🏗️  ${bot.username} created ${stockName} (${param}) at $${response.data.startPrice}`);
            
            // Update local state
            usedParams.add(param);
            
            // Add to local stocks array
            const newStock = {
                name: stockName,
                paramType: param,
                value: response.data.startPrice,
                creator: bot.username
            };
            currentStocks.push(newStock);
            
            // Update bot portfolio
            bot.portfolio[stockName] = 1;
            bot.balance = response.data.balance;
            
            // Refresh stocks to get updated data
            await fetchCurrentStocks();
        } else {
            console.log(`❌ ${bot.username} failed to create stock: ${response.data.message}`);
        }
    } catch (error) {
        console.error(`Error creating stock:`, error.message);
    }
}

async function tradeStock(bot) {
    if (currentStocks.length === 0) return;
    
    // Select random stock
    const stock = currentStocks[Math.floor(Math.random() * currentStocks.length)];
    const stockName = stock.name;
    const currentPrice = stock.value;
    
    // Get bot's current share count
    const ownedShares = bot.portfolio[stockName] || 0;
    
    // Decide action
    let action, amount;
    
    if (ownedShares > 0 && Math.random() > 0.5) {
        // Sell 10-50% of owned shares
        action = 'sell';
        const sellPercentage = 0.1 + Math.random() * 0.4; // 10-50%
        amount = Math.max(1, Math.floor(ownedShares * sellPercentage));
    } else {
        // Buy 1-10 shares (if can afford)
        action = 'buy';
        const maxAffordable = Math.floor(bot.balance / currentPrice);
        if (maxAffordable > 0) {
            amount = Math.max(1, Math.min(10, Math.floor(maxAffordable * Math.random())));
        } else {
            return; // Can't afford
        }
    }
    
    try {
        const response = await axios.post(`${SERVER_URL}/api/bot/trade`, {
            username: bot.username,
            stockName: stockName,
            amount: amount,
            type: action
        });
        
        if (response.data.success) {
            // Update local bot state
            if (action === 'buy') {
                bot.portfolio[stockName] = (bot.portfolio[stockName] || 0) + amount;
                console.log(`📈 ${bot.username} bought ${amount} ${stockName} at $${currentPrice.toFixed(2)}`);
            } else {
                bot.portfolio[stockName] -= amount;
                if (bot.portfolio[stockName] <= 0) {
                    delete bot.portfolio[stockName];
                }
                console.log(`📉 ${bot.username} sold ${amount} ${stockName} at $${currentPrice.toFixed(2)}`);
            }
            
            // Update balance from server
            bot.balance = response.data.balance;
            
            // Refresh stocks to get updated prices
            await fetchCurrentStocks();
        } else {
            console.log(`❌ ${bot.username} trade failed: ${response.data.message}`);
        }
    } catch (error) {
        console.error(`Error trading:`, error.message);
    }
}

async function updateBotBalance(bot) {
    try {
        const response = await axios.get(`${SERVER_URL}/api/bot/balance/${bot.username}`);
        bot.balance = response.data.balance;
    } catch (error) {
        console.error(`Error updating balance for ${bot.username}:`, error.message);
    }
}

// --- HELPER FUNCTIONS ---
function canCreateStock() {
    return usedParams.size < VALID_PARAMS.length;
}

function randomDelay() {
    return MIN_ACTION_DELAY + Math.random() * (MAX_ACTION_DELAY - MIN_ACTION_DELAY);
}

function displayBotStatus() {
    setInterval(async () => {
        if (!isRunning) return;
        
        try {
            // Refresh stock data
            await fetchCurrentStocks();
            
            console.log('\n' + '='.repeat(60));
            console.log('📊 STOCK BOT EMULATOR STATUS');
            console.log('='.repeat(60));
            console.log(`🤖 Active Bots: ${bots.filter(b => b.isActive).length}/${bots.length}`);
            console.log(`📈 Total Stocks: ${currentStocks.length}`);
            console.log(`🎯 Used Parameters: ${Array.from(usedParams).join(', ')}`);
            console.log(`🆕 Available Parameters: ${VALID_PARAMS.filter(p => !usedParams.has(p)).join(', ')}`);
            
            // Show stock summary
            if (currentStocks.length > 0) {
                console.log('\n💹 TOP 5 STOCKS:');
                // Sort by value (highest first)
                const sortedStocks = [...currentStocks].sort((a, b) => b.value - a.value);
                sortedStocks.slice(0, 5).forEach(stock => {
                    console.log(`   ${stock.name} (${stock.paramType}): $${stock.value.toFixed(2)}`);
                });
            }
            
            // Show top 3 bots
            const sortedBots = [...bots].sort((a, b) => b.balance - a.balance).slice(0, 3);
            console.log('\n💰 TOP BOTS:');
            sortedBots.forEach((bot, index) => {
                const stocksOwned = Object.keys(bot.portfolio).length;
                console.log(`${index + 1}. ${bot.username}:`);
                console.log(`   Cash: $${Math.floor(bot.balance).toLocaleString()}`);
                console.log(`   Stocks: ${stocksOwned} companies`);
            });
            
            console.log('='.repeat(60));
            
        } catch (error) {
            console.log('⚠️  Could not update status:', error.message);
        }
    }, 30000); // Update every 30 seconds
}

// --- STARTUP ---
console.log(`
╔══════════════════════════════════════════════╗
║         STOCK TRADING BOT EMULATOR           ║
╠══════════════════════════════════════════════╣
║ Bots: ${NUM_BOTS.toString().padEnd(36)}║
║ Server: ${SERVER_URL.padEnd(34)}║
║ Action Delay: ${(MIN_ACTION_DELAY/1000).toFixed(1)}-${(MAX_ACTION_DELAY/1000).toFixed(1)}s${' '.repeat(18)}║
║ Trade Probability: ${(TRADE_PROBABILITY * 100).toFixed(0)}%${' '.repeat(22)}║
╚══════════════════════════════════════════════╝
`);

// Start the emulator
startBotEmulation();

// --- COMMAND LINE INTERFACE ---
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('\n📝 Commands:');
console.log('  status - Show current status');
console.log('  pause - Pause all bots');
console.log('  resume - Resume all bots');
console.log('  refresh - Refresh stock data');
console.log('  exit - Stop bot emulator');
console.log('');

rl.on('line', async (input) => {
    const cmd = input.trim().toLowerCase();
    
    switch(cmd) {
        case 'status':
            console.log(`Active bots: ${bots.filter(b => b.isActive).length}/${bots.length}`);
            console.log(`Total stocks: ${currentStocks.length}`);
            console.log(`Used parameters: ${Array.from(usedParams).size}/${VALID_PARAMS.length}`);
            break;
            
        case 'pause':
            bots.forEach(bot => bot.isActive = false);
            console.log('⏸️  All bots paused');
            break;
            
        case 'resume':
            bots.forEach(bot => {
                bot.isActive = true;
                bot.nextActionTime = Date.now() + randomDelay();
            });
            console.log('▶️  All bots resumed');
            break;
            
        case 'refresh':
            await fetchCurrentStocks();
            console.log('🔄 Refreshing stock data...');
            break;
            
        case 'exit':
            console.log('👋 Shutting down bot emulator...');
            isRunning = false;
            rl.close();
            process.exit(0);
            break;
            
        default:
            console.log('Unknown command. Try: status, pause, resume, refresh, exit');
    }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down bot emulator...');
    isRunning = false;
    rl.close();
    process.exit(0);
});