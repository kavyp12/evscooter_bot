// require('dotenv').config();
// const express = require('express');
// const { Telegraf, Markup } = require('telegraf');
// const axios = require('axios');
// const mongoose = require('mongoose');
// const { session } = require('telegraf-session-mongoose');

// // Initialize Express app
// const app = express();
// app.use(express.json());

// // Configure environment variables
// const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// const PORT = process.env.PORT || 3000;
// const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ev-chatbot';
// const ADMIN_USER_ID = process.env.ADMIN_USER_ID; // Optional: Admin user ID for restricted commands

// // --- Mongoose Connection Options ---
// const mongooseOptions = {
//     serverSelectionTimeoutMS: 30000,
//     socketTimeoutMS: 45000,
//     family: 4
// };

// // --- Define Mongoose Schemas and Models ---
// const scooterSchema = new mongoose.Schema({
//     model: { type: String, required: true, unique: true, index: true },
//     brand: { type: String, required: true, index: true },
//     price: {
//         base: { type: Number, required: true },
//         onRoad: { type: Number, required: true }
//     },
//     range: { type: Number, required: true },
//     chargingTime: { type: Number, required: true },
//     topSpeed: { type: Number, required: true },
//     batteryCapacity: { type: Number, required: true },
//     features: [String],
//     colors: [String],
//     imageUrl: String,
//     description: String
// });

// const dealerSchema = new mongoose.Schema({
//     name: { type: String, required: true },
//     address: { type: String, required: true },
//     pincode: { type: String, required: true, index: true },
//     city: { type: String, required: true },
//     state: { type: String, required: true },
//     contact: { type: String, required: true },
//     email: String,
//     availableModels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Scooter' }],
//     operatingHours: String,
//     coordinates: {
//         latitude: Number,
//         longitude: Number
//     }
// });

// const conversationSchema = new mongoose.Schema({
//     userId: { type: String, required: true, unique: true, index: true },
//     telegramChatId: { type: Number, required: true },
//     userDetails: {
//         id: { type: Number, required: true },
//         is_bot: { type: Boolean, default: false },
//         first_name: { type: String },
//         language_code: { type: String }
//     },
//     conversations: [{
//         update_id: { type: Number },
//         message_id: { type: Number, required: true },
//         chat: {
//             id: { type: Number, required: true },
//             first_name: { type: String },
//             type: { type: String, default: 'private' }
//         },
//         date: { type: Number, required: true },
//         userMessage: { type: String, required: true },
//         botMessage: { type: String, required: true },
//         timestamp: { type: Date, default: Date.now }
//     }],
//     lastInteraction: { type: Date, default: Date.now }
// });

// const Scooter = mongoose.model('Scooter', scooterSchema);
// const Dealer = mongoose.model('Dealer', dealerSchema);
// const Conversation = mongoose.model('Conversation', conversationSchema);
// // --- End of Schemas and Models ---

// // --- Mongoose Connection Event Listeners ---
// mongoose.connection.on('connected', () => {
//     console.log('Mongoose connected to DB.');
// });

// mongoose.connection.on('error', (err) => {
//     console.error('Mongoose connection error:', err);
// });

// mongoose.connection.on('disconnected', () => {
//     console.log('Mongoose disconnected from DB.');
// });

// mongoose.connection.on('reconnected', () => {
//     console.log('Mongoose reconnected to DB.');
// });

// process.on('SIGINT', async () => {
//     console.log('SIGINT received. Closing Mongoose connection...');
//     await mongoose.connection.close();
//     console.log('Mongoose connection closed due to app termination.');
//     process.exit(0);
// });
// // --- End of Mongoose Connection Event Listeners ---

// // Initialize bot instance
// const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// // --- Helper Functions ---
// async function queryChatGPT(prompt, conversationHistory = []) {
//     try {
//         const messages = [
//             {
//                 role: 'system',
//                 content: `You are EV India Bot, an expert AI assistant for electric scooters in India.
//                 Your goal is to provide accurate, concise, and helpful information about EV scooters available in the Indian market.
//                 If a user asks to compare scooters, try to provide a structured comparison.
//                 If you don't know something, say so clearly.
//                 When relevant, gently remind users they can check for scooter availability by providing their 6-digit pincode.
//                 Be friendly and professional.`
//             },
//             ...conversationHistory,
//             { role: 'user', content: prompt }
//         ];

//         const response = await axios.post(
//             'https://api.openai.com/v1/chat/completions',
//             {
//                 model: 'gpt-4',
//                 messages: messages,
//                 temperature: 0.7,
//                 max_tokens: 500
//             },
//             {
//                 headers: {
//                     'Authorization': `Bearer ${OPENAI_API_KEY}`,
//                     'Content-Type': 'application/json'
//                 }
//             }
//         );
//         return response.data.choices[0].message.content.trim();
//     } catch (error) {
//         console.error('Error querying ChatGPT:', error.response?.data || error.message);
//         return 'Sorry, I encountered a problem trying to understand that. Could you please rephrase or try again later?';
//     }
// }

// async function saveConversation(ctx, userMessage, botMessage) {
//     if (!ctx.from || !ctx.from.id || !ctx.message) {
//         console.error('Cannot save conversation: Missing ctx.from.id or ctx.message');
//         return;
//     }

//     const userId = ctx.from.id.toString();
//     const telegramChatId = ctx.chat.id;
//     const updateId = ctx.update?.update_id;
//     const messageId = ctx.message.message_id;
//     const chat = {
//         id: ctx.chat.id,
//         first_name: ctx.chat.first_name || ctx.from.first_name,
//         type: ctx.chat.type || 'private'
//     };
//     const date = ctx.message.date;

//     const userDetails = {
//         id: ctx.from.id,
//         is_bot: ctx.from.is_bot || false,
//         first_name: ctx.from.first_name,
//         language_code: ctx.from.language_code
//     };

//     try {
//         await Conversation.findOneAndUpdate(
//             { userId: userId },
//             {
//                 $set: {
//                     telegramChatId: telegramChatId,
//                     userDetails: userDetails,
//                     lastInteraction: new Date()
//                 },
//                 $push: {
//                     conversations: {
//                         update_id: updateId,
//                         message_id: messageId,
//                         chat: chat,
//                         date: date,
//                         userMessage: userMessage,
//                         botMessage: botMessage,
//                         timestamp: new Date()
//                     }
//                 }
//             },
//             { upsert: true, new: true }
//         );
//     } catch (error) {
//         console.error('Error saving conversation to custom collection:', error);
//     }
// }

// async function getConversationHistory(userId) {
//     try {
//         const record = await Conversation.findOne({ userId });
//         if (!record || !record.conversations) return [];
//         const recentConversations = record.conversations.slice(-10);
//         return recentConversations.map(conv => [
//             { role: 'user', content: conv.userMessage },
//             { role: 'assistant', content: conv.botMessage }
//         ]).flat();
//     } catch (error) {
//         console.error('Error getting conversation history:', error);
//         return [];
//     }
// }

