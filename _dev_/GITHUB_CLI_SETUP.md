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

## How the Release Script Uses GitHub CLI

The release script (`_dev_/publish.sh`) stops when `gh` is not installed, and offers `gh auth login`
when it is not authenticated. It uses these `gh` commands:

1. **Check authentication**:

    ```bash
    gh auth status
    ```

2. **Create release**, whose body is the version's CHANGELOG section, the install line and the
   compare link (`bash _dev_/publish.sh --notes X.Y.Z` prints it):
    ```bash
    gh release create v1.2.3 \
      --title "v1.2.3" \
      --notes "<release body>"
    ```

## Security Notes

- The GitHub CLI stores credentials securely in your system keychain
- No API keys or tokens are stored in your repository
- Authentication persists across terminal sessions
- You can revoke access anytime from GitHub settings
