require('dotenv').config();
const crypto = require('crypto');
const { promisify } = require('util');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*', methods: ['GET', 'POST'] }
});

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Add it to your environment before starting the server.');
}

const db = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
});

const scrypt = promisify(crypto.scrypt);
const DAILY_CHIPS = 500;
const STARTING_CHIPS = 1_000;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const sessions = new Map();
const balanceWrites = new Map();

async function initializeDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS poker_accounts (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(20) NOT NULL,
      username_key VARCHAR(20) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      chips INTEGER NOT NULL DEFAULT ${STARTING_CHIPS} CHECK (chips >= 0),
      last_daily_claim_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function normalizeUsername(username) {
  return typeof username === 'string' ? username.trim().toLowerCase() : '';
}

function validateCredentials(username, password) {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_]{3,20}$/.test(username.trim())) {
    return 'Username must use 3–20 letters, numbers, or underscores.';
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return 'Password must be 8–128 characters.';
  }
  return null;
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return { salt, hash: hash.toString('hex') };
}

async function passwordMatches(password, account) {
  const { hash } = await hashPassword(password, account.password_salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(account.password_hash, 'hex'));
}

function makeSession(socket, account) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  sessions.set(token, { accountId: account.id, expiresAt });
  socket.data.account = account;
  socket.data.sessionToken = token;
  return token;
}

function dailyAvailableIn(account) {
  if (!account.last_daily_claim_at) return 0;
  return Math.max(0, DAILY_COOLDOWN_MS - (Date.now() - new Date(account.last_daily_claim_at).getTime()));
}

function accountPayload(account, sessionToken = null) {
  return {
    username: account.username,
    chips: account.chips,
    dailyAvailableIn: dailyAvailableIn(account),
    sessionToken
  };
}

function sendAccountState(socket, sessionToken = null) {
  socket.emit('account_state', socket.data.account ? accountPayload(socket.data.account, sessionToken) : null);
}

function requireAccount(socket) {
  if (!socket.data.account) {
    socket.emit('error_msg', 'Please sign in before joining a table.');
    return null;
  }
  return socket.data.account;
}

function isAccountSeated(accountId) {
  return Object.values(rooms).some(room => room.players.some(player => player.accountId === accountId));
}

function persistPlayerBalance(player) {
  if (!player || player.isBot || !player.accountId) return Promise.resolve();
  const { accountId, id: socketId, chips } = player;
  const previousWrite = balanceWrites.get(accountId) || Promise.resolve();
  const write = previousWrite.catch(() => {}).then(async () => {
    const result = await db.query('UPDATE poker_accounts SET chips = $1 WHERE id = $2 RETURNING chips', [chips, accountId]);
    if (!result.rowCount) throw new Error(`Account ${accountId} was not found while saving chips.`);
    const playerSocket = io.sockets.sockets.get(socketId);
    if (playerSocket?.data.account) {
      playerSocket.data.account.chips = result.rows[0].chips;
      sendAccountState(playerSocket, playerSocket.data.sessionToken);
    }
  });
  balanceWrites.set(accountId, write);
  return write;
}

function persistRoomBalances(room) {
  room.players.forEach(player => {
    persistPlayerBalance(player).catch(error => console.error('Unable to save player balance:', error));
  });
}

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13, 'A':14 };

// Every poker game lives in the same lobby and uses the same account balance.
// The family controls the deal; the rule id controls wild cards and table copy.
const GAME_VARIANTS = {
  texas_holdem: { label: "Texas Hold'em", family: 'community', holeCards: 2, summary: 'Two hole cards and a five-card community board.' },
  omaha: { label: 'Omaha', family: 'community', holeCards: 4, omaha: true, summary: 'Four hole cards; use exactly two with exactly three board cards.' },
  big_o: { label: 'Big O (5-Card Omaha)', family: 'community', holeCards: 5, omaha: true, summary: 'Five hole cards; use exactly two with exactly three board cards.' },
  five_card_draw: { label: 'Five-Card Draw', family: 'draw', summary: 'Five private cards, one draw, and two betting rounds.' },
  draw_deuces: { label: 'Five-Card Draw — Deuces Wild', family: 'draw', summary: 'Classic draw poker with every deuce wild.' },
  seven_card_stud: { label: 'Seven-Card Stud', family: 'stud', maxStreet: 7, summary: 'Two down, four up, and a final river card.' },
  five_card_stud: { label: 'Five-Card Stud', family: 'stud', maxStreet: 5, summary: 'One down and four up.' },
  seven_card_no_peek: { label: 'Seven-Card No Peek', family: 'no_peek', summary: 'Seven down; reveal only enough cards to take the visible lead.' },
  night_baseball: { label: 'Night Baseball (No Peek)', family: 'no_peek', summary: 'No Peek with 3s and 9s wild.' },
  deuces: { label: 'Seven-Card Stud — Deuces Wild', family: 'stud', maxStreet: 7, summary: 'Seven-card stud with every deuce wild.' },
  follow: { label: 'Follow the Queen', family: 'stud', maxStreet: 7, summary: 'Queens and the next exposed rank are wild.' },
  seven_makes: { label: 'Seven & What Makes It', family: 'stud', maxStreet: 7, summary: '7s and card pairs that total seven are wild.' },
  low_hole: { label: 'Low Hole Wild', family: 'stud', maxStreet: 7, summary: "Each player's lowest hole-card rank is wild." },
  roll_your_own: { label: 'Roll Your Own', family: 'stud', maxStreet: 7, summary: 'Choose one card to expose on every street.' },
  baseball: { label: 'Baseball', family: 'stud', maxStreet: 7, summary: 'Seven-card stud with 3s and 9s wild.' },
  dr_pepper: { label: 'Dr Pepper', family: 'stud', maxStreet: 7, summary: 'Seven-card stud with 2s, 4s, and 10s wild.' },
  woolworth: { label: 'Woolworth', family: 'stud', maxStreet: 7, summary: 'Seven-card stud with 5s and 10s wild.' },
  kings_little: { label: 'Kings & Little Ones', family: 'stud', maxStreet: 7, summary: 'Kings and your lowest hole-card rank are wild.' }
};

const LEGACY_VARIANTS = { standard: 'seven_card_stud' };

function normalizeVariant(ruleVariant) {
  const normalized = LEGACY_VARIANTS[ruleVariant] || ruleVariant;
  return GAME_VARIANTS[normalized] ? normalized : 'seven_card_stud';
}

function getVariant(ruleVariant) {
  return GAME_VARIANTS[normalizeVariant(ruleVariant)];
}

const rooms = {};

const BOT_ROSTER = {
  alex: { name: 'Alex', persona: 'aggressive', badge: '⚡ Aggro Bluffer' },
  sam: { name: 'Sam', persona: 'calling_station', badge: '🛡️ Calling Station' },
  jordan: { name: 'Jordan', persona: 'wild_chaser', badge: '🎲 Wild Gambler' },
  victoria: { name: 'Victoria', persona: 'tight_passive', badge: '🗿 The Rock' },
  jax: { name: 'Jax', persona: 'maniac', badge: '🔥 Loose Maniac' }
};

function getPublicRooms() {
  return Object.values(rooms).map(r => ({
    id: r.id,
    name: r.name,
    ruleVariant: r.ruleVariant,
    gameLabel: getVariant(r.ruleVariant).label,
    gameFamily: getVariant(r.ruleVariant).family,
    ante: r.ante,
    startingChips: r.startingChips,
    playerCount: r.players.length,
    humanCount: r.players.filter(p => !p.isBot).length,
    status: r.status,
    hostName: r.players.find(p => p.id === r.hostId)?.name || 'Host'
  }));
}

