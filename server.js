require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*', methods: ['GET', 'POST'] }
});

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13, 'A':14 };
const ANTE = 1;

const rooms = {};

function getPublicRooms() {
  return Object.values(rooms).map(r => ({
    id: r.id,
    name: r.name,
    ruleVariant: r.ruleVariant,
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
      deck.push({ rank: r, suit: s, value: RANK_VALUES[r], isFaceUp: false });
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

  if (ruleVariant === 'deuces' && card.rank === '2') return true;

  if (ruleVariant === 'follow') {
    if (card.rank === 'Q') return true;
    if (followRank && card.rank === followRank) return true;
  }

  if (ruleVariant === 'seven_makes') {
    // 7s are wild
    if (card.rank === '7') return true;
    if (card.isSevenPairWild) return true;
  }

  if (ruleVariant === 'low_hole') {
    if (playerLowHoleRank && card.rank === playerLowHoleRank) return true;
  }

  return false;
}

function getPlayerLowHoleRank(player) {
  const holeCards = player.cards.filter(c => !c.isFaceUp);
  if (!holeCards.length) return null;
  const lowestVal = Math.min(...holeCards.map(c => c.value));
  const card = holeCards.find(c => c.value === lowestVal);
  return card ? card.rank : null;
}

/* Tag pairs summing to 7 for "Seven and What Makes It" (A=1 + 6=7, 2+5=7, 3+4=7) */
function applySevenAndWhatMakesIt(cards) {
  // Clear tags
  cards.forEach(c => c.isSevenPairWild = false);
  const pairPairs = [ [14, 6], [2, 5], [3, 4] ]; // A is 14 -> value 1 in sum with 6

  pairPairs.forEach(([r1, r2]) => {
    const c1 = cards.find(c => (c.value === r1 || (r1===14 && c.rank==='A')) && !c.isSevenPairWild && c.rank !== '7');
    const c2 = cards.find(c => c.value === r2 && !c.isSevenPairWild && c.rank !== '7');
    if (c1 && c2 && c1 !== c2) {
      c1.isSevenPairWild = true;
      c2.isSevenPairWild = true;
    }
  });
}

/* ================= 7-CARD COMBINATORIAL HAND EVALUATOR ================= */
function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];
  const head = arr[0];
  const tail = arr.slice(1);
  const withHead = combinations(tail, k - 1).map(c => [head, ...c]);
  const withoutHead = combinations(tail, k);
  return [...withHead, ...withoutHead];
}

function evaluate5CardCombo(fiveCards, ruleVariant, followRank, lowHoleRank) {
  const wilds = fiveCards.filter(c => isWild(c, ruleVariant, followRank, lowHoleRank));
  const naturals = fiveCards.filter(c => !isWild(c, ruleVariant, followRank, lowHoleRank));
  const W = wilds.length;

  if (W === 5) {
    return { score: 10000000 + 14, desc: 'Five of a Kind (Aces)' };
  }

  // 1. FIVE OF A KIND
  const rankMap = {};
  naturals.forEach(c => rankMap[c.value] = (rankMap[c.value] || 0) + 1);
  const distinctRanks = Object.keys(rankMap).map(Number).sort((a,b) => b - a);

  for (let r of distinctRanks) {
    if (rankMap[r] + W >= 5) {
      return { score: 10000000 + r, desc: `Five of a Kind` };
    }
  }

  // 2. STRAIGHT FLUSH & FLUSH
  const suitMap = {};
  naturals.forEach(c => {
    suitMap[c.suit] = suitMap[c.suit] || [];
    suitMap[c.suit].push(c.value);
  });

  let bestStraightFlush = null;
  for (let suit of SUITS) {
    const suitVals = suitMap[suit] || [];
    if (suitVals.length + W >= 5) {
      // Check straight flush
      const sfHigh = getStraightHighRank(suitVals, W);
      if (sfHigh) {
        if (!bestStraightFlush || sfHigh > bestStraightFlush) bestStraightFlush = sfHigh;
      }
    }
  }
  if (bestStraightFlush) {
    return { score: 9000000 + bestStraightFlush, desc: bestStraightFlush === 14 ? 'Royal Flush' : 'Straight Flush' };
  }

  // 3. FOUR OF A KIND
  for (let r of distinctRanks) {
    if (rankMap[r] + W >= 4) {
      return { score: 8000000 + r, desc: 'Four of a Kind' };
    }
  }

  // 4. FULL HOUSE
  for (let r1 of distinctRanks) {
    const neededForTrip = Math.max(0, 3 - rankMap[r1]);
    if (neededForTrip <= W) {
      const remainingWilds = W - neededForTrip;
      for (let r2 of distinctRanks) {
        if (r2 !== r1) {
          const neededForPair = Math.max(0, 2 - rankMap[r2]);
          if (neededForPair <= remainingWilds) {
            return { score: 7000000 + (r1 * 100) + r2, desc: 'Full House' };
          }
        }
      }
      if (remainingWilds >= 2 && distinctRanks.length === 1) {
        return { score: 7000000 + (r1 * 100) + 14, desc: 'Full House' };
      }
    }
  }

  // 5. FLUSH
  for (let suit of SUITS) {
    const sCards = suitMap[suit] || [];
    if (sCards.length + W >= 5) {
      const sorted = [...sCards].sort((a,b) => b - a);
      return { score: 6000000 + (sorted[0] || 14), desc: 'Flush' };
    }
  }

  // 6. STRAIGHT
  const allNatValues = naturals.map(c => c.value);
  const straightHigh = getStraightHighRank(allNatValues, W);
  if (straightHigh) {
    return { score: 5000000 + straightHigh, desc: `${straightHigh}-High Straight` };
  }

  // 7. THREE OF A KIND
  for (let r of distinctRanks) {
    if (rankMap[r] + W >= 3) {
      return { score: 4000000 + r, desc: 'Three of a Kind' };
    }
  }

  // 8. TWO PAIR
  if (distinctRanks.length >= 2) {
    if (rankMap[distinctRanks[0]] >= 2 && rankMap[distinctRanks[1]] >= 2) {
      return { score: 3000000 + (distinctRanks[0]*100) + distinctRanks[1], desc: 'Two Pair' };
    }
  }

  // 9. ONE PAIR
  for (let r of distinctRanks) {
    if (rankMap[r] + W >= 2) {
      return { score: 2000000 + r, desc: 'One Pair' };
    }
  }

  // 10. HIGH CARD
  const topVal = naturals.length ? Math.max(...naturals.map(c => c.value)) : 14;
  return { score: 1000000 + topVal, desc: 'High Card' };
}

function getStraightHighRank(valuesList, wildCount) {
  const uniq = Array.from(new Set(valuesList));
  if (uniq.includes(14)) uniq.push(1); // Ace low support (A-2-3-4-5)

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

/* ================= SERVER SOCKET LOGIC ================= */
io.on('connection', (socket) => {
  socket.join('lobby');
  socket.emit('rooms_list', getPublicRooms());

  socket.on('create_room', ({ tableName, playerName, ruleVariant }) => {
    const roomId = 'table_' + Math.random().toString(36).substr(2, 6);
    rooms[roomId] = {
      id: roomId,
      name: tableName || `Table ${Object.keys(rooms).length + 1}`,
      hostId: socket.id,
      ruleVariant: ruleVariant || 'standard',
      status: 'waiting',
      players: [{
        id: socket.id,
        name: playerName || 'Host',
        chips: 100,
        cards: [],
        folded: false,
        currentBet: 0,
        isBot: false,
        persona: 'hero'
      }],
      deck: [],
      pot: 0,
      currentStreet: 0,
      activeTurnIndex: 0,
      highestBet: 0,
      lastRaiserIndex: -1,
      followRank: null,
      awaitingQueenFollow: false,
      pendingRiverChoices: new Set(),
      pendingRollChoices: new Set()
    };

    socket.leave('lobby');
    socket.join(roomId);
    socket.emit('joined_room', { roomId });
    broadcastState(roomId);
    broadcastRoomsList();
  });

  socket.on('join_room', ({ roomId, playerName }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error_msg', 'Table not found!');
    if (room.players.length >= 4) return socket.emit('error_msg', 'Table is full!');

    room.players.push({
      id: socket.id,
      name: playerName || `Player ${room.players.length + 1}`,
      chips: 100,
      cards: [],
      folded: false,
      currentBet: 0,
      isBot: false,
      persona: 'hero'
    });

    socket.leave('lobby');
    socket.join(roomId);
    socket.emit('joined_room', { roomId });
    broadcastState(roomId);
    broadcastRoomsList();
  });

  socket.on('leave_room', ({ roomId }) => leaveTable(socket, roomId));

  socket.on('start_hand', ({ roomId, fillBots }) => {
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return;

    if (fillBots) {
      const botPool = [
        { name: 'Alex (Aggro)', persona: 'aggressive' },
        { name: 'Sam (Station)', persona: 'calling_station' },
        { name: 'Jordan (Gambler)', persona: 'wild_chaser' }
      ];
      while (room.players.length < 4) {
        const botConfig = botPool[room.players.length - 1] || { name: `Bot ${room.players.length}`, persona: 'aggressive' };
        room.players.push({
          id: `bot_${Math.random().toString(36).substr(2, 6)}`,
          name: botConfig.name,
          chips: 100,
          cards: [],
          folded: false,
          currentBet: 0,
          isBot: true,
          persona: botConfig.persona
        });
      }
    }

    if (room.players.length < 2) return socket.emit('error_msg', 'Need at least 2 players!');

    room.status = 'playing';
    room.deck = createDeck();
    room.pot = 0;
    room.followRank = null;
    room.awaitingQueenFollow = false;
    room.currentStreet = 3;

    room.players.forEach(p => {
      p.cards = [];
      p.folded = p.chips < ANTE;
      p.currentBet = 0;
      p.handDesc = '';
      if (!p.folded) {
        p.chips -= ANTE;
        room.pot += ANTE;
      }
    });

    if (room.ruleVariant === 'roll_your_own') {
      // Roll Your Own: Deal 3 down, then prompt each player to choose 1 to roll face-up
      for (let i = 0; i < 3; i++) {
        room.players.forEach(p => { if (!p.folded) dealCard(room, p, false); });
      }
      promptRollYourOwn(room);
    } else {
      // Standard 7-Card Stud Street 3: 2 down, 1 up
      for (let i = 0; i < 2; i++) {
        room.players.forEach(p => { if (!p.folded) dealCard(room, p, false); });
      }
      room.players.forEach(p => { if (!p.folded) dealCard(room, p, true); });
      startStreetBetting(room, 3);
    }

    broadcastRoomsList();
  });

  /* Roll Your Own Card Selection */
  socket.on('roll_card_choice', ({ roomId, cardIndex }) => {
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player && player.cards[cardIndex]) {
      player.cards[cardIndex].isFaceUp = true;
      room.pendingRollChoices.delete(socket.id);
    }

    if (room.pendingRollChoices.size === 0) {
      // Auto roll bots
      room.players.forEach(p => {
        if (p.isBot && !p.folded) {
          const downCards = p.cards.filter(c => !c.isFaceUp);
          if (downCards.length) {
            const bestCard = downCards.sort((a,b) => b.value - a.value)[0];
            bestCard.isFaceUp = true;
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
      dealCard(room, player, faceUp);
    }

    if (room.pendingRiverChoices.size === 0) {
      room.players.forEach(p => {
        if (p.isBot && !p.folded && p.cards.length === 6) {
          const botFaceUp = p.persona === 'aggressive' ? Math.random() < 0.65 : Math.random() < 0.25;
          dealCard(room, p, botFaceUp);
        }
      });
      startStreetBetting(room, 7);
    } else {
      broadcastState(roomId);
    }
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

function leaveTable(socket, roomId) {
  const room = rooms[roomId];
  if (!room) return;

  socket.leave(roomId);
  socket.join('lobby');
  room.players = room.players.filter(p => p.id !== socket.id);

  const humanPlayers = room.players.filter(p => !p.isBot);
  if (humanPlayers.length === 0) {
    delete rooms[roomId];
  } else {
    if (room.hostId === socket.id) {
      room.hostId = humanPlayers[0].id;
    }
    broadcastState(roomId);
  }

  socket.emit('left_room');
  broadcastRoomsList();
}

function dealCard(room, player, isFaceUp) {
  const card = room.deck.pop();
  if (!card) return;
  card.isFaceUp = isFaceUp;
  player.cards.push(card);

  if (room.ruleVariant === 'follow' && isFaceUp) {
    if (room.awaitingQueenFollow) {
      room.followRank = card.rank;
      room.awaitingQueenFollow = false;
      io.to(room.id).emit('notification', { text: `👑 Queen followed by ${card.rank}! Queens & ${card.rank}s are WILD!` });
    } else if (card.rank === 'Q') {
      room.awaitingQueenFollow = true;
      io.to(room.id).emit('notification', { text: `👑 Face-up Queen dealt! Next face-up card sets wild rank!` });
    }
  }
}

function startStreetBetting(room, street) {
  room.currentStreet = street;
  room.highestBet = 0;
  room.players.forEach(p => p.currentBet = 0);

  let highestVal = -1;
  let highestIdx = 0;
  room.players.forEach((p, idx) => {
    if (!p.folded) {
      const upCards = p.cards.filter(c => c.isFaceUp);
      const lowHole = getPlayerLowHoleRank(p);
      const top = upCards.length ? Math.max(...upCards.map(c => isWild(c, room.ruleVariant, room.followRank, lowHole) ? 99 : c.value)) : 0;
      if (top > highestVal) {
        highestVal = top;
        highestIdx = idx;
      }
    }
  });

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
  if (p.folded) {
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
  const hand = evaluateBest7CardHand(bot.cards, room.ruleVariant, room.followRank, lowHole);
  const wildCount = bot.cards.filter(c => isWild(c, room.ruleVariant, room.followRank, lowHole)).length;

  let action = 'check';
  let raiseAmt = toCall + minInc;

  if (bot.persona === 'calling_station') {
    if (toCall === 0) {
      action = (hand.score >= 5000000 && Math.random() < 0.25) ? 'raise' : 'check';
    } else {
      action = (toCall > bot.chips) ? 'check' : ((room.currentStreet === 7 && hand.score < 2000000 && Math.random() < 0.04) ? 'fold' : 'check');
    }
  } else if (bot.persona === 'aggressive') {
    if (toCall === 0) {
      if (Math.random() < 0.65) {
        action = 'raise';
        raiseAmt = Math.min(bot.chips, minInc * (Math.random() < 0.5 ? 2 : 1));
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
  } else {
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
    io.to(room.id).emit('notification', { text: `${player.name} folds.` });
  } else if (action === 'check') {
    if (toCall > 0) {
      const amt = Math.min(toCall, player.chips);
      player.chips -= amt;
      player.currentBet += amt;
      room.pot += amt;
      io.to(room.id).emit('notification', { text: `${player.name} calls $${amt}.` });
    } else {
      io.to(room.id).emit('notification', { text: `${player.name} checks.` });
    }
  } else if (action === 'raise') {
    const amt = Math.min(raiseAmt, player.chips);
    player.chips -= amt;
    player.currentBet += amt;
    room.highestBet = player.currentBet;
    room.lastRaiserIndex = room.activeTurnIndex;
    room.pot += amt;
    io.to(room.id).emit('notification', { text: `💥 ${player.name} raises to $${room.highestBet} (+$${amt})!` });
  }

  broadcastState(room.id);
  advanceTurn(room);
}

function advanceTurn(room) {
  let count = 0;
  do {
    room.activeTurnIndex = (room.activeTurnIndex + 1) % room.players.length;
    count++;
  } while (room.players[room.activeTurnIndex].folded && count < room.players.length);

  const active = room.players.filter(p => !p.folded);
  const allMatched = active.every(p => p.currentBet === room.highestBet);

  if (allMatched && (room.activeTurnIndex === room.lastRaiserIndex || (room.highestBet === 0 && count >= room.players.length))) {
    advanceStreet(room);
  } else {
    triggerTurn(room);
  }
}

function advanceStreet(room) {
  if (room.currentStreet < 6) {
    room.currentStreet++;
    if (room.ruleVariant === 'roll_your_own') {
      // Deal down card, then prompt roll
      room.players.forEach(p => { if (!p.folded) dealCard(room, p, false); });
      promptRollYourOwn(room);
    } else {
      room.players.forEach(p => { if (!p.folded) dealCard(room, p, true); });
      startStreetBetting(room, room.currentStreet);
    }
  } else if (room.currentStreet === 6) {
    const humans = room.players.filter(p => !p.isBot && !p.folded);
    room.pendingRiverChoices = new Set(humans.map(p => p.id));
    if (room.pendingRiverChoices.size === 0) {
      room.players.forEach(p => { if (!p.folded) dealCard(room, p, false); });
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
  room.players.forEach(p => {
    if (!p.folded) p.cards.forEach(c => c.isFaceUp = true);
  });

  let winners = [];
  let bestScore = -1;
  let bestDesc = '';

  room.players.forEach(p => {
    if (!p.folded) {
      const lowHole = getPlayerLowHoleRank(p);
      const res = evaluateBest7CardHand(p.cards, room.ruleVariant, room.followRank, lowHole);
      p.handDesc = res.desc;
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
  room.pot = 0;
  room.currentStreet = 8;
  room.status = 'waiting';
  broadcastState(room.id, `🏆 Showdown! ${winners.map(w => w.name).join(', ')} won with ${bestDesc}!`);
  broadcastRoomsList();
}

function endHand(room, winner) {
  if (winner) {
    winner.chips += room.pot;
    room.pot = 0;
    room.currentStreet = 8;
    room.status = 'waiting';
    broadcastState(room.id, `🏆 ${winner.name} won the pot (Everyone else folded)!`);
    broadcastRoomsList();
  }
}

function broadcastState(roomId, message = null) {
  const room = rooms[roomId];
  if (!room) return;

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
        lowHoleRank: (room.currentStreet === 8 || p.id === recipient.id) ? pLowHole : null,
        handDesc: p.handDesc || (p.id === recipient.id && p.cards.length >= 5 ? evaluateBest7CardHand(p.cards, room.ruleVariant, room.followRank, recipientLowHole).desc : ''),
        cards: p.cards.map(c => {
          if (room.currentStreet === 8 || p.id === recipient.id || c.isFaceUp) {
            const cardWild = isWild(c, room.ruleVariant, room.followRank, pLowHole);
            return { ...c, isWild: cardWild };
          }
          return { isFaceUp: false };
        })
      };
    });

    io.to(recipient.id).emit('game_state', {
      roomId: room.id,
      tableName: room.name,
      hostId: room.hostId,
      status: room.status,
      players: sanitizedPlayers,
      pot: room.pot,
      currentStreet: room.currentStreet,
      activeTurnIndex: room.activeTurnIndex,
      highestBet: room.highestBet,
      ruleVariant: room.ruleVariant,
      followRank: room.followRank,
      awaitingQueenFollow: room.awaitingQueenFollow,
      message
    });
  });
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Casino Engine Online on port ${PORT}`));