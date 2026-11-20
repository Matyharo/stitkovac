#!/usr/bin/env bash
# Deploy a separate release, preserving the existing checkout and database path.
set -Eeuo pipefail
umask 077
source_root="${1:-/home/maty/stitkovac}"
release_ref="${2:-fix/technical-audit}"
service=stitkovac
release_root="${source_root}-releases/$(date +%Y%m%d-%H%M%S)"
dropin=/etc/systemd/system/stitkovac.service.d/99-audit-release.conf
rollback_needed=0
backup_ready=0
was_active=0
had_dropin=0
for command in git node npm curl sudo; do command -v "$command" >/dev/null || { echo "Chybi prikaz: $command" >&2; exit 1; }; done
[[ -f "$source_root/.env" ]] || { echo 'Chybi puvodni .env.' >&2; exit 1; }
[[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -ge 22 ]] || { echo 'Je potreba Node.js 22+.' >&2; exit 1; }
sudo -v
systemctl cat "$service" >/dev/null
if systemctl is-active --quiet "$service"; then was_active=1; fi
mkdir -p "$(dirname "$release_root")"
git clone --branch "$release_ref" --single-branch https://github.com/Matyharo/stitkovac.git "$release_root"
cp "$source_root/.env" "$release_root/.env"
chmod 600 "$release_root/.env"
cd "$release_root"
# Resolve the configured production DB without printing any other environment values.
database_path="$(env -u DATABASE_URL node --env-file=.env -e 'const p=require("node:path");const u=process.env.DATABASE_URL||"";if(!u.startsWith("file:")||!p.isAbsolute(u.slice(5)))throw Error("DATABASE_URL musi byt absolutni SQLite cesta.");process.stdout.write(u.slice(5));')"
[[ -s "$database_path" ]] || { echo 'Produkční databaze nebyla nalezena; nasazeni zastaveno.' >&2; exit 1; }
# Release configuration keeps the same persistent DB, with private backups outside the code.
export DATABASE_URL="file:$database_path"
export NODE_ENV=production
backup_root="${source_root}-backups"
mkdir -p "$backup_root"
export BACKUP_DIRECTORY="$backup_root"
npm ci --include=dev
npx prisma generate
env -u SESSION_SECRET -u SESSION_COOKIE_NAME node --env-file=.env --import tsx -e 'const session=require("./src/lib/session.ts"); session.createSession("deployment-check"); session.sessionCookieName();'
npm run build
backup_path="$backup_root/before-release-$(date +%Y%m%d-%H%M%S).db"
if sudo test -f "$dropin"; then sudo cp "$dropin" "$release_root/previous-release.conf"; sudo chown "$(id -u):$(id -g)" "$release_root/previous-release.conf"; had_dropin=1; fi
rollback() {
  local result=$?
  trap - EXIT
  if [[ "$rollback_needed" -eq 1 ]]; then
    echo 'Nasazeni selhalo. Obnovuji puvodni databazi a sluzbu.' >&2
    sudo systemctl stop "$service" || true
    if [[ "$backup_ready" -eq 1 ]]; then
      local quarantine="$backup_root/failed-release-$(date +%s)"
      mkdir -p "$quarantine"
      for suffix in '' -wal -shm; do if [[ -e "${database_path}${suffix}" ]]; then mv "${database_path}${suffix}" "$quarantine/"; fi; done
      cp "$backup_path" "$database_path"
      chmod 600 "$database_path"
    fi
    if [[ "$had_dropin" -eq 1 ]]; then sudo install -m 644 "$release_root/previous-release.conf" "$dropin"; else sudo rm -f "$dropin"; fi
    sudo systemctl daemon-reload
    if [[ "$was_active" -eq 1 ]]; then sudo systemctl start "$service"; fi
  fi
  exit "$result"
}
trap rollback EXIT
sudo systemctl stop "$service"
rollback_needed=1
node --import tsx scripts/createPreviewDatabase.ts "$database_path" "$backup_path"
backup_ready=1
# Migration script also creates its own recovery snapshot before schema changes.
npm run db:deploy
cat > "$release_root/service-release.conf" <<CONFIG
[Service]
WorkingDirectory=$release_root
Environment=NODE_ENV=production
Environment=DATABASE_URL=file:$database_path
Environment=BACKUP_DIRECTORY=$backup_root
EnvironmentFile=
EnvironmentFile=$release_root/.env
ExecStart=
ExecStart=/usr/bin/node $release_root/node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3000
CONFIG
sudo mkdir -p "$(dirname "$dropin")"
sudo install -m 644 "$release_root/service-release.conf" "$dropin"
sudo systemctl daemon-reload
sudo systemctl restart "$service"
healthy=0
for attempt in {1..30}; do
  if systemctl is-active --quiet "$service" && curl --silent --fail http://127.0.0.1:3000/api/health >/dev/null; then healthy=1; break; fi
  sleep 1
done
[[ "$healthy" -eq 1 ]] || { sudo journalctl -u "$service" -n 30 --no-pager; exit 1; }
rollback_needed=0
trap - EXIT
printf 'Nasazeni dokonceno. Verze: %s\n' "$(git rev-parse --short HEAD)"
printf 'Zaloha pred nasazenim: %s\n' "$backup_path"
printf 'Pracovni adresar nove verze: %s\n' "$release_root"
printf 'Aplikace: http://192.168.10.243:3000 nebo http://100.105.188.11:3000\n'
