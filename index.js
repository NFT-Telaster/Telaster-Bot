const http = require('http');
http.createServer((req, res) => res.end('Bot is alive!')).listen(process.env.PORT || 8080);

// ============================================================
//  TELASTER FINANCE — Telegram Bot Backend
//  Stack: Telegraf (Node.js) + Firebase Web SDK v9+
// ============================================================

const { Telegraf, Markup } = require('telegraf');
const { initializeApp }    = require('firebase/app');
const {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} = require('firebase/firestore');

// ── ENV VARS ─────────────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌  BOT_TOKEN environment variable is not set. Exiting.');
  process.exit(1);
}

// ── FIREBASE CONFIG ──────────────────────────────────────────
const firebaseConfig = {
  apiKey:            'AIzaSyAKEbJ3TOp0XPs_3xDiK12WFR3VKV5UrFU',
  authDomain:        'bnb-telaster.firebaseapp.com',
  projectId:         'bnb-telaster',
  storageBucket:     'bnb-telaster.firebasestorage.app',
  messagingSenderId: '399683225696',
  appId:             '1:399683225696:web:40e4d2eac349326a78db05',
};

const firebaseApp = initializeApp(firebaseConfig);
const db          = getFirestore(firebaseApp);

// ── BOT SETUP ────────────────────────────────────────────────
const bot = new Telegraf(BOT_TOKEN);

// In-memory state for multi-step onboarding
// { [chatId]: { step: 'name'|'email', name?: string } }
const sessions = {};

const APP_URL = 'https://nft-telaster.github.io/BNB-TELASTER/';

// ── HELPERS ──────────────────────────────────────────────────
function launchButton() {
  return Markup.inlineKeyboard([
    Markup.button.webApp('🚀 Open Telaster App', APP_URL),
  ]);
}

async function welcomeExistingUser(ctx, name) {
  await ctx.reply(
    `👋 Welcome back, *${name}*!\n\nYour Telaster Finance account is ready. Tap the button below to open the app.`,
    { parse_mode: 'Markdown', ...launchButton() }
  );
}

async function saveUserAndLaunch(ctx, userId, name, email) {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, {
    id:        userId,
    name:      name,
    email:     email,
    balance:   0,
    createdAt: serverTimestamp(),
  });

  await ctx.reply(
    `✅ *Account created successfully!*\n\nWelcome to Telaster Finance, *${name}*! 🎉\n\nTap below to launch your app and start earning.`,
    { parse_mode: 'Markdown', ...launchButton() }
  );
}

// ── /start COMMAND ───────────────────────────────────────────
bot.start(async (ctx) => {
  const userId   = String(ctx.from.id);
  const chatId   = ctx.chat.id;

  try {
    const userRef  = doc(db, 'users', userId);
    const snapshot = await getDoc(userRef);

    if (snapshot.exists()) {
      // ── Existing user ──
      const data = snapshot.data();
      await welcomeExistingUser(ctx, data.name || ctx.from.first_name);
    } else {
      // ── New user — start onboarding ──
      sessions[chatId] = { step: 'name' };
      await ctx.reply(
        `👋 Welcome to *Telaster Finance*!\n\nLet's set up your account. Please enter your *Full Name*:`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (err) {
    console.error('Error in /start:', err);
    await ctx.reply('⚠️ Something went wrong. Please try /start again.');
  }
});

// ── MESSAGE HANDLER (Onboarding Steps) ───────────────────────
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const userId = String(ctx.from.id);
  const text   = ctx.message.text.trim();

  // Ignore commands
  if (text.startsWith('/')) return;

  const session = sessions[chatId];
  if (!session) return; // Not in an onboarding flow

  // ── Step 1: Collect Name ──
  if (session.step === 'name') {
    if (text.length < 2) {
      return ctx.reply('⚠️ Name seems too short. Please enter your full name:');
    }
    sessions[chatId] = { step: 'email', name: text };
    return ctx.reply(
      `👍 Got it, *${text}*!\n\nNow please enter your *Email Address*:`,
      { parse_mode: 'Markdown' }
    );
  }

  // ── Step 2: Collect Email ──
  if (session.step === 'email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(text)) {
      return ctx.reply('⚠️ That doesn\'t look like a valid email. Please try again:');
    }

    const name  = session.name;
    const email = text.toLowerCase();
    delete sessions[chatId]; // Clear session

    try {
      await saveUserAndLaunch(ctx, userId, name, email);
    } catch (err) {
      console.error('Error saving user:', err);
      await ctx.reply('⚠️ Failed to save your details. Please try /start again.');
    }
  }
});

// ── LAUNCH ───────────────────────────────────────────────────
bot.launch()
  .then(() => console.log('✅ Telaster Bot is running...'))
  .catch((err) => {
    console.error('❌ Failed to launch bot:', err);
    process.exit(1);
  });

// Graceful shutdown
process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
