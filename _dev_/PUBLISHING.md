# Publishing Guide for langsys-js-svelte

This project includes an automated publishing script to streamline the release process.

## Prerequisites

Before using the publishing scripts, ensure you have:

1. **GitHub CLI (gh)** installed - [Installation guide](https://cli.github.com/)
2. **npm** authentication configured for publishing
3. **Git** configured with push access to the repository
4. You are on the `main` branch with unpushed commits ready to release

## Publishing Script

```bash
npm run release
# or
./publish.sh
```

## What the Script Does

The publishing script automates the entire release process:

1. **Verify Prerequisites**
   - Check GitHub CLI is installed
   - Verify you're on the main branch
   - Ensure there are unpushed commits to release

2. **Version Management**
   - Display current version
   - Prompt for new version (with suggestion)
   - Validate version format
   - Check version doesn't already exist

3. **Build and Test**
   - Update version in package.json
   - Run `npm install` to update package-lock.json
   - Run `npm run build` to verify everything compiles

4. **Git Operations**
   - Commit version bump
   - Push to origin
   - Create and push git tag

5. **Release Creation**
   - Create GitHub release with auto-generated notes
   - Publish package to npm

6. **Error Handling**
   - Comprehensive error checking at each step
   - Automatic rollback option if something fails

## Version Format

Versions must follow semantic versioning:
- Format: `x.y.z` or `x.y.z-tag`
- Examples: `1.2.3`, `2.0.0-beta.1`

## Manual Publishing

If you prefer to publish manually, here are the steps:

```bash
# 1. Ensure you're on main with no uncommitted changes
git checkout main
git status

# 2. Update version in package.json
# Edit package.json and update the version field

# 3. Update package-lock.json
npm install

# 4. Build to verify
npm run build

# 5. Commit version bump
git add package.json package-lock.json
git commit -m "chore: bump version to x.y.z"

# 6. Push to origin
git push origin main

# 7. Create and push tag
git tag -a vx.y.z -m "Release vx.y.z"
git push origin vx.y.z

# 8. Create GitHub release
gh release create vx.y.z --title "vx.y.z" --notes "Release notes here"

# 9. Publish to npm
npm publish
```

## Troubleshooting

### GitHub CLI Not Found
Install the GitHub CLI from https://cli.github.com/

### npm Authentication Issues
Ensure you're logged in to npm:
```bash
npm login
```

### Permission Denied (script not executable)
Make the scripts executable:
```bash
chmod +x publish.js publish.sh
```

### Rollback Failed
If automatic rollback fails, you can manually rollback:
```bash
# Reset local changes
git reset --hard HEAD~1

# Delete local tag
git tag -d vx.y.z

# Delete remote tag (if pushed)
git push origin :refs/tags/vx.y.z
```

## Security Notes

- Never commit sensitive credentials
- Ensure npm tokens are properly secured
- Use GitHub's built-in secrets for CI/CD automation