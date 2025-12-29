// server.js - Updated with Player In-Game Cash & Stock Clearing
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// ==================== GAME STATE ====================
let gameStartTime = null;

// Game parameters controlled by stocks
let gameParameters = {
    gravity: { 
        value: 9.8, 
        min: 1.0, 
        max: 20.0, 
        unit: 'm/s²',
        description: 'Controls the gravity level in the game world'
    },
    npcHealth: { 
        value: 100, 
        min: 10, 
        max: 1000, 
        unit: 'HP',
        description: 'Sets the maximum health for all NPCs'
    },
    vehicleSpeed: { 
        value: 1.0, 
        min: 0.1, 
        max: 5.0, 
        unit: 'multiplier',
        description: 'Multiplies vehicle acceleration and top speed'
    },
    wantedDifficulty: { 
        value: 1.0, 
        min: 0.1, 
        max: 3.0, 
        unit: 'multiplier',
        description: 'Adjusts police response difficulty'
    },
    rainIntensity: { 
        value: 0.0, 
        min: 0.0, 
        max: 1.0, 
        unit: 'level',
        description: 'Controls rainfall intensity'
    },
    tractionLoss: {
        value: 1.0,
        min: 0.5,
        max: 2.0,
        unit: 'multiplier',
        description: 'Affects vehicle tire traction'
    },
    playerArmor: {
        value: 100,
        min: 50,
        max: 500,
        unit: 'points',
        description: 'Sets maximum player armor capacity'
    },
    snowLevel: {
        value: 0.0,
        min: 0.0,
        max: 1.0,
        unit: 'level',
        description: 'Controls snow accumulation'
    },
    playerHealthRecharge: {
        value: 1.0,
        min: 0.5,
        max: 2.0,
        unit: 'multiplier',
        description: 'Player health recharge rate'
    },
    playerSprintMult: {
        value: 1.0,
        min: 0.5,
        max: 2.0,
        unit: 'multiplier',
        description: 'Player sprint speed'
    },
    playerSwimMult: {
        value: 1.0,
        min: 0.5,
        max: 2.0,
        unit: 'multiplier',
        description: 'Player swim speed'
    },
    playerWeaponDmg: {
        value: 1.0,
        min: 0.5,
        max: 2.0,
        unit: 'multiplier',
        description: 'Player weapon damage'
    },
    playerWeaponDef: {
        value: 1.0,
        min: 0.5,
        max: 2.0,
        unit: 'multiplier',
        description: 'Player weapon defense'
    },
    playerMeleeDmg: {
        value: 1.0,
        min: 0.5,
        max: 2.0,
        unit: 'multiplier',
        description: 'Player melee damage'
    },
    playerVehicleDmg: {
        value: 1.0,
        min: 0.5,
        max: 2.0,
        unit: 'multiplier',
        description: 'Player vehicle damage'
    },
    vehicleEnginePower: {
        value: 1.0,
        min: 0.5,
        max: 2.0,
        unit: 'multiplier',
        description: 'Vehicle engine power'
    },
    vehicleEngineTorque: {
        value: 1.0,
        min: 0.5,
        max: 2.0,
        unit: 'multiplier',
        description: 'Vehicle engine torque'
    },
    pedMaxHealth: {
        value: 100,
        min: 50,
        max: 200,
        unit: 'HP',
        description: 'Pedestrian max health'
    }
};

// Initial stock market
let stockMarket = {
    "GRAVITY": { 
        name: "Gravity Control Inc", 
        price: 45.0, 
        param: "gravity", 
        history: [42.0, 43.0, 44.0, 45.0],
        topHolder: null,
        creator: "System",
        totalShares: 1000,
        availableShares: 1000
    },
    "NPCLIFE": { 
        name: "NPC Life Corp", 
        price: 38.0, 
        param: "npcHealth", 
        history: [35.0, 36.0, 37.0, 38.0],
        topHolder: null,
        creator: "System",
        totalShares: 1000,
        availableShares: 1000
    }
};

// User portfolios - Twitch chatters start with $500 virtual
let userPortfolios = {
    "System": {
        cash: 1000000,
        stocks: {},
        isPlayer: false
    }
};

// Initialize all stocks owned by system initially
Object.keys(stockMarket).forEach(symbol => {
    userPortfolios["System"].stocks[symbol] = stockMarket[symbol].totalShares;
    stockMarket[symbol].availableShares = 0;
});

// ==================== MIDDLEWARE ====================
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// ==================== HTML ROUTES ====================
app.get('/player', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/player.html'));
});

