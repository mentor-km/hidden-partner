# Hidden Partner — Product & Technical Spec v2

Nov 7, 2026 · @Kandarp Mathur

## Overview

Hidden Partner is a free web card game for 5 to 9 friends on phones or laptops, with no sign-up. One player creates a room and shares a link; everyone then plays a series of rounds of bidding and trick-taking, where the bidder's partners stay hidden until they choose to play the called card.

- **Audience:** friend groups who enjoy trick-taking games with bidding and hidden teams.
- **Version 1:** humans only (no bots), 5 to 9 players, 3 decks, points only (no money), matches of 3, 5 or more rounds with the highest total winning, saved so a match can pause and resume.
- **Not in version 1:** bots, accounts, global leaderboards, real-money play, in-game chat, native apps.

## Players, decks and the 2,520-point pool

Every match uses 3 decks, so each card exists in exactly 3 copies. The deck changes with the player count so that each player always gets 12 cards and the point pool stays at 2,520. All four suits are used.

| Players | Ranks in the deck | Cards in play | Dealt |
| --- | --- | --- | --- |
| 5 | 10, J, Q, K, A | 60 | 12 each |
| 6 | 9 to A | 72 | 12 each |
| 7 | 8 to A | 84 | 12 each |
| 8 | 7 to A | 96 | 12 each |
| 9 | 6 to A | 108 | 12 each |

Card order, high to low: A, K, Q, J, 10, 9, 8, 7, 6. Only five ranks score. Each has 12 copies (4 suits × 3 decks), which gives the pool.

| Card | Points each | Copies | Total |
| --- | --- | --- | --- |
| Ace | 100 | 12 | 1,200 |
| King | 50 | 12 | 600 |
| Queen | 30 | 12 | 360 |
| Jack | 20 | 12 | 240 |
| Ten | 10 | 12 | 120 |
| 9 and lower | 0 | 0 | 0 |
| **Pool** |  |  | **2,520** |

Because the added or removed ranks are worth 0, the pool is 2,520 for every player count.

## Create a room, share the link, join

A host creates a room in two taps and shares one link. Friends join from any phone browser with just a name, and the host starts the game once 5 to 9 people are seated.

### Host: create and invite

1. Open the site, enter a name and tap **Create room**.
2. Choose the number of rounds: presets of 3, 5 and 7, or a custom number. It can be changed until the first deal.
3. The server creates the room and returns a 6-character room code (no look-alike characters such as 0/O or 1/I) and a link of the form `/r/<CODE>`.
4. The invite panel opens at once with four ways to invite: a **Share** button that opens the phone's share sheet (WhatsApp in one tap), **Copy link**, a QR code for people in the same room, and the code in large type to read out.
5. The lobby shows seats filling in live as friends join.

### Guest: join

1. Tap the link. It opens the join screen with the code already filled in. Without a link, open the site, tap **Join room** and type the code.
2. Enter a name (a number is added if it is already taken in the room) and tap **Join**. No sign-up.
3. The guest lands in the lobby. The browser remembers the seat, so a refresh or a closed tab does not lose it.

### Lobby rules

| Topic | Rule |
| --- | --- |
| Capacity | 5 to 9 seated humans. A 10th person sees "Room full". |
| Starting | The host's **Start** button turns on at 5 seated players. After the first deal, the players and the round count are locked. |
| Seating | Seat order is random. The table does not offer a way to rearrange seats. Order matters because bidding and play go clockwise. |
| Removing | Before the start, the host can remove a player. |
| Coming back | The same browser rejoins its seat automatically through the same link. On a new device, the player opens the link and enters their name and the 4-digit PIN they chose when joining (optional), or the host releases the seat. |
| Host leaves | The match keeps running because the room server runs it. The host role passes to the longest-seated connected player after a short absence (proposed: 2 minutes). |
| Unused rooms | A lobby that nobody uses expires after a set time (proposed: 24 hours). Started matches follow the Match section. |
| Bad code | An unknown or expired code shows a clear message and an option to create a new room. |

Pasting the link into WhatsApp shows a preview card with the game name and a short line ("You're invited to a Hidden Partner table").

## Match structure

A match is a series of rounds chosen by the host (3, 5, 7 or a custom number). The player with the highest total after the last round wins, and tied players are co-winners.