// async function checkAvailabilityByPincode(pincode) {
//     try {
//         const dealers = await Dealer.find({ pincode }).populate('availableModels');
//         if (dealers.length === 0) {
//             return { available: false, message: `Sorry, we don't have any dealers listed in pincode ${pincode} at the moment. You can try a nearby pincode.` };
//         }
//         const availableScootersSet = new Set();
//         const dealerInfo = [];
//         dealers.forEach(dealer => {
//             dealer.availableModels.forEach(model => {
//                 if (model && model.model) {
//                     availableScootersSet.add(model.model);
//                 }
//             });
//             dealerInfo.push({
//                 name: dealer.name,
//                 address: dealer.address,
//                 contact: dealer.contact,
//                 models: dealer.availableModels.map(m => m && m.model ? m.model : 'N/A').join(', ')
//             });
//         });
//         return {
//             available: true,
//             scooters: Array.from(availableScootersSet),
//             dealers: dealerInfo,
//             message: `Great news! We found ${dealers.length} dealer(s) in pincode ${pincode} with the following EV scooter model(s) potentially available: ${Array.from(availableScootersSet).join(', ')}.`
//         };
//     } catch (error) {
//         console.error('Error checking availability by pincode:', error);
//         return { available: false, message: 'Oops! Something went wrong while checking for availability. Please try again.' };
//     }
// }

// async function getScooterInfo(modelName) {
//     try {
//         const scooter = await Scooter.findOne({ model: { $regex: new RegExp(`^${modelName}$`, 'i') } });

//         if (!scooter) {
//             const similarScooters = await Scooter.find({ model: { $regex: modelName, $options: 'i' } }).limit(1);

//             if (similarScooters.length === 0) {
//                 return { found: false, message: `Sorry, I couldn't find specific information for an EV scooter named "${modelName}". You can ask me to list available models.` };
//             }
//             const aSimilarScooter = similarScooters[0];
//             let suggestionMessage = `I couldn't find an exact match for "${modelName}". Did you perhaps mean "${aSimilarScooter.brand} ${aSimilarScooter.model}"? \n\nIf so, here's some information:\n\n`;

//             let responseText = `*${aSimilarScooter.brand} ${aSimilarScooter.model}*\n\n`;
//             responseText += `*Price (Ex-showroom):* ₹${aSimilarScooter.price.base.toLocaleString('en-IN')}\n`;
//             responseText += `*Price (On-Road, approx.):* ₹${aSimilarScooter.price.onRoad.toLocaleString('en-IN')}\n`;
//             responseText += `*Range (claimed):* ${aSimilarScooter.range} km\n`;
//             responseText += `*Battery Capacity:* ${aSimilarScooter.batteryCapacity} kWh\n`;
//             responseText += `*Charging Time:* ${aSimilarScooter.chargingTime} hours\n`;
//             responseText += `*Top Speed:* ${aSimilarScooter.topSpeed} km/h\n`;
//             if (aSimilarScooter.colors && aSimilarScooter.colors.length > 0) {
//                 responseText += `*Available Colors:* ${aSimilarScooter.colors.join(', ')}\n`;
//             }
//             if (aSimilarScooter.features && aSimilarScooter.features.length > 0) {
//                 responseText += `\n*Key Features:*\n`;
//                 aSimilarScooter.features.forEach(feature => { responseText += `- ${feature}\n`; });
//             }
//             if (aSimilarScooter.description) {
//                 responseText += `\n*Description:* ${aSimilarScooter.description}\n`;
//             }
//             responseText += `\nWould you like to check its availability? Just send your 6-digit pincode.`;

//             return {
//                 found: true,
//                 message: suggestionMessage + responseText,
//                 scooter: aSimilarScooter
//             };
//         }

//         let responseText = `*${scooter.brand} ${scooter.model}*\n\n`;
//         responseText += `*Price (Ex-showroom):* ₹${scooter.price.base.toLocaleString('en-IN')}\n`;
//         responseText += `*Price (On-Road, approx.):* ₹${scooter.price.onRoad.toLocaleString('en-IN')}\n`;
//         responseText += `*Range (claimed):* ${scooter.range} km\n`;
//         responseText += `*Battery Capacity:* ${scooter.batteryCapacity} kWh\n`;
//         responseText += `*Charging Time:* ${scooter.chargingTime} hours\n`;
//         responseText += `*Top Speed:* ${scooter.topSpeed} km/h\n`;
//         if (scooter.colors && scooter.colors.length > 0) {
//             responseText += `*Available Colors:* ${scooter.colors.join(', ')}\n`;
//         }
//         if (scooter.features && scooter.features.length > 0) {
//             responseText += `\n*Key Features:*\n`;
//             scooter.features.forEach(feature => { responseText += `- ${feature}\n`; });
//         }
//         if (scooter.description) {
//             responseText += `\n*Description:* ${scooter.description}\n`;
//         }
//         responseText += `\nWould you like to check its availability? Just send your 6-digit pincode.`;

//         return {
//             found: true,
//             message: responseText,
//             scooter: scooter
//         };
//     } catch (error) {
//         console.error('Error fetching scooter info:', error);
//         return { found: false, message: 'An error occurred while fetching scooter details. Please try again.' };
//     }
// }

// async function getComparisonInfo(modelName1, modelName2) {
//     try {
//         const [scooter1Result, scooter2Result] = await Promise.all([
//             getScooterInfo(modelName1),
//             getScooterInfo(modelName2)
//         ]);

//         if (!scooter1Result.found && !scooter2Result.found) {
//             return `I couldn't find information for either "${modelName1}" or "${modelName2}". Please check the spellings or try different models.`;
//         }
//         if (!scooter1Result.found) {
//             return `I couldn't find information for "${modelName1}". I can tell you about "${modelName2}" if you'd like, or you can try checking the spelling for the first model.`;
//         }
//         if (!scooter2Result.found) {
//             return `I couldn't find information for "${modelName2}". I can tell you about "${modelName1}" if you'd like, or you can try checking the spelling for the second model.`;
//         }

//         const s1 = scooter1Result.scooter;
//         const s2 = scooter2Result.scooter;

//         let comparisonText = `*Comparison: ${s1.brand} ${s1.model} vs ${s2.brand} ${s2.model}*\n\n`;
//         comparisonText += `| Metric                 | ${s1.model.padEnd(20)} | ${s2.model.padEnd(20)} |\n`;
//         comparisonText += `|------------------------|-----------------------|-----------------------|\n`;
//         comparisonText += `| Brand                  | ${s1.brand.padEnd(20)} | ${s2.brand.padEnd(20)} |\n`;
//         comparisonText += `| Ex-Showroom Price      | ₹${s1.price.base.toLocaleString('en-IN').padEnd(18)} | ₹${s2.price.base.toLocaleString('en-IN').padEnd(18)} |\n`;
//         comparisonText += `| On-Road Price (approx) | ₹${s1.price.onRoad.toLocaleString('en-IN').padEnd(18)} | ₹${s2.price.onRoad.toLocaleString('en-IN').padEnd(18)} |\n`;
//         comparisonText += `| Range (claimed)        | ${`${s1.range} km`.padEnd(20)} | ${`${s2.range} km`.padEnd(20)} |\n`;
//         comparisonText += `| Battery Capacity       | ${`${s1.batteryCapacity} kWh`.padEnd(20)} | ${`${s2.batteryCapacity} kWh`.padEnd(20)} |\n`;
//         comparisonText += `| Charging Time          | ${`${s1.chargingTime} hrs`.padEnd(20)} | ${`${s2.chargingTime} hrs`.padEnd(20)} |\n`;
//         comparisonText += `| Top Speed              | ${`${s1.topSpeed} km/h`.padEnd(20)} | ${`${s2.topSpeed} km/h`.padEnd(20)} |\n`;