app.get('/overlay/stocks', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/overlay-stocks.html'));
});

app.get('/overlay/leaderboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/overlay-leaderboard.html'));
});

app.get('/overlay/parameters', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/overlay-parameters.html'));
});

// Admin control panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin.html'));
});

app.get('/', (req, res) => {
    res.send(`
        <html><body style="font-family: Arial; padding: 20px;">
            <h1>GTA 5 Stock Market System</h1>
            <p>Players must earn cash in-game to buy stocks</p>
            <p>Twitch chatters start with $500 virtual money</p>
            <ul>
                <li><a href="/player" target="_blank">Player Mobile Interface</a></li>
                <li><a href="/admin" target="_blank">Admin Control Panel</a></li>
                <li><a href="/overlay/stocks" target="_blank">Overlay 1: Stock Details</a></li>
                <li><a href="/overlay/leaderboard" target="_blank">Overlay 2: Leaderboard</a></li>
                <li><a href="/overlay/parameters" target="_blank">Overlay 3: Parameters</a></li>
            </ul>
        </body></html>
    `);
});

// ==================== API ENDPOINTS ====================

// Start/Stop game
app.post('/api/game/start', (req, res) => {
    gameStartTime = Date.now();
    
    // Reset all stocks to initial state
    Object.keys(stockMarket).forEach(symbol => {
        stockMarket[symbol].price = (Math.random() * 21 + 30).toFixed(1); // Float 30.0-50.0
        stockMarket[symbol].history = [stockMarket[symbol].price];
        stockMarket[symbol].topHolder = null;
        stockMarket[symbol].availableShares = stockMarket[symbol].totalShares;
    });
    
    // Reset system ownership
    userPortfolios["System"].stocks = {};
    Object.keys(stockMarket).forEach(symbol => {
        userPortfolios["System"].stocks[symbol] = stockMarket[symbol].totalShares;
    });
    
    // Clear ALL user portfolios (except System)
    Object.keys(userPortfolios).forEach(user => {
        if (user !== "System") {
            delete userPortfolios[user];
        }
    });
    
    // Reset game parameters
    Object.keys(gameParameters).forEach(param => {
        gameParameters[param].value = (gameParameters[param].min + gameParameters[param].max) / 2;
    });
    
    io.emit('game_started', {
        time: gameStartTime,
        message: "Game started! All stocks reset. Player must earn cash in-game."
    });
    
    console.log(`Game started at ${new Date(gameStartTime).toISOString()}`);
    res.json({ success: true, message: "Game started", time: gameStartTime });
});

app.post('/api/game/stop', (req, res) => {
    io.emit('game_stopped', { message: "Game stopped" });
    res.json({ success: true, message: "Game stopped" });
});

app.get('/api/game/status', (req, res) => {
    res.json({
        startTime: gameStartTime,
        duration: gameStartTime ? Date.now() - gameStartTime : 0,
        totalStocks: Object.keys(stockMarket).length,
        totalPlayers: Object.keys(userPortfolios).length - 1
    });
});

// Get all stocks
app.get('/api/stocks', (req, res) => {
    const stocks = Object.entries(stockMarket).map(([symbol, data]) => ({
        symbol,
        name: data.name,
        price: parseFloat(data.price),
        param: data.param,
        history: data.history.slice(-20).map(p => parseFloat(p)),
        topHolder: data.topHolder,
        creator: data.creator,
        totalShares: data.totalShares,
        availableShares: data.availableShares,
        marketCap: data.price * data.totalShares
    })).sort((a, b) => b.price - a.price);
    
    res.json(stocks);
});

// Get user portfolio - IMPORTANT: Player portfolio is virtual on server
app.get('/api/portfolio/:user', (req, res) => {
    const user = req.params.user;
    
    // For Twitch chatters: create with $500 virtual money
    if (user !== "Player" && user !== "System" && !userPortfolios[user]) {
        userPortfolios[user] = {
            cash: 500,  // Virtual starting money for chatters
            stocks: {},
            isPlayer: false,
            isChatter: true,
            lastSeen: Date.now()
        };
    }
    
    // For Player: return virtual portfolio that syncs with game cash
    if (user === "Player" && !userPortfolios[user]) {
        userPortfolios[user] = {
            cash: 0,  // Will be updated by game mod
            stocks: {},
            isPlayer: true,
            isChatter: false,
            lastSeen: Date.now()
        };
    }
    
    const portfolio = userPortfolios[user] || { cash: 0, stocks: {} };
    
    // Calculate portfolio value
    let stockValue = 0;
    let stocksDetail = {};
    
    Object.entries(portfolio.stocks).forEach(([symbol, shares]) => {
        const stock = stockMarket[symbol];
        if (stock) {
            const value = parseFloat(stock.price) * shares;
            stockValue += value;
            stocksDetail[symbol] = {
                shares,
                value
            };
        }
    });
    
    res.json({
        cash: portfolio.cash,
        stocks: portfolio.stocks,
        stockValue,
        totalWorth: portfolio.cash + stockValue
    });
});

