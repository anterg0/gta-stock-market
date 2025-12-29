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
let isGameActive = false;
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
    }
};

// Initial stock market
let stockMarket = {
    "GRAVITY": { 
        name: "Gravity Control Inc", 
        price: 45, 
        param: "gravity", 
        history: [42, 43, 44, 45],
        topHolder: null,
        creator: "System",
        totalShares: 1000,
        availableShares: 1000
    },
    "NPCLIFE": { 
        name: "NPC Life Corp", 
        price: 38, 
        param: "npcHealth", 
        history: [35, 36, 37, 38],
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
            <p>Game Status: <strong>${isGameActive ? 'ACTIVE' : 'WAITING'}</strong></p>
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
    isGameActive = true;
    gameStartTime = Date.now();
    
    // Reset all stocks to initial state
    Object.keys(stockMarket).forEach(symbol => {
        stockMarket[symbol].price = Math.floor(Math.random() * 21) + 30; // 30-50
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
    isGameActive = false;
    io.emit('game_stopped', { message: "Game stopped" });
    res.json({ success: true, message: "Game stopped" });
});

app.get('/api/game/status', (req, res) => {
    res.json({
        isActive: isGameActive,
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
        price: data.price,
        param: data.param,
        history: data.history.slice(-20),
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
            const value = stock.price * shares;
            stockValue += value;
            stocksDetail[symbol] = {
                shares,
                value,
                price: stock.price,
                totalValue: value
            };
        }
    });
    
    portfolio.lastSeen = Date.now();
    
    res.json({
        user,
        cash: portfolio.cash,
        totalValue: portfolio.cash + stockValue,
        stockValue,
        stocks: stocksDetail,
        isPlayer: portfolio.isPlayer || false,
        isChatter: portfolio.isChatter || false
    });
});

// Update player cash (called by GTA mod when in-game cash changes)
app.post('/api/player/cash', (req, res) => {
    const { cash } = req.body;
    
    if (!userPortfolios["Player"]) {
        userPortfolios["Player"] = {
            cash: 0,
            stocks: {},
            isPlayer: true,
            isChatter: false,
            lastSeen: Date.now()
        };
    }
    
    userPortfolios["Player"].cash = cash;
    userPortfolios["Player"].lastSeen = Date.now();
    
    // Broadcast cash update for overlay
    io.emit('player_cash_update', {
        user: "Player",
        cash: cash,
        totalValue: cash + calculateStockValue(userPortfolios["Player"].stocks)
    });
    
    res.json({ success: true, cash });
});

// Trade endpoint - KEY DIFFERENCE: Player uses in-game cash, chatters use virtual
app.post('/api/trade', async (req, res) => {
    try {
        const { user, symbol, action, shares = 1, currentCash } = req.body;
        
        // Validation
        if (!user || !symbol || !action) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const symbolUpper = symbol.toUpperCase();
        const stock = stockMarket[symbolUpper];
        
        if (!stock) {
            return res.status(404).json({ error: 'Stock not found' });
        }
        
        if (action !== 'buy' && action !== 'sell') {
            return res.status(400).json({ error: 'Action must be "buy" or "sell"' });
        }
        
        // Initialize user if new (for Twitch chatters)
        if (!userPortfolios[user]) {
            userPortfolios[user] = {
                cash: user === "Player" ? 0 : 500, // Player: 0, Chatters: 500
                stocks: {},
                isPlayer: user === "Player",
                isChatter: user !== "Player",
                lastSeen: Date.now()
            };
        }
        
        const portfolio = userPortfolios[user];
        const totalCost = stock.price * shares;
        
        // SPECIAL HANDLING FOR PLAYER: Use currentCash from game
        if (user === "Player") {
            // Player must provide current in-game cash
            if (currentCash === undefined) {
                return res.status(400).json({ error: 'Player must provide current cash amount' });
            }
            
            // Update player's cash to match game
            portfolio.cash = currentCash;
            
            if (action === 'buy') {
                if (currentCash < totalCost) {
                    return res.status(400).json({ error: 'Insufficient in-game cash' });
                }
                
                // Check if enough shares available
                if (stock.availableShares < shares) {
                    return res.status(400).json({ error: 'Not enough shares available' });
                }
                
                // Execute buy
                portfolio.cash -= totalCost;
                portfolio.stocks[symbolUpper] = (portfolio.stocks[symbolUpper] || 0) + shares;
                stock.availableShares -= shares;
                
                // Decrease shares from system (initial owner)
                userPortfolios["System"].stocks[symbolUpper] -= shares;
                
                // Price increase on buy
                const increasePercent = 0.05 + (Math.random() * 0.05);
                stock.price = Math.min(999, Math.round(stock.price * (1 + increasePercent)));
                
            } else if (action === 'sell') {
                if (!portfolio.stocks[symbolUpper] || portfolio.stocks[symbolUpper] < shares) {
                    return res.status(400).json({ error: 'Not enough shares to sell' });
                }
                
                // Execute sell
                portfolio.cash += totalCost;
                portfolio.stocks[symbolUpper] -= shares;
                stock.availableShares += shares;
                
                // Increase shares in system
                userPortfolios["System"].stocks[symbolUpper] += shares;
                
                if (portfolio.stocks[symbolUpper] === 0) {
                    delete portfolio.stocks[symbolUpper];
                }
                
                // Price decrease on sell
                const decreasePercent = 0.03 + (Math.random() * 0.04);
                stock.price = Math.max(1, Math.round(stock.price * (1 - decreasePercent)));
            }
        } else {
            // TWITCH CHATTERS: Use virtual money
            if (action === 'buy') {
                if (stock.availableShares < shares) {
                    return res.status(400).json({ error: 'Not enough shares available' });
                }
                
                if (portfolio.cash < totalCost) {
                    return res.status(400).json({ error: 'Insufficient virtual funds' });
                }
                
                // Execute buy
                portfolio.cash -= totalCost;
                portfolio.stocks[symbolUpper] = (portfolio.stocks[symbolUpper] || 0) + shares;
                stock.availableShares -= shares;
                userPortfolios["System"].stocks[symbolUpper] -= shares;
                
                // Price increase on buy
                const increasePercent = 0.05 + (Math.random() * 0.05);
                stock.price = Math.min(999, Math.round(stock.price * (1 + increasePercent)));
                
            } else if (action === 'sell') {
                if (!portfolio.stocks[symbolUpper] || portfolio.stocks[symbolUpper] < shares) {
                    return res.status(400).json({ error: 'Not enough shares to sell' });
                }
                
                // Execute sell
                portfolio.cash += totalCost;
                portfolio.stocks[symbolUpper] -= shares;
                stock.availableShares += shares;
                userPortfolios["System"].stocks[symbolUpper] += shares;
                
                if (portfolio.stocks[symbolUpper] === 0) {
                    delete portfolio.stocks[symbolUpper];
                }
                
                // Price decrease on sell
                const decreasePercent = 0.03 + (Math.random() * 0.04);
                stock.price = Math.max(1, Math.round(stock.price * (1 - decreasePercent)));
            }
        }
        
        // Update stock history
        stock.history.push(stock.price);
        if (stock.history.length > 50) stock.history.shift();
        
        // Update top holder
        updateTopHolder(symbolUpper);
        
        // Update game parameter based on stock control
        updateGameParameter(symbolUpper);
        
        // Calculate new values
        const leaderboard = calculateLeaderboard();
        const playerTotalValue = userPortfolios["Player"] ? 
            userPortfolios["Player"].cash + calculateStockValue(userPortfolios["Player"].stocks) : 0;
        
        // Prepare broadcast data
        const broadcastData = {
            type: 'trade_executed',
            symbol: symbolUpper,
            price: stock.price,
            action,
            user,
            shares,
            topHolder: stock.topHolder,
            parameter: stock.param,
            parameterValue: gameParameters[stock.param]?.value || 0,
            playerCash: user === "Player" ? portfolio.cash : undefined,
            playerTotalValue: user === "Player" ? playerTotalValue : undefined
        };
        
        // Broadcast to all connected clients
        io.emit('market_update', broadcastData);
        io.emit('parameter_update', {
            parameter: stock.param,
            value: gameParameters[stock.param]?.value || 0,
            topHolder: stock.topHolder
        });
        
        if (user === "Player") {
            io.emit('player_cash_update', {
                user: "Player",
                cash: portfolio.cash,
                totalValue: playerTotalValue
            });
        }
        
        // Clean up inactive chatters (30 minutes)
        Object.keys(userPortfolios).forEach(userKey => {
            if (userKey !== "System" && userKey !== "Player" && userKey !== user) {
                const userPort = userPortfolios[userKey];
                const hasStocks = Object.keys(userPort.stocks).length > 0;
                const isRecent = Date.now() - userPort.lastSeen < 30 * 60 * 1000;
                
                if (!hasStocks && !isRecent) {
                    delete userPortfolios[userKey];
                }
            }
        });
        
        res.json({
            success: true,
            newPrice: stock.price,
            newCash: portfolio.cash,
            sharesOwned: portfolio.stocks[symbolUpper] || 0,
            totalValue: portfolio.cash + calculateStockValue(portfolio.stocks),
            message: user === "Player" ? "In-game cash updated" : "Virtual cash updated"
        });
        
    } catch (error) {
        console.error('Trade error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create new stock (Twitch !createstock)
app.post('/api/create-stock', (req, res) => {
    const { user, symbol, name, param } = req.body;
    
    if (!user || !symbol || !name || !param) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const symbolUpper = symbol.toUpperCase();
    
    if (stockMarket[symbolUpper]) {
        return res.status(400).json({ error: 'Stock already exists' });
    }
    
    if (!gameParameters[param]) {
        return res.status(400).json({ error: 'Invalid parameter' });
    }
    
    // Create new stock
    const initialPrice = Math.floor(Math.random() * 21) + 30;
    
    stockMarket[symbolUpper] = {
        name,
        price: initialPrice,
        param,
        history: [initialPrice],
        topHolder: null,
        creator: user,
        totalShares: 1000,
        availableShares: 900
    };
    
    // System owns all shares initially
    userPortfolios["System"].stocks[symbolUpper] = 1000;
    
    // Creator gets 100 free shares if they're a chatter
    if (!userPortfolios[user]) {
        userPortfolios[user] = {
            cash: 500,
            stocks: {},
            isPlayer: false,
            isChatter: true,
            lastSeen: Date.now()
        };
    }
    
    // Give creator 100 shares
    userPortfolios[user].stocks[symbolUpper] = 100;
    userPortfolios["System"].stocks[symbolUpper] = 900; // System keeps 900
    
    // Broadcast new stock
    io.emit('new_stock', {
        symbol: symbolUpper,
        ...stockMarket[symbolUpper]
    });
    
    res.json({
        success: true,
        symbol: symbolUpper,
        price: initialPrice,
        message: `Stock ${symbolUpper} created! Creator received 100 free shares.`
    });
});

// Reset player (DELETE key in game)
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
        gameActive: isGameActive,
        gameStartTime,
        stocks: Object.entries(stockMarket).map(([symbol, data]) => ({
            symbol,
            ...data
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
        return total + (stock ? stock.price * shares : 0);
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
        isGameActive,
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
        isGameActive = savedState.isGameActive || false;
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
    
    Game Mode: ${isGameActive ? 'ACTIVE' : 'WAITING'}
    
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