//         comparisonText += `\n*Features for ${s1.model}:*\n- ${s1.features.join('\n- ') || 'Not listed'}\n`;
//         comparisonText += `\n*Features for ${s2.model}:*\n- ${s2.features.join('\n- ') || 'Not listed'}\n`;
//         comparisonText += `\nWould you like to check availability for either of these in your area? Send your 6-digit pincode.`;
//         return comparisonText;
//     } catch (error) {
//         console.error('Error comparing scooters:', error);
//         return "Sorry, an error occurred while trying to compare the scooters.";
//     }
// }

// function extractPincode(message) {
//     const pincodeRegex = /\b\d{6}\b/;
//     const match = message.match(pincodeRegex);
//     return match ? match[0] : null;
// }

// async function extractPotentialModels(message) {
//     try {
//         const allScooters = await Scooter.find({}, 'model brand').lean();
//         const models = [];
//         const lowerMessage = message.toLowerCase();

//         for (const scooter of allScooters) {
//             if (lowerMessage.includes(scooter.model.toLowerCase()) ||
//                 (scooter.brand && lowerMessage.includes(scooter.brand.toLowerCase() + " " + scooter.model.toLowerCase()))) {
//                 models.push(scooter.model);
//             }
//         }
//         return [...new Set(models)];
//     } catch (dbError) {
//         console.error("DB Error in extractPotentialModels:", dbError);
//         return [];
//     }
// }

// // --- End of Helper Functions ---

// // --- Bot Commands and Handlers ---
// bot.start(async (ctx) => {
//     const welcomeMessage = `Namaste! 🙏 Welcome to EV India Bot! 🇮🇳

// I'm your friendly assistant for all things electric scooters in India. I can help you with:
// 🛵 Information about EV scooter models (specs, price, features)
// 📍 Check availability in your area (just share your 6-digit pincode)
// ⚖️ Compare different EV scooter models
// �慎 Answer your general questions about Indian EVs

// Type /help to see a list of example commands.

// How can I assist you today?`;
//     try {
//         await ctx.reply(welcomeMessage, Markup.keyboard([
//             ['Compare Scooters', 'Find Scooters by Pincode'],
//             ['/help']
//         ]).resize().oneTime());
//         await saveConversation(ctx, '/start', welcomeMessage);
//     } catch (e) {
//         console.error("Error in /start handler:", e);
//         await ctx.reply("Sorry, there was an issue starting our conversation. Please try again.");
//     }
// });

// bot.help(async (ctx) => {
//     const helpMessage = `Here's how I can help:

// *General Info:*
//   "Tell me about Ola S1 Pro"
//   "What are the features of Ather 450X?"

// *Check Availability:*
//   "Show scooters in 400001"
//   "Availability in pincode 110001"
//   (Or just send a 6-digit pincode)

// *Compare Scooters:*
//   "Compare Ola S1 Pro and Ather 450X"
//   "TVS iQube S vs Bajaj Chetak Premium"

// *Pricing:*
//   "What's the price of TVS iQube S?"
//   "Ola S1 Pro on road price"

// *Specifics:*
//   "Range of Bajaj Chetak Premium"
//   "Charging time for Ather 450X"

// Just type your question! If I can't find specific data, I'll try to answer with my general EV knowledge.`;
//     try {
//         await ctx.replyWithMarkdown(helpMessage);
//         await saveConversation(ctx, '/help', helpMessage);
//     } catch (e) {
//         console.error("Error in /help handler:", e);
//         await ctx.reply("Sorry, couldn't fetch help information right now.");
//     }
// });

// bot.command('getinteractions', async (ctx) => {
//     const userId = ctx.from.id.toString();
//     try {
//         // Optional: Restrict to admin user
//         if (ADMIN_USER_ID && userId !== ADMIN_USER_ID) {
//             await ctx.reply("Sorry, this command is restricted to administrators.");
//             return;
//         }

//         const record = await Conversation.findOne({ userId });
//         if (!record || !record.conversations || record.conversations.length === 0) {
//             await ctx.reply("No interaction history found for you.");
//             return;
//         }

//         // Limit to last 10 interactions for brevity
//         const recentInteractions = record.conversations.slice(-10);
//         let responseText = `*Your Recent Interactions (Last ${recentInteractions.length}):*\n\n`;
//         responseText += `**User Details:**\n`;
//         responseText += `- ID: ${record.userDetails.id}\n`;
//         responseText += `- Name: ${record.userDetails.first_name || 'N/A'}\n`;
//         responseText += `- Is Bot: ${record.userDetails.is_bot ? 'Yes' : 'No'}\n`;
//         responseText += `- Language: ${record.userDetails.language_code || 'N/A'}\n\n`;

//         recentInteractions.forEach((interaction, index) => {
//             responseText += `**Interaction ${index + 1}:**\n`;
//             responseText += `- Update ID: ${interaction.update_id || 'N/A'}\n`;
//             responseText += `- Message ID: ${interaction.message_id}\n`;
//             responseText += `- Chat ID: ${interaction.chat.id}\n`;
//             responseText += `- Chat Type: ${interaction.chat.type}\n`;
//             responseText += `- Date: ${new Date(interaction.date * 1000).toLocaleString()}\n`;
//             responseText += `- User Message: ${interaction.userMessage}\n`;
//             responseText += `- Bot Response: ${interaction.botMessage}\n\n`;
//         });

//         await ctx.replyWithMarkdown(responseText);
//         await saveConversation(ctx, '/getinteractions', responseText);
//     } catch (error) {
//         console.error('Error fetching interactions:', error);
//         await ctx.reply("Sorry, I encountered an error while fetching your interaction history.");
//     }
// });

// bot.on('text', async (ctx) => {
//     const userId = ctx.from.id.toString();
//     const userMessage = ctx.message.text.trim();
//     let botResponse = "I'm sorry, I'm having a little trouble understanding that right now. Could you try rephrasing?";

//     try {
//         await ctx.telegram.sendChatAction(ctx.chat.id, 'typing');

//         const pincode = extractPincode(userMessage);
//         const comparisonRegex = /compare ([\w\s.-]+) and ([\w\s.-]+)/i;
//         const comparisonMatch = userMessage.match(comparisonRegex);