function broadcastRoomsList() {
  io.to('lobby').emit('rooms_list', getPublicRooms());
}

function createDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ rank: r, suit: s, value: RANK_VALUES[r], isFaceUp: false, isHole: false });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/* ================= EXACT WILD CARD CHECKER ================= */
function isWild(card, ruleVariant, followRank, playerLowHoleRank = null) {
  if (!card || !card.rank) return false;

  if ((ruleVariant === 'deuces' || ruleVariant === 'draw_deuces') && card.rank === '2') return true;

  if ((ruleVariant === 'baseball' || ruleVariant === 'night_baseball') && (card.rank === '3' || card.rank === '9')) return true;

  if (ruleVariant === 'dr_pepper' && ['2', '4', '10'].includes(card.rank)) return true;

  if (ruleVariant === 'woolworth' && (card.rank === '5' || card.rank === '10')) return true;

  if (ruleVariant === 'kings_little' && (card.rank === 'K' || card.rank === playerLowHoleRank)) return true;

  if (ruleVariant === 'follow') {
    if (card.rank === 'Q') return true;
    if (followRank && card.rank === followRank) return true;
  }

  if (ruleVariant === 'seven_makes') {
    if (card.rank === '7') return true;
    if (card.isSevenPairWild) return true;
  }

  if (ruleVariant === 'low_hole') {
    if (playerLowHoleRank && card.rank === playerLowHoleRank) return true;
  }

  return false;
}

function getPlayerLowHoleRank(player) {
  // Permanently checks cards marked isHole === true
  const holeCards = player.cards.filter(c => c.isHole);
  if (!holeCards.length) return null;
  const lowestVal = Math.min(...holeCards.map(c => c.value));
  const card = holeCards.find(c => c.value === lowestVal);
  return card ? card.rank : null;
}

function applySevenAndWhatMakesIt(cards) {
  cards.forEach(c => c.isSevenPairWild = false);
  const pairPairs = [ [14, 6], [2, 5], [3, 4] ];

  pairPairs.forEach(([r1, r2]) => {
    const c1 = cards.find(c => (c.value === r1 || (r1===14 && c.rank==='A')) && !c.isSevenPairWild && c.rank !== '7');
    const c2 = cards.find(c => c.value === r2 && !c.isSevenPairWild && c.rank !== '7');
    if (c1 && c2 && c1 !== c2) {
      c1.isSevenPairWild = true;
      c2.isSevenPairWild = true;
    }
  });
}

function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];
  const head = arr[0];
  const tail = arr.slice(1);
  const withHead = combinations(tail, k - 1).map(c => [head, ...c]);
  const withoutHead = combinations(tail, k);
  return [...withHead, ...withoutHead];
}

function encodeRanks(ranks) {
  return ranks.reduce((score, rank) => score * 15 + rank, 0);
}

function bestHighRanks(values, wildCount = 0, limit = 5, excluded = []) {
  const chosen = [...values].filter(value => !excluded.includes(value)).sort((a, b) => b - a);
  const used = new Set(chosen);
  for (let rank = 14; rank >= 2 && wildCount > 0; rank--) {
    if (!used.has(rank) && !excluded.includes(rank)) {
      chosen.push(rank);
      used.add(rank);
      wildCount--;
    }
  }
  return chosen.sort((a, b) => b - a).slice(0, limit);
}

function evaluate5CardCombo(fiveCards, ruleVariant, followRank, lowHoleRank) {
  const wilds = fiveCards.filter(c => isWild(c, ruleVariant, followRank, lowHoleRank));
  const naturals = fiveCards.filter(c => !isWild(c, ruleVariant, followRank, lowHoleRank));
  const W = wilds.length;

  if (W === 5) {
    return { score: 10000000 + encodeRanks([14]), desc: 'Five of a Kind (Aces)' };
  }

  const rankMap = {};
  naturals.forEach(c => rankMap[c.value] = (rankMap[c.value] || 0) + 1);
  const distinctRanks = Object.keys(rankMap).map(Number).sort((a,b) => b - a);

  // 1. Five of a Kind
  for (let r of distinctRanks) {
    if (rankMap[r] + W >= 5) {
      return { score: 10000000 + encodeRanks([r]), desc: `Five of a Kind (${fiveCards.find(c => c.value===r)?.rank || 'Wilds'}s)` };
    }
  }

  // 2. Straight Flush
  const suitMap = {};
  naturals.forEach(c => {
    suitMap[c.suit] = suitMap[c.suit] || [];
    suitMap[c.suit].push(c.value);
  });

  let bestStraightFlush = null;
  for (let suit of SUITS) {
    const suitVals = suitMap[suit] || [];
    if (suitVals.length + W >= 5) {
      const sfHigh = getStraightHighRank(suitVals, W);
      if (sfHigh && (!bestStraightFlush || sfHigh > bestStraightFlush)) {
        bestStraightFlush = sfHigh;
      }
    }
  }
  if (bestStraightFlush) {
    return { score: 9000000 + encodeRanks([bestStraightFlush]), desc: bestStraightFlush === 14 ? 'Royal Flush' : `Straight Flush (${bestStraightFlush}-High)` };
  }

  // 3. Four of a Kind
  for (let r of distinctRanks) {
    if (rankMap[r] + W >= 4) {
      const usedWilds = Math.max(0, 4 - rankMap[r]);
      const kicker = bestHighRanks(naturals.filter(card => card.value !== r).map(card => card.value), W - usedWilds, 1, [r]);
      return { score: 8000000 + encodeRanks([r, ...kicker]), desc: `Four of a Kind (${fiveCards.find(c => c.value===r)?.rank}s)` };
    }
  }

  // 4. Full House
  for (let r1 of distinctRanks) {
    const neededForTrip = Math.max(0, 3 - rankMap[r1]);
    if (neededForTrip <= W) {
      const remainingWilds = W - neededForTrip;
      for (let r2 of distinctRanks) {
        if (r2 !== r1) {
          const neededForPair = Math.max(0, 2 - rankMap[r2]);
          if (neededForPair <= remainingWilds) {
            return { score: 7000000 + encodeRanks([r1, r2]), desc: `Full House (${fiveCards.find(c => c.value===r1)?.rank}s full of ${fiveCards.find(c => c.value===r2)?.rank}s)` };
          }
        }
      }
      if (remainingWilds >= 2 && distinctRanks.length === 1) {
        return { score: 7000000 + encodeRanks([r1, 14]), desc: `Full House` };
      }
    }
  }

  // 5. Flush
  let bestFlush = null;
  for (let suit of SUITS) {
    const sCards = suitMap[suit] || [];
    if (sCards.length + W >= 5) {
      const ranks = bestHighRanks(sCards, W, 5);
      const score = 6000000 + encodeRanks(ranks);
      if (!bestFlush || score > bestFlush.score) bestFlush = { score, desc: `Flush (${suit})` };
    }
  }
  if (bestFlush) return bestFlush;

  // 6. Straight
  const allNatValues = naturals.map(c => c.value);
  const straightHigh = getStraightHighRank(allNatValues, W);
  if (straightHigh) {
    const straightName = straightHigh === 14 ? 'Ace-High (Broadway)' : `${straightHigh}-High`;
    return { score: 5000000 + encodeRanks([straightHigh]), desc: `Straight (${straightName})` };
  }

  // 7. Three of a Kind
  for (let r of distinctRanks) {
    if (rankMap[r] + W >= 3) {
      const usedWilds = Math.max(0, 3 - rankMap[r]);
      const kickers = bestHighRanks(naturals.filter(card => card.value !== r).map(card => card.value), W - usedWilds, 2, [r]);
      return { score: 4000000 + encodeRanks([r, ...kickers]), desc: `Three of a Kind (${fiveCards.find(c => c.value===r)?.rank}s)` };
    }
  }

  // 8. Two Pair
  const pairRanks = distinctRanks.filter(rank => rankMap[rank] >= 2).slice(0, 2);
  if (pairRanks.length >= 2) {
    const kicker = bestHighRanks(naturals.filter(card => !pairRanks.includes(card.value)).map(card => card.value), 0, 1, pairRanks);
    return { score: 3000000 + encodeRanks([...pairRanks, ...kicker]), desc: `Two Pair` };
  }

  // 9. One Pair
  for (let r of distinctRanks) {
    if (rankMap[r] + W >= 2) {
      const usedWilds = Math.max(0, 2 - rankMap[r]);
      const kickers = bestHighRanks(naturals.filter(card => card.value !== r).map(card => card.value), W - usedWilds, 3, [r]);
      return { score: 2000000 + encodeRanks([r, ...kickers]), desc: `One Pair (${fiveCards.find(c => c.value===r)?.rank}s)` };
    }
  }

  // 10. High Card
  const highRanks = bestHighRanks(naturals.map(card => card.value), W, 5);
  return { score: 1000000 + encodeRanks(highRanks), desc: `High Card` };
}

