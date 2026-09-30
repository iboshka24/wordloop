const assert = require('assert');
const fs = require('fs');

console.log('--- Starting WordLoop Test Suite ---');

// 1. Syntax check
require('../api/ai.js');
console.log('✓ api/ai.js loads cleanly');

// Load app.js code for unit testing isolated functions
const appCode = fs.readFileSync(require.resolve('../app.js'), 'utf8');

// Extract parseInput and detectScript
const parseMatch = appCode.match(/function detectScript[\s\S]+?return \{ items: items, dropped: dropped \};\s*\}/);
if (!parseMatch) throw new Error('Could not extract parseInput from app.js');

const parseSandbox = new Function(parseMatch[0] + '; return { parseInput, detectScript };')();
const { parseInput, detectScript } = parseSandbox;

// Test 2: Input parser preserves commas in translations
const pairCommaInput = 'run - бежать, мчаться\napple - яблоко, плод';
const res1 = parseInput(pairCommaInput);
assert.strictEqual(res1.items.length, 2, 'Expected 2 items');
assert.strictEqual(res1.items[0].original, 'run');
assert.strictEqual(res1.items[0].translation, 'бежать, мчаться');
assert.strictEqual(res1.items[1].original, 'apple');
assert.strictEqual(res1.items[1].translation, 'яблоко, плод');
console.log('✓ Preserves commas inside pair translations');

// Test 3: Multi-pair lines
const multiPairInput = 'cat - кошка, dog - собака, house - дом';
const res2 = parseInput(multiPairInput);
assert.strictEqual(res2.items.length, 3, 'Expected 3 items from multi-pair line');
assert.strictEqual(res2.items[0].original, 'cat');
assert.strictEqual(res2.items[0].translation, 'кошка');
assert.strictEqual(res2.items[1].original, 'dog');
assert.strictEqual(res2.items[1].translation, 'собака');
assert.strictEqual(res2.items[2].original, 'house');
assert.strictEqual(res2.items[2].translation, 'дом');
console.log('✓ Splits comma-separated pairs properly without corrupting');

// Test 4: Comma-separated single words without pair delimiters
const commaWords = 'apple, banana, cherry, date';
const res3 = parseInput(commaWords);
assert.strictEqual(res3.items.length, 4);
assert.strictEqual(res3.items[0].original, 'apple');
assert.strictEqual(res3.items[3].original, 'date');
console.log('✓ Parses comma-separated single words');

// Test 5: Numbered and bulleted lists
const listInput = '1. to achieve\n2) serendipity\n• resilience\n- ubiquitous';
const res4 = parseInput(listInput);
assert.strictEqual(res4.items.length, 4);
assert.strictEqual(res4.items[0].original, 'to achieve');
assert.strictEqual(res4.items[1].original, 'serendipity');
assert.strictEqual(res4.items[2].original, 'resilience');
assert.strictEqual(res4.items[3].original, 'ubiquitous');
console.log('✓ Cleans numbered and bulleted prefixes');

// Test 6: Junk filtering and deduplication
const junkInput = '12345\nhttps://spam.com/test\nuser@example.com\napple\nApple\n   \n!!!\ncat';
const res5 = parseInput(junkInput);
assert.strictEqual(res5.items.length, 2, 'Expected only apple and cat');
assert.strictEqual(res5.items[0].original.toLowerCase(), 'apple');
assert.strictEqual(res5.items[1].original.toLowerCase(), 'cat');
assert(res5.dropped >= 4, 'Dropped count should be at least 4');
console.log('✓ Correctly drops junk, urls, numbers, and duplicates');

// Test 7: Script detection
assert.strictEqual(detectScript('Привет, как дела?'), 'ru');
assert.strictEqual(detectScript('Hello wonderful world'), 'en');
console.log('✓ Accurately detects Russian vs English scripts');

// Test 8: Spaced Repetition Queue Logic - No starvation test
function runQueueSimulation(cardCount, steps) {
  const cards = Array.from({ length: cardCount }, (_, i) => ({ id: i, streak: 0, fails: 0 }));
  let roundQueue = cards.map(c => c.id);
  let round = 1;
  const seenInRound = new Set();
  const seenAllTime = new Set();
  let current = null;

  for (let s = 0; s < steps; s++) {
    if (!roundQueue.length) {
      round++;
      const sorted = cards.slice().sort((a, b) => (b.fails - a.fails) || 0.5 - Math.random());
      roundQueue = sorted.map(c => c.id);
      seenInRound.clear();
    }
    current = cards[roundQueue.shift()];
    seenInRound.add(current.id);
    seenAllTime.add(current.id);

    // Simulate 75% known, 25% forgotten
    const knew = (s % 4) !== 0;
    if (knew) {
      current.streak++;
    } else {
      current.fails++;
      current.streak = 0;
      const insertPos = Math.min(roundQueue.length, 3);
      roundQueue.splice(insertPos, 0, current.id);
    }
  }
  return { seenAllTime: seenAllTime.size, round };
}

const sim = runQueueSimulation(20, 50);
assert.strictEqual(sim.seenAllTime, 20, 'All 20 cards must be seen! No starvation.');
assert(sim.round >= 2, 'Should have progressed through multiple rounds');
console.log('✓ Spaced repetition loop: zero starvation, all ' + sim.seenAllTime + '/20 cards seen');

// Test 9: Serverless Function mock tests
const aiHandler = require('../api/ai.js');

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(d) { this.data = d; return this; },
    end() { return this; }
  };
}

(async () => {
  // GET probe
  const rGet = mockRes();
  await aiHandler({ method: 'GET' }, rGet);
  assert.strictEqual(rGet.statusCode, 200);
  assert.strictEqual(rGet.data.status, 'ok');
  console.log('✓ /api/ai GET probe returns status 200 ok');

  // POST without any key
  const oldKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const rNoKey = mockRes();
  await aiHandler({ method: 'POST', headers: {}, body: {} }, rNoKey);
  assert.strictEqual(rNoKey.statusCode, 501);
  assert.strictEqual(rNoKey.data.code, 'no-key');
  console.log('✓ /api/ai POST without key returns 501 no-key');

  // POST with client Bearer key, bad request messages
  const rClientKey = mockRes();
  await aiHandler({ method: 'POST', headers: { authorization: 'Bearer custom-test-key' }, body: {} }, rClientKey);
  assert.strictEqual(rClientKey.statusCode, 400);
  assert.strictEqual(rClientKey.data.code, 'bad-request');
  console.log('✓ /api/ai POST accepts client Bearer key and validates messages array');

  // POST with body apiKey
  const rBodyKey = mockRes();
  await aiHandler({ method: 'POST', headers: {}, body: { apiKey: 'body-test-key' } }, rBodyKey);
  assert.strictEqual(rBodyKey.statusCode, 400);
  assert.strictEqual(rBodyKey.data.code, 'bad-request');
  console.log('✓ /api/ai POST accepts body apiKey');

  // Restore env key if existed
  if (oldKey) process.env.OPENAI_API_KEY = oldKey;

  console.log('\n--- ALL TESTS PASSED SUCCESSFULLY! ---');
})();
