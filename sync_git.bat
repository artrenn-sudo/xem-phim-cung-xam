@echo off
echo Running Git Sync...
git config user.email "artrenn-sudo@users.noreply.github.com"
git config user.name "artrenn-sudo"
git add .
git commit -m "Enhance player: Skip Intro, Auto Next and rename sources"
echo Pushing to GitHub...
git push origin main
echo Done.