function getStraightHighRank(valuesList, wildCount) {
  const uniq = Array.from(new Set(valuesList));
  if (uniq.includes(14)) uniq.push(1);

  for (let high = 14; high >= 5; high--) {
    let missing = 0;
    for (let needed = high; needed >= high - 4; needed--) {
      if (!uniq.includes(needed)) {
        missing++;
      }
    }
    if (missing <= wildCount) {
      return high;
    }
  }
  return null;
}

function evaluateBest7CardHand(cards, ruleVariant, followRank, lowHoleRank) {
  if (!cards || cards.length < 5) {
    return { score: 0, desc: 'Incomplete Hand' };
  }

  if (ruleVariant === 'seven_makes') {
    applySevenAndWhatMakesIt(cards);
  }

  const all5Combos = combinations(cards, 5);
  let best = { score: -1, desc: 'High Card' };

  for (let combo of all5Combos) {
    const res = evaluate5CardCombo(combo, ruleVariant, followRank, lowHoleRank);
    if (res.score > best.score) {
      best = res;
    }
  }
  return best;
}

function evaluateOmahaHand(holeCards, boardCards, ruleVariant, followRank, lowHoleRank) {
  if (holeCards.length < 2 || boardCards.length < 3) return { score: 0, desc: 'Incomplete Hand' };

  let best = { score: -1, desc: 'High Card' };
  for (const holeCombo of combinations(holeCards, 2)) {
    for (const boardCombo of combinations(boardCards, 3)) {
      const result = evaluate5CardCombo([...holeCombo, ...boardCombo], ruleVariant, followRank, lowHoleRank);
      if (result.score > best.score) best = result;
    }
  }
  return best;
}

function evaluatePlayerHand(player, room, cards = player.cards) {
  const lowHole = getPlayerLowHoleRank(player);
  const variant = getVariant(room.ruleVariant);
  if (variant.omaha) return evaluateOmahaHand(cards, room.communityCards || [], room.ruleVariant, room.followRank, lowHole);
  if (variant.family === 'community') {
    return evaluateBest7CardHand([...cards, ...(room.communityCards || [])], room.ruleVariant, room.followRank, lowHole);
  }
  return evaluateBest7CardHand(cards, room.ruleVariant, room.followRank, lowHole);
}

function evaluateVisibleNoPeekHand(player, room) {
  const visible = player.cards.filter(card => card.isFaceUp);
  if (visible.length >= 5) return evaluateBest7CardHand(visible, room.ruleVariant, room.followRank, null);
  if (!visible.length) return { score: -1, desc: 'No cards showing' };

  const wildCount = visible.filter(card => isWild(card, room.ruleVariant, room.followRank, null)).length;
  const naturals = visible.filter(card => !isWild(card, room.ruleVariant, room.followRank, null));
  const counts = Object.entries(naturals.reduce((all, card) => {
    all[card.value] = (all[card.value] || 0) + 1;
    return all;
  }, {})).map(([rank, count]) => ({ rank: Number(rank), count })).sort((a, b) => b.count - a.count || b.rank - a.rank);
  if (!counts.length) counts.push({ rank: 14, count: 0 });
  counts[0].count += wildCount;
  const kickers = counts.map(item => item.rank).sort((a, b) => b - a);
  const encoded = kickers.reduce((score, rank) => score * 15 + rank, 0);
  if (counts[0].count === 4) return { score: 8000000 + counts[0].rank * 1000 + encoded, desc: 'Four of a Kind' };
  if (counts[0].count === 3) return { score: 4000000 + counts[0].rank * 1000 + encoded, desc: 'Three of a Kind' };
  if (counts[0].count === 2 && counts[1]?.count === 2) return { score: 3000000 + counts[0].rank * 1000 + counts[1].rank, desc: 'Two Pair' };
  if (counts[0].count === 2) return { score: 2000000 + counts[0].rank * 1000 + encoded, desc: `Pair of ${visible.find(card => card.value === counts[0].rank)?.rank}s` };
  const highRank = naturals.length ? Math.max(...naturals.map(card => card.value)) : 14;
  const highLabel = Object.keys(RANK_VALUES).find(rank => RANK_VALUES[rank] === highRank) || 'A';
  return { score: 1000000 + encoded, desc: `${highLabel}-High` };
}

function sendRichLog(roomId, category, text) {
  io.to(roomId).emit('rich_log', {
    category, // 'DEAL', 'ACTION', 'WILD', 'SHOWDOWN', 'STREET'
    text,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  });
}

