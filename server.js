const express = require('express');
const tmi = require('tmi.js');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = socketIo(server);

// --- CONFIG ---
const PORT = 3000;
const STARTING_MONEY = 100000000;
const BASE_PRICE = 50.0; 

const TWITCH_USERNAME = 'anterg0';
const TWITCH_OAUTH = 'oauth:u7nb6vsycc4q7dcgsx9sl65dx26gfq'; 
const CHANNEL_NAME = 'anterg0';

// --- STATE ---
let stocks = []; 
let users = {}; 
let playerBalance = 0; 
let pendingMoneyAdjustment = 0; 
let tradeHistoryLog = []; // Stores text logs for the overlay

const validParams = [
    'GRAVITY', 'NPC_HEALTH', 'PLAYER_HEALTH', 'TRACTION', 'ACCELERATION', 'WANTED', 'ARMOR'
];

// --- ROUTES ---
app.get('/overlay/stocks', (req, res) => res.sendFile(path.join(__dirname, 'public', 'stocks.html')));
app.get('/overlay/leaderboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'leaderboard.html')));
app.get('/overlay/params', (req, res) => res.sendFile(path.join(__dirname, 'public', 'params.html')));
app.get('/phone', (req, res) => res.sendFile(path.join(__dirname, 'public', 'phone.html')));

// --- SOCKET CONNECTION (Fixes "Empty on Refresh") ---
io.on('connection', (socket) => {
    // Immediately send current state to the new connection
    socket.emit('update', getData());
    socket.emit('log_update', tradeHistoryLog);
});

// --- TWITCH BOT ---
const client = new tmi.Client({
    options: { debug: true },
    identity: { username: TWITCH_USERNAME, password: TWITCH_OAUTH },
    channels: [CHANNEL_NAME]
});

client.connect().catch(console.error);

client.on('message', (channel, tags, message, self) => {
    if (self) return;
    const msg = message.trim().split(' ');
    const cmd = msg[0].toLowerCase();
    const user = tags.username;

    // Init user if new
    if (!users[user]) users[user] = STARTING_MONEY;

    // !create [NAME] [PARAM]
    if (cmd === '!create' && msg.length === 3) {
        const name = msg[1].toUpperCase();
        const param = msg[2].toUpperCase();
        
        if (!validParams.includes(param)) {
            client.say(channel, `@${user} Invalid Param. Available: ${validParams.join(', ')}`);
            return;
        }
        if (stocks.find(s => s.name === name || s.paramType === param)) {
            client.say(channel, `@${user} Name or Param already occupied!`);
            return;
        }

        const startPrice = Math.floor(Math.random() * (50 - 30 + 1) + 30);
        
        if (users[user] >= startPrice) {
            users[user] -= startPrice;
            const newStock = {
                id: Date.now(),
                name: name,
                paramType: param,
                value: startPrice,
                creator: user,
                history: [startPrice],
                shareholders: { [user]: 1 },
                playerShares: 0
            };
            stocks.push(newStock);
            addLog(`IPO: ${name} created by ${user} for $${startPrice}`);
            client.say(channel, `Stock ${name} IPO launched at $${startPrice}!`);
            io.emit('update', getData());
        } else {
            client.say(channel, `@${user} You need $${startPrice} to create a stock.`);
        }
    }

    // !buy [NAME] [AMT]
    if (cmd === '!buy' && msg.length === 3) {
        const res = processTrade(user, msg[1], parseInt(msg[2]), 'buy', 'twitch');
        if (!res.success && res.msg) client.say(channel, `@${user} ${res.msg}`);
    }

    // !sell [NAME] [AMT]
    if (cmd === '!sell' && msg.length === 3) {
        const res = processTrade(user, msg[1], parseInt(msg[2]), 'sell', 'twitch');
        if (!res.success && res.msg) client.say(channel, `@${user} ${res.msg}`);
    }

    // !balance
    if (cmd === '!balance' || cmd === '!bal' || cmd === '!money') {
        const val = Math.floor(users[user]);
        client.say(channel, `@${user} Balance: $${val}`);
    }

    // !portfolio
    if (cmd === '!portfolio' || cmd === '!stocks') {
        let owned = [];
        stocks.forEach(s => {
            if (s.shareholders[user] > 0) {
                owned.push(`${s.name}: ${s.shareholders[user]}`);
            }
        });
        if (owned.length === 0) client.say(channel, `@${user} You own no stocks.`);
        else client.say(channel, `@${user} Portfolio: ${owned.join(', ')}`);
    }
});

// --- LOGIC ---
function addLog(text) {
    tradeHistoryLog.unshift(text); // Add to top
    if (tradeHistoryLog.length > 5) tradeHistoryLog.pop(); // Keep last 5
    io.emit('log_update', tradeHistoryLog);
}

function processTrade(actor, stockName, amount, type, source) {
    if (isNaN(amount) || amount <= 0) return { success: false, msg: "Invalid amount" };
    stockName = stockName.toUpperCase();
    const stock = stocks.find(s => s.name === stockName);
    if (!stock) return { success: false, msg: "Stock not found" };

    let cost = stock.value * amount;
    
    // BUY
    if (type === 'buy') {
        if (source === 'player') cost = Math.ceil(cost);
        
        if (source === 'twitch') {
            if (users[actor] < cost) return { success: false, msg: "Insufficient funds" };
            users[actor] -= cost;
            if (!stock.shareholders[actor]) stock.shareholders[actor] = 0;
            stock.shareholders[actor] += amount;
        } else {
            if (playerBalance < cost) return { success: false, msg: "NSF" };
            pendingMoneyAdjustment -= cost;
            stock.playerShares += amount;
        }
        // Increase Price
        stock.value = stock.value * (1 + (0.01 * amount));
        addLog(`${actor} BOUGHT ${amount} ${stock.name}`);
    } 
    // SELL
    else if (type === 'sell') {
        if (source === 'player') cost = Math.floor(cost); 

        if (source === 'twitch') {
            if (!stock.shareholders[actor] || stock.shareholders[actor] < amount) return { success: false, msg: "Not enough shares" };
            stock.shareholders[actor] -= amount;
            users[actor] += cost;
        } else {
            if (stock.playerShares < amount) return { success: false, msg: "No shares" };
            stock.playerShares -= amount;
            pendingMoneyAdjustment += cost;
        }
        // Decrease Price
        stock.value = stock.value * (1 - (0.01 * amount));
        if (stock.value < 1) stock.value = 1;
        addLog(`${actor} SOLD ${amount} ${stock.name}`);
    }

    stock.history.push(stock.value);
    if (stock.history.length > 20) stock.history.shift();
    io.emit('update', getData());
    return { success: true };
}

function getData() {
    // Sort stocks
    stocks.sort((a, b) => b.value - a.value);
    
    // Calculate Leaderboard
    const leaderboard = Object.keys(users).map(u => {
        let netWorth = users[u];
        stocks.forEach(s => {
            if (s.shareholders[u]) netWorth += s.shareholders[u] * s.value;
        });
        return { name: u, worth: Math.floor(netWorth) };
    }).sort((a, b) => b.worth - a.worth).slice(0, 10);

    return { stocks, leaderboard, playerBalance };
}

// --- API ---
app.post('/api/game/sync', (req, res) => {
    const { currentMoney } = req.body;
    if (currentMoney !== undefined) playerBalance = currentMoney;
    
    const multipliers = {};
    stocks.forEach(s => multipliers[s.paramType] = s.value / BASE_PRICE);

    res.json({ multipliers, adjustMoney: pendingMoneyAdjustment });
    pendingMoneyAdjustment = 0;
    // Optional: Emit update so phone sees synced money
    io.emit('update', getData()); 
});

app.post('/api/phone/trade', (req, res) => {
    res.json(processTrade('Player', req.body.stockName, parseInt(req.body.amount), req.body.type, 'player'));
});

// ============================================= DEBUG =============================================================

app.get('/debug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'debug.html')));

// Debug API endpoints
app.post('/api/debug/create', (req, res) => {
    const { name, param } = req.body;
    
    if (!validParams.includes(param.toUpperCase())) {
        return res.json({ success: false, message: `Invalid parameter. Valid: ${validParams.join(', ')}` });
    }
    
    if (stocks.find(s => s.name === name.toUpperCase() || s.paramType === param.toUpperCase())) {
        return res.json({ success: false, message: 'Stock name or parameter already exists' });
    }
    
    const startPrice = Math.floor(Math.random() * (50 - 30 + 1) + 30);
    
    // Use debug user
    const debugUser = 'DEBUG_USER';
    if (!users[debugUser]) users[debugUser] = 100000000;
    
    if (users[debugUser] < startPrice) {
        return res.json({ success: false, message: `Debug user needs $${startPrice} to create stock` });
    }
    
    users[debugUser] -= startPrice;
    
    const newStock = {
        id: Date.now(),
        name: name.toUpperCase(),
        paramType: param.toUpperCase(),
        value: startPrice,
        creator: debugUser,
        history: [startPrice],
        shareholders: { [debugUser]: 1 },
        playerShares: 0
    };
    
    stocks.push(newStock);
    addLog(`DEBUG: ${name.toUpperCase()} created by debug user for $${startPrice}`);
    io.emit('update', getData());
    
    res.json({ 
        success: true, 
        message: `Stock ${name.toUpperCase()} created at $${startPrice}`,
        balance: users[debugUser]
    });
});

app.post('/api/debug/trade', (req, res) => {
    const { stock, amount, type } = req.body;
    const debugUser = 'DEBUG_USER';
    
    if (!users[debugUser]) users[debugUser] = 100000000;
    
    const result = processTrade(debugUser, stock, parseInt(amount), type, 'twitch');
    
    if (result.success) {
        res.json({ 
            success: true, 
            message: `${type.toUpperCase()} ${amount} shares of ${stock}`,
            balance: users[debugUser]
        });
    } else {
        res.json({ success: false, message: result.msg });
    }
});

app.post('/api/debug/reset', (req, res) => {
    const debugUser = 'DEBUG_USER';
    users[debugUser] = 100000000;
    
    // Remove debug user from all shareholders
    stocks.forEach(stock => {
        delete stock.shareholders[debugUser];
    });
    
    // Remove stocks created by debug user
    stocks = stocks.filter(stock => stock.creator !== debugUser);
    
    io.emit('update', getData());
    addLog('DEBUG: Debug account reset');
    
    res.json({ success: true, message: 'Debug account reset to $100,000,000' });
});

app.get('/api/debug/balance', (req, res) => {
    const debugUser = 'DEBUG_USER';
    if (!users[debugUser]) users[debugUser] = 100000000;
    
    res.json({ balance: users[debugUser] });
});

app.get('/api/debug/player-balance', (req, res) => {
    res.json({ balance: playerBalance });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));