(() => {
  'use strict';

  const SAVE_KEY = 'parallax-echo-save-v1';
  const THEME_KEY = 'parallax-echo-theme';
  const MOTION_KEY = 'parallax-echo-reduced-motion';

  const $ = (selector) => document.querySelector(selector);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const has = (state, flag) => Boolean(state.flags[flag]);

  const anchors = {
    intro_1: { title: '21:04 · The first signal', detail: 'Return to the moment the impossible voice arrived.' },
    archive_entry: { title: '21:09 · Clock Archive', detail: 'Re-enter beneath Bellwether’s abandoned master clock.' },
    tower_entry: { title: '21:14 · Meridian Tower', detail: 'Face the synchronization tower with every fact intact.' }
  };

  const endings = {
    braided_dawn: {
      title: 'A DAWN WITH TWO SHADOWS',
      text: 'You and Nia divide the carrier between two imperfect memories. The White Minute collapses into a single shared second. At sunrise, the city remembers Lio Calder—and somewhere in the static, an older Mara laughs in relief before fading out. The loop is open, not broken. That means there is still a road forward.',
      kicker: 'TRUE SIGNAL · ENDING 01'
    },
    quiet_city: {
      title: 'THE QUIET CITY',
      text: 'The receiver breaks beneath the stopwatch. Bellwether keeps every minute from then on, but no one remembers the thirteen it lost. Nia leaves her red bracelet on the workbench. Years later, an unplugged radio whispers your name at 21:04 every August.',
      kicker: 'SEVERED SIGNAL · ENDING 02'
    },
    the_auditor: {
      title: 'THE WOMAN IN THE TOWER',
      text: 'You take the carrier from your older self. She becomes a possibility; you become a duty. From the tower, you trim disasters into déjà vu and warnings into dreams. One night, a younger Mara answers the radio. You know exactly which lie will keep her alive.',
      kicker: 'CLOSED SIGNAL · ENDING 03'
    },
    thirteen_words: {
      title: 'THIRTEEN WORDS',
      text: 'You spend the final charge on a warning to your first self: “Trust Nia. Count the bells. Do not become the woman in the tower.” The timeline folds before you hear the answer. On the other side, the receiver rings one second early.',
      kicker: 'OPEN SIGNAL · ENDING 04'
    },
    lio_remembers: {
      title: 'THE GIRL WHO REMEMBERED BACK',
      text: 'Nia overlays her impossible diagrams while you tune the violet carrier and tap the bell sequence. A third heartbeat appears in the waveform. Lio Calder steps out of a deleted Tuesday holding a page neither of you has written yet: a map to six more missing minutes beneath the city.',
      kicker: 'HIDDEN SIGNAL · ENDING 05'
    }
  };

  const nodes = {
    intro_1: {
      time: '21:04:00', place: 'ROOFTOP LAB', speaker: 'MARA VENN', character: 'mara',
      text: (s) => s.loop > 1
        ? `The soldering iron falls exactly where I remember. Thirteen minutes remain. The receiver has not rung yet—but my hand is already reaching for it.`
        : `The soldering iron slips from my glove at the exact moment the dead receiver begins to ring. It has no battery. It has no speaker. Still, my own voice is trapped inside it.`,
      repeat: `The soldering iron falls. This time I catch it. The receiver is silent for another four seconds, and I hate it for being predictable.`,
      choices: [
        { text: 'Answer the impossible call.', to: 'intro_2' },
        { text: 'Cut power to the whole workbench.', to: 'kill_power' },
        { text: 'Patch the signal into the cassette deck.', to: 'record_signal' },
        { text: 'Say the warning before the receiver can.', to: 'preempt_warning', echo: true, minLoop: 2, requires: ['selfWarning'] },
        { text: 'Tune 314 kHz before the first bell.', to: 'echo_break', echo: true, minLoop: 2, requires: ['bellCode'] },
        { text: 'Ask Nia why her bracelet has only three beads.', to: 'nia_confession', echo: true, minLoop: 2, requires: ['violetKey'] }
      ]
    },
    intro_2: {
      time: '21:04:13', place: 'ROOFTOP LAB', speaker: 'THE RECEIVER', character: 'mara', signal: 'INBOUND CARRIER · SOURCE: LOCAL / IMPOSSIBLE',
      text: `“Mara, listen. At 21:17 the city will lose thirteen minutes. Do not let Nia finish the circle. And whatever she says—do not go to Meridian Tower alone.” The voice is mine, older by a grief I do not recognize.`,
      choices: [
        { text: 'Demand proof from the voice.', to: 'answer_signal', set: { demandedProof: true } },
        { text: 'Write down every word.', to: 'answer_signal', add: { insight: 1 }, set: { selfWarning: true } },
        { text: 'Ask what happens to Nia.', to: 'answer_signal', add: { trust: 1 }, set: { niaConcern: true } }
      ]
    },
    answer_signal: {
      time: '21:04:41', place: 'ROOFTOP LAB', speaker: 'THE RECEIVER', character: 'mara', signal: 'SIGNAL DECAY · 00:07 REMAINING',
      text: (s) => has(s, 'demandedProof')
        ? `“Proof? Your left glove is burning.” Smoke curls from the seam before I feel the heat. “At 21:06, Nia will knock four times and pretend it was three.”`
        : `Static tears holes in every second word. Beneath it I hear a transit chime, three notes, then one, then four. “Remember the bells,” my voice says. “Memory is the only luggage time allows.”`,
      choices: [
        { text: 'Mark the three–one–four rhythm.', to: 'nia_door', set: { bellCode: true }, add: { insight: 1 } },
        { text: 'Save the last seven seconds for later.', to: 'nia_door', set: { selfWarning: true } }
      ]
    },
    kill_power: {
      time: '21:04:17', place: 'ROOFTOP LAB · BLACKOUT', speaker: 'MARA VENN', character: 'mara', signal: 'MAINS OFFLINE · CARRIER UNCHANGED',
      text: `Every lamp dies. The receiver keeps ringing in the dark. Its dial glows violet, a frequency beyond the printed scale, and my voice says: “Good. You found the color. Now survive long enough to understand it.”`,
      choices: [
        { text: 'Memorize the violet frequency.', to: 'nia_door', set: { violetKey: true }, add: { insight: 1 } },
        { text: 'Restore power and wait for Nia.', to: 'nia_door', set: { selfWarning: true } }
      ]
    },
    record_signal: {
      time: '21:04:22', place: 'ROOFTOP LAB', speaker: 'MARA VENN', character: 'mara',
      text: `The cassette spins backward while it records. On the scope, the carrier draws a triangle, a circle, then a gap where the next shape should be. A red pencil note appears on the tape label in handwriting that is not there yet: ASK NIA ABOUT LIO.`,
      choices: [
        { text: 'Pocket the impossible cassette.', to: 'nia_door', set: { cassette: true, selfWarning: true }, add: { insight: 1 } },
        { text: 'Copy the unfinished diagram.', to: 'nia_door', set: { diagramGap: true } }
      ]
    },
    nia_door: {
      time: '21:06:02', place: 'ROOFTOP LAB · STAIRWELL', speaker: 'NIA CALDER', character: 'nia',
      text: `Four knocks. Nia enters on the third, rain silvering her curls, a folding notebook locked under one arm. “Please tell me your illegal antenna did not just answer a signal before it was transmitted.”`,
      repeat: `Four knocks. Before the third, I open the door. Nia's hand hangs in the air. For one clean second, the mathematician has no theory.`,
      choices: [
        { text: 'Tell her exactly what the voice said.', to: 'nia_circle', add: { trust: 2 }, set: { toldNia: true } },
        { text: 'Show her the evidence, not the warning.', to: 'nia_circle', add: { trust: 1 } },
        { text: 'Lie. Say it was ordinary interference.', to: 'solo_scope', add: { trust: -1 }, set: { liedToNia: true } },
        { text: 'Ask about Lio before she can speak.', to: 'nia_confession', echo: true, requires: ['cassette'], minLoop: 2 }
      ]
    },
    nia_circle: {
      time: '21:07:11', place: 'ROOFTOP LAB', speaker: 'NIA CALDER', character: 'nia',
      text: `Nia fills the glass wall with equations. Her final line curves toward its beginning: a closed causal circle. Halfway around, the grease pencil squeals and the city lights outside blink in the same rhythm.`,
      choices: [
        { text: 'Stop her before she closes the circle.', to: 'chime', set: { stoppedCircle: true }, add: { stability: 4 } },
        { text: 'Let her complete it and watch the receiver.', to: 'chime', set: { circleComplete: true }, add: { drift: 5, insight: 1 } },
        { text: 'Put your hand over hers. “We do this together.”', to: 'chime', add: { trust: 1 }, set: { niaPromise: true } }
      ]
    },
    solo_scope: {
      time: '21:07:19', place: 'ROOFTOP LAB', speaker: 'MARA VENN', character: 'mara',
      text: `I hide the waveform. Nia sees the lie anyway. She quietly opens her notebook: the same triangle and broken circle cover six pages, each dated tomorrow. “Fine,” she says. “We can be dishonest and terrified at the same time.”`,
      choices: [
        { text: 'Apologize and compare the diagrams.', to: 'chime', add: { trust: 1, insight: 1 }, set: { notebookMemory: true } },
        { text: 'Keep working alone.', to: 'chime', add: { trust: -1 }, set: { soloed: true } }
      ]
    },
    chime: {
      time: '21:08:30', place: 'BELLWETHER CITY', speaker: 'NARRATION', character: 'both', signal: 'CITY CARRIER DETECTED · 08:30 TO EVENT',
      text: `Every public speaker in Bellwether plays three bright notes, one low note, four bright notes. The receiver answers from the bench. Across town, the dead clock on Meridian Tower moves for the first time in nineteen years.`,
      choices: [
        { text: 'Trace the chime through the tram network.', to: 'tram_platform' },
        { text: 'Climb to the roof and triangulate the carrier.', to: 'roof_array' },
        { text: 'Stay with Nia and study the notebook.', to: 'white_minute', add: { trust: 1 }, set: { notebookMemory: true } }
      ]
    },
    tram_platform: {
      time: '21:10:46', place: 'ABANDONED TRAM PLATFORM', speaker: 'MARA VENN', character: 'mara',
      text: `The signal runs through rails no train has touched in a decade. Three lamps wake. Then one. Then four. Between pulses, a woman's silhouette crosses the platform thirteen seconds before her shadow.`,
      choices: [
        { text: 'Record 3–1–4 as a lock sequence.', to: 'tram_code', set: { bellCode: true }, add: { insight: 1 } },
        { text: 'Follow the shadow instead of the woman.', to: 'tram_code', set: { shadowMap: true }, add: { drift: 4 } }
      ]
    },
    tram_code: {
      time: '21:12:08', place: 'ABANDONED TRAM PLATFORM', speaker: 'THE AUDITOR', character: 'mara', signal: 'UNIDENTIFIED VOICE · MERIDIAN RELAY 03',
      text: `The platform speaker breathes. “Mara Venn. You have already made this worse.” The unknown woman knows my name, Nia's notebook, and the exact second the roof will collapse. “At 21:17, choose what the city forgets.”`,
      choices: [
        { text: 'Ask who she had to forget.', to: 'white_minute', set: { auditorGrief: true }, add: { insight: 1 } },
        { text: 'Run back to Nia before 21:17.', to: 'white_minute', add: { trust: 1 }, set: { niaPromise: true } }
      ]
    },
    roof_array: {
      time: '21:10:33', place: 'ROOFTOP ANTENNA', speaker: 'NIA CALDER', character: 'nia',
      text: `Rain threads sideways through the antenna cage. Nia rotates the loop while I watch the spectrum. The carrier is not coming from Meridian Tower—it is coming from the empty space thirteen minutes ahead of it.`,
      choices: [
        { text: 'Lock onto the violet sideband.', to: 'roof_frequency', set: { violetKey: true }, add: { insight: 1 } },
        { text: 'Ask Nia why her hands are shaking.', to: 'roof_frequency', add: { trust: 1 }, set: { niaConcern: true } }
      ]
    },
    roof_frequency: {
      time: '21:12:21', place: 'ROOFTOP ANTENNA', speaker: 'NIA CALDER', character: 'nia',
      text: `“Because I have heard this before.” Nia shows me the red bracelet: three brass beads, then an empty knot. “My sister Lio vanished on a Tuesday no calendar admits existed. This frequency was playing in her room.”`,
      choices: [
        { text: 'Promise that Lio will not become a bargaining chip.', to: 'white_minute', add: { trust: 2 }, set: { niaPromise: true, lioKnown: true } },
        { text: 'Focus on surviving the next five minutes.', to: 'white_minute', set: { lioKnown: true } }
      ]
    },
    white_minute: {
      time: '21:16:59', place: 'ROOFTOP LAB', speaker: 'NARRATION', character: 'both', signal: 'TEMPORAL PRESSURE CRITICAL',
      text: `At 21:17, every clock in view shows a different time. Rain stops between sky and roof. Nia says my name in thirteen overlapping voices. The receiver's timing chamber turns white enough to erase its own shadow.`,
      choices: [
        { text: 'Hold onto Nia.', to: 'collapse_choice', add: { trust: 1 }, set: { niaPromise: true } },
        { text: 'Save the impossible cassette.', to: 'collapse_choice', set: { cassette: true } },
        { text: 'Transmit one warning to your earlier self.', to: 'collapse_choice', set: { selfWarning: true }, add: { drift: 4 } }
      ]
    },
    collapse_choice: {
      time: '—:—:—', place: 'THE WHITE MINUTE', speaker: 'MARA VENN', character: 'mara', signal: 'CAUSAL ANCHOR LOST',
      text: `The world becomes a photograph held too close to flame. I remember a tower door, a three–one–four bell, and Nia shouting that memory can have more than one owner. Then the receiver asks for a destination.`,
      choices: [
        { text: 'Return thirteen minutes with the bell rhythm.', to: 'loop_reset', set: { bellCode: true } },
        { text: 'Return with the violet frequency.', to: 'loop_reset', set: { violetKey: true } },
        { text: 'Return with Nia’s name in your mouth.', to: 'loop_reset', add: { trust: 1 }, set: { niaPromise: true } }
      ]
    },
    loop_reset: {
      time: '21:03:59', place: 'BETWEEN MOMENTS', speaker: 'THE RECEIVER', character: 'none', signal: 'ANCHOR FOUND · MEMORY TRANSFER ARMED',
      text: `“You cannot change what you refuse to understand,” my older voice says. The white light folds inward, taking the room but leaving the facts.`,
      choices: [
        { text: 'Open your eyes at 21:04.', to: 'intro_1', rewind: true, echo: true }
      ]
    },
    preempt_warning: {
      time: '21:04:09', place: 'ROOFTOP LAB', speaker: 'MARA VENN', character: 'mara', signal: 'OUTBOUND WORDS MATCH INBOUND CARRIER',
      text: `“Do not let Nia finish the circle.” I speak in unison with the receiver. The two voices cancel, leaving a third underneath: Nia whispering coordinates for the old Clock Archive and begging me not to trust the woman I become.`,
      choices: [
        { text: 'Open the door before Nia knocks.', to: 'nia_confession', set: { archiveKnown: true }, add: { insight: 1 } },
        { text: 'Follow the coordinates alone.', to: 'archive_entry', set: { soloed: true, archiveKnown: true }, add: { trust: -1 } }
      ]
    },
    echo_break: {
      time: '21:04:03', place: 'ROOFTOP LAB', speaker: 'MARA VENN', character: 'mara', signal: '314 kHz · RETURN CHANNEL OPEN',
      text: `I tune 314 kHz before the receiver rings. The future call arrives backward, each word reconstructing itself from static. The final phrase is clear: “CLOCK ARCHIVE. BRING NIA. I COULDN’T.”`,
      choices: [
        { text: 'Bring Nia and tell her every loop.', to: 'nia_confession', add: { trust: 2 }, set: { toldNia: true, archiveKnown: true } },
        { text: 'Leave before the four knocks.', to: 'archive_entry', set: { soloed: true, archiveKnown: true }, add: { trust: -1 } }
      ]
    },
    nia_confession: {
      time: '21:06:00', place: 'ROOFTOP LAB · STAIRWELL', speaker: 'NIA CALDER', character: 'nia',
      text: `I say “Lio” through the closed door. Silence. Nia enters without knocking and opens her notebook to hundreds of diagrams she does not remember drawing. Every erased loop has left pressure marks in the paper. “So,” she says, furious and afraid, “start at the first version of me you betrayed.”`,
      repeat: `This time Nia opens the notebook before I say Lio's name. “The paper remembers you too,” she says. A new diagram shows two hands on the same dial.`,
      choices: [
        { text: 'Tell her the complete truth, including the lies.', to: 'archive_entry', add: { trust: 2, insight: 1 }, set: { notebookMemory: true, niaPromise: true, archiveKnown: true } },
        { text: 'Only explain what leads to the archive.', to: 'archive_entry', add: { trust: 1 }, set: { notebookMemory: true, archiveKnown: true } }
      ]
    },
    archive_entry: {
      time: '21:09:11', place: 'BELLWETHER CLOCK ARCHIVE', speaker: 'NARRATION', character: 'both', signal: 'ANCHOR REGISTERED · ARCHIVE',
      text: `Beneath Meridian Station, a museum of stopped clocks ticks in complete darkness. Each face is frozen at 21:17. Nia's flashlight finds a maintenance ledger signed MARA VENN—thirty-two years from now.`,
      repeat: `The clocks begin ticking as we descend, welcoming repeat visitors. My future signature is joined by Nia's this time. Neither ink is dry.`,
      anchor: 'archive_entry',
      choices: [
        { text: 'Search your future maintenance records.', to: 'archive_stacks', set: { auditorTrail: true }, add: { insight: 1 } },
        { text: 'Follow Nia to Lio’s erased file.', to: 'archive_stacks', add: { trust: 1 }, set: { lioKnown: true } }
      ]
    },
    archive_stacks: {
      time: '21:10:52', place: 'CLOCK ARCHIVE · STACK 13', speaker: 'NIA CALDER', character: 'nia',
      text: `The ledger calls the White Minute a pressure valve. Bellwether’s synchronization grid predicts accidents, then pushes warnings thirteen minutes backward. Every prevented disaster leaves an orphaned memory. Lio was the first person the grid could not reconcile.`,
      choices: [
        { text: 'Overlay Nia’s paper diagrams on the ledger.', to: 'map_choice', requires: ['notebookMemory'], set: { lioPattern: true, bellCode: true }, add: { insight: 2 } },
        { text: 'Copy the tower access sequence: 3–1–4.', to: 'map_choice', set: { bellCode: true }, add: { insight: 1 } },
        { text: 'Tune the ledger’s security strip violet.', to: 'map_choice', requires: ['violetKey'], set: { phasePattern: true }, add: { insight: 1 } }
      ]
    },
    map_choice: {
      time: '21:12:40', place: 'CLOCK ARCHIVE', speaker: 'MARA VENN', character: 'both',
      text: `A service tunnel leads directly to Meridian Tower. My future notes contain one instruction: ENTER ALONE. Nia crosses it out. “Maybe she keeps failing because she keeps deciding for both of us.”`,
      choices: [
        { text: 'Go together and share the receiver.', to: 'tower_entry', add: { trust: 2 }, set: { niaPromise: true } },
        { text: 'Ask Nia to guide you over the radio.', to: 'tower_entry', add: { trust: 1 }, set: { remoteNia: true } },
        { text: 'Obey your future self and enter alone.', to: 'tower_entry', add: { trust: -2, drift: 5 }, set: { soloed: true } }
      ]
    },
    tower_entry: {
      time: '21:14:02', place: 'MERIDIAN TOWER', speaker: 'NARRATION', character: 'both', signal: 'ANCHOR REGISTERED · MERIDIAN',
      text: `The tower lobby is a cathedral built for clocks: brass pendulums, glass relays, and a sealed lift with four dead bell keys. Above it, a red display counts down from 03:00.`,
      repeat: `The countdown begins at 03:00. I know every pendulum’s swing now, but knowledge does not make the red numbers slower.`,
      anchor: 'tower_entry',
      choices: [
        { text: 'Ring the keys 3–1–4.', to: 'tower_chamber', requires: ['bellCode'], echo: true, set: { lockSolved: true } },
        { text: 'Flood the reader with violet carrier noise.', to: 'tower_chamber', requires: ['violetKey'], echo: true, add: { drift: 3 }, set: { lockSolved: true } },
        { text: 'Guess 1–3–4 from the worn keys.', to: 'wrong_code', add: { drift: 8 } },
        { text: 'Pry open the relay panel.', to: 'wrong_code', add: { stability: -8 } }
      ]
    },
    wrong_code: {
      time: '21:15:01', place: 'MERIDIAN TOWER', speaker: 'THE AUDITOR', character: 'mara', signal: 'ACCESS REJECTED · COUNTERMEASURE ARMED',
      text: `Every pendulum slams sideways. “You came without the bell,” the tower voice says. “That mistake killed Nia in nine versions and you in three.” The lift seals as the White Minute climbs the walls.`,
      choices: [
        { text: 'Rewind and investigate the tram chime.', to: 'intro_1', rewind: true, set: { needBellCode: true }, echo: true },
        { text: 'Force a return to the Clock Archive.', to: 'archive_entry', rewind: true, echo: true }
      ]
    },
    tower_chamber: {
      time: '21:15:19', place: 'MERIDIAN TOWER · CARRIER ROOM', speaker: 'MARA VENN', character: 'mara',
      text: `The lift opens inside the clock. Copper rings orbit a chair wired to Bellwether’s entire public network. A woman stands within them, older than me by thirty years and tired in precisely the same places.`,
      choices: [
        { text: '“You are the voice in the receiver.”', to: 'auditor_reveal', set: { auditorIdentity: true } },
        { text: '“What did you do to Lio Calder?”', to: 'auditor_reveal', requires: ['lioKnown'], add: { trust: 1 }, set: { auditorIdentity: true } },
        { text: 'Silently compare her burn scar to yours.', to: 'auditor_reveal', add: { insight: 1 }, set: { auditorIdentity: true } }
      ]
    },
    auditor_reveal: {
      time: '21:15:42', place: 'MERIDIAN TOWER · CARRIER ROOM', speaker: 'THE AUDITOR', character: 'mara', signal: 'IDENTITY MATCH · MARA VENN / OFFSET +32 YEARS',
      text: `“I kept the city alive,” my future says. “The first warning saved six hundred people. The correction erased Lio. Every rescue after that deepened the debt. I built this loop so one version of us might find a solution I could not.” She raises a phase key. “Most versions try to take it.”`,
      choices: [
        { text: 'Ask her to stand down.', to: 'phase_confront', add: { insight: 1 } },
        { text: 'Let Nia answer her.', to: 'phase_confront', minTrust: 2, add: { trust: 1 }, set: { niaSpoke: true } },
        { text: 'Reach for the phase key.', to: 'phase_confront', add: { drift: 5 } }
      ]
    },
    phase_confront: {
      time: '21:16:03', place: 'MERIDIAN TOWER · PHASE ARRAY', speaker: 'THE AUDITOR', character: 'mara', signal: 'HOSTILE PHASE LOCK · MANUAL CONTROL REQUIRED',
      text: `The copper rings accelerate. The Auditor splits the carrier into four moving bands. “If you cannot hold an impossible frequency,” she says, “you cannot be trusted with an impossible choice.”`,
      choices: [
        { text: 'Take the receiver and lock the phases.', boss: true }
      ]
    },
    boss_fail: {
      time: '21:16:31', place: 'MERIDIAN TOWER · PHASE ARRAY', speaker: 'NIA CALDER', character: 'nia', signal: 'PHASE REJECTED · PATTERN RETAINED',
      text: `The fourth band tears free. Nia catches me before the carrier does. “You were chasing the needle,” she shouts over the alarms. “Don’t. Listen for the pause before it changes direction. The paper drew it as a wider window.”`,
      choices: [
        { text: 'Rewind to the tower door and try again.', to: 'tower_entry', rewind: true, echo: true, set: { phasePattern: true } },
        { text: 'Return to the archive for another solution.', to: 'archive_entry', rewind: true, echo: true, set: { phasePattern: true } }
      ]
    },
    boss_win: {
      time: '21:16:32', place: 'MERIDIAN TOWER · PHASE ARRAY', speaker: 'MARA VENN', character: 'mara', signal: 'FOUR PHASES LOCKED · CARRIER YIELDED',
      text: `The final band snaps into harmony. For one breath I can hear every warning the city ever received: brake, turn, wait, duck, call home. The Auditor lowers her hands. “Good,” she whispers. “Now make the choice that ruined me.”`,
      choices: [
        { text: 'Take the phase key and hear the whole truth.', to: 'truth_1', set: { phaseKey: true }, add: { insight: 1 } }
      ]
    },
    truth_1: {
      time: '21:16:41', place: 'MERIDIAN TOWER · ZERO SECOND', speaker: 'NARRATION', character: 'both',
      text: `The key opens the zero second: the infinitesimal room between cause and effect. Lio is there—not alive, not dead, but distributed through every warning the grid sent. Her missing memory is the scaffold holding Bellwether’s rescued futures together.`,
      choices: [
        { text: 'Search for a way to share the causal load.', to: 'truth_2', add: { insight: 1 }, set: { braidedTheory: true } },
        { text: 'Accept that one person cannot outweigh a city.', to: 'truth_2', set: { sacrificeAccepted: true } },
        { text: 'Ask Nia what Lio would choose.', to: 'truth_2', minTrust: 2, add: { trust: 1 }, set: { askedNia: true } }
      ]
    },
    truth_2: {
      time: '21:16:52', place: 'MERIDIAN TOWER · ZERO SECOND', speaker: 'NIA CALDER', character: 'nia', signal: '00:08 TO WHITE MINUTE',
      text: (s) => has(s, 'niaSpoke') || s.trust >= 3
        ? `Nia lays her remembered pages over the array. “A warning does not need one sender. A memory does not need one owner. Your future kept making a circle because she forgot a braid can cross itself without closing.”`
        : `Over the radio, Nia says, “You keep treating time like a wire that belongs to whoever holds the cutters. I can help, Mara—but I cannot trust for both of us.”`,
      choices: [
        { text: 'Set the final routing before 21:17.', to: 'final_choice' }
      ]
    },
    final_choice: {
      time: '21:16:59', place: 'MERIDIAN TOWER · ZERO SECOND', speaker: 'MARA VENN', character: 'both', signal: 'FINAL ROUTE · NO SAFE DEFAULT',
      text: `One second remains, large enough to live inside. The receiver can sever the network, preserve the loop, send one final message, or braid two memories through the gap. Every answer saves something. Every answer abandons something else.`,
      choices: [
        { text: 'Trust Nia. Braid your memories and carry Lio together.', ending: 'braided_dawn', minTrust: 3, requires: ['phaseKey', 'niaPromise'], lockedText: 'A shared ending requires deeper trust and a promise kept.' },
        { text: 'Overlay every clue and call Lio out by name.', ending: 'lio_remembers', minInsight: 5, requires: ['phaseKey', 'lioPattern', 'violetKey', 'bellCode'], lockedText: 'A hidden route requires the bell, violet carrier, archive overlay, and five insights.' },
        { text: 'Smash the receiver and end every warning.', ending: 'quiet_city' },
        { text: 'Take the Auditor’s chair and preserve the loop.', ending: 'the_auditor', requires: ['auditorIdentity'] },
        { text: 'Spend the final charge on thirteen words to your first self.', ending: 'thirteen_words', requires: ['selfWarning'] }
      ]
    }
  };

  function freshState() {
    return {
      node: 'intro_1', loop: 1, stability: 72, drift: 0, trust: 0, insight: 0,
      flags: {}, visits: {}, visitLoops: {}, unlockedAnchors: ['intro_1'], history: [], endings: [], started: false
    };
  }

  let state = freshState();
  let currentNode = null;
  let toastTimer = null;
  let audioContext = null;
  let soundOn = false;
  let bossActive = false;
  let bossFrame = null;
  let bossStart = 0;
  let needlePosition = 0;
  let targetStart = 54;
  let targetWidth = 14;
  let bossHits = 0;
  let bossMisses = 0;

  function loadSave() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!saved || !nodes[saved.node]) return false;
      state = { ...freshState(), ...saved, flags: saved.flags || {}, visits: saved.visits || {}, visitLoops: saved.visitLoops || {} };
      return true;
    } catch {
      return false;
    }
  }

  function saveGame(label = 'AUTOSAVED') {
    state.node = currentNode || state.node;
    state.started = true;
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    $('#saveStatus').textContent = `${label} · LOOP ${String(state.loop).padStart(2, '0')}`;
  }

  function conditionsMet(choice) {
    if (choice.minLoop && state.loop < choice.minLoop) return false;
    if (choice.minTrust && state.trust < choice.minTrust) return false;
    if (choice.minInsight && state.insight < choice.minInsight) return false;
    if (choice.requires && !choice.requires.every((flag) => has(state, flag))) return false;
    if (choice.unless && choice.unless.some((flag) => has(state, flag))) return false;
    return true;
  }

  function applyChoice(choice) {
    if (choice.set) Object.assign(state.flags, choice.set);
    if (choice.add) {
      state.trust += choice.add.trust || 0;
      state.insight += choice.add.insight || 0;
      state.drift = clamp(state.drift + (choice.add.drift || 0), 0, 100);
      state.stability = clamp(state.stability + (choice.add.stability || 0), 0, 100);
    }
    if (choice.ending) {
      playTone(880, .16, 'sine');
      showEnding(choice.ending);
      return;
    }
    if (choice.boss) {
      startBoss();
      return;
    }
    if (choice.rewind) {
      rewindTo(choice.to);
      return;
    }
    playTone(460, .045, 'triangle');
    enterNode(choice.to);
  }

  function enterNode(id, options = {}) {
    const node = nodes[id];
    if (!node) return;
    currentNode = id;
    state.node = id;
    const visitCount = state.visits[id] || 0;
    const lastVisitedLoop = state.visitLoops[id] || 0;
    const isEchoVisit = Boolean(options.fromRewind || (lastVisitedLoop && lastVisitedLoop < state.loop));
    state.visits[id] = visitCount + 1;
    state.visitLoops[id] = state.loop;

    if (node.anchor && !state.unlockedAnchors.includes(node.anchor)) {
      state.unlockedAnchors.push(node.anchor);
      showToast('NEW REWIND ANCHOR RECORDED');
    }

    const text = isEchoVisit && node.repeat
      ? node.repeat
      : typeof node.text === 'function' ? node.text(state, visitCount > 0) : node.text;

    $('#timeDisplay').textContent = node.time;
    $('#loopDisplay').textContent = String(state.loop).padStart(2, '0');
    $('#speaker').textContent = node.speaker;
    $('#place').textContent = `${node.place} · ${node.time}`;
    $('#storyText').textContent = text;
    $('#storyText').classList.toggle('echo', isEchoVisit);
    $('#signalCaption').textContent = node.signal || '';
    updatePortraits(node.character, node.speaker);
    updateMeters();
    renderChoices(node.choices || []);

    state.history.push({ loop: state.loop, time: node.time, speaker: node.speaker, text });
    state.history = state.history.slice(-60);
    saveGame(options.fromRewind ? 'ANCHOR RESTORED' : 'AUTOSAVED');

    if (isEchoVisit) triggerGlitch();
  }

  function renderChoices(choices) {
    const container = $('#choices');
    container.replaceChildren();
    choices.forEach((choice) => {
      const available = conditionsMet(choice);
      if (!available && !choice.lockedText) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `choice${choice.echo ? ' echo-choice' : ''}`;
      button.textContent = available ? choice.text : `LOCKED · ${choice.lockedText}`;
      button.disabled = !available;
      if (!available) button.title = choice.lockedText;
      button.addEventListener('click', () => applyChoice(choice));
      container.append(button);
    });
  }

  function updatePortraits(character, speaker) {
    const mara = $('#maraPortrait');
    const nia = $('#niaPortrait');
    mara.classList.toggle('show', character === 'mara' || character === 'both');
    nia.classList.toggle('show', character === 'nia' || character === 'both');
    mara.classList.toggle('dim', character === 'both' && speaker.includes('NIA'));
    nia.classList.toggle('dim', character === 'both' && (speaker.includes('MARA') || speaker === 'NARRATION'));
  }

  function updateMeters() {
    $('#stabilityDisplay').textContent = `${state.stability}%`;
    $('#stabilityMeter').style.width = `${state.stability}%`;
    $('#driftDisplay').textContent = `${state.drift}%`;
    $('#driftMeter').style.width = `${state.drift}%`;
  }

  function rewindTo(id) {
    state.loop += 1;
    state.drift = clamp(state.drift + 7, 0, 100);
    state.stability = clamp(state.stability - 4, 0, 100);
    closePanels();
    playTone(165, .24, 'sawtooth');
    triggerGlitch();
    enterNode(id, { fromRewind: true });
  }

  function triggerGlitch() {
    const scene = $('#scene');
    scene.classList.remove('glitch');
    requestAnimationFrame(() => scene.classList.add('glitch'));
    window.setTimeout(() => scene.classList.remove('glitch'), 1000);
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function openPanel(id) {
    closePanels();
    const panel = document.getElementById(id);
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
  }

  function closePanels() {
    document.querySelectorAll('.panel').forEach((panel) => {
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
    });
    $('#settingsButton').setAttribute('aria-expanded', 'false');
  }

  function renderLog() {
    const log = $('#logEntries');
    log.replaceChildren();
    if (!state.history.length) {
      log.textContent = 'No transmissions recorded yet.';
      return;
    }
    [...state.history].reverse().forEach((entry) => {
      const item = document.createElement('article');
      item.className = 'log-entry';
      const label = document.createElement('b');
      label.textContent = `LOOP ${String(entry.loop).padStart(2, '0')} · ${entry.time} · ${entry.speaker}`;
      const copy = document.createElement('p');
      copy.textContent = entry.text;
      item.append(label, copy);
      log.append(item);
    });
  }

  function renderAnchors() {
    const list = $('#anchorList');
    list.replaceChildren();
    state.unlockedAnchors.forEach((id) => {
      const anchor = anchors[id];
      if (!anchor) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'anchor-button';
      button.innerHTML = `<b>${anchor.title}</b><small>${anchor.detail} · +7% drift</small>`;
      button.addEventListener('click', () => rewindTo(id));
      list.append(button);
    });
  }

  function startBoss() {
    bossActive = true;
    bossHits = 0;
    bossMisses = 0;
    targetWidth = has(state, 'phasePattern') ? 18 : 14;
    targetStart = randomTarget();
    updateBossUi();
    $('#bossStatus').textContent = has(state, 'phasePattern')
      ? 'You remember the pause. The live band feels wider now.'
      : 'The carrier is moving. Watch the band.';
    const overlay = $('#bossOverlay');
    overlay.setAttribute('aria-hidden', 'false');
    positionTarget();
    bossStart = performance.now();
    bossFrame = requestAnimationFrame(animateNeedle);
    window.setTimeout(() => $('#lockButton').focus(), 80);
  }

  function randomTarget() {
    return Math.round(8 + Math.random() * (84 - targetWidth));
  }

  function positionTarget() {
    $('#phaseTarget').style.left = `${targetStart}%`;
    $('#phaseTarget').style.width = `${targetWidth}%`;
  }

  function animateNeedle(now) {
    if (!bossActive) return;
    const speed = has(state, 'phasePattern') ? .7 : .88;
    const cycle = ((now - bossStart) * speed / 1000) % 2;
    needlePosition = 2 + (cycle <= 1 ? cycle : 2 - cycle) * 96;
    $('#phaseNeedle').style.left = `${needlePosition}%`;
    bossFrame = requestAnimationFrame(animateNeedle);
  }

  function lockPhase() {
    if (!bossActive) return;
    const hit = needlePosition >= targetStart && needlePosition <= targetStart + targetWidth;
    if (hit) {
      bossHits += 1;
      playTone(660 + bossHits * 85, .12, 'sine');
      $('#bossStatus').textContent = `Phase ${bossHits} held. The signal is learning your pulse.`;
      targetWidth = Math.max(has(state, 'phasePattern') ? 12 : 8, targetWidth - 1.5);
      targetStart = randomTarget();
      positionTarget();
    } else {
      bossMisses += 1;
      playTone(115, .14, 'sawtooth');
      $('#bossStatus').textContent = 'FAULT — the carrier slipped. Wait for the turn.';
    }
    updateBossUi();
    if (bossHits >= 4) finishBoss(true);
    if (bossMisses >= 3) finishBoss(false);
  }

  function updateBossUi() {
    $('#bossHits').textContent = `${bossHits} / 4`;
    $('#bossMisses').textContent = `${bossMisses} / 3`;
  }

  function finishBoss(won) {
    bossActive = false;
    cancelAnimationFrame(bossFrame);
    $('#bossStatus').textContent = won ? 'PHASE LOCK ACCEPTED' : 'PHASE LOCK REJECTED';
    state.flags[won ? 'phaseKey' : 'phasePattern'] = true;
    if (!won) {
      state.drift = clamp(state.drift + 6, 0, 100);
      state.stability = clamp(state.stability - 5, 0, 100);
    }
    window.setTimeout(() => {
      $('#bossOverlay').setAttribute('aria-hidden', 'true');
      enterNode(won ? 'boss_win' : 'boss_fail');
    }, 850);
  }

  function showEnding(id) {
    const ending = endings[id];
    if (!ending) return;
    if (!state.endings.includes(id)) state.endings.push(id);
    saveGame('ENDING RECORDED');
    $('#endingKicker').textContent = ending.kicker;
    $('#endingTitle').textContent = ending.title;
    $('#endingText').textContent = ending.text;
    $('#endingCount').textContent = `${state.endings.length} OF ${Object.keys(endings).length} ENDINGS REMEMBERED`;
    $('#endingOverlay').setAttribute('aria-hidden', 'false');
  }

  function beginNewGame() {
    state = freshState();
    currentNode = 'intro_1';
    state.started = true;
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    $('#endingOverlay').setAttribute('aria-hidden', 'true');
    $('#startScreen').classList.add('hidden');
    $('#scene').classList.add('active');
    enterNode('intro_1');
  }

  function continueGame() {
    $('#startScreen').classList.add('hidden');
    $('#scene').classList.add('active');
    enterNode(state.node || 'intro_1');
  }

  function setTheme(theme) {
    const allowed = ['solar-static', 'midnight-signal', 'red-shift', 'paper-memory'];
    const next = allowed.includes(theme) ? theme : 'solar-static';
    document.body.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    const input = document.querySelector(`input[name="theme"][value="${next}"]`);
    if (input) input.checked = true;
  }

  function playTone(frequency, duration, type = 'sine') {
    if (!soundOn) return;
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.045, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  }

  function toggleSound() {
    soundOn = !soundOn;
    $('#soundButton').textContent = `SOUND: ${soundOn ? 'ON' : 'OFF'}`;
    $('#soundButton').setAttribute('aria-pressed', String(soundOn));
    if (soundOn) playTone(520, .08, 'sine');
  }

  $('#newGameButton').addEventListener('click', beginNewGame);
  $('#continueButton').addEventListener('click', continueGame);
  $('#soundButton').addEventListener('click', toggleSound);
  $('#settingsButton').addEventListener('click', () => {
    const opening = !$('#settingsPanel').classList.contains('open');
    if (opening) openPanel('settingsPanel'); else closePanels();
    $('#settingsButton').setAttribute('aria-expanded', String(opening));
  });
  $('#historyButton').addEventListener('click', () => { renderLog(); openPanel('logPanel'); });
  $('#rewindButton').addEventListener('click', () => { renderAnchors(); openPanel('rewindPanel'); });
  $('#lockButton').addEventListener('click', lockPhase);
  $('#loopAgainButton').addEventListener('click', () => {
    $('#endingOverlay').setAttribute('aria-hidden', 'true');
    rewindTo('intro_1');
  });
  $('#freshStartButton').addEventListener('click', () => {
    if (!window.confirm('Erase every loop, clue, and ending?')) return;
    localStorage.removeItem(SAVE_KEY);
    window.location.reload();
  });

  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', closePanels));
  document.querySelectorAll('input[name="theme"]').forEach((input) => input.addEventListener('change', () => setTheme(input.value)));
  $('#motionToggle').addEventListener('change', (event) => {
    document.body.classList.toggle('reduce-motion', event.target.checked);
    localStorage.setItem(MOTION_KEY, event.target.checked ? 'on' : 'off');
  });
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && bossActive) {
      event.preventDefault();
      lockPhase();
    }
    if (event.key === 'Escape') closePanels();
  });

  const savedTheme = localStorage.getItem(THEME_KEY) || 'solar-static';
  setTheme(savedTheme);
  const reducedMotion = localStorage.getItem(MOTION_KEY) === 'on' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('#motionToggle').checked = reducedMotion;
  document.body.classList.toggle('reduce-motion', reducedMotion);
  if (loadSave() && state.started) {
    $('#continueButton').hidden = false;
    $('#continueButton').textContent = `CONTINUE · LOOP ${String(state.loop).padStart(2, '0')}`;
  }
})();