- **Rounds:** each round is a fresh deal, a full auction and 12 tricks. The round count is locked after the first deal.
- **Dealer and order:** the host deals first, and the dealer moves one seat clockwise each round. Bidding and play go clockwise, starting with the player next to the dealer.
- **Between rounds:** the round-end screen reveals the partners, the points and the score changes, with a running leaderboard. The host taps **Next round**.
- **Waiting for people:** there are no bots, so a missing player stalls the table. Everyone sees who is missing, and the host can **pause** the match.
- **Pause and resume:** a paused or idle match is saved and resumes from the same link, at the same card or bid, for as long as it is kept (proposed: 30 days after the last move, then deleted).
- **Ending early:** the host can end the match; the standings at that moment decide the result, and ties are co-winners.
- **Final screen:** winner or co-winners, all totals, and a round-by-round table of who bid, what was called, and how it ended.

## Round flow: deal, bid, call, play

Each round has four steps. Everything is decided by the server, and each player sees only their own hand.

1. **Deal.** The server shuffles and deals 12 cards to each player. Hands are sorted by suit, then rank.
2. **Bidding.**
   - The opening bid depends on the player count. The floor is 1,570 at 5 players, 1,390 at 6, 1,260 at 7, 1,140 at 8 and 1,050 at 9. The cap is 2,520.
   - Bidding goes clockwise from the player next to the dealer. On their turn a player passes, opens at the floor for that player count if nobody has bid, or raises by **+10** or **+50**. Buttons that would pass 2,520 are off.
   - A pass is final for the round.
   - At least one bid must be made. If everyone before the last player passes, the last player must open at the floor for that player count. A single bid is enough: if one player bids and all others pass, that player is the Bidder.
   - The auction ends when all but one player have passed, or at once if someone bids 2,520, since nobody can raise it.
3. **The call.** The Bidder names one card from their own hand. It must be a 10, J, Q, K or A, and the Bidder must hold exactly 1 or 2 copies of it (never all 3, so there is no solo play).
   - The **suit of the called card is trump** for the round.
   - The **other holders of that card are the Bidder's secret partners**: 1 or 2 players. Partners can see they hold the card. The Bidder does not know who they are.
4. **Trick play.** 12 tricks, led by the Bidder first (see Trick rules).

A team of 3 holds about 3/N of the cards, so one floor would be easier at 5 players and harder at 8 or 9. Each count uses the floor whose make rate, in random-play simulation, is closest to a 7-player game opening at 1,260.

## Trick rules

The highest trump wins a trick; with no trump, the highest card of the suit led wins. Nobody is ever forced to play trump or the called card.

- **Leading:** the Bidder leads the first trick with any card. After that, the winner of each trick leads the next.
- **Following suit:** a player who holds the suit led must play it. Otherwise they may play trump or discard any card; they are never forced to trump.
- **Free play:** the Bidder may lead any card. No one has to play trump or the called card, so partners may stay hidden as long as they like. All 12 tricks are always played, so a partner's called card appears by trick 12 at the latest.
- **Winning a trick:** if any trump was played, the highest trump wins. If not, the highest card of the suit led wins. Other cards cannot win. Order: A, K, Q, J, 10, 9, 8, 7, 6.
- **Identical cards:** if two or more identical winning cards are played to one trick (for example two A♠), the one played last wins.
- **Partner reveal:** when a non-bidder plays the Partner Card, a toast says "<Partner> is <Bidder>'s partner". Each partner is announced once. The Bidder playing their own copy shows no toast.
- **No live points:** no running points are shown during the round, per seat or per trick. Captured tricks are face-down. After a trick is won, the winner is highlighted for about 1 second and the cards are swept.
- **Last trick view (proposed):** the most recent trick stays visible until the next one starts, so players can check what was played.

## Scoring

The Bidder's team (the Bidder plus the partners) wins the round if the card points in the tricks its members captured are **at least the bid**. Every player's score then changes by a multiple of the bid, called X.

| Outcome | Bidder | Each partner | Everyone else |
| --- | --- | --- | --- |
| Bid made | +2X | +1X | −1X |
| Bust, Bidder held 2 copies | −2X | −1X | +1X |
| Bust, Bidder held 1 copy | −1X | −1X | +1X |

Worked examples with 7 players and X = 1,300:

- **Bid made, Bidder held 1 copy, 2 partners:** Bidder +2,600, each partner +1,300, each of the 4 others −1,300.
- **Bust, Bidder held 2 copies, 1 partner:** Bidder −2,600, the partner −1,300, each of the 5 others +1,300.
- **Bust, Bidder held 1 copy, 2 partners:** Bidder −1,300, each partner −1,300, each of the 4 others +1,300.

