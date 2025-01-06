cd code
git config --global --add safe.directory /usr/src/app/code
git -c core.fileMode=false pull
docker compose up -d --no-deps --force-recreate --build app