// Create new stock (from Twitch chat)
app.post('/api/create-stock', (req, res) => {
    
    const { user, symbol, name, param } = req.body;
    
    if (!symbol || !name || !param || stockMarket[symbol.toUpperCase()]) {
        return res.json({ success: false, error: "Invalid stock data" });
    }
    
    if (!gameParameters[param]) {
        return res.json({ success: false, error: "Invalid parameter" });
    }
    
    const upperSymbol = symbol.toUpperCase();
    const initialPrice = (Math.random() * 21 + 30).toFixed(1);
    
    stockMarket[upperSymbol] = {
        name,
        price: initialPrice,
        param,
        history: [initialPrice],
        topHolder: user,
        creator: user,
        totalShares: 1000,
        availableShares: 999
    };
    
    // System owns all initially, but creator buys 1
    userPortfolios["System"].stocks[upperSymbol] = 1000;
    
    if (!userPortfolios[user]) {
        userPortfolios[user] = {
            cash: 500 - parseFloat(initialPrice),  // Deduct from virtual cash
            stocks: { [upperSymbol]: 1 },
            isPlayer: false,
            isChatter: true,
            lastSeen: Date.now()
        };
    } else {
        userPortfolios[user].cash -= parseFloat(initialPrice);
        userPortfolios[user].stocks[upperSymbol] = 1;
    }
    
    // Update top holder
    updateTopHolder(upperSymbol);
    
    // Update parameter
    const paramUpdate = updateGameParameter(upperSymbol);
    
    // Broadcast
    io.emit('market_update', {
        symbol: upperSymbol,
        price: parseFloat(initialPrice),
        topHolder: user
    });
    
    io.emit('parameter_update', paramUpdate);
    
    res.json({ success: true, price: parseFloat(initialPrice) });
});

// Trade endpoint (buy/sell) with rounding
app.post('/api/trade', (req, res) => {
    
    const { user, symbol, action, shares = 1, currentCash } = req.body;
    const upperSymbol = symbol.toUpperCase();
    
    const stock = stockMarket[upperSymbol];
    if (!stock) return res.json({ success: false, error: "Stock not found" });
    
    if (!userPortfolios[user]) return res.json({ success: false, error: "User not found" });
    
    const portfolio = userPortfolios[user];
    let cost = parseFloat(stock.price) * shares;
    
    if (action === 'buy') {
        cost = Math.ceil(cost);  // Round up for buy
        if (portfolio.isPlayer) {
            if (currentCash < cost) return res.json({ success: false, error: "Not enough in-game cash" });
            portfolio.cash = currentCash - cost;  // Use in-game cash
        } else {
            if (portfolio.cash < cost) return res.json({ success: false, error: "Not enough virtual cash" });
            portfolio.cash -= cost;
        }
        if (stock.availableShares < shares) return res.json({ success: false, error: "Not enough shares available" });
        
        portfolio.stocks[upperSymbol] = (portfolio.stocks[upperSymbol] || 0) + shares;
        stock.availableShares -= shares;
        
        // Pump price
        stock.price = (parseFloat(stock.price) + shares).toFixed(1);
        stock.history.push(stock.price);
    } else if (action === 'sell') {
        cost = Math.floor(cost);  // Round down for sell
        const owned = portfolio.stocks[upperSymbol] || 0;
        if (owned < shares) return res.json({ success: false, error: "Not enough shares owned" });
        
        portfolio.cash += cost;
        portfolio.stocks[upperSymbol] -= shares;
        if (portfolio.stocks[upperSymbol] <= 0) delete portfolio.stocks[upperSymbol];
        stock.availableShares += shares;
        
        // Dump price
        stock.price = (parseFloat(stock.price) - shares).toFixed(1);
        if (parseFloat(stock.price) < 1) stock.price = '1.0';
        stock.history.push(stock.price);
    } else {
        return res.json({ success: false, error: "Invalid action" });
    }
    
    // Update top holder
    const newTop = updateTopHolder(upperSymbol);
    
    // Update parameter
    const paramUpdate = updateGameParameter(upperSymbol);
    
    // Broadcast
    io.emit('market_update', {
        symbol: upperSymbol,
        price: parseFloat(stock.price),
        topHolder: newTop
    });
    
    io.emit('parameter_update', paramUpdate);
    
    // For player, return new cash (already rounded)
    res.json({
        success: true,
        newPrice: parseFloat(stock.price),
        newCash: portfolio.cash,
        sharesOwned: portfolio.stocks[upperSymbol] || 0,
        totalValue: portfolio.cash + calculateStockValue(portfolio.stocks)
    });
});

