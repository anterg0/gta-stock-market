// twitch-bot.js - Twitch Chat Bot
const tmi = require('tmi.js');
const axios = require('axios');

// Use YOUR Twitch account credentials
const client = new tmi.Client({
    options: { debug: true },
    identity: {
        username: 'anterg0',  // Your account
        password: 'oauth:u7nb6vsycc4q7dcgsx9sl65dx26gfq' // Get from: https://twitchapps.com/tmi/
    },
    channels: ['anterg0']
});

client.connect();

client.on('message', async (channel, tags, message, self) => {
    if (self) return;
    
    const args = message.trim().split(' ');
    const command = args[0].toLowerCase();
    
    // !buy STOCK_SYMBOL
    if (command === '!buy' && args[1]) {
        const symbol = args[1].toUpperCase();
        const response = await axios.post('http://localhost:3000/api/trade', {
            user: tags.username,
            symbol: symbol,
            action: 'buy',
            shares: 1
        }).catch(err => null);
        
        if (response?.data.success) {
            client.say(channel, `@${tags.username} bought 1 ${symbol} for $${response.data.newPrice}`);
        }
    }
    
    // !sell STOCK_SYMBOL
    else if (command === '!sell' && args[1]) {
        const symbol = args[1].toUpperCase();
        const response = await axios.post('http://localhost:3000/api/trade', {
            user: tags.username,
            symbol: symbol,
            action: 'sell',
            shares: 1
        }).catch(err => null);
        
        if (response?.data.success) {
            client.say(channel, `@${tags.username} sold 1 ${symbol} for $${response.data.newPrice}`);
        }
    }
    
    // !createstock SYMBOL Name "parameter"
    else if (command === '!createstock' && args.length >= 4) {
        const symbol = args[1].toUpperCase();
        const name = args[2];
        const param = args[3];
        
        const response = await axios.post('http://localhost:3000/api/create-stock', {
            user: tags.username,
            symbol: symbol,
            name: name,
            param: param
        }).catch(err => null);
        
        if (response?.data.success) {
            client.say(channel, `@${tags.username} created ${symbol} (controls ${param}) at $${response.data.price}`);
        }
    }
    
    // !portfolio
    else if (command === '!portfolio') {
        const response = await axios.get(`http://localhost:3000/api/portfolio/${tags.username}`)
            .catch(err => null);
        
        if (response?.data) {
            const stocks = Object.entries(response.data.stocks)
                .map(([s, q]) => `${s}:${q}`)
                .join(' ');
            client.say(channel, `@${tags.username} Cash: $${response.data.cash} | Stocks: ${stocks || 'None'}`);
        }
    }
});