/* ================= SERVER SOCKET LOGIC ================= */
io.on('connection', (socket) => {
  socket.join('lobby');
  socket.emit('rooms_list', getPublicRooms());

  socket.on('register_account', async ({ username, password }) => {
    const validationError = validateCredentials(username, password);
    if (validationError) return socket.emit('auth_error', validationError);

    try {
      const cleanUsername = username.trim();
      const { salt, hash } = await hashPassword(password);
      const result = await db.query(
        `INSERT INTO poker_accounts (username, username_key, password_hash, password_salt, chips)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, chips, last_daily_claim_at`,
        [cleanUsername, normalizeUsername(cleanUsername), hash, salt, STARTING_CHIPS]
      );
      const token = makeSession(socket, result.rows[0]);
      sendAccountState(socket, token);
    } catch (error) {
      if (error.code === '23505') return socket.emit('auth_error', 'That username is already taken.');
      console.error('Account registration failed:', error);
      socket.emit('auth_error', 'Unable to create your account. Please try again.');
    }
  });

  socket.on('sign_in', async ({ username, password }) => {
    if (typeof username !== 'string' || typeof password !== 'string') {
      return socket.emit('auth_error', 'Enter your username and password.');
    }

    try {
      const result = await db.query(
        'SELECT id, username, chips, last_daily_claim_at, password_hash, password_salt FROM poker_accounts WHERE username_key = $1',
        [normalizeUsername(username)]
      );
      const account = result.rows[0];
      if (!account || !(await passwordMatches(password, account))) {
        return socket.emit('auth_error', 'Incorrect username or password.');
      }
      delete account.password_hash;
      delete account.password_salt;
      const token = makeSession(socket, account);
      sendAccountState(socket, token);
    } catch (error) {
      console.error('Sign in failed:', error);
      socket.emit('auth_error', 'Unable to sign in. Please try again.');
    }
  });

  socket.on('restore_session', async ({ sessionToken }) => {
    const session = sessions.get(sessionToken);
    if (!session || session.expiresAt < Date.now()) {
      sessions.delete(sessionToken);
      return sendAccountState(socket);
    }

    try {
      const result = await db.query('SELECT id, username, chips, last_daily_claim_at FROM poker_accounts WHERE id = $1', [session.accountId]);
      if (!result.rowCount) return sendAccountState(socket);
      socket.data.account = result.rows[0];
      socket.data.sessionToken = sessionToken;
      sendAccountState(socket, sessionToken);
    } catch (error) {
      console.error('Session restore failed:', error);
      sendAccountState(socket);
    }
  });

  socket.on('claim_daily_chips', async () => {
    const account = requireAccount(socket);
    if (!account) return;
    if (isAccountSeated(account.id)) return socket.emit('error_msg', 'Claim your daily chips after leaving the table.');

    try {
      const result = await db.query(
        `UPDATE poker_accounts
         SET chips = chips + $1, last_daily_claim_at = NOW()
         WHERE id = $2
           AND (last_daily_claim_at IS NULL OR last_daily_claim_at <= NOW() - ($3::bigint * INTERVAL '1 millisecond'))
         RETURNING chips, last_daily_claim_at`,
        [DAILY_CHIPS, account.id, DAILY_COOLDOWN_MS]
      );
      if (!result.rowCount) {
        const refreshed = await db.query('SELECT chips, last_daily_claim_at FROM poker_accounts WHERE id = $1', [account.id]);
        Object.assign(account, refreshed.rows[0]);
        sendAccountState(socket, socket.data.sessionToken);
        return socket.emit('error_msg', 'Your daily chips are not ready yet.');
      }
      Object.assign(account, result.rows[0]);
      sendAccountState(socket, socket.data.sessionToken);
      socket.emit('account_notice', `Daily bonus claimed: +$${DAILY_CHIPS}!`);
    } catch (error) {
      console.error('Daily claim failed:', error);
      socket.emit('error_msg', 'Unable to claim daily chips. Please try again.');
    }
  });

  socket.on('sign_out', () => {
    if (socket.data.account && isAccountSeated(socket.data.account.id)) {
      return socket.emit('error_msg', 'Leave the table before signing out.');
    }
    if (socket.data.sessionToken) sessions.delete(socket.data.sessionToken);
    socket.data.account = null;
    socket.data.sessionToken = null;
    sendAccountState(socket);
  });

  socket.on('create_room', ({ tableName, ruleVariant, startingChips, ante, botLineup }) => {
    const account = requireAccount(socket);
    if (!account || isAccountSeated(account.id)) {
      if (account) socket.emit('error_msg', 'This account is already seated at a table.');
      return;
    }
    const roomId = 'table_' + Math.random().toString(36).substr(2, 6);
    const normalizedRule = normalizeVariant(ruleVariant);
    const initChips = Math.min(10_000, Math.max(10, parseInt(startingChips, 10) || 100));
    const initAnte = Math.min(100, Math.max(1, parseInt(ante, 10) || 1));

    rooms[roomId] = {
      id: roomId,
      name: typeof tableName === 'string' && tableName.trim() ? tableName.trim().replace(/[<>]/g, '').slice(0, 40) : `Table ${Object.keys(rooms).length + 1}`,
      hostId: socket.id,
      ruleVariant: normalizedRule,
      startingChips: initChips,
      ante: initAnte,
      botLineup: botLineup || ['alex', 'sam', 'jordan'],
      status: 'waiting',
      players: [{
        id: socket.id,
        accountId: account.id,
        name: account.username,
        chips: account.chips,
        cards: [],
        folded: false,
        currentBet: 0,
        isBot: false,
        persona: 'hero'
      }],
      deck: [],
      communityCards: [],
      pot: 0,
      currentStreet: 0,
      activeTurnIndex: 0,
      highestBet: 0,
      lastRaiserIndex: -1,
      followRank: null,
      awaitingQueenFollow: false,
      pendingRiverChoices: new Set(),
      pendingRollChoices: new Set(),
      pendingDrawChoices: new Set(),
      noPeekLeaderIndex: null,
      noPeekChallengerIndex: null,
      noPeekBestScore: -1,
      noPeekAwaitingReveal: false
    };

    socket.leave('lobby');
    socket.join(roomId);
    socket.emit('joined_room', { roomId });
    sendRichLog(roomId, 'STREET', `Table <b>${rooms[roomId].name}</b> created for <b>${GAME_VARIANTS[normalizedRule].label}</b>.`);
    broadcastState(roomId);
    broadcastRoomsList();
  });

  socket.on('join_room', ({ roomId }) => {
    const account = requireAccount(socket);
    if (!account || isAccountSeated(account.id)) {
      if (account) socket.emit('error_msg', 'This account is already seated at a table.');
      return;
    }
    const room = rooms[roomId];
    if (!room) return socket.emit('error_msg', 'Table not found!');
    if (room.status !== 'waiting') return socket.emit('error_msg', 'That table is already in a hand. Join when it returns to the lobby.');
    if (room.players.length >= 4) return socket.emit('error_msg', 'Table is full (4/4 Players)!');

    room.players.push({
      id: socket.id,
      accountId: account.id,
      name: account.username,
      chips: account.chips,
      cards: [],
      folded: false,
      currentBet: 0,
      isBot: false,
      persona: 'hero'
    });

    socket.leave('lobby');
    socket.join(roomId);
    socket.emit('joined_room', { roomId });
    sendRichLog(roomId, 'ACTION', `<b>${account.username}</b> joined the table.`);
    broadcastState(roomId);
    broadcastRoomsList();
  });

  socket.on('leave_room', ({ roomId }) => leaveTable(socket, roomId));

  socket.on('start_hand', ({ roomId, fillBots, customBots }) => {
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return;

    if (fillBots) {
      const chosenBots = customBots || room.botLineup || ['alex', 'sam', 'jordan'];
      let botIdx = 0;
      while (room.players.length < 4) {
        const botKey = chosenBots[botIdx % chosenBots.length] || 'alex';
        const botTemplate = BOT_ROSTER[botKey] || BOT_ROSTER.alex;
        room.players.push({
          id: `bot_${Math.random().toString(36).substr(2, 6)}`,
          name: botTemplate.name,
          chips: room.startingChips || 100,
          cards: [],
          folded: false,
          currentBet: 0,
          isBot: true,
          persona: botTemplate.persona,
          badge: botTemplate.badge
        });
        botIdx++;
      }
    }

    if (room.players.length < 2) return socket.emit('error_msg', 'Need at least 2 players to start!');
    if (room.players.filter(player => player.chips >= room.ante).length < 2) {
      return socket.emit('error_msg', `At least two players need $${room.ante} to start this hand.`);
    }

    room.status = 'playing';
    room.deck = createDeck();
    room.communityCards = [];
    room.pot = 0;
    room.followRank = null;
    room.awaitingQueenFollow = false;
    room.currentStreet = 0;
    room.noPeekLeaderIndex = null;
    room.noPeekChallengerIndex = null;
    room.noPeekBestScore = -1;
    room.noPeekAwaitingReveal = false;
    room.pendingDrawChoices = new Set();

    room.players.forEach(p => {
      p.cards = [];
      p.folded = p.chips < room.ante;
      p.currentBet = 0;
      p.handDesc = '';
      if (!p.folded) {
        p.chips -= room.ante;
        room.pot += room.ante;
      }
    });
    persistRoomBalances(room);

    const variant = getVariant(room.ruleVariant);
    sendRichLog(roomId, 'STREET', `🃏 <b>--- ${variant.label.toUpperCase()} ---</b> (Table stake $${room.ante})`);

    if (variant.family === 'community') {
      room.players.forEach(player => {
        if (!player.folded) {
          for (let i = 0; i < variant.holeCards; i++) dealCard(room, player, false, true);
        }
      });
      startStreetBetting(room, 0);
    } else if (variant.family === 'draw') {
      room.players.forEach(player => {
        if (!player.folded) {
          for (let i = 0; i < 5; i++) dealCard(room, player, false, true);
        }
      });
      startStreetBetting(room, 1);
    } else if (variant.family === 'no_peek') {
      room.players.forEach(player => {
        if (!player.folded) {
          for (let i = 0; i < 7; i++) dealCard(room, player, false, true);
        }
      });
      room.noPeekChallengerIndex = 0;
      beginNoPeekChallenge(room);
    } else if (room.ruleVariant === 'roll_your_own') {
      room.currentStreet = 3;
      for (let i = 0; i < 3; i++) {
        room.players.forEach(p => { if (!p.folded) dealCard(room, p, false, true); });
      }
      promptRollYourOwn(room);
    } else if (room.ruleVariant === 'five_card_stud') {
      room.currentStreet = 2;
      room.players.forEach(player => {
        if (!player.folded) {
          dealCard(room, player, false, true);
          dealCard(room, player, true, false);
        }
      });
      startStreetBetting(room, 2);
    } else {
      room.currentStreet = 3;
      // 3rd Street: 2 face-down (isHole = true), 1 face-up (isHole = false)
      for (let i = 0; i < 2; i++) {
        room.players.forEach(p => { if (!p.folded) dealCard(room, p, false, true); });
      }
      room.players.forEach(p => { if (!p.folded) dealCard(room, p, true, false); });
      startStreetBetting(room, 3);
    }

    broadcastRoomsList();
  });

  socket.on('roll_card_choice', ({ roomId, cardIndex }) => {
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player && player.cards[cardIndex]) {
      player.cards[cardIndex].isFaceUp = true;
      player.cards[cardIndex].isHole = false;
      sendRichLog(roomId, 'DEAL', `<b>${player.name}</b> rolled <b>${player.cards[cardIndex].rank}${player.cards[cardIndex].suit}</b> face-up.`);
      room.pendingRollChoices.delete(socket.id);
    }

    if (room.pendingRollChoices.size === 0) {
      room.players.forEach(p => {
        if (p.isBot && !p.folded) {
          const downCards = p.cards.filter(c => !c.isFaceUp);
          if (downCards.length) {
            const bestCard = downCards.sort((a,b) => b.value - a.value)[0];
            bestCard.isFaceUp = true;
            bestCard.isHole = false;
            sendRichLog(roomId, 'DEAL', `<b>${p.name}</b> rolled <b>${bestCard.rank}${bestCard.suit}</b> face-up.`);
          }
        }
      });
      startStreetBetting(room, room.currentStreet);
    } else {
      broadcastState(roomId);
    }
  });

  socket.on('take_action', ({ roomId, action, raiseAmt }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;
    if (!['fold', 'check', 'raise'].includes(action)) return socket.emit('error_msg', 'Unknown poker action.');
    const player = room.players[room.activeTurnIndex];
    if (!player || player.id !== socket.id) return;

    applyPlayerAction(room, player, action, raiseAmt);
  });

  socket.on('river_choice', ({ roomId, faceUp }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.pendingRiverChoices.delete(socket.id);
    const player = room.players.find(p => p.id === socket.id);
    if (player && !player.folded && player.cards.length === 6) {
      dealCard(room, player, faceUp, !faceUp);
      sendRichLog(roomId, 'RIVER', `<b>${player.name}</b> chose their River card <b>${faceUp ? 'FACE-UP 👁️' : 'FACE-DOWN 🔒'}</b>.`);
    }

    if (room.pendingRiverChoices.size === 0) {
      room.players.forEach(p => {
        if (p.isBot && !p.folded && p.cards.length === 6) {
          const botFaceUp = p.persona === 'aggressive' ? Math.random() < 0.65 : Math.random() < 0.25;
          dealCard(room, p, botFaceUp, !botFaceUp);
          sendRichLog(roomId, 'RIVER', `<b>${p.name}</b> received their River card <b>${botFaceUp ? 'FACE-UP 👁️' : 'FACE-DOWN 🔒'}</b>.`);
        }
      });
      startStreetBetting(room, 7);
    } else {
      broadcastState(roomId);
    }
  });

  socket.on('draw_cards', ({ roomId, cardIndexes }) => {
    const room = rooms[roomId];
    if (!room || getVariant(room.ruleVariant).family !== 'draw' || !room.pendingDrawChoices.has(socket.id)) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.folded) return;
    const safeIndexes = Array.isArray(cardIndexes)
      ? [...new Set(cardIndexes.filter(index => Number.isInteger(index) && index >= 0 && index < player.cards.length))].slice(0, 4)
      : [];
    replaceDrawCards(room, player, safeIndexes);
    room.pendingDrawChoices.delete(socket.id);
    finishDrawRoundIfReady(room);
  });

  socket.on('reveal_no_peek_card', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || getVariant(room.ruleVariant).family !== 'no_peek') return;
    const challenger = room.players[room.noPeekChallengerIndex];
    if (!challenger || challenger.id !== socket.id || challenger.folded) return;
    revealNoPeekCard(room, challenger);
  });

  socket.on('disconnect', () => {
    for (const rid in rooms) {
      if (rooms[rid].players.some(p => p.id === socket.id)) {
        leaveTable(socket, rid);
      }
    }
  });
});

