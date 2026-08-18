'use strict';

process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test';

const assert = require('node:assert/strict');
const {
  GAME_VARIANTS,
  normalizeVariant,
  evaluateBest7CardHand,
  evaluatePlayerHand,
  evaluateVisibleNoPeekHand,
  isWild
} = require('../server');

const values = { '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, J:11, Q:12, K:13, A:14 };
const card = (rank, suit, isHole = false) => ({ rank, suit, value: values[rank], isHole, isFaceUp: !isHole });

assert.equal(Object.keys(GAME_VARIANTS).length, 18, 'the unified lobby should expose all 18 playable table variants');
assert.equal(normalizeVariant('standard'), 'seven_card_stud', 'legacy stud links should continue to work');
assert.equal(normalizeVariant('not-a-game'), 'seven_card_stud', 'unknown games should safely fall back to stud');

assert.equal(isWild(card('3', '♠'), 'baseball', null), true);
assert.equal(isWild(card('9', '♦'), 'night_baseball', null), true);
assert.equal(isWild(card('10', '♣'), 'dr_pepper', null), true);
assert.equal(isWild(card('K', '♥'), 'kings_little', null, '4'), true);

const noPeekPair = evaluateVisibleNoPeekHand(
  { cards: [card('3', '♠'), card('K', '♦')] },
  { ruleVariant: 'night_baseball', followRank: null }
);
assert.match(noPeekPair.desc, /Pair/, 'a revealed wild card should count while taking the No Peek lead');

const holdemPlayer = {
  cards: [card('A', '♠', true), card('K', '♠', true)]
};
const holdemRoom = {
  ruleVariant: 'texas_holdem',
  followRank: null,
  communityCards: [card('Q', '♠'), card('J', '♠'), card('10', '♠'), card('2', '♦'), card('3', '♣')]
};
assert.equal(evaluatePlayerHand(holdemPlayer, holdemRoom).desc, 'Royal Flush');

const omahaPlayer = {
  cards: [card('A', '♠', true), card('K', '♠', true), card('2', '♥', true), card('3', '♥', true)]
};
const omahaRoom = { ...holdemRoom, ruleVariant: 'omaha' };
assert.equal(evaluatePlayerHand(omahaPlayer, omahaRoom).desc, 'Royal Flush', 'Omaha should evaluate exactly two hole cards plus three board cards');

const acesKingKicker = [card('A', '♠'), card('A', '♦'), card('K', '♣'), card('8', '♥'), card('4', '♠')];
const acesQueenKicker = [card('A', '♥'), card('A', '♣'), card('Q', '♠'), card('8', '♦'), card('4', '♣')];
assert.ok(
  evaluateBest7CardHand(acesKingKicker, 'seven_card_stud', null, null).score > evaluateBest7CardHand(acesQueenKicker, 'seven_card_stud', null, null).score,
  'same-category hands should compare kickers instead of tying'
);

console.log('Poker engine checks passed.');
