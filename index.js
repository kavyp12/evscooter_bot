
require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const mongoose = require('mongoose');
const LocalSession = require('telegraf-session-local');
// Uncomment the following line to use telegraf-session-mongoose instead
// const { session } = require('telegraf-session-mongoose');

// Initialize Express app
const app = express();
console.log('Express app initialized.');

// Middleware for parsing JSON bodies
app.use(express.json());
console.log('JSON parsing middleware enabled.');

// --- Basic Routes ---
app.get('/', (req, res) => {
    console.log('GET / request received.');
    res.status(200).send('Welcome to the EV India Bot server. Visit /api/health for status.');
});
console.log('GET / route defined.');

app.get('/api/health', (req, res) => {
    console.log('GET /api/health request received.');
    const dbState = mongoose.connection.readyState;
    const dbStatus = {
        0: 'Disconnected',
        1: 'Connected',
        2: 'Connecting',
        3: 'Disconnecting'
    }[dbState] || `Unknown state: ${dbState}`;
    res.status(200).json({
        status: 'Healthy',
        message: 'EV India Bot server is running.',
        timestamp: new Date().toISOString(),
        databaseStatus: dbStatus,
        botTokenSet: !!process.env.TELEGRAM_BOT_TOKEN,
        openaiKeySet: !!process.env.OPENAI_API_KEY,
        vercelUrl: process.env.VERCEL_URL || 'Not set (likely local)'
    });
});
console.log('GET /api/health route defined.');

app.get('/favicon.ico', (req, res) => res.status(204).end());
console.log('Favicon route defined.');

// --- Environment Variables ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const VERCEL_URL = process.env.VERCEL_URL || (process.env.VERCEL_GIT_REPO_SLUG ? `https://${process.env.VERCEL_GIT_REPO_SLUG}.vercel.app` : null);

console.log(`VERCEL_URL: ${VERCEL_URL}`);
if (!TELEGRAM_BOT_TOKEN) console.error('CRITICAL_ENV_VAR_MISSING: TELEGRAM_BOT_TOKEN is not defined.');
if (!MONGODB_URI || !MONGODB_URI.startsWith('mongodb')) console.error('CRITICAL_ENV_VAR_MISSING: MONGODB_URI is not defined or invalid.');
if (!OPENAI_API_KEY) console.warn('ENV_VAR_MISSING: OPENAI_API_KEY is not defined. ChatGPT features will be disabled.');

// --- Mongoose Configuration ---
const mongooseOptions = {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 60000,
    family: 4
};

// --- Mongoose Schemas ---
const scooterSchema = new mongoose.Schema({
    model: { type: String, required: true, unique: true, index: true },
    brand: { type: String, required: true, index: true },
    price: { base: { type: Number, required: true }, onRoad: { type: Number, required: true } },
    range: { type: Number, required: true },
    chargingTime: { type: Number, required: true },
    topSpeed: { type: Number, required: true },
    batteryCapacity: { type: Number, required: true },
    features: [String],
    colors: [String],
    imageUrl: String,
    description: String
});
const dealerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String, required: true },
    pincode: { type: String, required: true, index: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    contact: { type: String, required: true },
    email: String,
    availableModels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Scooter' }],
    operatingHours: String,
    coordinates: { latitude: Number, longitude: Number }
});
const conversationSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    telegramChatId: { type: Number, required: true },
    userDetails: {
        id: { type: Number, required: true },
        is_bot: { type: Boolean, default: false },
        first_name: String,
        language_code: String
    },
    conversations: [{
        update_id: Number,
        message_id: { type: Number, required: true },
        chat: { id: { type: Number, required: true }, first_name: String, type: { type: String, default: 'private' } },
        date: { type: Number, required: true },
        userMessage: { type: String, required: true },
        botMessage: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
    }],
    lastInteraction: { type: Date, default: Date.now }
});
const Scooter = mongoose.model('Scooter', scooterSchema);
const Dealer = mongoose.model('Dealer', dealerSchema);
const Conversation = mongoose.model('Conversation', conversationSchema);
console.log('Mongoose schemas and models defined.');

