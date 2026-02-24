# Move all items from the subdirectory to the current directory
Get-ChildItem -Path "Conge-Management-codex-dokploy-ready" | Move-Item -Destination . -Force

# Remove the now empty directory
Remove-Item -Path "Conge-Management-codex-dokploy-ready" -Force -Recurse

# Check status
git status
