require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const mongoose = require('mongoose');
const MongoSession = require('telegraf-session-mongoose');

// Initialize Express app
const app = express();
app.use(express.json());

// Configure environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ev-chatbot';

// --- Define Mongoose Schemas and Models ---
const scooterSchema = new mongoose.Schema({
    model: { type: String, required: true, index: true },
    brand: { type: String, required: true, index: true },
    price: {
        base: { type: Number, required: true },
        onRoad: { type: Number, required: true },
        fame2Subsidy: { type: Number, default: 0 }, // FAME II subsidy
        stateSubsidy: { type: Number, default: 0 } // State-level subsidy
    },
    range: { type: Number, required: true },
    chargingTime: { type: Number, required: true },
    topSpeed: { type: Number, required: true },
    batteryCapacity: { type: Number, required: true },
    motorPower: { type: Number }, // Added motor power in watts
    features: [String],
    colors: [String],
    imageUrl: String,
    description: String,
    specifications: {
        weight: Number, // Weight in kg
        loadCapacity: Number, // Load capacity in kg
        groundClearance: Number, // Ground clearance in mm
        tyreType: String, // Tubeless or tube-type
        brakeSystem: String, // Disc, drum, or combo
        suspension: String, // Front and rear suspension details
        batteryType: String, // Lithium-ion, LFP, etc.
        batteryWarranty: String, // Warranty period for battery
        motorWarranty: String, // Warranty period for motor
        vehicleWarranty: String // Warranty period for vehicle
    },
    availability: {
        deliveryTime: String, // Estimated delivery time
        bookingAmount: Number // Booking amount in INR
    },
    additionalInfo: {
        pmssCertified: Boolean, // PMSS certification
        portableCharger: Boolean, // Portable charger availability
        mobileApp: Boolean, // Mobile app availability
        geoFencing: Boolean, // Geo-fencing feature
        antitheft: Boolean // Anti-theft features
    }
});

const dealerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String, required: true },
    pincode: { type: String, required: true, index: true },
    city: { type: String, required: true, index: true },
    state: { type: String, required: true, index: true },
    contact: { type: String, required: true },
    email: String,
    availableModels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Scooter' }],
    operatingHours: String,
    coordinates: {
        latitude: Number,
        longitude: Number
    },
    servicesOffered: [String], // Added services offered
    testRideAvailable: Boolean, // Test ride availability
    amenities: [String] // Amenities like waiting area, coffee, etc.
});

const conversationSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    conversations: [{
        timestamp: { type: Date, default: Date.now },
        userMessage: String,
        botMessage: String,
        context: Object // Added context for better conversation tracking
    }],
    lastInteraction: { type: Date, default: Date.now },
    preferences: {
        preferredPincode: String,
        preferredBrands: [String],
        priceRange: {
            min: Number,
            max: Number
        },
        preferences: Object // Additional user preferences
    }
});

// New schema for user feedback
const feedbackSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    messageId: { type: String },
    rating: { type: Number, min: 1, max: 5 },
    feedback: String,
    timestamp: { type: Date, default: Date.now }
});

// New schema for frequently asked questions
const faqSchema = new mongoose.Schema({
    question: { type: String, required: true },
    answer: { type: String, required: true },
    category: { type: String, required: true },
    tags: [String]
});

// New schema for subsidies by state
const subsidySchema = new mongoose.Schema({
    state: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    eligibility: String,
    documentationRequired: [String],
    processingTime: String,
    additionalInfo: String
});