//         if (pincode) {
//             const availabilityResult = await checkAvailabilityByPincode(pincode);
//             if (availabilityResult.available) {
//                 botResponse = `${availabilityResult.message}\n\n*Dealer(s) Found:*\n`;
//                 availabilityResult.dealers.forEach((dealer, index) => {
//                     botResponse += `\n*${index + 1}. ${dealer.name}*\n`;
//                     botResponse += `   Address: ${dealer.address}\n`;
//                     botResponse += `   Contact: ${dealer.contact || 'N/A'}\n`;
//                     botResponse += `   Models (reported): ${dealer.models || 'N/A'}\n`;
//                 });
//                 botResponse += "\n\nWould you like specific information about any of these scooters or brands?";
//             } else {
//                 botResponse = availabilityResult.message;
//             }
//         } else if (comparisonMatch) {
//             const model1 = comparisonMatch[1].trim();
//             const model2 = comparisonMatch[2].trim();
//             botResponse = await getComparisonInfo(model1, model2);
//         } else {
//             const potentialModels = await extractPotentialModels(userMessage);
//             if (potentialModels.length === 1) {
//                 const scooterInfo = await getScooterInfo(potentialModels[0]);
//                 botResponse = scooterInfo.message;
//             } else if (potentialModels.length > 1) {
//                 const conversationHistory = await getConversationHistory(userId);
//                 botResponse = await queryChatGPT(userMessage, conversationHistory);
//             } else {
//                 const conversationHistory = await getConversationHistory(userId);
//                 botResponse = await queryChatGPT(userMessage, conversationHistory);
//             }
//         }
//         await ctx.replyWithMarkdown(botResponse);
//         await saveConversation(ctx, userMessage, botResponse);
//     } catch (error) {
//         console.error(`Error processing text message: "${userMessage}" from user ${userId}:`, error);
//         if (error.name === 'MongooseError' && error.message.includes('buffering timed out')) {
//             await ctx.reply("I'm having trouble connecting to my database right now. Please try again in a few moments.");
//         } else {
//             await ctx.reply("I'm sorry, I ran into a little trouble processing that. Could you try rephrasing or ask something else?");
//         }
//         await saveConversation(ctx, userMessage, "Error response: Bot encountered an internal error.");
//     }
// });
// // --- End of Bot Commands and Handlers ---

// // --- Sample Data Seeding ---
// async function seedSampleData() {
//     try {
//         const scootersCount = await Scooter.countDocuments();
//         if (scootersCount > 0) {
//             console.log('Sample scooter data likely already exists, skipping seed.');
//             const dealersCount = await Dealer.countDocuments();
//             if (dealersCount === 0) {
//                 console.log('Scooters exist, but dealers are missing. Seeding dealers...');
//             } else {
//                 return;
//             }
//         }

//         console.log('Seeding sample data...');
//         await Scooter.deleteMany({});
//         await Dealer.deleteMany({});

//         const scootersData = [
//             { model: 'S1 Pro', brand: 'Ola Electric', price: { base: 129999, onRoad: 145000 }, range: 181, chargingTime: 6.5, topSpeed: 116, batteryCapacity: 4, features: ['Digital Console', 'Reverse Mode', 'Fast Charging', 'Bluetooth', 'GPS', 'Anti-theft alarm', 'Hill Hold'], colors: ['Jet Black', 'Porcelain White', 'Neo Mint', 'Coral Glam', 'Liquid Silver'], imageUrl: 'https://example.com/ola_s1_pro.jpg', description: 'The Ola S1 Pro is a flagship electric scooter known for its performance, range, and smart features.' },
//             { model: '450X', brand: 'Ather', price: { base: 138000, onRoad: 160000 }, range: 111, chargingTime: 5.7, topSpeed: 90, batteryCapacity: 3.7, features: ['Touchscreen Dashboard', 'OTA Updates', 'Navigation', 'Riding Modes', 'Reverse Assist', 'Auto Indicator Off'], colors: ['Space Grey', 'Mint Green', 'True Red', 'Cosmic Black'], imageUrl: 'https://example.com/ather_450x.jpg', description: 'The Ather 450X is a premium smart electric scooter offering a thrilling ride and connected features. Range is certified, real-world may vary.' },
//             { model: 'iQube S', brand: 'TVS', price: { base: 120000, onRoad: 135000 }, range: 100, chargingTime: 4.5, topSpeed: 78, batteryCapacity: 3.04, features: ['SmartXonnect', 'Geo-fencing', 'Anti-theft Alert', 'Q-Park Assist', 'USB Charging'], colors: ['Titanium Grey Matte', 'Starlight Blue Glossy', 'Mint Blue'], imageUrl: 'https://example.com/tvs_iqube_s.jpg', description: 'The TVS iQube S is a reliable electric scooter with practical features for urban commuting.' },
//             { model: 'Chetak Premium', brand: 'Bajaj', price: { base: 145000, onRoad: 158000 }, range: 90, chargingTime: 5, topSpeed: 63, batteryCapacity: 2.88, features: ['Metal Body', 'Keyless Start', 'IP67 Rating', 'Sequential Blinkers', 'Digital Console'], colors: ['Hazelnut', 'Brooklyn Black', 'Velluto Rosso', 'Indigo Metallic'], imageUrl: 'https://example.com/bajaj_chetak_premium.jpg', description: 'The Bajaj Chetak electric revives a classic name with modern electric technology and premium build quality.' },
//             { model: 'Vida V1 Pro', brand: 'Hero', price: { base: 125000, onRoad: 140000 }, range: 110, chargingTime: 5.9, topSpeed: 80, batteryCapacity: 3.94, features: ['Removable Batteries', 'Cruise Control', 'SOS Alert', 'Follow-me-home lights', 'Two-way throttle'], colors: ['Matte White', 'Matte Sports Red', 'Matte Abrax Orange'], imageUrl: 'https://example.com/vida_v1_pro.jpg', description: 'The Hero Vida V1 Pro offers innovative features like removable batteries and a customizable riding experience.' }
//         ];

//         const scooterDocs = await Scooter.insertMany(scootersData);
//         const scooterMap = {};
//         scooterDocs.forEach(scooter => { scooterMap[scooter.model] = scooter._id; });

//         const dealersData = [
//             { name: 'Ola Experience Centre - Mumbai', address: '123 Andheri West', pincode: '400058', city: 'Mumbai', state: 'Maharashtra', contact: '+91 9000000001', email: 'mumbai.ec@olaelectric.com', availableModels: [scooterMap['S1 Pro']], operatingHours: '10:00 AM - 8:00 PM', coordinates: { latitude: 19.1196, longitude: 72.8465 } },
//             { name: 'Ather Space - Delhi', address: '456 Connaught Place', pincode: '110001', city: 'New Delhi', state: 'Delhi', contact: '+91 9000000002', email: 'delhi.as@atherenergy.com', availableModels: [scooterMap['450X']], operatingHours: '10:00 AM - 7:00 PM', coordinates: { latitude: 28.6329, longitude: 77.2195 } },
//             { name: 'TVS Green Motors - Bangalore', address: '789 Koramangala', pincode: '560034', city: 'Bangalore', state: 'Karnataka', contact: '+91 9000000003', email: 'bangalore.tvs@greenmotors.com', availableModels: [scooterMap['iQube S']], operatingHours: '9:30 AM - 7:30 PM', coordinates: { latitude: 12.9351, longitude: 77.6245 } },
//             { name: 'Bajaj EV World - Pune', address: 'Plot 10, FC Road', pincode: '411004', city: 'Pune', state: 'Maharashtra', contact: '+91 9000000004', email: 'pune.bajaj@evworld.com', availableModels: [scooterMap['Chetak Premium']], operatingHours: '10:00 AM - 8:00 PM', coordinates: { latitude: 18.5204, longitude: 73.8567 } },
//             { name: 'Hero Vida Hub - South Mumbai', address: '234 Marine Drive', pincode: '400002', city: 'Mumbai', state: 'Maharashtra', contact: '+91 9000000005', email: 'mumbai.vida@heromotocorp.com', availableModels: [scooterMap['Vida V1 Pro'], scooterMap['S1 Pro']], operatingHours: '11:00 AM - 7:00 PM', coordinates: { latitude: 18.9442, longitude: 72.8237 } }
//         ];
//         await Dealer.insertMany(dealersData);
//         console.log('Sample scooter and dealer data seeded successfully');
//     } catch (error) {
//         console.error('Error seeding data:', error);
//     }
// }
// // --- End of Sample Data Seeding ---