// Reset player portfolio - CLEAR ALL STOCKS
app.post('/api/reset-player', (req, res) => {
    if (!userPortfolios["Player"]) {
        userPortfolios["Player"] = {
            cash: 0,
            stocks: {},
            isPlayer: true,
            isChatter: false,
            lastSeen: Date.now()
        };
    }
    
    // Clear ALL player stocks
    const clearedStocks = { ...userPortfolios["Player"].stocks };
    
    // Return stocks to system
    Object.entries(clearedStocks).forEach(([symbol, shares]) => {
        if (userPortfolios["System"].stocks[symbol]) {
            userPortfolios["System"].stocks[symbol] += shares;
        } else {
            userPortfolios["System"].stocks[symbol] = shares;
        }
        
        // Update available shares
        if (stockMarket[symbol]) {
            stockMarket[symbol].availableShares += shares;
        }
    });
    
    // Reset player portfolio
    userPortfolios["Player"] = {
        cash: 0,
        stocks: {},
        isPlayer: true,
        isChatter: false,
        lastSeen: Date.now()
    };
    
    // Reset all top holders (since player might have been top holder)
    Object.keys(stockMarket).forEach(symbol => {
        updateTopHolder(symbol);
        updateGameParameter(symbol);
    });
    
    // Broadcast reset
    io.emit('player_reset', { 
        user: "Player",
        clearedStocks: Object.keys(clearedStocks).length,
        message: "Player reset - all stocks cleared, cash set to $0"
    });
    
    io.emit('player_cash_update', {
        user: "Player",
        cash: 0,
        totalValue: 0
    });
    
    res.json({
        success: true,
        clearedStocks: Object.keys(clearedStocks).length,
        message: "Player reset complete"
    });
});

// Get leaderboard (exclude System)
app.get('/api/leaderboard', (req, res) => {
    const leaderboard = calculateLeaderboard();
    res.json(leaderboard.slice(0, 10));
});

// Get game parameters
app.get('/api/parameters', (req, res) => {
    res.json(gameParameters);
});

// Get all users (for admin)
app.get('/api/users', (req, res) => {
    const users = Object.entries(userPortfolios)
        .filter(([user]) => user !== "System")
        .map(([user, data]) => ({
            user,
            cash: data.cash,
            stockCount: Object.keys(data.stocks).length,
            totalValue: data.cash + calculateStockValue(data.stocks),
            isPlayer: data.isPlayer || false,
            lastSeen: new Date(data.lastSeen || Date.now()).toISOString()
        }))
        .sort((a, b) => b.totalValue - a.totalValue);
    
    res.json(users);
});