**Reveal after each round:** the round-end screen shows who the partners were, the points captured by the team and by everyone else, whether the bid was made, each player's score change, and the running leaderboard. Totals are not shown during a round. Scores add up across rounds, and the highest total after the last round wins; ties are co-winners.

## Edge cases

| Situation | Rule |
| --- | --- |
| Bidder holds all 3 copies of a card | That card cannot be called. It is greyed out in the call screen. |
| No callable card in the Bidder's hand | The round is redealt. This should be very rare. |
| Everyone passes before the last player | The last player must open at the floor for that player count. |
| Bid reaches 2,520 | The auction ends at once. |
| Bidder holds 2 copies | One partner. A bust costs the Bidder −2X. |
| Bidder holds 1 copy, the other two copies are with one player | One partner, scored as one partner. |
| Bidder holds 1 copy, the other two copies are with two players | Two partners. |
| A partner keeps the called card to the end | Allowed. It is played by trick 12 at the latest. |
| A player disconnects | The table waits. Everyone sees who is missing, and the player returns through the same link. The host can pause the match. |
| Two moves arrive at once | The room server handles one at a time. A move that is no longer legal is refused with a clear message. |
| Name already taken in the room | A number is added to the name. |

## Screens and experience

The whole game fits on one screen with no page scrolling, on phones (360 to 430 px wide) and desktops (1280 px and up).

- **Layout:** the viewport is locked to the screen height (100dvh). The page itself does not scroll. The auction list or the cards played in the current hand scroll inside their own box. Your cards and the action buttons stay pinned at the bottom.
- **Words on the table:** a trick is called a hand ("Hand 3 of 12", "12 hands played", "You won this hand"). The called card is called the Partner Card ("Trump is hearts. Partner Card: king of hearts"). Your own cards are labelled "Your cards".
- **Table:** a compact top bar shows "You: <name>", the seat, Players and Mute. Rules and the host menu are in that bar. Seats sit in a strip under it. Each seat shows a name, a turn highlight, the number of cards left, and a Bidder chip. The centre shows "Hand n of 12" and the cards played, each labelled with the player. The bid and the Partner Card stay visible above your cards.
- **Your cards:** a rack docked at the bottom, two rows of six on a phone, sorted by suit and rank. On your turn, cards you can play are highlighted and the others are dimmed, unless every card can be played, in which case none are dimmed. Off your turn, cards are shown evenly. A tap plays a legal card. A tap on a card you cannot play explains why.
- **Bidding:** the current high bid, the player to act, and the buttons **Pass**, **+10** and **+50**. Buttons that would pass 2,520 are off.
- **The call:** the Bidder sees their callable cards (10 to A held once or twice) and picks the Partner Card. Cards held three times are greyed out. Choosing it sets trump and names the partners secretly.
- **Notices:** partner announcements, warnings and errors are toasts. They leave after a few seconds, and up to three are shown. Paused, waiting for the host, and reconnecting stay until they are resolved.
- **No live points:** no running totals. The reveal comes only on the round-end screen.
- **Round-end screen:** partners, team points, bid result, score changes, and the leaderboard. The host has **Next round**.
- **Rules help:** a short in-app rules page and a first-game walkthrough, since the game is not widely known.
- **Sound:** synthesized sounds (Web Audio) for dealing, a card drop, a bid raise, a partner reveal and a trick sweep, with a mute switch.
- **Privacy:** other players' hands are never sent to your browser or drawn in the page.

## Technical architecture on Cloudflare

Each room code is one small server on Cloudflare that holds the match, checks every move and sends each player only what they may see.

&#91;embedded content: architecture · browsers, room server, shared rules\]

Phones send moves and get back a personal view. The browser and the room server run the same rules package, but only the server's decision counts.

### Stack

| Layer | Choice |
| --- | --- |
| Rooms and rules server | Cloudflare Durable Objects (with the PartyServer library) over WebSockets |
| Web app | React, Vite, TypeScript and Tailwind, served from the same Cloudflare deployment |
| Animation and sound | Motion library and the Web Audio API |
| Shared rules | One TypeScript package used by the browser and the server |
| Message checking | A schema check (Zod) on every message |
| Tests | Vitest, fast-check (random legal play) and Playwright (several windows) |
| Install and share | Web app manifest, the phone share sheet, a QR code library and a server-made share image |

### Messages