// // --- Main Application Start Function ---
// async function main() {
//     try {
//         console.log('Attempting to connect to MongoDB...');
//         await mongoose.connect(MONGODB_URI, mongooseOptions);

//         bot.use(session({
//             store: {
//                 collection: mongoose.connection.collection('sessions'),
//             },
//         }));
//         console.log('Mongoose session middleware initialized successfully.');

//         await seedSampleData();

//         app.get('/', (req, res) => {
//             res.send('EV India Bot server is running and DB connected!');
//         });

//         app.listen(PORT, () => {
//             console.log(`Server running on port ${PORT}`);
//         });

//         await bot.launch();
//         console.log('Bot started successfully via Polling!');

//         const stopBot = (signal) => {
//             console.log(`${signal} received, stopping bot...`);
//             bot.stop(signal);
//         };
//         process.once('SIGINT', () => stopBot('SIGINT'));
//         process.once('SIGTERM', () => stopBot('SIGTERM'));

//     } catch (error) {
//         console.error('Critical Error during application startup:', error);
//         if (error.name === 'MongooseServerSelectionError' || (error.message && error.message.includes('buffering timed out'))) {
//             console.error('Could not connect to MongoDB. Please ensure MongoDB is running and accessible.');
//         }
//         process.exit(1);
//     }
// }

// main();
// // --- End of Main Application Start Function ---


require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const mongoose = require('mongoose');
const { session } = require('telegraf-session-mongoose');

// Initialize Express app
const app = express();
app.use(express.json());

// Configure environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ev-chatbot';
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const VERCEL_URL = process.env.VERCEL_URL || `https://${process.env.VERCEL_GIT_REPO_SLUG}.vercel.app`;

// --- Mongoose Connection Options ---
const mongooseOptions = {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    family: 4
};

// --- Define Mongoose Schemas and Models ---
const scooterSchema = new mongoose.Schema({
    model: { type: String, required: true, unique: true, index: true },
    brand: { type: String, required: true, index: true },
    price: {
        base: { type: Number, required: true },
        onRoad: { type: Number, required: true }
    },
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
    coordinates: {
        latitude: Number,
        longitude: Number
    }
});

const conversationSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    telegramChatId: { type: Number, required: true },
    userDetails: {
        id: { type: Number, required: true },
        is_bot: { type: Boolean, default: false },
        first_name: { type: String },
        language_code: { type: String }
    },
    conversations: [{
        update_id: { type: Number },
        message_id: { type: Number, required: true },
        chat: {
            id: { type: Number, required: true },
            first_name: { type: String },
            type: { type: String, default: 'private' }
        },
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
// --- End of Schemas and Models ---

// --- Mongoose Connection Event Listeners ---
mongoose.connection.on('connected', () => {
    console.log('Mongoose connected to DB.');
});

mongoose.connection.on('error', (err) => {
    console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('Mongoose disconnected from DB.');
});

mongoose.connection.on('reconnected', () => {
    console.log('Mongoose reconnected to DB.');
});

process.on('SIGINT', async () => {
    console.log('SIGINT received. Closing Mongoose connection...');
    await mongoose.connection.close();
    console.log('Mongoose connection closed due to app termination.');
    process.exit(0);
});
// --- End of Mongoose Connection Event Listeners ---

// Initialize bot instance
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// --- Helper Functions ---
async function queryChatGPT(prompt, conversationHistory = []) {
    try {
        const messages = [
            {
                role: 'system',
                content: `You are EV India Bot, an expert AI assistant for electric scooters in India.
                Your goal is to provide accurate, concise, and helpful information about EV scooters available in the Indian market.
                If a user asks to compare scooters, try to provide a structured comparison.
                If you don't know something, say so clearly.
                When relevant, gently remind users they can check for scooter availability by providing their 6-digit pincode.
                Be friendly and professional.`
            },
            ...conversationHistory,
            { role: 'user', content: prompt }
        ];

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4',
                messages: messages,
                temperature: 0.7,
                max_tokens: 500
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
        return 'Sorry, I encountered a problem trying to understand that. Could you please rephrase or try again later?';
    }
}

async function saveConversation(ctx, userMessage, botMessage) {
    if (!ctx.from || !ctx.from.id || !ctx.message) {
        console.error('Cannot save conversation: Missing ctx.from.id or ctx.message');
        return;
    }

    const userId = ctx.from.id.toString();
    const telegramChatId = ctx.chat.id;
    const updateId = ctx.update?.update_id;
    const messageId = ctx.message.message_id;
    const chat = {
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
            { userId: userId },
            {
                $set: {
                    telegramChatId: telegramChatId,
                    userDetails: userDetails,
                    lastInteraction: new Date()
                },
                $push: {
                    conversations: {
                        update_id: updateId,
                        message_id: messageId,
                        chat: chat,
                        date: date,
                        userMessage: userMessage,
                        botMessage: botMessage,
                        timestamp: new Date()
                    }
                }
            },
            { upsert: true, new: true }
        );
    } catch (error) {
        console.error('Error saving conversation to custom collection:', error);
    }
}

async function getConversationHistory(userId) {
    try {
        const record = await Conversation.findOne({ userId });
        if (!record || !record.conversations) return [];
        const recentConversations = record.conversations.slice(-10);
        return recentConversations.map(conv => [
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
        if (dealers.length === 0) {
            return { available: false, message: `Sorry, we don't have any dealers listed in pincode ${pincode} at the moment. You can try a nearby pincode.` };
        }
        const availableScootersSet = new Set();
        const dealerInfo = [];
        dealers.forEach(dealer => {
            dealer.availableModels.forEach(model => {
                if (model && model.model) {
                    availableScootersSet.add(model.model);
                }
            });
            dealerInfo.push({
                name: dealer.name,
                address: dealer.address,
                contact: dealer.contact,
                models: dealer.availableModels.map(m => m && m.model ? m.model : 'N/A').join(', ')
            });
        });
        return {
            available: true,
            scooters: Array.from(availableScootersSet),
            dealers: dealerInfo,
            message: `Great news! We found ${dealers.length} dealer(s) in pincode ${pincode} with the following EV scooter model(s) potentially available: ${Array.from(availableScootersSet).join(', ')}.`
        };
    } catch (error) {
        console.error('Error checking availability by pincode:', error);
        return { available: false, message: 'Oops! Something went wrong while checking for availability. Please try again.' };
    }
}

async function getScooterInfo(modelName) {
    try {
        const scooter = await Scooter.findOne({ model: { $regex: new RegExp(`^${modelName}$`, 'i') } });

        if (!scooter) {
            const similarScooters = await Scooter.find({ model: { $regex: modelName, $options: 'i' } }).limit(1);

            if (similarScooters.length === 0) {
                return { found: false, message: `Sorry, I couldn't find specific information for an EV scooter named "${modelName}". You can ask me to list available models.` };
            }
            const aSimilarScooter = similarScooters[0];
            let suggestionMessage = `I couldn't find an exact match for "${modelName}". Did you perhaps mean "${aSimilarScooter.brand} ${aSimilarScooter.model}"? \n\nIf so, here's some information:\n\n`;

            let responseText = `*${aSimilarScooter.brand} ${aSimilarScooter.model}*\n\n`;
            responseText += `*Price (Ex-showroom):* ₹${aSimilarScooter.price.base.toLocaleString('en-IN')}\n`;
            responseText += `*Price (On-Road, approx.):* ₹${aSimilarScooter.price.onRoad.toLocaleString('en-IN')}\n`;
            responseText += `*Range (claimed):* ${aSimilarScooter.range} km\n`;
            responseText += `*Battery Capacity:* ${aSimilarScooter.batteryCapacity} kWh\n`;
            responseText += `*Charging Time:* ${aSimilarScooter.chargingTime} hours\n`;
            responseText += `*Top Speed:* ${aSimilarScooter.topSpeed} km/h\n`;
            if (aSimilarScooter.colors && aSimilarScooter.colors.length > 0) {
                responseText += `*Available Colors:* ${aSimilarScooter.colors.join(', ')}\n`;
            }
            if (aSimilarScooter.features && aSimilarScooter.features.length > 0) {
                responseText += `\n*Key Features:*\n`;
                aSimilarScooter.features.forEach(feature => { responseText += `- ${feature}\n`; });
            }
            if (aSimilarScooter.description) {
                responseText += `\n*Description:* ${aSimilarScooter.description}\n`;
            }
            responseText += `\nWould you like to check its availability? Just send your 6-digit pincode.`;

            return {
                found: true,
                message: suggestionMessage + responseText,
                scooter: aSimilarScooter
            };
        }

        let responseText = `*${scooter.brand} ${scooter.model}*\n\n`;
        responseText += `*Price (Ex-showroom):* ₹${scooter.price.base.toLocaleString('en-IN')}\n`;
        responseText += `*Price (On-Road, approx.):* ₹${scooter.price.onRoad.toLocaleString('en-IN')}\n`;
        responseText += `*Range (claimed):* ${scooter.range} km\n`;
        responseText += `*Battery Capacity:* ${scooter.batteryCapacity} kWh\n`;
        responseText += `*Charging Time:* ${scooter.chargingTime} hours\n`;
        responseText += `*Top Speed:* ${scooter.topSpeed} km/h\n`;
        if (scooter.colors && scooter.colors.length > 0) {
            responseText += `*Available Colors:* ${scooter.colors.join(', ')}\n`;
        }
        if (scooter.features && scooter.features.length > 0) {
            responseText += `\n*Key Features:*\n`;
            scooter.features.forEach(feature => { responseText += `- ${feature}\n`; });
        }
        if (scooter.description) {
            responseText += `\n*Description:* ${scooter.description}\n`;
        }
        responseText += `\nWould you like to check its availability? Just send your 6-digit pincode.`;

        return {
            found: true,
            message: responseText,
            scooter: scooter
        };
    } catch (error) {
        console.error('Error fetching scooter info:', error);
        return { found: false, message: 'An error occurred while fetching scooter details. Please try again.' };
    }
}

async function getComparisonInfo(modelName1, modelName2) {
    try {
        const [scooter1Result, scooter2Result] = await Promise.all([
            getScooterInfo(modelName1),
            getScooterInfo(modelName2)
        ]);

        if (!scooter1Result.found && !scooter2Result.found) {
            return `I couldn't find information for either "${modelName1}" or "${modelName2}". Please check the spellings or try different models.`;
        }
        if (!scooter1Result.found) {
            return `I couldn't find information for "${modelName1}". I can tell you about "${modelName2}" if you'd like, or you can try checking the spelling for the first model.`;
        }
        if (!scooter2Result.found) {
            return `I couldn't find information for "${modelName2}". I can tell you about "${modelName1}" if you'd like, or you can try checking the spelling for the second model.`;
        }

        const s1 = scooter1Result.scooter;
        const s2 = scooter2Result.scooter;

        let comparisonText = `*Comparison: ${s1.brand} ${s1.model} vs ${s2.brand} ${s2.model}*\n\n`;
        comparisonText += `| Metric                 | ${s1.model.padEnd(20)} | ${s2.model.padEnd(20)} |\n`;
        comparisonText += `|------------------------|-----------------------|-----------------------|\n`;
        comparisonText += `| Brand                  | ${s1.brand.padEnd(20)} | ${s2.brand.padEnd(20)} |\n`;
        comparisonText += `| Ex-Showroom Price      | ₹${s1.price.base.toLocaleString('en-IN').padEnd(18)} | ₹${s2.price.base.toLocaleString('en-IN').padEnd(18)} |\n`;
        comparisonText += `| On-Road Price (approx) | ₹${s1.price.onRoad.toLocaleString('en-IN').padEnd(18)} | ₹${s2.price.onRoad.toLocaleString('en-IN').padEnd(18)} |\n`;
        comparisonText += `| Range (claimed)        | ${`${s1.range} km`.padEnd(20)} | ${`${s2.range} km`.padEnd(20)} |\n`;
        comparisonText += `| Battery Capacity       | ${`${s1.batteryCapacity} kWh`.padEnd(20)} | ${`${s2.batteryCapacity} kWh`.padEnd(20)} |\n`;
        comparisonText += `| Charging Time          | ${`${s1.chargingTime} hrs`.padEnd(20)} | ${`${s2.chargingTime} hrs`.padEnd(20)} |\n`;
        comparisonText += `| Top Speed              | ${`${s1.topSpeed} km/h`.padEnd(20)} | ${`${s2.topSpeed} km/h`.padEnd(20)} |\n`;

        comparisonText += `\n*Features for ${s1.model}:*\n- ${s1.features.join('\n- ') || 'Not listed'}\n`;
        comparisonText += `\n*Features for ${s2.model}:*\n- ${s2.features.join('\n- ') || 'Not listed'}\n`;
        comparisonText += `\nWould you like to check availability for either of these in your area? Send your 6-digit pincode.`;
        return comparisonText;
    } catch (error) {
        console.error('Error comparing scooters:', error);
        return "Sorry, an error occurred while trying to compare the scooters.";
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
        const models = [];
        const lowerMessage = message.toLowerCase();

        for (const scooter of allScooters) {
            if (lowerMessage.includes(scooter.model.toLowerCase()) ||
                (scooter.brand && lowerMessage.includes(scooter.brand.toLowerCase() + " " + scooter.model.toLowerCase()))) {
                models.push(scooter.model);
            }
        }
        return [...new Set(models)];
    } catch (dbError) {
        console.error("DB Error in extractPotentialModels:", dbError);
        return [];
    }
}

// --- End of Helper Functions ---

// --- Bot Commands and Handlers ---
bot.start(async (ctx) => {
    const welcomeMessage = `Namaste! 🙏 Welcome to EV India Bot! 🇮🇳

I'm your friendly assistant for all things electric scooters in India. I can help you with:
🛵 Information about EV scooter models (specs, price, features)
📍 Check availability in your area (just share your 6-digit pincode)
⚖️ Compare different EV scooter models
❓ Answer your general questions about Indian EVs

Type /help to see a list of example commands.

How can I assist you today?`;
    try {
        await ctx.reply(welcomeMessage, Markup.keyboard([
            ['Compare Scooters', 'Find Scooters by Pincode'],
            ['/help']
        ]).resize().oneTime());
        await saveConversation(ctx, '/start', welcomeMessage);
    } catch (e) {
        console.error("Error in /start handler:", e);
        await ctx.reply("Sorry, there was an issue starting our conversation. Please try again.");
    }
});

bot.help(async (ctx) => {
    const helpMessage = `Here's how I can help:

*General Info:*
  "Tell me about Ola S1 Pro"
  "What are the features of Ather 450X?"

*Check Availability:*
  "Show scooters in 400001"
  "Availability in pincode 110001"
  (Or just send a 6-digit pincode)

*Compare Scooters:*
  "Compare Ola S1 Pro and Ather 450X"
  "TVS iQube S vs Bajaj Chetak Premium"

*Pricing:*
  "What's the price of TVS iQube S?"
  "Ola S1 Pro on road price"

*Specifics:*
  "Range of Bajaj Chetak Premium"
  "Charging time for Ather 450X"

Just type your question! If I can't find specific data, I'll try to answer with my general EV knowledge.`;
    try {
        await ctx.replyWithMarkdown(helpMessage);
        await saveConversation(ctx, '/help', helpMessage);
    } catch (e) {
        console.error("Error in /help handler:", e);
        await ctx.reply("Sorry, couldn't fetch help information right now.");
    }
});

bot.command('getinteractions', async (ctx) => {
    const userId = ctx.from.id.toString();
    try {
        if (ADMIN_USER_ID && userId !== ADMIN_USER_ID) {
            await ctx.reply("Sorry, this command is restricted to administrators.");
            return;
        }

        const record = await Conversation.findOne({ userId });
        if (!record || !record.conversations || record.conversations.length === 0) {
            await ctx.reply("No interaction history found for you.");
            return;
        }

        const recentInteractions = record.conversations.slice(-10);
        let responseText = `*Your Recent Interactions (Last ${recentInteractions.length}):*\n\n`;
        responseText += `**User Details:**\n`;
        responseText += `- ID: ${record.userDetails.id}\n`;
        responseText += `- Name: ${record.userDetails.first_name || 'N/A'}\n`;
        responseText += `- Is Bot: ${record.userDetails.is_bot ? 'Yes' : 'No'}\n`;
        responseText += `- Language: ${record.userDetails.language_code || 'N/A'}\n\n`;

        recentInteractions.forEach((interaction, index) => {
            responseText += `**Interaction ${index + 1}:**\n`;
            responseText += `- Update ID: ${interaction.update_id || 'N/A'}\n`;
            responseText += `- Message ID: ${interaction.message_id}\n`;
            responseText += `- Chat ID: ${interaction.chat.id}\n`;
            responseText += `- Chat Type: ${interaction.chat.type}\n`;
            responseText += `- Date: ${new Date(interaction.date * 1000).toLocaleString()}\n`;
            responseText += `- User Message: ${interaction.userMessage}\n`;
            responseText += `- Bot Response: ${interaction.botMessage}\n\n`;
        });

        await ctx.replyWithMarkdown(responseText);
        await saveConversation(ctx, '/getinteractions', responseText);
    } catch (error) {
        console.error('Error fetching interactions:', error);
        await ctx.reply("Sorry, I encountered an error while fetching your interaction history.");
    }
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userMessage = ctx.message.text.trim();
    let botResponse = "I'm sorry, I'm having a little trouble understanding that right now. Could you try rephrasing?";

    try {
        await ctx.telegram.sendChatAction(ctx.chat.id, 'typing');

        const pincode = extractPincode(userMessage);
        const comparisonRegex = /compare ([\w\s.-]+) and ([\w\s.-]+)/i;
        const comparisonMatch = userMessage.match(comparisonRegex);

        if (pincode) {
            const availabilityResult = await checkAvailabilityByPincode(pincode);
            if (availabilityResult.available) {
                botResponse = `${availabilityResult.message}\n\n*Dealer(s) Found:*\n`;
                availabilityResult.dealers.forEach((dealer, index) => {
                    botResponse += `\n*${index + 1}. ${dealer.name}*\n`;
                    botResponse += `   Address: ${dealer.address}\n`;
                    botResponse += `   Contact: ${dealer.contact || 'N/A'}\n`;
                    botResponse += `   Models (reported): ${dealer.models || 'N/A'}\n`;
                });
                botResponse += "\n\nWould you like specific information about any of these scooters or brands?";
            } else {
                botResponse = availabilityResult.message;
            }
        } else if (comparisonMatch) {
            const model1 = comparisonMatch[1].trim();
            const model2 = comparisonMatch[2].trim();
            botResponse = await getComparisonInfo(model1, model2);
        } else {
            const potentialModels = await extractPotentialModels(userMessage);
            if (potentialModels.length === 1) {
                const scooterInfo = await getScooterInfo(potentialModels[0]);
                botResponse = scooterInfo.message;
            } else if (potentialModels.length > 1) {
                const conversationHistory = await getConversationHistory(userId);
                botResponse = await queryChatGPT(userMessage, conversationHistory);
            } else {
                const conversationHistory = await getConversationHistory(userId);
                botResponse = await queryChatGPT(userMessage, conversationHistory);
            }
        }
        await ctx.replyWithMarkdown(botResponse);
        await saveConversation(ctx, userMessage, botResponse);
    } catch (error) {
        console.error(`Error processing text message: "${userMessage}" from user ${userId}:`, error);
        if (error.name === 'MongooseError' && error.message.includes('buffering timed out')) {
            await ctx.reply("I'm having trouble connecting to my database right now. Please try again in a few moments.");
        } else {
            await ctx.reply("I'm sorry, I ran into a little trouble processing that. Could you try rephrasing or ask something else?");
        }
        await saveConversation(ctx, userMessage, "Error response: Bot encountered an internal error.");
    }
});
// --- End of Bot Commands and Handlers ---

// --- Sample Data Seeding ---
async function seedSampleData() {
    try {
        const scootersCount = await Scooter.countDocuments();
        if (scootersCount > 0) {
            console.log('Sample scooter data likely already exists, skipping seed.');
            const dealersCount = await Dealer.countDocuments();
            if (dealersCount === 0) {
                console.log('Scooters exist, but dealers are missing. Seeding dealers...');
            } else {
                return;
            }
        }

        console.log('Seeding sample data...');
        await Scooter.deleteMany({});
        await Dealer.deleteMany({});

        const scootersData = [
            { model: 'S1 Pro', brand: 'Ola Electric', price: { base: 129999, onRoad: 145000 }, range: 181, chargingTime: 6.5, topSpeed: 116, batteryCapacity: 4, features: ['Digital Console', 'Reverse Mode', 'Fast Charging', 'Bluetooth', 'GPS', 'Anti-theft alarm', 'Hill Hold'], colors: ['Jet Black', 'Porcelain White', 'Neo Mint', 'Coral Glam', 'Liquid Silver'], imageUrl: 'https://example.com/ola_s1_pro.jpg', description: 'The Ola S1 Pro is a flagship electric scooter known for its performance, range, and smart features.' },
            { model: '450X', brand: 'Ather', price: { base: 138000, onRoad: 160000 }, range: 111, chargingTime: 5.7, topSpeed: 90, batteryCapacity: 3.7, features: ['Touchscreen Dashboard', 'OTA Updates', 'Navigation', 'Riding Modes', 'Reverse Assist', 'Auto Indicator Off'], colors: ['Space Grey', 'Mint Green', 'True Red', 'Cosmic Black'], imageUrl: 'https://example.com/ather_450x.jpg', description: 'The Ather 450X is a premium smart electric scooter offering a thrilling ride and connected features. Range is certified, real-world may vary.' },
            { model: 'iQube S', brand: 'TVS', price: { base: 120000, onRoad: 135000 }, range: 100, chargingTime: 4.5, topSpeed: 78, batteryCapacity: 3.04, features: ['SmartXonnect', 'Geo-fencing', 'Anti-theft Alert', 'Q-Park Assist', 'USB Charging'], colors: ['Titanium Grey Matte', 'Starlight Blue Glossy', 'Mint Blue'], imageUrl: 'https://example.com/tvs_iqube_s.jpg', description: 'The TVS iQube S is a reliable electric scooter with practical features for urban commuting.' },
            { model: 'Chetak Premium', brand: 'Bajaj', price: { base: 145000, onRoad: 158000 }, range: 90, chargingTime: 5, topSpeed: 63, batteryCapacity: 2.88, features: ['Metal Body', 'Keyless Start', 'IP67 Rating', 'Sequential Blinkers', 'Digital Console'], colors: ['Hazelnut', 'Brooklyn Black', 'Velluto Rosso', 'Indigo Metallic'], imageUrl: 'https://example.com/bajaj_chetak_premium.jpg', description: 'The Bajaj Chetak electric revives a classic name with modern electric technology and premium build quality.' },
            { model: 'Vida V1 Pro', brand: 'Hero', price: { base: 125000, onRoad: 140000 }, range: 110, chargingTime: 5.9, topSpeed: 80, batteryCapacity: 3.94, features: ['Removable Batteries', 'Cruise Control', 'SOS Alert', 'Follow-me-home lights', 'Two-way throttle'], colors: ['Matte White', 'Matte Sports Red', 'Matte Abrax Orange'], imageUrl: 'https://example.com/vida_v1_pro.jpg', description: 'The Hero Vida V1 Pro offers innovative features like removable batteries and a customizable riding experience.' }
        ];

        const scooterDocs = await Scooter.insertMany(scootersData);
        const scooterMap = {};
        scooterDocs.forEach(scooter => { scooterMap[scooter.model] = scooter._id; });

        const dealersData = [
            { name: 'Ola Experience Centre - Mumbai', address: '123 Andheri West', pincode: '400058', city: 'Mumbai', state: 'Maharashtra', contact: '+91 9000000001', email: 'mumbai.ec@olaelectric.com', availableModels: [scooterMap['S1 Pro']], operatingHours: '10:00 AM - 8:00 PM', coordinates: { latitude: 19.1196, longitude: 72.8465 } },
            { name: 'Ather Space - Delhi', address: '456 Connaught Place', pincode: '110001', city: 'New Delhi', state: 'Delhi', contact: '+91 9000000002', email: 'delhi.as@atherenergy.com', availableModels: [scooterMap['450X']], operatingHours: '10:00 AM - 7:00 PM', coordinates: { latitude: 28.6329, longitude: 77.2195 } },
            { name: 'TVS Green Motors - Bangalore', address: '789 Koramangala', pincode: '560034', city: 'Bangalore', state: 'Karnataka', contact: '+91 9000000003', email: 'bangalore.tvs@greenmotors.com', availableModels: [scooterMap['iQube S']], operatingHours: '9:30 AM - 7:30 PM', coordinates: { latitude: 12.9351, longitude: 77.6245 } },
            { name: 'Bajaj EV World - Pune', address: 'Plot 10, FC Road', pincode: '411004', city: 'Pune', state: 'Maharashtra', contact: '+91 9000000004', email: 'pune.bajaj@evworld.com', availableModels: [scooterMap['Chetak Premium']], operatingHours: '10:00 AM - 8:00 PM', coordinates: { latitude: 18.5204, longitude: 73.8567 } },
            { name: 'Hero Vida Hub - South Mumbai', address: '234 Marine Drive', pincode: '400002', city: 'Mumbai', state: 'Maharashtra', contact: '+91 9000000005', email: 'mumbai.vida@heromotocorp.com', availableModels: [scooterMap['Vida V1 Pro'], scooterMap['S1 Pro']], operatingHours: '11:00 AM - 7:00 PM', coordinates: { latitude: 18.9442, longitude: 72.8237 } }
        ];
        await Dealer.insertMany(dealersData);
        console.log('Sample scooter and dealer data seeded successfully');
    } catch (error) {
        console.error('Error seeding data:', error);
    }
}
// --- End of Sample Data Seeding ---

// --- Main Application Start Function ---
async function main() {
    try {
        console.log('Attempting to connect to MongoDB...');
        await mongoose.connect(MONGODB_URI, mongooseOptions);

        bot.use(session({
            store: {
                collection: mongoose.connection.collection('sessions'),
            },
        }));
        console.log('Mongoose session middleware initialized successfully.');

        await seedSampleData();

        // Set up webhook
        const webhookPath = `/bot${TELEGRAM_BOT_TOKEN}`;
        const webhookUrl = `${VERCEL_URL}${webhookPath}`;
        await bot.telegram.setWebhook(webhookUrl);
        console.log(`Webhook set to ${webhookUrl}`);

        // Handle webhook requests
        app.use(bot.webhookCallback(webhookPath));

        // Health check endpoint
        app.get('/', (req, res) => {
            res.send('EV India Bot server is running and DB connected!');
        });

        // Vercel serverless function export
        module.exports = app;

    } catch (error) {
        console.error('Critical Error during application startup:', error);
        if (error.name === 'MongooseServerSelectionError' || (error.message && error.message.includes('buffering timed out'))) {
            console.error('Could not connect to MongoDB. Please ensure MongoDB is running and accessible.');
        }
        process.exit(1);
    }
}

main();
// --- End of Main Application Start Function ---