// ==================== WEBSOCKET HANDLING ====================

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    // Send initial state
    socket.emit('initial_state', {
        gameStartTime,
        stocks: Object.entries(stockMarket).map(([symbol, data]) => ({
            symbol,
            ...data,
            price: parseFloat(data.price),
            history: data.history.map(p => parseFloat(p))
        })),
        parameters: gameParameters,
        playerPortfolio: userPortfolios["Player"] || { cash: 0, stocks: {}, isPlayer: true },
        leaderboard: calculateLeaderboard().slice(0, 10)
    });
    
    // Handle player cash sync request from GTA mod
    socket.on('sync_player_cash', (data) => {
        const cash = data.cash || 0;
        
        if (!userPortfolios["Player"]) {
            userPortfolios["Player"] = {
                cash: cash,
                stocks: {},
                isPlayer: true,
                isChatter: false,
                lastSeen: Date.now()
            };
        } else {
            userPortfolios["Player"].cash = cash;
            userPortfolios["Player"].lastSeen = Date.now();
        }
        
        // Broadcast to overlays
        io.emit('player_cash_update', {
            user: "Player",
            cash: cash,
            totalValue: cash + calculateStockValue(userPortfolios["Player"].stocks)
        });
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// ==================== HELPER FUNCTIONS ====================

function calculateLeaderboard() {
    return Object.entries(userPortfolios)
        .filter(([user]) => user !== "System") // Exclude system
        .map(([user, portfolio]) => ({
            user,
            totalWorth: portfolio.cash + calculateStockValue(portfolio.stocks),
            cash: portfolio.cash,
            stockValue: calculateStockValue(portfolio.stocks),
            stockCount: Object.keys(portfolio.stocks).length,
            isPlayer: portfolio.isPlayer || false,
            isChatter: portfolio.isChatter || false
        }))
        .sort((a, b) => b.totalWorth - a.totalWorth);
}

function calculateStockValue(stocks) {
    return Object.entries(stocks).reduce((total, [symbol, shares]) => {
        const stock = stockMarket[symbol];
        return total + (stock ? parseFloat(stock.price) * shares : 0);
    }, 0);
}

function updateTopHolder(symbol) {
    let topUser = null;
    let maxShares = 0;
    
    Object.entries(userPortfolios).forEach(([user, portfolio]) => {
        if (user === "System") return; // Don't count system
        
        const shares = portfolio.stocks[symbol] || 0;
        if (shares > maxShares) {
            maxShares = shares;
            topUser = user;
        }
    });
    
    stockMarket[symbol].topHolder = topUser;
    return topUser;
}

function updateGameParameter(symbol) {
    const stock = stockMarket[symbol];
    if (!stock || !stock.param) return;
    
    const param = gameParameters[stock.param];
    if (!param) return;
    
    // Calculate ownership concentration (excluding System)
    let totalShares = 0;
    Object.entries(userPortfolios).forEach(([user, portfolio]) => {
        if (user !== "System") {
            totalShares += portfolio.stocks[symbol] || 0;
        }
    });
    
    if (totalShares === 0) {
        // No one owns this stock, set to middle value
        param.value = (param.min + param.max) / 2;
        return;
    }
    
    const topHolder = stock.topHolder;
    const topHolderShares = topHolder ? userPortfolios[topHolder]?.stocks[symbol] || 0 : 0;
    const ownershipPercentage = (topHolderShares / totalShares) * 100;
    
    // Map ownership to parameter value
    const range = param.max - param.min;
    param.value = param.min + (range * (ownershipPercentage / 100));
    
    // Ensure value stays within bounds
    param.value = Math.max(param.min, Math.min(param.max, param.value));
    param.value = Math.round(param.value * 100) / 100;
    
    return {
        parameter: stock.param,
        value: param.value,
        topHolder,
        ownershipPercentage: ownershipPercentage.toFixed(1)
    };
}

// Auto-save state
setInterval(() => {
    const state = {
        gameStartTime,
        stockMarket,
        userPortfolios,
        gameParameters,
        timestamp: Date.now()
    };
    
    fs.writeFileSync('state_backup.json', JSON.stringify(state, null, 2));
    console.log('Game state saved');
}, 5 * 60 * 1000);

// Load state if exists
if (fs.existsSync('state_backup.json')) {
    try {
        const savedState = JSON.parse(fs.readFileSync('state_backup.json', 'utf8'));
        gameStartTime = savedState.gameStartTime || null;
        stockMarket = savedState.stockMarket || stockMarket;
        userPortfolios = savedState.userPortfolios || userPortfolios;
        gameParameters = savedState.gameParameters || gameParameters;
        console.log('Game state loaded from backup');
    } catch (error) {
        console.error('Failed to load state:', error);
    }
}

// ==================== SERVER START ====================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
    ============================================
    GTA 5 STOCK MARKET SERVER
    ============================================
    Server: http://localhost:${PORT}
    
    Key Features:
    - Player uses IN-GAME cash for stocks
    - Twitch chatters: $500 virtual starting money
    - DELETE key clears ALL player stocks
    - Admin can start/stop game to reset everything
    
    Interfaces:
    - Player Mobile:  http://localhost:${PORT}/player
    - Admin Control:  http://localhost:${PORT}/admin
    - Overlay 1:      http://localhost:${PORT}/overlay/stocks
    - Overlay 2:      http://localhost:${PORT}/overlay/leaderboard
    - Overlay 3:      http://localhost:${PORT}/overlay/parameters
    
    WebSocket: ws://localhost:${PORT}
    ============================================
    `);
    
    // Initialize parameters
    Object.keys(stockMarket).forEach(symbol => {
        updateGameParameter(symbol);
    });
});