function promptRollYourOwn(room) {
  const humans = room.players.filter(p => !p.isBot && !p.folded);
  room.pendingRollChoices = new Set(humans.map(p => p.id));
  humans.forEach(h => io.to(h.id).emit('prompt_roll_modal'));
  broadcastState(room.id);
}

function replaceDrawCards(room, player, cardIndexes) {
  const discardSet = new Set(cardIndexes);
  const keptCards = player.cards.filter((card, index) => !discardSet.has(index));
  player.cards = keptCards;
  for (let i = 0; i < cardIndexes.length; i++) dealCard(room, player, false, true);
  sendRichLog(room.id, 'DEAL', `<b>${player.name}</b> drew <b>${cardIndexes.length}</b> card${cardIndexes.length === 1 ? '' : 's'}.`);
}

function chooseBotDrawIndexes(player) {
  const counts = player.cards.reduce((all, card) => {
    all[card.rank] = (all[card.rank] || 0) + 1;
    return all;
  }, {});
  const singletons = player.cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => counts[card.rank] === 1)
    .sort((a, b) => a.card.value - b.card.value);
  const keepHighCards = singletons.filter(({ card }) => card.value >= 13).length;
  return singletons.slice(0, Math.max(0, Math.min(3, singletons.length - keepHighCards))).map(({ index }) => index);
}