// Create models
const Scooter = mongoose.model('Scooter', scooterSchema);
const Dealer = mongoose.model('Dealer', dealerSchema);
const Conversation = mongoose.model('Conversation', conversationSchema);
const Feedback = mongoose.model('Feedback', feedbackSchema);
const FAQ = mongoose.model('FAQ', faqSchema);
const Subsidy = mongoose.model('Subsidy', subsidySchema);

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        
        // Create Telegraf bot instance
        const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
        
        // Configure session middleware correctly
        try {
            // Directly use the MongoSession middleware properly
            bot.use(MongoSession.session({
                connection: mongoose.connection,
                collection: 'sessions',
                ttl: 60 * 60 * 24 * 7 // Session TTL: 1 week
            }));
            console.log('Successfully initialized Mongoose session middleware');
        } catch (error) {
            console.error('Error setting up Mongoose session middleware:', error);
            console.log('Bot will continue without session persistence');
        }
        
        // --- Utility Functions ---
        
        // OpenAI GPT integration
        async function queryChatGPT(prompt, conversationHistory = []) {
            try {
                const response = await axios.post(
                    'https://api.openai.com/v1/chat/completions',
                    {
                        model: 'gpt-4',
                        messages: [
                            {
                                role: 'system',
                                content: `You are EV India Bot, an expert assistant for electric scooters in India.
                                Provide accurate, up-to-date information about electric scooters in the Indian market.
                                Be knowledgeable about:
                                - Various EV scooter models, brands, and their specifications
                                - Pricing details (ex-showroom and on-road)
                                - Range, battery capacity, and charging time
                                - FAME II subsidies and state-specific incentives
                                - Charging infrastructure in different cities
                                - Comparison between different models
                                - Maintenance costs and battery replacement
                                - Registration process and RTO formalities
                                
                                Keep your responses concise, informative, and helpful.
                                If you don't know something, admit it clearly.
                                Always offer to show available scooters by pincode when relevant.
                                Use emoji occasionally to make your responses engaging.
                                Add "₹" symbol before prices.
                                Suggest comparing models when a user asks about a specific model.
                                Ask follow-up questions to understand user needs better.`
                            },
                            ...conversationHistory,
                            { role: 'user', content: prompt }
                        ],
                        temperature: 0.7,
                        max_tokens: 600
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${OPENAI_API_KEY}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                return response.data.choices[0].message.content.trim();
            } catch (error) {
                console.error('Error querying ChatGPT:', error.response?.data || error.message);
                return 'Sorry, I encountered an error processing your request. Please try again later.';
            }
        }
        
        // Conversation Management
        async function saveConversation(userId, userMessage, botMessage, context = {}) {
            try {
                let conversation = await Conversation.findOne({ userId });
                if (!conversation) {
                    conversation = new Conversation({ 
                        userId, 
                        conversations: [],
                        preferences: {}
                    });
                }
                conversation.conversations.push({
                    timestamp: new Date(),
                    userMessage,
                    botMessage,
                    context
                });
                conversation.lastInteraction = new Date();
                
                // Extract and save preferences
                if (context.pincode) {
                    conversation.preferences.preferredPincode = context.pincode;
                }
                if (context.brand) {
                    if (!conversation.preferences.preferredBrands) {
                        conversation.preferences.preferredBrands = [];
                    }
                    if (!conversation.preferences.preferredBrands.includes(context.brand)) {
                        conversation.preferences.preferredBrands.push(context.brand);
                    }
                }
                if (context.priceRange) {
                    conversation.preferences.priceRange = context.priceRange;
                }
                
                await conversation.save();
                return conversation;
            } catch (error) {
                console.error('Error saving conversation:', error);
            }
        }
        
        async function getConversationHistory(userId) {
            try {
                const conversation = await Conversation.findOne({ userId });
                if (!conversation) return [];
                const recentConversations = conversation.conversations.slice(-6); // Increased from 5 to 6
                return recentConversations.map(conv => [
                    { role: 'user', content: conv.userMessage },
                    { role: 'assistant', content: conv.botMessage }
                ]).flat();
            } catch (error) {
                console.error('Error getting conversation history:', error);
                return [];
            }
        }
        
        async function getUserPreferences(userId) {
            try {
                const conversation = await Conversation.findOne({ userId });
                if (!conversation) return {};
                return conversation.preferences || {};
            } catch (error) {
                console.error('Error getting user preferences:', error);
                return {};
            }
        }
        
        // Dealer and Availability Functions
        async function checkAvailabilityByPincode(pincode) {
            try {
                const dealers = await Dealer.find({ pincode }).populate('availableModels');
                
                if (dealers.length === 0) {
                    // Try to find dealers in nearby areas
                    const nearbyPincodes = await findNearbyPincodes(pincode);
                    if (nearbyPincodes.length > 0) {
                        const nearbyDealers = await Dealer.find({ 
                            pincode: { $in: nearbyPincodes } 
                        }).populate('availableModels');
                        
                        if (nearbyDealers.length > 0) {
                            return {
                                available: true,
                                nearby: true,
                                scooters: [...new Set(nearbyDealers.flatMap(dealer => 
                                    dealer.availableModels.map(model => model.model)
                                ))],
                                dealers: nearbyDealers.map(dealer => ({
                                    name: dealer.name,
                                    address: dealer.address,
                                    pincode: dealer.pincode,
                                    contact: dealer.contact,
                                    testRideAvailable: dealer.testRideAvailable,
                                    models: dealer.availableModels.map(model => model.model).join(', ')
                                })),
                                message: `I couldn't find dealers in pincode ${pincode}, but found ${nearbyDealers.length} dealer(s) in nearby areas.`
                            };
                        }
                    }
                    
                    return { 
                        available: false, 
                        message: `Sorry, we don't have any dealers in pincode ${pincode} yet.` 
                    };
                }
                
                const availableScooters = new Set();
                const dealerInfo = [];
                
                dealers.forEach(dealer => {
                    dealer.availableModels.forEach(model => {
                        availableScooters.add(model.model);
                    });
                    
                    dealerInfo.push({
                        name: dealer.name,
                        address: dealer.address,
                        contact: dealer.contact,
                        testRideAvailable: dealer.testRideAvailable,
                        models: dealer.availableModels.map(model => model.model).join(', ')
                    });
                });
                
                return {
                    available: true,
                    scooters: Array.from(availableScooters),
                    dealers: dealerInfo,
                    message: `Good news! We found ${dealers.length} dealer(s) in pincode ${pincode} with ${availableScooters.size} EV scooter model(s) available.`
                };
            } catch (error) {
                console.error('Error checking availability:', error);
                return { 
                    available: false, 
                    message: 'Error checking availability. Please try again.' 
                };
            }
        }
        
        // This function would require integration with a geolocation service
        // For now, we'll implement a simpler version
        async function findNearbyPincodes(pincode) {
            try {
                // Get first 3 digits of pincode (represents a broader area)
                const areaCode = pincode.substring(0, 3);
                
                // Find dealers with pincodes starting with the same area code
                const dealers = await Dealer.find({ 
                    pincode: { $regex: `^${areaCode}` } 
                }).distinct('pincode');
                
                // Filter out the original pincode
                return dealers.filter(p => p !== pincode);
            } catch (error) {
                console.error('Error finding nearby pincodes:', error);
                return [];
            }
        }
        
        // Scooter Information Functions
        async function getScooterInfo(modelName) {
            try {
                const regex = new RegExp(modelName, 'i');
                const scooters = await Scooter.find({ 
                    $or: [
                        { model: regex },
                        { brand: regex }
                    ]
                });
                
                if (scooters.length === 0) {
                    return { 
                        found: false, 
                        message: `Sorry, I couldn't find information about "${modelName}".` 
                    };
                }
                
                const scooter = scooters[0];
                const totalSubsidy = (scooter.price.fame2Subsidy || 0) + (scooter.price.stateSubsidy || 0);
                const effectivePrice = scooter.price.onRoad - totalSubsidy;
                
                return {
                    found: true,
                    scooter: {
                        model: scooter.model,
                        brand: scooter.brand,
                        price: {
                            ...scooter.price,
                            effectivePrice: effectivePrice > 0 ? effectivePrice : scooter.price.onRoad
                        },
                        range: scooter.range,
                        chargingTime: scooter.chargingTime,
                        topSpeed: scooter.topSpeed,
                        batteryCapacity: scooter.batteryCapacity,
                        motorPower: scooter.motorPower,
                        features: scooter.features,
                        colors: scooter.colors,
                        imageUrl: scooter.imageUrl,
                        description: scooter.description,
                        specifications: scooter.specifications,
                        availability: scooter.availability,
                        additionalInfo: scooter.additionalInfo
                    },
                    message: `Here's information about the ${scooter.brand} ${scooter.model}:`
                };
            } catch (error) {
                console.error('Error fetching scooter info:', error);
                return { 
                    found: false, 
                    message: 'Sorry, there was an error retrieving the scooter information.' 
                };
            }
        }
        
        async function compareScooters(model1, model2) {
            try {
                const scooter1 = await Scooter.findOne({ 
                    model: { $regex: new RegExp(model1, 'i') } 
                });
                
                const scooter2 = await Scooter.findOne({ 
                    model: { $regex: new RegExp(model2, 'i') } 
                });
                
                if (!scooter1 || !scooter2) {
                    return {
                        success: false,
                        message: `Sorry, I couldn't find one of the models you mentioned.`
                    };
                }
                
                return {
                    success: true,
                    comparison: {
                        model1: {
                            name: `${scooter1.brand} ${scooter1.model}`,
                            price: scooter1.price,
                            range: scooter1.range,
                            chargingTime: scooter1.chargingTime,
                            topSpeed: scooter1.topSpeed,
                            batteryCapacity: scooter1.batteryCapacity,
                            motorPower: scooter1.motorPower
                        },
                        model2: {
                            name: `${scooter2.brand} ${scooter2.model}`,
                            price: scooter2.price,
                            range: scooter2.range,
                            chargingTime: scooter2.chargingTime,
                            topSpeed: scooter2.topSpeed,
                            batteryCapacity: scooter2.batteryCapacity,
                            motorPower: scooter2.motorPower
                        }
                    }
                };
            } catch (error) {
                console.error('Error comparing scooters:', error);
                return {
                    success: false,
                    message: 'Sorry, there was an error comparing the scooters.'
                };
            }
        }
        
        async function getScootersByPriceRange(minPrice, maxPrice) {
            try {
                const scooters = await Scooter.find({
                    'price.onRoad': { 
                        $gte: minPrice, 
                        $lte: maxPrice 
                    }
                }).sort({ 'price.onRoad': 1 });
                
                if (scooters.length === 0) {
                    return {
                        found: false,
                        message: `Sorry, I couldn't find any scooters in the price range ₹${minPrice.toLocaleString()} - ₹${maxPrice.toLocaleString()}.`
                    };
                }
                
                return {
                    found: true,
                    scooters: scooters.map(scooter => ({
                        model: scooter.model,
                        brand: scooter.brand,
                        price: scooter.price.onRoad,
                        range: scooter.range
                    })),
                    message: `Found ${scooters.length} scooters in the price range ₹${minPrice.toLocaleString()} - ₹${maxPrice.toLocaleString()}.`
                };
            } catch (error) {
                console.error('Error getting scooters by price range:', error);
                return {
                    found: false,
                    message: 'Sorry, there was an error retrieving scooters in that price range.'
                };
            }
        }
        
        async function getSubsidyInfo(state) {
            try {
                const regex = new RegExp(state, 'i');
                const subsidy = await Subsidy.findOne({ state: regex });
                
                if (!subsidy) {
                    return {
                        found: false,
                        message: `Sorry, I couldn't find subsidy information for ${state}.`
                    };
                }
                
                return {
                    found: true,
                    subsidy: {
                        state: subsidy.state,
                        amount: subsidy.amount,
                        eligibility: subsidy.eligibility,
                        documentationRequired: subsidy.documentationRequired,
                        processingTime: subsidy.processingTime,
                        additionalInfo: subsidy.additionalInfo
                    },
                    message: `Here's EV subsidy information for ${subsidy.state}:`
                };
            } catch (error) {
                console.error('Error getting subsidy info:', error);
                return {
                    found: false,
                    message: 'Sorry, there was an error retrieving subsidy information.'
                };
            }
        }
        
        // Text Analysis Functions
        function extractPincode(message) {
            const pincodeRegex = /\b\d{6}\b/;
            const match = message.match(pincodeRegex);
            return match ? match[0] : null;
        }
        
        function extractPotentialModels(message, scooterModels) {
            // First, check for exact matches
            for (const model of scooterModels) {
                if (message.toLowerCase().includes(model.toLowerCase())) {
                    return model;
                }
            }
            
            // If no exact matches, check for partial matches
            const words = message.toLowerCase().split(/\s+/);
            for (const model of scooterModels) {
                const modelWords = model.toLowerCase().split(/\s+/);
                for (const modelWord of modelWords) {
                    if (modelWord.length > 2 && words.includes(modelWord)) {
                        return model;
                    }
                }
            }
            
            return null;
        }
        
        function extractPriceRange(message) {
            // Match price ranges like "under 100000", "less than 1 lakh", "between 80000 and 120000"
            const underPattern = /under|less than|below|not more than|maximum|max of|up to|upto/i;
            const betweenPattern = /between|from|range of/i;
            const numberPattern = /\b\d+\s*(?:k|lakh|l)?\b/gi;
            
            const numbers = [];
            let match;
            while ((match = numberPattern.exec(message)) !== null) {
                let num = match[0].toLowerCase().trim();
                // Convert k, lakh to actual numbers
                if (num.includes('k')) {
                    num = parseFloat(num.replace('k', '')) * 1000;
                } else if (num.includes('lakh') || num.includes('l')) {
                    num = parseFloat(num.replace(/lakh|l/g, '')) * 100000;
                } else {
                    num = parseFloat(num);
                }
                numbers.push(num);
            }
            
            if (numbers.length === 0) {
                return null;
            }
            
            if (underPattern.test(message)) {
                return { min: 0, max: Math.max(...numbers) };
            } else if (betweenPattern.test(message) && numbers.length >= 2) {
                return { min: Math.min(...numbers), max: Math.max(...numbers) };
            } else if (numbers.length === 1) {
                return { min: 0, max: numbers[0] };
            }
            
            return null;
        }
        
        function extractComparisonModels(message) {
            // Look for patterns like "compare X and Y" or "X vs Y"
            const comparePatterns = [
                /compare\s+([a-zA-Z0-9\s]+)\s+(?:and|with|to)\s+([a-zA-Z0-9\s]+)/i,
                /([a-zA-Z0-9\s]+)\s+(?:vs|versus|or)\s+([a-zA-Z0-9\s]+)/i
            ];
            
            for (const pattern of comparePatterns) {
                const match = message.match(pattern);
                if (match) {
                    return {
                        model1: match[1].trim(),
                        model2: match[2].trim()
                    };
                }
            }
            
            return null;
        }
        
        function extractStateFromMessage(message) {
            // List of Indian states
            const states = [
                'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
                'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
                'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
                'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
                'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
                'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
                'Delhi', 'Chandigarh', 'Jammu and Kashmir', 'Ladakh',
                'Andaman and Nicobar Islands', 'Dadra and Nagar Haveli and Daman and Diu',
                'Lakshadweep', 'Puducherry'
            ];
            
            const messageLower = message.toLowerCase();
            for (const state of states) {
                if (messageLower.includes(state.toLowerCase())) {
                    return state;
                }
            }
            
            return null;
        }
        
        function detectUserIntent(message) {
            const lowerMessage = message.toLowerCase();
            
            // Check for greeting intents
            if (/^(?:hi|hello|hey|namaste|good morning|good afternoon|good evening)/.test(lowerMessage)) {
                return 'greeting';
            }
            
            // Check for comparison intent
            if (/compare|vs|versus|better|difference|which is better/.test(lowerMessage)) {
                return 'comparison';
            }
            
            // Check for price range intent
            if (/price range|budget|under|less than|between|affordable|cost|costly/.test(lowerMessage)) {
                return 'price_range';
            }
            
            // Check for subsidy intent
            if (/subsidy|incentive|fame|promotion|discount|state policy|government benefit/.test(lowerMessage)) {
                return 'subsidy';
            }
            
            // Check for availability intent
            if (/available|dealer|showroom|near me|in my area|test ride|pincode|pin code/.test(lowerMessage)) {
                return 'availability';
            }
            
            // Check for scooter info intent
            if (/feature|specification|range|battery|speed|charging|warranty|tell me about/.test(lowerMessage)) {
                return 'scooter_info';
            }
            
            // Check for help intent
            if (/help|menu|what can you do|how to use|commands/.test(lowerMessage)) {
                return 'help';
            }
            
            // Default to general query
            return 'general_query';
        }
        
        // Bot Handlers
        bot.start(async (ctx) => {
            const welcomeMessage = `Welcome to EV India Bot! 🛵⚡

I can help you with everything about electric scooters in India:

- Information about different EV scooter models and brands
- Check availability in your area (share your 6-digit pincode)
- Compare models and features
- Price ranges and subsidy information
- Dealer locations and test ride options

How can I assist you today?`;

            await ctx.reply(welcomeMessage, 
                Markup.keyboard([
                    ['💰 Price Range', '🔍 Find by Pincode'],
                    ['📋 All Scooters', '🔄 Compare Models'],
                    ['🏆 Top Rated', '❓ Help']
                ]).resize());
            
            await saveConversation(ctx.from.id.toString(), '/start', welcomeMessage);
        });

        bot.help(async (ctx) => {
            const helpMessage = `Here's how I can help you with EV scooters in India:

1️⃣ Get information about specific models
   Example: "Tell me about Ola S1 Pro"

2️⃣ Check availability in your area
   Example: "Check availability in 400001"

3️⃣ Compare models
   Example: "Compare TVS iQube and Bajaj Chetak"

4️⃣ Find scooters in your budget
   Example: "Show scooters under 1 lakh"

5️⃣ Get subsidy information
   Example: "What's the EV subsidy in Maharashtra?"

6️⃣ Find dealers with test rides
   Example: "Test ride options in Delhi"

Use the keyboard buttons below for quick access, or just ask me any question about EV scooters in India!`;

            await ctx.reply(helpMessage);
            await saveConversation(ctx.from.id.toString(), '/help', helpMessage);
        });

        // Handle price range button
        bot.hears(/💰 Price Range/, async (ctx) => {
            const message = `Please tell me your budget for an EV scooter. For example:
- "Show scooters under 1 lakh"
- "Scooters between 80,000 and 1.2 lakh"
- "Best scooters under 1.5 lakh"`;
            
            await ctx.reply(message);
            await saveConversation(ctx.from.id.toString(), '💰 Price Range', message);
        });

        // Handle find by pincode button
        bot.hears(/🔍 Find by Pincode/, async (ctx) => {
            const message = "Please share your 6-digit pincode to find EV scooters and dealers in your area.";
            await ctx.reply(message);
            await saveConversation(ctx.from.id.toString(), '🔍 Find by Pincode', message);
        });

        // Handle all scooters button
        bot.hears(/📋 All Scooters/, async (ctx) => {
            try {
                const scooters = await Scooter.find().sort({ brand: 1, model: 1 });
                
                if (scooters.length === 0) {
                    await ctx.reply("Sorry, I couldn't find any scooters in our database.");
                    return;
                }
                
                const brandMap = {};
                scooters.forEach(scooter => {
                    if (!brandMap[scooter.brand]) {
                        brandMap[scooter.brand] = [];
                    }
                    brandMap[scooter.brand].push(scooter.model);
                });
                
                let message = "Here are all the available EV scooters in India:\n\n";
                for (const brand in brandMap) {
                    message += `*${brand}*:\n`;
                    message += brandMap[brand].map(model => `- ${model}`).join('\n');
                    message += '\n\n';
                }
                
                message += "To get details about any model, just ask me about it!";
                
                await ctx.reply(message, { parse_mode: 'Markdown' });
                await saveConversation(ctx.from.id.toString(), '📋 All Scooters', message);
            } catch (error) {
                console.error('Error fetching all scooters:', error);
                await ctx.reply("Sorry, I encountered an error while fetching the scooter list.");
            }
        });
        
        // Handle compare models button
        bot.hears(/🔄 Compare Models/, async (ctx) => {
            const message = "Please tell me which two models you'd like to compare. For example:\n- \"Compare Ola S1 Pro and Ather 450X\"\n- \"TVS iQube vs Bajaj Chetak\"";
            await ctx.reply(message);
            await saveConversation(ctx.from.id.toString(), '🔄 Compare Models', message);
        });
        
        // Handle top rated button
        bot.hears(/🏆 Top Rated/, async (ctx) => {
            try {
                // For now, we'll sort by range as a proxy for rating
                const topScooters = await Scooter.find()
                    .sort({ range: -1 })
                    .limit(5);
                
                if (topScooters.length === 0) {
                    await ctx.reply("Sorry, I couldn't find any scooters in our database.");
                    return;
                }
                
                let message = "🏆 *Top Rated EV Scooters in India*\n\n";
                
                topScooters.forEach((scooter, index) => {
                    message += `${index + 1}. *${scooter.brand} ${scooter.model}*\n`;
                    message += `   🔋 Range: ${scooter.range} km\n`;
                    message += `   ⚡ Charging: ${scooter.chargingTime} hours\n`;
                    message += `   💰 Price: ₹${scooter.price.onRoad.toLocaleString()}\n\n`;
                });
                
                message += "Would you like detailed information about any of these models?";
                
                await ctx.reply(message, { parse_mode: 'Markdown' });
                await saveConversation(ctx.from.id.toString(), '🏆 Top Rated', message);
            } catch (error) {
                console.error('Error fetching top scooters:', error);
                await ctx.reply("Sorry, I encountered an error while fetching the top scooters.");
            }
        });
        
        // Handle text messages
        bot.on('text', async (ctx) => {
            const userId = ctx.from.id.toString();
            const userMessage = ctx.message.text;
            
            // Skip processing if it's a button command we've already handled
            if ([
                '💰 Price Range', 
                '🔍 Find by Pincode', 
                '📋 All Scooters', 
                '🔄 Compare Models', 
                '🏆 Top Rated', 
                '❓ Help'
            ].includes(userMessage)) {
                return;
            }
            
            // Detect user intent
            const intent = detectUserIntent(userMessage);
            
            // Extract pincode if present
            const pincode = extractPincode(userMessage);
            
            // Extract price range if present
            const priceRange = extractPriceRange(userMessage);
            
            // Extract comparison models if present
            const comparisonModels = extractComparisonModels(userMessage);
            
            // Extract state if present for subsidy info
            const state = extractStateFromMessage(userMessage);
            
            // Context for conversation
            const context = {
                intent,
                pincode,
                priceRange,
                comparisonModels,
                state
            };
                        
            let botResponse;
            
            // Handle intent-based response
            if (intent === 'greeting') {
                const preferences = await getUserPreferences(userId);
                if (preferences.preferredPincode || (preferences.preferredBrands && preferences.preferredBrands.length > 0)) {
                    botResponse = `Hello! Welcome back. I remember that you're interested in `;
                    
                    if (preferences.preferredBrands && preferences.preferredBrands.length > 0) {
                        botResponse += `${preferences.preferredBrands.join(', ')} scooters. `;
                    }
                    
                    if (preferences.preferredPincode) {
                        botResponse += `I also have your pincode: ${preferences.preferredPincode}. `;
                    }
                    
                    botResponse += `How can I help you today?`;
                } else {
                    botResponse = `Hello! How can I help you with EV scooters today? You can ask about specific models, check availability in your area, or compare different scooters.`;
                }
            } else if (pincode) {
                // If pincode is present, prioritize availability check
                const availabilityResult = await checkAvailabilityByPincode(pincode);
                
                if (availabilityResult.available) {
                    let response = `${availabilityResult.message}\n\n`;
                    
                    if (availabilityResult.nearby) {
                        response += "Here are dealers in nearby areas:\n\n";
                    } else {
                        response += "Here are the dealers in your area:\n\n";
                    }
                    
                    availabilityResult.dealers.forEach((dealer, index) => {
                        response += `${index + 1}. *${dealer.name}*\n`;
                        response += `   📍 Address: ${dealer.address}\n`;
                        response += `   📞 Contact: ${dealer.contact}\n`;
                        response += `   🛵 Available Models: ${dealer.models}\n`;
                        
                        if (dealer.testRideAvailable) {
                            response += `   ✅ Test rides available\n`;
                        }
                        
                        response += '\n';
                    });
                    
                    response += "Would you like more information about any of these scooters?";
                    botResponse = response;
                } else {
                    botResponse = availabilityResult.message;
                    botResponse += "\n\nWould you like to check availability in another area? Or would you like information about specific EV scooter models?";
                }
            } else if (intent === 'comparison' && comparisonModels) {
                // Handle comparison between two models
                const result = await compareScooters(comparisonModels.model1, comparisonModels.model2);
                
                if (result.success) {
                    const comp = result.comparison;
                    botResponse = `*Comparison: ${comp.model1.name} vs ${comp.model2.name}*\n\n`;
                    
                    botResponse += `*Price (On-Road):*\n`;
                    botResponse += `- ${comp.model1.name}: ₹${comp.model1.price.onRoad.toLocaleString()}\n`;
                    botResponse += `- ${comp.model2.name}: ₹${comp.model2.price.onRoad.toLocaleString()}\n\n`;
                    
                    botResponse += `*Range:*\n`;
                    botResponse += `- ${comp.model1.name}: ${comp.model1.range} km\n`;
                    botResponse += `- ${comp.model2.name}: ${comp.model2.range} km\n\n`;
                    
                    botResponse += `*Charging Time:*\n`;
                    botResponse += `- ${comp.model1.name}: ${comp.model1.chargingTime} hours\n`;
                    botResponse += `- ${comp.model2.name}: ${comp.model2.chargingTime} hours\n\n`;
                    
                    botResponse += `*Top Speed:*\n`;
                    botResponse += `- ${comp.model1.name}: ${comp.model1.topSpeed} km/h\n`;
                    botResponse += `- ${comp.model2.name}: ${comp.model2.topSpeed} km/h\n\n`;
                    
                    botResponse += `*Battery Capacity:*\n`;
                    botResponse += `- ${comp.model1.name}: ${comp.model1.batteryCapacity} kWh\n`;
                    botResponse += `- ${comp.model2.name}: ${comp.model2.batteryCapacity} kWh\n\n`;
                    
                    botResponse += `*Motor Power:*\n`;
                    botResponse += `- ${comp.model1.name}: ${comp.model1.motorPower || 'N/A'} W\n`;
                    botResponse += `- ${comp.model2.name}: ${comp.model2.motorPower || 'N/A'} W\n\n`;
                    
                    botResponse += "Would you like to know more details about any of these models?";
                } else {
                    botResponse = result.message;
                }
            } else if (intent === 'price_range' && priceRange) {
                // Handle price range query
                const result = await getScootersByPriceRange(priceRange.min, priceRange.max);
                
                if (result.found) {
                    botResponse = `${result.message}\n\n`;
                    
                    result.scooters.forEach((scooter, index) => {
                        if (index < 8) { // Limit to 8 scooters to avoid message size issues
                            botResponse += `${index + 1}. *${scooter.brand} ${scooter.model}*\n`;
                            botResponse += `   💰 Price: ₹${scooter.price.toLocaleString()}\n`;
                            botResponse += `   🔋 Range: ${scooter.range} km\n\n`;
                        }
                    });
                    
                    if (result.scooters.length > 8) {
                        botResponse += `...and ${result.scooters.length - 8} more models.\n\n`;
                    }
                    
                    botResponse += "Would you like detailed information about any of these models?";
                } else {
                    botResponse = result.message;
                }
            } else if (intent === 'subsidy' && state) {
                // Handle subsidy info query
                const result = await getSubsidyInfo(state);
                
                if (result.found) {
                    const subsidy = result.subsidy;
                    botResponse = `${result.message}\n\n`;
                    botResponse += `*State:* ${subsidy.state}\n`;
                    botResponse += `*Subsidy Amount:* ₹${subsidy.amount.toLocaleString()}\n\n`;
                    
                    botResponse += `*Eligibility:*\n${subsidy.eligibility}\n\n`;
                    
                    botResponse += `*Required Documents:*\n`;
                    subsidy.documentationRequired.forEach(doc => {
                        botResponse += `- ${doc}\n`;
                    });
                    botResponse += `\n`;
                    
                    botResponse += `*Processing Time:* ${subsidy.processingTime}\n\n`;
                    
                    if (subsidy.additionalInfo) {
                        botResponse += `*Additional Information:*\n${subsidy.additionalInfo}\n\n`;
                    }
                    
                    botResponse += "Would you like to know which models are eligible for this subsidy?";
                } else {
                    botResponse = result.message;
                }
            } else {
                // Check if user is asking about a specific scooter model
                const allScooters = await Scooter.find({}, 'model');
                const scooterModels = allScooters.map(s => s.model);
                const modelRequested = extractPotentialModels(userMessage, scooterModels);
                
                if (modelRequested) {
                    const scooterInfo = await getScooterInfo(modelRequested);
                    
                    if (scooterInfo.found) {
                        const scooter = scooterInfo.scooter;
                        botResponse = `${scooterInfo.message}\n\n`;
                        
                        botResponse += `🛵 *${scooter.brand} ${scooter.model}*\n\n`;
                        botResponse += `💰 Ex-Showroom: ₹${scooter.price.base.toLocaleString()}\n`;
                        botResponse += `💰 On-Road: ₹${scooter.price.onRoad.toLocaleString()}\n`;
                        
                        // Show subsidy info if available
                        if (scooter.price.fame2Subsidy || scooter.price.stateSubsidy) {
                            botResponse += `💰 After Subsidies: ₹${scooter.price.effectivePrice.toLocaleString()}\n`;
                        }
                        
                        botResponse += `🔋 Range: ${scooter.range} km\n`;
                        botResponse += `⚡ Charging Time: ${scooter.chargingTime} hours\n`;
                        botResponse += `⚡ Battery: ${scooter.batteryCapacity} kWh\n`;
                        
                        if (scooter.motorPower) {
                            botResponse += `⚙️ Motor: ${scooter.motorPower} W\n`;
                        }
                        
                        botResponse += `🏁 Top Speed: ${scooter.topSpeed} km/h\n`;
                        botResponse += `🌈 Colors: ${scooter.colors.join(', ')}\n\n`;
                        
                        if (scooter.features && scooter.features.length > 0) {
                            botResponse += `*Key Features:*\n`;
                            scooter.features.slice(0, 5).forEach(feature => {
                                botResponse += `- ${feature}\n`;
                            });
                            botResponse += '\n';
                        }
                        
                        // Add booking information if available
                        if (scooter.availability) {
                            botResponse += `*Booking Information:*\n`;
                            if (scooter.availability.bookingAmount) {
                                botResponse += `💰 Booking Amount: ₹${scooter.availability.bookingAmount.toLocaleString()}\n`;
                            }
                            if (scooter.availability.deliveryTime) {
                                botResponse += `⏱️ Delivery Time: ${scooter.availability.deliveryTime}\n`;
                            }
                            botResponse += '\n';
                        }
                        
                        botResponse += `Would you like to check if this scooter is available in your area? Just send me your 6-digit pincode.`;
                        
                        // Update context with brand info
                        context.brand = scooter.brand;
                    } else {
                        // Fallback to chatbot if model info not found
                        const conversationHistory = await getConversationHistory(userId);
                        botResponse = await queryChatGPT(userMessage, conversationHistory);
                    }
                } else {
                    // Default to chatbot for general queries
                    const conversationHistory = await getConversationHistory(userId);
                    botResponse = await queryChatGPT(userMessage, conversationHistory);
                }
            }
            
            await ctx.reply(botResponse, { parse_mode: 'Markdown' });
            await saveConversation(userId, userMessage, botResponse, context);
            
            // If appropriate, offer inline feedback options
            if (intent !== 'greeting' && intent !== 'help') {
                setTimeout(async () => {
                    await ctx.reply('Was this information helpful?', 
                        Markup.inlineKeyboard([
                            Markup.button.callback('👍 Yes', 'feedback_yes'),
                            Markup.button.callback('👎 No', 'feedback_no')
                        ])
                    );
                }, 1000);
            }
        });
        
        // Handle feedback
        bot.action('feedback_yes', async (ctx) => {
            await ctx.answerCbQuery('Thank you for your feedback!');
            await ctx.editMessageText('Thank you for your positive feedback! 😊');
            
            // Save feedback
            const feedback = new Feedback({
                userId: ctx.from.id.toString(),
                messageId: ctx.callbackQuery.message.message_id.toString(),
                rating: 5
            });
            await feedback.save();
        });
        
        bot.action('feedback_no', async (ctx) => {
            await ctx.answerCbQuery('We appreciate your feedback');
            await ctx.editMessageText('I\'m sorry the information wasn\'t helpful. How can I improve my response?');
            
            // Save feedback
            const feedback = new Feedback({
                userId: ctx.from.id.toString(),
                messageId: ctx.callbackQuery.message.message_id.toString(),
                rating: 1
            });
            await feedback.save();
        });
        
        // Location handling
        bot.on('location', async (ctx) => {
            const { latitude, longitude } = ctx.message.location;
            
            // This would require a real geo-lookup service to convert coordinates to pincode
            // For now, just acknowledge
            await ctx.reply('Thank you for sharing your location. To find dealers in your area, please send your 6-digit pincode.');
        });
        
        // Run bot with proper error handling
        async function runBot() {
            try {
                await seedSampleData();
                await seedSubsidyData();
                await seedFAQData();
                
                // Start Express server
                app.listen(PORT, () => {
                    console.log(`Server running on port ${PORT}`);
                });
                
                // Launch bot
                bot.launch();
                console.log('Bot started successfully');
                
                // Enable graceful stop
                process.once('SIGINT', () => bot.stop('SIGINT'));
                process.once('SIGTERM', () => bot.stop('SIGTERM'));
            } catch (error) {
                console.error('Error starting bot:', error);
                process.exit(1);
            }
        }
        
        // Health check endpoint for monitoring
        app.get('/health', (req, res) => {
            res.status(200).json({ status: 'OK', timestamp: new Date() });
        });
        
        // API endpoint to get all scooters
        app.get('/api/scooters', async (req, res) => {
            try {
                const scooters = await Scooter.find().select('-__v');
                res.status(200).json(scooters);
            } catch (error) {
                console.error('Error fetching scooters:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        
        // API endpoint to get scooter by ID
        app.get('/api/scooters/:id', async (req, res) => {
            try {
                const scooter = await Scooter.findById(req.params.id).select('-__v');
                if (!scooter) {
                    return res.status(404).json({ error: 'Scooter not found' });
                }
                res.status(200).json(scooter);
            } catch (error) {
                console.error('Error fetching scooter:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        
        // API endpoint to get dealers by pincode
        app.get('/api/dealers', async (req, res) => {
            try {
                const { pincode } = req.query;
                let query = {};
                
                if (pincode) {
                    query.pincode = pincode;
                }
                
                const dealers = await Dealer.find(query)
                    .populate('availableModels')
                    .select('-__v');
                    
                res.status(200).json(dealers);
            } catch (error) {
                console.error('Error fetching dealers:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        
        // Seed subsidy data
        async function seedSubsidyData() {
            try {
                const subsidyCount = await Subsidy.countDocuments();
                
                if (subsidyCount > 0) {
                    console.log('Subsidy data likely already exists, skipping seed');
                    return;
                }
                
                console.log('Seeding subsidy data...');
                const subsidiesData = [
                    {
                        state: 'Delhi',
                        amount: 30000,
                        eligibility: 'For the first 1000 e-scooters registered in Delhi. Applicable to scooters with advanced batteries.',
                        documentationRequired: ['Purchase Invoice', 'Registration Certificate', 'Aadhar Card', 'Cancelled Cheque'],
                        processingTime: '4-6 weeks after application',
                        additionalInfo: 'Road tax and registration fees waived for electric vehicles.'
                    },
                    {
                        state: 'Maharashtra',
                        amount: 25000,
                        eligibility: 'For all electric two-wheelers with battery capacity over 2 kWh.',
                        documentationRequired: ['Purchase Invoice', 'Registration Certificate', 'Aadhar Card', 'PAN Card'],
                        processingTime: '6-8 weeks after application',
                        additionalInfo: '5% subsidy on base price up to ₹25,000. Road tax exemption available.'
                    },
                    {
                        state: 'Gujarat',
                        amount: 20000,
                        eligibility: 'For electric two-wheelers with battery capacity of at least 1.5 kWh.',
                        documentationRequired: ['Purchase Invoice', 'Registration Certificate', 'Aadhar Card', 'Proof of Residence'],
                        processingTime: '4-5 weeks after application',
                        additionalInfo: 'Registration fee waiver for electric vehicles.'
                    },
                    {
                        state: 'Karnataka',
                        amount: 15000,
                        eligibility: 'For electric two-wheelers with motor power not less than 250W.',
                        documentationRequired: ['Purchase Invoice', 'Registration Certificate', 'Aadhar Card', 'Address Proof'],
                        processingTime: '6-10 weeks after application',
                        additionalInfo: 'Additional 5% exemption on road tax.'
                    },
                    {
                        state: 'Tamil Nadu',
                        amount: 15000,
                        eligibility: 'For all electric two-wheelers with battery capacity over 1.5 kWh.',
                        documentationRequired: ['Purchase Invoice', 'Registration Certificate', 'Aadhar Card', 'PAN Card'],
                        processingTime: '8-10 weeks after application',
                        additionalInfo: '100% road tax exemption until 2023.'
                    }
                ];
                
                await Subsidy.insertMany(subsidiesData);
                console.log('Subsidy data seeded successfully');
            } catch (error) {
                console.error('Error seeding subsidy data:', error);
            }
        }
        
        // Seed FAQ data
       // Continuation from where the code left off

// Complete the FAQ seeding function
async function seedFAQData() {
    try {
        const faqCount = await FAQ.countDocuments();
        
        if (faqCount > 0) {
            console.log('FAQ data likely already exists, skipping seed');
            return;
        }
        
        console.log('Seeding FAQ data...');
        const faqsData = [
            {
                question: 'How long does it take to charge an EV scooter?',
                answer: 'Most EV scooters in India take between 3-6 hours for a full charge using a standard charger. Some models offer fast charging options that can charge up to 80% in 1 hour.',
                category: 'Charging',
                tags: ['charging', 'battery', 'time']
            },
            {
                question: 'What is the average range of EV scooters in India?',
                answer: 'The average range of EV scooters in India is between 70-120 km on a full charge. Premium models like Ola S1 Pro offer up to 180 km range.',
                category: 'Performance',
                tags: ['range', 'battery', 'distance']
            },
            {
                question: 'Are there any government subsidies available for EV scooters?',
                answer: 'Yes, the Indian government offers subsidies under the FAME II scheme, providing up to ₹15,000 for electric two-wheelers. Additionally, many states offer their own subsidies ranging from ₹5,000 to ₹30,000.',
                category: 'Subsidies',
                tags: ['subsidy', 'government', 'FAME II', 'savings']
            },
            {
                question: 'What is the maintenance cost of an EV scooter?',
                answer: 'EV scooters have lower maintenance costs compared to petrol scooters, typically ₹2,000-₹5,000 per year. This includes battery checks, software updates, and minor repairs. No oil changes or engine maintenance are required.',
                category: 'Maintenance',
                tags: ['maintenance', 'cost', 'upkeep']
            },
            {
                question: 'What is the warranty period for EV scooter batteries?',
                answer: 'Most EV scooter batteries come with a warranty of 3-5 years or up to 50,000 km, whichever comes first. Some brands like Ather and Ola offer extended warranties up to 8 years.',
                category: 'Warranty',
                tags: ['warranty', 'battery', 'guarantee']
            }
        ];
        
        await FAQ.insertMany(faqsData);
        console.log('FAQ data seeded successfully');
    } catch (error) {
        console.error('Error seeding FAQ data:', error);
    }
}

// Seed sample scooter and dealer data
async function seedSampleData() {
    try {
        const scooterCount = await Scooter.countDocuments();
        const dealerCount = await Dealer.countDocuments();
        
        if (scooterCount > 0 || dealerCount > 0) {
            console.log('Sample data likely already exists, skipping seed');
            return;
        }
        
        console.log('Seeding sample data...');
        
        // Sample scooters
        const scootersData = [
            {
                model: 'S1 Pro',
                brand: 'Ola Electric',
                price: {
                    base: 129999,
                    onRoad: 139999,
                    fame2Subsidy: 15000,
                    stateSubsidy: 10000
                },
                range: 180,
                chargingTime: 6.5,
                topSpeed: 120,
                batteryCapacity: 4,
                motorPower: 8500,
                features: ['Touchscreen Display', 'Fast Charging', 'Geo-fencing', 'Mobile App'],
                colors: ['Midnight Blue', 'Porcelain White', 'Neon'],
                imageUrl: 'https://example.com/ola-s1-pro.jpg',
                description: 'The Ola S1 Pro is a premium electric scooter with advanced features and impressive range.',
                specifications: {
                    weight: 125,
                    loadCapacity: 150,
                    groundClearance: 165,
                    tyreType: 'Tubeless',
                    brakeSystem: 'Disc',
                    suspension: 'Telescopic Front, Mono Rear',
                    batteryType: 'Lithium-ion',
                    batteryWarranty: '3 years',
                    motorWarranty: '3 years',
                    vehicleWarranty: '3 years'
                },
                availability: {
                    deliveryTime: '2-4 weeks',
                    bookingAmount: 499
                },
                additionalInfo: {
                    pmssCertified: true,
                    portableCharger: true,
                    mobileApp: true,
                    geoFencing: true,
                    antitheft: true
                }
            },
            {
                model: '450X',
                brand: 'Ather Energy',
                price: {
                    base: 142500,
                    onRoad: 152500,
                    fame2Subsidy: 15000,
                    stateSubsidy: 7500
                },
                range: 150,
                chargingTime: 5.5,
                topSpeed: 90,
                batteryCapacity: 3.7,
                motorPower: 6000,
                features: ['Touchscreen Dashboard', 'OTA Updates', 'Park Assist', 'Fast Charging'],
                colors: ['Space Grey', 'Lunar White', 'Cosmic Black'],
                imageUrl: 'https://example.com/ather-450x.jpg',
                description: 'Ather 450X offers a perfect blend of performance and smart features.',
                specifications: {
                    weight: 108,
                    loadCapacity: 140,
                    groundClearance: 170,
                    tyreType: 'Tubeless',
                    brakeSystem: 'Disc',
                    suspension: 'Telescopic Front, Mono Rear',
                    batteryType: 'Lithium-ion',
                    batteryWarranty: '3 years',
                    motorWarranty: '3 years',
                    vehicleWarranty: '3 years'
                },
                availability: {
                    deliveryTime: '3-5 weeks',
                    bookingAmount: 999
                },
                additionalInfo: {
                    pmssCertified: true,
                    portableCharger: true,
                    mobileApp: true,
                    geoFencing: true,
                    antitheft: true
                }
            },
            {
                model: 'iQube Electric',
                brand: 'TVS',
                price: {
                    base: 115000,
                    onRoad: 125000,
                    fame2Subsidy: 15000,
                    stateSubsidy: 5000
                },
                range: 100,
                chargingTime: 5,
                topSpeed: 78,
                batteryCapacity: 3.4,
                motorPower: 4400,
                features: ['Smart Connect', 'LED Headlamp', 'Geo-fencing'],
                colors: ['Pearl White', 'Mercury Grey', 'Starlight Blue'],
                imageUrl: 'https://example.com/tvs-iqube.jpg',
                description: 'TVS iQube is a reliable and efficient electric scooter for urban commuting.',
                specifications: {
                    weight: 118,
                    loadCapacity: 130,
                    groundClearance: 157,
                    tyreType: 'Tubeless',
                    brakeSystem: 'Drum',
                    suspension: 'Telescopic Front, Hydraulic Rear',
                    batteryType: 'Lithium-ion',
                    batteryWarranty: '3 years',
                    motorWarranty: '3 years',
                    vehicleWarranty: '3 years'
                },
                availability: {
                    deliveryTime: '2-3 weeks',
                    bookingAmount: 500
                },
                additionalInfo: {
                    pmssCertified: true,
                    portableCharger: false,
                    mobileApp: true,
                    geoFencing: true,
                    antitheft: false
                }
            },
            {
                model: 'Chetak Electric',
                brand: 'Bajaj',
                price: {
                    base: 115000,
                    onRoad: 125000,
                    fame2Subsidy: 15000,
                    stateSubsidy: 5000
                },
                range: 95,
                chargingTime: 5,
                topSpeed: 70,
                batteryCapacity: 3,
                motorPower: 4000,
                features: ['Retro Design', 'LED Lighting', 'Keyless Ignition'],
                colors: ['Indigo Metallic', 'Brooklyn Black', 'Hazelnut'],
                imageUrl: 'https://example.com/bajaj-chetak.jpg',
                description: 'Bajaj Chetak Electric combines classic design with modern electric performance.',
                specifications: {
                    weight: 120,
                    loadCapacity: 140,
                    groundClearance: 160,
                    tyreType: 'Tubeless',
                    brakeSystem: 'Drum',
                    suspension: 'Single-sided Front, Mono Rear',
                    batteryType: 'Lithium-ion',
                    batteryWarranty: '3 years',
                    motorWarranty: '3 years',
                    vehicleWarranty: '3 years'
                },
                availability: {
                    deliveryTime: '3-4 weeks',
                    bookingAmount: 1000
                },
                additionalInfo: {
                    pmssCertified: true,
                    portableCharger: false,
                    mobileApp: true,
                    geoFencing: false,
                    antitheft: true
                }
            }
        ];
        
        const insertedScooters = await Scooter.insertMany(scootersData);
        
        // Sample dealers
        const dealersData = [
            {
                name: 'Green Mobility Hub',
                address: '123 MG Road, Andheri',
                pincode: '400053',
                city: 'Mumbai',
                state: 'Maharashtra',
                contact: '+91-9876543210',
                email: 'contact@greenmobility.com',
                availableModels: insertedScooters.map(s => s._id),
                operatingHours: '10:00 AM - 7:00 PM',
                coordinates: {
                    latitude: 19.1197,
                    longitude: 72.8464
                },
                servicesOffered: ['Sales', 'Service', 'Charging', 'Test Ride'],
                testRideAvailable: true,
                amenities: ['Waiting Area', 'Refreshments']
            },
            {
                name: 'EcoRide Solutions',
                address: '456 Connaught Place',
                pincode: '110001',
                city: 'New Delhi',
                state: 'Delhi',
                contact: '+91-9123456789',
                email: 'info@ecoride.com',
                availableModels: insertedScooters.slice(0, 2).map(s => s._id), // Only Ola and Ather
                operatingHours: '9:30 AM - 6:30 PM',
                coordinates: {
                    latitude: 28.6328,
                    longitude: 77.2167
                },
                servicesOffered: ['Sales', 'Service', 'Test Ride'],
                testRideAvailable: true,
                amenities: ['Waiting Area']
            },
            {
                name: 'EV World Bengaluru',
                address: '789 Koramangala 5th Block',
                pincode: '560034',
                city: 'Bengaluru',
                state: 'Karnataka',
                contact: '+91-9988776655',
                email: 'support@evworld.com',
                availableModels: insertedScooters.slice(1).map(s => s._id), // Ather, TVS, Bajaj
                operatingHours: '10:00 AM - 8:00 PM',
                coordinates: {
                    latitude: 12.9345,
                    longitude: 77.6221
                },
                servicesOffered: ['Sales', 'Service', 'Charging'],
                testRideAvailable: false,
                amenities: ['Refreshments', 'Charging Station']
            }
        ];
        
        await Dealer.insertMany(dealersData);
        console.log('Sample data seeded successfully');
    } catch (error) {
        console.error('Error seeding sample data:', error);
    }
}

// Additional Bot Features

// Handle FAQs
bot.hears(/❓ FAQs/, async (ctx) => {
    try {
        const faqs = await FAQ.find().sort({ category: 1 });
        
        if (faqs.length === 0) {
            await ctx.reply("Sorry, no FAQs are available at the moment.");
            return;
        }
        
        let message = "*Frequently Asked Questions about EV Scooters* 🛵\n\n";
        let currentCategory = '';
        
        faqs.forEach((faq, index) => {
            if (faq.category !== currentCategory) {
                currentCategory = faq.category;
                message += `*${currentCategory}*\n`;
            }
            message += `${index + 1}. *${faq.question}*\n`;
            message += `${faq.answer}\n\n`;
        });
        
        message += "Have more questions? Just ask me! 😊";
        await ctx.reply(message, { parse_mode: 'Markdown' });
        await saveConversation(ctx.from.id.toString(), '❓ FAQs', message);
    } catch (error) {
        console.error('Error fetching FAQs:', error);
        await ctx.reply("Sorry, I encountered an error while fetching FAQs.");
    }
});

// Handle inline queries for quick model searches
bot.on('inline_query', async (ctx) => {
    const query = ctx.inlineQuery.query.trim();
    if (!query) {
        return;
    }
    
    try {
        const regex = new RegExp(query, 'i');
        const scooters = await Scooter.find({
            $or: [
                { model: regex },
                { brand: regex }
            ]
        }).limit(5);
        
        const results = scooters.map((scooter, index) => ({
            type: 'article',
            id: String(index),
            title: `${scooter.brand} ${scooter.model}`,
            description: `₹${scooter.price.onRoad.toLocaleString()} | ${scooter.range} km range`,
            thumbnail_url: scooter.imageUrl || undefined,
            input_message_content: {
                message_text: `*${scooter.brand} ${scooter.model}*\n\n` +
                    `💰 Price: ₹${scooter.price.onRoad.toLocaleString()}\n` +
                    `🔋 Range: ${scooter.range} km\n` +
                    `⚡ Charging: ${scooter.chargingTime} hours\n` +
                    `🏁 Top Speed: ${scooter.topSpeed} km/h\n\n` +
                    `Ask for more details or check availability by pincode!`,
                parse_mode: 'Markdown'
            }
        }));
        
        await ctx.answerInlineQuery(results);
    } catch (error) {
        console.error('Error handling inline query:', error);
    }
});

// Handle callback queries for additional interactions
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    
    if (data.startsWith('scooter_')) {
        const scooterId = data.replace('scooter_', '');
        try {
            const scooter = await Scooter.findById(scooterId);
            if (!scooter) {
                await ctx.answerCbQuery('Scooter not found.');
                return;
            }
            
            const message = `🛵 *${scooter.brand} ${scooter.model}*\n\n` +
                `💰 Ex-Showroom: ₹${scooter.price.base.toLocaleString()}\n` +
                `💰 On-Road: ₹${scooter.price.onRoad.toLocaleString()}\n` +
                `💰 After Subsidies: ₹${(scooter.price.onRoad - (scooter.price.fame2Subsidy + scooter.price.stateSubsidy)).toLocaleString()}\n` +
                `🔋 Range: ${scooter.range} km\n` +
                `⚡ Charging Time: ${scooter.chargingTime} hours\n` +
                `⚙️ Motor: ${scooter.motorPower} W\n` +
                `🏁 Top Speed: ${scooter.topSpeed} km/h\n` +
                `🌈 Colors: ${scooter.colors.join(', ')}\n\n` +
                `*Key Features:*\n${scooter.features.slice(0, 5).map(f => `- ${f}`).join('\n')}\n\n` +
                `Want to check availability? Send your pincode!`;
                
            await ctx.reply(message, { parse_mode: 'Markdown' });
            await saveConversation(ctx.from.id.toString(), `callback_scooter_${scooterId}`, message);
            await ctx.answerCbQuery();
        } catch (error) {
            console.error('Error handling scooter callback:', error);
            await ctx.answerCbQuery('Error retrieving scooter details.');
        }
    }
});

// Error handling middleware for Express
app.use((err, req, res, next) => {
    console.error('Express error:', err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Global error handling for bot
bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);
    try {
        ctx.reply('Oops, something went wrong! Please try again later. 😓');
    } catch (e) {
        console.error('Error sending error message:', e);
    }
});

// Start the bot
runBot().catch(error => {
    console.error('Failed to start bot:', error);
    process.exit(1);
});

// Export the app for testing or serverless deployment
module.exports = app;
    });