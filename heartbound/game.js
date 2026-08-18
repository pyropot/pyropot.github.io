(() => {
  'use strict';

  const SAVE_KEY = 'heartbound-rerise-save-v1';
  const THEME_KEY = 'heartbound-rerise-theme';
  const MOTION_KEY = 'heartbound-rerise-motion';
  const $ = (selector) => document.querySelector(selector);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const heroines = [
    {
      id: 'akari', name: 'Akari Kisaragi', short: 'Akari', age: 22, era: 'Tokyo · 2026', className: 'Crimson Vanguard', position: 0,
      bonus: '+15% expedition XP', preference: 'playful', color: '#ff4d61',
      past: 'An esports champion who pushed a child out of Truck-chan’s path and forgot to move herself.',
      personality: 'Competitive, impulsive, secretly tender',
      date: [
        'Akari challenges you to a duel using wooden spoons. “Loser has to admit the winner looked cool in the dungeon today.”',
        'On the Skyglass roof, Akari admits she still reaches for a controller when she panics. “Battle menus made sense. Feelings have terrible UI.”',
        'Akari places her practice sword across both your laps. “My old life was a solo queue. I don’t want this one to be.”',
        'Akari’s bravado dissolves when your hands meet. “I can fight gods. Asking you to stay is somehow scarier.”'
      ],
      confession: 'Akari kisses you like she is claiming a world-first victory, then immediately hides her burning face behind her gauntlet.'
    },
    {
      id: 'mei', name: 'Mei Lanyue', short: 'Mei', age: 29, era: 'Chang’an · 742', className: 'Moonblade Astrologer', position: 25,
      bonus: '+12 fate value in the Moonvault', preference: 'sincere', color: '#5d8cff',
      past: 'A court astronomer struck by an impossible horseless carriage that appeared beneath a comet.',
      personality: 'Elegant, observant, devastatingly sincere',
      date: [
        'Mei arranges crystal fruit into a map of the night sky. “In my century, this constellation meant two travelers choosing the same road.”',
        'Mei asks you to describe the moon from your era. She listens as if your ordinary memories are priceless scripture.',
        'On the observatory balcony, Mei removes one jeweled hairpin. “A promise should be witnessed by the stars—or by someone braver than stars.”',
        'Mei leans close enough that moonlight cannot fit between you. “Every calculation returns the same answer. I choose you deliberately.”'
      ],
      confession: 'Mei presses the jeweled hairpin into your palm and kisses you beneath a sky containing both of your lost centuries.'
    },
    {
      id: 'rox', name: 'Roxanne “Rox” Bell', short: 'Rox', age: 35, era: 'Detroit · 1987', className: 'Thunderheart Bard', position: 50,
      bonus: '+18% Chain Strike damage', preference: 'bold', color: '#b054ff',
      past: 'A touring rock guitarist who faced down Truck-chan after it crashed through the back wall of a sold-out club.',
      personality: 'Fearless, flirtatious, fiercely loyal',
      date: [
        'Rox tunes her lightning lute beside the fire. “I had an arena crowd once. Somehow playing for one gorgeous woman is more pressure.”',
        'Rox teaches you a power chord that makes the flowers headbang. Her hand remains over yours long after the music stops.',
        'She shows you a faded backstage pass from Earth. “I kept proof that I was real. Now I think you might be proof enough.”',
        'Rox’s grin turns uncharacteristically shy. “Encore with me? Not for one song. For the whole ridiculous life.”'
      ],
      confession: 'Rox pulls you into a dramatic dip-kiss while thunder writes a perfect heart across the cloudless sky.'
    },
    {
      id: 'solene', name: 'Dr. Solène Vale', short: 'Solène', age: 46, era: 'Lunar Orbit · 2189', className: 'Saint Engineer', position: 75,
      bonus: '+20% party maximum HP', preference: 'curious', color: '#eef4ff',
      past: 'An orbital trauma surgeon whose evacuation pod was somehow intercepted by a delivery truck in vacuum.',
      personality: 'Poised, brilliant, dryly romantic',
      date: [
        'Solène disassembles a healing wand over tea. “Magic is merely physics with theatrical confidence. You, however, remain diagnostically confusing.”',
        'She asks permission to measure your pulse while holding your hand. The examination lasts suspiciously longer than necessary.',
        'Solène projects Earth above the campfire, blue and impossibly distant. “I spent one life preserving heartbeats. I never planned what to do with mine.”',
        'Her perfect composure finally cracks. “My prognosis is embarrassingly simple. I am in love with you.”'
      ],
      confession: 'Solène kisses you with careful tenderness, then records the moment as the first miracle she refuses to explain scientifically.'
    },
    {
      id: 'mags', name: 'Margaret “Mags” Ainsley', short: 'Mags', age: 68, era: 'London · 1974', className: 'Gale Lancer', position: 100,
      bonus: 'Cozy Assist starts enabled', preference: 'honest', color: '#47d39a',
      past: 'A retired stunt pilot who tried to jump her motorcycle over Truck-chan because “it seemed funny at the time.”',
      personality: 'Unflappable, mischievous, gloriously direct',
      date: [
        'Mags pours tea from a dented flight flask. “I was promised wisdom with age. Mostly I acquired better stories and less patience for cowards.”',
        'She takes you flying on her wind lance, laughing through every reckless turn. “Death already caught me once. She’ll have to queue.”',
        'Mags shows you the silver in her hair without glamour magic. “I earned every line. If you fancy me, you fancy the whole flight log.”',
        'At dawn she offers you her scarf. “I have had a marvelous long life and a bizarre second one. I’d still like the rest with you.”'
      ],
      confession: 'Mags kisses you slowly, confidently, and with enough practiced charm to make the entire camp forget breakfast.'
    }
  ];

  const tileSet = [
    { value: 1, mark: '一', name: 'ONE' }, { value: 2, mark: '二', name: 'TWO' }, { value: 3, mark: '三', name: 'THREE' },
    { value: 4, mark: '四', name: 'FOUR' }, { value: 5, mark: '五', name: 'FIVE' }, { value: 6, mark: '六', name: 'SIX' },
    { value: 7, mark: '七', name: 'SEVEN' }, { value: 8, mark: '八', name: 'EIGHT' }, { value: 9, mark: '九', name: 'NINE' },
    { value: 12, mark: '♥', name: 'HEART' }
  ];

  function freshState() {
    const heroState = {};
    heroines.forEach((hero) => { heroState[hero.id] = { level: 1, xp: 0, bond: 0 }; });
    return { player: null, day: 1, gold: 40, gearPower: 0, heroes: heroState, flags: {}, endings: [], started: false };
  }

  let state = freshState();
  let currentPartner = null;
  let pendingMinigame = null;
  let sky = null;
  let skyFrame = null;
  let fateHand = [];
  let redraws = 2;
  let curse = 0;
  let battle = null;
  let toastTimer = null;

  const heroById = (id) => heroines.find((hero) => hero.id === id);
  const playerHero = () => heroById(state.player);
  const companions = () => heroines.filter((hero) => hero.id !== state.player);
  const heroStats = (id) => state.heroes[id];
  const averageLevel = () => heroines.reduce((sum, hero) => sum + heroStats(hero.id).level, 0) / heroines.length;
  const totalBond = () => companions().reduce((sum, hero) => sum + heroStats(hero.id).bond, 0);
  const partyPower = () => Math.round(heroines.reduce((sum, hero) => sum + heroStats(hero.id).level * 10, 0) + totalBond() * 4 + state.gearPower);

  function xpNeeded(level) { return level * 45; }

  function addXp(id, amount) {
    const stats = heroStats(id);
    const bonus = state.player === 'akari' ? 1.15 : 1;
    stats.xp += Math.round(amount * bonus);
    let leveled = false;
    while (stats.level < 9 && stats.xp >= xpNeeded(stats.level)) {
      stats.xp -= xpNeeded(stats.level);
      stats.level += 1;
      leveled = true;
    }
    if (leveled) showToast(`${heroById(id).short} reached Level ${stats.level}! ★`);
  }

  function addXpAll(amount) { heroines.forEach((hero) => addXp(hero.id, amount)); }

  function addBond(id, amount) {
    if (id === state.player) return;
    const stats = heroStats(id);
    const before = stats.bond;
    stats.bond = clamp(stats.bond + amount, 0, 5);
    if (stats.bond > before) showToast(`${heroById(id).short} bond +${stats.bond - before} ♥`);
  }

  function setArtPosition(element, hero) {
    element.style.backgroundPosition = `${hero.position}% top`;
  }

  function renderOrigins() {
    const grid = $('#originGrid');
    grid.replaceChildren();
    heroines.forEach((hero) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'origin-card';
      const art = document.createElement('div');
      art.className = 'origin-art';
      setArtPosition(art, hero);
      const info = document.createElement('div');
      info.className = 'origin-info';
      info.innerHTML = `<small>AGE ${hero.age} · ${hero.era}</small><h3>${hero.name}</h3><p>${hero.className}<br>${hero.personality}</p><div class="origin-stats"><span>${hero.bonus}</span></div>`;
      button.append(art, info);
      button.addEventListener('click', () => startNewGame(hero.id));
      grid.append(button);
    });
  }

  function startNewGame(heroId) {
    state = freshState();
    state.player = heroId;
    state.started = true;
    state.heroes[heroId].bond = 0;
    $('#originScreen').setAttribute('aria-hidden', 'true');
    $('#titleScreen').classList.add('hidden');
    $('#game').hidden = false;
    if (heroId === 'mags') $('#assistToggle').checked = true;
    renderParty();
    showArrival();
    saveGame();
  }

  function continueGame() {
    $('#titleScreen').classList.add('hidden');
    $('#game').hidden = false;
    renderParty();
    showHub('The adventure resumes exactly where your heart left it.');
  }

  function showArrival() {
    const hero = playerHero();
    setScene('arrival', 'THE BORDER BETWEEN WORLDS', hero);
    showStory({
      speaker: 'TRUCK-CHAN, DIVINE COURIER',
      text: `${hero.name} remembers headlights, a heroic or catastrophically funny decision, and then a goddess-shaped delivery truck stamping her soul “EXPRESS SHIPPING.” She wakes in silk grass beneath two moons, wearing the armour of a ${hero.className}.`,
      choices: [
        { label: 'Check whether this is an extremely elaborate coma.', action: () => showFirstMeeting('skeptic') },
        { label: 'Accept the isekai situation immediately. “Finally.”', action: () => showFirstMeeting('ready') },
        { label: 'Ask if the delivery truck had insurance.', action: () => showFirstMeeting('joke') }
      ],
      chapter: 'PROLOGUE · TRUCK-CHAN’S FIVE DELIVERIES'
    });
  }

  function showFirstMeeting(tone) {
    state.flags.arrivalTone = tone;
    setScene('arrival', 'AURELIA · STARFALL MEADOW');
    const reactions = {
      skeptic: 'Four women are arguing over whether shared hallucinations require matching paperwork.',
      ready: 'Four women stare as you announce yourself as the destined heroine. Akari applauds. Solène checks you for concussion.',
      joke: 'Mags laughs so hard she nearly falls off her wind lance. “Darling, that was the uninsured face of destiny.”'
    };
    showStory({
      speaker: 'NARRATION',
      text: `${reactions[tone]} They died in different centuries, yet each remembers the same impossible truck. Above you, Demon Queen Vespera’s eclipse begins swallowing the second moon.`,
      choices: [
        { label: 'Introduce yourself honestly.', action: () => formParty('honest') },
        { label: 'Declare everyone your elite heroine squad.', action: () => formParty('bold') },
        { label: 'Suggest food before world-saving.', action: () => formParty('food') }
      ]
    });
  }

  function formParty(style) {
    companions().forEach((hero) => addBond(hero.id, 1));
    state.flags.partyFormed = true;
    state.flags.partyStyle = style;
    state.day += 1;
    setScene('camp', 'STARFALL CAMP · FIRST NIGHT');
    const line = style === 'bold'
      ? 'Rox immediately writes a theme song. Mei quietly points out that “elite” usually follows training, not precedes it.'
      : style === 'food'
        ? 'Shared stew accomplishes in twenty minutes what prophecy could not: five strangers begin behaving like a party.'
        : 'Names, deaths, centuries, and fears cross the fire until the impossible begins to feel survivable.';
    showStory({
      speaker: 'THE HEARTBOUND FIVE',
      text: `${line} The royal oracle says Vespera can only be defeated by five mastered classes acting in perfect emotional resonance. In less poetic terms: gain levels, learn one another’s hearts, and do not raid the final castle undergeared.`,
      choices: [{ label: 'Begin the adventure.', action: () => showHub() }],
      chapter: 'CHAPTER 1 · THE SKYGLASS LABYRINTH'
    });
  }

  function showHub(message = '') {
    setScene('camp', `STARFALL CAMP · DAY ${state.day}`);
    const power = partyPower();
    const devotion = companions().filter((hero) => heroStats(hero.id).bond >= 4).length;
    const intro = message || `The Skyglass Labyrinth floats beyond camp, full of experience crystals, dangerous shortcuts, and suspiciously perfect date locations.`;
    showStory({
      speaker: playerHero().name,
      text: `${intro} Party power is ${power}. ${devotion} of 4 companion hearts have reached devotion. Vespera’s castle opens at 140 power—but the true resonance will demand more than levels.`,
      choices: [
        { label: '⚔ Grind the Skyglass Labyrinth', action: runExpedition },
        { label: '☁ Enter the Sky Ring flight trial', action: () => choosePartner('sky') },
        { label: '牌 Gamble in the Moonvault Mahjong chamber', action: () => choosePartner('fate') },
        { label: '♥ Spend the evening with someone', action: openDatePicker },
        { label: power >= 140 ? '♛ Challenge Demon Queen Vespera' : `♛ Demon Castle locked · ${140 - power} more power`, action: power >= 140 ? startBattle : null, locked: power < 140 },
        { label: '✦ Review levels and bonds', action: openPartyPanel }
      ],
      chapter: 'CHAPTER 2 · LEVELS, DATES & BAD DECISIONS'
    });
    saveGame();
  }

  function runExpedition() {
    state.day += 1;
    const avg = averageLevel();
    const floor = avg < 2.5 ? 'Prism Grove' : avg < 4 ? 'Wyvern Aerie' : 'Moonlit Crown';
    const successChance = clamp(.7 + avg * .045, .72, .94);
    const success = Math.random() < successChance;
    const xp = success ? Math.round(24 + avg * 6) : 15;
    const gold = success ? Math.round(18 + avg * 4) : 6;
    addXpAll(xp);
    state.gold += gold;
    if (success && Math.random() < .34) {
      state.gearPower += 4;
      showToast('Rare heart crystal found · Party power +4');
    }
    setScene('dungeon', `SKYGLASS LABYRINTH · ${floor.toUpperCase()}`);
    const text = success
      ? `The party clears the ${floor} in a storm of synchronized class skills. Rox’s final chord shatters the treasure seal while Mags flies through the falling debris to catch the loot. Everyone gains ${xp} XP and the camp fund gains ${gold} crowns.`
      : `A crystal mimic eats the map, Akari’s spare boot, and most of lunch. Solène organizes a flawless tactical retreat. It is not glorious, but everyone gains ${xp} XP and ${gold} crowns—and Mei sketches the mimic’s weak point for next time.`;
    showStory({
      speaker: success ? 'VICTORY!' : 'TACTICAL ROMANTIC RETREAT', text,
      choices: [
        { label: 'Return to camp.', action: () => showHub() },
        { label: 'Run another expedition.', action: runExpedition },
        { label: 'Recover together over a campfire date.', action: openDatePicker }
      ]
    });
    renderParty();
    saveGame();
  }

  function openDatePicker() {
    renderCompanionChoices($('#dateChoices'), (hero) => startDate(hero.id));
    $('#dateModal').setAttribute('aria-hidden', 'false');
  }

  function startDate(id) {
    closeModals();
    currentPartner = id;
    const hero = heroById(id);
    const stats = heroStats(id);
    const sceneIndex = Math.min(stats.bond, hero.date.length - 1);
    setScene('camp', `STARFALL CAMP · ${hero.short.toUpperCase()} ROUTE`, hero);
    showStory({
      speaker: hero.name,
      text: hero.date[sceneIndex],
      choices: [
        { label: 'Listen without hiding behind a joke.', action: () => resolveDate('sincere') },
        { label: 'Flirt shamelessly and hold her gaze.', action: () => resolveDate('bold') },
        { label: 'Turn the moment into a playful challenge.', action: () => resolveDate('playful') },
        { label: 'Ask the strange question no one else considered.', action: () => resolveDate('curious') },
        { label: 'Tell the embarrassing truth and laugh together.', action: () => resolveDate('honest') }
      ],
      chapter: `HEART EVENT · ${hero.short.toUpperCase()}`
    });
  }

  function resolveDate(choice) {
    const hero = heroById(currentPartner);
    const perfect = choice === hero.preference;
    addBond(hero.id, perfect ? 2 : 1);
    addXp(hero.id, 18);
    addXp(state.player, 12);
    state.day += 1;
    const devoted = heroStats(hero.id).bond >= 4;
    if (devoted) state.flags[`devoted_${hero.id}`] = true;
    const result = devoted
      ? hero.confession
      : perfect
        ? `${hero.short} goes still, then smiles with the unmistakable expression of someone who has just been understood. The Heartbound mark between you shines twice.`
        : `${hero.short} laughs warmly. It was not the answer she expected, but honesty has its own chemistry. The distance between you becomes smaller.`;
    showStory({
      speaker: devoted ? 'DEVOTION EVENT ♥' : `${hero.short.toUpperCase()} · BOND ${heroStats(hero.id).bond}`,
      text: result,
      choices: [
        { label: 'Return to camp with your hands still linked.', action: () => showHub() },
        { label: 'Check on another heroine.', action: openDatePicker }
      ]
    });
    renderParty();
    saveGame();
  }

  function choosePartner(mode) {
    pendingMinigame = mode;
    $('#partnerKicker').textContent = mode === 'sky' ? 'SKY RING TRIAL' : 'MOONVAULT MAHJONG';
    $('#partnerTitle').textContent = mode === 'sky' ? 'Choose your co-pilot' : 'Choose who wagers fate beside you';
    renderCompanionChoices($('#partnerChoices'), (hero) => {
      currentPartner = hero.id;
      closeModals();
      if (mode === 'sky') openSkyTrial(); else openFateGame();
    });
    $('#partnerModal').setAttribute('aria-hidden', 'false');
  }

  function renderCompanionChoices(container, onChoose) {
    container.replaceChildren();
    companions().forEach((hero) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'companion-card';
      const art = document.createElement('div');
      art.className = 'companion-art';
      setArtPosition(art, hero);
      const info = document.createElement('div');
      info.innerHTML = `<b>${hero.name}</b><small>${'♥'.repeat(heroStats(hero.id).bond)}${'♡'.repeat(5 - heroStats(hero.id).bond)} · LV ${heroStats(hero.id).level}</small>`;
      button.append(art, info);
      button.addEventListener('click', () => onChoose(hero));
      container.append(button);
    });
  }

  function openSkyTrial() {
    setScene('sky', 'SKYGLASS LABYRINTH · RING COURSE', heroById(currentPartner));
    $('#skyModal').setAttribute('aria-hidden', 'false');
    $('#skyStatus').textContent = `${heroById(currentPartner).short} fastens the shared flight charm around both wrists.`;
    $('#startSkyButton').textContent = 'START FLIGHT';
    $('#startSkyButton').disabled = false;
    $('#flapButton').disabled = true;
    drawSkyIdle();
  }

  function resetSky() {
    cancelAnimationFrame(skyFrame);
    const assist = $('#assistToggle').checked;
    sky = { playing: true, y: 160, velocity: -3, gates: [], passed: 0, lives: assist ? 10 : 3, lastSpawn: 0, lastTime: performance.now(), assist };
    $('#gateCount').textContent = '0 / 5';
    $('#lifeCount').textContent = assist ? '10 WINGS' : '♥'.repeat(sky.lives);
    $('#skyStatus').textContent = assist ? 'Cozy assist: wider gates and gentler wind.' : 'The wind rune ignites. Fly!';
    $('#startSkyButton').disabled = true;
    $('#flapButton').disabled = false;
    skyFrame = requestAnimationFrame(updateSky);
  }

  function flap() {
    if (sky?.playing) sky.velocity = sky.assist ? -4.1 : -4.7;
  }

  function updateSky(now) {
    if (!sky?.playing) return;
    const canvas = $('#skyCanvas');
    const ctx = canvas.getContext('2d');
    const dt = Math.min((now - sky.lastTime) / 16.67, 2);
    sky.lastTime = now;
    sky.velocity = Math.min(5.5, sky.velocity + (sky.assist ? .17 : .22) * dt);
    sky.y += sky.velocity * dt;
    if (!sky.lastSpawn || now - sky.lastSpawn > (sky.assist ? 1500 : 1260)) {
      const gap = sky.assist ? 172 : 145;
      const gapY = 68 + Math.random() * (canvas.height - gap - 116);
      sky.gates.push({ x: canvas.width + 25, gapY, gap, counted: false });
      sky.lastSpawn = now;
    }
    const speed = (sky.assist ? 2.45 : 3.05) * dt;
    sky.gates.forEach((gate) => { gate.x -= speed; });
    sky.gates = sky.gates.filter((gate) => gate.x > -60);
    const birdX = 105;
    for (const gate of sky.gates) {
      if (!gate.counted && gate.x + 48 < birdX) {
        gate.counted = true;
        sky.passed += 1;
        $('#gateCount').textContent = `${sky.passed} / 5`;
        if (sky.passed >= 5) { finishSky(true); return; }
      }
      const horizontalHit = birdX + 15 > gate.x && birdX - 15 < gate.x + 48;
      const verticalHit = sky.y - 14 < gate.gapY || sky.y + 14 > gate.gapY + gate.gap;
      if (horizontalHit && verticalHit) {
        if (sky.assist && !gate.counted) {
          gate.counted = true;
          sky.passed += 1;
          $('#gateCount').textContent = `${sky.passed} / 5`;
          if (sky.passed >= 5) { finishSky(true); return; }
        }
        if (!hitSky(gate)) return;
        break;
      }
    }
    if (sky.y < 12 || sky.y > canvas.height - 12) {
      if (!hitSky()) return;
    }
    drawSky(ctx, canvas);
    skyFrame = requestAnimationFrame(updateSky);
  }

  function hitSky(gate = null) {
    sky.lives -= 1;
    $('#lifeCount').textContent = sky.assist ? `${Math.max(0, sky.lives)} WINGS` : '♥'.repeat(Math.max(0, sky.lives)) + '♡'.repeat(3 - Math.max(0, sky.lives));
    if (sky.lives <= 0) { finishSky(false); return false; }
    if (gate) gate.x = -70;
    sky.y = 160; sky.velocity = -2;
    $('#skyStatus').textContent = `A wing shatters—but ${heroById(currentPartner).short} catches the flight line. ${sky.lives} left.`;
    return true;
  }

  function drawSky(ctx, canvas) {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#5dccff'); gradient.addColorStop(.68, '#f7e4ff'); gradient.addColorStop(1, '#d7afff');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    for (let i = 0; i < 8; i += 1) ctx.fillRect((i * 127 + Date.now() / 25) % 900 - 100, 55 + (i % 3) * 75, 75, 7);
    sky.gates.forEach((gate) => {
      const gateGradient = ctx.createLinearGradient(gate.x, 0, gate.x + 48, 0);
      gateGradient.addColorStop(0, '#ff7fc4'); gateGradient.addColorStop(.5, '#fff1ad'); gateGradient.addColorStop(1, '#b46cff');
      ctx.fillStyle = gateGradient;
      ctx.fillRect(gate.x, 0, 48, gate.gapY);
      ctx.fillRect(gate.x, gate.gapY + gate.gap, 48, canvas.height - gate.gapY - gate.gap);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.strokeRect(gate.x + 3, gate.gapY - 3, 42, 3);
      ctx.strokeRect(gate.x + 3, gate.gapY + gate.gap, 42, 3);
    });
    ctx.save(); ctx.translate(105, sky.y); ctx.rotate(clamp(sky.velocity * .04, -.35, .5));
    ctx.fillStyle = '#ff358a'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 15;
    ctx.beginPath(); ctx.moveTo(0, 12); ctx.bezierCurveTo(-26, -5, -13, -24, 0, -10); ctx.bezierCurveTo(13, -24, 26, -5, 0, 12); ctx.fill();
    ctx.restore();
  }

  function drawSkyIdle() {
    const canvas = $('#skyCanvas');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#82d9ff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff'; ctx.font = '800 22px Outfit'; ctx.textAlign = 'center';
    ctx.fillText('TAP · CLICK · SPACE TO FLY', canvas.width / 2, canvas.height / 2);
  }

  function finishSky(success) {
    if (!sky?.playing) return;
    sky.playing = false;
    cancelAnimationFrame(skyFrame);
    $('#flapButton').disabled = true;
    $('#startSkyButton').disabled = false;
    $('#startSkyButton').textContent = success ? 'FLIGHT CLEARED!' : 'TRY AGAIN';
    $('#skyStatus').textContent = success ? 'Five gates! The flight charm erupts into twin heart-shaped contrails.' : 'Crystal feathers everywhere. At least the landing is extremely memorable.';
    window.setTimeout(() => resolveSky(success), 900);
  }

  function resolveSky(success) {
    closeModals();
    state.day += 1;
    addXpAll(success ? 40 : 16);
    addBond(currentPartner, success ? 2 : 1);
    if (success) { state.flags.skyClear = true; state.gearPower += 12; }
    setScene('sky', 'SKYGLASS LABYRINTH · CLOUD TERRACE', heroById(currentPartner));
    showStory({
      speaker: success ? 'SKY RING CLEAR! ☁' : 'CRASH LANDING ROUTE',
      text: success
        ? `You and ${heroById(currentPartner).short} burst through the fifth ring hand-in-hand. The labyrinth awards a Winged Heart relic worth 12 party power. She does not let go when the flight spell ends.`
        : `You and ${heroById(currentPartner).short} tumble into an enchanted cloud that tastes like strawberry. The trial is lost, but laughing breathlessly with her still raises your bond—and the failed route grants useful XP.`,
      choices: [{ label: 'Return to camp.', action: () => showHub() }, { label: 'Fly the course again.', action: () => choosePartner('sky') }]
    });
    renderParty(); saveGame();
  }

  function openFateGame() {
    setScene('fate', 'MOONVAULT · TILES OF FATE', heroById(currentPartner));
    fateHand = []; redraws = 2; curse = 0;
    $('#tileHand').replaceChildren();
    $('#redrawCount').textContent = '2'; $('#curseCount').textContent = '0 / 3'; $('#fateValue').textContent = '0';
    $('#drawTilesButton').disabled = false; $('#drawTilesButton').textContent = 'DEAL THE TILES';
    $('#redrawTileButton').disabled = true; $('#bankFateButton').disabled = true;
    $('#fateStatus').textContent = `${heroById(currentPartner).short} places her hand over yours on the lacquered table.`;
    $('#fateModal').setAttribute('aria-hidden', 'false');
  }

  function randomTile() { return { ...tileSet[Math.floor(Math.random() * tileSet.length)] }; }

  function dealFate() {
    fateHand = [randomTile(), randomTile(), randomTile()];
    redraws = 2; curse = 0;
    renderTiles();
    $('#drawTilesButton').disabled = true; $('#redrawTileButton').disabled = false; $('#bankFateButton').disabled = false;
    $('#fateStatus').textContent = fateScore().label;
  }

  function fateScore() {
    const values = fateHand.map((tile) => tile.value).sort((a, b) => a - b);
    const heart = values.includes(12);
    const pair = new Set(values).size < values.length;
    const run = !heart && values[1] === values[0] + 1 && values[2] === values[1] + 1;
    let score = values.reduce((sum, value) => sum + value, 0) * 2 + (state.player === 'mei' ? 12 : 0);
    let label = `A scattered fate worth ${score}. Risk a redraw or bank the chaos.`;
    if (pair) { score += 45; label = `A mirrored pair! Fate value ${score}.`; }
    if (run) { score += 60; label = `A perfect celestial run! Fate value ${score}.`; }
    if (heart) { score += 72; label = `The Heart tile chooses you! Fate value ${score}.`; }
    return { score, label, win: score >= 62 };
  }

  function redrawWeakest() {
    if (redraws <= 0 || !fateHand.length) return;
    let weakest = 0;
    fateHand.forEach((tile, index) => { if (tile.value < fateHand[weakest].value) weakest = index; });
    fateHand[weakest] = randomTile();
    redraws -= 1;
    if (Math.random() < .36) curse += 1;
    renderTiles();
    $('#redrawCount').textContent = String(redraws);
    $('#curseCount').textContent = `${curse} / 3`;
    $('#redrawTileButton').disabled = redraws <= 0;
    $('#fateStatus').textContent = curse >= 3 ? 'The Moonvault curse wakes and flips the table!' : fateScore().label;
    if (curse >= 3) window.setTimeout(() => resolveFate(false, true), 650);
  }

  function renderTiles() {
    const hand = $('#tileHand'); hand.replaceChildren();
    fateHand.forEach((tile, index) => {
      const el = document.createElement('div'); el.className = 'fate-tile'; el.style.animationDelay = `${index * .09}s`;
      const name = document.createElement('small'); name.textContent = tile.name;
      el.append(tile.mark, name); hand.append(el);
    });
    $('#fateValue').textContent = String(fateScore().score);
  }

  function bankFate() { resolveFate(fateScore().win, false); }

  function resolveFate(success, cursed) {
    closeModals();
    state.day += 1;
    addXpAll(success ? 36 : 16);
    addBond(currentPartner, success ? 2 : 1);
    if (success) { state.flags.fateClear = true; state.gearPower += 10; }
    setScene('fate', 'MOONVAULT · FATE AFTERMATH', heroById(currentPartner));
    const failText = cursed
      ? `The curse launches every tile into the air. ${heroById(currentPartner).short} shields you, gets a “ONE” tile stuck in her hair, and starts laughing. The treasure is lost; the ridiculous memory is not.`
      : `The Moonvault judges your hand catastrophically ordinary. ${heroById(currentPartner).short} takes your hand under the table. “Bad luck shared,” she says, “is almost good luck.”`;
    showStory({
      speaker: success ? 'FORTUNE JACKPOT! 牌' : 'UNLUCKY LOVE ROUTE',
      text: success
        ? `The tiles form a blazing heart and unlock the Lovers’ Sigil, worth 10 party power. ${heroById(currentPartner).short} insists fate has officially endorsed the two of you.`
        : failText,
      choices: [{ label: 'Return to camp.', action: () => showHub() }, { label: 'Challenge fate again.', action: () => choosePartner('fate') }]
    });
    renderParty(); saveGame();
  }

  function startBattle() {
    const power = partyPower();
    const hpBonus = state.player === 'solene' ? 1.2 : 1;
    const maxParty = Math.round((155 + heroines.reduce((sum, hero) => sum + heroStats(hero.id).level * 13, 0) + totalBond() * 5) * hpBonus);
    battle = { party: maxParty, maxParty, boss: 420, maxBoss: 420, guarding: false, turn: 1, power };
    updateBattleUi();
    $('#battleLog').textContent = 'Vespera raises the Eclipse Scepter. “Show me a bond stronger than despair.”';
    $('#battleModal').setAttribute('aria-hidden', 'false');
    setScene('boss', 'OBSIDIAN PALACE · ECLIPSE THRONE');
  }

  function battleAction(action) {
    if (!battle || battle.party <= 0 || battle.boss <= 0) return;
    let playerLine = '';
    if (action === 'strike') {
      const roxBonus = state.player === 'rox' ? 1.18 : 1;
      const damage = Math.round((battle.power * .16 + 12 + Math.random() * 14) * roxBonus);
      battle.boss -= damage;
      playerLine = `All five classes chain together for ${damage} damage.`;
    } else if (action === 'heart') {
      const damage = Math.round(18 + totalBond() * 4.5 + Math.random() * 8);
      const heal = Math.round(10 + totalBond() * 1.5);
      battle.boss -= damage; battle.party = Math.min(battle.maxParty, battle.party + heal);
      playerLine = `Shared memories become a Heart Resonance: ${damage} damage and ${heal} healing.`;
    } else {
      battle.guarding = true;
      state.gearPower += battle.turn === 1 ? 2 : 0;
      playerLine = 'Solène reads the spell while Mei marks its rhythm. The party braces behind Mags’s wind wall.';
    }
    if (battle.boss <= 0) { finishBattle(true); return; }
    let incoming = Math.round(25 + Math.random() * 18 + battle.turn * 1.5);
    if (battle.guarding) incoming = Math.round(incoming * .38);
    battle.guarding = false;
    battle.party -= incoming;
    battle.turn += 1;
    $('#battleLog').textContent = `${playerLine} Vespera answers with Eclipse Bloom for ${incoming} damage.`;
    updateBattleUi();
    if (battle.party <= 0) finishBattle(false);
  }

  function updateBattleUi() {
    $('#partyHpText').textContent = `${Math.max(0, battle.party)} / ${battle.maxParty}`;
    $('#bossHpText').textContent = `${Math.max(0, battle.boss)} / ${battle.maxBoss}`;
    $('#partyHpBar').style.width = `${clamp(battle.party / battle.maxParty * 100, 0, 100)}%`;
    $('#bossHpBar').style.width = `${clamp(battle.boss / battle.maxBoss * 100, 0, 100)}%`;
  }

  function finishBattle(success) {
    if (!battle) return;
    const lastBattle = battle; battle = null;
    if (success) {
      window.setTimeout(() => { $('#battleModal').setAttribute('aria-hidden', 'true'); resolveEnding(); }, 650);
    } else {
      $('#battleLog').textContent = 'The Heartbound formation breaks—but Vespera allows the party to retreat. “Return when those feelings have names.”';
      window.setTimeout(() => {
        $('#battleModal').setAttribute('aria-hidden', 'true');
        addXpAll(24); state.day += 1;
        showHub(`Vespera defeated the party on turn ${lastBattle.turn}. The loss becomes 24 XP each—and a very specific reason to train bonds and levels.`);
      }, 1100);
    }
  }

  function resolveEnding() {
    const allDevoted = companions().every((hero) => heroStats(hero.id).bond >= 4);
    const mastered = averageLevel() >= 4;
    const trials = state.flags.skyClear && state.flags.fateClear;
    if (allDevoted && mastered && trials) {
      showEnding('all_hearts', 'TRUE GOOD ENDING · FIVE HEARTS, ONE HOME', 'THE HAREM ROUTE WAS REAL', `The five reincarnated heroines name every feeling they were too frightened to carry alone. Their Heartbound marks become one radiant constellation, shattering Vespera’s eclipse without destroying her. The Demon Queen surrenders to five women holding hands and arguing over who gets the first date tomorrow. Aurelia is saved. No one returns to Earth. Instead, all five choose one another—openly, equally, and for this entire impossible second life.`);
      return;
    }
    const closest = companions().sort((a, b) => heroStats(b.id).bond - heroStats(a.id).bond)[0];
    if (closest && heroStats(closest.id).bond >= 3) {
      showEnding(`pair_${closest.id}`, `ROMANCE ENDING · ${closest.short.toUpperCase()}`, `${closest.short.toUpperCase()} AFTER THE ECLIPSE`, `The party defeats Vespera with a final Heart Resonance, saving Aurelia together. When the celebration finally quiets, ${closest.name} finds you above the lantern-lit capital. ${closest.confession} The other heroines remain family, rivals, and the loudest possible supporters of your new romance.`);
    } else {
      showEnding('party', 'NORMAL ENDING · THE HEARTBOUND FIVE', 'FRIENDSHIP CLEARS THE RAID', 'Levels, stubbornness, and five perfectly timed class ultimates defeat Vespera. Aurelia is saved, and the party remains inseparable—but the romantic words stay unspoken. Somewhere, Truck-chan revs meaningfully. Perhaps another run can turn companionship into something brighter.');
    }
  }

  function showEnding(id, kicker, title, text) {
    if (!state.endings.includes(id)) state.endings.push(id);
    state.flags.vesperaDefeated = true;
    $('#endingKicker').textContent = kicker;
    $('#endingTitle').textContent = title;
    $('#endingText').textContent = text;
    $('#endingProgress').textContent = `${state.endings.length} ENDING${state.endings.length === 1 ? '' : 'S'} REMEMBERED · TRUE ENDING REQUIRES ALL FOUR DEVOTIONS, LEVEL 4 AVERAGE, AND BOTH TRIAL RELICS`;
    $('#endingModal').setAttribute('aria-hidden', 'false');
    saveGame();
  }

  function showStory({ speaker, text, choices, chapter }) {
    $('#speaker').textContent = speaker;
    $('#storyText').textContent = text;
    $('#sceneMeta').textContent = `DAY ${state.day} · ${playerHero() ? playerHero().className.toUpperCase() : 'REINCARNATION'}`;
    if (chapter) $('#chapterLabel').textContent = chapter;
    const container = $('#choices'); container.replaceChildren();
    choices.forEach((choice) => {
      const button = document.createElement('button'); button.type = 'button';
      button.className = `story-choice${choice.locked ? ' locked' : ''}`;
      button.textContent = choice.label; button.disabled = Boolean(choice.locked || !choice.action);
      if (choice.action) button.addEventListener('click', choice.action);
      container.append(button);
    });
    $('#autosaveStatus').textContent = `AUTOSAVED · ${state.gold} CROWNS`;
    renderParty();
  }

  function setScene(scene, badge, hero = null) {
    $('#stage').dataset.scene = scene;
    $('#sceneBadge').textContent = badge;
    const portrait = $('#scenePortrait');
    if (hero) { setArtPosition(portrait, hero); portrait.classList.add('show'); }
    else portrait.classList.remove('show');
  }

  function renderParty() {
    if (!state.player) return;
    const rail = $('#partyRail'); rail.replaceChildren();
    heroines.forEach((hero) => {
      const stats = heroStats(hero.id);
      const row = document.createElement('div'); row.className = 'rail-hero';
      const art = document.createElement('div'); art.className = 'mini-art'; setArtPosition(art, hero);
      const info = document.createElement('div');
      info.innerHTML = `<b>${hero.short}${hero.id === state.player ? ' · YOU' : ''}</b><small>${hero.id === state.player ? hero.className : `${'♥'.repeat(stats.bond)}${'♡'.repeat(5 - stats.bond)}`}</small>`;
      const level = document.createElement('span'); level.className = 'rail-level'; level.textContent = `L${stats.level}`;
      row.append(art, info, level); rail.append(row);
    });
    const power = partyPower();
    $('#partyPower').textContent = String(power);
    $('#powerHint').textContent = power >= 140 ? 'Demon Castle unlocked' : 'Vespera: 140 recommended';
  }

  function openPartyPanel() {
    const details = $('#partyDetails'); details.replaceChildren();
    heroines.forEach((hero) => {
      const stats = heroStats(hero.id);
      const card = document.createElement('article'); card.className = 'party-detail';
      const art = document.createElement('div'); art.className = 'companion-art'; setArtPosition(art, hero);
      const info = document.createElement('div');
      const pct = stats.level >= 9 ? 100 : stats.xp / xpNeeded(stats.level) * 100;
      info.innerHTML = `<h3>${hero.name} ${hero.id === state.player ? '· YOU' : ''}</h3><p>LV ${stats.level} ${hero.className} · ${stats.xp}/${xpNeeded(stats.level)} XP</p><div class="xp-track"><i style="width:${pct}%"></i></div><p class="heart-row">${hero.id === state.player ? 'VIEWPOINT HEROINE' : `${'♥'.repeat(stats.bond)}${'♡'.repeat(5 - stats.bond)} BOND`}</p><p>${hero.bonus}</p>`;
      card.append(art, info); details.append(card);
    });
    openPanel('partyPanel');
  }

  function openPanel(id) {
    closePanels();
    const panel = document.getElementById(id); panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false');
  }
  function closePanels() { document.querySelectorAll('.side-panel').forEach((panel) => { panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); }); }
  function closeModals() { document.querySelectorAll('.modal:not(#endingModal)').forEach((modal) => modal.setAttribute('aria-hidden', 'true')); if (sky?.playing) { sky.playing = false; cancelAnimationFrame(skyFrame); } }

  function saveGame(manual = false) {
    if (!state.started) return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    if (manual) showToast('ADVENTURE SAVED ✦');
  }

  function loadGame() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!saved?.player || !heroById(saved.player)) return false;
      state = { ...freshState(), ...saved, heroes: { ...freshState().heroes, ...saved.heroes }, flags: saved.flags || {}, endings: saved.endings || [] };
      return true;
    } catch { return false; }
  }

  function setTheme(theme) {
    const allowed = ['truckchan-sunset', 'shojo-sparkle', 'moonlit-dungeon', 'demon-rouge', 'retro-isekai'];
    const next = allowed.includes(theme) ? theme : 'truckchan-sunset';
    document.body.dataset.theme = next; localStorage.setItem(THEME_KEY, next);
    const radio = document.querySelector(`input[name="theme"][value="${next}"]`); if (radio) radio.checked = true;
  }

  function showToast(text) {
    const toast = $('#toast'); toast.textContent = text; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2100);
  }

  $('#chooseOriginButton').addEventListener('click', () => $('#originScreen').setAttribute('aria-hidden', 'false'));
  $('#closeOriginButton').addEventListener('click', () => $('#originScreen').setAttribute('aria-hidden', 'true'));
  $('#continueButton').addEventListener('click', continueGame);
  $('#saveButton').addEventListener('click', () => saveGame(true));
  $('#themeButton').addEventListener('click', () => openPanel('themePanel'));
  $('#partyButton').addEventListener('click', openPartyPanel);
  $('#startSkyButton').addEventListener('click', resetSky);
  $('#flapButton').addEventListener('click', flap);
  $('#skyCanvas').addEventListener('pointerdown', flap);
  $('#drawTilesButton').addEventListener('click', dealFate);
  $('#redrawTileButton').addEventListener('click', redrawWeakest);
  $('#bankFateButton').addEventListener('click', bankFate);
  $('#retreatButton').addEventListener('click', () => { battle = null; $('#battleModal').setAttribute('aria-hidden', 'true'); showHub('The party retreats before anyone falls. Vespera waits, annoyingly confident.'); });
  document.querySelectorAll('[data-battle]').forEach((button) => button.addEventListener('click', () => battleAction(button.dataset.battle)));
  document.querySelectorAll('[data-close-panel]').forEach((button) => button.addEventListener('click', closePanels));
  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModals));
  document.querySelectorAll('input[name="theme"]').forEach((radio) => radio.addEventListener('change', () => setTheme(radio.value)));
  $('#motionToggle').addEventListener('change', (event) => { document.body.classList.toggle('reduced-motion', event.target.checked); localStorage.setItem(MOTION_KEY, event.target.checked ? 'on' : 'off'); });
  $('#afterEndingButton').addEventListener('click', () => { $('#endingModal').setAttribute('aria-hidden', 'true'); state.gearPower += 15; state.day += 1; showHub('New Game+ begins beneath festival lanterns. Vespera is defeated, but the labyrinth has developed suspiciously romantic bonus floors.'); });
  $('#restartButton').addEventListener('click', () => { if (!window.confirm('Begin a new reincarnation and replace this autosave?')) return; localStorage.removeItem(SAVE_KEY); window.location.reload(); });
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && sky?.playing) { event.preventDefault(); flap(); }
    if (event.key === 'Escape') { closePanels(); closeModals(); }
  });

  renderOrigins();
  setTheme(localStorage.getItem(THEME_KEY) || 'truckchan-sunset');
  const reduced = localStorage.getItem(MOTION_KEY) === 'on' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('#motionToggle').checked = reduced; document.body.classList.toggle('reduced-motion', reduced);
  if (loadGame()) { $('#continueButton').hidden = false; $('#continueButton').textContent = `CONTINUE · DAY ${state.day} · ${playerHero().short.toUpperCase()}`; }
})();
