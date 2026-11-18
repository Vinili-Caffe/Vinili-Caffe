#!/usr/bin/env bash
set -eu

echo "=== env keys ==="
grep -E '^(MONGO|DB_|MONGODB)' /opt/bot/.env | sed 's/=.*/=***/' || true

echo "=== ecosystem head ==="
sed -n '1,120p' /opt/bot/bots-ts/ecosystem.config.cjs

echo "=== pm2 vinyls env keys ==="
pm2 jlist | node <<'NODE'
let d="";
process.stdin.on("data",c=>d+=c);
process.stdin.on("end",()=>{
  const a=JSON.parse(d);
  const v=a.find(x=>x.name==="bots-vinyls");
  const e=v?.pm2_env||{};
  const keys=Object.keys(e).filter(k=>/mongo|db_|lavalink|MUSIC/i.test(k));
  console.log(JSON.stringify({cwd:e.pm_cwd, keys}, null, 2));
  for (const k of keys) {
    const val=String(e[k]??"");
    const redacted=val.replace(/:\/\/[^@]+@/, "://***@");
    console.log(k+"="+redacted.slice(0,120));
  }
});
NODE

echo "=== recent vinyls logs ==="
pm2 logs bots-vinyls --lines 80 --nostream 2>/dev/null | grep -iE 'alwaysOn|lavalink|wake|MUSIC|join|voice|error|warn' | tail -60 || true