function promptDrawRound(room) {
  const humans = room.players.filter(player => !player.isBot && !player.folded);
  room.pendingDrawChoices = new Set(humans.map(player => player.id));
  room.players.filter(player => player.isBot && !player.folded).forEach(player => {
    replaceDrawCards(room, player, chooseBotDrawIndexes(player));
  });
  humans.forEach(player => io.to(player.id).emit('prompt_draw_modal'));
  if (!room.pendingDrawChoices.size) finishDrawRoundIfReady(room);
  else broadcastState(room.id);
}

function finishDrawRoundIfReady(room) {
  if (room.pendingDrawChoices.size) {
    broadcastState(room.id);
    return;
  }
  startStreetBetting(room, 2);
}

function beginNoPeekChallenge(room) {
  const activePlayers = room.players.filter(player => !player.folded);
  if (activePlayers.length <= 1) return endHand(room, activePlayers[0]);

  let challenger = room.players[room.noPeekChallengerIndex];
  if (!challenger || challenger.folded) return advanceNoPeekChallenger(room);
  room.noPeekAwaitingReveal = true;
  broadcastState(room.id);
  if (challenger.isBot) setTimeout(() => revealNoPeekCard(room, challenger), 650);
  else io.to(challenger.id).emit('prompt_no_peek_reveal');
}

function revealNoPeekCard(room, challenger) {
  if (!room.noPeekAwaitingReveal || room.players[room.noPeekChallengerIndex]?.id !== challenger.id) return;
  const nextCard = challenger.cards.find(card => !card.isFaceUp);
  if (!nextCard) {
    challenger.folded = true;
    challenger.handDesc = 'Could not take the lead';
    sendRichLog(room.id, 'ACTION', `<b>${challenger.name}</b> ran out of cards and is out.`);
    room.noPeekAwaitingReveal = false;
    return advanceNoPeekChallenger(room);
  }

  nextCard.isFaceUp = true;
  nextCard.isHole = false;
  const visibleHand = evaluateVisibleNoPeekHand(challenger, room);
  challenger.handDesc = visibleHand.desc;
  sendRichLog(room.id, 'DEAL', `<b>${challenger.name}</b> revealed <b>${nextCard.rank}${nextCard.suit}</b> — ${visibleHand.desc}.`);

  if (room.noPeekLeaderIndex === null || visibleHand.score > room.noPeekBestScore) {
    room.noPeekLeaderIndex = room.noPeekChallengerIndex;
    room.noPeekBestScore = visibleHand.score;
    room.noPeekAwaitingReveal = false;
    sendRichLog(room.id, 'STREET', `<b>${challenger.name}</b> has the visible lead. Betting opens.`);
    startStreetBetting(room, Math.min(7, (room.currentStreet || 0) + 1));
    return;
  }

  if (!challenger.cards.some(card => !card.isFaceUp)) {
    challenger.folded = true;
    challenger.handDesc = 'Could not take the lead';
    sendRichLog(room.id, 'ACTION', `<b>${challenger.name}</b> could not beat the visible leader and is out.`);
    room.noPeekAwaitingReveal = false;
    return advanceNoPeekChallenger(room);
  }

  broadcastState(room.id);
  if (challenger.isBot) setTimeout(() => revealNoPeekCard(room, challenger), 450);
  else io.to(challenger.id).emit('prompt_no_peek_reveal');
}

function advanceNoPeekChallenger(room) {
  const activeIndexes = room.players.map((player, index) => player.folded ? -1 : index).filter(index => index >= 0);
  if (activeIndexes.length <= 1) return endHand(room, room.players[activeIndexes[0]]);

  let best = { index: null, score: -1 };
  activeIndexes.forEach(index => {
    const result = evaluateVisibleNoPeekHand(room.players[index], room);
    if (result.score > best.score) best = { index, score: result.score };
  });
  room.noPeekLeaderIndex = best.index;
  room.noPeekBestScore = best.score;

  let nextIndex = room.noPeekChallengerIndex;
  do {
    nextIndex = (nextIndex + 1) % room.players.length;
  } while (room.players[nextIndex].folded && nextIndex !== room.noPeekChallengerIndex);

  if (nextIndex === room.noPeekLeaderIndex) {
    room.players.forEach(player => player.cards.forEach(card => { card.isFaceUp = true; }));
    return endHand(room, room.players[room.noPeekLeaderIndex]);
  }
  room.noPeekChallengerIndex = nextIndex;
  beginNoPeekChallenge(room);
}

function leaveTable(socket, roomId) {
  const room = rooms[roomId];
  if (!room) return;

  socket.leave(roomId);
  socket.join('lobby');
  const departingPlayer = room.players.find(p => p.id === socket.id);
  persistPlayerBalance(departingPlayer).catch(error => console.error('Unable to save departing player balance:', error));
  room.players = room.players.filter(p => p.id !== socket.id);

  sendRichLog(roomId, 'ACTION', `<b>${departingPlayer?.name || 'A player'}</b> left the table.`);

  const humanPlayers = room.players.filter(p => !p.isBot);
  if (humanPlayers.length === 0) {
    delete rooms[roomId];
  } else {
    if (room.hostId === socket.id) {
      room.hostId = humanPlayers[0].id;
      sendRichLog(roomId, 'ACTION', `Host passed to <b>${humanPlayers[0].name}</b>.`);
    }
    broadcastState(roomId);
  }

  socket.emit('left_room');
  broadcastRoomsList();
}

function dealCard(room, player, isFaceUp, isHole = false) {
  const card = room.deck.pop();
  if (!card) return;
  card.isFaceUp = isFaceUp;
  card.isHole = isHole;
  player.cards.push(card);

  if (isFaceUp) {
    sendRichLog(room.id, 'DEAL', `<b>${player.name}</b> dealt <b>${card.rank}${card.suit}</b> (Face-Up).`);
  } else {
    sendRichLog(room.id, 'DEAL', `<b>${player.name}</b> dealt a Hole card (Face-Down).`);
  }

  if (room.ruleVariant === 'follow' && isFaceUp) {
    if (room.awaitingQueenFollow) {
      room.followRank = card.rank;
      room.awaitingQueenFollow = false;
      sendRichLog(room.id, 'WILD', `👑 Follow Queen Activated: <b>${card.rank}s</b> are now WILD alongside Queens!`);
    } else if (card.rank === 'Q') {
      room.awaitingQueenFollow = true;
      sendRichLog(room.id, 'WILD', `👑 Queen dealt face-up! Next face-up card establishes the wild rank!`);
    }
  }
}

function dealCommunityCards(room, count) {
  for (let i = 0; i < count; i++) {
    const card = room.deck.pop();
    if (!card) return;
    card.isFaceUp = true;
    card.isHole = false;
    room.communityCards.push(card);
    sendRichLog(room.id, 'DEAL', `Board card: <b>${card.rank}${card.suit}</b>.`);
  }
}

