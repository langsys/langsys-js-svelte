# GitHub CLI Setup for Release Automation

## Installation

### macOS (using Homebrew)
```bash
brew install gh
```

### macOS (using MacPorts)
```bash
sudo port install gh
```

### Other platforms
Visit: https://cli.github.com/manual/installation

## Authentication

### Interactive Setup (Recommended)
```bash
gh auth login
```

This will prompt you to:
1. Choose GitHub.com or GitHub Enterprise
2. Choose authentication method (browser or token)
3. If browser: Opens GitHub to authorize the CLI
4. If token: Paste a Personal Access Token

### Using Personal Access Token
1. Generate a token at: https://github.com/settings/tokens/new
2. Select scopes:
   - `repo` (Full control of private repositories)
   - `workflow` (Update GitHub Action workflows)
   - `write:packages` (Upload packages to GitHub Package Registry)

3. Authenticate:
```bash
gh auth login --with-token < token.txt
```

### Check Authentication Status
```bash
gh auth status
```

## How the Publishing Scripts Use GitHub CLI

The scripts use these `gh` commands:

1. **Check authentication**:
   ```bash
   gh auth status
   ```

2. **Create release**:
   ```bash
   gh release create v1.2.3 \
     --title "Release v1.2.3" \
     --notes "Release notes here" \
     --target main
   ```

## Security Notes

- The GitHub CLI stores credentials securely in your system keychain
- No API keys or tokens are stored in your repository
- Authentication persists across terminal sessions
- You can revoke access anytime from GitHub settings

## Alternative: Using Environment Variables

If you prefer not to install GitHub CLI, you can modify the scripts to use the GitHub API directly with a Personal Access Token:

```bash
export GITHUB_TOKEN="your-personal-access-token"
```

Then use curl to create releases:
```bash
curl -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/OWNER/REPO/releases \
  -d '{"tag_name":"v1.2.3","name":"Release v1.2.3","body":"Description"}'
```

However, the GitHub CLI is recommended as it's more secure and easier to use.