- **Phone to server:** join, claim seat, set rounds, move seat, start match, bid (amount) or pass, call (card), play (card), next round, pause, resume, end match, release seat.
- **Server to phone:** your view (your own hand plus the public table: seats, bids, trump, current trick, whose turn) and events: bid made, auction won, card called (the suit becomes trump; partners are not named), card played, partner revealed, trick won, round settled, match over, error.

### What the room stores

| Item | Contents | Who can see it |
| --- | --- | --- |
| Match | Code, status (lobby, playing, paused, finished), host, round count, current round, last activity | Everyone in the room |
| Seats | Seat number, name, hashed player secret, optional hashed PIN, connected flag | Names and connected flag to everyone; secrets never leave the server |
| Hands | 12 cards per seat | The owner only |
| Shuffle seed | The seed behind the deal | Server only |
| Partner seats | Who holds the other copies of the called card | Server only; each partner is announced when they play the card, and all are shown on the round-end screen |
| Event log | Every bid, call and card, in order | Public parts to players; used to rebuild any round |
| Round results | Bidder, bid, called card, team points, score changes | Everyone, after the round |

### Identity and rejoining

The first visit creates a random player ID and secret, kept in the browser's local storage so it survives closing the browser. The server stores only a hash. The same browser rejoins its seat automatically. A player on a new device uses their name and the optional 4-digit PIN, or the host releases the seat. There are no accounts or emails, and no personal data beyond a display name.

### Security

- Each connection receives a view built for its own seat. Other hands, the seed and the partner list are never sent.
- Every message is checked against the schema, the sender's seat, whose turn it is and the rules. An invalid message returns an error and changes nothing.
- Creating rooms and sending messages are rate-limited.
- Room codes are random. A code only lets someone into an open lobby; full rooms and started matches refuse new names.

### Saving, timers and cost

- The room's storage is durable, so a match survives the server sleeping, restarts and everyone leaving. Resuming is just opening the link.
- Timers handle lobby expiry, idle pause, deleting old matches after the retention period, and optional turn reminders.
- Idle rooms cost almost nothing. Check Cloudflare's current free and paid limits before launch, since they change.

## Testing and quality

The rules live in one shared package, so they can be tested hard before any screen exists.

- **Rule checks after every simulated round:** the card points always add to 2,520; exactly 12 tricks are played; each player holds 12 cards; deck size matches the player count table.
- **Random-play runs:** thousands of rounds of random legal moves for 5 to 9 players. These check that no round gets stuck, and measure how often a bid at that count's floor is made.
- **Privacy test:** connect as player B and try to obtain player A's hand, the shuffle seed or the partner list before the round ends. It must fail.
- **Multi-window test:** 5 browser windows play a full match through the real server, including a refresh and a rejoin mid-round.
- **Developer-only seat filler:** a switch in test builds that fills empty seats with random legal moves, so one developer can play alone. It is not a player feature and there are no bots in the product.
- **Scoring tests:** every row of the scoring table, including the one-copy and two-copy busts.

## Build plan and future work

Build in this order, one phase per Cursor session, giving Cursor this spec and the rules package at the start of each:

1. **Rules engine and tests.** The shared TypeScript package: decks per player count, dealing, bidding, the call, tricks, scoring. No screens yet.
2. **Room server.** The Cloudflare room server with join and seat claim, saved state, and per-seat views that hide other hands.
3. **Create, share and join.** The home screen, create-room flow, invite panel (share, copy, QR, code), join screen and lobby.
4. **Bidding and the call.** Turn handling, bid buttons, the call screen.
5. **Trick play.** The table, the hand rack, legal-card dimming, the partner banner.
6. **Scoring and matches.** Round-end screen, leaderboard, multi-round matches, pause, resume, end early.
7. **Polish.** Sound, animation, rules help, WhatsApp preview card, install-to-home-screen, performance on low-end phones.

**Future, not in version 1:** bots, accounts and a global leaderboard, custom avatars, in-game chat or voice, and a native app wrapper.

### Proposed values to confirm

These numbers are my suggestions, not decisions. Change any of them before building.

| Setting | Proposed value |
| --- | --- |
| Round presets | 3, 5, 7 and a custom number |
| Host role handover after the host goes offline | 2 minutes |
| Unused lobby expires after | 24 hours |
| Started match kept after the last move | 30 days |
| Seat recovery on a new device | Optional 4-digit PIN, or host releases the seat |
| Last trick stays visible until the next one starts | Yes |
| Bid floor | 1,570 / 1,390 / 1,260 / 1,140 / 1,050 for 5 to 9 players |