function getStreetLabel(room) {
  const family = getVariant(room.ruleVariant).family;
  if (room.currentStreet === 8) return 'Showdown';
  if (family === 'community') return ({ 0: 'Pre-Flop', 1: 'Flop', 2: 'Turn', 3: 'River', 4: 'Showdown' })[room.currentStreet] || 'Community Cards';
  if (family === 'draw') return ({ 1: 'Opening Bet', 2: 'Final Bet', 3: 'Showdown' })[room.currentStreet] || 'Draw';
  if (family === 'no_peek') return room.noPeekAwaitingReveal ? 'Reveal to Take the Lead' : `No Peek Round ${room.currentStreet || 1}`;
  return ({ 2: '2nd Street', 3: '3rd Street', 4: '4th Street', 5: '5th Street', 6: '6th Street', 7: '7th Street (The River)' })[room.currentStreet] || 'Stud';
}

function startStreetBetting(room, street) {
  room.currentStreet = street;
  room.highestBet = 0;
  room.players.forEach(p => p.currentBet = 0);

  sendRichLog(room.id, 'STREET', `🔔 <b>--- ${getStreetLabel(room)} Betting Round ---</b>`);

  const activePlayers = room.players.filter(p => !p.folded);
  if (activePlayers.length <= 1) {
    endHand(room, activePlayers[0]);
    return;
  }

  const bettingPlayers = activePlayers.filter(p => p.chips > 0);
  if (bettingPlayers.length <= 1) {
    sendRichLog(room.id, 'ACTION', '🪙 All-in players automatically check; no further betting is possible.');
    return advanceStreet(room);
  }

  let highestVal = -1;
  let highestIdx = 0;
  if (getVariant(room.ruleVariant).family === 'no_peek' && room.noPeekLeaderIndex !== null) {
    highestIdx = room.noPeekLeaderIndex;
  } else {
    room.players.forEach((p, idx) => {
      if (!p.folded && p.chips > 0) {
        const upCards = p.cards.filter(c => c.isFaceUp);
        const lowHole = getPlayerLowHoleRank(p);
        const top = upCards.length ? Math.max(...upCards.map(c => isWild(c, room.ruleVariant, room.followRank, lowHole) ? 99 : c.value)) : 0;
        if (top > highestVal) {
          highestVal = top;
          highestIdx = idx;
        }
      }
    });
  }

  room.activeTurnIndex = highestIdx;
  room.lastRaiserIndex = highestIdx;

  broadcastState(room.id);
  triggerTurn(room);
}

function triggerTurn(room) {
  const active = room.players.filter(p => !p.folded);
  if (active.length <= 1) {
    endHand(room, active[0]);
    return;
  }

  const p = room.players[room.activeTurnIndex];
  if (!p) return;
  if (p.folded || p.chips <= 0) {
    advanceTurn(room);
    return;
  }

  if (p.isBot) {
    setTimeout(() => runBotTurn(room, p), 850);
  } else {
    broadcastState(room.id);
  }
}

function runBotTurn(room, bot) {
  const toCall = room.highestBet - bot.currentBet;
  const minInc = room.currentStreet >= 5 ? 4 : 2;
  const lowHole = getPlayerLowHoleRank(bot);
  const hand = evaluatePlayerHand(bot, room);
  const wildCount = bot.cards.filter(c => isWild(c, room.ruleVariant, room.followRank, lowHole)).length;

  let action = 'check';
  let raiseAmt = toCall + minInc;

  if (bot.persona === 'calling_station') {
    if (toCall === 0) {
      action = (hand.score >= 5000000 && Math.random() < 0.25) ? 'raise' : 'check';
    } else {
      action = (toCall > bot.chips) ? 'check' : ((room.currentStreet === 7 && hand.score < 2000000 && Math.random() < 0.04) ? 'fold' : 'check');
    }
  } else if (bot.persona === 'aggressive' || bot.persona === 'maniac') {
    if (toCall === 0) {
      if (Math.random() < (bot.persona === 'maniac' ? 0.8 : 0.65)) {
        action = 'raise';
        raiseAmt = Math.min(bot.chips, minInc * 2);
      } else {
        action = 'check';
      }
    } else {
      if (Math.random() < 0.45) {
        action = 'raise';
        raiseAmt = Math.min(bot.chips, toCall + minInc);
      } else if (Math.random() < 0.94) {
        action = 'check';
      } else {
        action = (room.currentStreet >= 6 && hand.score < 2000000) ? 'fold' : 'check';
      }
    }
  } else if (bot.persona === 'tight_passive') {
    if (toCall === 0) {
      action = hand.score >= 5000000 ? 'raise' : 'check';
    } else {
      action = (hand.score >= 3000000 || wildCount > 0) ? 'check' : 'fold';
    }
  } else {
    // wild_chaser
    if (wildCount > 0 || hand.score >= 5000000) {
      action = (Math.random() < 0.7) ? 'raise' : 'check';
      raiseAmt = Math.min(bot.chips, toCall + minInc + (wildCount * 2));
    } else {
      action = (toCall === 0) ? ((Math.random() < 0.3) ? 'raise' : 'check') : ((room.currentStreet <= 5 || Math.random() < 0.88) ? 'check' : 'fold');
    }
  }

  applyPlayerAction(room, bot, action, raiseAmt);
}

function applyPlayerAction(room, player, action, raiseAmt = 0) {
  const toCall = room.highestBet - player.currentBet;

  if (action === 'fold') {
    player.folded = true;
    sendRichLog(room.id, 'ACTION', `<b>${player.name}</b> folded.`);
  } else if (action === 'check') {
    if (toCall > 0) {
      const amt = Math.min(toCall, player.chips);
      player.chips -= amt;
      player.currentBet += amt;
      room.pot += amt;
      sendRichLog(room.id, 'ACTION', `<b>${player.name}</b> called $${amt}.`);
    } else {
      sendRichLog(room.id, 'ACTION', `<b>${player.name}</b> checked.`);
    }
  } else if (action === 'raise') {
    const minIncrement = room.currentStreet >= 5 ? 4 : 2;
    const requested = Number.isFinite(Number(raiseAmt)) ? Math.floor(Number(raiseAmt)) : 0;
    const minimumContribution = Math.min(player.chips, toCall + minIncrement);
    const amt = Math.min(player.chips, Math.max(minimumContribution, requested));
    player.chips -= amt;
    player.currentBet += amt;
    const raised = player.currentBet > room.highestBet;
    if (raised) {
      room.highestBet = player.currentBet;
      room.lastRaiserIndex = room.activeTurnIndex;
    }
    room.pot += amt;
    sendRichLog(room.id, 'ACTION', raised
      ? `💥 <b>${player.name}</b> bet/raised to $${room.highestBet} (+$${amt})!`
      : `<b>${player.name}</b> called all-in for $${amt}.`);
  }

  persistRoomBalances(room);
  broadcastState(room.id);
  advanceTurn(room);
}

function advanceTurn(room) {
  let count = 0;
  do {
    room.activeTurnIndex = (room.activeTurnIndex + 1) % room.players.length;
    count++;
  } while ((room.players[room.activeTurnIndex].folded || room.players[room.activeTurnIndex].chips <= 0) && count < room.players.length);

  const activePlayers = room.players.filter(p => !p.folded);
  if (activePlayers.length <= 1) {
    endHand(room, activePlayers[0]);
    return;
  }

  const bettingPlayers = activePlayers.filter(p => p.chips > 0);
  if (bettingPlayers.length <= 1) {
    sendRichLog(room.id, 'ACTION', '🪙 All-in players automatically check; no further betting is possible.');
    advanceStreet(room);
    return;
  }

  const allMatched = bettingPlayers.every(p => p.currentBet === room.highestBet);

  if (allMatched && (room.activeTurnIndex === room.lastRaiserIndex || (room.highestBet === 0 && count >= room.players.length))) {
    advanceStreet(room);
  } else {
    triggerTurn(room);
  }
}

