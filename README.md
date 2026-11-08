# Six Nights of Light

An interactive, cinematic Diwali greeting: six festivals, each with its own fireworks, atmosphere, greeting and voice-over,
the Nikharge Family name formed from firework sparks, and a grand finale.
Built with React + TypeScript + Tailwind CSS v4, HTML5 Canvas and the Web Audio API. No backend.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/ (deploy anywhere: Vercel, Netlify, S3, Nginx)
```

## The six days and the midnight switch

Dates live in `src/festivals.ts` (Diwali 2026: 6, 7, 8, 10, 11 and 14 November). Update them each year.

The viewer's local calendar day decides which festival is "Tonight". It switches at 12:00 midnight
(with a timer, and re-checked whenever the tab comes back), the opening screen says "Tonight · Bhai Dooj",
and that festival's card is highlighted. All six stay open to everyone. The grand finale unlocks after all six
have been watched (saved in the browser), or once the festival week is over. Day 6 always leads into it.

| URL | Effect |
| --- | --- |
| `?day=3` | after the first click, opens straight into Diwali (this is the link the Share button sends) |
| `?finale` | opens straight into the grand finale |
| `?date=2026-11-10` | pretends today is that date, for testing the midnight switch |

## Audio

Everything works with no audio files: fireworks, crackle, coins, the riser and the background music
(a tanpura drone with santoor-style plucks) are generated live, and the voice-over uses the most natural voice installed on the device.
Audio starts only after the first click. Press **M** to mute.

You can add optional files to `public/`. Any file that is missing is simply skipped:

```
public/voice/dhanteras.mp3        "May Prosperity Find Its Way to You. Wishing you new beginnings…"
public/voice/choti-diwali.mp3
public/voice/diwali.mp3
public/voice/govardhan-puja.mp3
public/voice/bhai-dooj.mp3
public/voice/labh-panchami.mp3
public/voice/brand.mp3            "From all of us in the Nikharge family, wishing you a celebration filled with light and happiness."
public/voice/finale-title.mp3     "Six Days of Light. A Lifetime of Possibilities."
public/voice/finale-wish.mp3      "From the Nikharge family to yours, wishing you a Diwali filled with joy…"
public/audio/music.mp3            replaces the generated background music (it loops)
public/audio/happy-diwali-song.mp3   the "Happy Diwali" song (e.g. the Jethalal clip)
```

The song plays automatically on the opening screen, on every day's title screen (the greeting follows when it ends), and at the end of the grand finale.
Browsers block sound until the visitor interacts, so when the autoplay is refused it starts on the visitor's first tap or click. Only its first 5 seconds are played, faded out.
Once the file is present, a **♪ Happy Diwali** button also appears at the top so viewers can play it any time.
The background music fades down while the voice or the song plays.
Only use song clips you have the rights to publish.

Trim the silence at the start of the voice files so they stay in sync. The show waits for each line to finish before it moves on.

## Code map

| File | What it does |
| --- | --- |
| `src/festivals.ts` | The six festivals: dates, wishes, colours, shell mix, signature shell, atmosphere |
| `src/schedule.ts` | Works out which festival is tonight, and the time until the next midnight |
| `src/engine/engine.ts` | Particle engine: rockets, 8 shell types (including heart), coin showers, diyas, sky lanterns, floating hearts, sky tint, firework-text formation |
| `src/engine/show.ts` | The director: each festival's timeline, the family-name reveal, the grand finale, voice and music sync |
| `src/engine/audio.ts` | Web Audio: launches, booms, crackle, coins, riser, shimmer, generated music, ducking, songs |
| `src/engine/voice.ts` | Voice-over: recorded clips or the best device voice, with end-of-line callbacks |
| `src/App.tsx` | UI: opening screen, festival cards, animated greetings, controls, share |
