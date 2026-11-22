#!/bin/bash
set -euo pipefail
ssh vinili-ca "cd /opt/bot/bots-ts && node -e \"
const d=require('./src/Vinili/site/http/siteMusicQuizDeezer.js');
(async()=>{
  const arts=await d.chartArtists(3);
  console.log('artists', arts.map(a=>a.id+':'+a.name).join(', '));
  const a=arts[0];
  const tracks=await d.artistTopTracks(a.id, 20);
  console.log('tracks', tracks.length, 'preview', tracks.filter(t=>t.previewUrl).length);
})().catch(e=>{console.error(e); process.exit(1);});
\""