function advanceStreet(room) {
  const variant = getVariant(room.ruleVariant);

  if (variant.family === 'community') {
    if (room.currentStreet === 0) {
      dealCommunityCards(room, 3);
      return startStreetBetting(room, 1);
    }
    if (room.currentStreet === 1) {
      dealCommunityCards(room, 1);
      return startStreetBetting(room, 2);
    }
    if (room.currentStreet === 2) {
      dealCommunityCards(room, 1);
      return startStreetBetting(room, 3);
    }
    return showdown(room);
  }

  if (variant.family === 'draw') {
    if (room.currentStreet === 1) return promptDrawRound(room);
    return showdown(room);
  }

  if (variant.family === 'no_peek') return advanceNoPeekChallenger(room);

  if (variant.maxStreet === 5) {
    if (room.currentStreet < 5) {
      room.players.forEach(player => { if (!player.folded) dealCard(room, player, true, false); });
      return startStreetBetting(room, room.currentStreet + 1);
    }
    return showdown(room);
  }

  if (room.currentStreet < 6) {
    room.currentStreet++;
    if (room.ruleVariant === 'roll_your_own') {
      room.players.forEach(p => { if (!p.folded) dealCard(room, p, false, true); });
      promptRollYourOwn(room);
    } else {
      room.players.forEach(p => { if (!p.folded) dealCard(room, p, true, false); });
      startStreetBetting(room, room.currentStreet);
    }
  } else if (room.currentStreet === 6) {
    const humans = room.players.filter(p => !p.isBot && !p.folded);
    room.pendingRiverChoices = new Set(humans.map(p => p.id));
    if (room.pendingRiverChoices.size === 0) {
      room.players.forEach(p => { if (!p.folded) dealCard(room, p, false, true); });
      startStreetBetting(room, 7);
    } else {
      humans.forEach(h => io.to(h.id).emit('prompt_river_modal'));
      broadcastState(room.id);
    }
  } else {
    showdown(room);
  }
}

function showdown(room) {
  room.noPeekAwaitingReveal = false;
  // Flip face-up for visual showdown display WITHOUT clearing card.isHole!
  room.players.forEach(p => {
    if (!p.folded) p.cards.forEach(c => c.isFaceUp = true);
  });

  let winners = [];
  let bestScore = -1;
  let bestDesc = '';

  sendRichLog(room.id, 'SHOWDOWN', `🏆 <b>=== SHOWDOWN RESULTS ===</b>`);

  room.players.forEach(p => {
    if (!p.folded) {
      const lowHole = getPlayerLowHoleRank(p);
      const res = evaluatePlayerHand(p, room);
      p.handDesc = res.desc;

      sendRichLog(room.id, 'SHOWDOWN', `<b>${p.name}</b> holds: <b>${res.desc}</b> ${lowHole ? `(Low Hole Wild: ${lowHole}s)` : ''}`);

      if (res.score > bestScore) {
        bestScore = res.score;
        bestDesc = res.desc;
        winners = [p];
      } else if (res.score === bestScore) {
        winners.push(p);
      }
    }
  });

  const split = Math.floor(room.pot / winners.length);
  winners.forEach(w => w.chips += split);
  sendRichLog(room.id, 'SHOWDOWN', `🎉 <b>${winners.map(w => w.name).join(', ')}</b> wins $${split} with <b>${bestDesc}</b>!`);

  room.pot = 0;
  room.currentStreet = 8;
  room.status = 'waiting';
  persistRoomBalances(room);
  broadcastState(room.id, `🏆 Showdown! ${winners.map(w => w.name).join(', ')} won with ${bestDesc}!`);
  broadcastRoomsList();
}

function endHand(room, winner) {
  if (winner) {
    room.noPeekAwaitingReveal = false;
    winner.chips += room.pot;
    sendRichLog(room.id, 'SHOWDOWN', `🏆 <b>${winner.name}</b> collected the uncontested pot of $${room.pot}.`);
    room.pot = 0;
    room.currentStreet = 8;
    room.status = 'waiting';
    persistRoomBalances(room);
    broadcastState(room.id, `🏆 ${winner.name} won the pot!`);
    broadcastRoomsList();
  }
}

function broadcastState(roomId, message = null) {
  const room = rooms[roomId];
  if (!room) return;
  const variant = getVariant(room.ruleVariant);

  room.players.forEach(recipient => {
    if (recipient.isBot) return;

    const recipientLowHole = getPlayerLowHoleRank(recipient);

    const sanitizedPlayers = room.players.map(p => {
      const pLowHole = getPlayerLowHoleRank(p);
      return {
        id: p.id,
        name: p.name,
        chips: p.chips,
        folded: p.folded,
        currentBet: p.currentBet,
        isBot: p.isBot,
        persona: p.persona,
        badge: p.badge,
        lowHoleRank: (room.currentStreet === 8 || p.id === recipient.id) ? pLowHole : null,
        handDesc: p.handDesc || (p.id === recipient.id && p.cards.length >= 5 && variant.family !== 'no_peek' ? evaluatePlayerHand(p, room).desc : ''),
        cards: p.cards.map(c => {
          const ownerCanSee = p.id === recipient.id && variant.family !== 'no_peek';
          if (room.currentStreet === 8 || ownerCanSee || c.isFaceUp) {
            const cardWild = isWild(c, room.ruleVariant, room.followRank, pLowHole);
            return { ...c, isWild: cardWild };
          }
          return { isFaceUp: false, isHole: c.isHole };
        })
      };
    });

    io.to(recipient.id).emit('game_state', {
      roomId: room.id,
      tableName: room.name,
      gameLabel: variant.label,
      gameFamily: variant.family,
      gameSummary: variant.summary,
      hostId: room.hostId,
      status: room.status,
      players: sanitizedPlayers,
      pot: room.pot,
      currentStreet: room.currentStreet,
      activeTurnIndex: room.activeTurnIndex,
      highestBet: room.highestBet,
      ruleVariant: room.ruleVariant,
      streetLabel: getStreetLabel(room),
      communityCards: room.communityCards || [],
      drawAwaitingChoice: room.pendingDrawChoices.size > 0,
      noPeekAwaitingReveal: room.noPeekAwaitingReveal,
      noPeekChallengerId: room.noPeekChallengerIndex === null ? null : room.players[room.noPeekChallengerIndex]?.id,
      followRank: room.followRank,
      awaitingQueenFollow: room.awaitingQueenFollow,
      message
    });
  });
}

const PORT = process.env.PORT || 10000;
if (require.main === module) {
  initializeDatabase()
    .then(() => server.listen(PORT, () => console.log(`Pyropot Poker Room online on port ${PORT}`)))
    .catch(error => {
      console.error('Database initialization failed:', error);
      process.exit(1);
    });
}

module.exports = {
  GAME_VARIANTS,
  normalizeVariant,
  getVariant,
  evaluateBest7CardHand,
  evaluateOmahaHand,
  evaluatePlayerHand,
  evaluateVisibleNoPeekHand,
  isWild
};
