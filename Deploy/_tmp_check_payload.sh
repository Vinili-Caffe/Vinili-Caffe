#!/bin/bash
sed -n '200,280p' /opt/bot/node_modules/discord.js/src/structures/MessagePayload.js
echo "===="
# Reproduce send body
node <<'NODE'
const { Client, GatewayIntentBits } = require('/opt/bot/node_modules/discord.js');
const fs = require('fs');
function env(k) {
  const line = fs.readFileSync('/opt/bot/.env','utf8').split(/\r?\n/).find(l => l.startsWith(k+'='));
  if (!line) return '';
  let v = line.slice(k.length+1);
  if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
  return v;
}
const titles = [
  'Perfetti Sconosciuti','Chiamami col tuo nome','Unfriended','Birds of prey','Bullet train',
  'Edward mani di forbici','Nuovo Olimpo','Resident evil','Red, White & Royal Blu','practical magic 1998'
];
(async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(env('DISCORD_TOKEN_OFFICIAL') || env('DISCORD_TOKEN'));
  await new Promise(r => client.once('ready', r));
  const ch = await client.channels.fetch('1481660281032675510');
  // Dry-run: build MessagePayload
  const { MessagePayload } = require('/opt/bot/node_modules/discord.js');
  const payload = new MessagePayload(ch, {
    content: 'test poll dry',
    poll: {
      question: { text: 'Quale film guardiamo?' },
      answers: titles.map(t => ({ text: t.slice(0, 55) })),
      duration: 1,
      allowMultiselect: false,
    },
  });
  const resolved = await payload.resolveBody().resolveFiles();
  console.log('BODY KEYS', Object.keys(resolved.body||{}));
  console.log('HAS POLL', Boolean(resolved.body?.poll));
  console.log('POLL', JSON.stringify(resolved.body?.poll, null, 2).slice(0, 800));
  // Try actual send to a test channel if available - skip, just test API with fetch to create then delete in announcements? Too noisy.
  // Instead POST and see error without committing? Can't dry-run Discord API.
  client.destroy();
})().catch(e => { console.error('ERR', e); process.exit(1); });
NODE
