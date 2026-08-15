require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: process.env.CORS_ORIGIN || '*', 
    methods: ['GET', 'POST'] 
  }
});

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13, 'A':14 };
const ANTE = 1;

const rooms = {};

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

function isWild(card, ruleVariant, followRank) {
  if (!card || !card.rank) return false;
  if (ruleVariant === 'deuces' && card.rank === '2') return true;
  if (ruleVariant === 'follow') {
    if (card.rank === 'Q') return true;
    if (followRank && card.rank === followRank) return true;
  }
  return false;
}

function evaluate7Cards(cards, ruleVariant, followRank) {
  const wildCards = cards.filter(c => isWild(c, ruleVariant, followRank));
  const naturalCards = cards.filter(c => !isWild(c, ruleVariant, followRank));
  const wildCount = wildCards.length;

  const rankCounts = {};
  naturalCards.forEach(c => rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1);
  const counts = Object.values(rankCounts).sort((a,b) => b - a);
  const topCount = counts[0] || 0;
  const effectiveSameKind = topCount + wildCount;

  if (effectiveSameKind >= 5) return { score: 1000, desc: '5 of a Kind' };
  if (effectiveSameKind >= 4) return { score: 800, desc: '4 of a Kind' };
  if ((topCount >= 3 && counts[1] >= 2) || (topCount === 2 && counts[1] === 2 && wildCount >= 1) || (topCount >= 3 && wildCount >= 1)) {
    return { score: 700, desc: 'Full House' };
  }
  const suitCounts = {};
  naturalCards.forEach(c => suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1);
  const maxSuit = Math.max(...Object.values(suitCounts), 0);
  if (maxSuit + wildCount >= 5) return { score: 600, desc: 'Flush' };
  if (effectiveSameKind >= 3) return { score: 400, desc: '3 of a Kind' };
  if (counts[0] >= 2 && counts[1] >= 2) return { score: 300, desc: 'Two Pair' };
  if (effectiveSameKind >= 2) return { score: 200, desc: 'One Pair' };

  const highest = Math.max(...cards.map(c => c.value), 0);
  return { score: 100 + highest, desc: 'High Card' };
}

io.on('connection', (socket) => {
  socket.on('join_room', ({ roomId, playerName, ruleVariant }) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = {
        id: roomId,
        host: socket.id,
        ruleVariant: ruleVariant || 'standard',
        players: [],
        deck: [],
        pot: 0,
        currentStreet: 0,
        activeTurnIndex: 0,
        highestBet: 0,
        lastRaiserIndex: -1,
        followRank: null,
        awaitingQueenFollow: false,
        gameStarted: false,
        pendingRiverChoices: new Set()
      };
    }

    const room = rooms[roomId];
    if (room.players.length < 4 && !room.players.some(p => p.id === socket.id)) {
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
    }

    broadcastState(roomId);
  });

  socket.on('start_hand', ({ roomId, fillBots, ruleVariant }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (ruleVariant) room.ruleVariant = ruleVariant;

    if (fillBots) {
      const botPool = [
        { name: 'Alex', persona: 'aggressive' },
        { name: 'Sam', persona: 'calling_station' },
        { name: 'Jordan', persona: 'wild_chaser' }
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

    room.deck = createDeck();
    room.pot = 0;
    room.followRank = null;
    room.awaitingQueenFollow = false;
    room.gameStarted = true;
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

    // 3rd Street: 2 face-down, 1 face-up
    for (let i = 0; i < 2; i++) {
      room.players.forEach(p => { if (!p.folded) dealCard(room, p, false); });
    }
    room.players.forEach(p => { if (!p.folded) dealCard(room, p, true); });

    startStreetBetting(room, 3);
  });

  socket.on('take_action', ({ roomId, action, raiseAmt }) => {
    const room = rooms[roomId];
    if (!room) return;
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
      const room = rooms[rid];
      room.players = room.players.filter(p => p.id !== socket.id);
      broadcastState(rid);
    }
  });
});

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
      io.to(room.id).emit('notification', { text: `👑 Face-up Queen dealt! Next face-up card sets the wild rank!` });
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
      const top = upCards.length ? Math.max(...upCards.map(c => isWild(c, room.ruleVariant, room.followRank) ? 99 : c.value)) : 0;
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
  const hand = evaluate7Cards(bot.cards, room.ruleVariant, room.followRank);
  const wildCount = bot.cards.filter(c => isWild(c, room.ruleVariant, room.followRank)).length;

  let action = 'check';
  let raiseAmt = toCall + minInc;

  if (bot.persona === 'calling_station') {
    if (toCall === 0) {
      action = (hand.score >= 400 && Math.random() < 0.25) ? 'raise' : 'check';
    } else {
      action = (toCall > bot.chips) ? 'check' : ((room.currentStreet === 7 && hand.score < 200 && Math.random() < 0.03) ? 'fold' : 'check');
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
        action = (room.currentStreet >= 6 && hand.score < 200) ? 'fold' : 'check';
      }
    }
  } else {
    if (wildCount > 0 || hand.score >= 300) {
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
    room.players.forEach(p => { if (!p.folded) dealCard(room, p, true); });
    startStreetBetting(room, room.currentStreet);
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
      const res = evaluate7Cards(p.cards, room.ruleVariant, room.followRank);
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
  broadcastState(room.id, `🏆 Showdown! ${winners.map(w => w.name).join(', ')} won with ${bestDesc}!`);
}

function endHand(room, winner) {
  if (winner) {
    winner.chips += room.pot;
    room.pot = 0;
    room.currentStreet = 8;
    broadcastState(room.id, `🏆 ${winner.name} won $${winner.chips} (Everyone else folded)!`);
  }
}

function broadcastState(roomId, message = null) {
  const room = rooms[roomId];
  if (!room) return;

  room.players.forEach(recipient => {
    if (recipient.isBot) return;

    const sanitizedPlayers = room.players.map(p => ({
      id: p.id,
      name: p.name,
      chips: p.chips,
      folded: p.folded,
      currentBet: p.currentBet,
      isBot: p.isBot,
      persona: p.persona,
      handDesc: p.handDesc || '',
      cards: p.cards.map(c => {
        if (room.currentStreet === 8 || p.id === recipient.id || c.isFaceUp) {
          return c;
        }
        return { isFaceUp: false };
      })
    }));

    io.to(recipient.id).emit('game_state', {
      roomId: room.id,
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
server.listen(PORT, () => console.log(`Casino Server Online on port ${PORT}`));