// --- Mongoose Event Listeners ---
mongoose.connection.on('connected', () => console.log('Mongoose connected to DB.'));
mongoose.connection.on('error', (err) => console.error('Mongoose connection error:', err));
mongoose.connection.on('disconnected', () => console.log('Mongoose disconnected from DB.'));
mongoose.connection.on('reconnected', () => console.log('Mongoose reconnected to DB.'));

// --- Helper Functions ---
async function queryChatGPT(prompt, conversationHistory = []) {
    if (!OPENAI_API_KEY) {
        console.warn('OPENAI_API_KEY is not set.');
        return 'AI features are disabled. Please try a simpler request.';
    }
    try {
        const messages = [
            {
                role: 'system',
                content: `You are EV India Bot, an expert on electric scooters in India. Provide accurate, concise information. For comparisons, use a structured format. If unsure, admit it and suggest checking availability with a pincode. Be friendly and professional.`
            },
            ...conversationHistory,
            { role: 'user', content: prompt }
        ];
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            { model: 'gpt-4', messages, temperature: 0.7, max_tokens: 500 },
            { headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' } }
        );
        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error('ChatGPT error:', error.response?.data || error.message);
        return 'Sorry, I couldn’t process that. Please try again.';
    }
}

async function saveConversation(ctx, userMessage, botMessage) {
    if (!ctx.from || !ctx.message || !ctx.chat) {
        console.error('Cannot save conversation: Missing context details.');
        return;
    }
    const userId = ctx.from.id.toString();
    const telegramChatId = ctx.chat.id;
    const updateId = ctx.update?.update_id;
    const messageId = ctx.message.message_id;
    const chatDetails = {
        id: ctx.chat.id,
        first_name: ctx.chat.first_name || ctx.from.first_name,
        type: ctx.chat.type || 'private'
    };
    const date = ctx.message.date;
    const userDetails = {
        id: ctx.from.id,
        is_bot: ctx.from.is_bot || false,
        first_name: ctx.from.first_name,
        language_code: ctx.from.language_code
    };
    try {
        await Conversation.findOneAndUpdate(
            { userId },
            {
                $set: { telegramChatId, userDetails, lastInteraction: new Date() },
                $push: {
                    conversations: {
                        $each: [{
                            update_id: updateId,
                            message_id: messageId,
                            chat: chatDetails,
                            date,
                            userMessage,
                            botMessage,
                            timestamp: new Date()
                        }],
                        $slice: -20
                    }
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
    } catch (error) {
        console.error('Error saving conversation:', error);
    }
}

async function getConversationHistory(userId) {
    try {
        const record = await Conversation.findOne({ userId });
        if (!record || !record.conversations) return [];
        return record.conversations.slice(-10).map(conv => [
            { role: 'user', content: conv.userMessage },
            { role: 'assistant', content: conv.botMessage }
        ]).flat();
    } catch (error) {
        console.error('Error getting conversation history:', error);
        return [];
    }
}

async function checkAvailabilityByPincode(pincode) {
    try {
        const dealers = await Dealer.find({ pincode }).populate('availableModels');
        if (!dealers.length) {
            return { available: false, message: `No dealers found in pincode ${pincode}. Try a nearby pincode.` };
        }
        const availableScooters = new Set();
        const dealerInfo = dealers.map(dealer => {
            dealer.availableModels.forEach(model => model && model.model && availableScooters.add(`${model.brand} ${model.model}`));
            return {
                name: dealer.name,
                address: dealer.address,
                contact: dealer.contact,
                models: dealer.availableModels.map(m => m?.model ? `${m.brand} ${m.model}` : 'N/A').join(', ') || 'Not specified'
            };
        });
        if (!availableScooters.size && dealerInfo.length) {
            return {
                available: true,
                scooters: [],
                dealers: dealerInfo,
                message: `Found ${dealers.length} dealer(s) in ${pincode}, but no specific models listed. Contact them directly:`
            };
        }
        return {
            available: true,
            scooters: [...availableScooters],
            dealers: dealerInfo,
            message: `Found ${dealers.length} dealer(s) in ${pincode} with models: ${[...availableScooters].join(', ')}.`
        };
    } catch (error) {
        console.error('Error checking availability:', error);
        return { available: false, message: 'Error checking availability. Please try again.' };
    }
}

async function getScooterInfo(modelName) {
    try {
        const queryParts = modelName.split(' ');
        const query = queryParts.length > 1
            ? {
                $or: [
                    { model: { $regex: `^${modelName}$`, $options: 'i' } },
                    { brand: { $regex: `^${queryParts[0]}$`, $options: 'i' }, model: { $regex: `^${queryParts.slice(1).join(' ')}$`, $options: 'i' } }
                ]
            }
            : { model: { $regex: `^${modelName}$`, $options: 'i' } };
        const scooter = await Scooter.findOne(query);
        if (!scooter) {
            const similarScooters = await Scooter.find({
                $or: [
                    { model: { $regex: modelName, $options: 'i' } },
                    { brand: { $regex: modelName, $options: 'i' } }
                ]
            }).limit(3);
            if (!similarScooters.length) {
                return { found: false, message: `No info found for "${modelName}". Try listing available models or check spelling.` };
            }
            let message = `No exact match for "${modelName}". Did you mean:\n\n${similarScooters.map(s => `- ${s.brand} ${s.model}`).join('\n')}\n\nAsk again with the full name.`;
            return { found: false, message };
        }
        let responseText = `*${scooter.brand} ${scooter.model}*\n\n` +
            `*Price (Ex-showroom):* ₹${scooter.price.base.toLocaleString('en-IN')}\n` +
            `*Price (On-Road):* ₹${scooter.price.onRoad.toLocaleString('en-IN')}\n` +
            `*Range:* ${scooter.range} km\n` +
            `*Battery:* ${scooter.batteryCapacity} kWh\n` +
            `*Charging Time:* ${scooter.chargingTime} hours\n` +
            `*Top Speed:* ${scooter.topSpeed} km/h\n` +
            (scooter.colors?.length ? `*Colors:* ${scooter.colors.join(', ')}\n` : '') +
            (scooter.features?.length ? `\n*Features:*\n${scooter.features.map(f => `- ${f}`).join('\n')}\n` : '') +
            (scooter.description ? `\n*Description:* ${scooter.description}\n` : '') +
            (scooter.imageUrl ? `\n[View Image](${scooter.imageUrl})\n` : '') +
            `\nCheck availability with your 6-digit pincode.`;
        return { found: true, message: responseText, scooter };
    } catch (error) {
        console.error('Error fetching scooter info:', error);
        return { found: false, message: 'Error fetching scooter details. Please try again.' };
    }
}

async function getComparisonInfo(modelName1, modelName2) {
    try {
        const [scooter1Result, scooter2Result] = await Promise.all([getScooterInfo(modelName1), getScooterInfo(modelName2)]);
        if (!scooter1Result.found && !scooter2Result.found) return `No info found for "${modelName1}" or "${modelName2}". Check spellings.`;
        if (!scooter1Result.found) return `${scooter1Result.message}\n\nI can tell you about "${modelName2}".`;
        if (!scooter2Result.found) return `${scooter2Result.message}\n\nI can tell you about "${modelName1}".`;
        const s1 = scooter1Result.scooter, s2 = scooter2Result.scooter;
        const maxModelLength = Math.max(s1.model.length, s2.model.length, 10);
        let comparisonText = `*Comparison: ${s1.brand} ${s1.model} vs ${s2.brand} ${s2.model}*\n\n` +
            `| Metric                 | ${s1.model.padEnd(maxModelLength)} | ${s2.model.padEnd(maxModelLength)} |\n` +
            `|------------------------|${'-'.repeat(maxModelLength + 2)}|${'-'.repeat(maxModelLength + 2)}|\n` +
            `| Brand                  | ${s1.brand.padEnd(maxModelLength)} | ${s2.brand.padEnd(maxModelLength)} |\n` +
            `| Ex-Showroom Price      | ₹${s1.price.base.toLocaleString('en-IN').padEnd(maxModelLength - 1)} | ₹${s2.price.base.toLocaleString('en-IN').padEnd(maxModelLength - 1)} |\n` +
            `| On-Road Price          | ₹${s1.price.onRoad.toLocaleString('en-IN').padEnd(maxModelLength - 1)} | ₹${s2.price.onRoad.toLocaleString('en-IN').padEnd(maxModelLength - 1)} |\n` +
            `| Range                  | ${`${s1.range} km`.padEnd(maxModelLength)} | ${`${s2.range} km`.padEnd(maxModelLength)} |\n` +
            `| Battery                | ${`${s1.batteryCapacity} kWh`.padEnd(maxModelLength)} | ${`${s2.batteryCapacity} kWh`.padEnd(maxModelLength)} |\n` +
            `| Charging Time          | ${`${s1.chargingTime} hrs`.padEnd(maxModelLength)} | ${`${s2.chargingTime} hrs`.padEnd(maxModelLength)} |\n` +
            `| Top Speed              | ${`${s1.topSpeed} km/h`.padEnd(maxModelLength)} | ${`${s2.topSpeed} km/h`.padEnd(maxModelLength)} |\n` +
            `\n*Features for ${s1.brand} ${s1.model}:*\n- ${s1.features?.length ? s1.features.join('\n- ') : 'Not listed'}\n` +
            `\n*Features for ${s2.brand} ${s2.model}:*\n- ${s2.features?.length ? s2.features.join('\n- ') : 'Not listed'}\n` +
            `\nCheck availability with your pincode.`;
        return comparisonText;
    } catch (error) {
        console.error('Error comparing scooters:', error);
        return 'Error comparing scooters. Please try again.';
    }
}

function extractPincode(message) {
    const pincodeRegex = /\b\d{6}\b/;
    const match = message.match(pincodeRegex);
    return match ? match[0] : null;
}

async function extractPotentialModels(message) {
    try {
        const allScooters = await Scooter.find({}, 'model brand').lean();
        const modelsFound = new Set();
        const lowerMessage = message.toLowerCase();
        for (const scooter of allScooters) {
            const modelLower = scooter.model.toLowerCase();
            const brandLower = scooter.brand.toLowerCase();
            if (lowerMessage.includes(`${brandLower} ${modelLower}`)) {
                modelsFound.add(scooter.model);
            } else if (lowerMessage.includes(modelLower)) {
                let isSubstring = false;
                for (const m of allScooters) {
                    if (m.model.toLowerCase() !== modelLower && m.model.toLowerCase().includes(modelLower) && lowerMessage.includes(m.model.toLowerCase())) {
                        isSubstring = true;
                        break;
                    }
                }
                if (!isSubstring) modelsFound.add(scooter.model);
            }
        }
        return [...modelsFound];
    } catch (error) {
        console.error('Error extracting models:', error);
        return [];
    }
}

// --- Sample Data Seeding ---
async function seedSampleData() {
    try {
        const scootersCount = await Scooter.countDocuments();
        let scooterMap = {};
        if (scootersCount > 0) {
            console.log('Sample scooter data exists, skipping seed.');
            const scooters = await Scooter.find({});
            scooters.forEach(scooter => { scooterMap[scooter.model] = scooter._id; });
        } else {
            console.log('Seeding sample scooter data...');
            await Scooter.deleteMany({});
            const scootersData = [
                { model: 'S1 Pro', brand: 'Ola Electric', price: { base: 129999, onRoad: 145000 }, range: 181, chargingTime: 6.5, topSpeed: 116, batteryCapacity: 4, features: ['Digital Console', 'Reverse Mode', 'Fast Charging', 'Bluetooth', 'GPS', 'Anti-theft alarm', 'Hill Hold'], colors: ['Jet Black', 'Porcelain White', 'Neo Mint', 'Coral Glam', 'Liquid Silver'], imageUrl: 'https://placehold.co/600x400/EBF4FA/CCCCCC?text=Ola+S1+Pro', description: 'The Ola S1 Pro is a flagship electric scooter known for its performance, range, and smart features.' },
                { model: '450X', brand: 'Ather', price: { base: 138000, onRoad: 160000 }, range: 111, chargingTime: 5.7, topSpeed: 90, batteryCapacity: 3.7, features: ['Touchscreen Dashboard', 'OTA Updates', 'Navigation', 'Riding Modes', 'Reverse Assist', 'Auto Indicator Off'], colors: ['Space Grey', 'Mint Green', 'True Red', 'Cosmic Black'], imageUrl: 'https://placehold.co/600x400/EBF4FA/CCCCCC?text=Ather+450X', description: 'The Ather 450X is a premium smart electric scooter offering a thrilling ride and connected features.' },
                { model: 'iQube S', brand: 'TVS', price: { base: 120000, onRoad: 135000 }, range: 100, chargingTime: 4.5, topSpeed: 78, batteryCapacity: 3.04, features: ['SmartXonnect', 'Geo-fencing', 'Anti-theft Alert', 'Q-Park Assist', 'USB Charging'], colors: ['Titanium Grey Matte', 'Starlight Blue Glossy', 'Mint Blue'], imageUrl: 'https://placehold.co/600x400/EBF4FA/CCCCCC?text=TVS+iQube+S', description: 'The TVS iQube S is a reliable electric scooter with practical features for urban commuting.' },
                { model: 'Chetak Premium', brand: 'Bajaj', price: { base: 145000, onRoad: 158000 }, range: 90, chargingTime: 5, topSpeed: 63, batteryCapacity: 2.88, features: ['Metal Body', 'Keyless Start', 'IP67 Rating', 'Sequential Blinkers', 'Digital Console'], colors: ['Hazelnut', 'Brooklyn Black', 'Velluto Rosso', 'Indigo Metallic'], imageUrl: 'https://placehold.co/600x400/EBF4FA/CCCCCC?text=Bajaj+Chetak', description: 'The Bajaj Chetak electric revives a classic name with modern electric technology and premium build quality.' },
                { model: 'Vida V1 Pro', brand: 'Hero', price: { base: 125000, onRoad: 140000 }, range: 110, chargingTime: 5.9, topSpeed: 80, batteryCapacity: 3.94, features: ['Removable Batteries', 'Cruise Control', 'SOS Alert', 'Follow-me-home lights', 'Two-way throttle'], colors: ['Matte White', 'Matte Sports Red', 'Matte Abrax Orange'], imageUrl: 'https://placehold.co/600x400/EBF4FA/CCCCCC?text=Hero+Vida+V1', description: 'The Hero Vida V1 Pro offers innovative features like removable batteries and a customizable riding experience.' }
            ];
            const insertedScooters = await Scooter.insertMany(scootersData);
            insertedScooters.forEach(scooter => { scooterMap[scooter.model] = scooter._id; });
            console.log('Sample scooter data seeded.');
        }
        const dealersCount = await Dealer.countDocuments();
        if (dealersCount === 0 && Object.keys(scooterMap).length) {
            console.log('Seeding sample dealer data...');
            await Dealer.deleteMany({});
            const dealersData = [
                { name: 'Ola Experience Centre - Mumbai', address: '123 Andheri West', pincode: '400058', city: 'Mumbai', state: 'Maharashtra', contact: '+91 9000000001', email: 'mumbai.ec@olaelectric.com', availableModels: scooterMap['S1 Pro'] ? [scooterMap['S1 Pro']] : [], operatingHours: '10:00 AM - 8:00 PM', coordinates: { latitude: 19.1196, longitude: 72.8465 } },
                { name: 'Ather Space - Delhi', address: '456 Connaught Place', pincode: '110001', city: 'New Delhi', state: 'Delhi', contact: '+91 9000000002', email: 'delhi.as@atherenergy.com', availableModels: scooterMap['450X'] ? [scooterMap['450X']] : [], operatingHours: '10:00 AM - 7:00 PM', coordinates: { latitude: 28.6329, longitude: 77.2195 } },
                { name: 'TVS Green Motors - Bangalore', address: '789 Koramangala', pincode: '560034', city: 'Bangalore', state: 'Karnataka', contact: '+91 9000000003', email: 'bangalore.tvs@greenmotors.com', availableModels: scooterMap['iQube S'] ? [scooterMap['iQube S']] : [], operatingHours: '9:30 AM - 7:30 PM', coordinates: { latitude: 12.9351, longitude: 77.6245 } },
                { name: 'Bajaj EV World - Pune', address: 'Plot 10, FC Road', pincode: '411004', city: 'Pune', state: 'Maharashtra', contact: '+91 9000000004', email: 'pune.bajaj@evworld.com', availableModels: scooterMap['Chetak Premium'] ? [scooterMap['Chetak Premium']] : [], operatingHours: '10:00 AM - 8:00 PM', coordinates: { latitude: 18.5204, longitude: 73.8567 } },
                { name: 'Hero Vida Hub - South Mumbai', address: '234 Marine Drive', pincode: '400002', city: 'Mumbai', state: 'Maharashtra', contact: '+91 9000000005', email: 'mumbai.vida@heromotocorp.com', availableModels: [scooterMap['Vida V1 Pro'], scooterMap['S1 Pro']].filter(id => id), operatingHours: '11:00 AM - 7:00 PM', coordinates: { latitude: 18.9442, longitude: 72.8237 } }
            ];
            await Dealer.insertMany(dealersData);
            console.log('Sample dealer data seeded.');
        } else {
            console.log('Sample dealer data exists, skipping seed.');
        }
    } catch (error) {
        console.error('Error seeding data:', error);
    }
}

// --- Bot Initialization ---
async function initializeBotApplication(currentApp) {
    console.log('Attempting to initialize bot application...');
    if (!TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not defined.');
    if (!MONGODB_URI || !MONGODB_URI.startsWith('mongodb')) throw new Error('MONGODB_URI is not defined or invalid.');

    // MongoDB connection with retry
    const connectWithRetry = async (retries = 3, delay = 5000) => {
        for (let i = 0; i < retries; i++) {
            try {
                await mongoose.connect(MONGODB_URI, mongooseOptions);
                return;
            } catch (err) {
                console.error(`MongoDB connection attempt ${i + 1} failed:`, err);
                if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw new Error('Failed to connect to MongoDB after retries');
    };
    console.log('Connecting to MongoDB:', MONGODB_URI.substring(0, MONGODB_URI.indexOf('@')) + '...');
    await connectWithRetry();

    // Initialize bot
    const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
    console.log('Telegraf bot instance created.');

    // Error handling
    bot.catch((err, ctx) => {
        console.error(`Telegraf error for ${ctx.updateType} from user ${ctx.from?.id}:`, err);
        if (ctx && typeof ctx.reply === 'function') {
            ctx.reply(`Sorry, an error occurred: ${err.message.substring(0, 100)}`).catch(replyErr => console.error('Failed to send error reply:', replyErr));
        }
    });
    console.log('Global Telegraf error handler attached.');

    // Session middleware (using telegraf-session-local)
    bot.use(new LocalSession({ database: 'sessions.json' }).middleware());
    console.log('Local session middleware initialized.');

    // Alternative: telegraf-session-mongoose (uncomment to use)
    /*
    bot.use(session({
        store: { collection: mongoose.connection.collection('sessions'), options: { findOneTimeout: 30000 } },
        defaultSession: () => ({})
    }));
    console.log('Mongoose session middleware initialized.');
    */

    // --- Bot Commands ---
    bot.start(async (ctx) => {
        const welcomeMessage = `Namaste! 🙏 Welcome to EV India Bot! 🇮🇳

I'm your assistant for electric scooters in India. I can:
🛵 Provide scooter specs, prices, and features
📍 Check availability by pincode
⚖️ Compare scooter models
❓ Answer EV-related questions

Type /help for examples. How can I assist you?`;
        try {
            await ctx.reply(welcomeMessage, Markup.keyboard([
                ['Compare Scooters', 'Find Scooters by Pincode'],
                ['/help']
            ]).resize().oneTime());
            await saveConversation(ctx, '/start', welcomeMessage);
        } catch (e) {
            console.error('Error in /start:', e);
        }
    });

    bot.help(async (ctx) => {
        const helpMessage = `Here's how I can help:

*General Info:*
  "Tell me about Ola S1 Pro"
  "Features of Ather 450X"

*Availability:*
  "Scooters in 400001"
  (Or send a 6-digit pincode)

*Compare:*
  "Compare Ola S1 Pro and Ather 450X"
  "TVS iQube S vs Bajaj Chetak Premium"

*Pricing:*
  "Price of TVS iQube S"
  "Ola S1 Pro on road price"

*Specifics:*
  "Range of Bajaj Chetak"
  "Charging time for Ather 450X"

Ask away! If I don’t know something, I’ll suggest alternatives.`;
        try {
            await ctx.replyWithMarkdown(helpMessage);
            await saveConversation(ctx, '/help', helpMessage);
        } catch (e) {
            console.error('Error in /help:', e);
        }
    });

    bot.command('getinteractions', async (ctx) => {
        const userId = ctx.from.id.toString();
        try {
            if (ADMIN_USER_ID && userId !== ADMIN_USER_ID) {
                await ctx.reply('This command is admin-only.');
                await saveConversation(ctx, '/getinteractions', 'Access denied.');
                return;
            }
            const record = await Conversation.findOne({ userId });
            if (!record || !record.conversations?.length) {
                await ctx.reply('No interaction history found.');
                await saveConversation(ctx, '/getinteractions', 'No history.');
                return;
            }
            let responseText = `*Recent Interactions (Last ${record.conversations.length}):*\n\n` +
                (record.userDetails ? `**User:**\n- ID: ${record.userDetails.id}\n- Name: ${record.userDetails.first_name || 'N/A'}\n- Bot: ${record.userDetails.is_bot ? 'Yes' : 'No'}\n- Language: ${record.userDetails.language_code || 'N/A'}\n\n` : '') +
                record.conversations.map((interaction, i) => `**Interaction ${i + 1} (${new Date(interaction.timestamp).toLocaleString()}):**\n- User: \`${interaction.userMessage.substring(0, 100)}\`\n- Bot: \`${interaction.botMessage.substring(0, 100)}\`\n`).join('\n');
            if (responseText.length > 4096) responseText = responseText.substring(0, 4090) + '\n... (truncated)';
            await ctx.replyWithMarkdown(responseText);
            await saveConversation(ctx, '/getinteractions', 'Displayed history.');
        } catch (error) {
            console.error('Error fetching interactions:', error);
            await ctx.reply('Error fetching interactions.');
        }
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const userMessage = ctx.message.text.trim();
        let botResponse = 'Sorry, I didn’t understand. Could you rephrase?';
        await ctx.telegram.sendChatAction(ctx.chat.id, 'typing');
        const pincode = extractPincode(userMessage);
        const comparisonRegex = /compare ([\w\sÀ-ÖØ-öø-ÿ.-]+) and ([\w\sÀ-ÖØ-öø-ÿ.-]+)/i;
        const comparisonMatch = userMessage.match(comparisonRegex);
        try {
            if (pincode) {
                const availability = await checkAvailabilityByPincode(pincode);
                botResponse = availability.message;
                if (availability.available && availability.dealers?.length) {
                    botResponse += `\n\n*Dealers:*\n${availability.dealers.map((d, i) => `\n*${i + 1}. ${d.name}*\n   Address: ${d.address}\n   Contact: ${d.contact || 'N/A'}\n   Models: ${d.models}`).join('')}\n\nWant details on any scooter?`;
                }
            } else if (comparisonMatch) {
                botResponse = await getComparisonInfo(comparisonMatch[1].trim(), comparisonMatch[2].trim());
            } else {
                const potentialModels = await extractPotentialModels(userMessage);
                if (potentialModels.length === 1) {
                    botResponse = (await getScooterInfo(potentialModels[0])).message;
                } else if (potentialModels.length > 1 && OPENAI_API_KEY) {
                    botResponse = await queryChatGPT(`User asked: "${userMessage}". Models: ${potentialModels.join(', ')}. Clarify or provide info.`, await getConversationHistory(userId));
                } else if (OPENAI_API_KEY) {
                    botResponse = await queryChatGPT(userMessage, await getConversationHistory(userId));
                } else {
                    botResponse = 'I can find scooter info, compare models, or check availability. How can I help?';
                }
            }
            await ctx.replyWithMarkdown(botResponse, { parse_mode: 'Markdown' });
            await saveConversation(ctx, userMessage, botResponse);
        } catch (error) {
            console.error('Error processing text:', error);
            await ctx.reply('Error processing your request. Please try again.');
        }
    });
    console.log('Bot command and text handlers attached.');

    // Seed data
    if (process.env.NODE_ENV !== 'test') await seedSampleData();

    // Webhook setup
    const webhookPath = '/api/telegram-webhook';
    console.log(`Intended webhook path: ${webhookPath}`);
    if (process.env.NODE_ENV === 'production' && VERCEL_URL) {
        const webhookUrl = `${VERCEL_URL.replace(/\/$/, '')}${webhookPath}`;
        console.log(`Setting webhook to: ${webhookUrl}`);
        try {
            const currentWebhook = await bot.telegram.getWebhookInfo();
            if (currentWebhook.url !== webhookUrl) {
                await bot.telegram.setWebhook(webhookUrl, { drop_pending_updates: true });
                console.log(`Webhook set to ${webhookUrl}`);
            } else {
                console.log('Webhook already set.');
            }
        } catch (e) {
            console.error('Webhook setup failed:', e);
            throw new Error(`Webhook setup failed: ${e.message}`);
        }
    } else {
        console.log('Webhook setup skipped (local/testing mode).');
        // Uncomment for local polling mode
        // console.log('Starting bot in polling mode.');
        // bot.launch().then(() => console.log('Bot polling started.')).catch(err => console.error('Polling failed:', err));
    }

    // Webhook handler
    currentApp.post(webhookPath, (req, res) => {
        console.log(`Webhook request at ${webhookPath} from IP: ${req.ip}, Body: ${JSON.stringify(req.body).substring(0, 200)}`);
        try {
            return bot.handleUpdate(req.body, res);
        } catch (err) {
            console.error('Webhook error:', err);
            res.status(400).send(`Invalid update: ${err.message}`);
        }
    });
    currentApp.get(webhookPath, (req, res) => res.status(200).send('Webhook endpoint active (GET). Use POST for updates.'));
    console.log(`Webhook registered at ${webhookPath}.`);

    console.log('Bot application initialized.');
    return bot;
}

// --- Start Application ---
initializeBotApplication(app).then(bot => {
    console.log('Bot initializers completed.');

    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('SIGINT received. Shutting down...');
        if (bot && typeof bot.stop === 'function') bot.stop('SIGINT');
        if (mongoose.connection.readyState === 1) await mongoose.connection.close(false);
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('SIGTERM received. Shutting down...');
        if (bot && typeof bot.stop === 'function') bot.stop('SIGTERM');
        if (mongoose.connection.readyState === 1) await mongoose.connection.close(false);
        process.exit(0);
    });

    // Start server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Express server listening on port ${PORT}`));
}).catch(err => {
    console.error('FATAL: Bot initialization failed:', err);
    process.exit(1);
});

// Export for Vercel
module.exports = app;
console.log('Module exported for Vercel.');