### Initialize Database in Docker (idempotent) 
 
```bash 
  sudo docker compose up -d 
  # pg_isready -U chat_user -d chat_db → healthy at 1 
 
  DATABASE_URL="postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db" npm run db:migrate 
  # → Reading drizzle.config.ts 
  # → [✓] migrations applied successfully! 
 
  sudo docker exec new_chat_postgres psql -U chat_user -d chat_db -c "\dt" 
  # => chat_sessions | chat_user 
  # => conversations | chat_user 
 
  DATABASE_URL="..." npm run db:seed 
  # → {"operation":"db.seed","inserted":0}   # already seeded (sessions=4, convs=2 after prior E2E fixtures) 
  # second run → inserted:0 (idempotent) 
 
  # cold-start variant tested earlier (down -v → 0 relations → migrate → 2 relations) — proven 
```

### Commands for Next Cycle 
 
```bash 
  # normal dev (idempotent, no data loss) 
  sudo docker compose up -d 
  DATABASE_URL="postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db" npm run db:migrate 
  DATABASE_URL="..." npm run db:seed 
  npm run typecheck && npm run lint && npm test && npm run build 
  # restart background: 
  bg_kill bt-1 2>&1 | head   # or kill <pid> 
  bg_start --title "kimi-3002" --command 'DATABASE_URL="postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db" npx next start -p 3002' 
 
  # schema change: 
  # edit src/db/schema.ts → npm run db:generate → git add drizzle/ → npm run db:migrate 
 
  # cold-start proof (destroys volume): 
  # RESET=true sudo docker compose down -v && sudo docker compose up -d && npm run db:migrate && npm run db:seed 
``` 
 
### DB Init on Fresh Volume — Evidence 
 
```bash 
  sudo docker ps  # new_chat_postgres Up 2m (healthy) 0.0.0.0:5433->5432 
  sudo docker exec new_chat_postgres psql -c "\dt"  # before: 0 relations 
 
  DATABASE_URL="postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db" npm run db:migrate 
  # → Reading drizzle.config.ts 
  # → Using 'pg' driver 
  # → [✓] migrations applied successfully! 
 
  sudo docker exec new_chat_postgres psql -c "\dt" 
  # => chat_sessions | chat_user 
  # => conversations | chat_user 
 
  DATABASE_URL="..." npm run db:seed  # → {"operation":"db.seed","inserted":1} (Welcome to Kimi — seeded demo) 
  DATABASE_URL="..." npm run db:seed  # → {"operation":"db.seed","inserted":0} (idempotent) 
  DATABASE_URL="" npm run db:migrate  # → DATABASE_URL is required (fail-fast, not hang) 
``` 
 

### Gates & Restart 
 
```bash 
  npm run typecheck  # ✓ Types generated 
  npm run lint       # 0 problems 
  npm test           # 5/5 
  npm run build      # ✓ 6 routes (/, /_not-found, ƒ /api/chat, ƒ /api/conversations, ƒ /api/conversations/[id], ƒ /api/health) 
 
  # restart (preserve scandihaven 3000/3001, free only kimi 3002) 
  kill 3028466; ss -tlnp | grep 3002 → free 
  bg_start --title "kimi-3002" --command 'DATABASE_URL="postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db" npx next start -p 3002' 
  # → bt-1 [running] pid 3059382 · ✓ Ready in 188ms 
 
  curl -s http://localhost:3002/api/health               # {"ok":true} (1st poll) 
  curl -s -i http://localhost:3002/api/conversations 
  # → 200 · nosniff · DENY · Strict-Transport-Security: 63072000; includeSubDomains 
  # → CSP: frame-ancestors 'none'; base-uri 'self'; object-src 'none' 
  # → Set-Cookie: kimi_session=… HttpOnly; SameSite=strict 
  # → {"conversations":[],"configured":true} 
  curl -s http://localhost:3002/ | grep "Kimi — A little more possible"  # 200 
```  

### Next Run 
 
```bash 
  # normal (idempotent, no -v) 
  sudo docker compose up -d 
  # wait pg_isready -U chat_user -d chat_db → accepting 
  npm run db:migrate  # bare works via .env 
  npm run db:seed 
  npm run typecheck && npm run lint && npm test && npm run build 
  # restart background 
  bg_kill bt-1; bg_start --title "kimi-3002" --command 'DATABASE_URL="postgresql://chat_user:chat_secret@127.0.0.1:5433/chat_db" npx next start -p 3002' 
``` 

